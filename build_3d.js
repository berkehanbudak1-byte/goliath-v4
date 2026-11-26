"use strict";

// GOLIATH v4.0 Sıfır-GPU 3 Boyutlu (3D) Etkileşimli Simülatör Derleyicisi
// Çalıştırma: node build_3d.js
// Çıktılar: goliath-3d.html ve goliath-student-v4.html

const fs = require("fs");
const path = require("path");

function safeInlineJson(obj) {
  return JSON.stringify(obj).replace(/<\/script/gi, "<\\/script");
}

function build3dHtml() {
  const engineSrc = fs
    .readFileSync(path.join(__dirname, "engine.js"), "utf8")
    .replace(/<\/script/gi, "<\\/script");
  const studentModel = JSON.parse(
    fs.readFileSync(path.join(__dirname, "student-model.json"), "utf8")
  );
  const evalSummary = JSON.parse(
    fs.readFileSync(path.join(__dirname, "student-eval.json"), "utf8")
  );
  const goliath3bSummary = JSON.parse(
    fs.readFileSync(path.join(__dirname, "goliath-3b-eval.json"), "utf8")
  );
  const kalkanSummary = JSON.parse(
    fs.readFileSync(path.join(__dirname, "kalkan-v2-results.json"), "utf8")
  );
  const kalkanJson = safeInlineJson({
    clusters: kalkanSummary.clusters.map((c) => ({
      name: c.name,
      sensitivity: c.sensitivity,
      replay: c.replay,
      baseline: {
        kv2: c.detectors.baseline.kovan_v2.extracted,
        stu: c.detectors.baseline.student_353p.extracted,
      },
      kalkan_full: {
        kv2: c.detectors.kalkan_full.kovan_v2.extracted,
        stu: c.detectors.kalkan_full.student_353p.extracted,
      },
      kalkan_v2: {
        kv2: c.detectors.kalkan_v2.kovan_v2.extracted,
        kv2Tp: c.detectors.kalkan_v2.kovan_v2.tpRate.mean,
        stu: c.detectors.kalkan_v2.student_353p.extracted,
        stuTp: c.detectors.kalkan_v2.student_353p.tpRate.mean,
        cleanFp: c.detectors.kalkan_v2.cleanFp.mean,
      },
      reductions: c.reductions,
    })),
    criteria: kalkanSummary.criteria,
  });

  const modelJson = safeInlineJson(studentModel);
  const evalJson = safeInlineJson({
    paramCount: evalSummary.paramCount,
    modelBytes: evalSummary.modelBytes,
    primary: evalSummary.primary,
    lax: evalSummary.lax,
    strict: evalSummary.strict,
  });
  const g3bJson = safeInlineJson({
    model: goliath3bSummary.model,
    seeds: goliath3bSummary.seeds,
    sensitivity: goliath3bSummary.sensitivity,
    replay: goliath3bSummary.replay,
    stats: goliath3bSummary.stats,
    tp: goliath3bSummary.tp,
    callStats: {
      goliath3bFlat: {
        total: goliath3bSummary.callStats.goliath3bFlat.total,
        bad: goliath3bSummary.callStats.goliath3bFlat.bad,
        avgMs: goliath3bSummary.callStats.goliath3bFlat.avgMs,
      },
      goliath3bKovan: {
        total: goliath3bSummary.callStats.goliath3bKovan.total,
        bad: goliath3bSummary.callStats.goliath3bKovan.bad,
        avgMs: goliath3bSummary.callStats.goliath3bKovan.avgMs,
      },
    },
    anyLeakage: goliath3bSummary.anyLeakage,
  });

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>GOLIATH v4.0 — Etkileşimli 3B Ağ &amp; Öğrenci Simülatörü</title>
  <style>
    :root {
      --bg: #070b17;
      --bg2: #0d1426;
      --card: #11192f;
      --border: #233053;
      --txt: #e6ecff;
      --mut: #94a3c7;
      --acc: #38bdf8;
      --ok: #34d399;
      --warn: #fbbf24;
      --bad: #f87171;
      --purp: #c084fc;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      background: radial-gradient(circle at top center, #111c3a 0%, var(--bg) 62%);
      color: var(--txt);
      padding: 18px;
    }
    .wrap { max-width: 1180px; margin: 0 auto; }
    h1 { margin: 0 0 4px; font-size: 22px; letter-spacing: -0.01em; }
    .sub { color: var(--mut); font-size: 13px; margin-bottom: 14px; }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 14px;
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.35);
    }
    label { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--mut); margin-bottom: 5px; }
    input, select, button {
      font-size: 13px;
      padding: 7px 11px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: #0c1324;
      color: var(--txt);
    }
    input[type="number"] { width: 96px; }
    button {
      background: #17233f;
      cursor: pointer;
      transition: background 0.14s ease, border-color 0.14s ease, transform 0.08s ease;
    }
    button:hover { background: #1e2e52; border-color: #3b558f; }
    button.primary { background: #0284c7; border-color: #38bdf8; font-weight: 600; color: #f0f9ff; }
    button.primary:hover { background: #0369a1; }
    button.pill { border-radius: 999px; font-size: 12px; padding: 6px 12px; font-weight: 600; }
    button.pill.active {
      background: rgba(56, 189, 248, 0.18);
      border-color: #38bdf8;
      color: #e0f2fe;
      box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.25);
    }
    .controls { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; }
    .chk-wrap { display: flex; align-items: center; gap: 7px; padding: 7px 10px; border: 1px solid var(--border); border-radius: 8px; background: #0c1324; font-size: 13px; cursor: pointer; }
    .chk-wrap input { padding: 0; margin: 0; accent-color: #38bdf8; }
    .tag {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      padding: 4px 10px;
      border-radius: 999px;
      background: #18233f;
      border: 1px solid #2b3c66;
      color: var(--acc);
      font-weight: 600;
    }
    .ctrl-tabs { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 10px; }
    .stage-wrap {
      position: relative;
      border-radius: 10px;
      overflow: hidden;
      border: 1px solid #223055;
      background: radial-gradient(circle at 50% 42%, #0e1730 0%, #050811 100%);
    }
    #scene3d {
      display: block;
      width: 100%;
      height: 540px;
      cursor: grab;
      touch-action: none;
    }
    #scene3d:active { cursor: grabbing; }
    .hud-tl {
      position: absolute;
      top: 12px;
      left: 12px;
      background: rgba(7, 11, 23, 0.78);
      backdrop-filter: blur(6px);
      border: 1px solid rgba(56, 189, 248, 0.25);
      border-radius: 10px;
      padding: 10px 12px;
      pointer-events: none;
      min-width: 240px;
      font-size: 12px;
    }
    .hud-title { font-weight: 700; font-size: 13px; color: #e0f2fe; margin-bottom: 5px; }
    .hud-grid { display: grid; grid-template-columns: repeat(2, auto); gap: 3px 14px; font-variant-numeric: tabular-nums; }
    .hud-k { color: var(--mut); }
    .hud-v { color: var(--txt); font-weight: 600; text-align: right; }
    .inspector {
      position: absolute;
      top: 12px;
      right: 12px;
      width: 245px;
      background: rgba(7, 11, 23, 0.84);
      backdrop-filter: blur(6px);
      border: 1px solid rgba(148, 163, 199, 0.28);
      border-radius: 10px;
      padding: 10px 12px;
      font-size: 12px;
      pointer-events: none;
    }
    .legend-bar {
      position: absolute;
      left: 12px;
      right: 12px;
      bottom: 10px;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
      background: rgba(7, 11, 23, 0.75);
      border: 1px solid rgba(35, 48, 83, 0.9);
      border-radius: 8px;
      padding: 6px 10px;
      font-size: 11px;
      color: var(--mut);
      pointer-events: none;
    }
    .leg-item { display: inline-flex; align-items: center; gap: 5px; }
    .dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid var(--border);
    }
    .slider-wrap { display: flex; align-items: center; gap: 8px; flex: 1 1 220px; min-width: 190px; }
    #stepSlider { width: 100%; padding: 0; accent-color: #38bdf8; cursor: pointer; }
    .btn-group { display: inline-flex; flex-wrap: wrap; gap: 5px; align-items: center; }
    .row { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; margin: 14px 0; }
    .kpi { font-size: 23px; font-weight: 700; margin: 3px 0; font-variant-numeric: tabular-nums; }
    .two-col { display: grid; grid-template-columns: 1.25fr 1fr; gap: 14px; margin-bottom: 14px; }
    @media (max-width: 920px) { .two-col { grid-template-columns: 1fr; } .inspector { display: none; } }
    #chart { width: 100%; height: 240px; display: block; background: #080d1c; border-radius: 8px; border: 1px solid var(--border); cursor: pointer; }
    table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-top: 6px; font-variant-numeric: tabular-nums; }
    th, td { border-bottom: 1px solid var(--border); padding: 7px 6px; text-align: left; }
    th { color: var(--mut); font-weight: 600; }
    .mini-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-top: 8px; }
    .mini-box { background: #0b1122; border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; }
    .mini-box b { font-size: 15px; display: block; margin-top: 2px; }
  </style>
</head>
<body>
<div class="wrap">
  <h1>GOLIATH v4.0 — Etkileşimli 3B Ağ Simülatörü &amp; Sıfır-GPU Öğrenci (353p)</h1>
  <div class="sub">
    İnternet yok, WebGL/GPU bağımlılığı yok, dış CDN yok. <b><span id="metaBytes"></span> bayt</b>lık 353 parametreli öğrenci MLP ve tam GOLIATH v4.0 çekirdeği doğrudan tarayıcıda gerçek-zamanlı 3B olarak çalışır.
  </div>

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
      <div>
        <label>Savunma Kalkanı</label>
        <select id="detModeSel">
          <option value="kalkan_v2" selected>H-KALKAN v2 (Derece-Drift)</option>
          <option value="kalkan_full">H-KALKAN v1 (Abs+Derece+Drift)</option>
          <option value="baseline">Standart Kör Dedektör (v4.0)</option>
          <option value="kalkan_drift">Sadece Drift Kesimi</option>
          <option value="kalkan_deg">Sadece Derece Kesimi</option>
        </select>
      </div>
      <div>
        <label>Topoloji</label>
        <select id="topoSel">
          <option value="adaptive_hierarchy" selected>Hiyerarşik (L0/L1/L2)</option>
          <option value="scale_free">Ölçeksiz (Scale-Free)</option>
        </select>
      </div>
      <div>
        <label>Parçacık Rejimi</label>
        <select id="partSel">
          <option value="PARASITE" selected>PARASITE (Tek Tip)</option>
          <option value="sm">SM-17 (Standart Model)</option>
        </select>
      </div>
      <label class="chk-wrap"><input id="quarChk" type="checkbox" checked /> Karantina Etkin</label>
      <div><button id="runBtn" class="primary">Koştur &amp; 3B Yenile</button></div>
      <div style="margin-left:auto;"><span class="tag" id="timeTag">Hazır</span></div>
    </div>
  </div>

  <div class="card" style="margin-bottom:14px;">
    <div class="ctrl-tabs" id="ctrlTabs">
      <span style="font-size:12px;color:var(--mut);margin-right:4px;">3B Sürü Kontrolcüsü:</span>
      <button class="pill active" data-ctrl="student">Öğrenci MLP (353p)</button>
      <button class="pill" data-ctrl="kovan_v2">KOVAN-V2 (Öğretmen)</button>
      <button class="pill" data-ctrl="rule">KURAL (Adaptif)</button>
      <button class="pill" data-ctrl="greedy">Açgözlü (0.8)</button>
      <button class="pill" data-ctrl="oracle">Kâhin</button>
    </div>

    <div class="stage-wrap">
      <canvas id="scene3d"></canvas>
      <div class="hud-tl" id="hudPanel">
        <div class="hud-title" id="hudCtrl">Öğrenci MLP (353p)</div>
        <div class="hud-grid">
          <span class="hud-k">Adım</span><span class="hud-v" id="hudStep">0 / 79</span>
          <span class="hud-k">CSI (Sağlamlık)</span><span class="hud-v" id="hudCsi">1.000</span>
          <span class="hud-k">Çalınan Sermaye</span><span class="hud-v" id="hudExt">0.00</span>
          <span class="hud-k">Karantina / TP / FP</span><span class="hud-v" id="hudQuar">0 (TP 0/12)</span>
          <span class="hud-k">Savunma Kalkanı</span><span class="hud-v" id="hudDet">H-KALKAN v2</span>
          <span class="hud-k">Boğaz (L0) / Bypass</span><span class="hud-v" id="hudBypass">—</span>
          <span class="hud-k">Katenoid Gerilim</span><span class="hud-v" id="hudTension">—</span>
          <span class="hud-k">Z-Pinch r<sub>s</sub> / Basınç</span><span class="hud-v" id="hudPinch">—</span>
          <span class="hud-k">Öğrenci Hız</span><span class="hud-v" id="hudMs">0.00 ms</span>
        </div>
      </div>
      <div class="inspector" id="inspector">
        <div style="font-weight:700;color:#e0f2fe;margin-bottom:4px;">Düğüm İnceleyici</div>
        <div style="color:var(--mut);line-height:1.4;">Fareyle bir kürenin üzerine gel veya tıkla; 1-atlamalı 3B bağlantıları ve canlı <i>d(t)</i> hızını gör. Sürükle: döndür · Tekerlek: yakınlaş.</div>
      </div>
      <div class="legend-bar">
        <span class="leg-item"><span class="dot" style="background:#10b981"></span>Sağlıklı</span>
        <span class="leg-item"><span class="dot" style="background:#f59e0b"></span>Baskı altında</span>
        <span class="leg-item"><span class="dot" style="background:#f43f5e"></span>Aktif Parazit</span>
        <span class="leg-item"><span class="dot" style="background:transparent;border:2px solid #38bdf8"></span>Öncü (Scout)</span>
        <span class="leg-item"><span class="dot" style="background:transparent;border:2px solid #c084fc"></span>3B Karantina</span>
        <span class="leg-item"><span class="dot" style="background:#fbbf24"></span>Katman Bypass (L0 dışı)</span>
        <span class="leg-item"><span class="dot" style="background:#fb7185;box-shadow:0 0 6px #fb7185"></span>Kıvılcım</span>
      </div>
    </div>

    <div class="toolbar">
      <button id="playBtn" class="primary" style="min-width:110px;">⏸ Duraklat</button>
      <div class="slider-wrap">
        <span style="font-size:12px;color:var(--mut);white-space:nowrap;">t=<b id="stepTxt">0</b></span>
        <input id="stepSlider" type="range" min="0" max="79" value="0" />
      </div>
      <select id="speedSel" title="Oynatma hızı">
        <option value="0.5">0.5x Hız</option>
        <option value="1" selected>1x Hız</option>
        <option value="2">2x Hız</option>
      </select>
      <div class="btn-group" id="layoutBtns">
        <button class="pill active" data-layout="wormhole">Einstein–Rosen</button>
        <button class="pill" data-layout="tower">Kule</button>
        <button class="pill" data-layout="atom">Atom Küre</button>
        <button class="pill" data-layout="force">3D Kuvvet</button>
      </div>
      <div class="btn-group">
        <button class="pill" data-cam="iso">İzometrik</button>
        <button class="pill" data-cam="top">Üstten</button>
        <button class="pill" data-cam="side">Yandan</button>
        <button class="pill" data-cam="reset">Sıfırla</button>
        <button class="pill active" id="orbitBtn">Oto-Döndür</button>
      </div>
    </div>
    <div class="toolbar" style="margin-top:8px;padding-top:8px;">
      <span style="font-size:11.5px;color:var(--mut);">Yüzey Profili:</span>
      <div class="btn-group" id="surfaceBtns">
        <button class="pill active" data-surface="flamm">Flamm (E-R)</button>
        <button class="pill" data-surface="catenoid">Katenoid</button>
        <button class="pill" data-surface="hyperboloid">Hiperboloid</button>
      </div>
      <div class="btn-group" style="margin-left:auto;">
        <button class="pill active" id="pinchBtn">Z-Pinch + de Sitter</button>
        <button class="pill active" id="helixBtn">Çift Regle Sarmal</button>
        <button class="pill active" id="bypassBtn">Bypass Vurgula</button>
      </div>
    </div>
  </div>

  <div class="row" id="kpiRow"></div>

  <div class="two-col">
    <div class="card">
      <label>80 Adım Boyunca Kümülatif Çalınan Sermaye (3B Zaman Çizgisine Tıklayarak Atla)</label>
      <canvas id="chart" width="660" height="240"></canvas>
    </div>
    <div class="card">
      <label>Yerel 3.1B Model Özeti (goliath-3b:latest · RTX 3050 %100 GPU)</label>
      <div class="sub" style="margin-bottom:6px;">
        <code>9700–9703</code> tohumlarında (<span id="g3bModelName"></span>, 1.9 GB Q4_K_M, replay <span id="g3bReplay"></span>):
      </div>
      <div class="mini-grid" id="g3bGrid"></div>
      <div class="sub" style="margin:8px 0 0;font-size:11.5px;">
        İskelesiz saf <code>GOLIATH-3B FLAT</code>, önceki ham 3B tabanını (+136%) ve 120B bulut ATOM referansını (<span id="g3bCloud"></span>) geçti.
      </div>
    </div>
  </div>

  <div class="card">
    <label>150 Görünmemiş Seed (11200–11349) Ön-Doğrulama Özeti (H-DISTILL)</label>
    <table id="evalTbl">
      <thead><tr><th>Rejim (&sigma;)</th><th>Öğrenci (353p)</th><th>Öğretmen KOVAN-V2</th><th>KURAL</th><th>Açgözlü (0.8)</th><th>Kâhin</th><th>Öğrenci/Öğretmen</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>

  <div class="card" style="margin-top:14px;">
    <label>150 Yeni Seed (12200–12349) Kör Savunma Sınaması (H-KALKAN-V2 · 450/450 Replay)</label>
    <table id="kalkanTbl">
      <thead><tr><th>Rejim (&sigma;)</th><th>Baseline (KV2 / 353p)</th><th>H-KALKAN v1 (KV2 / 353p)</th><th>H-KALKAN v2 KV2 (TP)</th><th>H-KALKAN v2 353p (TP)</th><th>Temiz Ağ FP</th><th>Çalım Düşüşü</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>
</div>

<script>
const STUDENT_MODEL = ${modelJson};
const EVAL_SUMMARY = ${evalJson};
const GOLIATH3B_SUMMARY = ${g3bJson};
const KALKAN_SUMMARY = ${kalkanJson};
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
  document.getElementById("metaBytes").textContent = String(EVAL_SUMMARY.modelBytes);

  const CTRL_LABELS = {
    student: "Öğrenci MLP (353p)",
    kovan_v2: "KOVAN-V2 (Öğretmen)",
    rule: "KURAL (Adaptif)",
    greedy: "Açgözlü (d=0.8)",
    oracle: "Kâhin"
  };
  const CTRL_COLORS = {
    student: "#34d399",
    kovan_v2: "#a78bfa",
    rule: "#fbbf24",
    greedy: "#f87171",
    oracle: "#38bdf8"
  };

  function getBaseConfig() {
    const seed = Math.max(1, Math.floor(Number(document.getElementById("seedInp").value) || 11200));
    const sigma = Number(document.getElementById("sigmaSel").value) || 0.55;
    const detector_mode = document.getElementById("detModeSel")?.value || "kalkan_v2";
    const topology = document.getElementById("topoSel").value || "adaptive_hierarchy";
    const partVal = document.getElementById("partSel").value || "PARASITE";
    const quarantine_enabled = document.getElementById("quarChk").checked;
    return {
      seed,
      topology,
      chaos_ratio: 0.20,
      infiltration_mode: "random",
      chaos_particles: partVal === "sm" ? "sm" : ["PARASITE"],
      quarantine_enabled,
      quarantine_sensitivity: sigma,
      detector_mode,
      decision_epoch: 8,
      drain_intensity: 0.5,
      recordSnapshots: true
    };
  }

  function buildStepD(steps, epochLog, fallbackD) {
    const out = new Array(steps);
    let idx = 0;
    let cur = {};
    for (let t = 0; t < steps; t++) {
      while (idx < epochLog.length && epochLog[idx].t <= t) {
        cur = epochLog[idx].d || cur;
        idx++;
      }
      out[t] = cur || fallbackD || {};
    }
    return out;
  }

  // 12 blind features matching distill_student.js
  function extractFeatures(rows, t, state) {
    if (!state.scoutSet) {
      const asc = rows.slice().sort((a, b) => a.degree - b.degree || a.id - b.id);
      const nScouts = Math.min(2, asc.length);
      state.scoutIds = asc.slice(0, nScouts).map(a => a.id);
      state.scoutSet = new Set(state.scoutIds);
      state.prevStolen = {};
      state.prevCut = {};
      state.minCutEffD = 1.0;
      state.anyEverCut = 0;
    }
    let newlyCutCount = 0, activeCount = 0, sumActiveD = 0, maxSafeD = 0;
    const enriched = rows.map(a => {
      const delta = a.stolen - (state.prevStolen[a.id] || 0);
      if (a.cutOff && !state.prevCut[a.id]) {
        newlyCutCount++;
        state.anyEverCut = 1;
        const effD = (a.d * (1 + 0.5 * a.degree)) / 3.0;
        if (effD < state.minCutEffD) state.minCutEffD = effD;
      }
      if (!a.cutOff) {
        activeCount++;
        sumActiveD += a.d;
        if (delta > 0 && a.d > maxSafeD) maxSafeD = a.d;
      }
      return { ...a, delta };
    });
    const meanD = activeCount > 0 ? sumActiveD / activeCount : 0;
    const out = [];
    for (const a of enriched) {
      if (!a.cutOff) {
        out.push({
          id: a.id,
          x: [
            t / 80,
            a.d / 0.8,
            Math.min(a.degree / 12, 1.5),
            Math.min(a.delta / 2, 2),
            Math.min(a.stolen / 8, 2),
            state.scoutSet.has(a.id) ? 1 : 0,
            activeCount / 12,
            newlyCutCount / 12,
            state.anyEverCut,
            meanD / 0.8,
            maxSafeD / 0.8,
            Math.min(state.minCutEffD / 0.8, 1.2)
          ]
        });
      }
      state.prevStolen[a.id] = a.stolen;
      if (a.cutOff) state.prevCut[a.id] = true;
    }
    return out;
  }

  function forward(m, x) {
    const h1 = new Array(16);
    for (let j = 0; j < 16; j++) {
      let s = m.b1[j], off = j * 12;
      for (let i = 0; i < 12; i++) s += m.w1[off + i] * x[i];
      h1[j] = Math.tanh(s);
    }
    const h2 = new Array(8);
    for (let k = 0; k < 8; k++) {
      let s = m.b2[k], off = k * 16;
      for (let j = 0; j < 16; j++) s += m.w2[off + j] * h1[j];
      h2[k] = Math.tanh(s);
    }
    let z3 = m.b3[0];
    for (let k = 0; k < 8; k++) z3 += m.w3[k] * h2[k];
    return 0.05 + 0.75 / (1 + Math.exp(-Math.max(-20, Math.min(20, z3))));
  }

  function runStudentSim(cfg) {
    const sim = new E.GoliathSim(cfg);
    const g = sim._runGen();
    let r = g.next();
    const state = {};
    const epochLog = [];
    let lastD = {};
    let inferMs = 0;
    while (!r.done) {
      const obs = r.value;
      const t0 = performance.now();
      const samples = extractFeatures(obs.agents, obs.t, state);
      const dMap = { ...lastD };
      for (const s of samples) dMap[s.id] = forward(STUDENT_MODEL, s.x);
      inferMs += performance.now() - t0;
      lastD = dMap;
      epochLog.push({ t: obs.t, d: dMap });
      r = g.next({ d: dMap });
    }
    const res = r.value;
    return {
      key: "student",
      label: CTRL_LABELS.student,
      res,
      scoutIds: state.scoutIds || [],
      dByStep: buildStepD(res.steps, epochLog),
      inferMs
    };
  }

  function runKovanV2Sim(cfg) {
    const K_REF = 4, DEG_ALPHA = 0.5, RAMP_BETA = 0.20, RAMP_CAP = 3.0;
    const INIT_HIVE_FLUX = 0.18, INIT_SCOUT_FLUXES = [0.26, 0.38];
    const degFactor = deg => (1 + DEG_ALPHA * deg) / (1 + DEG_ALPHA * K_REF);
    const rampFactor = (deg, stolen, freeze) => {
      if (freeze) return 1.0;
      const w = (DEG_ALPHA * deg) / (1 + DEG_ALPHA * deg);
      return 1 + RAMP_BETA * w * Math.min(Math.max(0, stolen), RAMP_CAP);
    };
    const fluxToD = (flux, deg, stolen, freeze) =>
      Math.max(0.05, Math.min(0.8, (flux / degFactor(deg)) * rampFactor(deg, stolen, freeze)));

    const sim = new E.GoliathSim(cfg);
    const g = sim._runGen();
    let r = g.next();
    let scoutIds = [], scoutSet = new Set();
    let hiveFlux = INIT_HIVE_FLUX, fluxCeil = Infinity, cooldown = 0;
    const prevStolen = {}, prevCut = {}, prevRamp = {};
    const epochLog = [];

    while (!r.done) {
      const obs = r.value;
      const rows = obs.agents.map(a => ({ ...a, delta: a.stolen - (prevStolen[a.id] || 0) }));
      const decD = {};
      if (obs.t === 0) {
        const asc = rows.slice().sort((a, b) => a.degree - b.degree || a.id - b.id);
        scoutIds = asc.slice(0, Math.min(2, asc.length)).map(a => a.id);
        scoutSet = new Set(scoutIds);
        for (const a of rows) {
          const sIdx = scoutIds.indexOf(a.id);
          const f = sIdx !== -1 ? INIT_SCOUT_FLUXES[sIdx] : hiveFlux;
          const rf = rampFactor(a.degree, a.stolen, false);
          prevRamp[a.id] = rf;
          decD[a.id] = Math.max(0.05, Math.min(0.8, (f / degFactor(a.degree)) * rf));
        }
      } else {
        let anyNewlyCut = false, bestScoutSafeFlux = 0;
        const dancers = [];
        for (const a of rows) {
          const newlyCut = a.cutOff && !prevCut[a.id];
          const usedRamp = prevRamp[a.id] || 1.0;
          const effFlux = (a.d * degFactor(a.degree)) / usedRamp;
          if (newlyCut) {
            anyNewlyCut = true;
            fluxCeil = Math.min(fluxCeil, 0.88 * effFlux);
          } else if (!a.cutOff && a.delta > 0) {
            if (scoutSet.has(a.id)) bestScoutSafeFlux = Math.max(bestScoutSafeFlux, effFlux);
            dancers.push({ flux: effFlux, weight: a.delta * (scoutSet.has(a.id) ? 1.5 : 1.0) });
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
          const bestSafe = Math.max(bestScoutSafeFlux, danceFlux);
          hiveFlux = Math.min(fluxCeil * 0.90, Math.max(hiveFlux * 1.25, bestSafe * 0.92));
          if (cooldown > 0) cooldown--;
        }
        hiveFlux = Math.max(0.10, Math.min(1.40, hiveFlux));
        const activeScouts = scoutIds.filter(id => {
          const a = rows.find(x => x.id === id);
          return a && !a.cutOff;
        });
        const freezeRamp = cooldown > 0;
        const probeMults = fluxCeil === Infinity ? [1.35, 1.70] : [0.95, 1.00];
        for (const a of rows) {
          const sPos = activeScouts.indexOf(a.id);
          let targetFlux = hiveFlux;
          if (sPos !== -1) {
            const mult = probeMults[Math.min(sPos, probeMults.length - 1)];
            targetFlux = fluxCeil === Infinity ? Math.min(1.40, hiveFlux * mult) : Math.min(hiveFlux * mult, fluxCeil * 0.92);
          }
          const rf = rampFactor(a.degree, a.stolen, freezeRamp);
          prevRamp[a.id] = rf;
          decD[a.id] = fluxToD(targetFlux, a.degree, a.stolen, freezeRamp);
        }
      }
      for (const a of rows) { prevStolen[a.id] = a.stolen; if (a.cutOff) prevCut[a.id] = true; }
      epochLog.push({ t: obs.t, d: decD });
      r = g.next({ d: decD });
    }
    const res = r.value;
    return {
      key: "kovan_v2",
      label: CTRL_LABELS.kovan_v2,
      res,
      scoutIds,
      dByStep: buildStepD(res.steps, epochLog),
      inferMs: 0
    };
  }

  function runRuleSim(cfg) {
    const sim = new E.GoliathSim(cfg);
    const g = sim._runGen();
    let r = g.next(), groups = null;
    const prevC = {};
    const epochLog = [];
    while (!r.done) {
      const obs = r.value;
      if (!groups) {
        const sorted = obs.agents.slice().sort((a, b) => b.degree - a.degree || a.id - b.id);
        const chunk = Math.max(1, Math.ceil(sorted.length / 3));
        groups = [
          sorted.slice(0, chunk).map(x => x.id),
          sorted.slice(chunk, 2 * chunk).map(x => x.id),
          sorted.slice(2 * chunk).map(x => x.id)
        ].filter(x => x.length > 0);
      }
      const byId = Object.fromEntries(obs.agents.map(a => [a.id, a]));
      const decD = {};
      for (const grp of groups) {
        const rs = grp.map(id => byId[id]);
        const lost = obs.t > 0 && rs.some(a => a.cutOff && !prevC[a.id]);
        for (const a of rs) decD[a.id] = obs.t === 0 ? 0.5 : lost ? Math.max(0.05, a.d * 0.7) : Math.min(0.8, a.d * 1.15);
      }
      for (const a of obs.agents) if (a.cutOff) prevC[a.id] = true;
      epochLog.push({ t: obs.t, d: decD });
      r = g.next({ d: decD });
    }
    const res = r.value;
    return {
      key: "rule",
      label: CTRL_LABELS.rule,
      res,
      scoutIds: [],
      dByStep: buildStepD(res.steps, epochLog),
      inferMs: 0
    };
  }

  function runFixedSim(cfg, key, dVal) {
    const sim = new E.GoliathSim({ ...cfg, decision_epoch: 0, drain_intensity: dVal });
    const res = sim.run();
    const row = {};
    for (const id of res.agents) row[id] = dVal;
    const dByStep = Array.from({ length: res.steps }, () => row);
    return {
      key,
      label: key === "oracle" ? "Kâhin (d=" + dVal + ")" : "Açgözlü (d=" + dVal + ")",
      res,
      scoutIds: [],
      dByStep,
      inferMs: 0
    };
  }

  // Unified Geometric & Physics Manifold Helpers
  const WH_RS = 0.44, WH_YFLAT = 1.38, WH_LAM = 0.72, WH_GRID_EXT = 2.85, WH_RRIM = 2.28, WH_YMAX = 1.28;

  function surfaceY(r, rsNow, yScaleNow, profile) {
    if (r <= rsNow) return 0;
    if (profile === "catenoid") {
      const yMax = WH_YMAX * yScaleNow;
      const a = yMax / Math.acosh(Math.max(1.06, WH_RRIM / rsNow));
      return a * Math.acosh(Math.max(1.0, r / rsNow));
    }
    if (profile === "hyperboloid") {
      const yMax = WH_YMAX * yScaleNow;
      const c = (WH_RRIM * WH_RRIM - rsNow * rsNow) / (yMax * yMax);
      return Math.sqrt(Math.max(0, (r * r - rsNow * rsNow) / Math.max(1e-6, c)));
    }
    return (WH_YFLAT * yScaleNow) * Math.tanh(Math.sqrt(r - rsNow) / WH_LAM);
  }

  function surfaceR(y, rsNow, yScaleNow, profile) {
    if (profile === "catenoid") {
      const yMax = WH_YMAX * yScaleNow;
      const a = yMax / Math.acosh(Math.max(1.06, WH_RRIM / rsNow));
      return rsNow * Math.cosh(Math.abs(y) / a);
    }
    if (profile === "hyperboloid") {
      const yMax = WH_YMAX * yScaleNow;
      const c = (WH_RRIM * WH_RRIM - rsNow * rsNow) / (yMax * yMax);
      return Math.sqrt(rsNow * rsNow + c * y * y);
    }
    const yFlat = WH_YFLAT * yScaleNow;
    const a = Math.min(0.985, Math.abs(y) / yFlat);
    const u = 0.5 * Math.log((1 + a) / (1 - a));
    return rsNow + (WH_LAM * u) * (WH_LAM * u);
  }

  function surfaceGeodesic(pA, pB, u, rsNow, yScaleNow, profile, isBypass) {
    const angA = Math.atan2(pA.z, pA.x), angB = Math.atan2(pB.z, pB.x);
    const dAng = Math.atan2(Math.sin(angB - angA), Math.cos(angB - angA));
    const ang = angA + dAng * u;
    const y = pA.y + (pB.y - pA.y) * u;
    let r;
    if (isBypass) {
      r = surfaceR(y, rsNow, yScaleNow, profile) + 0.36 * Math.sin(Math.PI * u);
    } else if (Math.abs(pA.y - pB.y) < 0.08) {
      const rA = Math.hypot(pA.x, pA.z), rB = Math.hypot(pB.x, pB.z);
      r = rA + (rB - rA) * u;
      if (Math.abs(pA.y) > 0.2) r *= (1 - 0.06 * Math.sin(Math.PI * u));
    } else {
      r = surfaceR(y, rsNow, yScaleNow, profile);
    }
    return { x: r * Math.cos(ang), y, z: r * Math.sin(ang) };
  }

  // Methodology 1: Balanced Kernighan-Lin Min-Cut partitioning to eliminate artificial L0 bypasses
  function computeMinCutHemispheres(res, layerOf) {
    const n = res.degrees.length;
    const adj = res.adj;
    const buckets = [[], [], []];
    for (let i = 0; i < n; i++) buckets[layerOf[i]].push(i);

    const auditSplit = hArr => {
      let thruL0 = 0, sameHemi = 0, bypassCount = 0;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          if (adj[i][j] === 0) continue;
          if (layerOf[i] === 0 || layerOf[j] === 0) thruL0++;
          else if (hArr[i] === hArr[j]) sameHemi++;
          else bypassCount++;
        }
      }
      return { thruL0, sameHemi, bypassCount };
    };

    // Baseline alternating k%2 split for comparison
    const naiveHemi = new Int8Array(n);
    buckets[1].forEach((id, k) => { naiveHemi[id] = k % 2 ? -1 : 1; });
    buckets[2].forEach((id, k) => { naiveHemi[id] = k % 2 ? -1 : 1; });
    const naiveStats = auditSplit(naiveHemi);

    // Topological balanced initialization + KL swap minimization
    const hemi = new Int8Array(n);
    const half1 = Math.ceil(buckets[1].length / 2);
    buckets[1].forEach((id, k) => { hemi[id] = k < half1 ? 1 : -1; });
    for (const id of buckets[2]) {
      let sc = 0;
      for (const j of buckets[1]) if (adj[id][j] > 0) sc += hemi[j];
      hemi[id] = sc >= 0 ? 1 : -1;
    }
    // Enforce near-balance on L2 if heavily skewed before KL refinement
    const pos2 = buckets[2].filter(id => hemi[id] > 0);
    const neg2 = buckets[2].filter(id => hemi[id] < 0);
    while (pos2.length > neg2.length + 2) { const id = pos2.pop(); hemi[id] = -1; neg2.push(id); }
    while (neg2.length > pos2.length + 2) { const id = neg2.pop(); hemi[id] = 1; pos2.push(id); }

    for (let it = 0; it < 15; it++) {
      let improved = false;
      for (const li of [1, 2]) {
        const arr = buckets[li];
        for (let a = 0; a < arr.length; a++) {
          for (let c = a + 1; c < arr.length; c++) {
            const u = arr[a], v = arr[c];
            if (hemi[u] === hemi[v]) continue;
            let gain = 0;
            for (let w = 0; w < n; w++) {
              if (layerOf[w] === 0) continue;
              if (adj[u][w] > 0 && w !== v) gain += hemi[w] === hemi[u] ? -1 : 1;
              if (adj[v][w] > 0 && w !== u) gain += hemi[w] === hemi[v] ? -1 : 1;
            }
            if (gain > 0) {
              const tmp = hemi[u]; hemi[u] = hemi[v]; hemi[v] = tmp;
              improved = true;
            }
          }
        }
      }
      if (!improved) break;
    }

    const minCutStats = auditSplit(hemi);
    return { hemi, buckets, ...minCutStats, naiveBypassCount: naiveStats.bypassCount };
  }

  // Methodology 2: Katenoid minimal-surface angular tension relaxation (symmetric compass-anchored)
  function relaxRingAngles(res, groups, yApprox) {
    const n = res.degrees.length;
    const adj = res.adj;
    const ang = new Float64Array(n);
    const home = new Float64Array(n);
    groups.forEach(g => {
      const m = Math.max(1, g.ids.length);
      g.ids.forEach((id, k) => {
        const a = g.phase + (k / m) * Math.PI * 2;
        ang[id] = a;
        home[id] = a;
      });
    });

    const totalEnergy = aArr => {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          if (adj[i][j] === 0) continue;
          const rI = surfaceR(yApprox[i], WH_RS, 1.0, "flamm");
          const rJ = surfaceR(yApprox[j], WH_RS, 1.0, "flamm");
          const dx = rI * Math.cos(aArr[i]) - rJ * Math.cos(aArr[j]);
          const dy = yApprox[i] - yApprox[j];
          const dz = rI * Math.sin(aArr[i]) - rJ * Math.sin(aArr[j]);
          sum += dx * dx + dy * dy + dz * dz;
        }
      }
      return sum;
    };

    const energyBefore = totalEnergy(ang);
    for (let it = 0; it < 20; it++) {
      const next = Float64Array.from(ang);
      for (let gi = 0; gi < groups.length; gi++) {
        const ids = groups[gi].ids;
        // Anchor L0 (gi === 0) around all 4 quadrants so the 360-deg funnel never collapses to one side
        if (gi === 0 || ids.length <= 1) continue;
        for (const u of ids) {
          let sx = 0, cz = 0, deg = 0;
          for (let v = 0; v < n; v++) {
            if (adj[u][v] > 0) { sx += Math.sin(ang[v]); cz += Math.cos(ang[v]); deg++; }
          }
          if (deg > 0 && (sx * sx + cz * cz) > 1e-6) {
            const target = Math.atan2(sx, cz);
            const diffN = Math.atan2(Math.sin(target - ang[u]), Math.cos(target - ang[u]));
            const diffH = Math.atan2(Math.sin(home[u] - ang[u]), Math.cos(home[u] - ang[u]));
            next[u] += diffN * 0.28 + diffH * 0.14;
          }
        }
        const minSep = (Math.PI * 2 / ids.length) * 0.72;
        for (let a = 0; a < ids.length; a++) {
          for (let b = a + 1; b < ids.length; b++) {
            const u = ids[a], v = ids[b];
            const d = Math.atan2(Math.sin(next[u] - next[v]), Math.cos(next[u] - next[v]));
            if (Math.abs(d) < minSep) {
              const push = (minSep - Math.abs(d)) * 0.40 * (d >= 0 ? 1 : -1);
              next[u] += push;
              next[v] -= push;
            }
          }
        }
      }
      ang.set(next);
    }
    const energyAfter = totalEnergy(ang);
    const catenoidReductionPct = energyBefore > 0 ? Math.max(0, ((energyBefore - energyAfter) / energyBefore) * 100) : 0;
    return { ang, energyBefore, energyAfter, catenoidReductionPct };
  }

  function updateWormholePositions(geom, rsNow, yScaleNow, profile) {
    if (!geom || !geom.whMeta) return;
    const n = geom.pos.length;
    const { hemi, baseY, ang, layerOf } = geom.whMeta;
    for (let i = 0; i < n; i++) {
      let y = 0;
      if (hemi[i] !== 0) {
        const yRaw = baseY[i];
        const yScaled = profile === "flamm" ? yRaw * yScaleNow : hemi[i] * (layerOf[i] === 1 ? 0.68 : 1.24) * yScaleNow;
        y = yScaled;
      }
      const r = surfaceR(y, rsNow, yScaleNow, profile);
      geom.pos[i] = { x: r * Math.cos(ang[i]), y, z: r * Math.sin(ang[i]), layer: layerOf[i] };
    }
  }

  // 3D Geometries
  function compute3dPositions(res, mode, seed) {
    const n = res.degrees.length;
    const pos = new Array(n);
    const layerOf = new Uint8Array(n);

    if (res.topology === "adaptive_hierarchy") {
      for (let i = 0; i < n; i++) layerOf[i] = res.layers[i];
    } else {
      const sorted = Array.from({ length: n }, (_, i) => i).sort((a, b) => res.degrees[b] - res.degrees[a] || a - b);
      sorted.forEach((id, rank) => { layerOf[id] = rank < 6 ? 0 : rank < 22 ? 1 : 2; });
    }

    if (mode === "wormhole") {
      const part = computeMinCutHemispheres(res, layerOf);
      const hemi = part.hemi;
      const baseY = new Float64Array(n);
      const l1Top = part.buckets[1].filter(id => hemi[id] > 0);
      const l1Bot = part.buckets[1].filter(id => hemi[id] < 0);
      const l2Top = part.buckets[2].filter(id => hemi[id] > 0);
      const l2Bot = part.buckets[2].filter(id => hemi[id] < 0);

      for (const id of part.buckets[0]) baseY[id] = 0.0;
      for (const id of l1Top) baseY[id] = 0.98;
      for (const id of l1Bot) baseY[id] = -0.98;
      for (const id of l2Top) baseY[id] = 1.29;
      for (const id of l2Bot) baseY[id] = -1.29;

      const rel = relaxRingAngles(res, [
        { ids: part.buckets[0], phase: 0.35 },
        { ids: l1Top, phase: 0.2 },
        { ids: l1Bot, phase: 0.2 },
        { ids: l2Top, phase: 0.05 },
        { ids: l2Bot, phase: 0.05 }
      ], baseY);

      const geom = {
        pos,
        layerOf,
        hemi,
        thruL0: part.thruL0,
        sameHemi: part.sameHemi,
        bypassCount: part.bypassCount,
        naiveBypassCount: part.naiveBypassCount,
        catenoidReductionPct: rel.catenoidReductionPct,
        whMeta: { hemi, baseY, ang: rel.ang, layerOf }
      };
      updateWormholePositions(geom, WH_RS, 1.0, "flamm");
      return geom;
    }

    if (mode === "tower") {
      const buckets = [[], [], []];
      for (let i = 0; i < n; i++) buckets[layerOf[i]].push(i);
      const spec = [
        { y: 1.15, r: 0.65, phase: 0.4 },
        { y: 0.0, r: 1.45, phase: 0.15 },
        { y: -1.15, r: 2.25, phase: 0.05 }
      ];
      buckets.forEach((arr, li) => {
        const { y, r, phase } = spec[li];
        const m = Math.max(1, arr.length);
        arr.forEach((id, k) => {
          const ang = phase + (k / m) * Math.PI * 2;
          const wave = li === 0 ? 0.08 * Math.sin(2 * ang) : 0.14 * Math.sin(3 * ang);
          pos[id] = { x: r * Math.cos(ang), y: y + wave, z: r * Math.sin(ang), layer: li };
        });
      });
      return { pos, layerOf };
    }

    if (mode === "atom") {
      const buckets = [[], [], []];
      for (let i = 0; i < n; i++) buckets[layerOf[i]].push(i);
      const radii = [0.72, 1.50, 2.35];
      const ga = Math.PI * (3 - Math.sqrt(5));
      buckets.forEach((arr, li) => {
        const R = radii[li];
        const m = arr.length;
        arr.forEach((id, k) => {
          const y = m === 1 ? 0 : 1 - (k / Math.max(1, m - 1)) * 2;
          const rad = Math.sqrt(Math.max(0, 1 - y * y));
          const theta = ga * k + li * 0.9;
          pos[id] = { x: Math.cos(theta) * rad * R, y: y * R, z: Math.sin(theta) * rad * R, layer: li };
        });
      });
      return { pos, layerOf };
    }

    // Seeded 3D Fruchterman-Reingold force layout
    const rng = new E.SeededRNG((seed || 11200) + 77);
    const pts = Array.from({ length: n }, (_, i) => ({
      x: (rng.random() * 2 - 1) * 1.4,
      y: (rng.random() * 2 - 1) * 1.4 + (layerOf[i] === 0 ? 0.5 : layerOf[i] === 2 ? -0.4 : 0),
      z: (rng.random() * 2 - 1) * 1.4
    }));
    const edges = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) if (res.adj[i][j] > 0) edges.push([i, j]);
    }
    const kOpt = 0.85;
    for (let it = 0; it < 70; it++) {
      const disp = Array.from({ length: n }, () => ({ x: 0, y: 0, z: 0 }));
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y, dz = pts[i].z - pts[j].z;
          const d2 = dx * dx + dy * dy + dz * dz + 0.01;
          const dist = Math.sqrt(d2);
          const f = (kOpt * kOpt) / dist;
          const fx = (dx / dist) * f, fy = (dy / dist) * f, fz = (dz / dist) * f;
          disp[i].x += fx; disp[i].y += fy; disp[i].z += fz;
          disp[j].x -= fx; disp[j].y -= fy; disp[j].z -= fz;
        }
      }
      for (const [u, v] of edges) {
        const dx = pts[u].x - pts[v].x, dy = pts[u].y - pts[v].y, dz = pts[u].z - pts[v].z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz + 0.001);
        const f = (dist * dist) / kOpt;
        const fx = (dx / dist) * f, fy = (dy / dist) * f, fz = (dz / dist) * f;
        disp[u].x -= fx; disp[u].y -= fy; disp[u].z -= fz;
        disp[v].x += fx; disp[v].y += fy; disp[v].z += fz;
      }
      const temp = 0.35 * (1 - it / 72);
      for (let i = 0; i < n; i++) {
        const dm = Math.sqrt(disp[i].x ** 2 + disp[i].y ** 2 + disp[i].z ** 2) + 1e-6;
        const step = Math.min(dm, temp);
        pts[i].x += (disp[i].x / dm) * step;
        pts[i].y += (disp[i].y / dm) * step;
        pts[i].z += (disp[i].z / dm) * step;
      }
    }
    let maxR = 1e-6;
    for (const p of pts) {
      const r = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
      if (r > maxR) maxR = r;
    }
    const scaleNorm = 2.35 / maxR;
    for (let i = 0; i < n; i++) {
      pos[i] = { x: pts[i].x * scaleNorm, y: pts[i].y * scaleNorm, z: pts[i].z * scaleNorm, layer: layerOf[i] };
    }
    return { pos, layerOf };
  }

  // State
  let currentRuns = {};
  let activeCtrlKey = "student";
  let layoutMode = "wormhole";
  let surfaceProfile = "flamm";
  let pinchDeSitterOn = true;
  let ruledHelixOn = true;
  let bypassOn = true;
  let lastPhysics = { thruL0: 0, sameHemi: 0, bypassCount: 0, naiveBypassCount: 0, catenoidReductionPct: 0, rsNow: WH_RS, yScaleNow: 1.0, pinchPressure: 0 };
  let layoutCache = {};
  let currentStep = 0;
  let isPlaying = true;
  let playSpeed = 1.0;
  let stepAccumulator = 0;
  let lastFrameTs = 0;
  let animTime = 0;

  // Camera
  const cam = {
    yaw: 0.65,
    pitch: 0.22,
    dist: 7.4,
    targetYaw: 0.65,
    targetPitch: 0.22,
    targetDist: 7.4,
    autoOrbit: true,
    dragging: false,
    moved: false,
    lastX: 0,
    lastY: 0
  };
  let pointerX = -1, pointerY = -1;
  let hoveredId = null, pinnedId = null;
  let lastProjected = [];

  const sceneCanvas = document.getElementById("scene3d");
  const sceneCtx = sceneCanvas.getContext("2d");

  function syncCanvasSize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = sceneCanvas.getBoundingClientRect();
    const w = Math.max(320, Math.round(rect.width * dpr));
    const h = Math.max(320, Math.round(rect.height * dpr));
    if (sceneCanvas.width !== w || sceneCanvas.height !== h) {
      sceneCanvas.width = w;
      sceneCanvas.height = h;
    }
    return { w, h, dpr };
  }

  function projectPt(pt, w, h, fov, cosY, sinY, cosP, sinP) {
    const x1 = pt.x * cosY + pt.z * sinY;
    const z1 = -pt.x * sinY + pt.z * cosY;
    const y2 = pt.y * cosP - z1 * sinP;
    const zCam = pt.y * sinP + z1 * cosP;
    const denom = cam.dist - zCam;
    if (denom < 0.75) return null;
    const scale = fov / denom;
    return {
      sx: w * 0.5 + x1 * scale,
      sy: h * 0.5 - y2 * scale,
      zCam,
      scale
    };
  }

  function draw3dRing(ctx, radius, yPlane, w, h, fov, cosY, sinY, cosP, sinP, color, dash) {
    ctx.save();
    if (dash) ctx.setLineDash(dash);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    let started = false;
    const segs = 48;
    for (let s = 0; s <= segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      const p = projectPt({ x: radius * Math.cos(a), y: yPlane, z: radius * Math.sin(a) }, w, h, fov, cosY, sinY, cosP, sinP);
      if (!p) { started = false; continue; }
      if (!started) { ctx.moveTo(p.sx, p.sy); started = true; }
      else ctx.lineTo(p.sx, p.sy);
    }
    ctx.stroke();
    ctx.restore();
  }

  function draw3dTiltedOrbit(ctx, radius, tiltX, tiltZ, w, h, fov, cosY, sinY, cosP, sinP, color) {
    ctx.save();
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    const cX = Math.cos(tiltX), sX = Math.sin(tiltX);
    const cZ = Math.cos(tiltZ), sZ = Math.sin(tiltZ);
    const segs = 56;
    let started = false;
    for (let s = 0; s <= segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      const x0 = radius * Math.cos(a), y0 = 0, z0 = radius * Math.sin(a);
      const y1 = y0 * cX - z0 * sX, z1 = y0 * sX + z0 * cX;
      const x2 = x0 * cZ - y1 * sZ, y2 = x0 * sZ + y1 * cZ;
      const p = projectPt({ x: x2, y: y2, z: z1 }, w, h, fov, cosY, sinY, cosP, sinP);
      if (!p) { started = false; continue; }
      if (!started) { ctx.moveTo(p.sx, p.sy); started = true; }
      else ctx.lineTo(p.sx, p.sy);
    }
    ctx.stroke();
    ctx.restore();
  }

  function render3dFrame() {
    const run = currentRuns[activeCtrlKey];
    if (!run) return;
    const res = run.res;
    const step = Math.max(0, Math.min(res.steps - 1, currentStep));
    const snap = res.snapshots[step];
    const dMap = run.dByStep[step] || {};
    const geom = layoutCache[layoutMode];
    if (!snap || !geom) return;

    const { w, h, dpr } = syncCanvasSize();
    const ctx = sceneCtx;
    ctx.clearRect(0, 0, w, h);

    const fov = Math.min(w, h) * 1.18;
    const cosY = Math.cos(cam.yaw), sinY = Math.sin(cam.yaw);
    const cosP = Math.cos(cam.pitch), sinP = Math.sin(cam.pitch);
    const n = res.degrees.length;

    // Methodology 4 & 5: Live Z-Pinch throat compression + de Sitter CSI curvature
    let l0Sum = 0, l0N = 0;
    for (let i = 0; i < n; i++) {
      if (geom.layerOf[i] === 0 && snap.alive[i] === 1) { l0Sum += snap.stress[i]; l0N++; }
    }
    const coreStress = l0N ? l0Sum / l0N : 0;
    let dSum = 0, dN = 0;
    for (const id of res.agents) {
      if (snap.alive[id] === 1 && snap.quarantined[id] === 0) {
        dSum += Number.isFinite(dMap[id]) ? dMap[id] : 0;
        dN++;
      }
    }
    const activeDrain = dN ? dSum / dN : 0;
    const pinchPressure = Math.max(0, Math.min(1, 0.55 * coreStress + 0.75 * activeDrain));
    const rsNow = (layoutMode === "wormhole" && pinchDeSitterOn) ? WH_RS * (1 - 0.24 * pinchPressure) : WH_RS;
    const yScaleNow = (layoutMode === "wormhole" && pinchDeSitterOn) ? 1 + 0.16 * (1 - res.csi[step]) : 1.0;

    if (layoutMode === "wormhole") {
      updateWormholePositions(geom, rsNow, yScaleNow, surfaceProfile);
    }
    const whGeom = layoutCache.wormhole;
    lastPhysics = {
      thruL0: whGeom ? whGeom.thruL0 : 0,
      sameHemi: whGeom ? whGeom.sameHemi : 0,
      bypassCount: whGeom ? whGeom.bypassCount : 0,
      naiveBypassCount: whGeom ? whGeom.naiveBypassCount : 0,
      catenoidReductionPct: whGeom ? whGeom.catenoidReductionPct : 0,
      rsNow,
      yScaleNow,
      pinchPressure
    };

    // 1. Subtle 3D perspective floor grid (hidden in Einstein-Rosen space mode)
    if (layoutMode !== "wormhole") {
      ctx.save();
      ctx.strokeStyle = "rgba(56, 189, 248, 0.08)";
      ctx.lineWidth = 1;
      const gExtent = 3.0, gStep = 0.75;
      for (let v = -gExtent; v <= gExtent + 0.01; v += gStep) {
        const a1 = projectPt({ x: v, y: -1.75, z: -gExtent }, w, h, fov, cosY, sinY, cosP, sinP);
        const a2 = projectPt({ x: v, y: -1.75, z: gExtent }, w, h, fov, cosY, sinY, cosP, sinP);
        if (a1 && a2) { ctx.beginPath(); ctx.moveTo(a1.sx, a1.sy); ctx.lineTo(a2.sx, a2.sy); ctx.stroke(); }
        const b1 = projectPt({ x: -gExtent, y: -1.75, z: v }, w, h, fov, cosY, sinY, cosP, sinP);
        const b2 = projectPt({ x: gExtent, y: -1.75, z: v }, w, h, fov, cosY, sinY, cosP, sinP);
        if (b1 && b2) { ctx.beginPath(); ctx.moveTo(b1.sx, b1.sy); ctx.lineTo(b2.sx, b2.sy); ctx.stroke(); }
      }
      ctx.restore();
    }

    // Layout guides
    if (layoutMode === "wormhole") {
      // Dynamic Z-Pinch glowing throat aura
      const cProj = projectPt({ x: 0, y: 0, z: 0 }, w, h, fov, cosY, sinY, cosP, sinP);
      if (cProj) {
        const gR = Math.max(14, (0.90 + 0.25 * pinchPressure) * cProj.scale);
        const pR = Math.round(168 + 83 * pinchPressure);
        const pG = Math.round(85 + 61 * pinchPressure);
        const pB = Math.round(247 - 165 * pinchPressure);
        const tg = ctx.createRadialGradient(cProj.sx, cProj.sy, gR * 0.08, cProj.sx, cProj.sy, gR);
        tg.addColorStop(0, "rgba(" + pR + "," + pG + "," + pB + "," + (0.28 + 0.16 * pinchPressure).toFixed(2) + ")");
        tg.addColorStop(0.50, "rgba(56, 189, 248, 0.11)");
        tg.addColorStop(1, "rgba(56, 189, 248, 0)");
        ctx.save();
        ctx.fillStyle = tg;
        ctx.beginPath();
        ctx.arc(cProj.sx, cProj.sy, gR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      if (surfaceProfile === "flamm") {
        // Warped Cartesian square spacetime grids (upper +surfaceY, lower -surfaceY)
        ctx.save();
        ctx.strokeStyle = "rgba(56, 189, 248, 0.19)";
        ctx.lineWidth = 0.9 * dpr;
        const gLines = 13, gSteps = 44;
        for (const sign of [1, -1]) {
          for (let k = 0; k < gLines; k++) {
            const coord = -WH_GRID_EXT + (2 * WH_GRID_EXT * k) / (gLines - 1);
            ctx.beginPath();
            let started = false;
            for (let s = 0; s <= gSteps; s++) {
              const x = -WH_GRID_EXT + (2 * WH_GRID_EXT * s) / gSteps;
              const z = coord;
              const r = Math.hypot(x, z);
              if (r < rsNow) { started = false; continue; }
              const p = projectPt({ x, y: sign * surfaceY(r, rsNow, yScaleNow, "flamm"), z }, w, h, fov, cosY, sinY, cosP, sinP);
              if (!p) { started = false; continue; }
              if (!started) { ctx.moveTo(p.sx, p.sy); started = true; } else ctx.lineTo(p.sx, p.sy);
            }
            ctx.stroke();
            ctx.beginPath();
            started = false;
            for (let s = 0; s <= gSteps; s++) {
              const z = -WH_GRID_EXT + (2 * WH_GRID_EXT * s) / gSteps;
              const x = coord;
              const r = Math.hypot(x, z);
              if (r < rsNow) { started = false; continue; }
              const p = projectPt({ x, y: sign * surfaceY(r, rsNow, yScaleNow, "flamm"), z }, w, h, fov, cosY, sinY, cosP, sinP);
              if (!p) { started = false; continue; }
              if (!started) { ctx.moveTo(p.sx, p.sy); started = true; } else ctx.lineTo(p.sx, p.sy);
            }
            ctx.stroke();
          }
        }
        ctx.restore();
      }
      // Concentric funnel / profile latitude rings
      const neckRings = surfaceProfile === "flamm"
        ? [rsNow, rsNow + 0.10, 0.68, 0.96, 1.38]
        : [rsNow, rsNow + 0.24, rsNow + 0.62, 1.56, WH_RRIM];
      neckRings.forEach((rr, idx) => {
        if (idx === 0) {
          ctx.save();
          ctx.strokeStyle = pinchPressure > 0.45 ? "rgba(251, 146, 60, 0.88)" : "rgba(192, 132, 252, 0.88)";
          ctx.lineWidth = 2.0 * dpr;
          ctx.beginPath();
          let started = false;
          for (let s = 0; s <= 48; s++) {
            const a = (s / 48) * Math.PI * 2;
            const p = projectPt({ x: rr * Math.cos(a), y: 0, z: rr * Math.sin(a) }, w, h, fov, cosY, sinY, cosP, sinP);
            if (!p) { started = false; continue; }
            if (!started) { ctx.moveTo(p.sx, p.sy); started = true; } else ctx.lineTo(p.sx, p.sy);
          }
          ctx.stroke();
          ctx.restore();
          return;
        }
        const yy = surfaceY(rr, rsNow, yScaleNow, surfaceProfile);
        const rimCol = idx === neckRings.length - 1 && surfaceProfile !== "flamm" ? "rgba(56, 189, 248, 0.36)" : "rgba(56, 189, 248, 0.24)";
        draw3dRing(ctx, rr, yy, w, h, fov, cosY, sinY, cosP, sinP, rimCol);
        draw3dRing(ctx, rr, -yy, w, h, fov, cosY, sinY, cosP, sinP, rimCol);
      });
      // Smooth curved meridian ribs
      ctx.save();
      ctx.strokeStyle = surfaceProfile === "catenoid" ? "rgba(52, 211, 153, 0.22)" : "rgba(125, 211, 252, 0.20)";
      ctx.lineWidth = 1.0 * dpr;
      const ribs = 12, segs = 30, ySpan = WH_YMAX * yScaleNow;
      for (let m = 0; m < ribs; m++) {
        const ang = (m / ribs) * Math.PI * 2;
        const ca = Math.cos(ang), sa = Math.sin(ang);
        ctx.beginPath();
        let started = false;
        for (let s = 0; s <= segs; s++) {
          const yy = -ySpan + (2 * ySpan * s) / segs;
          const rr = surfaceR(yy, rsNow, yScaleNow, surfaceProfile);
          const p = projectPt({ x: rr * ca, y: yy, z: rr * sa }, w, h, fov, cosY, sinY, cosP, sinP);
          if (!p) { started = false; continue; }
          if (!started) { ctx.moveTo(p.sx, p.sy); started = true; }
          else ctx.lineTo(p.sx, p.sy);
        }
        ctx.stroke();
      }
      ctx.restore();
      // Methodology 3: Counter-rotating straight ruled hyperboloid struts (double_helix)
      if (ruledHelixOn) {
        const ySpanH = WH_YMAX * yScaleNow;
        const cH = (WH_RRIM * WH_RRIM - rsNow * rsNow) / (ySpanH * ySpanH);
        const sqrtCH = Math.sqrt(Math.max(0, cH));
        const nStruts = 12;
        ctx.save();
        ctx.lineWidth = 0.85 * dpr;
        for (const dir of [1, -1]) {
          ctx.strokeStyle = dir > 0 ? "rgba(56, 189, 248, 0.17)" : "rgba(192, 132, 252, 0.16)";
          for (let m = 0; m < nStruts; m++) {
            const th = (m / nStruts) * Math.PI * 2;
            const cT = Math.cos(th), sT = Math.sin(th);
            const pBot = projectPt({ x: rsNow * cT - dir * (-ySpanH) * sqrtCH * sT, y: -ySpanH, z: rsNow * sT + dir * (-ySpanH) * sqrtCH * cT }, w, h, fov, cosY, sinY, cosP, sinP);
            const pTop = projectPt({ x: rsNow * cT - dir * ySpanH * sqrtCH * sT, y: ySpanH, z: rsNow * sT + dir * ySpanH * sqrtCH * cT }, w, h, fov, cosY, sinY, cosP, sinP);
            if (pBot && pTop) {
              ctx.beginPath();
              ctx.moveTo(pBot.sx, pBot.sy);
              ctx.lineTo(pTop.sx, pTop.sy);
              ctx.stroke();
            }
          }
        }
        ctx.restore();
      }
    } else if (layoutMode === "tower") {
      draw3dRing(ctx, 0.65, 1.15, w, h, fov, cosY, sinY, cosP, sinP, "rgba(56, 189, 248, 0.25)", [4, 4]);
      draw3dRing(ctx, 1.45, 0.0, w, h, fov, cosY, sinY, cosP, sinP, "rgba(56, 189, 248, 0.18)", [4, 4]);
      draw3dRing(ctx, 2.25, -1.15, w, h, fov, cosY, sinY, cosP, sinP, "rgba(56, 189, 248, 0.14)", [4, 4]);
      const axTop = projectPt({ x: 0, y: 1.55, z: 0 }, w, h, fov, cosY, sinY, cosP, sinP);
      const axBot = projectPt({ x: 0, y: -1.75, z: 0 }, w, h, fov, cosY, sinY, cosP, sinP);
      if (axTop && axBot) {
        ctx.save();
        ctx.setLineDash([3, 5]);
        ctx.strokeStyle = "rgba(148, 163, 199, 0.22)";
        ctx.beginPath(); ctx.moveTo(axTop.sx, axTop.sy); ctx.lineTo(axBot.sx, axBot.sy); ctx.stroke();
        ctx.restore();
      }
    } else if (layoutMode === "atom") {
      draw3dTiltedOrbit(ctx, 2.38, 0.65, 0.25, w, h, fov, cosY, sinY, cosP, sinP, "rgba(56, 189, 248, 0.18)");
      draw3dTiltedOrbit(ctx, 1.55, -0.85, 0.55, w, h, fov, cosY, sinY, cosP, sinP, "rgba(167, 139, 250, 0.20)");
      draw3dTiltedOrbit(ctx, 0.78, 0.35, -1.10, w, h, fov, cosY, sinY, cosP, sinP, "rgba(52, 211, 153, 0.22)");
    }

    // Project nodes
    const proj = new Array(n);
    let maxDeg = 1;
    for (let i = 0; i < n; i++) if (res.degrees[i] > maxDeg) maxDeg = res.degrees[i];
    for (let i = 0; i < n; i++) {
      const p = projectPt(geom.pos[i], w, h, fov, cosY, sinY, cosP, sinP);
      const rBase = (4.8 + 8.5 * (res.degrees[i] / maxDeg)) * dpr;
      proj[i] = p ? { ...p, id: i, r: Math.max(3 * dpr, rBase * (p.scale / (fov / 6.4))) } : null;
    }

    const focusId = pinnedId !== null ? pinnedId : hoveredId;
    const gravMap = new Map((res.gravEdgeList || []).map(([a, b, t0]) => [Math.min(a, b) * 1000 + Math.max(a, b), t0]));
    const sparks = [];

    // 2. Depth-sorted 3D edges + animated capital-drain sparks
    for (let i = 0; i < n; i++) {
      const pi = proj[i];
      if (!pi) continue;
      for (let j = i + 1; j < n; j++) {
        if (res.adj[i][j] === 0) continue;
        const pj = proj[j];
        if (!pj) continue;

        const gt = gravMap.get(i * 1000 + j);
        if (gt !== undefined && step < gt) continue;

        const isFocusEdge = focusId !== null && (i === focusId || j === focusId);
        const depthAlpha = Math.max(0.18, Math.min(1.0, ((pi.zCam + pj.zCam) * 0.5 + 2.6) / 5.2));
        const activeEdge = snap.alive[i] === 1 && snap.alive[j] === 1 && snap.quarantined[i] === 0 && snap.quarantined[j] === 0;
        const chaosI = res.isChaos[i] === 1, chaosJ = res.isChaos[j] === 1;
        const isBypass = layoutMode === "wormhole" && geom.hemi && (geom.hemi[i] * geom.hemi[j] === -1);

        ctx.save();
        if (gt !== undefined) {
          ctx.setLineDash([4 * dpr, 3 * dpr]);
          ctx.strokeStyle = "rgba(248, 250, 252, " + (0.65 * depthAlpha).toFixed(2) + ")";
          ctx.lineWidth = 1.4 * dpr;
        } else if (isFocusEdge) {
          ctx.strokeStyle = activeEdge ? "rgba(56, 189, 248, 0.90)" : "rgba(192, 132, 252, 0.55)";
          ctx.lineWidth = 2.0 * dpr;
        } else if (isBypass && activeEdge) {
          if (bypassOn) {
            ctx.setLineDash([3 * dpr, 3 * dpr]);
            ctx.strokeStyle = "rgba(251, 191, 36, " + (0.58 * depthAlpha).toFixed(2) + ")";
            ctx.lineWidth = 1.3 * dpr;
          } else {
            ctx.strokeStyle = "rgba(100, 116, 139, " + (0.15 * depthAlpha).toFixed(2) + ")";
            ctx.lineWidth = 0.7 * dpr;
          }
        } else if (activeEdge) {
          if (chaosI || chaosJ) {
            ctx.strokeStyle = "rgba(244, 63, 94, " + (0.34 * depthAlpha).toFixed(2) + ")";
            ctx.lineWidth = 1.25 * dpr;
          } else {
            ctx.strokeStyle = "rgba(56, 189, 248, " + (0.17 * depthAlpha).toFixed(2) + ")";
            ctx.lineWidth = 0.9 * dpr;
          }
        } else {
          ctx.strokeStyle = "rgba(71, 85, 105, " + (0.09 * depthAlpha).toFixed(2) + ")";
          ctx.lineWidth = 0.6 * dpr;
        }
        ctx.beginPath();
        if (layoutMode === "wormhole") {
          const eSegs = 10;
          let started = false;
          for (let s = 0; s <= eSegs; s++) {
            const pt = surfaceGeodesic(geom.pos[i], geom.pos[j], s / eSegs, rsNow, yScaleNow, surfaceProfile, isBypass);
            const pr = projectPt(pt, w, h, fov, cosY, sinY, cosP, sinP);
            if (!pr) { started = false; continue; }
            if (!started) { ctx.moveTo(pr.sx, pr.sy); started = true; }
            else ctx.lineTo(pr.sx, pr.sy);
          }
        } else {
          ctx.moveTo(pi.sx, pi.sy);
          ctx.lineTo(pj.sx, pj.sy);
        }
        ctx.stroke();
        ctx.restore();

        // Drain spark from healthy victim -> active unquarantined chaos node
        if (activeEdge && (chaosI !== chaosJ)) {
          const chaosNode = chaosI ? i : j;
          const victimNode = chaosI ? j : i;
          const eng = snap.ptype[chaosNode] === 0 || snap.engaged[chaosNode] === 1;
          if (eng) {
            const dNow = Number.isFinite(dMap[chaosNode]) ? dMap[chaosNode] : 0.35;
            const speed = 0.55 + dNow * 1.9;
            const u = (animTime * speed + ((chaosNode * 17 + victimNode * 7) % 100) * 0.01) % 1;
            const vPt = geom.pos[victimNode], cPt = geom.pos[chaosNode];
            const spPt = layoutMode === "wormhole"
              ? surfaceGeodesic(vPt, cPt, u, rsNow, yScaleNow, surfaceProfile, isBypass)
              : {
                  x: vPt.x + (cPt.x - vPt.x) * u,
                  y: vPt.y + (cPt.y - vPt.y) * u,
                  z: vPt.z + (cPt.z - vPt.z) * u
                };
            const spProj = projectPt(spPt, w, h, fov, cosY, sinY, cosP, sinP);
            if (spProj) sparks.push({ ...spProj, dNow });
          }
        }
      }
    }

    // Painter's sort (back to front: smaller zCam is further away from camera at +dist)
    const drawOrder = proj.filter(Boolean).sort((a, b) => a.zCam - b.zCam);
    const scoutSet = new Set((activeCtrlKey === "student" || activeCtrlKey === "kovan_v2") ? run.scoutIds : []);

    // Interleave sparks roughly behind near spheres or draw before frontmost layer
    for (const sp of sparks) {
      const sr = (1.6 + sp.dNow * 3.0) * dpr * (sp.scale / (fov / 6.4));
      ctx.save();
      ctx.fillStyle = "rgba(251, 113, 133, 0.95)";
      ctx.shadowColor = "#f43f5e";
      ctx.shadowBlur = 8 * dpr;
      ctx.beginPath();
      ctx.arc(sp.sx, sp.sy, Math.max(1.4 * dpr, sr), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 3. Draw 3D shaded spheres + scout halos + quarantine cages
    for (const p of drawOrder) {
      const i = p.id;
      const alive = snap.alive[i] === 1;
      const quar = snap.quarantined[i] === 1;
      const chaos = res.isChaos[i] === 1;
      const pt = snap.ptype[i];
      const pkey = pt ? E.PKEY[pt] : null;
      const pinfo = pkey ? E.PARTICLE_INFO[pkey] : null;
      const inert = pt !== 0 && snap.engaged[i] === 0;
      const dNow = Number.isFinite(dMap[i]) ? dMap[i] : 0;

      // Active chaos pulsing 3D aura
      if (alive && chaos && !quar && !inert) {
        const pulse = 1 + 0.25 * Math.sin(animTime * 4.2 + i);
        const auraR = p.r * (1.35 + dNow * 0.7) * pulse;
        ctx.save();
        ctx.strokeStyle = "rgba(244, 63, 94, 0.50)";
        ctx.lineWidth = 1.4 * dpr;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, auraR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Scout halo ring
      if (alive && !quar && scoutSet.has(i)) {
        ctx.save();
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 2.0 * dpr;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, p.r + 3.2 * dpr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Sphere shading
      let cTop = "#64748b", cMid = "#334155", cRim = "#0f172a";
      if (alive) {
        if (quar) {
          cTop = chaos ? "#a855f7" : "#64748b";
          cMid = chaos ? "#581c87" : "#334155";
          cRim = "#1e1b4b";
        } else if (chaos) {
          const base = pinfo ? pinfo.color : "#f43f5e";
          cTop = "#fecdd3";
          cMid = base;
          cRim = "#881337";
        } else if (snap.stress[i] < 0.28) {
          cTop = "#6ee7b7"; cMid = "#10b981"; cRim = "#064e3b";
        } else if (snap.stress[i] < 0.55) {
          cTop = "#fde68a"; cMid = "#f59e0b"; cRim = "#78350f";
        } else {
          cTop = "#fca5a5"; cMid = "#ef4444"; cRim = "#7f1d1d";
        }
      }

      const grad = ctx.createRadialGradient(
        p.sx - p.r * 0.32, p.sy - p.r * 0.32, p.r * 0.12,
        p.sx, p.sy, p.r
      );
      grad.addColorStop(0, cTop);
      grad.addColorStop(0.55, cMid);
      grad.addColorStop(1, cRim);

      ctx.save();
      ctx.globalAlpha = alive ? (chaos && inert && !quar ? 0.55 : 1.0) : 0.32;
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, p.r, 0, Math.PI * 2);
      ctx.fill();
      if (focusId === i) {
        ctx.strokeStyle = "#f8fafc";
        ctx.lineWidth = 2.2 * dpr;
        ctx.stroke();
      }
      ctx.restore();

      // Particle label
      if (alive && pinfo && p.r >= 5.2 * dpr) {
        ctx.save();
        ctx.fillStyle = quar ? "#f3e8ff" : "#070b17";
        ctx.font = "bold " + Math.max(8 * dpr, Math.round(p.r * 0.92)) + "px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(pinfo.sym, p.sx, p.sy + 0.5 * dpr);
        ctx.restore();
      }

      // Rotating 3D octahedral wireframe cage for quarantined nodes
      if (alive && quar) {
        const cageR = (geom.pos[i] ? 0.18 : 0.16) * (0.85 + 0.35 * (res.degrees[i] / maxDeg));
        const aSpin = animTime * 1.4 + i;
        const cS = Math.cos(aSpin), sS = Math.sin(aSpin);
        const rawVerts = [
          { x: cageR * cS, y: 0, z: cageR * sS },
          { x: -cageR * sS, y: 0, z: cageR * cS },
          { x: -cageR * cS, y: 0, z: -cageR * sS },
          { x: cageR * sS, y: 0, z: -cageR * cS },
          { x: 0, y: cageR * 1.15, z: 0 },
          { x: 0, y: -cageR * 1.15, z: 0 }
        ];
        const cp = geom.pos[i];
        const pv = rawVerts.map(v => projectPt({ x: cp.x + v.x, y: cp.y + v.y, z: cp.z + v.z }, w, h, fov, cosY, sinY, cosP, sinP));
        if (pv.every(Boolean)) {
          ctx.save();
          ctx.strokeStyle = chaos ? "rgba(192, 132, 252, 0.9)" : "rgba(148, 163, 184, 0.7)";
          ctx.lineWidth = 1.15 * dpr;
          const pairs = [[0,1],[1,2],[2,3],[3,0],[4,0],[4,1],[4,2],[4,3],[5,0],[5,1],[5,2],[5,3]];
          ctx.beginPath();
          for (const [u, v] of pairs) {
            ctx.moveTo(pv[u].sx, pv[u].sy);
            ctx.lineTo(pv[v].sx, pv[v].sy);
          }
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    // Store front-to-back order for accurate pointer picking
    lastProjected = drawOrder.slice().reverse();

    // Update HUD
    document.getElementById("hudCtrl").textContent = run.label;
    document.getElementById("hudStep").textContent = step + " / " + (res.steps - 1);
    document.getElementById("hudCsi").textContent = res.csi[step].toFixed(3);
    document.getElementById("hudExt").textContent = res.extractedHist[step].toFixed(2);
    document.getElementById("hudQuar").textContent = res.quarCount[step] + " (TP " + res.tp + "/" + res.totalChaos + " · FP " + res.fp + ")";
    const detSel = document.getElementById("detModeSel");
    document.getElementById("hudDet").textContent = detSel ? detSel.options[detSel.selectedIndex].text : "H-KALKAN v2";
    const redPct = lastPhysics.naiveBypassCount > 0 ? Math.round(((lastPhysics.naiveBypassCount - lastPhysics.bypassCount) / lastPhysics.naiveBypassCount) * 100) : 0;
    document.getElementById("hudBypass").textContent = lastPhysics.thruL0 + " / " + lastPhysics.bypassCount + " (-%" + redPct + ")";
    document.getElementById("hudTension").textContent = "-" + lastPhysics.catenoidReductionPct.toFixed(1) + "%";
    document.getElementById("hudPinch").textContent = rsNow.toFixed(2) + " (%" + Math.round(pinchPressure * 100) + ")";
    document.getElementById("hudMs").textContent = currentRuns.student ? currentRuns.student.inferMs.toFixed(2) + " ms" : "0.00 ms";
    document.getElementById("stepTxt").textContent = String(step);
    document.getElementById("stepSlider").value = String(step);

    updateInspector(run, step, snap, dMap, geom.layerOf);
  }

  function updateInspector(run, step, snap, dMap, layerOf) {
    const id = pinnedId !== null ? pinnedId : hoveredId;
    const el = document.getElementById("inspector");
    if (id === null || id < 0 || id >= run.res.degrees.length) {
      el.innerHTML =
        '<div style="font-weight:700;color:#e0f2fe;margin-bottom:4px;">Düğüm İnceleyici</div>' +
        '<div style="color:var(--mut);line-height:1.45;">Fareyle bir kürenin üzerine gel veya tıkla; 1-atlamalı 3B bağlantıları ve canlı <i>d(t)</i> değerini gör. Sürükle: döndür · Tekerlek: zoom.</div>';
      return;
    }
    const res = run.res;
    const alive = snap.alive[id] === 1;
    const quar = snap.quarantined[id] === 1;
    const chaos = res.isChaos[id] === 1;
    const pt = snap.ptype[id];
    const pkey = pt ? E.PKEY[pt] : null;
    const pinfo = pkey ? E.PARTICLE_INFO[pkey] : null;
    const isScout = (activeCtrlKey === "student" || activeCtrlKey === "kovan_v2") && run.scoutIds.includes(id);

    const roleStr = !chaos
      ? "Sağlıklı Düğüm"
      : (pinfo ? pinfo.name + " (" + pinfo.sym + ")" : "Parazit") + (isScout ? " · Öncü" : " · Sürü");
    const statusStr = !alive ? "Çöktü" : quar ? "Karantinada" : "Aktif";
    const statusCol = !alive ? "#94a3b8" : quar ? "#c084fc" : "#34d399";
    const agIdx = res.agents.indexOf(id);
    const stolenFinal = agIdx !== -1 ? res.stolenByAgent[agIdx].toFixed(2) : "—";
    const dNow = chaos && Number.isFinite(dMap[id]) ? dMap[id].toFixed(3) : "—";

    el.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
      '<b style="color:#e0f2fe;">Düğüm #' + id + ' (L' + layerOf[id] + ')</b>' +
      '<span style="color:' + statusCol + ';font-weight:700;font-size:11px;">' + statusStr + '</span></div>' +
      '<div class="hud-grid">' +
      '<span class="hud-k">Rol</span><span class="hud-v">' + roleStr + '</span>' +
      '<span class="hud-k">Derece (k)</span><span class="hud-v">' + res.degrees[id] + '</span>' +
      '<span class="hud-k">Stres(t=' + step + ')</span><span class="hud-v">' + snap.stress[id].toFixed(3) + '</span>' +
      '<span class="hud-k">Canlı d(t)</span><span class="hud-v">' + dNow + '</span>' +
      '<span class="hud-k">Toplam Çalınan</span><span class="hud-v">' + stolenFinal + '</span>' +
      '</div>' +
      (pinnedId !== null ? '<div style="margin-top:6px;font-size:11px;color:var(--acc);">Sabitlendi (kaldırmak için boşluğa tıkla)</div>' : '');
  }

  function drawChart() {
    const cv = document.getElementById("chart");
    const ctx = cv.getContext("2d");
    const W = cv.width, H = cv.height, pad = 28;
    ctx.clearRect(0, 0, W, H);
    const keys = ["student", "kovan_v2", "rule", "greedy", "oracle"];
    const series = keys.map(k => currentRuns[k]).filter(Boolean);
    if (!series.length) return;

    const maxY = Math.max(10, ...series.flatMap(s => Array.from(s.res.extractedHist)));
    const steps = series[0].res.steps;

    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad + (H - 2 * pad) * (i / 4);
      ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke();
    }

    for (const s of series) {
      const isAct = s.key === activeCtrlKey;
      ctx.save();
      ctx.strokeStyle = CTRL_COLORS[s.key];
      ctx.lineWidth = isAct ? 3.2 : 1.7;
      ctx.globalAlpha = isAct ? 1.0 : 0.62;
      ctx.beginPath();
      for (let t = 0; t < s.res.extractedHist.length; t++) {
        const x = pad + (W - 2 * pad) * (t / Math.max(1, steps - 1));
        const y = H - pad - (H - 2 * pad) * (s.res.extractedHist[t] / maxY);
        if (t === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Playhead synced to 3D frame step
    const px = pad + (W - 2 * pad) * (currentStep / Math.max(1, steps - 1));
    ctx.save();
    ctx.strokeStyle = "rgba(56, 189, 248, 0.85)";
    ctx.lineWidth = 1.6;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(px, pad - 4);
    ctx.lineTo(px, H - pad + 4);
    ctx.stroke();
    ctx.restore();

    let lx = pad;
    for (const s of series) {
      ctx.fillStyle = CTRL_COLORS[s.key];
      ctx.fillRect(lx, 8, 10, 8);
      ctx.fillStyle = s.key === activeCtrlKey ? "#f8fafc" : "#94a3c7";
      ctx.font = (s.key === activeCtrlKey ? "bold " : "") + "11px system-ui";
      const lbl = s.key === "kovan_v2" ? "KOVAN-V2" : s.key === "student" ? "Öğrenci" : s.key === "rule" ? "KURAL" : s.key === "greedy" ? "Açgözlü" : "Kâhin";
      ctx.fillText(lbl, lx + 14, 15);
      lx += 92;
    }
  }

  function renderKpis() {
    const keys = ["student", "kovan_v2", "rule", "greedy"];
    document.getElementById("kpiRow").innerHTML = keys.map(k => {
      const s = currentRuns[k];
      return '<div class="card"><label>' + s.label + '</label>' +
        '<div class="kpi" style="color:' + CTRL_COLORS[k] + '">' + s.res.extracted.toFixed(1) + '</div>' +
        '<div class="sub" style="margin:0">TP ' + s.res.tp + '/' + s.res.totalChaos + ' · CSI ' + s.res.csi[s.res.steps - 1].toFixed(3) + '</div></div>';
    }).join("");
  }

  function runAll() {
    const cfg = getBaseConfig();
    const st = runStudentSim(cfg);
    const kv = runKovanV2Sim(cfg);
    const ru = runRuleSim(cfg);
    const gr = runFixedSim(cfg, "greedy", 0.8);
    const orD = cfg.quarantine_sensitivity >= 0.7 ? 0.2 : 0.3;
    const or = runFixedSim(cfg, "oracle", orD);

    currentRuns = { student: st, kovan_v2: kv, rule: ru, greedy: gr, oracle: or };
    const refRes = st.res;
    layoutCache = {
      wormhole: compute3dPositions(refRes, "wormhole", cfg.seed),
      tower: compute3dPositions(refRes, "tower", cfg.seed),
      atom: compute3dPositions(refRes, "atom", cfg.seed),
      force: compute3dPositions(refRes, "force", cfg.seed)
    };
    document.getElementById("timeTag").textContent = "Öğrenci Süre: " + st.inferMs.toFixed(2) + " ms (0 GPU)";
    document.getElementById("stepSlider").max = String(refRes.steps - 1);
    currentStep = 0;
    stepAccumulator = 0;
    hoveredId = null;
    pinnedId = null;
    renderKpis();
    render3dFrame();
    drawChart();
  }

  // Controls & Interaction
  document.getElementById("runBtn").addEventListener("click", runAll);
  ["sigmaSel", "detModeSel", "topoSel", "partSel", "quarChk"].forEach(id => {
    document.getElementById(id).addEventListener("change", runAll);
  });

  document.querySelectorAll("#ctrlTabs .pill").forEach(btn => {
    btn.addEventListener("click", () => {
      activeCtrlKey = btn.dataset.ctrl;
      document.querySelectorAll("#ctrlTabs .pill").forEach(b => b.classList.toggle("active", b === btn));
      render3dFrame();
      drawChart();
    });
  });

  document.querySelectorAll("#layoutBtns .pill").forEach(btn => {
    btn.addEventListener("click", () => {
      layoutMode = btn.dataset.layout;
      document.querySelectorAll("#layoutBtns .pill").forEach(b => b.classList.toggle("active", b === btn));
      render3dFrame();
    });
  });

  document.querySelectorAll("[data-cam]").forEach(btn => {
    btn.addEventListener("click", () => {
      const m = btn.dataset.cam;
      if (m === "top") { cam.targetPitch = 1.32; cam.targetDist = 6.3; }
      else if (m === "side") { cam.targetPitch = 0.05; cam.targetDist = 6.2; }
      else if (m === "iso") { cam.targetYaw = 0.72; cam.targetPitch = 0.42; cam.targetDist = 6.4; }
      else { cam.targetYaw = 0.65; cam.targetPitch = 0.22; cam.targetDist = 7.4; cam.autoOrbit = true; document.getElementById("orbitBtn").classList.add("active"); }
    });
  });

  document.getElementById("orbitBtn").addEventListener("click", function () {
    cam.autoOrbit = !cam.autoOrbit;
    this.classList.toggle("active", cam.autoOrbit);
  });

  document.querySelectorAll("#surfaceBtns .pill").forEach(btn => {
    btn.addEventListener("click", () => {
      surfaceProfile = btn.dataset.surface;
      document.querySelectorAll("#surfaceBtns .pill").forEach(b => b.classList.toggle("active", b === btn));
      if (layoutMode !== "wormhole") {
        layoutMode = "wormhole";
        document.querySelectorAll("#layoutBtns .pill").forEach(b => b.classList.toggle("active", b.dataset.layout === "wormhole"));
      }
      render3dFrame();
    });
  });

  document.getElementById("pinchBtn").addEventListener("click", function () {
    pinchDeSitterOn = !pinchDeSitterOn;
    this.classList.toggle("active", pinchDeSitterOn);
    render3dFrame();
  });

  document.getElementById("helixBtn").addEventListener("click", function () {
    ruledHelixOn = !ruledHelixOn;
    this.classList.toggle("active", ruledHelixOn);
    render3dFrame();
  });

  document.getElementById("bypassBtn").addEventListener("click", function () {
    bypassOn = !bypassOn;
    this.classList.toggle("active", bypassOn);
    render3dFrame();
  });

  document.getElementById("playBtn").addEventListener("click", function () {
    isPlaying = !isPlaying;
    this.textContent = isPlaying ? "⏸ Duraklat" : "▶ Oynat";
  });

  document.getElementById("speedSel").addEventListener("change", function () {
    playSpeed = Number(this.value) || 1.0;
  });

  document.getElementById("stepSlider").addEventListener("input", function () {
    currentStep = Number(this.value) || 0;
    render3dFrame();
    drawChart();
  });

  // Chart scrubbing
  const chartEl = document.getElementById("chart");
  let chartDragging = false;
  function seekChart(ev) {
    const run = currentRuns[activeCtrlKey];
    if (!run) return;
    const rect = chartEl.getBoundingClientRect();
    const padRatio = 28 / chartEl.width;
    const u = Math.max(0, Math.min(1, ((ev.clientX - rect.left) / rect.width - padRatio) / (1 - 2 * padRatio)));
    currentStep = Math.round(u * (run.res.steps - 1));
    render3dFrame();
    drawChart();
  }
  chartEl.addEventListener("pointerdown", e => { chartDragging = true; seekChart(e); });
  window.addEventListener("pointermove", e => { if (chartDragging) seekChart(e); });
  window.addEventListener("pointerup", () => { chartDragging = false; });

  // 3D Orbit + Picking
  function hitTest(clientX, clientY) {
    const rect = sceneCanvas.getBoundingClientRect();
    const dpr = sceneCanvas.width / Math.max(1, rect.width);
    const x = (clientX - rect.left) * dpr;
    const y = (clientY - rect.top) * dpr;
    for (const p of lastProjected) {
      const dx = x - p.sx, dy = y - p.sy;
      if (dx * dx + dy * dy <= (p.r + 5 * dpr) ** 2) return p.id;
    }
    return null;
  }

  sceneCanvas.addEventListener("pointerdown", e => {
    cam.dragging = true;
    cam.moved = false;
    cam.lastX = e.clientX;
    cam.lastY = e.clientY;
    sceneCanvas.setPointerCapture(e.pointerId);
  });
  sceneCanvas.addEventListener("pointermove", e => {
    if (cam.dragging) {
      const dx = e.clientX - cam.lastX;
      const dy = e.clientY - cam.lastY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) cam.moved = true;
      cam.targetYaw += dx * 0.0085;
      cam.targetPitch = Math.max(-1.42, Math.min(1.42, cam.targetPitch + dy * 0.0085));
      cam.lastX = e.clientX;
      cam.lastY = e.clientY;
    } else {
      pointerX = e.clientX;
      pointerY = e.clientY;
      hoveredId = hitTest(pointerX, pointerY);
    }
  });
  sceneCanvas.addEventListener("pointerup", e => {
    if (cam.dragging && !cam.moved) {
      const picked = hitTest(e.clientX, e.clientY);
      pinnedId = picked === pinnedId ? null : picked;
    }
    cam.dragging = false;
  });
  sceneCanvas.addEventListener("wheel", e => {
    e.preventDefault();
    cam.targetDist = Math.max(3.1, Math.min(12.0, cam.targetDist + e.deltaY * 0.004));
  }, { passive: false });

  // Populate static validation tables
  const tbody = document.querySelector("#evalTbl tbody");
  for (const s of [EVAL_SUMMARY.lax, EVAL_SUMMARY.primary, EVAL_SUMMARY.strict]) {
    const tr = document.createElement("tr");
    tr.innerHTML = "<td>" + s.sensitivity + "</td>" +
      "<td><b>" + s.means.student.mean.toFixed(2) + "±" + s.means.student.se.toFixed(2) + "</b> (%" + (s.tp.student * 100).toFixed(0) + ")</td>" +
      "<td>" + s.means.teacher.mean.toFixed(2) + "±" + s.means.teacher.se.toFixed(2) + " (%" + (s.tp.teacher * 100).toFixed(0) + ")</td>" +
      "<td>" + s.means.rule.mean.toFixed(2) + "±" + s.means.rule.se.toFixed(2) + "</td>" +
      "<td>" + s.means.greedy.mean.toFixed(2) + "±" + s.means.greedy.se.toFixed(2) + "</td>" +
      "<td>" + s.means.oracle.mean.toFixed(2) + " (d=" + s.means.oracle.d + ")</td>" +
      "<td><b>" + (s.ratios.vsTeacher * 100).toFixed(1) + "%</b></td>";
    tbody.appendChild(tr);
  }

  const kBody = document.querySelector("#kalkanTbl tbody");
  if (kBody && Array.isArray(KALKAN_SUMMARY.clusters)) {
    for (const c of KALKAN_SUMMARY.clusters) {
      const tr = document.createElement("tr");
      const cells = [
        String(c.sensitivity) + " (" + c.name + ")",
        c.baseline.kv2.mean.toFixed(2) + " / " + c.baseline.stu.mean.toFixed(2),
        c.kalkan_full.kv2.mean.toFixed(2) + " / " + c.kalkan_full.stu.mean.toFixed(2),
        c.kalkan_v2.kv2.mean.toFixed(2) + "±" + c.kalkan_v2.kv2.se.toFixed(2) + " (%" + (c.kalkan_v2.kv2Tp * 100).toFixed(1) + ")",
        c.kalkan_v2.stu.mean.toFixed(2) + "±" + c.kalkan_v2.stu.se.toFixed(2) + " (%" + (c.kalkan_v2.stuTp * 100).toFixed(1) + ")",
        "%" + (c.kalkan_v2.cleanFp * 100).toFixed(1),
        "-%" + ((1 - c.reductions.kv2Ratio) * 100).toFixed(1) + " / -%" + ((1 - c.reductions.stuRatio) * 100).toFixed(1),
      ];
      cells.forEach((val, idx) => {
        const td = document.createElement("td");
        if (idx === 3 || idx === 4 || idx === 6) {
          const b = document.createElement("b");
          b.textContent = val;
          td.appendChild(b);
        } else {
          td.textContent = val;
        }
        tr.appendChild(td);
      });
      kBody.appendChild(tr);
    }
  }

  document.getElementById("g3bModelName").textContent = GOLIATH3B_SUMMARY.model;
  document.getElementById("g3bReplay").textContent = GOLIATH3B_SUMMARY.replay.ok + "/" + GOLIATH3B_SUMMARY.replay.total;
  document.getElementById("g3bCloud").textContent = GOLIATH3B_SUMMARY.stats.cloudAtom120bRef.mean.toFixed(2);
  document.getElementById("g3bGrid").innerHTML = [
    { k: "GOLIATH-3B FLAT", v: GOLIATH3B_SUMMARY.stats.goliath3bFlat.mean.toFixed(2) + " ± " + GOLIATH3B_SUMMARY.stats.goliath3bFlat.se.toFixed(2), sub: "TP %" + (GOLIATH3B_SUMMARY.tp.goliath3bFlat * 100).toFixed(1) + " · " + GOLIATH3B_SUMMARY.callStats.goliath3bFlat.avgMs + "ms", col: "#34d399" },
    { k: "GOLIATH-3B + KOVAN", v: GOLIATH3B_SUMMARY.stats.goliath3bKovan.mean.toFixed(2) + " ± " + GOLIATH3B_SUMMARY.stats.goliath3bKovan.se.toFixed(2), sub: "TP %" + (GOLIATH3B_SUMMARY.tp.goliath3bKovan * 100).toFixed(1) + " · " + GOLIATH3B_SUMMARY.callStats.goliath3bKovan.avgMs + "ms", col: "#a78bfa" },
    { k: "Ham 3B Önceki (Flat)", v: GOLIATH3B_SUMMARY.stats.homunculusFlatRef.mean.toFixed(2) + " ± " + GOLIATH3B_SUMMARY.stats.homunculusFlatRef.se.toFixed(2), sub: "TP %" + (GOLIATH3B_SUMMARY.tp.homunculusFlatRef * 100).toFixed(1), col: "#94a3c7" },
    { k: "KOVAN-V2 (Tam)", v: GOLIATH3B_SUMMARY.stats.kovanV2.mean.toFixed(2) + " ± " + GOLIATH3B_SUMMARY.stats.kovanV2.se.toFixed(2), sub: "TP %" + (GOLIATH3B_SUMMARY.tp.kovanV2 * 100).toFixed(1), col: "#38bdf8" }
  ].map(c => '<div class="mini-box"><span style="font-size:11px;color:var(--mut)">' + c.k + '</span><b style="color:' + c.col + '">' + c.v + '</b><span style="font-size:11px;color:var(--mut)">' + c.sub + '</span></div>').join("");

  // Expose tiny debug hook for automated verification without polluting UI
  window.Goliath3D = {
    getState: () => ({ activeCtrlKey, layoutMode, surfaceProfile, pinchDeSitterOn, ruledHelixOn, bypassOn, currentStep, cam: { ...cam } }),
    getPhysics: () => ({ ...lastPhysics }),
    getRuns: () => currentRuns
  };

  function tick(ts) {
    const dt = lastFrameTs ? Math.min(0.08, (ts - lastFrameTs) / 1000) : 0.016;
    lastFrameTs = ts;
    animTime += dt;

    if (cam.autoOrbit && !cam.dragging) {
      cam.targetYaw += dt * 0.24;
    }
    cam.yaw += (cam.targetYaw - cam.yaw) * 0.16;
    cam.pitch += (cam.targetPitch - cam.pitch) * 0.16;
    cam.dist += (cam.targetDist - cam.dist) * 0.16;

    const run = currentRuns[activeCtrlKey];
    if (run && isPlaying && !chartDragging) {
      stepAccumulator += dt * 6.5 * playSpeed;
      if (stepAccumulator >= 1) {
        const adv = Math.floor(stepAccumulator);
        stepAccumulator -= adv;
        currentStep = (currentStep + adv) % run.res.steps;
        drawChart();
      }
    }

    render3dFrame();
    requestAnimationFrame(tick);
  }

  runAll();
  requestAnimationFrame(tick);
})();
</script>
</body>
</html>`;
}

if (require.main === module) {
  const html = build3dHtml();
  const out1 = path.join(__dirname, "goliath-3d.html");
  const out2 = path.join(__dirname, "goliath-student-v4.html");
  fs.writeFileSync(out1, html, "utf8");
  fs.writeFileSync(out2, html, "utf8");
  console.log(`BUILT 3D HTML: ${Buffer.byteLength(html, "utf8")} bytes -> goliath-3d.html & goliath-student-v4.html`);
}

module.exports = { build3dHtml };
