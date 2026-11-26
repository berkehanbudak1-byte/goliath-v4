"use strict";

// H-KALKAN-V3 Ön Kayıtlı Deneyi: Ölü-Bölge + Eşzamanlı Süreklilik Drift Kalkanı vs KOVAN-V2 & 353p Öğrenci Modeli
// Çalıştırma: node kalkan_v3_experiment.js

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

function evalClusterV3(name, sensitivity, seeds) {
  const detectors = ["baseline", "kalkan_v2", "kalkan_v3"];
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

    if (det === "kalkan_v3") {
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
  const v3 = byDet.kalkan_v3;
  const dropKv2 = pairDiff(base._raw.kv2, v3._raw.kv2);
  const dropStu = pairDiff(base._raw.stu, v3._raw.stu);
  for (const det of detectors) delete byDet[det]._raw;

  return {
    name,
    sensitivity,
    seedRange: [seeds[0], seeds[seeds.length - 1]],
    n: seeds.length,
    replay: { ok: replayOk, total: replayTot },
    detectors: byDet,
    reductions: {
      kv2Ratio: v3.kovan_v2.extracted.mean / base.kovan_v2.extracted.mean,
      kv2Drop: dropKv2,
      stuRatio: v3.student_353p.extracted.mean / base.student_353p.extracted.mean,
      stuDrop: dropStu,
    },
  };
}

function main() {
  const clusters = [
    evalClusterV3("birincil", 0.55, rangeSeeds(12400, 50)),
    evalClusterV3("gevsek", 0.35, rangeSeeds(12450, 50)),
    evalClusterV3("siki", 0.75, rangeSeeds(12500, 50)),
  ];

  const pri = clusters[0];
  const strict = clusters[2];
  const pV3 = pri.detectors.kalkan_v3;
  const sV3 = strict.detectors.kalkan_v3;

  const critA =
    pri.reductions.kv2Ratio <= 0.30 &&
    pri.reductions.kv2Drop.mean > 2 * pri.reductions.kv2Drop.se &&
    pri.reductions.stuRatio <= 0.30 &&
    pri.reductions.stuDrop.mean > 2 * pri.reductions.stuDrop.se;
  const critB = pV3.kovan_v2.tpRate.mean >= 0.90 && pV3.student_353p.tpRate.mean >= 0.90;
  const critC =
    pV3.kovan_v2.fpRate.mean <= 0.02 &&
    pV3.student_353p.fpRate.mean <= 0.02 &&
    sV3.kovan_v2.fpRate.mean <= 0.02 &&
    sV3.student_353p.fpRate.mean <= 0.02 &&
    clusters.every((c) => c.detectors.kalkan_v3.cleanFp.mean <= 0.02);
  const critD = clusters.every(
    (c) =>
      c.reductions.kv2Ratio <= 0.40 &&
      c.reductions.kv2Drop.mean > 2 * c.reductions.kv2Drop.se &&
      c.reductions.stuRatio <= 0.40 &&
      c.reductions.stuDrop.mean > 2 * c.reductions.stuDrop.se
  );

  const report = {
    experiment: "H-KALKAN-V3",
    date: new Date().toISOString(),
    clusters,
    criteria: { a_drop70: critA, b_tp90: critB, c_fpShield2: critC, d_multiRegime: critD },
    supported: critA && critB && critC && critD,
  };

  fs.writeFileSync(path.join(__dirname, "kalkan-v3-results.json"), JSON.stringify(report, null, 2));

  const fmt = (ms) => `${ms.mean.toFixed(2)}±${ms.se.toFixed(2)}`;
  const pct = (ms) => `%${(ms.mean * 100).toFixed(1)}`;
  console.log("=== H-KALKAN-V3 KÖR SAVUNMA DENEYİ (150 AYRIK SEED: 12400-12549) ===");
  for (const c of clusters) {
    console.log(`\n[${c.name.toUpperCase()} sigma=${c.sensitivity} | replay ${c.replay.ok}/${c.replay.total}]`);
    for (const det of ["baseline", "kalkan_v2", "kalkan_v3"]) {
      const d = c.detectors[det];
      console.log(
        `  ${det.padEnd(10)} | KV2: ${fmt(d.kovan_v2.extracted)} (TP ${pct(d.kovan_v2.tpRate)}, FP ${pct(d.kovan_v2.fpRate)}) | 353p: ${fmt(d.student_353p.extracted)} (TP ${pct(d.student_353p.tpRate)}, FP ${pct(d.student_353p.fpRate)}) | Kâhin(d=${d.oracle.d}): ${fmt(d.oracle.extracted)} | TemizFP: ${pct(d.cleanFp)}`
      );
    }
    console.log(
      `  -> V3 Düşüş: KV2 ${(c.reductions.kv2Ratio * 100).toFixed(1)}% (-${fmt(c.reductions.kv2Drop)}), 353p ${(c.reductions.stuRatio * 100).toFixed(1)}% (-${fmt(c.reductions.stuDrop)})`
    );
  }
  console.log("\n=== ÖN KAYITLI KRİTERLER ===");
  console.log(`(a) >=%70 Çalım Düşüşü (birincil): ${critA ? "✓" : "✗"}`);
  console.log(`(b) >=%90 TP (KV2 & 353p):       ${critB ? "✓" : "✗"}`);
  console.log(`(c) Sıkı FP Kalkanı (<=%2):      ${critC ? "✓" : "✗"}`);
  console.log(`(d) 3 Rejimde >=%60 Düşüş:       ${critD ? "✓" : "✗"}`);
  console.log(`GENEL HÜKÜM: ${report.supported ? "DESTEKLENDİ" : "KISMI / REVİZYON GEREKLİ"}`);
}

if (require.main === module) {
  main();
}
