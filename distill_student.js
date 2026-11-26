"use strict";

// H-DISTILL: 353 Parametreli (<10 KB) Tarayıcı-İçi Öğrenci MLP Damıtması
// Çalıştırma: node distill_student.js

const fs = require("fs");
const path = require("path");
const E = require("./engine.js");
const { replay } = require("./analyze_atom.js");
const { runRule, runFixed } = require("./kovan_experiment.js");
const { runKovanV2 } = require("./kovan_v2_experiment.js");

const BASE = {
  chaos_ratio: 0.20,
  infiltration_mode: "random",
  chaos_particles: ["PARASITE"],
  decision_epoch: 8,
  drain_intensity: 0.5,
};

function rangeSeeds(start, count) {
  return Array.from({ length: count }, (_, k) => start + k);
}

// 12 blind features derived strictly from _attackerObs(t)
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

function collectTeacherDataset() {
  const trainSeeds = rangeSeeds(11000, 40);
  const sensitivities = [0.35, 0.55, 0.75];
  const dataset = [];

  for (const sigma of sensitivities) {
    for (const seed of trainSeeds) {
      const teacherRun = runKovanV2(seed, sigma);
      const sim = new E.GoliathSim({ ...BASE, quarantine_sensitivity: sigma, seed });
      const g = sim._runGen();
      let r = g.next();
      let k = 0;
      const state = {};
      while (!r.done) {
        const obs = r.value;
        const dec = teacherRun.log[k].decision;
        const samples = extractAgentFeatures(obs.agents, obs.t, state);
        for (const s of samples) {
          const targetD = dec[s.id];
          if (Number.isFinite(targetD)) {
            dataset.push({ x: s.x, y: targetD });
          }
        }
        r = g.next({ d: dec });
        k += 1;
      }
    }
  }
  return dataset;
}

// 12 -> 16 (tanh) -> 8 (tanh) -> 1 (sigmoid * 0.75 + 0.05) = 12*16+16 + 16*8+8 + 8*1+1 = 353 params
function initModel(seed = 20261126) {
  const rng = new E.SeededRNG(seed);
  const fill = (n, scale) => Array.from({ length: n }, () => (rng.random() * 2 - 1) * scale);
  return {
    arch: [12, 16, 8, 1],
    w1: fill(12 * 16, Math.sqrt(2 / 12)),
    b1: new Array(16).fill(0),
    w2: fill(16 * 8, Math.sqrt(2 / 16)),
    b2: new Array(8).fill(0),
    w3: fill(8, Math.sqrt(2 / 8)),
    b3: [0],
  };
}

function forwardWithCache(m, x) {
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
  const out = 0.05 + 0.75 * sig;
  return { h1, h2, sig, out };
}

function forwardStudent(m, x) {
  return forwardWithCache(m, x).out;
}

function trainModel(dataset, { epochs = 80, batchSize = 64, lr = 0.008 } = {}) {
  const m = initModel(20261126);
  const rng = new E.SeededRNG(9911);
  const keys = ["w1", "b1", "w2", "b2", "w3", "b3"];
  const m1 = {};
  const m2 = {};
  for (const k of keys) {
    m1[k] = new Array(m[k].length).fill(0);
    m2[k] = new Array(m[k].length).fill(0);
  }

  let step = 0;
  const beta1 = 0.9;
  const beta2 = 0.999;
  const eps = 1e-8;
  const idx = Array.from({ length: dataset.length }, (_, i) => i);
  let lastMse = 0;

  for (let ep = 0; ep < epochs; ep++) {
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rng.random() * (i + 1));
      const tmp = idx[i];
      idx[i] = idx[j];
      idx[j] = tmp;
    }

    let lossSum = 0;
    for (let start = 0; start < idx.length; start += batchSize) {
      const end = Math.min(idx.length, start + batchSize);
      const bs = end - start;
      const g = {};
      for (const k of keys) g[k] = new Array(m[k].length).fill(0);

      for (let p = start; p < end; p++) {
        const { x, y } = dataset[idx[p]];
        const { h1, h2, sig, out } = forwardWithCache(m, x);
        const err = out - y;
        lossSum += err * err;

        const dz3 = 2 * err * 0.75 * sig * (1 - sig);
        g.b3[0] += dz3;
        const dh2 = new Array(8);
        for (let k = 0; k < 8; k++) {
          g.w3[k] += dz3 * h2[k];
          dh2[k] = dz3 * m.w3[k] * (1 - h2[k] * h2[k]);
        }

        const dh1 = new Array(16).fill(0);
        for (let k = 0; k < 8; k++) {
          g.b2[k] += dh2[k];
          const off = k * 16;
          for (let j = 0; j < 16; j++) {
            g.w2[off + j] += dh2[k] * h1[j];
            dh1[j] += dh2[k] * m.w2[off + j];
          }
        }

        for (let j = 0; j < 16; j++) {
          const dz1 = dh1[j] * (1 - h1[j] * h1[j]);
          g.b1[j] += dz1;
          const off = j * 12;
          for (let i = 0; i < 12; i++) {
            g.w1[off + i] += dz1 * x[i];
          }
        }
      }

      step += 1;
      const bc1 = 1 - Math.pow(beta1, step);
      const bc2 = 1 - Math.pow(beta2, step);
      for (const k of keys) {
        const arr = m[k];
        const grad = g[k];
        const v1 = m1[k];
        const v2 = m2[k];
        for (let i = 0; i < arr.length; i++) {
          const gi = grad[i] / bs;
          v1[i] = beta1 * v1[i] + (1 - beta1) * gi;
          v2[i] = beta2 * v2[i] + (1 - beta2) * gi * gi;
          const mHat = v1[i] / bc1;
          const vHat = v2[i] / bc2;
          arr[i] -= (lr * mHat) / (Math.sqrt(vHat) + eps);
        }
      }
    }
    lastMse = lossSum / idx.length;
  }

  for (const k of keys) {
    m[k] = m[k].map((v) => Math.round(v * 10000) / 10000);
  }
  const paramCount = keys.reduce((s, k) => s + m[k].length, 0);
  return { model: m, paramCount, finalMse: lastMse };
}

function runStudent(seed, sensitivity, model) {
  const sim = new E.GoliathSim({ ...BASE, quarantine_sensitivity: sensitivity, seed });
  const g = sim._runGen();
  let r = g.next();
  const state = {};
  const log = [];
  let inferMs = 0;

  while (!r.done) {
    const obs = r.value;
    const t0 = performance.now();
    const samples = extractAgentFeatures(obs.agents, obs.t, state);
    const dec = { d: {} };
    for (const s of samples) {
      dec.d[s.id] = forwardStudent(model, s.x);
    }
    inferMs += performance.now() - t0;
    log.push({ t: obs.t, decision: dec.d });
    r = g.next(dec);
  }

  const res = r.value;
  return {
    seed,
    mode: "student_mlp",
    sensitivity,
    extracted: res.extracted,
    tp: res.tp,
    totalChaos: res.totalChaos,
    finalD: res.agentD,
    csi: res.csi[res.steps - 1],
    inferMs,
    log,
  };
}

function evaluateOutOfSample(seeds, sensitivity, model) {
  const ds = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
  const fixedByD = {};
  for (const d of ds) {
    fixedByD[d] = seeds.map((s) => runFixed(s, sensitivity, d));
  }
  const fixedGrid = ds.map((d) => ({
    d,
    ...E.meanSe(fixedByD[d].map((r) => r.extracted)),
  }));
  const oracleEntry = fixedGrid.reduce((a, b) => (b.mean > a.mean ? b : a));

  const studentRuns = seeds.map((s) => runStudent(s, sensitivity, model));
  const teacherRuns = seeds.map((s) => runKovanV2(s, sensitivity));
  const ruleRuns = seeds.map((s) => runRule(s, sensitivity));

  const baseForReplay = { ...BASE, quarantine_sensitivity: sensitivity };
  let replayOk = 0;
  let replayTotal = 0;
  for (const run of [...studentRuns, ...teacherRuns, ...ruleRuns]) {
    replayTotal += 1;
    const x = replay(baseForReplay, run);
    if (x.extracted === run.extracted && x.tp === run.tp) replayOk += 1;
  }

  const ex = (arr) => arr.map((r) => r.extracted);
  const tpRate = (arr) => E.meanSe(arr.map((r) => r.tp / r.totalChaos)).mean;
  const pair = (x, y) => E.meanSe(x.map((v, i) => v - y[i]));

  const S = ex(studentRuns);
  const T = ex(teacherRuns);
  const R = ex(ruleRuns);
  const Gd = ex(fixedByD[0.8]);
  const O = ex(fixedByD[oracleEntry.d]);

  const means = {
    student: E.meanSe(S),
    teacher: E.meanSe(T),
    rule: E.meanSe(R),
    greedy: E.meanSe(Gd),
    oracle: { d: oracleEntry.d, ...E.meanSe(O) },
  };
  const tp = {
    student: tpRate(studentRuns),
    teacher: tpRate(teacherRuns),
    rule: tpRate(ruleRuns),
    greedy: tpRate(fixedByD[0.8]),
    oracle: tpRate(fixedByD[oracleEntry.d]),
  };
  const vsRule = pair(S, R);
  const vsTeacher = pair(S, T);
  const vsGreedy = pair(S, Gd);

  return {
    sensitivity,
    n: seeds.length,
    seedRange: [seeds[0], seeds[seeds.length - 1]],
    replay: { ok: replayOk, total: replayTotal },
    avgInferMs: E.meanSe(studentRuns.map((r) => r.inferMs)).mean,
    means,
    tp,
    diffs: { vsRule, vsTeacher, vsGreedy },
    ratios: {
      vsTeacher: means.student.mean / means.teacher.mean,
      vsRule: means.student.mean / means.rule.mean,
      vsGreedy: means.student.mean / means.greedy.mean,
      vsOracle: means.student.mean / means.oracle.mean,
    },
    beatsRuleSig: vsRule.mean > 0 && vsRule.mean > 2 * vsRule.se,
  };
}

function buildStandaloneHtml(model, evalSummary) {
  const engineSrc = fs.readFileSync(path.join(__dirname, "engine.js"), "utf8");
  const modelJson = JSON.stringify(model);
  const evalJson = JSON.stringify({
    paramCount: evalSummary.paramCount,
    modelBytes: evalSummary.modelBytes,
    primary: evalSummary.primary,
    lax: evalSummary.lax,
    strict: evalSummary.strict,
  });

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>GOLIATH v4.0 — 353 Parametreli Sıfır-GPU Öğrenci Simülatörü</title>
  <style>
    :root { --bg: #0b1020; --card: #131a2e; --border: #253052; --txt: #e6ecff; --mut: #94a3c7; --acc: #38bdf8; --ok: #34d399; --warn: #fbbf24; --bad: #f87171; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: var(--bg); color: var(--txt); padding: 20px; }
    .wrap { max-width: 1020px; margin: 0 auto; }
    h1 { margin: 0 0 6px; font-size: 22px; }
    .sub { color: var(--mut); font-size: 13px; margin-bottom: 16px; }
    .row { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-bottom: 14px; }
    .card { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 14px; }
    label { display: block; font-size: 12px; color: var(--mut); margin-bottom: 4px; }
    input, select, button { font-size: 14px; padding: 8px 10px; border-radius: 7px; border: 1px solid var(--border); background: #0f1628; color: var(--txt); }
    button { background: #0284c7; border-color: #38bdf8; font-weight: 600; cursor: pointer; }
    button:hover { background: #0369a1; }
    .controls { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; }
    .kpi { font-size: 22px; font-weight: 700; margin: 4px 0; }
    .tag { display: inline-block; font-size: 11px; padding: 2px 8px; border-radius: 99px; background: #1e293b; color: var(--acc); }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
    th, td { border-bottom: 1px solid var(--border); padding: 7px 6px; text-align: left; }
    th { color: var(--mut); font-weight: 600; }
    canvas { width: 100%; height: 220px; background: #090e1b; border-radius: 8px; border: 1px solid var(--border); }
  </style>
</head>
<body>
<div class="wrap">
  <h1>GOLIATH v4.0 — Sıfır-GPU Tarayıcı İçi Öğrenci Model (353 Parametre)</h1>
  <div class="sub">İnternet yok, GPU yok, API yok. KOVAN-V2 öğretmeninden damıtılmış <span id="metaBytes"></span> baytlık 3 katmanlı sinir ağı doğrudan tarayıcıda çalışır.</div>

  <div class="card" style="margin-bottom:14px;">
    <div class="controls">
      <div><label>Seed</label><input id="seedInp" type="number" value="11200" min="1" max="999999" /></div>
      <div>
        <label>Dedektör Hassasiyeti (&sigma;)</label>
        <select id="sigmaSel">
          <option value="0.35">0.35 (Gevşek)</option>
          <option value="0.55" selected>0.55 (Varsayılan)</option>
          <option value="0.75">0.75 (Sıkı)</option>
        </select>
      </div>
      <div><button id="runBtn">Koştur &amp; Kıyasla</button></div>
      <div style="margin-left:auto;"><span class="tag" id="timeTag">Hazır</span></div>
    </div>
  </div>

  <div class="row" id="kpiRow"></div>

  <div class="card" style="margin-bottom:14px;">
    <label>80 Adım Boyunca Kümülatif Çalınan Sermaye</label>
    <canvas id="chart" width="960" height="220"></canvas>
  </div>

  <div class="card">
    <label>150 Görünmemiş Seed (11200–11349) Ön-Doğrulama Özeti</label>
    <table id="evalTbl">
      <thead><tr><th>Rejim (&sigma;)</th><th>Öğrenci (353p)</th><th>Öğretmen KOVAN-V2</th><th>KURAL</th><th>Açgözlü (0.8)</th><th>Kâhin</th><th>Öğrenci/Öğretmen</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>
</div>

<script>
const STUDENT_MODEL = ${modelJson};
const EVAL_SUMMARY = ${evalJson};
</script>
<script>
(function(){
  var module = { exports: {} };
  var exports = module.exports;
${engineSrc}
  window.GoliathEngine = module.exports;
})();
</script>
<script>
(function(){
  const E = window.GoliathEngine;
  const BASE = { chaos_ratio: 0.20, infiltration_mode: "random", chaos_particles: ["PARASITE"], decision_epoch: 8, drain_intensity: 0.5 };
  document.getElementById("metaBytes").textContent = String(EVAL_SUMMARY.modelBytes);

  function extractFeatures(rows, t, state) {
    if (!state.scoutSet) {
      const asc = rows.slice().sort((a, b) => a.degree - b.degree || a.id - b.id);
      state.scoutSet = new Set(asc.slice(0, 2).map(a => a.id));
      state.prevStolen = {}; state.prevCut = {}; state.minCutEffD = 1.0; state.anyEverCut = 0;
    }
    let newlyCutCount = 0, activeCount = 0, sumActiveD = 0, maxSafeD = 0;
    const enriched = rows.map(a => {
      const delta = a.stolen - (state.prevStolen[a.id] || 0);
      if (a.cutOff && !state.prevCut[a.id]) {
        newlyCutCount++; state.anyEverCut = 1;
        const effD = (a.d * (1 + 0.5 * a.degree)) / 3.0;
        if (effD < state.minCutEffD) state.minCutEffD = effD;
      }
      if (!a.cutOff) { activeCount++; sumActiveD += a.d; if (delta > 0 && a.d > maxSafeD) maxSafeD = a.d; }
      return { ...a, delta };
    });
    const meanD = activeCount > 0 ? sumActiveD / activeCount : 0;
    const out = [];
    for (const a of enriched) {
      if (!a.cutOff) {
        out.push({ id: a.id, x: [t/80, a.d/0.8, Math.min(a.degree/12,1.5), Math.min(a.delta/2,2), Math.min(a.stolen/8,2), state.scoutSet.has(a.id)?1:0, activeCount/12, newlyCutCount/12, state.anyEverCut, meanD/0.8, maxSafeD/0.8, Math.min(state.minCutEffD/0.8,1.2)] });
      }
      state.prevStolen[a.id] = a.stolen;
      if (a.cutOff) state.prevCut[a.id] = true;
    }
    return out;
  }

  function forward(m, x) {
    const h1 = new Array(16);
    for (let j=0;j<16;j++){ let s=m.b1[j], off=j*12; for(let i=0;i<12;i++) s+=m.w1[off+i]*x[i]; h1[j]=Math.tanh(s); }
    const h2 = new Array(8);
    for (let k=0;k<8;k++){ let s=m.b2[k], off=k*16; for(let j=0;j<16;j++) s+=m.w2[off+j]*h1[j]; h2[k]=Math.tanh(s); }
    let z3 = m.b3[0]; for (let k=0;k<8;k++) z3 += m.w3[k]*h2[k];
    return 0.05 + 0.75 / (1 + Math.exp(-Math.max(-20, Math.min(20, z3))));
  }

  function runStudentSim(seed, sigma) {
    const sim = new E.GoliathSim({ ...BASE, quarantine_sensitivity: sigma, seed });
    const g = sim._runGen();
    let r = g.next();
    const state = {};
    const t0 = performance.now();
    while (!r.done) {
      const obs = r.value;
      const samples = extractFeatures(obs.agents, obs.t, state);
      const dec = { d: {} };
      for (const s of samples) dec.d[s.id] = forward(STUDENT_MODEL, s.x);
      r = g.next(dec);
    }
    return { res: r.value, ms: performance.now() - t0 };
  }

  function runRuleSim(seed, sigma) {
    const sim = new E.GoliathSim({ ...BASE, quarantine_sensitivity: sigma, seed });
    const g = sim._runGen();
    let r = g.next(), G = null;
    const prevS = {}, prevC = {};
    while (!r.done) {
      const obs = r.value;
      if (!G) {
        const sorted = obs.agents.slice().sort((a,b) => b.degree - a.degree || a.id - b.id);
        G = [sorted.slice(0,4).map(x=>x.id), sorted.slice(4,8).map(x=>x.id), sorted.slice(8).map(x=>x.id)];
      }
      const byId = Object.fromEntries(obs.agents.map(a => [a.id, a]));
      const dec = { d: {} };
      for (const grp of G) {
        const rs = grp.map(id => byId[id]);
        const lost = obs.t > 0 && rs.some(a => a.cutOff && !prevC[a.id]);
        for (const a of rs) dec.d[a.id] = obs.t === 0 ? 0.5 : lost ? a.d * 0.7 : Math.min(0.8, a.d * 1.15);
      }
      for (const a of obs.agents) { prevS[a.id] = a.stolen; if (a.cutOff) prevC[a.id] = true; }
      r = g.next(dec);
    }
    return r.value;
  }

  function drawChart(series) {
    const cv = document.getElementById("chart");
    const ctx = cv.getContext("2d");
    const W = cv.width, H = cv.height, pad = 28;
    ctx.clearRect(0, 0, W, H);
    const maxY = Math.max(10, ...series.flatMap(s => Array.from(s.data)));
    ctx.strokeStyle = "#1e293b"; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad + (H - 2 * pad) * (i / 4);
      ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke();
    }
    for (const s of series) {
      ctx.strokeStyle = s.color; ctx.lineWidth = 2.4;
      ctx.beginPath();
      for (let t = 0; t < s.data.length; t++) {
        const x = pad + (W - 2 * pad) * (t / (s.data.length - 1));
        const y = H - pad - (H - 2 * pad) * (s.data[t] / maxY);
        if (t === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    let lx = pad + 8;
    for (const s of series) {
      ctx.fillStyle = s.color; ctx.fillRect(lx, 10, 12, 8);
      ctx.fillStyle = "#cbd5e1"; ctx.font = "12px system-ui"; ctx.fillText(s.label, lx + 16, 18);
      lx += 160;
    }
  }

  function runAll() {
    const seed = Number(document.getElementById("seedInp").value) || 11200;
    const sigma = Number(document.getElementById("sigmaSel").value) || 0.55;
    const st = runStudentSim(seed, sigma);
    const ru = runRuleSim(seed, sigma);
    const gr = new E.GoliathSim({ ...BASE, quarantine_sensitivity: sigma, decision_epoch: 0, drain_intensity: 0.8, seed }).run();
    const orD = sigma >= 0.7 ? 0.2 : 0.3;
    const or = new E.GoliathSim({ ...BASE, quarantine_sensitivity: sigma, decision_epoch: 0, drain_intensity: orD, seed }).run();

    document.getElementById("timeTag").textContent = "Öğrenci Süre: " + st.ms.toFixed(2) + " ms (0 GPU)";
    const cards = [
      { title: "Öğrenci MLP (353p)", val: st.res.extracted.toFixed(1), sub: "TP " + st.res.tp + "/12", col: "#34d399" },
      { title: "KURAL (Adaptif)", val: ru.extracted.toFixed(1), sub: "TP " + ru.tp + "/12", col: "#fbbf24" },
      { title: "Açgözlü (d=0.8)", val: gr.extracted.toFixed(1), sub: "TP " + gr.tp + "/12", col: "#f87171" },
      { title: "Kâhin (d=" + orD + ")", val: or.extracted.toFixed(1), sub: "TP " + or.tp + "/12", col: "#38bdf8" }
    ];
    document.getElementById("kpiRow").innerHTML = cards.map(c =>
      '<div class="card"><label>' + c.title + '</label><div class="kpi" style="color:' + c.col + '">' + c.val + '</div><div class="sub" style="margin:0">' + c.sub + '</div></div>'
    ).join("");

    drawChart([
      { label: "Öğrenci MLP", color: "#34d399", data: st.res.extractedHist },
      { label: "KURAL", color: "#fbbf24", data: ru.extractedHist },
      { label: "Açgözlü 0.8", color: "#f87171", data: gr.extractedHist },
      { label: "Kâhin d=" + orD, color: "#38bdf8", data: or.extractedHist }
    ]);
  }

  const tbody = document.querySelector("#evalTbl tbody");
  for (const s of [EVAL_SUMMARY.lax, EVAL_SUMMARY.primary, EVAL_SUMMARY.strict]) {
    const tr = document.createElement("tr");
    tr.innerHTML = "<td>" + s.sensitivity + "</td>" +
      "<td><b>" + s.means.student.mean.toFixed(2) + "±" + s.means.student.se.toFixed(2) + "</b> (%" + (s.tp.student*100).toFixed(0) + ")</td>" +
      "<td>" + s.means.teacher.mean.toFixed(2) + "±" + s.means.teacher.se.toFixed(2) + " (%" + (s.tp.teacher*100).toFixed(0) + ")</td>" +
      "<td>" + s.means.rule.mean.toFixed(2) + "±" + s.means.rule.se.toFixed(2) + "</td>" +
      "<td>" + s.means.greedy.mean.toFixed(2) + "±" + s.means.greedy.se.toFixed(2) + "</td>" +
      "<td>" + s.means.oracle.mean.toFixed(2) + " (d=" + s.means.oracle.d + ")</td>" +
      "<td>" + (s.ratios.vsTeacher * 100).toFixed(1) + "%</td>";
    tbody.appendChild(tr);
  }

  document.getElementById("runBtn").addEventListener("click", runAll);
  runAll();
})();
</script>
</body>
</html>`;
}

if (require.main === module) {
  const t0 = Date.now();
  const dataset = collectTeacherDataset();
  const trainStart = Date.now();
  const { model, paramCount, finalMse } = trainModel(dataset, { epochs: 80, batchSize: 64, lr: 0.008 });
  const trainMs = Date.now() - trainStart;

  const modelPath = path.join(__dirname, "student-model.json");
  const modelJsonStr = JSON.stringify(model);
  fs.writeFileSync(modelPath, modelJsonStr, "utf8");
  const modelBytes = Buffer.byteLength(modelJsonStr, "utf8");

  const primary = evaluateOutOfSample(rangeSeeds(11200, 50), 0.55, model);
  const lax = evaluateOutOfSample(rangeSeeds(11250, 50), 0.35, model);
  const strict = evaluateOutOfSample(rangeSeeds(11300, 50), 0.75, model);

  const criteria = {
    a_ge90pctTeacher: primary.ratios.vsTeacher >= 0.90,
    b_beatsRuleAll3: primary.beatsRuleSig && lax.beatsRuleSig && strict.beatsRuleSig,
    c_tinyAndFast: modelBytes < 50 * 1024 && primary.avgInferMs < 2.0,
  };

  const evalOut = {
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - t0,
    trainSamples: dataset.length,
    trainMs,
    finalMse,
    paramCount,
    modelBytes,
    primary,
    lax,
    strict,
    criteria,
  };

  fs.writeFileSync(path.join(__dirname, "student-eval.json"), JSON.stringify(evalOut, null, 2), "utf8");
  fs.writeFileSync(
    path.join(__dirname, "goliath-student-v4.html"),
    buildStandaloneHtml(model, evalOut),
    "utf8"
  );

  const fmt = (x) => `${x.mean.toFixed(2)}±${x.se.toFixed(2)}`;
  console.log(
    `TRAINED: samples=${dataset.length}, params=${paramCount}, modelBytes=${modelBytes}B, mse=${finalMse.toFixed(5)}, trainMs=${trainMs}`
  );
  for (const [label, s] of [
    ["PRIMARY (0.55, 11200-11249)", primary],
    ["LAX     (0.35, 11250-11299)", lax],
    ["STRICT  (0.75, 11300-11349)", strict],
  ]) {
    console.log(
      `${label} | replay ${s.replay.ok}/${s.replay.total} | infer=${s.avgInferMs.toFixed(3)}ms/run | ` +
        `STUDENT ${fmt(s.means.student)} (TP %${(s.tp.student * 100).toFixed(1)}) | ` +
        `TEACHER ${fmt(s.means.teacher)} (TP %${(s.tp.teacher * 100).toFixed(1)}) | ` +
        `KURAL ${fmt(s.means.rule)} | ratioTeacher=${(s.ratios.vsTeacher * 100).toFixed(1)}% | vsRule=${fmt(s.diffs.vsRule)}`
    );
  }
  console.log("CRITERIA:", JSON.stringify(criteria));
}

module.exports = { extractAgentFeatures, forwardStudent, runStudent, evaluateOutOfSample };
