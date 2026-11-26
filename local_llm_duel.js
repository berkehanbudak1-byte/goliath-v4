"use strict";

// H-LOCAL-HARNESS: 1.9 GB Yerel Ollama (homunculus-q3) + KOVAN İskelesi vs Ham Yerel LLM vs 120B Bulut ATOM
// Çalıştırma: node local_llm_duel.js

const fs = require("fs");
const path = require("path");
const E = require("./engine.js");
const { replay } = require("./analyze_atom.js");
const { runRule, runFixed } = require("./kovan_experiment.js");
const { runKovanV2 } = require("./kovan_v2_experiment.js");

const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434/api/chat";
const MODEL = process.env.GOLIATH_LOCAL_MODEL || "homunculus-q3:latest";
const SEEDS = [9700, 9701, 9702, 9703];
const SENSITIVITY = 0.55;
const BASE = {
  chaos_ratio: 0.20,
  infiltration_mode: "random",
  chaos_particles: ["PARASITE"],
  quarantine_sensitivity: SENSITIVITY,
  decision_epoch: 8,
  drain_intensity: 0.5,
};

const CLOUD_ATOM_120B_REF = [
  { seed: 9700, extracted: 31.0, tp: 11, totalChaos: 12 },
  { seed: 9701, extracted: 14.8, tp: 12, totalChaos: 12 },
  { seed: 9702, extracted: 12.0, tp: 11, totalChaos: 12 },
  { seed: 9703, extracted: 35.2, tp: 6, totalChaos: 12 },
];

const K_REF = 4;
const DEG_ALPHA = 0.5;
const RAMP_BETA = 0.20;
const RAMP_CAP = 3.0;
const SCOUT_COUNT = 2;
const INIT_HIVE_FLUX = 0.18;
const INIT_SCOUT_FLUXES = [0.26, 0.38];

async function callOllamaJson(system, user, maxTokens = 140) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);
  try {
    const res = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        format: "json",
        options: { temperature: 0, num_predict: maxTokens },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const raw = String(data?.message?.content || "").trim();
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("JSON yok");
    return { raw, json: JSON.parse(m[0]), ms: Date.now() - t0 };
  } catch (e) {
    return { raw: "HATA: " + e.message, json: null, ms: Date.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
}

function enrich(obs, prevStolen) {
  return obs.agents.map((a) => ({
    ...a,
    delta: a.stolen - (prevStolen[a.id] || 0),
  }));
}

async function runLocalFlat(seed) {
  const sim = new E.GoliathSim({ ...BASE, seed });
  const g = sim._runGen();
  let r = g.next();
  const prevStolen = {};
  const log = [];

  const sys =
    "You control 12 parasite agents inside a 60-node network. Each step an agent steals capital proportional to intensity d in [0.05, 0.80]. " +
    "A blind anomaly detector cuts off suspicious agents permanently. Maximize TOTAL stolen capital over 80 steps (epochs every 8 steps). " +
    'Reply JSON ONLY: {"d":{"<id>":float,...},"gerekce":"short Turkish reason max 12 words"}.';

  while (!r.done) {
    const obs = r.value;
    const rows = enrich(obs, prevStolen);
    const table = rows
      .map(
        (a) =>
          `${a.id}(deg=${a.degree},d=${a.d.toFixed(2)},ep=${a.delta.toFixed(2)},tot=${a.stolen.toFixed(2)},${a.cutOff ? "CUT" : "OK"})`
      )
      .join(" | ");
    const user = `t=${obs.t}. Agents: ${table}. Decide d for active agents.`;
    const resp = await callOllamaJson(sys, user, 220);

    const dec = { d: {} };
    const map = resp.json && typeof resp.json.d === "object" && resp.json.d ? resp.json.d : {};
    for (const a of rows) {
      const cand = Number(map[a.id] ?? map[String(a.id)]);
      dec.d[a.id] = Number.isFinite(cand) ? Math.max(0.05, Math.min(0.8, cand)) : a.d;
      prevStolen[a.id] = a.stolen;
    }
    log.push({
      t: obs.t,
      decision: dec.d,
      calls: [{ role: "local_flat", raw: resp.raw, json: resp.json, ms: resp.ms }],
    });
    r = g.next(dec);
  }

  const res = r.value;
  return {
    seed,
    mode: "local_flat",
    extracted: res.extracted,
    tp: res.tp,
    totalChaos: res.totalChaos,
    finalD: res.agentD,
    csi: res.csi[res.steps - 1],
    log,
  };
}

async function runLocalKovan(seed) {
  const sim = new E.GoliathSim({ ...BASE, seed });
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

  const sys =
    "You are the Hive Strategist controlling swarm intensity hiveFlux against a blind anomaly detector. " +
    "You must avoid quarantine crashes while climbing slowly when safe. " +
    'Reply JSON ONLY: {"action":"up"|"hold"|"down","step":number,"gerekce":"kısa Türkçe gerekçe (en fazla 10 kelime)"}. ' +
    'For "up" choose step in [1.08, 1.32]; for "hold" step=1.0; for "down" choose step in [0.78, 0.92].';

  while (!r.done) {
    const obs = r.value;
    const rows = enrich(obs, prevStolen);
    const dec = { d: {} };
    const calls = [];

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
      let newlyCutCount = 0;
      let activeCount = 0;
      let epochStolen = 0;
      let bestScoutSafeFlux = 0;

      for (const a of rows) {
        const newlyCut = a.cutOff && !prevCut[a.id];
        const usedRamp = prevRamp[a.id] || 1.0;
        const effFlux = (a.d * degFactor(a.degree)) / usedRamp;
        epochStolen += a.delta;

        if (newlyCut) {
          newlyCutCount += 1;
          fluxCeil = Math.min(fluxCeil, 0.88 * effFlux);
        } else if (!a.cutOff) {
          activeCount += 1;
          if (scoutSet.has(a.id) && a.delta > 0) {
            bestScoutSafeFlux = Math.max(bestScoutSafeFlux, effFlux);
          }
        }
      }

      const ceilLabel = Number.isFinite(fluxCeil) ? fluxCeil.toFixed(2) : "unknown";
      const user =
        `t=${obs.t}/80. active=${activeCount}/12, newlyCut=${newlyCutCount}, epochStolen=${epochStolen.toFixed(2)}, ` +
        `hiveFlux=${hiveFlux.toFixed(2)}, fluxCeil=${ceilLabel}, bestScoutSafe=${bestScoutSafeFlux.toFixed(2)}. Decide action.`;
      const resp = await callOllamaJson(sys, user, 110);
      calls.push({ role: "local_kovan", raw: resp.raw, json: resp.json, ms: resp.ms });

      if (newlyCutCount > 0) {
        // Hard crash barrier overrides optimistic ascent when any agent just crashed
        const rawDown = Number(resp.json?.step);
        const downMult =
          resp.json?.action === "down" && Number.isFinite(rawDown)
            ? Math.max(0.75, Math.min(0.92, rawDown))
            : 0.88;
        hiveFlux = Math.min(hiveFlux * downMult, fluxCeil * 0.88);
        cooldown = 1;
      } else {
        const act = String(resp.json?.action || "up").toLowerCase();
        const rawStep = Number(resp.json?.step);
        if (act === "down") {
          const mult = Number.isFinite(rawStep) ? Math.max(0.78, Math.min(0.95, rawStep)) : 0.88;
          hiveFlux *= mult;
        } else if (act === "hold") {
          hiveFlux = Math.max(hiveFlux, bestScoutSafeFlux * 0.90);
        } else {
          const mult = Number.isFinite(rawStep) ? Math.max(1.08, Math.min(1.32, rawStep)) : 1.25;
          hiveFlux = Math.min(fluxCeil * 0.90, Math.max(hiveFlux * mult, bestScoutSafeFlux * 0.92));
        }
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
    log.push({ t: obs.t, decision: dec.d, calls });
    r = g.next(dec);
  }

  const res = r.value;
  return {
    seed,
    mode: "local_kovan",
    extracted: res.extracted,
    tp: res.tp,
    totalChaos: res.totalChaos,
    finalD: res.agentD,
    csi: res.csi[res.steps - 1],
    log,
  };
}

function summarizeCalls(runs) {
  let total = 0;
  let bad = 0;
  let msSum = 0;
  const rationales = [];
  for (const r of runs) {
    for (const e of r.log) {
      for (const c of e.calls || []) {
        total += 1;
        msSum += c.ms || 0;
        if (!c.json) bad += 1;
        else if (c.json.gerekce && rationales.length < 6) {
          rationales.push({ seed: r.seed, t: e.t, action: c.json.action || "d", gerekce: String(c.json.gerekce) });
        }
      }
    }
  }
  return { total, bad, avgMs: total ? Math.round(msSum / total) : 0, rationales };
}

function fmt(x) {
  return `${x.mean.toFixed(2)}±${x.se.toFixed(2)}`;
}

if (require.main === module) {
  (async () => {
    const t0 = Date.now();
    const partPath = path.join(__dirname, "local-duel.partial.jsonl");
    const done = new Map();
    if (fs.existsSync(partPath)) {
      for (const line of fs.readFileSync(partPath, "utf8").split(/\r?\n/)) {
        if (!line.trim()) continue;
        const x = JSON.parse(line);
        done.set(`${x.mode}:${x.seed}`, x);
      }
    }

    async function runCached(mode, seed, fn) {
      const key = `${mode}:${seed}`;
      if (done.has(key)) return done.get(key);
      const x = await fn(seed);
      fs.appendFileSync(partPath, JSON.stringify(x) + "\n", "utf8");
      done.set(key, x);
      console.log(`  [${mode}] seed ${seed}: extracted=${x.extracted.toFixed(1)}, TP=${x.tp}/${x.totalChaos}`);
      return x;
    }

    const ds = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
    const fixedByD = {};
    for (const d of ds) fixedByD[d] = SEEDS.map((s) => runFixed(s, SENSITIVITY, d));
    const fixedGrid = ds.map((d) => ({
      d,
      ...E.meanSe(fixedByD[d].map((r) => r.extracted)),
      tp: E.meanSe(fixedByD[d].map((r) => r.tp / r.totalChaos)).mean,
    }));
    const oracle = fixedGrid.reduce((a, b) => (b.mean > a.mean ? b : a));

    const ruleRuns = SEEDS.map((s) => runRule(s, SENSITIVITY));
    const v2Runs = SEEDS.map((s) => runKovanV2(s, SENSITIVITY));

    const localFlatRuns = [];
    const localKovanRuns = [];
    for (const s of SEEDS) localFlatRuns.push(await runCached("local_flat", s, runLocalFlat));
    for (const s of SEEDS) localKovanRuns.push(await runCached("local_kovan", s, runLocalKovan));

    let replayOk = 0;
    let replayTotal = 0;
    for (const run of [...ruleRuns, ...v2Runs, ...localFlatRuns, ...localKovanRuns]) {
      replayTotal += 1;
      const x = replay(BASE, run);
      if (x.extracted === run.extracted && x.tp === run.tp) replayOk += 1;
    }

    const ex = (arr) => arr.map((r) => r.extracted);
    const tpMean = (arr) => E.meanSe(arr.map((r) => r.tp / r.totalChaos)).mean;
    const stats = {
      localKovan: E.meanSe(ex(localKovanRuns)),
      localFlat: E.meanSe(ex(localFlatRuns)),
      kovanV2: E.meanSe(ex(v2Runs)),
      rule: E.meanSe(ex(ruleRuns)),
      greedy: E.meanSe(ex(fixedByD[0.8])),
      oracle: { d: oracle.d, ...E.meanSe(ex(fixedByD[oracle.d])) },
      cloudAtom120bRef: E.meanSe(ex(CLOUD_ATOM_120B_REF)),
    };
    const tp = {
      localKovan: tpMean(localKovanRuns),
      localFlat: tpMean(localFlatRuns),
      kovanV2: tpMean(v2Runs),
      rule: tpMean(ruleRuns),
      greedy: fixedGrid.find((x) => x.d === 0.8).tp,
      oracle: oracle.tp,
      cloudAtom120bRef: tpMean(CLOUD_ATOM_120B_REF),
    };

    const callStats = {
      localFlat: summarizeCalls(localFlatRuns),
      localKovan: summarizeCalls(localKovanRuns),
    };

    const criteria = {
      a_harnessBeatsRawLocal:
        stats.localKovan.mean > stats.localFlat.mean && tp.localKovan < tp.localFlat,
      b_19gbHarnessBeats120bCloud:
        stats.localKovan.mean > stats.cloudAtom120bRef.mean &&
        stats.localKovan.mean >= 1.5 * stats.greedy.mean,
    };

    const out = {
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - t0,
      model: MODEL,
      seeds: SEEDS,
      sensitivity: SENSITIVITY,
      replay: { ok: replayOk, total: replayTotal },
      perSeed: SEEDS.map((s, i) => ({
        seed: s,
        localKovan: localKovanRuns[i].extracted,
        localFlat: localFlatRuns[i].extracted,
        kovanV2: v2Runs[i].extracted,
        rule: ruleRuns[i].extracted,
        greedy: fixedByD[0.8][i].extracted,
        oracle: fixedByD[oracle.d][i].extracted,
        cloudAtom120bRef: CLOUD_ATOM_120B_REF[i].extracted,
      })),
      stats,
      tp,
      callStats,
      criteria,
    };

    fs.writeFileSync(path.join(__dirname, "local-duel-results.json"), JSON.stringify(out, null, 2));

    console.log(`\n=== LOCAL LLM DUEL (${MODEL}, seeds 9700-9703, sigma=0.55) | replay ${replayOk}/${replayTotal} ===`);
    console.log(`LOCAL-KOVAN  ${fmt(stats.localKovan)} (TP %${(tp.localKovan * 100).toFixed(1)}, bad ${callStats.localKovan.bad}/${callStats.localKovan.total}, ${callStats.localKovan.avgMs}ms/call)`);
    console.log(`LOCAL-FLAT   ${fmt(stats.localFlat)} (TP %${(tp.localFlat * 100).toFixed(1)}, bad ${callStats.localFlat.bad}/${callStats.localFlat.total}, ${callStats.localFlat.avgMs}ms/call)`);
    console.log(`CLOUD-ATOM   ${fmt(stats.cloudAtom120bRef)} (TP %${(tp.cloudAtom120bRef * 100).toFixed(1)}, gpt-oss-120b logged ref)`);
    console.log(`KOVAN-V2     ${fmt(stats.kovanV2)} (TP %${(tp.kovanV2 * 100).toFixed(1)})`);
    console.log(`KURAL        ${fmt(stats.rule)} (TP %${(tp.rule * 100).toFixed(1)})`);
    console.log(`Açgözlü 0.8  ${fmt(stats.greedy)} (TP %${(tp.greedy * 100).toFixed(1)}) | Kâhin d=${oracle.d} ${fmt(stats.oracle)} (TP %${(tp.oracle * 100).toFixed(1)})`);
    console.log("CRITERIA:", JSON.stringify(criteria), `(${Math.round(out.durationMs / 1000)}s)`);
    console.log("SAMPLE RATIONALES:", JSON.stringify(callStats.localKovan.rationales.slice(0, 4)));
  })();
}

module.exports = { runLocalFlat, runLocalKovan };
