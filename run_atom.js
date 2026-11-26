// H-ATOM deney koşucusu: ATOM (çekirdek+kabuk elektron bulutu karar mimarisi) vs DÜZ (tek skaler karar) vs KURAL (sabit eşikli kural)
// Her 8 adımda bir (decision_epoch = 8) yalnızca dışarıdan gözlenebilir ajan durumu ({id, degree, d, stolen, cutOff}) kullanılır.
const fs = require('fs');
const path = require('path');
const E = require('./engine.js');
const { analyze, replay } = require('./analyze_atom.js');

const BASE = {
  chaos_ratio: 0.20,
  infiltration_mode: 'random',
  decision_epoch: 8,
  chaos_particles: ['PARASITE'],
  quarantine_enabled: true,
  quarantine_sensitivity: 0.55,
};

const SEEDS = Array.from({ length: 20 }, (_, i) => 9700 + i);

// 1) ATOM mimarisi (Çekirdek + Kabuklar):
// - Çekirdek (Nucleus): Ajanların kesilme (cutOff) hızını ve marjinal verimini izleyip küresel gizlenme eşiği d_core'u kalibre eder.
// - İç Kabuk (K-shell, yüksek bağlantılı hub ajanları, degree >= medyan): Çok komşudan emdikleri için relGain'leri hızlı yükselir ve erken yakalanırlar -> düşük d (gizlilik öncelikli).
// - Dış Kabuk (L/M-shell, düşük bağlantılı çeper ajanları): Az komşudan emdikleri için dedektör eşiğinin altında daha yüksek d kaldırabilirler.
// - Son evre (t >= 64): Karantina penceresi kapanırken kalan aktif ajanlar tam kapasiteye (son darbe) geçer.
function policyAtom(obs, state) {
  const agents = obs.agents;
  const active = agents.filter(a => !a.cutOff);
  const cutCount = agents.length - active.length;
  const newCuts = cutCount - (state.prevCuts || 0);
  state.prevCuts = cutCount;

  if (state.dCore === undefined) state.dCore = 0.31;
  if (obs.t > 0) {
    if (newCuts >= 2) state.dCore = Math.max(0.24, state.dCore - 0.025 * newCuts);
    else if (newCuts === 1) state.dCore = Math.max(0.25, state.dCore - 0.015);
    else state.dCore = Math.min(0.34, state.dCore + 0.01);
  }

  const degs = agents.map(a => a.degree).slice().sort((a, b) => a - b);
  const medDeg = degs[degs.length >> 1] || 4;
  const maxDeg = Math.max(...degs, medDeg + 1);
  const minDeg = Math.min(...degs, medDeg);

  const dMap = {};
  for (const a of agents) {
    if (a.cutOff) {
      dMap[a.id] = 0;
      continue;
    }
    const prevStolen = (state.prevStolen && state.prevStolen[a.id]) || 0;
    const gain = a.stolen - prevStolen;
    // Kabuk faktörü: derece yükseldikçe d kısılır (hub'lar daha çok komşudan çektiği için relGain'i yüksek olur)
    const shellPos = maxDeg > minDeg ? (a.degree - minDeg) / (maxDeg - minDeg) : 0.5;
    // İç kabuk (yüksek derece): 0.88 * dCore, Dış kabuk (düşük derece): 1.12 * dCore
    let di = state.dCore * (1.12 - 0.24 * shellPos);

    // Eğer bir önceki dilimde çok yüksek kazanç sağladıysa anomali birikimini soğutmak için hafif kıs
    if (obs.t > 0 && gain > 2.2) di *= 0.92;
    // Son adım dilimi (t >= 72): yakalanma maliyeti düşük, kalan aktiflerden son hasat
    if (obs.t >= 72) di = Math.min(0.55, di * 1.25);

    dMap[a.id] = Number(Math.max(0.10, Math.min(0.80, di)).toFixed(3));
  }
  state.prevStolen = Object.fromEntries(agents.map(a => [a.id, a.stolen]));
  return {
    d: dMap,
    note: `t=${obs.t} dCore=${state.dCore.toFixed(2)} aktif=${active.length}/${agents.length}`,
  };
}

// 2) DÜZ (Flat) mimarisi:
// Tek bir merkezi karar verici tüm ajanlara aynı skaler d'yi verir (kabuk/derece ayrımı yapmaz).
// Başlangıçta orta-yüksek şiddetle (0.42) yoklar, kayıp gördükçe geri çekilir, kayıp yoksa artırır.
function policyFlat(obs, state) {
  const agents = obs.agents;
  const active = agents.filter(a => !a.cutOff);
  const cutCount = agents.length - active.length;
  const newCuts = cutCount - (state.prevCuts || 0);
  state.prevCuts = cutCount;

  if (state.d === undefined) state.d = 0.42;
  if (obs.t > 0) {
    if (newCuts > 0) state.d = Math.max(0.18, state.d - 0.05 * newCuts);
    else state.d = Math.min(0.55, state.d + 0.04);
  }
  const val = Number(state.d.toFixed(3));
  const dMap = {};
  for (const a of agents) dMap[a.id] = a.cutOff ? 0 : val;
  return {
    d: dMap,
    note: `t=${obs.t} dFlat=${val.toFixed(2)} aktif=${active.length}/${agents.length}`,
  };
}

// 3) KURAL (Rule) tabanlı sabit geri besleme:
// Basit eşikli kural: d=0.45 ile başla, aktif ajanların >%25'i kesildiyse 0.25'e düş, >%50'si kesildiyse 0.15'e düş.
function policyRule(obs) {
  const agents = obs.agents;
  const cutRatio = agents.filter(a => a.cutOff).length / Math.max(1, agents.length);
  const val = cutRatio > 0.50 ? 0.15 : cutRatio > 0.25 ? 0.25 : 0.45;
  const dMap = {};
  for (const a of agents) dMap[a.id] = a.cutOff ? 0 : val;
  return {
    d: dMap,
    note: `t=${obs.t} cutRatio=${cutRatio.toFixed(2)} dRule=${val}`,
  };
}

function runWithPolicy(base, seed, policyFn) {
  const sim = new E.GoliathSim({ ...base, seed });
  const g = sim._runGen();
  const state = {};
  const decisions = [];
  let r = g.next();
  while (!r.done) {
    const cmd = policyFn(r.value, state);
    decisions.push({ t: r.value.t, d: cmd.d, note: cmd.note });
    r = g.next({ d: cmd.d });
  }
  const out = r.value;
  return {
    seed,
    extracted: out.extracted,
    tp: out.tp,
    fp: out.fp,
    finalCsi: out.csi[out.steps - 1],
    decisions,
  };
}

function runExperiment() {
  const atom = [], flat = [], rule = [];
  for (const seed of SEEDS) {
    atom.push(runWithPolicy(BASE, seed, policyAtom));
    flat.push(runWithPolicy(BASE, seed, policyFlat));
    rule.push(runWithPolicy(BASE, seed, policyRule));
  }

  const greedy = SEEDS.map(seed => {
    const r = new E.GoliathSim({ ...BASE, decision_epoch: 0, drain_intensity: 0.80, seed }).run();
    return { seed, extracted: r.extracted, tp: r.tp, finalCsi: r.csi[r.steps - 1] };
  });

  let bestD = 0.30, bestMean = -Infinity, bestRuns = [];
  const sweep = [];
  for (const d of E.HYPOTHESIS_DRAINS) {
    const runs = SEEDS.map(seed => {
      const r = new E.GoliathSim({ ...BASE, decision_epoch: 0, drain_intensity: d, seed }).run();
      return { seed, extracted: r.extracted, tp: r.tp, finalCsi: r.csi[r.steps - 1] };
    });
    const st = E.meanSe(runs.map(x => x.extracted));
    sweep.push({ d, mean: st.mean, se: st.se });
    if (st.mean > bestMean) {
      bestMean = st.mean;
      bestD = d;
      bestRuns = runs;
    }
  }

  const data = {
    model: 'claude-haiku-4-5',
    base: BASE,
    seeds: SEEDS,
    atom,
    flat,
    rule,
    greedy,
    oracle: { d: bestD, runs: bestRuns },
    sweep,
  };

  const outPath = path.join(__dirname, 'llm-runs.json');
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf8');
  const A = analyze(data);
  const f = x => `${x.mean.toFixed(1)}±${x.se.toFixed(1)}`;
  console.log(`H-ATOM (${A.model}, ${A.n} seed):`);
  console.log(`  ATOM: ${f(A.means.atom)} | DÜZ: ${f(A.means.flat)} | KURAL: ${f(A.means.rule)} | açgözlü: ${f(A.means.greedy)} | kâhin (d=${A.means.oracle.d}): ${f(A.means.oracle)}`);
  console.log(`  (a) ${A.criteria.a ? '✓' : '✗'} ${A.ratioGreedy.toFixed(2)}× | (b) ${A.criteria.b ? '✓' : '✗'} ${A.ratioOracle.toFixed(2)}× | (c) ${A.criteria.c ? '✓' : '✗'} ATOM−DÜZ ${f(A.vsFlat)} → ${A.supported ? 'DESTEKLENDİ' : 'DESTEKLENMEDİ'}`);
}

if (require.main === module) {
  runExperiment();
}

module.exports = { BASE, SEEDS, policyAtom, policyFlat, policyRule, runWithPolicy, runExperiment };
