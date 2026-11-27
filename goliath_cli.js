"use strict";

// GOLIATH v4.0 CMD / Terminal Birleşik Model ve Fizik Motoru CLI
// Doğrudan: goliath.cmd [komut]  veya etkileşimli REPL için argümansız çalıştırın.

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { execFileSync, spawn } = require("child_process");

const E = require("./engine.js");
const { replay } = require("./analyze_atom.js");
const { runRule, runFixed } = require("./kovan_experiment.js");
const { runKovanV2 } = require("./kovan_v2_experiment.js");
const { extractAgentFeatures, forwardStudent } = require("./distill_student.js");
const { MODEL: G3B_MODEL, DEFAULT_BASE, callGoliath3b, runGoliathFlat, runGoliathKovan } = require("./run_goliath_3b.js");

const { validateLlmEndpointUrl } = require("./llm_security.js");

const OLLAMA_URL = validateLlmEndpointUrl(
  process.env.OLLAMA_URL || "http://127.0.0.1:11434/api/chat",
  { allowLocal: true }
);
const CHAT_MODEL = process.env.GOLIATH_CHAT_MODEL || "goliath-chat:latest";
const STUDENT_MODEL = JSON.parse(fs.readFileSync(path.join(__dirname, "student-model.json"), "utf8"));
const HTML_3D_PATH = path.join(__dirname, "goliath-3d.html");

async function streamChat(messages, onToken) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90000);
  try {
    const res = await fetch(OLLAMA_URL, {
      method: "POST",
      redirect: "error",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: CHAT_MODEL,
        stream: true,
        options: { num_predict: 420 },
        messages
      })
    });
    if (!res.ok) throw new Error("Ollama HTTP " + res.status);
    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buf = "";
    let full = "";
    let evalCount = 0;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() || "";
      for (const ln of lines) {
        const s = ln.trim();
        if (!s) continue;
        try {
          const obj = JSON.parse(s);
          const tok = obj?.message?.content || "";
          if (tok) {
            full += tok;
            if (onToken) onToken(tok);
          }
          if (obj?.eval_count) evalCount = obj.eval_count;
        } catch (_) {}
      }
    }
    if (buf.trim()) {
      try {
        const obj = JSON.parse(buf.trim());
        const tok = obj?.message?.content || "";
        if (tok) {
          full += tok;
          if (onToken) onToken(tok);
        }
        if (obj?.eval_count) evalCount = obj.eval_count;
      } catch (_) {}
    }
    return { raw: full.trim(), ms: Date.now() - t0, evalCount };
  } finally {
    clearTimeout(timer);
  }
}

const WH_RS = 0.44, WH_YFLAT = 1.38, WH_LAM = 0.72;

function whSurfaceR(y, rsNow = WH_RS, yScale = 1.0) {
  const yFlat = WH_YFLAT * yScale;
  const a = Math.min(0.985, Math.abs(y) / yFlat);
  const u = 0.5 * Math.log((1 + a) / (1 - a));
  return rsNow + (WH_LAM * u) * (WH_LAM * u);
}

// 1. Topolojik Dengeli Min-Cut Bölümlemesi (yapay L0 boğaz bypass'larını en aza indirir)
function computeMinCutHemispheres(res) {
  const n = res.degrees.length;
  const layerOf = res.layers;
  const adj = res.adj;
  const buckets = [[], [], []];
  for (let i = 0; i < n; i++) buckets[layerOf[i]].push(i);

  const audit = hArr => {
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

  const naive = new Int8Array(n);
  buckets[1].forEach((id, k) => { naive[id] = k % 2 ? -1 : 1; });
  buckets[2].forEach((id, k) => { naive[id] = k % 2 ? -1 : 1; });
  const naiveStats = audit(naive);

  const hemi = new Int8Array(n);
  const half1 = Math.ceil(buckets[1].length / 2);
  buckets[1].forEach((id, k) => { hemi[id] = k < half1 ? 1 : -1; });
  for (const id of buckets[2]) {
    let sc = 0;
    for (const j of buckets[1]) if (adj[id][j] > 0) sc += hemi[j];
    hemi[id] = sc >= 0 ? 1 : -1;
  }
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

  const mcStats = audit(hemi);
  const reductionPct = naiveStats.bypassCount > 0
    ? ((naiveStats.bypassCount - mcStats.bypassCount) / naiveStats.bypassCount) * 100
    : 0;
  return {
    hemi,
    buckets,
    ...mcStats,
    naiveBypassCount: naiveStats.bypassCount,
    reductionPct
  };
}

// 2. Katenoid Minimal Yüzey Açısal Gerilim Gevşetmesi
function computeCatenoidReduction(res, part) {
  const n = res.degrees.length;
  const adj = res.adj;
  const hemi = part.hemi;
  const baseY = new Float64Array(n);
  const l1Top = part.buckets[1].filter(id => hemi[id] > 0);
  const l1Bot = part.buckets[1].filter(id => hemi[id] < 0);
  const l2Top = part.buckets[2].filter(id => hemi[id] > 0);
  const l2Bot = part.buckets[2].filter(id => hemi[id] < 0);
  for (const id of l1Top) baseY[id] = 0.98;
  for (const id of l1Bot) baseY[id] = -0.98;
  for (const id of l2Top) baseY[id] = 1.29;
  for (const id of l2Bot) baseY[id] = -1.29;

  const groups = [
    { ids: part.buckets[0], phase: 0.35 },
    { ids: l1Top, phase: 0.2 },
    { ids: l1Bot, phase: 0.2 },
    { ids: l2Top, phase: 0.05 },
    { ids: l2Bot, phase: 0.05 }
  ];
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

  const energy = aArr => {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (adj[i][j] === 0) continue;
        const rI = whSurfaceR(baseY[i]), rJ = whSurfaceR(baseY[j]);
        const dx = rI * Math.cos(aArr[i]) - rJ * Math.cos(aArr[j]);
        const dy = baseY[i] - baseY[j];
        const dz = rI * Math.sin(aArr[i]) - rJ * Math.sin(aArr[j]);
        sum += dx * dx + dy * dy + dz * dz;
      }
    }
    return sum;
  };

  const before = energy(ang);
  for (let it = 0; it < 20; it++) {
    const next = Float64Array.from(ang);
    for (let gi = 1; gi < groups.length; gi++) {
      const ids = groups[gi].ids;
      if (ids.length <= 1) continue;
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
  const after = energy(ang);
  return { catenoidReductionPct: before > 0 ? Math.max(0, ((before - after) / before) * 100) : 0 };
}

function buildStepD(steps, log, fallbackD) {
  const out = new Array(steps);
  let idx = 0, cur = {};
  for (let t = 0; t < steps; t++) {
    while (idx < log.length && log[idx].t <= t) {
      cur = log[idx].decision || cur;
      idx++;
    }
    out[t] = cur || fallbackD || {};
  }
  return out;
}

// 3. Z-Pinch + de Sitter Eğrilik Profili (snap + dByStep üzerinden)
function computePinchProfile(res, dByStep, sampleSteps = [0, 16, 32, 40, 48, 64, 79]) {
  const rows = [];
  for (const rawT of sampleSteps) {
    const t = Math.min(res.steps - 1, rawT);
    const snap = res.snapshots[t];
    const dMap = dByStep[t] || {};
    let l0Sum = 0, l0N = 0;
    for (let i = 0; i < res.layers.length; i++) {
      if (res.layers[i] === 0 && snap.alive[i] === 1) { l0Sum += snap.stress[i]; l0N++; }
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
    const rsNow = WH_RS * (1 - 0.24 * pinchPressure);
    const yScaleNow = 1 + 0.16 * (1 - res.csi[t]);
    rows.push({
      t,
      csi: res.csi[t],
      extracted: res.extractedHist[t],
      quar: res.quarCount[t],
      coreStress,
      activeDrain,
      pinchPressure,
      rsNow,
      yScaleNow
    });
  }
  return rows;
}

function runStudentWithSnapshots(seed, sigma) {
  const sim = new E.GoliathSim({ ...DEFAULT_BASE, quarantine_sensitivity: sigma, seed, recordSnapshots: true });
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
    for (const s of samples) dec.d[s.id] = forwardStudent(STUDENT_MODEL, s.x);
    inferMs += performance.now() - t0;
    log.push({ t: obs.t, decision: dec.d });
    r = g.next(dec);
  }
  const res = r.value;
  return {
    seed,
    mode: "student",
    extracted: res.extracted,
    tp: res.tp,
    totalChaos: res.totalChaos,
    csi: res.csi[res.steps - 1],
    inferMs,
    log,
    res,
    dByStep: buildStepD(res.steps, log)
  };
}

function runLocalModelWithSnapshots(model, seed, sigma) {
  if (model === "student") return runStudentWithSnapshots(seed, sigma);

  const cfg = { ...DEFAULT_BASE, quarantine_sensitivity: sigma, seed };
  if (model === "greedy" || model === "oracle") {
    const dVal = model === "greedy" ? 0.8 : (sigma >= 0.7 ? 0.2 : 0.3);
    const sim = new E.GoliathSim({ ...cfg, decision_epoch: 0, drain_intensity: dVal, recordSnapshots: true });
    const res = sim.run();
    const row = {};
    for (const id of res.agents) row[id] = dVal;
    const dByStep = Array.from({ length: res.steps }, () => row);
    return { seed, mode: model, dVal, extracted: res.extracted, tp: res.tp, totalChaos: res.totalChaos, csi: res.csi[res.steps - 1], log: null, res, dByStep };
  }

  // Run rule / kovan with recordSnapshots:true via fast replay helper on canonical run
  const baseRun = model === "kovan" ? runKovanV2(seed, sigma) : runRule(seed, sigma);
  const sim = new E.GoliathSim({ ...cfg, recordSnapshots: true });
  const g = sim._runGen();
  let r = g.next(), k = 0;
  while (!r.done) {
    r = g.next({ d: baseRun.log[k].decision });
    k++;
  }
  const res = r.value;
  return {
    ...baseRun,
    csi: res.csi[res.steps - 1],
    res,
    dByStep: buildStepD(res.steps, baseRun.log)
  };
}

async function runAnyModel(model, seed, sigma) {
  if (model === "3b-flat" || model === "3b-kovan") {
    const run = model === "3b-flat" ? await runGoliathFlat(seed, sigma) : await runGoliathKovan(seed, sigma);
    const sim = new E.GoliathSim({ ...DEFAULT_BASE, quarantine_sensitivity: sigma, seed, recordSnapshots: true });
    const g = sim._runGen();
    let r = g.next(), k = 0;
    while (!r.done) { r = g.next({ d: run.log[k].decision }); k++; }
    return { ...run, res: r.value, dByStep: buildStepD(r.value.steps, run.log) };
  }
  return runLocalModelWithSnapshots(model, seed, sigma);
}

function verifyReplay(run, sigma) {
  if (!run.log) return true; // fixed drain run
  const rep = replay({ ...DEFAULT_BASE, quarantine_sensitivity: sigma }, run);
  return Math.abs(rep.extracted - run.extracted) < 1e-9 && rep.tp === run.tp;
}

function throatBar(rsNow) {
  const width = Math.max(2, Math.min(18, Math.round((rsNow / WH_RS) * 14)));
  const pad = " ".repeat(Math.max(0, Math.floor((14 - width) / 2)));
  return pad + "[" + "=".repeat(width) + "]";
}

function printPhysicsReport(run, sigma) {
  const part = computeMinCutHemispheres(run.res);
  const cat = computeCatenoidReduction(run.res, part);
  const prof = computePinchProfile(run.res, run.dByStep);

  console.log(`\n=== GOLIATH v4.0 EINSTEIN–ROSEN & 5-METODOLOJİ FİZİK RAPORU ===`);
  console.log(`Model=${run.mode} | seed=${run.seed} | sigma=${sigma} | Çalınan=${run.extracted.toFixed(2)} | TP=${run.tp}/${run.totalChaos}`);
  console.log(`1) Einstein–Rosen Min-Cut : Boğaz(L0)=${part.thruL0} | Aynı-Yarıküre=${part.sameHemi} | Bypass=${part.bypassCount} (Ham k%2=${part.naiveBypassCount} -> -%${part.reductionPct.toFixed(1)})`);
  console.log(`2) Katenoid Minimal Yüzey: Çembersel Gerilim Azalması = -%${cat.catenoidReductionPct.toFixed(1)}`);
  console.log(`3) Çift Regle Hiperboloid: 12+12 ters sarmal gergi ekseni (r_0=${WH_RS.toFixed(2)}, double_helix=true)`);
  console.log(`\n4-5) Z-Pinch Boğaz Sıkışması & de Sitter CSI Eğriliği:`);
  console.log(`  t   CSI    Çalınan  Karant.  Stres(L0)  Basınç   r_s    yScale  Boğaz Profili`);
  for (const row of prof) {
    console.log(
      ` ${String(row.t).padStart(2)}  ${row.csi.toFixed(3)}   ${row.extracted.toFixed(2).padStart(6)}    ${String(row.quar).padStart(2)}/12     ${row.coreStress.toFixed(3)}   ${(row.pinchPressure * 100).toFixed(0).padStart(3)}%   ${row.rsNow.toFixed(3)}  ${row.yScaleNow.toFixed(3)}x  ${throatBar(row.rsNow)}`
    );
  }
}

function printStatus() {
  let psOut = "(Ollama ps alınamadı)";
  try {
    psOut = execFileSync("ollama", ["ps"], { encoding: "utf8", timeout: 5000 }).trim();
  } catch (e) {
    psOut = "Hata: " + e.message;
  }
  console.log(`=== GOLIATH CMD DURUM ===`);
  console.log(`Sohbet 3.1B : ${CHAT_MODEL}`);
  console.log(`Strateji 3B : ${G3B_MODEL}`);
  console.log(`Öğrenci MLP : 353 parametre (${fs.statSync(path.join(__dirname, "student-model.json")).size} bayt, 0 GPU)`);
  console.log(`3B HTML     : ${fs.existsSync(HTML_3D_PATH) ? fs.statSync(HTML_3D_PATH).size + " bayt" : "yok"} -> ${HTML_3D_PATH}`);
  console.log(psOut);
}

function open3dInBrowser() {
  if (!fs.existsSync(HTML_3D_PATH)) {
    console.error("Hata: goliath-3d.html bulunamadı:", HTML_3D_PATH);
    return;
  }
  if (process.platform === "win32") {
    spawn("cmd.exe", ["/c", "start", "", HTML_3D_PATH], { detached: true, stdio: "ignore" }).unref();
  }
  console.log("3B Simülatör açıldı:", HTML_3D_PATH);
}

function printHelp() {
  console.log(`GOLIATH v4.0 CMD Birleşik Model & Simülasyon Aracı
Kullanım:
  goliath.cmd                              Etkileşimli CMD konsolunu başlat (goliath-3b + simülasyon)
  goliath.cmd chat "<soru>"                3.1B GPU modeline doğrudan soru sor
  goliath.cmd sim [--seed 11200] [--sigma 0.55] [--model student|kovan|3b-flat|3b-kovan|rule|greedy]
  goliath.cmd duel [--seed 11200] [--sigma 0.55] [--with-3b]
  goliath.cmd physics [--seed 11200] [--sigma 0.55] [--model student|kovan]
  goliath.cmd status                       Öğrenci MLP & canlı Ollama GPU/VRAM durumunu göster
  goliath.cmd 3d                           goliath-3d.html görsel arayüzünü tarayıcıda aç

Etkileşimli Mod İçi Komutlar:
  /sim [seed] [sigma] [model] | /duel [seed] [sigma] | /fizik [seed] [sigma] | /3d | /durum | /cikis`);
}

function parseFlag(args, flag, fallback) {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : fallback;
}

async function runDuelCmd(seed, sigma, with3b) {
  const list = [
    runLocalModelWithSnapshots("student", seed, sigma),
    runLocalModelWithSnapshots("kovan", seed, sigma),
    runLocalModelWithSnapshots("rule", seed, sigma),
    runLocalModelWithSnapshots("greedy", seed, sigma),
    runLocalModelWithSnapshots("oracle", seed, sigma)
  ];
  if (with3b) {
    list.push(await runAnyModel("3b-flat", seed, sigma));
    list.push(await runAnyModel("3b-kovan", seed, sigma));
  }
  console.log(`\n=== GOLIATH DÜELLO (seed=${seed}, sigma=${sigma}) ===`);
  console.log("Model             Çalınan    TP      CSI    Replay   Not");
  for (const x of list) {
    const ok = verifyReplay(x, sigma) ? "OK" : "FAIL";
    const lbl = (x.mode === "oracle" ? `oracle(d=${x.dVal})` : x.mode).padEnd(16);
    const note = x.inferMs !== undefined ? `${x.inferMs.toFixed(2)} ms (353p)` : "-";
    console.log(
      `${lbl}  ${x.extracted.toFixed(2).padStart(7)}  ${String(x.tp).padStart(2)}/${String(x.totalChaos).padEnd(2)}   ${x.csi.toFixed(3)}   ${ok.padEnd(6)}   ${note}`
    );
  }
}

function extractSeedAndSigma(line) {
  const mSeed = line.match(/\b(\d{3,6})\b/);
  const mSig = line.match(/\b(0\.\d{1,2})\b/);
  return {
    seed: mSeed ? Number(mSeed[1]) : 11200,
    sigma: mSig ? Math.max(0.1, Math.min(0.95, Number(mSig[1]))) : 0.55
  };
}

function runNaturalTelemetryNote(seed, sigma) {
  const st = runLocalModelWithSnapshots("student", seed, sigma);
  const kv = runLocalModelWithSnapshots("kovan", seed, sigma);
  const ru = runLocalModelWithSnapshots("rule", seed, sigma);
  const gr = runLocalModelWithSnapshots("greedy", seed, sigma);
  const part = computeMinCutHemispheres(st.res);
  const cat = computeCatenoidReduction(st.res, part);
  const prof = computePinchProfile(st.res, st.dByStep, [0, 40, 79]);
  const mid = prof[1];
  const note = `[Canlı Koşu seed=${seed}, sigma=${sigma}] Öğrenci=${st.extracted.toFixed(2)} (TP ${st.tp}/${st.totalChaos}, ${st.inferMs.toFixed(2)}ms) | KOVAN-V2=${kv.extracted.toFixed(2)} | KURAL=${ru.extracted.toFixed(2)} | Açgözlü=${gr.extracted.toFixed(2)} | Boğaz(L0)=${part.thruL0}, Bypass=${part.bypassCount} (Ham ${part.naiveBypassCount}, -%${part.reductionPct.toFixed(1)}) | Katenoid=-%${cat.catenoidReductionPct.toFixed(1)} | t=40 Z-Pinch r_s=${mid.rsNow.toFixed(3)} (%${Math.round(mid.pinchPressure * 100)})`;
  console.log("\n" + note);
  return note;
}

async function startRepl() {
  console.log("GOLIATH Sohbet (3.1B Yerel GPU) — Normal Türkçe yazıp konuşabilirsin.");
  console.log('(Çıkmak için "çık" yazabilirsin.)');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const isInteractive = Boolean(process.stdin.isTTY);
  const history = [];
  const EXIT_SET = new Set(["çık", "cik", "çıkış", "cikis", "kapat", "bye", "exit", "quit", "/cikis", "/exit"]);

  if (isInteractive) process.stdout.write("\nSen > ");
  for await (const rawLine of rl) {
    const line = rawLine.trim();
    if (!line) {
      if (isInteractive) process.stdout.write("Sen > ");
      continue;
    }
    if (EXIT_SET.has(line.toLowerCase())) {
      console.log("GOLIATH > Görüşürüz!");
      rl.close();
      return;
    }
    try {
      const low = line.toLowerCase();
      if (line.startsWith("/")) {
        const parts = line.split(/\s+/);
        const cmd = parts[0].toLowerCase();
        const seed = Number(parts[1]) || 11200;
        const sigma = Number(parts[2]) || 0.55;
        const model = (parts[3] || "student").toLowerCase();
        if (cmd === "/yardim" || cmd === "/help") printHelp();
        else if (cmd === "/durum" || cmd === "/status") printStatus();
        else if (cmd === "/3d") open3dInBrowser();
        else if (cmd === "/duel") await runDuelCmd(seed, sigma, false);
        else if (cmd === "/fizik" || cmd === "/physics") {
          const run = await runAnyModel(model, seed, sigma);
          printPhysicsReport(run, sigma);
        } else if (cmd === "/sim") {
          const run = await runAnyModel(model, seed, sigma);
          const ok = verifyReplay(run, sigma) ? "OK" : "FAIL";
          console.log(`[${run.mode}] seed=${seed} sigma=${sigma} | Çalınan=${run.extracted.toFixed(2)} | TP=${run.tp}/${run.totalChaos} | CSI=${run.csi.toFixed(3)} | replay=${ok}`);
        } else {
          console.log("Bilinmeyen komut.");
        }
      } else if (/(3d|3b|görsel|arayüz|ekran).*aç|aç.*(3d|3b|görsel)/i.test(low)) {
        open3dInBrowser();
        console.log("GOLIATH > 3B Einstein–Rosen simülatörünü tarayıcıda açtım!");
      } else {
        let userContent = line;
        if (/(simülasyon|düello|test et|koştur|fizik rapor)/i.test(low)) {
          const { seed, sigma } = extractSeedAndSigma(line);
          const note = runNaturalTelemetryNote(seed, sigma);
          userContent = line + "\n\n(Sistem ölçüm sonucu: " + note + " — bunu doğal sohbetle kısaca yorumla.)";
        }
        history.push({ role: "user", content: userContent });
        while (history.length > 16) history.shift();

        process.stdout.write("\nGOLIATH > ");
        const out = await streamChat(history, tok => process.stdout.write(tok));
        process.stdout.write("\n");
        if (out.raw) {
          history.push({ role: "assistant", content: out.raw });
          while (history.length > 16) history.shift();
        }
      }
    } catch (e) {
      console.error("\nHata:", e.message);
    }
    if (isInteractive) process.stdout.write("\nSen > ");
  }
}

if (require.main === module) {
  (async () => {
    const [, , rawCmd, ...rest] = process.argv;
    if (!rawCmd) {
      await startRepl();
      return;
    }
    const cmd = rawCmd.toLowerCase();
    if (cmd === "--help" || cmd === "-h" || cmd === "help") {
      printHelp();
      return;
    }
    if (cmd === "status") {
      printStatus();
      return;
    }
    if (cmd === "3d") {
      open3dInBrowser();
      return;
    }
    if (cmd === "chat") {
      const prompt = rest.join(" ").trim() || "selam naber";
      process.stdout.write("GOLIATH > ");
      await streamChat([{ role: "user", content: prompt }], tok => process.stdout.write(tok));
      process.stdout.write("\n");
      return;
    }
    if (cmd === "sim") {
      const seed = Number(parseFlag(rest, "--seed", "11200"));
      const sigma = Number(parseFlag(rest, "--sigma", "0.55"));
      const model = parseFlag(rest, "--model", "student").toLowerCase();
      const run = await runAnyModel(model, seed, sigma);
      const ok = verifyReplay(run, sigma) ? "OK" : "FAIL";
      const extra = run.inferMs !== undefined ? ` | infer=${run.inferMs.toFixed(2)}ms` : "";
      console.log(`[${run.mode}] seed=${seed} sigma=${sigma} | Çalınan=${run.extracted.toFixed(2)} | TP=${run.tp}/${run.totalChaos} | CSI=${run.csi.toFixed(3)}${extra} | replay=${ok}`);
      return;
    }
    if (cmd === "duel") {
      const seed = Number(parseFlag(rest, "--seed", "11200"));
      const sigma = Number(parseFlag(rest, "--sigma", "0.55"));
      const with3b = rest.includes("--with-3b");
      await runDuelCmd(seed, sigma, with3b);
      return;
    }
    if (cmd === "physics" || cmd === "fizik") {
      const seed = Number(parseFlag(rest, "--seed", "11200"));
      const sigma = Number(parseFlag(rest, "--sigma", "0.55"));
      const model = parseFlag(rest, "--model", "student").toLowerCase();
      const run = await runAnyModel(model, seed, sigma);
      printPhysicsReport(run, sigma);
      return;
    }
    console.error("Bilinmeyen komut:", rawCmd);
    printHelp();
    process.exit(1);
  })();
}

module.exports = { computeMinCutHemispheres, computeCatenoidReduction, computePinchProfile, runStudentWithSnapshots };
