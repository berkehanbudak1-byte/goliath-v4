"use strict";

// GOLIATH-3B (Ollama 3.1B Q4_K_M) Doğrudan CLI ve Simülasyon Sürücüsü
// Kullanım:
//   node run_goliath_3b.js chat "Sen kimsin?"
//   node run_goliath_3b.js sim --seed 9700 --sigma 0.55 --mode flat|kovan

const E = require("./engine.js");
const { replay } = require("./analyze_atom.js");
const { redactSecrets, validateLlmEndpointUrl } = require("./llm_security.js");

const OLLAMA_URL = validateLlmEndpointUrl(
  process.env.OLLAMA_URL || "http://127.0.0.1:11434/api/chat",
  { allowLocal: true }
);
const MODEL = process.env.GOLIATH_3B_MODEL || "goliath-3b:latest";

const DEFAULT_BASE = {
  chaos_ratio: 0.20,
  infiltration_mode: "random",
  chaos_particles: ["PARASITE"],
  quarantine_sensitivity: 0.55,
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

async function callGoliath3b(userPrompt, { jsonMode = false, maxTokens = 260, temperature = null } = {}) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);
  try {
    const options = { num_predict: maxTokens };
    if (temperature !== null) options.temperature = temperature;
    const body = {
      model: MODEL,
      stream: false,
      options,
      // No role:"system" override so goliath-3b uses its baked Modelfile brain
      messages: [{ role: "user", content: userPrompt }],
    };
    if (jsonMode) body.format = "json";

    const res = await fetch(OLLAMA_URL, {
      method: "POST",
      redirect: "error",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const raw = String(data?.message?.content || "").trim();
    const ms = Date.now() - t0;
    const evalCount = data?.eval_count || 0;
    if (!jsonMode) {
      return { raw, json: null, ms, evalCount };
    }
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("JSON yok");
    return { raw, json: JSON.parse(m[0]), ms, evalCount };
  } catch (e) {
    return { raw: "HATA: " + redactSecrets(e.message), json: null, ms: Date.now() - t0, evalCount: 0 };
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

async function runGoliathFlat(seed, sensitivity = 0.55) {
  const cfg = { ...DEFAULT_BASE, quarantine_sensitivity: sensitivity, seed };
  const sim = new E.GoliathSim(cfg);
  const g = sim._runGen();
  let r = g.next();
  const prevStolen = {};
  const log = [];

  while (!r.done) {
    const obs = r.value;
    const rows = enrich(obs, prevStolen);
    const table = rows
      .map(
        (a) =>
          `${a.id}(deg=${a.degree},d=${a.d.toFixed(2)},ep=${a.delta.toFixed(2)},tot=${a.stolen.toFixed(2)},${a.cutOff ? "CUT" : "OK"})`
      )
      .join(" | ");
    const user = `t=${obs.t}. Agents: ${table}. Decide d for active agents. Reply JSON ONLY.`;
    const resp = await callGoliath3b(user, { jsonMode: true, maxTokens: 240, temperature: 0 });

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
      calls: [{ role: "goliath_3b_flat", raw: resp.raw, json: resp.json, ms: resp.ms }],
    });
    r = g.next(dec);
  }

  const res = r.value;
  return {
    seed,
    sensitivity,
    mode: "goliath_3b_flat",
    extracted: res.extracted,
    tp: res.tp,
    totalChaos: res.totalChaos,
    finalD: res.agentD,
    csi: res.csi[res.steps - 1],
    log,
  };
}

async function runGoliathKovan(seed, sensitivity = 0.55) {
  const cfg = { ...DEFAULT_BASE, quarantine_sensitivity: sensitivity, seed };
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
        `t=${obs.t}/80. active=${activeCount}/${rows.length}, newlyCut=${newlyCutCount}, epochStolen=${epochStolen.toFixed(2)}, ` +
        `hiveFlux=${hiveFlux.toFixed(2)}, fluxCeil=${ceilLabel}, bestScoutSafe=${bestScoutSafeFlux.toFixed(2)}. Decide action.`;
      const resp = await callGoliath3b(user, { jsonMode: true, maxTokens: 110, temperature: 0 });
      calls.push({ role: "goliath_3b_kovan", raw: resp.raw, json: resp.json, ms: resp.ms });

      if (newlyCutCount > 0) {
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
    sensitivity,
    mode: "goliath_3b_kovan",
    extracted: res.extracted,
    tp: res.tp,
    totalChaos: res.totalChaos,
    finalD: res.agentD,
    csi: res.csi[res.steps - 1],
    log,
  };
}

function parseArg(args, flag, fallback) {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : fallback;
}

if (require.main === module) {
  (async () => {
    const [, , cmd = "chat", ...rest] = process.argv;
    if (cmd === "chat") {
      const prompt = rest.join(" ").trim() || "GOLIATH-3B hazır mı?";
      const out = await callGoliath3b(prompt, { jsonMode: false, maxTokens: 320 });
      console.log(`[model=${MODEL} | ${out.ms}ms | tokens=${out.evalCount}]`);
      console.log(out.raw);
      return;
    }

    if (cmd === "sim") {
      const seed = Number(parseArg(rest, "--seed", "9700"));
      const sigma = Number(parseArg(rest, "--sigma", "0.55"));
      const mode = parseArg(rest, "--mode", "kovan").toLowerCase();
      const fn = mode === "flat" ? runGoliathFlat : runGoliathKovan;
      const run = await fn(seed, sigma);
      const rep = replay({ ...DEFAULT_BASE, quarantine_sensitivity: sigma }, run);
      const replayMatch = rep.extracted === run.extracted && rep.tp === run.tp;
      const allCalls = run.log.flatMap((e) => e.calls || []);
      const avgMs = allCalls.length
        ? Math.round(allCalls.reduce((s, c) => s + (c.ms || 0), 0) / allCalls.length)
        : 0;
      const badCalls = allCalls.filter((c) => !c.json).length;
      console.log(
        `[${run.mode}] seed=${seed} sigma=${sigma} | extracted=${run.extracted.toFixed(2)} | ` +
          `TP=${run.tp}/${run.totalChaos} | CSI=${run.csi.toFixed(3)} | ` +
          `calls=${allCalls.length} (bad=${badCalls}, avg=${avgMs}ms) | replay=${replayMatch ? "OK" : "FAIL"}`
      );
      for (const e of run.log.slice(0, 4)) {
        for (const c of e.calls || []) {
          if (c.json?.gerekce) console.log(`  t=${e.t}: ${c.json.action || "d"} -> ${c.json.gerekce}`);
        }
      }
      return;
    }

    console.error("Bilinmeyen komut. Kullanım: chat <soru> | sim --seed 9700 --sigma 0.55 --mode flat|kovan");
    process.exit(1);
  })();
}

module.exports = { MODEL, DEFAULT_BASE, callGoliath3b, runGoliathFlat, runGoliathKovan };
