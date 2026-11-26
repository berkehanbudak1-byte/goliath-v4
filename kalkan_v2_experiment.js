"use strict";

// H-KALKAN-V2 Ön Kayıtlı Deneyi: Derece-Normalize Drift Kalkanı vs KOVAN-V2 & 353p Öğrenci Modeli
// Çalıştırma: node kalkan_v2_experiment.js

const fs = require("fs");
const path = require("path");
const E = require("./engine.js");
const { replay } = require("./analyze_atom.js");
const {
  BASE,
  rangeSeeds,
  runKovanV2,
  runStudent,
  runRule,
  runFixed,
  summarize,
  pairDiff,
  runCleanNetworkFp,
} = require("./kalkan_experiment.js");

function evalClusterV2(name, sensitivity, seeds) {
  const detectors = ["baseline", "kalkan_full", "kalkan_v2"];
  const byDet = {};
  let replayOk = 0;
  let replayTot = 0;

  for (const det of detectors) {
    const kv2 = seeds.map((s) => runKovanV2(s, sensitivity, det));
    const stu = seeds.map((s) => runStudent(s, sensitivity, det));
    const rul = seeds.map((s) => runRule(s, sensitivity, det));
    const fixedByD = [0.2, 0.3, 0.4].map((d) => ({
      d,
      runs: seeds.map((s) => runFixed(s, sensitivity, det, d)),
    }));
    const bestFixed = fixedByD
      .map((x) => ({ d: x.d, runs: x.runs, mean: E.meanSe(x.runs.map((r) => r.extracted)).mean }))
      .reduce((a, b) => (b.mean > a.mean ? b : a));

    if (det === "kalkan_v2") {
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
  const v2 = byDet.kalkan_v2;
  const dropKv2 = pairDiff(base._raw.kv2, v2._raw.kv2);
  const dropStu = pairDiff(base._raw.stu, v2._raw.stu);
  for (const det of detectors) delete byDet[det]._raw;

  return {
    name,
    sensitivity,
    seedRange: [seeds[0], seeds[seeds.length - 1]],
    n: seeds.length,
    replay: { ok: replayOk, total: replayTot },
    detectors: byDet,
    reductions: {
      kv2Ratio: v2.kovan_v2.extracted.mean / base.kovan_v2.extracted.mean,
      kv2Drop: dropKv2,
      stuRatio: v2.student_353p.extracted.mean / base.student_353p.extracted.mean,
      stuDrop: dropStu,
    },
  };
}

function main() {
  const clusters = [
    evalClusterV2("birincil", 0.55, rangeSeeds(12200, 50)),
    evalClusterV2("gevsek", 0.35, rangeSeeds(12250, 50)),
    evalClusterV2("siki", 0.75, rangeSeeds(12300, 50)),
  ];

  const pri = clusters[0];
  const pV2 = pri.detectors.kalkan_v2;
  const critA =
    pri.reductions.kv2Ratio <= 0.30 &&
    pri.reductions.kv2Drop.mean > 2 * pri.reductions.kv2Drop.se &&
    pri.reductions.stuRatio <= 0.30 &&
    pri.reductions.stuDrop.mean > 2 * pri.reductions.stuDrop.se;
  const critB = pV2.kovan_v2.tpRate.mean >= 0.90 && pV2.student_353p.tpRate.mean >= 0.90;
  const critC =
    pV2.kovan_v2.fpRate.mean <= 0.03 &&
    pV2.student_353p.fpRate.mean <= 0.03 &&
    clusters.every((c) => c.detectors.kalkan_v2.cleanFp.mean <= 0.02);
  const critD = clusters.every(
    (c) =>
      c.reductions.kv2Ratio <= 0.40 &&
      c.reductions.kv2Drop.mean > 2 * c.reductions.kv2Drop.se &&
      c.reductions.stuRatio <= 0.40 &&
      c.reductions.stuDrop.mean > 2 * c.reductions.stuDrop.se
  );

  const report = {
    experiment: "H-KALKAN-V2",
    date: new Date().toISOString(),
    clusters,
    criteria: { a_drop70: critA, b_tp90: critB, c_fpShield: critC, d_multiRegime: critD },
    supported: critA && critB && critC && critD,
  };

  fs.writeFileSync(path.join(__dirname, "kalkan-v2-results.json"), JSON.stringify(report, null, 2));

  const fmt = (ms) => `${ms.mean.toFixed(2)}±${ms.se.toFixed(2)}`;
  const pct = (ms) => `%${(ms.mean * 100).toFixed(1)}`;
  console.log("=== H-KALKAN-V2 KÖR SAVUNMA DENEYİ (150 AYRIK SEED: 12200-12349) ===");
  for (const c of clusters) {
    console.log(`\n[${c.name.toUpperCase()} sigma=${c.sensitivity} | replay ${c.replay.ok}/${c.replay.total}]`);
    for (const det of ["baseline", "kalkan_full", "kalkan_v2"]) {
      const d = c.detectors[det];
      console.log(
        `  ${det.padEnd(12)} | KV2: ${fmt(d.kovan_v2.extracted)} (TP ${pct(d.kovan_v2.tpRate)}, FP ${pct(d.kovan_v2.fpRate)}) | 353p: ${fmt(d.student_353p.extracted)} (TP ${pct(d.student_353p.tpRate)}, FP ${pct(d.student_353p.fpRate)}) | Kâhin(d=${d.oracle.d}): ${fmt(d.oracle.extracted)} | TemizFP: ${pct(d.cleanFp)}`
      );
    }
    console.log(
      `  -> V2 Düşüş: KV2 ${(c.reductions.kv2Ratio * 100).toFixed(1)}% (-${fmt(c.reductions.kv2Drop)}), 353p ${(c.reductions.stuRatio * 100).toFixed(1)}% (-${fmt(c.reductions.stuDrop)})`
    );
  }
  console.log("\n=== ÖN KAYITLI KRİTERLER ===");
  console.log(`(a) >=%70 Çalım Düşüşü (birincil): ${critA ? "✓" : "✗"}`);
  console.log(`(b) >=%90 TP (KV2 & 353p):       ${critB ? "✓" : "✗"}`);
  console.log(`(c) Sıkı FP Kalkanı (<=%3 / %2): ${critC ? "✓" : "✗"}`);
  console.log(`(d) 3 Rejimde >=%60 Düşüş:       ${critD ? "✓" : "✗"}`);
  console.log(`GENEL HÜKÜM: ${report.supported ? "DESTEKLENDİ" : "KISMI / REVİZYON GEREKLİ"}`);
}

if (require.main === module) {
  main();
}
