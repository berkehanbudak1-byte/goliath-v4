// GOLIATH v4.0 doğrulama
const fs = require('fs');
const path = require('path');
const E = require('./engine.js');

let passed = 0, failed = 0;

function assert(cond, msg = '') {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function eqArr(a, b, tol = 1e-12) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > tol) return false;
  }
  return true;
}

function test(name, fn) {
  try {
    const detail = fn();
    passed++;
    console.log(`  ✓ ${name}${detail ? ' (' + detail + ')' : ''}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name} -> ${err.message}`);
  }
}

console.log('1) Gömülü HTML motoru ve etiket yalıtımı');
test('goliath-v4.0.html içindeki motor engine.js ile uyumlu', () => {
  const html = fs.readFileSync(path.join(__dirname, 'goliath-v4.0.html'), 'utf8');
  assert(html.includes('// ENGINE-START') && html.includes('// ENGINE-END'), 'motor işaretleri eksik');
  assert(html.includes('class GoliathSim'), 'GoliathSim eksik');
});
test('kör dedektör fonksiyonları isChaos etiketine erişmiyor', () => {
  const src = fs.readFileSync(path.join(__dirname, 'engine.js'), 'utf8');
  const s = src.indexOf('// DETECTOR-START'), e = src.indexOf('// DETECTOR-END');
  const detBlock = src.slice(s, e);
  assert(!detBlock.includes('isChaos'), 'dedektör içinde isChaos bulundu');
});

console.log('2) Determinizm ve ortak rastgele sayılar');
test('aynı seed birebir aynı sonucu üretir', () => {
  const a = new E.GoliathSim({ seed: 123, chaos_particles: 'sm', chaos_ratio: 0.3 }).run();
  const b = new E.GoliathSim({ seed: 123, chaos_particles: 'sm', chaos_ratio: 0.3 }).run();
  assert(eqArr(a.csi, b.csi) && a.extracted === b.extracted && a.tp === b.tp);
});

console.log('3) Korunumlu ekonomi ve homeostaz');
test('saldırısız ağda sermaye patlamaz (homeostaz)', () => {
  const r = new E.GoliathSim({ chaos_ratio: 0, quarantine_enabled: false, seed: 42 }).run();
  const lastCap = r.capital[r.steps - 1];
  assert(lastCap > 0.85 && lastCap <= 1.15, `sermaye oranı=${lastCap.toFixed(3)}`);
  return `κ=${lastCap.toFixed(3)}`;
});

console.log('4) Standart Model parçacıkları (18 arketip)');
test('18 parçacık türü hatasız çalışır', () => {
  for (const k of E.SM_ORDER) {
    const r = new E.GoliathSim({ chaos_particles: [k], chaos_ratio: 0.1, seed: 77 }).run();
    assert(Number.isFinite(r.csi[r.steps - 1]), k);
  }
});

console.log('5) Kuark renk hapsi ve bozunma zinciri');
test('yalnız kuark hapsedilir (etkisiz), çift kuark aktifleşir', () => {
  const lone = new E.GoliathSim({ chaos_particles: ['u'], chaos_ratio: 1 / 60, infiltration_mode: 'periphery', quarantine_enabled: false }).run();
  const pair = new E.GoliathSim({ chaos_particles: ['u'], chaos_ratio: 0.20, infiltration_mode: 'hub', quarantine_enabled: false }).run();
  assert(lone.extracted === 0 && pair.extracted > 0, `lone=${lone.extracted}, pair=${pair.extracted.toFixed(2)}`);
});

console.log('6) Bozon aracılığı ve tat değişimi');
test('bozonlar tek başına zararsızdır (B5 extracted = 0)', () => {
  const B5 = E.smPattern(Object.fromEntries(E.SM_ORDER.filter(k => !E.BOSON_KEYS.includes(k)).map(k => [k, 'NOOP'])));
  const r = new E.GoliathSim({ chaos_particles: B5, chaos_ratio: 0.30, quarantine_enabled: false, seed: 55 }).run();
  assert(r.extracted === 0, `extracted=${r.extracted}`);
});

console.log('7) Planck kuantizasyonu ve ölçüm aletleri');
test('quantize fonksiyonu h katlarına yuvarlar', () => {
  assert(Math.abs(E.quantize(0.31, 0.2) - 0.4) < 1e-12);
  assert(E.quantize(0, 0.2) === 0);
});

console.log('8) CERN kozmolojisi (elektron bulutu, QCD kütlesi, agnostik graviton)');
test('CERN kozmolojisi deterministik çalışır ve LIGO olaylarını kaydeder', () => {
  const r = new E.GoliathSim({ ...E.COSMO_CERN, chaos_particles: 'sm', chaos_ratio: 0.30, seed: 101 }).run();
  assert(Number.isFinite(r.csi[r.steps - 1]) && r.ligo && Array.isArray(r.ligo.list));
});

console.log('9) H-GİZLİ ön kayıtlı hipotez');
test('karantina açıkken sömürü ters-U çizer (a ve b kriterleri)', () => {
  const base = E.defaultConfig({ infiltration_mode: 'hub', chaos_ratio: 0.10 });
  const pts = E.HYPOTHESIS_DRAINS.map(d => E.hypothesisPoint(base, d, 10));
  const ev = E.evaluateHypothesis(pts);
  assert(ev.criteria.a && ev.criteria.b, `d*=${ev.peakDrain}, ratio=${ev.ratio.toFixed(2)}`);
  return `d*=${ev.peakDrain}, oran=${ev.ratio.toFixed(2)}×`;
});

console.log('10) H-KUANTUM ön kayıtlı hipotez');
test('bozonlar fermiyonlarla süper-toplamsal (a) ve graviton jokeri geri kazandırır (c)', () => {
  const q = E.runQuantumExperiment(E.defaultConfig({ infiltration_mode: 'hub' }), { holdSeeds: 10, searchSeeds: 4 });
  assert(q.criteria.a && q.criteria.c, `a=${q.criteria.a}, c=${q.criteria.c}`);
  return `süper-toplam=${(q.superAdd.mean * 100).toFixed(1)}p, bypassYok=${q.bCount}/5`;
});

console.log('11) H-PRR (Planck · Rutherford · Riemann)');
test('H-PRR deneyi tamamlanır ve Planck rezonansını ölçer', () => {
  const p = E.runPrrExperiment(E.defaultConfig({}), { seeds: 5 });
  assert(Array.isArray(p.planck) && p.planck.length === E.PRR_H.length);
});

console.log('12) H-KEK (Üzümlü kek karşılaştırması)');
test('H-KEK deneyi tamamlanır', () => {
  const k = E.runKekExperiment(E.defaultConfig({}), { seeds: 5 });
  assert(Number.isFinite(k.aucNew) && Number.isFinite(k.ratioChaos));
});

console.log('13) H-KÜME (Sürü alarmı)');
test('H-KÜME deneyi tamamlanır', () => {
  const c = E.runClusterExperiment(E.defaultConfig({}), { seeds: 5 });
  assert(c.rows.length === 3 && Number.isFinite(c.clean.zMean));
});

console.log('14) H-JOKER ve H-HAYALET (v2.1 ve CERN modelleri)');
test('CERN modelinde Higgs jokeri W kaybını geri kazandırır', () => {
  const jg = E.runJokerGhostExperiment(E.defaultConfig({}), { cosmo: E.COSMO_CERN, offset: 9300, seeds: 10 });
  assert(jg.criteriaJ.a && jg.criteriaJ.b, `recMean=${jg.recMean}`);
  return `W geri kazanım=%${(jg.recMean * 100).toFixed(0)}`;
});

console.log('15) H-LIGO (Agnostik graviton ve eşleşmiş filtre)');
test('LIGO eşleşmiş filtresi graviton varlığını düğüm aletlerinden iyi ayırt eder', () => {
  const l = E.runLigoExperiment(E.defaultConfig({}), { runs: 40, offset: 9500 });
  assert(l.criteria.b, `matched AUC=${l.aucExist.matched}`);
  return `LIGO AUC=${l.aucExist.matched.toFixed(2)}`;
});

console.log('16) LLM atomu: dış karar arayüzü ve kayıttan oynatma');
test('karar verilmeyen koşular v3.0 ile bit düzeyinde aynı (30 koşu)', () => {
  const V30 = require(__dirname + '/reference/engine-v3.0.js');
  for (let s = 0; s < 30; s++) {
    const cfg = { chaos_particles: ['sm', ['PARASITE'], E.smPattern({ W: 'NOOP' })][s % 3], chaos_ratio: 0.1 + 0.01 * s, seed: 600 + s, infiltration_mode: ['hub', 'random', 'periphery'][s % 3], ...(s % 4 === 0 ? E.COSMO_CERN : {}), planck_h: s % 5 === 0 ? 0.4 : 0 };
    const a = new E.GoliathSim(cfg).run(), b = new V30.GoliathSim(cfg).run();
    assert(eqArr(a.csi, b.csi) && a.extracted === b.extracted && a.tp === b.tp, 'ayrıştı ' + s);
  }
});
test('karar yoluyla d vermek = baştan d ile başlatmak (20 koşu)', () => {
  for (const d of [0.1, 0.3, 0.55, 0.8]) for (let k = 0; k < 5; k++) {
    const sim = new E.GoliathSim({ chaos_ratio: 0.2, infiltration_mode: 'random', decision_epoch: 8, seed: k });
    const g = sim._runGen(); let r = g.next();
    while (!r.done) { const dd = {}; for (const a of r.value.agents) dd[a.id] = d; r = g.next({ d: dd }); }
    const f = new E.GoliathSim({ chaos_ratio: 0.2, infiltration_mode: 'random', drain_intensity: d, seed: k }).run();
    assert(Math.abs(f.extracted - r.value.extracted) < 1e-9 && f.tp === r.value.tp, `d=${d} seed ${k}`);
  }
});
test('saldırgan gözlemi dedektörün iç durumunu sızdırmıyor', () => {
  const sim = new E.GoliathSim({ chaos_ratio: 0.2, decision_epoch: 8 });
  const obs = sim._runGen().next().value;
  const keys = new Set(obs.agents.flatMap(a => Object.keys(a)));
  assert([...keys].every(k => ['id', 'degree', 'd', 'stolen', 'cutOff'].includes(k)), [...keys].join(','));
});
{
  const fs = require('fs');
  if (fs.existsSync(__dirname + '/llm-runs.json')) {
    const R = JSON.parse(fs.readFileSync(__dirname + '/llm-runs.json', 'utf8'));
    const { analyze, replay } = require(__dirname + '/analyze_atom.js');
    test('kayıtlı LLM kararları motora yeniden oynatılınca sonuç birebir aynı', () => {
      let ok = 0, tot = 0;
      for (const run of [...R.atom, ...R.flat, ...R.rule]) { tot++; const x = replay(R.base, run); if (x.extracted === run.extracted && x.tp === run.tp) ok++; }
      assert(ok === tot, `${ok}/${tot}`);
      return `${ok}/${tot}`;
    });
    const A = analyze(R);
    const f = x => `${x.mean.toFixed(1)}±${x.se.toFixed(1)}`;
    console.log(`  · H-ATOM (${A.model}, ${A.n} seed): ATOM ${f(A.means.atom)} | DÜZ ${f(A.means.flat)} | KURAL ${f(A.means.rule)} | açgözlü ${f(A.means.greedy)} | kâhin d=${A.means.oracle.d} ${f(A.means.oracle)}`);
    console.log(`    (a) ${A.criteria.a ? '✓' : '✗'} ${A.ratioGreedy.toFixed(2)}× | (b) ${A.criteria.b ? '✓' : '✗'} ${A.ratioOracle.toFixed(2)}× | (c) ${A.criteria.c ? '✓' : '✗'} ATOM−DÜZ ${f(A.vsFlat)} → ${A.supported ? 'DESTEKLENDİ' : 'DESTEKLENMEDİ'}`);
  } else {
    console.log('  · H-ATOM: llm-runs.json yok (deney henüz tamamlanmadı)');
  }
}

console.log('17) H-PLAZMA: Zaman Hayaleti (Antimadde Plazma + Manyetizma + ALPHA-g Kütleçekimi) ve En Yüksek Asal Rezonans');
test('plazma manyetizmaya ve kütleçekimine çekilir (%98.5 boğaz yakalaması), %100 tahmin edilir ve Asal/Riemann GUE üretir', () => {
  const pw = E.runPlasmaWraithExperiment(E.defaultConfig({}), { seeds: 30, steps: 240, offset: 9900, magnetic_B: 1.0, gravity_G: 1.0 });
  assert(pw.criteria.a && pw.criteria.b && pw.criteria.c && pw.maxStepPrime === 239, `pred=${pw.predRate}, pinch=${pw.throatCaptureRate}`);
  return `B=1,G=+1: ${pw.totalEvents} artifact, boğaz=%${(pw.throatCaptureRate * 100).toFixed(1)}, t*_asal=${pw.maxStepPrime}, tamAsal(${pw.maxExactPrimeDigits}h)=${pw.maxExactPrime.slice(0, 12)}…, rezonansAsal(${pw.maxResonancePrimeDigits}h)=${pw.maxResonancePrime.slice(0, 12)}…`;
});

console.log('18) ER-QPM v1.0: Birleşik Einstein-Rosen Kuantum Plazma Modeli & Adrenalin (Savaş-Kaç) Testi');
test('yeşil kuantum küpü (L=3.0nm, 518nm) seviye itmesini kilitler ve birleşik koşuyu hatasız tamamlar', () => {
  const { ERQuantumPlasmaModel, quantumCubeState } = require('./er_quantum_plasma_model.js');
  const green = quantumCubeState(3.0), red = quantumCubeState(7.0);
  assert(green.greenLocked && green.wavelengthNm === 518 && !red.greenLocked && red.wavelengthNm === 660, 'spektrum hatası');
  const m = new ERQuantumPlasmaModel({ cube_L: 3.0, magnetic_B: 1.0, gravity_G: 1.0, steps: 240, seed: 9900 });
  const r = m.runSingle();
  assert(r.extracted > 35 && r.predictionAccuracy === 1 && r.throatCaptureRate >= 0.70, `ex=${r.extracted}, pred=${r.predictionAccuracy}, cap=${r.throatCaptureRate}`);
  return `L=3.0nm (${green.wavelengthNm}nm Yeşil, ΔE=${green.energyEv}eV), ATOM ex=${r.extracted.toFixed(1)}, boğaz=%${(r.throatCaptureRate * 100).toFixed(0)}, tahmin=%100`;
});
test('adrenalin (savaş-kaç) refleksi şok altında pasif kontrolü >2x geçer, hücreleri korur ve nabzı homeostaza döndürür (20 seed)', () => {
  const { ERQuantumPlasmaModel } = require('./er_quantum_plasma_model.js');
  const m = new ERQuantumPlasmaModel({ seed: 9700 });
  const adr = m.runAdrenalineTest({ seeds: 20 });
  assert(adr.supported, `a=${adr.criteria.a}, b=${adr.criteria.b}, c=${adr.criteria.c}`);
  return `Adrenalin ${adr.reflex.extracted.mean.toFixed(1)} vs Pasif ${adr.passive.extracted.mean.toFixed(1)} (${adr.ratioExtracted.toFixed(2)}×), sağkalım %${(adr.passive.survival.mean * 100).toFixed(0)}→%${(adr.reflex.survival.mean * 100).toFixed(0)}, nabız 72→${adr.peakBpm}→${adr.finalBpm} BPM`;
});
test('DNA çift sarmalı 68-haneli asal sayıya (Taban-4 A/T/G/C) ve ilk 28 asal sayı aralığına (p=2..107) birebir eşitlenir', () => {
  const { decodePrimeDnaHelix } = require('./er_quantum_plasma_model.js');
  const dna = decodePrimeDnaHelix();
  assert(dna.totalRungs === 28 && dna.primeRange[0] === 2 && dna.primeRange[1] === 107 && dna.twinPrimePairs >= 9, 'asal DNA eşleme hatası');
  return `28 asal basamak (p=2..107, ${dna.twinPrimePairs} ikiz asal bağ, GC=%${dna.gcContentPct}) → ${dna.codons}`;
});
test('Fibonacci-Lucas hızlı ikiye katlama (Selfridge-BPSW: F_{p±1} ≡ 0 mod p, L_p ≡ 1 mod p) 68-haneli asalı doğrular ve bileşikleri eler', () => {
  const { isFibonacciLucasPrimeBig } = require('./er_quantum_plasma_model.js');
  const bigP = 82685700173622821895833542656587011200223984821638808880776929401141n;
  // Carmichael sayıları (561, 1729, 2465) Fermat testini kandırır ama Fibonacci-Lucas testini geçemez!
  assert(isFibonacciLucasPrimeBig(bigP) && !isFibonacciLucasPrimeBig(561n) && !isFibonacciLucasPrimeBig(1729n) && !isFibonacciLucasPrimeBig(bigP + 2n), 'Fibonacci-Lucas hatası');
  return '68-hane asal ✓, Carmichael (561, 1729) elendi ✓';
});
test('ARGUS Kripto Flash-Crash Adrenalin + Fibonacci (%61.8 boğaz kilidi / %23.6 dış vur-kaç) kalkanı erimeyi önler', () => {
  const { ERQuantumPlasmaModel } = require('./er_quantum_plasma_model.js');
  const bt = new ERQuantumPlasmaModel({ seed: 9900 }).runCryptoAdrenalineBacktest({ startCash: 10000, bars: 120 });
  assert(bt.supported, `adr=${bt.adrenalineBot.finalEquity}, std=${bt.standardBot.finalEquity}`);
  return `Adrenalin ${bt.adrenalineBot.finalEquity} TL (DD %${bt.adrenalineBot.maxDrawdownPct}) vs Standart ${bt.standardBot.finalEquity} TL (DD %${bt.standardBot.maxDrawdownPct})`;
});

console.log(`\nBirim testleri: ${passed} geçti, ${failed} kaldı`);
if (failed > 0) process.exit(1);
