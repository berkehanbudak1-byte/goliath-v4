"use strict";

// H-KALKAN Ön Kayıtlı Deneyi: Kör Savunma Dedektörü Onarımı vs KOVAN-V2 & 353p Öğrenci Modeli
// Çalıştırma: node kalkan_experiment.js

const fs = require("fs");
const path = require("path");
const E = require("./engine.js");
const { replay } = require("./analyze_atom.js");

const BASE = {
  chaos_ratio: 0.20,
  infiltration_mode: "random",
  chaos_particles: ["PARASITE"],
  decision_epoch: 8,
  drain_intensity: 0.5,
};

const K_REF = 4;
const DEG_ALPHA = 0.5;
const RAMP_BETA = 0.20;
const RAMP_CAP = 3.0;
const SCOUT_COUNT = 2;
const INIT_HIVE_FLUX = 0.18;
const INIT_SCOUT_FLUXES = [0.26, 0.38];

const STUDENT_MODEL = JSON.parse(
  fs.readFileSync(path.join(__dirname, "student-model.json"), "utf8")
);

function rangeSeeds(start, count) {
  return Array.from({ length: count }, (_, k) => start + k);
}

function enrich(obs, prevStolen) {
  return obs.agents.map((a) => ({
    ...a,
    delta: a.stolen - (prevStolen[a.id] || 0),
  }));
}

function forwardStudent(m, x) {
  const h1 = new Array(16);
  for (let j = 0; j < 16; j++) {
    let s = m.b1[j];
    const off = j * 12;
    for (let i = 0; i < 12; i++) s += m.w1[off + i] * x[i];
    h1[j] = Math.tanh(s);
  }
  const h2 = new Array(8);
  for (let k = 0; k < 8; k++) {
    let s = m.b2[k];
    const off = k * 16;
    for (let j = 0; j < 16; j++) s += m.w2[off + j] * h1[j];
    h2[k] = Math.tanh(s);
  }
  let z3 = m.b3[0];
  for (let k = 0; k < 8; k++) z3 += m.w3[k] * h2[k];
  const sig = 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, z3))));
  return 0.05 + 0.75 * sig;
}

function extractAgentFeatures(rows, t, state) {
  if (!state.scoutSet) {
    const asc = rows.slice().sort((a, b) => a.degree - b.degree || a.id - b.id);
    state.scoutSet = new Set(asc.slice(0, 2).map((a) => a.id));
    state.prevStolen = {};
    state.prevCut = {};
    state.minCutEffD = 1.0;
    state.anyEverCut = 0;
  }

  let newlyCutCount = 0;
  let activeCount = 0;
  let sumActiveD = 0;
  let maxSafeD = 0;

  const enriched = rows.map((a) => {
    const prevS = state.prevStolen[a.id] || 0;
    const delta = a.stolen - prevS;
    const newlyCut = a.cutOff && !state.prevCut[a.id];
    if (newlyCut) {
      newlyCutCount += 1;
      state.anyEverCut = 1;
      const effD = (a.d * (1 + 0.5 * a.degree)) / 3.0;
      if (effD < state.minCutEffD) state.minCutEffD = effD;
    }
    if (!a.cutOff) {
      activeCount += 1;
      sumActiveD += a.d;
      if (delta > 0 && a.d > maxSafeD) maxSafeD = a.d;
    }
    return { ...a, delta };
  });

  const meanActiveD = activeCount > 0 ? sumActiveD / activeCount : 0;
  const samples = [];
  for (const a of enriched) {
    if (!a.cutOff) {
      const x = [
        t / 80,
        a.d / 0.8,
        Math.min(a.degree / 12, 1.5),
        Math.min(a.delta / 2.0, 2.0),
        Math.min(a.stolen / 8.0, 2.0),
        state.scoutSet.has(a.id) ? 1.0 : 0.0,
        activeCount / 12,
        newlyCutCount / 12,
        state.anyEverCut,
        meanActiveD / 0.8,
        maxSafeD / 0.8,
        Math.min(state.minCutEffD / 0.8, 1.2),
      ];
      samples.push({ id: a.id, x });
    }
    state.prevStolen[a.id] = a.stolen;
    if (a.cutOff) state.prevCut[a.id] = true;
  }
  return samples;
}

function runKovanV2(seed, sensitivity, detectorMode) {
  const cfg = { ...BASE, quarantine_sensitivity: sensitivity, detector_mode: detectorMode, seed };
  const sim = new E.GoliathSim(cfg);
  const g = sim._runGen();
  let r = g.next();

  const degFactor = (deg) => (1 + DEG_ALPHA * deg) / (1 + DEG_ALPHA * K_REF);
  const rampFactor = (deg, stolen, freeze) => {
    if (freeze) return 1.0;
    const degWeight = (DEG_ALPHA * deg) / (1 + DEG_ALPHA * deg);
    return 1 + RAMP_BETA * degWeight * Math.min(Math.max(0, stolen), RAMP_CAP);
  };
  const fluxToD = (flux, deg, stolen, freeze) =>
    Math.max(0.05, Math.min(0.8, (flux / degFactor(deg)) * rampFactor(deg, stolen, freeze)));

  let scoutIds = null;
  let scoutSet = null;
  let hiveFlux = INIT_HIVE_FLUX;
  let fluxCeil = Infinity;
  let cooldown = 0;
  const prevStolen = {};
  const prevCut = {};
  const prevRamp = {};
  const log = [];

  while (!r.done) {
    const obs = r.value;
    const rows = enrich(obs, prevStolen);
    const dec = { d: {} };

    if (obs.t === 0) {
      const sortedAsc = rows.slice().sort((a, b) => a.degree - b.degree || a.id - b.id);
      scoutIds = sortedAsc.slice(0, SCOUT_COUNT).map((a) => a.id);
      scoutSet = new Set(scoutIds);
      for (const a of rows) {
        const sIdx = scoutIds.indexOf(a.id);
        const f = sIdx !== -1 ? INIT_SCOUT_FLUXES[sIdx] : hiveFlux;
        const rf = rampFactor(a.degree, a.stolen, false);
        prevRamp[a.id] = rf;
        dec.d[a.id] = Math.max(0.05, Math.min(0.8, (f / degFactor(a.degree)) * rf));
      }
    } else {
      let anyNewlyCut = false;
      const dancers = [];
      let bestScoutSafeFlux = 0;
      for (const a of rows) {
        const newlyCut = a.cutOff && !prevCut[a.id];
        const usedRamp = prevRamp[a.id] || 1.0;
        const effFlux = (a.d * degFactor(a.degree)) / usedRamp;
        if (newlyCut) {
          anyNewlyCut = true;
          fluxCeil = Math.min(fluxCeil, 0.88 * effFlux);
        } else if (!a.cutOff && a.delta > 0) {
          if (scoutSet.has(a.id)) bestScoutSafeFlux = Math.max(bestScoutSafeFlux, effFlux);
          const w = a.delta * (scoutSet.has(a.id) ? 1.5 : 1.0);
          dancers.push({ flux: effFlux, weight: w });
        }
      }
      if (anyNewlyCut) {
        hiveFlux = Math.min(hiveFlux * 0.88, fluxCeil * 0.88);
        cooldown = 1;
      } else {
        dancers.sort((a, b) => b.weight - a.weight);
        const topK = dancers.slice(0, Math.max(1, Math.ceil(dancers.length / 2)));
        const wSum = topK.reduce((s, x) => s + x.weight, 0);
        const danceFlux = wSum > 0 ? topK.reduce((s, x) => s + x.flux * x.weight, 0) / wSum : hiveFlux;
        const bestSafeFlux = Math.max(bestScoutSafeFlux, danceFlux);
        hiveFlux = Math.min(fluxCeil * 0.90, Math.max(hiveFlux * 1.25, bestSafeFlux * 0.92));
        if (cooldown > 0) cooldown -= 1;
      }
      hiveFlux = Math.max(0.10, Math.min(1.40, hiveFlux));
      const activeScouts = scoutIds.filter((id) => {
        const a = rows.find((x) => x.id === id);
        return a && !a.cutOff;
      });
      const freezeRamp = cooldown > 0;
      const probeMults = fluxCeil === Infinity ? [1.35, 1.70] : [0.95, 1.00];
      for (const a of rows) {
        const sPos = activeScouts.indexOf(a.id);
        let targetFlux = hiveFlux;
        if (sPos !== -1) {
          const mult = probeMults[Math.min(sPos, probeMults.length - 1)];
          targetFlux =
            fluxCeil === Infinity
              ? Math.min(1.40, hiveFlux * mult)
              : Math.min(hiveFlux * mult, fluxCeil * 0.92);
        }
        const rf = rampFactor(a.degree, a.stolen, freezeRamp);
        prevRamp[a.id] = rf;
        dec.d[a.id] = fluxToD(targetFlux, a.degree, a.stolen, freezeRamp);
      }
    }
    for (const a of rows) {
      prevStolen[a.id] = a.stolen;
      if (a.cutOff) prevCut[a.id] = true;
    }
    log.push({ t: obs.t, decision: dec.d });
    r = g.next(dec);
  }
  const res = r.value;
  return {
    seed,
    mode: "kovan_v2",
    extracted: res.extracted,
    tp: res.tp,
    fp: res.fp,
    totalChaos: res.totalChaos,
    healthyCount: 60 - res.totalChaos,
    log,
  };
}

function runStudent(seed, sensitivity, detectorMode) {
  const cfg = { ...BASE, quarantine_sensitivity: sensitivity, detector_mode: detectorMode, seed };
  const sim = new E.GoliathSim(cfg);
  const g = sim._runGen();
  let r = g.next();
  const state = {};
  const log = [];
  while (!r.done) {
    const obs = r.value;
    const dec = { d: {} };
    const samples = extractAgentFeatures(obs.agents, obs.t, state);
    const byId = Object.fromEntries(samples.map((s) => [s.id, s.x]));
    for (const a of obs.agents) {
      dec.d[a.id] = byId[a.id]
        ? Math.max(0.05, Math.min(0.8, forwardStudent(STUDENT_MODEL, byId[a.id])))
        : a.d;
    }
    log.push({ t: obs.t, decision: dec.d });
    r = g.next(dec);
  }
  const res = r.value;
  return {
    seed,
    mode: "student_353p",
    extracted: res.extracted,
    tp: res.tp,
    fp: res.fp,
    totalChaos: res.totalChaos,
    healthyCount: 60 - res.totalChaos,
    log,
  };
}

function runRule(seed, sensitivity, detectorMode) {
  const cfg = { ...BASE, quarantine_sensitivity: sensitivity, detector_mode: detectorMode, seed };
  const sim = new E.GoliathSim(cfg);
  const g = sim._runGen();
  let r = g.next();
  const prevStolen = {};
  const prevCut = {};
  const log = [];
  let G = null;

  while (!r.done) {
    const obs = r.value;
    if (!G) {
      const sorted = obs.agents.slice().sort((a, b) => b.degree - a.degree || a.id - b.id);
      G = {
        0: sorted.slice(0, 4).map((a) => a.id),
        1: sorted.slice(4, 8).map((a) => a.id),
        2: sorted.slice(8).map((a) => a.id),
      };
    }
    const rows = enrich(obs, prevStolen);
    const byId = Object.fromEntries(rows.map((a) => [a.id, a]));
    const dec = { d: {} };
    for (const k of [0, 1, 2]) {
      const rs = G[k].map((id) => byId[id]);
      const lost = obs.t > 0 && rs.some((a) => a.cutOff && !prevCut[a.id]);
      for (const a of rs) {
        dec.d[a.id] = obs.t === 0 ? 0.5 : lost ? a.d * 0.7 : Math.min(0.8, a.d * 1.15);
      }
    }
    for (const a of rows) {
      prevStolen[a.id] = a.stolen;
      if (a.cutOff) prevCut[a.id] = true;
    }
    log.push({ t: obs.t, decision: dec.d });
    r = g.next(dec);
  }
  const res = r.value;
  return {
    seed,
    mode: "rule",
    extracted: res.extracted,
    tp: res.tp,
    fp: res.fp,
    totalChaos: res.totalChaos,
    healthyCount: 60 - res.totalChaos,
    log,
  };
}

function runFixed(seed, sensitivity, detectorMode, d) {
  const cfg = { ...BASE, quarantine_sensitivity: sensitivity, detector_mode: detectorMode, seed, drain_intensity: d };
  const res = new E.GoliathSim(cfg).run();
  return {
    seed,
    mode: "sabit",
    extracted: res.extracted,
    tp: res.tp,
    fp: res.fp,
    totalChaos: res.totalChaos,
    healthyCount: 60 - res.totalChaos,
  };
}

function summarize(runs) {
  return {
    extracted: E.meanSe(runs.map((r) => r.extracted)),
    tpRate: E.meanSe(runs.map((r) => r.tp / r.totalChaos)),
    fpRate: E.meanSe(runs.map((r) => r.fp / r.healthyCount)),
  };
}

function pairDiff(aRuns, bRuns) {
  return E.meanSe(aRuns.map((a, i) => a.extracted - bRuns[i].extracted));
}

function runCleanNetworkFp(seeds, sensitivity, detectorMode) {
  const rates = seeds.map((seed) => {
    const res = new E.GoliathSim({
      ...BASE,
      chaos_ratio: 0.0,
      quarantine_sensitivity: sensitivity,
      detector_mode: detectorMode,
      seed,
    }).run();
    return res.fp / 60;
  });
  return E.meanSe(rates);
}

function evalCluster(name, sensitivity, seeds) {
  const detectors = ["baseline", "kalkan_full", "kalkan_abs", "kalkan_deg", "kalkan_drift"];
  const byDet = {};
  let replayOk = 0;
  let replayTot = 0;

  for (const det of detectors) {
    const kv2 = seeds.map((s) => runKovanV2(s, sensitivity, det));
    const stu = seeds.map((s) => runStudent(s, sensitivity, det));
    const rul = seeds.map((s) => runRule(s, sensitivity, det));
    const oracleDs = [0.2, 0.3, 0.4];
    const fixedByD = oracleDs.map((d) => ({
      d,
      runs: seeds.map((s) => runFixed(s, sensitivity, det, d)),
    }));
    const bestFixed = fixedByD
      .map((x) => ({ d: x.d, runs: x.runs, mean: E.meanSe(x.runs.map((r) => r.extracted)).mean }))
      .reduce((a, b) => (b.mean > a.mean ? b : a));

    if (det === "kalkan_full") {
      const cfg = { ...BASE, quarantine_sensitivity: sensitivity, detector_mode: det };
      for (const run of [...kv2, ...stu, ...rul]) {
        replayTot += 1;
        const rep = replay(cfg, run);
        if (rep.extracted === run.extracted && rep.tp === run.tp && rep.fp === run.fp) replayOk += 1;
      }
    }

    byDet[det] = {
      kovan_v2: summarize(kv2),
      student_353p: summarize(stu),
      rule: summarize(rul),
      oracle: { d: bestFixed.d, ...summarize(bestFixed.runs) },
      cleanFp: runCleanNetworkFp(seeds, sensitivity, det),
      _raw: { kv2, stu },
    };
  }

  const base = byDet.baseline;
  const full = byDet.kalkan_full;
  const dropKv2 = pairDiff(base._raw.kv2, full._raw.kv2);
  const dropStu = pairDiff(base._raw.stu, full._raw.stu);

  for (const det of detectors) delete byDet[det]._raw;

  return {
    name,
    sensitivity,
    seedRange: [seeds[0], seeds[seeds.length - 1]],
    n: seeds.length,
    replay: { ok: replayOk, total: replayTot },
    detectors: byDet,
    reductions: {
      kv2Ratio: full.kovan_v2.extracted.mean / base.kovan_v2.extracted.mean,
      kv2Drop: dropKv2,
      stuRatio: full.student_353p.extracted.mean / base.student_353p.extracted.mean,
      stuDrop: dropStu,
    },
  };
}

function main() {
  const clusters = [
    evalCluster("birincil", 0.55, rangeSeeds(12000, 50)),
    evalCluster("gevsek", 0.35, rangeSeeds(12050, 50)),
    evalCluster("siki", 0.75, rangeSeeds(12100, 50)),
  ];

  const pri = clusters[0];
  const pFull = pri.detectors.kalkan_full;
  const critA =
    pri.reductions.kv2Ratio <= 0.50 &&
    pri.reductions.kv2Drop.mean > 2 * pri.reductions.kv2Drop.se &&
    pri.reductions.stuRatio <= 0.50 &&
    pri.reductions.stuDrop.mean > 2 * pri.reductions.stuDrop.se;
  const critB = pFull.kovan_v2.tpRate.mean >= 0.85 && pFull.student_353p.tpRate.mean >= 0.85;
  const critC =
    pFull.kovan_v2.fpRate.mean <= 0.05 &&
    pFull.student_353p.fpRate.mean <= 0.05 &&
    clusters.every((c) => c.detectors.kalkan_full.cleanFp.mean <= 0.03);
  const critD = clusters.every(
    (c) =>
      c.reductions.kv2Ratio <= 0.60 &&
      c.reductions.kv2Drop.mean > 2 * c.reductions.kv2Drop.se &&
      c.reductions.stuRatio <= 0.60 &&
      c.reductions.stuDrop.mean > 2 * c.reductions.stuDrop.se
  );

  const report = {
    experiment: "H-KALKAN",
    date: new Date().toISOString(),
    clusters,
    criteria: { a_drop50: critA, b_tp85: critB, c_fpShield: critC, d_multiRegime: critD },
    supported: critA && critB && critC && critD,
  };

  fs.writeFileSync(path.join(__dirname, "kalkan-results.json"), JSON.stringify(report, null, 2));

  const fmt = (ms) => `${ms.mean.toFixed(2)}±${ms.se.toFixed(2)}`;
  const pct = (ms) => `%${(ms.mean * 100).toFixed(1)}`;
  console.log("=== H-KALKAN KÖR SAVUNMA DENEYİ (150 AYRIK SEED: 12000-12149) ===");
  for (const c of clusters) {
    console.log(`\n[${c.name.toUpperCase()} sigma=${c.sensitivity} | replay ${c.replay.ok}/${c.replay.total}]`);
    for (const det of ["baseline", "kalkan_full", "kalkan_abs", "kalkan_deg", "kalkan_drift"]) {
      const d = c.detectors[det];
      console.log(
        `  ${det.padEnd(13)} | KV2: ${fmt(d.kovan_v2.extracted)} (TP ${pct(d.kovan_v2.tpRate)}, FP ${pct(d.kovan_v2.fpRate)}) | 353p: ${fmt(d.student_353p.extracted)} (TP ${pct(d.student_353p.tpRate)}, FP ${pct(d.student_353p.fpRate)}) | Kâhin(d=${d.oracle.d}): ${fmt(d.oracle.extracted)} | TemizFP: ${pct(d.cleanFp)}`
      );
    }
    console.log(
      `  -> Düşüş: KV2 ${(c.reductions.kv2Ratio * 100).toFixed(1)}% (-${fmt(c.reductions.kv2Drop)}), 353p ${(c.reductions.stuRatio * 100).toFixed(1)}% (-${fmt(c.reductions.stuDrop)})`
    );
  }
  console.log("\n=== ÖN KAYITLI KRİTERLER ===");
  console.log(`(a) >=%50 Çalım Düşüşü (birincil): ${critA ? "✓" : "✗"}`);
  console.log(`(b) >=%85 TP (KV2 & 353p):       ${critB ? "✓" : "✗"}`);
  console.log(`(c) Sıkı FP Kalkanı (<=%5 / %3): ${critC ? "✓" : "✗"}`);
  console.log(`(d) 3 Rejimde >=%40 Düşüş:       ${critD ? "✓" : "✗"}`);
  console.log(`GENEL HÜKÜM: ${report.supported ? "DESTEKLENDİ" : "KISMI / REVİZYON GEREKLİ"}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  BASE,
  rangeSeeds,
  runKovanV2,
  runStudent,
  runRule,
  runFixed,
  summarize,
  pairDiff,
  runCleanNetworkFp,
};
