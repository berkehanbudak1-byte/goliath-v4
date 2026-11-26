"use strict";

// H-KOVAN-V2 Ön Kayıtlı Deneyi: Sıfır-Kaza Yavaş Tırmanış vs Tekdüze Kâhin
// Çalıştırma: node kovan_v2_experiment.js

const fs = require("fs");
const path = require("path");
const E = require("./engine.js");
const { replay } = require("./analyze_atom.js");
const { runKovan: runKovanV1, runRule, runFixed } = require("./kovan_experiment.js");

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

function rangeSeeds(start, count) {
  return Array.from({ length: count }, (_, k) => start + k);
}

function enrich(obs, prevStolen) {
  return obs.agents.map((a) => ({
    ...a,
    delta: a.stolen - (prevStolen[a.id] || 0),
  }));
}

function runKovanV2(
  seed,
  sensitivity,
  opts = { scoutRole: "periphery", degreeScale: true, capitalRamp: true }
) {
  const { scoutRole = "periphery", degreeScale = true, capitalRamp = true } = opts;
  const cfg = { ...BASE, quarantine_sensitivity: sensitivity, seed };
  const sim = new E.GoliathSim(cfg);
  const g = sim._runGen();
  let r = g.next();

  const degFactor = (deg) =>
    degreeScale ? (1 + DEG_ALPHA * deg) / (1 + DEG_ALPHA * K_REF) : 1.0;
  const rampFactor = (deg, stolen, freeze) => {
    if (!capitalRamp || freeze) return 1.0;
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
      const picked =
        scoutRole === "hub" ? sortedAsc.slice(-SCOUT_COUNT) : sortedAsc.slice(0, SCOUT_COUNT);
      scoutIds = picked.map((a) => a.id);
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
          if (scoutSet.has(a.id)) {
            bestScoutSafeFlux = Math.max(bestScoutSafeFlux, effFlux);
          }
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
        const danceFlux =
          wSum > 0 ? topK.reduce((s, x) => s + x.flux * x.weight, 0) / wSum : hiveFlux;
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
    sensitivity,
    extracted: res.extracted,
    tp: res.tp,
    totalChaos: res.totalChaos,
    finalD: res.agentD,
    csi: res.csi[res.steps - 1],
    log,
  };
}

function pairStats(x, y) {
  return E.meanSe(x.map((v, i) => v - y[i]));
}

function tpRate(runs) {
  return E.meanSe(runs.map((r) => r.tp / r.totalChaos)).mean;
}

function evaluateSuiteV2(seeds, sensitivity) {
  const ds = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
  const fixedByD = {};
  for (const d of ds) {
    fixedByD[d] = seeds.map((s) => runFixed(s, sensitivity, d));
  }
  const fixedGrid = ds.map((d) => ({
    d,
    ...E.meanSe(fixedByD[d].map((r) => r.extracted)),
    tp: tpRate(fixedByD[d]),
  }));
  const oracleEntry = fixedGrid.reduce((a, b) => (b.mean > a.mean ? b : a));

  const ruleRuns = seeds.map((s) => runRule(s, sensitivity));
  const v1Runs = seeds.map((s) =>
    runKovanV1(s, sensitivity, { scoutRole: "periphery", degreeScale: true, capitalRamp: true })
  );
  const v2Runs = seeds.map((s) =>
    runKovanV2(s, sensitivity, { scoutRole: "periphery", degreeScale: true, capitalRamp: true })
  );
  const v2TersRuns = seeds.map((s) =>
    runKovanV2(s, sensitivity, { scoutRole: "hub", degreeScale: true, capitalRamp: true })
  );
  const v2NoDegRuns = seeds.map((s) =>
    runKovanV2(s, sensitivity, { scoutRole: "periphery", degreeScale: false, capitalRamp: true })
  );
  const v2NoRampRuns = seeds.map((s) =>
    runKovanV2(s, sensitivity, { scoutRole: "periphery", degreeScale: true, capitalRamp: false })
  );

  const baseForReplay = { ...BASE, quarantine_sensitivity: sensitivity };
  let replayOk = 0;
  let replayTotal = 0;
  for (const run of [...ruleRuns, ...v1Runs, ...v2Runs, ...v2TersRuns, ...v2NoDegRuns, ...v2NoRampRuns]) {
    replayTotal += 1;
    const x = replay(baseForReplay, run);
    if (x.extracted === run.extracted && x.tp === run.tp) replayOk += 1;
  }

  const ex = (runs) => runs.map((r) => r.extracted);
  const V2 = ex(v2Runs);
  const V1 = ex(v1Runs);
  const R = ex(ruleRuns);
  const Gd = ex(fixedByD[0.8]);
  const O = ex(fixedByD[oracleEntry.d]);
  const T = ex(v2TersRuns);
  const ND = ex(v2NoDegRuns);
  const NR = ex(v2NoRampRuns);

  const means = {
    kovanV2: E.meanSe(V2),
    kovanV1: E.meanSe(V1),
    rule: E.meanSe(R),
    greedy: E.meanSe(Gd),
    oracle: { d: oracleEntry.d, ...E.meanSe(O) },
    v2Ters: E.meanSe(T),
    v2NoDeg: E.meanSe(ND),
    v2NoRamp: E.meanSe(NR),
  };

  const tp = {
    kovanV2: tpRate(v2Runs),
    kovanV1: tpRate(v1Runs),
    rule: tpRate(ruleRuns),
    greedy: fixedGrid.find((x) => x.d === 0.8).tp,
    oracle: oracleEntry.tp,
    v2Ters: tpRate(v2TersRuns),
    v2NoDeg: tpRate(v2NoDegRuns),
    v2NoRamp: tpRate(v2NoRampRuns),
  };

  const diffs = {
    vsV1: pairStats(V2, V1),
    vsRule: pairStats(V2, R),
    vsGreedy: pairStats(V2, Gd),
    vsOracle: pairStats(V2, O),
    vsTers: pairStats(V2, T),
    vsNoDeg: pairStats(V2, ND),
    vsNoRamp: pairStats(V2, NR),
  };

  const ratios = {
    vsV1: means.kovanV2.mean / means.kovanV1.mean,
    vsRule: means.kovanV2.mean / means.rule.mean,
    vsGreedy: means.kovanV2.mean / means.greedy.mean,
    vsOracle: means.kovanV2.mean / means.oracle.mean,
  };

  const criteria = {
    a_noCrash: tp.kovanV2 <= 0.50 && tp.kovanV2 < tp.kovanV1 - 0.25,
    b_beatsV1AndRule:
      diffs.vsV1.mean > 0 &&
      diffs.vsV1.mean > 2 * diffs.vsV1.se &&
      diffs.vsRule.mean > 0 &&
      diffs.vsRule.mean > 2 * diffs.vsRule.se,
    c_beatsOracle: ratios.vsOracle > 1.0 && diffs.vsOracle.mean > 2 * diffs.vsOracle.se,
    d_regimeOK:
      ratios.vsOracle >= 0.90 &&
      diffs.vsV1.mean > 0 &&
      diffs.vsV1.mean > 2 * diffs.vsV1.se &&
      tp.kovanV2 < 0.55,
    e_noDegSig: diffs.vsNoDeg.mean > 0 && diffs.vsNoDeg.mean > 2 * diffs.vsNoDeg.se,
    e_tersSig: diffs.vsTers.mean > 0 && diffs.vsTers.mean > 2 * diffs.vsTers.se,
    e_noRampSig: diffs.vsNoRamp.mean > 0 && diffs.vsNoRamp.mean > 2 * diffs.vsNoRamp.se,
  };

  return {
    sensitivity,
    n: seeds.length,
    seedRange: [seeds[0], seeds[seeds.length - 1]],
    replay: { ok: replayOk, total: replayTotal },
    means,
    tp,
    fixedGrid,
    diffs,
    ratios,
    criteria,
  };
}

function fmt(x) {
  return `${x.mean.toFixed(2)}±${x.se.toFixed(2)}`;
}

if (require.main === module) {
  const t0 = Date.now();
  const primary = evaluateSuiteV2(rangeSeeds(10000, 50), 0.55);
  const lax = evaluateSuiteV2(rangeSeeds(10050, 50), 0.35);
  const strict = evaluateSuiteV2(rangeSeeds(10100, 50), 0.75);

  const overall = {
    a_noCrash: primary.criteria.a_noCrash,
    b_beatsV1AndRule: primary.criteria.b_beatsV1AndRule,
    c_beatsOracle: primary.criteria.c_beatsOracle,
    d_multiRegimeGen:
      primary.criteria.d_regimeOK && lax.criteria.d_regimeOK && strict.criteria.d_regimeOK,
    e_noDeg: primary.criteria.e_noDegSig,
    e_ters: primary.criteria.e_tersSig,
    e_noRamp: primary.criteria.e_noRampSig,
  };

  const out = {
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - t0,
    primary,
    lax,
    strict,
    overall,
  };

  fs.writeFileSync(path.join(__dirname, "kovan-v2-results.json"), JSON.stringify(out, null, 2));

  for (const [name, s] of [
    ["PRIMARY (sigma=0.55, 10000-10049)", primary],
    ["LAX     (sigma=0.35, 10050-10099)", lax],
    ["STRICT  (sigma=0.75, 10100-10149)", strict],
  ]) {
    console.log(`\n=== ${name} | replay ${s.replay.ok}/${s.replay.total} ===`);
    console.log(
      `V2 ${fmt(s.means.kovanV2)} (TP %${(s.tp.kovanV2 * 100).toFixed(1)}) | ` +
        `V1 ${fmt(s.means.kovanV1)} (TP %${(s.tp.kovanV1 * 100).toFixed(1)}) | ` +
        `KURAL ${fmt(s.means.rule)} (TP %${(s.tp.rule * 100).toFixed(1)}) | ` +
        `Kâhin d=${s.means.oracle.d} ${fmt(s.means.oracle)} (TP %${(s.tp.oracle * 100).toFixed(1)})`
    );
    console.log(
      `Ablations -> TERS ${fmt(s.means.v2Ters)} | NO-DEG ${fmt(s.means.v2NoDeg)} | NO-RAMP ${fmt(s.means.v2NoRamp)}`
    );
    console.log(
      `Diffs -> vsV1 ${fmt(s.diffs.vsV1)} (${s.ratios.vsV1.toFixed(2)}x) | ` +
        `vsRule ${fmt(s.diffs.vsRule)} (${s.ratios.vsRule.toFixed(2)}x) | ` +
        `vsOracle ${fmt(s.diffs.vsOracle)} (${s.ratios.vsOracle.toFixed(2)}x)`
    );
    console.log(
      `Causal -> -NO_DEG ${fmt(s.diffs.vsNoDeg)} [${s.criteria.e_noDegSig ? "OK" : "X"}] | ` +
        `-TERS ${fmt(s.diffs.vsTers)} [${s.criteria.e_tersSig ? "OK" : "X"}] | ` +
        `-NO_RAMP ${fmt(s.diffs.vsNoRamp)} [${s.criteria.e_noRampSig ? "OK" : "X"}]`
    );
  }
  console.log("\nOVERALL CRITERIA:", JSON.stringify(overall), `(${out.durationMs} ms)`);
}

module.exports = { runKovanV2, evaluateSuiteV2 };
