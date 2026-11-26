"use strict";

// H-GOLIATH-3B Kıyaslama Deneyi:
// Özel GOLIATH-3B Modelfile (system override YOK) vs Ham/KOVAN homunculus-q3 vs 120B Bulut ATOM
// Çalıştırma: node benchmark_goliath_3b.js

const fs = require("fs");
const path = require("path");
const E = require("./engine.js");
const { replay } = require("./analyze_atom.js");
const { runRule, runFixed } = require("./kovan_experiment.js");
const { runKovanV2 } = require("./kovan_v2_experiment.js");
const { MODEL, DEFAULT_BASE, callGoliath3b, runGoliathFlat, runGoliathKovan } = require("./run_goliath_3b.js");

const SEEDS = [9700, 9701, 9702, 9703];
const SENSITIVITY = 0.55;

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
          rationales.push({
            seed: r.seed,
            t: e.t,
            action: c.json.action || "d",
            gerekce: String(c.json.gerekce),
          });
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
    const baseCfg = { ...DEFAULT_BASE, quarantine_sensitivity: SENSITIVITY };
    const prevDuel = JSON.parse(
      fs.readFileSync(path.join(__dirname, "local-duel-results.json"), "utf8")
    );

    const flatRuns = [];
    const kovanRuns = [];

    console.log(`=== GOLIATH-3B (${MODEL}) Flat Kontrol (seed 9700-9703) ===`);
    for (const s of SEEDS) {
      const r = await runGoliathFlat(s, SENSITIVITY);
      flatRuns.push(r);
      console.log(`  [goliath-3b flat] seed ${s}: extracted=${r.extracted.toFixed(2)}, TP=${r.tp}/${r.totalChaos}`);
    }

    console.log(`=== GOLIATH-3B (${MODEL}) + KOVAN İskelesi (seed 9700-9703) ===`);
    for (const s of SEEDS) {
      const r = await runGoliathKovan(s, SENSITIVITY);
      kovanRuns.push(r);
      console.log(`  [goliath-3b kovan] seed ${s}: extracted=${r.extracted.toFixed(2)}, TP=${r.tp}/${r.totalChaos}`);
    }

    const v2Runs = SEEDS.map((s) => runKovanV2(s, SENSITIVITY));
    const ruleRuns = SEEDS.map((s) => runRule(s, SENSITIVITY));
    const greedyRuns = SEEDS.map((s) => runFixed(s, SENSITIVITY, 0.8));
    const oracleD = prevDuel.stats.oracle.d;
    const oracleRuns = SEEDS.map((s) => runFixed(s, SENSITIVITY, oracleD));

    let replayOk = 0;
    let replayTotal = 0;
    for (const run of [...flatRuns, ...kovanRuns]) {
      replayTotal += 1;
      const rep = replay(baseCfg, run);
      if (rep.extracted === run.extracted && rep.tp === run.tp) replayOk += 1;
    }

    const ex = (arr) => arr.map((r) => r.extracted);
    const tpMean = (arr) => E.meanSe(arr.map((r) => r.tp / r.totalChaos)).mean;

    const stats = {
      goliath3bKovan: E.meanSe(ex(kovanRuns)),
      goliath3bFlat: E.meanSe(ex(flatRuns)),
      homunculusKovanRef: prevDuel.stats.localKovan,
      homunculusFlatRef: prevDuel.stats.localFlat,
      cloudAtom120bRef: prevDuel.stats.cloudAtom120bRef,
      kovanV2: E.meanSe(ex(v2Runs)),
      rule: E.meanSe(ex(ruleRuns)),
      greedy: E.meanSe(ex(greedyRuns)),
      oracle: { d: oracleD, ...E.meanSe(ex(oracleRuns)) },
    };

    const tp = {
      goliath3bKovan: tpMean(kovanRuns),
      goliath3bFlat: tpMean(flatRuns),
      homunculusKovanRef: prevDuel.tp.localKovan,
      homunculusFlatRef: prevDuel.tp.localFlat,
      cloudAtom120bRef: prevDuel.tp.cloudAtom120bRef,
      kovanV2: tpMean(v2Runs),
      rule: tpMean(ruleRuns),
      greedy: tpMean(greedyRuns),
      oracle: tpMean(oracleRuns),
    };

    const callStats = {
      goliath3bFlat: summarizeCalls(flatRuns),
      goliath3bKovan: summarizeCalls(kovanRuns),
    };

    const chatPrompts = [
      "Sen kimsin ve ne işe yararsın? 2 cümle.",
      "GOLIATH'ta derece-asimetrisi neden hub düğümlerde daha düşük d gerektirir? Kısa açıkla.",
      "353 parametreli damıtılmış öğrenci modelin birincil rejimdeki sonucu neydi?",
    ];
    const sanityChecks = [];
    const leakRe = /NewsMatrix|Homunculus/i;
    for (const q of chatPrompts) {
      const resp = await callGoliath3b(q, { jsonMode: false, maxTokens: 220 });
      sanityChecks.push({
        prompt: q,
        answer: resp.raw,
        ms: resp.ms,
        tokens: resp.evalCount,
        leakageDetected: leakRe.test(resp.raw),
      });
    }

    const out = {
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - t0,
      model: MODEL,
      seeds: SEEDS,
      sensitivity: SENSITIVITY,
      replay: { ok: replayOk, total: replayTotal },
      perSeed: SEEDS.map((s, i) => ({
        seed: s,
        goliath3bKovan: kovanRuns[i].extracted,
        goliath3bFlat: flatRuns[i].extracted,
        homunculusKovanRef: prevDuel.perSeed[i].localKovan,
        homunculusFlatRef: prevDuel.perSeed[i].localFlat,
        cloudAtom120bRef: prevDuel.perSeed[i].cloudAtom120bRef,
        kovanV2: v2Runs[i].extracted,
        rule: ruleRuns[i].extracted,
        greedy: greedyRuns[i].extracted,
        oracle: oracleRuns[i].extracted,
      })),
      stats,
      tp,
      callStats,
      sanityChecks,
      anyLeakage: sanityChecks.some((x) => x.leakageDetected),
    };

    fs.writeFileSync(path.join(__dirname, "goliath-3b-eval.json"), JSON.stringify(out, null, 2), "utf8");

    console.log(`\n=== GOLIATH-3B BENCHMARK (seeds 9700-9703, sigma=0.55) | replay ${replayOk}/${replayTotal} ===`);
    console.log(`GOLIATH-3B + KOVAN : ${fmt(stats.goliath3bKovan)} (TP %${(tp.goliath3bKovan * 100).toFixed(1)}, bad ${callStats.goliath3bKovan.bad}/${callStats.goliath3bKovan.total}, ${callStats.goliath3bKovan.avgMs}ms/call)`);
    console.log(`GOLIATH-3B FLAT    : ${fmt(stats.goliath3bFlat)} (TP %${(tp.goliath3bFlat * 100).toFixed(1)}, bad ${callStats.goliath3bFlat.bad}/${callStats.goliath3bFlat.total}, ${callStats.goliath3bFlat.avgMs}ms/call)`);
    console.log(`homunculus-q3 KOVAN: ${fmt(stats.homunculusKovanRef)} (TP %${(tp.homunculusKovanRef * 100).toFixed(1)})`);
    console.log(`homunculus-q3 FLAT : ${fmt(stats.homunculusFlatRef)} (TP %${(tp.homunculusFlatRef * 100).toFixed(1)})`);
    console.log(`CLOUD-ATOM 120B    : ${fmt(stats.cloudAtom120bRef)} (TP %${(tp.cloudAtom120bRef * 100).toFixed(1)})`);
    console.log(`KOVAN-V2           : ${fmt(stats.kovanV2)} (TP %${(tp.kovanV2 * 100).toFixed(1)}) | KURAL: ${fmt(stats.rule)} | Açgözlü 0.8: ${fmt(stats.greedy)}`);
    console.log(`SANITY LEAKAGE     : ${out.anyLeakage}`);
    for (const s of sanityChecks) {
      console.log(`  Q: ${s.prompt}\n  A (${s.ms}ms, leak=${s.leakageDetected}): ${s.answer.replace(/\r?\n/g, " ")}`);
    }
  })();
}
