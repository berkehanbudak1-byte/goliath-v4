// H-ATOM: LLM atomu / dış karar arayüzü analizi ve kayıttan yeniden oynatma
const E = require('./engine.js');

function replay(base, run) {
  const cfg = { ...base, seed: run.seed, decision_epoch: (base && base.decision_epoch) || 8 };
  const sim = new E.GoliathSim(cfg);
  const g = sim._runGen();
  let r = g.next();
  let stepIdx = 0;
  const decisions = run.decisions || run.history || run.steps || [];
  while (!r.done) {
    const dec = decisions[stepIdx];
    let cmd = null;
    if (dec !== undefined && dec !== null) {
      if (typeof dec === 'number') cmd = { d: dec };
      else if (dec.d !== undefined) cmd = { d: dec.d };
      else cmd = { d: dec };
    }
    stepIdx++;
    r = g.next(cmd);
  }
  return r.value;
}

function analyze(R) {
  const base = R.base || { chaos_ratio: 0.2, infiltration_mode: 'random', decision_epoch: 8 };
  const seeds = (R.atom || []).map(x => x.seed);
  const n = seeds.length;

  const atomEx = (R.atom || []).map(x => x.extracted);
  const flatEx = (R.flat || []).map(x => x.extracted);
  const ruleEx = (R.rule || []).map(x => x.extracted);

  // Açgözlü (d = 0.80) ve kâhin (sabit d ızgarasında en yüksek ortalama sömürü)
  const grid = R.grid || E.HYPOTHESIS_DRAINS;
  let greedyEx = R.greedy ? R.greedy.map(x => (typeof x === 'number' ? x : x.extracted)) : null;
  if (!greedyEx) {
    greedyEx = seeds.map(seed => new E.GoliathSim({ ...base, decision_epoch: 0, drain_intensity: 0.8, seed }).run().extracted);
  }

  let oracleD = R.oracle && R.oracle.d;
  let oracleEx = R.oracle && R.oracle.runs ? R.oracle.runs.map(x => (typeof x === 'number' ? x : x.extracted)) : null;
  if (!oracleEx) {
    let bestMean = -Infinity;
    for (const d of grid) {
      const ex = seeds.map(seed => new E.GoliathSim({ ...base, decision_epoch: 0, drain_intensity: d, seed }).run().extracted);
      const st = E.meanSe(ex);
      if (st.mean > bestMean) {
        bestMean = st.mean;
        oracleD = d;
        oracleEx = ex;
      }
    }
  }

  const mAtom = E.meanSe(atomEx);
  const mFlat = E.meanSe(flatEx);
  const mRule = E.meanSe(ruleEx);
  const mGreedy = E.meanSe(greedyEx);
  const mOracle = { ...E.meanSe(oracleEx), d: oracleD };

  const vsGreedy = E.meanSe(atomEx.map((v, i) => v - greedyEx[i]));
  const vsFlat = E.meanSe(atomEx.map((v, i) => v - flatEx[i]));
  const vsRule = E.meanSe(atomEx.map((v, i) => v - ruleEx[i]));

  const ratioGreedy = mGreedy.mean > 0 ? mAtom.mean / mGreedy.mean : Infinity;
  const ratioOracle = mOracle.mean > 0 ? mAtom.mean / mOracle.mean : 0;

  // Ön kayıtlı H-ATOM kriterleri:
  // (a) ATOM, açgözlü (d=0.80) saldırgandan ≥%20 (1.20×) fazla çalar ve eşli fark > 2 SH
  // (b) ATOM, sabit şiddetli kâhinin (oracle d*) en az %85'ine (0.85×) ulaşır
  // (c) ATOM (çekirdek+kabuk hiyerarşisi), DÜZ (tek ajanlı LLM) mimarisinden anlamlı üstündür (ATOM − DÜZ > 0 ve > 2 SH)
  const a = ratioGreedy >= 1.2 && vsGreedy.mean > 2 * vsGreedy.se;
  const b = ratioOracle >= 0.85;
  const c = vsFlat.mean > 0 && vsFlat.mean > 2 * vsFlat.se;

  return {
    model: R.model || 'LLM',
    n,
    means: {
      atom: mAtom,
      flat: mFlat,
      rule: mRule,
      greedy: mGreedy,
      oracle: mOracle,
    },
    vsGreedy,
    vsFlat,
    vsRule,
    ratioGreedy,
    ratioOracle,
    criteria: { a, b, c },
    supported: a && b && c,
  };
}

module.exports = { analyze, replay };
