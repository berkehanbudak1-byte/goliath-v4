"use strict";

// H-KOVAN Ön Kayıtlı Deneyi: Topolojik Uzmanlaşma & Sermaye-Seyreltme Kalkanı
// Çalıştırma: node kovan_experiment.js

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
const RAMP_GAMMA = 0.35;
const RAMP_CAP = 3.0;
const SCOUT_COUNT = 3;

function rangeSeeds(start, count) {
  return Array.from({ length: count }, (_, k) => start + k);
}

function enrich(obs, prevStolen) {
  return obs.agents.map((a) => ({
    ...a,
    delta: a.stolen - (prevStolen[a.id] || 0),
  }));
}

function groupsByDegreeDesc(obs) {
  const sorted = obs.agents.slice().sort((a, b) => b.degree - a.degree || a.id - b.id);
  return {
    0: sorted.slice(0, 4).map((a) => a.id),
    1: sorted.slice(4, 8).map((a) => a.id),
    2: sorted.slice(8).map((a) => a.id),
  };
}

function runRule(seed, sensitivity) {
  const cfg = { ...BASE, quarantine_sensitivity: sensitivity, seed };
  const sim = new E.GoliathSim(cfg);
  const g = sim._runGen();
  let r = g.next();
  const prevStolen = {};
  const prevCut = {};
  const log = [];
  let G = null;

  while (!r.done) {
    const obs = r.value;
    if (!G) G = groupsByDegreeDesc(obs);
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
    sensitivity,
    extracted: res.extracted,
    tp: res.tp,
    totalChaos: res.totalChaos,
    finalD: res.agentD,
    csi: res.csi[res.steps - 1],
    log,
  };
}

function runKovan(
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
  const rampFactor = (stolen) =>
    capitalRamp ? 1 + RAMP_GAMMA * Math.min(Math.max(0, stolen), RAMP_CAP) : 1.0;
  const fluxToD = (flux, deg, stolen) =>
    Math.max(0.05, Math.min(0.8, (flux / degFactor(deg)) * rampFactor(stolen)));
  const dToFlux = (d, deg, stolen) => (d * degFactor(deg)) / rampFactor(stolen);

  let scoutIds = null;
  let scoutSet = null;
  let hiveFlux = 0.65;
  let fluxCeil = Infinity;
  const prevStolen = {};
  const prevCut = {};
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

      const initProbes = [0.55, 0.90, 1.30];
      rows.forEach((a) => {
        const sIdx = scoutIds.indexOf(a.id);
        const f = sIdx !== -1 ? initProbes[sIdx] : hiveFlux;
        dec.d[a.id] = fluxToD(f, a.degree, a.stolen);
      });
    } else {
      let anyNewlyCut = false;
      const dancers = [];
      const activeAgents = [];

      for (const a of rows) {
        const newlyCut = a.cutOff && !prevCut[a.id];
        const effFlux = dToFlux(a.d, a.degree, prevStolen[a.id] || 0);
        if (newlyCut) {
          anyNewlyCut = true;
          fluxCeil = Math.min(fluxCeil, 0.85 * effFlux);
        }
        if (!a.cutOff) {
          activeAgents.push(a);
          if (a.delta > 0) {
            const w = a.delta * (scoutSet.has(a.id) ? 1.5 : 1.0);
            dancers.push({ flux: effFlux, weight: w });
          }
        }
      }

      if (anyNewlyCut) {
        hiveFlux = Math.min(hiveFlux * 0.82, fluxCeil);
      } else if (activeAgents.length > 0 && dancers.length >= 0.5 * activeAgents.length) {
        dancers.sort((a, b) => b.weight - a.weight);
        const topK = dancers.slice(0, Math.max(1, Math.ceil(dancers.length / 2)));
        const wSum = topK.reduce((s, x) => s + x.weight, 0);
        const danceFlux =
          wSum > 0 ? topK.reduce((s, x) => s + x.flux * x.weight, 0) / wSum : hiveFlux;
        hiveFlux = Math.min(fluxCeil * 0.95, Math.max(danceFlux, hiveFlux * 1.12));
      }

      hiveFlux = Math.max(0.12, Math.min(1.6, hiveFlux));

      const activeScouts = scoutIds.filter((id) => {
        const a = rows.find((x) => x.id === id);
        return a && !a.cutOff;
      });
      const converged = fluxCeil < Infinity && obs.t >= 32;
      const mults = converged ? [0.95, 1.0, 1.05] : [0.95, 1.15, 1.35];

      for (const a of rows) {
        const sPos = activeScouts.indexOf(a.id);
        let targetFlux = hiveFlux;
        if (sPos !== -1) {
          const mult = mults[Math.min(sPos, mults.length - 1)];
          targetFlux = Math.min(hiveFlux * mult, fluxCeil * 1.02);
        }
        dec.d[a.id] = fluxToD(targetFlux, a.degree, a.stolen);
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
    mode: "kovan",
    sensitivity,
    extracted: res.extracted,
    tp: res.tp,
    totalChaos: res.totalChaos,
    finalD: res.agentD,
    csi: res.csi[res.steps - 1],
    log,
  };
}

function runFixed(seed, sensitivity, d) {
  const res = new E.GoliathSim({
    ...BASE,
    quarantine_sensitivity: sensitivity,
    decision_epoch: 0,
    drain_intensity: d,
    seed,
  }).run();
  return {
    seed,
    mode: "sabit",
    d,
    sensitivity,
    extracted: res.extracted,
    tp: res.tp,
    totalChaos: res.totalChaos,
    csi: res.csi[res.steps - 1],
  };
}

function pairStats(x, y) {
  return E.meanSe(x.map((v, i) => v - y[i]));
}

function tpRate(runs) {
  return E.meanSe(runs.map((r) => r.tp / r.totalChaos)).mean;
}

function evaluateSuite(seeds, sensitivity) {
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
  const kovanRuns = seeds.map((s) =>
    runKovan(s, sensitivity, { scoutRole: "periphery", degreeScale: true, capitalRamp: true })
  );
  const tersRuns = seeds.map((s) =>
    runKovan(s, sensitivity, { scoutRole: "hub", degreeScale: true, capitalRamp: true })
  );
  const noDegRuns = seeds.map((s) =>
    runKovan(s, sensitivity, { scoutRole: "periphery", degreeScale: false, capitalRamp: true })
  );
  const noRampRuns = seeds.map((s) =>
    runKovan(s, sensitivity, { scoutRole: "periphery", degreeScale: true, capitalRamp: false })
  );

  // Bit-exact replay check
  const baseForReplay = { ...BASE, quarantine_sensitivity: sensitivity };
  let replayOk = 0;
  let replayTotal = 0;
  for (const run of [...ruleRuns, ...kovanRuns, ...tersRuns, ...noDegRuns, ...noRampRuns]) {
    replayTotal += 1;
    const x = replay(baseForReplay, run);
    if (x.extracted === run.extracted && x.tp === run.tp) replayOk += 1;
  }

  const ex = (runs) => runs.map((r) => r.extracted);
  const K = ex(kovanRuns);
  const R = ex(ruleRuns);
  const Gd = ex(fixedByD[0.8]);
  const O = ex(fixedByD[oracleEntry.d]);
  const T = ex(tersRuns);
  const ND = ex(noDegRuns);
  const NR = ex(noRampRuns);

  const means = {
    kovan: E.meanSe(K),
    rule: E.meanSe(R),
    greedy: E.meanSe(Gd),
    oracle: { d: oracleEntry.d, ...E.meanSe(O) },
    kovanTers: E.meanSe(T),
    kovanNoDeg: E.meanSe(ND),
    kovanNoRamp: E.meanSe(NR),
  };

  const tp = {
    kovan: tpRate(kovanRuns),
    rule: tpRate(ruleRuns),
    greedy: fixedGrid.find((x) => x.d === 0.8).tp,
    oracle: oracleEntry.tp,
    kovanTers: tpRate(tersRuns),
    kovanNoDeg: tpRate(noDegRuns),
    kovanNoRamp: tpRate(noRampRuns),
  };

  const diffs = {
    vsGreedy: pairStats(K, Gd),
    vsRule: pairStats(K, R),
    vsOracle: pairStats(K, O),
    vsTers: pairStats(K, T),
    vsNoDeg: pairStats(K, ND),
    vsNoRamp: pairStats(K, NR),
  };

  const ratioGreedy = means.kovan.mean / means.greedy.mean;
  const ratioOracle = means.kovan.mean / means.oracle.mean;
  const ratioRule = means.kovan.mean / means.rule.mean;

  const criteria = {
    a_beatsGreedy15x: ratioGreedy >= 1.5 && diffs.vsGreedy.mean > 2 * diffs.vsGreedy.se,
    b_beatsRule: diffs.vsRule.mean > 0 && diffs.vsRule.mean > 2 * diffs.vsRule.se,
    c_beatsOracle: ratioOracle > 1.0 && diffs.vsOracle.mean > 2 * diffs.vsOracle.se,
    d_tersSig: diffs.vsTers.mean > 0 && diffs.vsTers.mean > 2 * diffs.vsTers.se,
    d_noDegSig: diffs.vsNoDeg.mean > 0 && diffs.vsNoDeg.mean > 2 * diffs.vsNoDeg.se,
    d_noRampSig: diffs.vsNoRamp.mean > 0 && diffs.vsNoRamp.mean > 2 * diffs.vsNoRamp.se,
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
    ratios: { greedy: ratioGreedy, oracle: ratioOracle, rule: ratioRule },
    criteria,
  };
}

function fmt(x) {
  return `${x.mean.toFixed(2)}±${x.se.toFixed(2)}`;
}

if (require.main === module) {
  const t0 = Date.now();
  const primary = evaluateSuite(rangeSeeds(9800, 50), 0.55);
  const lax = evaluateSuite(rangeSeeds(9850, 50), 0.35);
  const strict = evaluateSuite(rangeSeeds(9900, 50), 0.75);

  const e_blindGen =
    primary.criteria.b_beatsRule && lax.criteria.b_beatsRule && strict.criteria.b_beatsRule;
  const out = {
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - t0,
    primary,
    lax,
    strict,
    overall: {
      a: primary.criteria.a_beatsGreedy15x,
      b: primary.criteria.b_beatsRule,
      c: primary.criteria.c_beatsOracle,
      d_ters: primary.criteria.d_tersSig,
      d_noDeg: primary.criteria.d_noDegSig,
      d_noRamp: primary.criteria.d_noRampSig,
      e_blindGen,
    },
  };

  fs.writeFileSync(path.join(__dirname, "kovan-results.json"), JSON.stringify(out, null, 2));

  for (const [name, s] of [
    ["PRIMARY (sigma=0.55, 9800-9849)", primary],
    ["LAX     (sigma=0.35, 9850-9899)", lax],
    ["STRICT  (sigma=0.75, 9900-9949)", strict],
  ]) {
    console.log(`\n=== ${name} | replay ${s.replay.ok}/${s.replay.total} ===`);
    console.log(
      `KOVAN ${fmt(s.means.kovan)} (TP %${(s.tp.kovan * 100).toFixed(0)}) | ` +
        `KURAL ${fmt(s.means.rule)} (TP %${(s.tp.rule * 100).toFixed(0)}) | ` +
        `Açgözlü ${fmt(s.means.greedy)} | ` +
        `Kâhin d=${s.means.oracle.d} ${fmt(s.means.oracle)} (TP %${(s.tp.oracle * 100).toFixed(0)})`
    );
    console.log(
      `Ablations -> TERS ${fmt(s.means.kovanTers)} | NO-DEG ${fmt(s.means.kovanNoDeg)} | NO-RAMP ${fmt(s.means.kovanNoRamp)}`
    );
    console.log(
      `Diffs -> vsGreedy ${fmt(s.diffs.vsGreedy)} (${s.ratios.greedy.toFixed(2)}x) | ` +
        `vsRule ${fmt(s.diffs.vsRule)} (${s.ratios.rule.toFixed(2)}x) | ` +
        `vsOracle ${fmt(s.diffs.vsOracle)} (${s.ratios.oracle.toFixed(2)}x)`
    );
    console.log(
      `Causal -> -TERS ${fmt(s.diffs.vsTers)} [${s.criteria.d_tersSig ? "OK" : "X"}] | ` +
        `-NO_DEG ${fmt(s.diffs.vsNoDeg)} [${s.criteria.d_noDegSig ? "OK" : "X"}] | ` +
        `-NO_RAMP ${fmt(s.diffs.vsNoRamp)} [${s.criteria.d_noRampSig ? "OK" : "X"}]`
    );
  }
  console.log("\nOVERALL CRITERIA:", JSON.stringify(out.overall), `(${out.durationMs} ms)`);
}

module.exports = { runKovan, runRule, runFixed, evaluateSuite };
