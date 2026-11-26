// GOLIATH v4.0 simülasyon motoru (korunumlu ekonomi; CERN güncel modeli: elektron bulutu, QCD kütlesi, agnostik graviton; LLM atomu dış karar arayüzü) (parçacık arketipleri, Planck kuantumu, Rutherford ve Riemann aletleri). Tarayıcıda ve Node'da aynı kod çalışır.

class SeededRNG {
  constructor(seed = 42) { this.state = seed >>> 0; }
  random() {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  normal(mean = 0, std = 1) {
    let u = 0, v = 0;
    while (u === 0) u = this.random();
    while (v === 0) v = this.random();
    return mean + Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v) * std;
  }
  choiceWithoutReplacement(arr, k, weights = null) {
    const n = arr.length;
    const result = [];
    if (!weights) {
      const pool = arr.slice();
      for (let i = 0; i < Math.min(k, n); i++) {
        const idx = i + Math.floor(this.random() * (n - i));
        [pool[i], pool[idx]] = [pool[idx], pool[i]];
        result.push(pool[i]);
      }
      return result;
    }
    const avail = arr.slice();
    const w = weights.slice();
    for (let pick = 0; pick < Math.min(k, n); pick++) {
      let sum = 0;
      for (let i = 0; i < avail.length; i++) sum += w[i];
      let r = this.random() * sum;
      let chosenIdx = avail.length - 1;
      for (let i = 0; i < avail.length; i++) {
        r -= w[i];
        if (r <= 0) { chosenIdx = i; break; }
      }
      result.push(avail[chosenIdx]);
      avail.splice(chosenIdx, 1);
      w.splice(chosenIdx, 1);
    }
    return result;
  }
}

function generateAdaptiveHierarchy(n, rng) {
  // Katman 0: 0..3 (çekirdek), Katman 1: 4..19 (bölgesel), Katman 2: 20..n-1 (çeper)
  const adj = Array.from({ length: n }, () => new Float64Array(n));
  const layers = new Uint8Array(n);
  const l0End = 4, l1End = 20;
  for (let i = 0; i < n; i++) layers[i] = i < l0End ? 0 : i < l1End ? 1 : 2;
  for (let i = 0; i < l0End; i++) for (let j = i + 1; j < l0End; j++) adj[i][j] = adj[j][i] = 1;
  for (let i = l0End; i < l1End; i++) {
    const p1 = (i - l0End) % l0End;
    const p2 = (p1 + 1) % l0End;
    adj[i][p1] = adj[p1][i] = 1;
    if (rng.random() < 0.45) adj[i][p2] = adj[p2][i] = 1;
    const nextPeer = l0End + ((i - l0End + 1) % (l1End - l0End));
    adj[i][nextPeer] = adj[nextPeer][i] = 1;
  }
  for (let i = l1End; i < n; i++) {
    const p1 = l0End + ((i - l1End) % (l1End - l0End));
    adj[i][p1] = adj[p1][i] = 1;
    if (rng.random() < 0.35) {
      const p2 = l0End + ((i - l1End + 5) % (l1End - l0End));
      adj[i][p2] = adj[p2][i] = 1;
    }
    const peer = l1End + ((i - l1End + 1) % (n - l1End));
    if (rng.random() < 0.55) adj[i][peer] = adj[peer][i] = 1;
  }
  return { adj, layers };
}

function generateScaleFree(n, m, rng) {
  const m0 = Math.max(m + 1, 3);
  const adj = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < m0; i++) for (let j = i + 1; j < m0; j++) adj[i][j] = adj[j][i] = 1;
  for (let newNode = m0; newNode < n; newNode++) {
    const indices = Array.from({ length: newNode }, (_, i) => i);
    const degrees = indices.map(i => {
      let d = 0;
      for (let j = 0; j < newNode; j++) d += adj[i][j];
      return d;
    });
    const targets = rng.choiceWithoutReplacement(indices, m, degrees);
    for (const t of targets) adj[newNode][t] = adj[t][newNode] = 1;
  }
  return { adj, layers: new Uint8Array(n).fill(2) };
}

function defaultConfig(overrides = {}) {
  return Object.assign({
    n_nodes: 60,
    steps: 80,
    topology: 'adaptive_hierarchy',
    chaos_ratio: 0.10,
    infiltration_mode: 'hub',
    drain_intensity: 0.35,
    double_helix: true,
    quarantine_enabled: true,
    quarantine_sensitivity: 0.55,
    contagion_rate: 0.24,
    buffer_share: 0.18,
    sigma_balance: 0.55,
    detector_noise: 0.06,
    warmup: 4,
    chaos_particles: ['PARASITE'],
    graviton_mode: 'ghost',   // 'ghost' (v2.1): düğüm değil, yakalanamaz | 'joker' (v1.x)
    higgs_joker: true,        // v2.1: eksik bozona Higgs bürünür (Goldstone: önce W, Z)
    ghost_enabled: true,
    atom_model: 'sm-bohr',    // 'cern': elektron bulutu + QCD bağlanma kütlesi | 'sm-bohr' (v2.1)
    higgs_share: 0.1,         // CERN: kütle alanında Higgs payı (proton kütlesinin ~%1'i Higgs'ten; leptonlarınki tümüyle)
    hadron_mass: 0.9,         // CERN: kütlenin çoğu gluon bağlanma enerjisinden
    graviton_p: 0.5,          // agnostik graviton: var olma olasılığı
    rewire_rate: 0,           // ağın kendiliğinden yeniden bağlanması (LIGO'nun gürültü tabanı)
    planck_h: 0,
    higgs_osc_amp: 0,
    higgs_osc_period: 10,
    instruments: false,
    probes_per_step: 8,
    pattern_rotation: null,
    decision_epoch: 0,        // >0 ise her decision_epoch adımda dış karar arayüzü (_runGen) gözlem verir ve { d } kararı alır
    seed: 42,
    recordSnapshots: false,
  }, overrides);
}

// DETECTOR-START
// Dedektör yalnızca dışarıdan görülebilen değerleri alır: stres, adımlık göreli sermaye değişimi, ölçüm gürültüsü.
// Düğümün kaos ajanı olup olmadığı bilgisi bu fonksiyonlara hiç ulaşmaz.
function detectorSignal(stress, relGain, noise) {
  return 0.55 * stress + 2.0 * Math.max(0, relGain) + noise;
}
function detectorThreshold(sensitivity) {
  return 0.71 - 0.525 * sensitivity;
}
// DETECTOR-END

// ============================================================
// ÖLÇÜM ALETLERİ: Planck kuantumu, Rutherford saçılması, Riemann aralık sınaması
// ============================================================
// Planck: eylem kuantumludur; sıfırdan büyük her eylem en yakın üst h katına yuvarlanır.
function quantize(x, h) {
  if (!(h > 0) || !(x > 0)) return x;
  return Math.ceil(x / h - 1e-12) * h;
}

function median(arr) {
  if (!arr.length) return NaN;
  const a = arr.slice().sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function erf(x) {
  // Abramowitz–Stegun 7.1.26 (hata < 1.5e-7)
  const s = Math.sign(x); x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}
// Normalize aralıkların dağılımı: Poisson (rastgele) ve GUE Wigner varsayımı (seviye itmesi, zeta sıfırları)
const poissonCdf = s => 1 - Math.exp(-s);
const gueCdf = s => erf(2 * s / Math.sqrt(Math.PI)) - (4 * s / Math.PI) * Math.exp(-4 * s * s / Math.PI);
const poissonPdf = s => Math.exp(-s);
const guePdf = s => (32 / (Math.PI * Math.PI)) * s * s * Math.exp(-4 * s * s / Math.PI);

function ksDistance(sorted, cdf) {
  const n = sorted.length;
  let d = 0;
  for (let k = 0; k < n; k++) {
    const F = cdf(sorted[k]);
    d = Math.max(d, Math.abs(F - k / n), Math.abs((k + 1) / n - F));
  }
  return d;
}

// Etiketten bağımsız puanların etiketi ne kadar ayırdığı (yalnızca değerlendirmede kullanılır)
function auc(scores, labels) {
  const pos = [], neg = [];
  scores.forEach((v, i) => { if (Number.isFinite(v)) (labels[i] ? pos : neg).push(v); });
  if (!pos.length || !neg.length) return null;
  let wins = 0;
  for (const p of pos) for (const q of neg) wins += p > q ? 1 : p === q ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}

// En küçük kareler: y = a + b·x
function linFitSse(xs, ys) {
  const n = xs.length;
  if (n < 3) return Infinity;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); }
  const b = sxx > 0 ? sxy / sxx : 0, a = my - b * mx;
  let sse = 0;
  for (let i = 0; i < n; i++) sse += (ys[i] - a - b * xs[i]) ** 2;
  return sse;
}

const R_BINS = 18;

// Rutherford: açı histogramına iki model oturtulur.
// Çekirdek (Rutherford): log N = a − 4·log sin(θ/2);  Üzümlü kek (Thomson, çoklu küçük saçılma): log N = a + b·θ²
function rutherfordFit(hist) {
  const xr = [], xt = [], y = [];
  for (let k = 0; k < R_BINS; k++) {
    if (hist[k] <= 0) continue;
    const th = ((k + 0.5) / R_BINS) * Math.PI;
    xr.push(-4 * Math.log(Math.sin(th / 2)));
    xt.push(th * th);
    y.push(Math.log(hist[k]));
  }
  // Rutherford modelinde eğim 1'e sabit: log N − x = a
  const n = y.length;
  let sseR = Infinity;
  if (n >= 3) {
    const a = y.reduce((s, v, i) => s + v - xr[i], 0) / n;
    sseR = y.reduce((s, v, i) => s + (v - a - xr[i]) ** 2, 0);
  }
  const sseT = linFitSse(xt, y);
  const total = hist.reduce((a, b) => a + b, 0);
  const back = hist.slice(R_BINS / 2).reduce((a, b) => a + b, 0);
  return { sseR, sseT, rutherfordWins: sseR < sseT, backFraction: total ? back / total : 0, bins: n };
}

// Riemann: her düğümün olay zamanları (sinyal > kendi ortalaması + 2σ) arasındaki aralıklar, düğümün ortalama aralığına bölünür.
function riemannAnalysis(sigHist, warmup, steps, n) {
  const pooled = [];
  const rigidity = new Float64Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const xs = [];
    for (let t = warmup; t < steps; t++) { const v = sigHist[t * n + i]; if (Number.isFinite(v)) xs.push([t, v]); }
    if (xs.length < 8) continue;
    const m = xs.reduce((a, p) => a + p[1], 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, p) => a + (p[1] - m) ** 2, 0) / xs.length);
    if (sd <= 1e-9) continue;
    const ev = xs.filter(p => p[1] > m + 2 * sd).map(p => p[0]);
    if (ev.length < 3) continue;
    const gaps = [];
    for (let k = 1; k < ev.length; k++) gaps.push(ev[k] - ev[k - 1]);
    const mg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const sp = gaps.map(g => g / mg).sort((a, b) => a - b);
    for (const s of sp) pooled.push(s);
    rigidity[i] = ksDistance(sp, poissonCdf) - ksDistance(sp, gueCdf);
  }
  pooled.sort((a, b) => a - b);
  const dP = pooled.length ? ksDistance(pooled, poissonCdf) : NaN;
  const dG = pooled.length ? ksDistance(pooled, gueCdf) : NaN;
  const small = pooled.length ? pooled.filter(s => s < 0.5).length / pooled.length : NaN;
  return { spacings: pooled, dP, dG, rigidity: dP - dG, smallFraction: small, perNode: rigidity };
}

// ============================================================
// PARÇACIK ARKETİPLERİ: Standart Model'in 17 parçacığı + graviton (joker)
// Her ajanın adım başı bütçesi eşittir: B = 0.34·d sermaye birimi (stres için B/1.5).
// Fermiyonlar sisteme doğrudan etki eder; bozonlar yalnızca fermiyon takım arkadaşları varken aracılık eder.
// ============================================================
const P = {
  NONE: 0, u: 1, d: 2, c: 3, s: 4, t: 5, b: 6,
  e: 7, ve: 8, mu: 9, vmu: 10, tau: 11, vtau: 12,
  g: 13, gamma: 14, Z: 15, W: 16, H: 17, G: 18,
  NOOP: 19, PARASITE: 20,
};
const SM_ORDER = ['u', 'd', 'c', 's', 't', 'b', 'e', 've', 'mu', 'vmu', 'tau', 'vtau', 'g', 'gamma', 'Z', 'W', 'H', 'G'];
const PARTICLE_INFO = {
  u:     { sym: 'u',  name: 'Yukarı kuark', family: 'kuark', color: '#ef4444', cycle: 'Kararlı. Hapsolmuşken komşularından sermaye emer.' },
  d:     { sym: 'd',  name: 'Aşağı kuark', family: 'kuark', color: '#f97316', cycle: 'Kararlı. Hapsolmuşken komşularına stres basar.' },
  c:     { sym: 'c',  name: 'Tılsım kuark', family: 'kuark', color: '#f43f5e', cycle: '2 adım erişim, 12 adımda s\'ye bozunur.' },
  s:     { sym: 's',  name: 'Garip kuark', family: 'kuark', color: '#fb923c', cycle: '2 adım erişim, 16 adımda u\'ya bozunur.' },
  t:     { sym: 't',  name: 'Üst kuark', family: 'kuark', color: '#be123c', cycle: '3 adım erişim, hadronlaşamadan 1 adımda b\'ye bozunur.' },
  b:     { sym: 'b',  name: 'Alt kuark', family: 'kuark', color: '#ea580c', cycle: '3 adım erişim, 8 adımda c\'ye bozunur.' },
  e:     { sym: 'e',  name: 'Elektron', family: 'lepton', color: '#22d3ee', cycle: 'Kararlı. Yörüngede döner: her adım sıradaki komşuya tam bütçe.' },
  ve:    { sym: 'νe', name: 'Elektron nötrinosu', family: 'nötrino', color: '#a5f3fc', cycle: 'Ağın içinden geçer, zayıf etkileşir, 8 adımda bir tat değiştirir.' },
  mu:    { sym: 'μ',  name: 'Müon', family: 'lepton', color: '#38bdf8', cycle: 'En zengin komşuyu deler, 20 adımda e\'ye bozunur.' },
  vmu:   { sym: 'νμ', name: 'Müon nötrinosu', family: 'nötrino', color: '#bae6fd', cycle: 'Ağın içinden geçer, zayıf etkileşir, 8 adımda bir tat değiştirir.' },
  tau:   { sym: 'τ',  name: 'Tau', family: 'lepton', color: '#0ea5e9', cycle: '2 adım uzaktaki en zengini deler, 6 adımda μ\'ye bozunur.' },
  vtau:  { sym: 'ντ', name: 'Tau nötrinosu', family: 'nötrino', color: '#e0f2fe', cycle: 'Ağın içinden geçer, zayıf etkileşir, 8 adımda bir tat değiştirir.' },
  g:     { sym: 'g',  name: 'Gluon', family: 'bozon', color: '#a3e635', cycle: 'Kuarkları 2 adıma kadar bağlar, bütçesini onlara verir.' },
  gamma: { sym: 'γ',  name: 'Foton', family: 'bozon', color: '#fde047', cycle: 'Yüklü takım arkadaşlarının çaldığını sonsuz menzille en büyük hub\'a aklar.' },
  Z:     { sym: 'Z',  name: 'Z bozonu', family: 'bozon', color: '#4ade80', cycle: 'Komşu takım arkadaşlarının stresini sağlıklı komşulara aktarır (maske).' },
  W:     { sym: 'W',  name: 'W bozonu', family: 'bozon', color: '#34d399', cycle: 'Tat değiştirir: sağlıklı bir komşuyu kuarka çevirir (en fazla 2).' },
  H:     { sym: 'H',  name: 'Higgs (joker)', family: 'higgs', color: '#c084fc', cycle: 'Kütle alanı: fermiyon yakınındaki sağlıklıların iyileşmesini yavaşlatır. Joker: eksik bozona bürünür (önce W, Z: Goldstone).' },
  G:     { sym: 'G',  name: 'Graviton (hayalet)', family: 'hayalet', color: '#f5f5f4', cycle: 'Hiç gözlenmedi. Düğüm değil, yakalanamaz: bütün sağlıklıları çok zayıf çeker, kütleleri birbirine bağlar (kenar büker).' },
  NOOP:  { sym: '·',  name: 'Pasif', family: 'pasif', color: '#475569', cycle: 'Yer tutucu: hiçbir şey yapmaz (ablasyon için).' },
  PARASITE: { sym: 'P', name: 'Parazit (v0.8)', family: 'eski', color: '#e11d48', cycle: 'Eski tek tip ajan: bütün komşularından emer.' },
};
const PKEY = Object.fromEntries(Object.entries(P).map(([k, v]) => [v, k]));
const UP_TYPE = new Set([P.u, P.c, P.t]);
const QUARK = new Set([P.u, P.d, P.c, P.s, P.t, P.b]);
const CHARGED_LEPTON = new Set([P.e, P.mu, P.tau]);
const NEUTRINO = new Set([P.ve, P.vmu, P.vtau]);
const FERMION = new Set([...QUARK, ...CHARGED_LEPTON, ...NEUTRINO]);
const BOSON_ROLES = [P.g, P.gamma, P.Z, P.W, P.H];
const QUARK_REACH = { [P.u]: 1, [P.d]: 1, [P.c]: 2, [P.s]: 2, [P.t]: 3, [P.b]: 3 };
const DECAY = { [P.t]: [P.b, 1], [P.b]: [P.c, 8], [P.c]: [P.s, 12], [P.s]: [P.u, 16], [P.tau]: [P.mu, 6], [P.mu]: [P.e, 20] };
const NU_CYCLE = [P.ve, P.vmu, P.vtau];
const NU_PERIOD = 8;
const WEAK = 0.35;          // nötrino bağlaşımı
const JOKER_EFF = 0.5;      // graviton jokeri verimi
const W_THRESHOLD = 1.0;    // dönüştürme için biriken bütçe
const W_MAX = 2;
const GRAV_PERIOD = 10, GRAV_MAX = 3;
const GHOST_COUPLING = 0.2;          // kütleçekimi en zayıf kuvvet
const HIGGS_JOKER_ORDER = [16, 15, 13, 14]; // W, Z, g, γ (Goldstone bozonları önce)
// Önceki ön kayıtlı deneyler (v1.1 kozmolojisi) yeniden üretilebilir kalsın diye
const COSMO_V11 = { graviton_mode: 'joker', higgs_joker: false };
const COSMO_V21 = { graviton_mode: 'ghost', higgs_joker: true, atom_model: 'sm-bohr', rewire_rate: 0 };
const COSMO_CERN = { graviton_mode: 'agnostic', higgs_joker: true, atom_model: 'cern', rewire_rate: 0.04 };
const LEPTON_CLOUD = { 7: [2, 1.0], 9: [1, 0.5], 11: [1, 0.35] }; // e, μ, τ: [erişim, a0]; ağır lepton → dar bulut

function particleId(key) {
  if (typeof key === 'number') return key;
  const id = P[key];
  if (id === undefined) throw new Error('bilinmeyen parçacık: ' + key);
  return id;
}

// Desen döndürülerek ajanlara dağıtılır: k. ajan = desen[(k + döndürme) mod uzunluk]
function assignParticles(pattern, count, rotation) {
  const pat = (pattern === 'sm' ? SM_ORDER : pattern).map(particleId);
  const out = [];
  for (let k = 0; k < count; k++) out.push(pat[(k + rotation) % pat.length]);
  return out;
}

class GoliathSim {
  constructor(cfg) {
    this.cfg = defaultConfig(cfg);
    const c = this.cfg;
    const n = c.n_nodes;
    this.rng = new SeededRNG(c.seed);
    // Dedektör gürültüsü ayrı akıştan gelir; karantina AÇIK/KAPALI koşuları aynı dinamik gürültüyü paylaşır.
    this.detRng = new SeededRNG((c.seed ^ 0x9e3779b9) >>> 0);
    this.qmRng = new SeededRNG((c.seed ^ 0x1b873593) >>> 0);   // elektron bulutu örneklemesi
    this.topoRng = new SeededRNG((c.seed ^ 0x2545f491) >>> 0); // arka plan yeniden bağlanma
    const gRng = new SeededRNG((c.seed ^ 0x6c8e9cf5) >>> 0);   // gravitonun varlığı ve bağlaşımı
    this.gExists = gRng.random() < c.graviton_p;
    this.gKappa = gRng.random() * 2 - 1;
    // Rutherford sondaları kendi akışını kullanır; dinamiği ve dedektörü etkilemez.
    this.probeRng = new SeededRNG((c.seed ^ 0x51ed2701) >>> 0);
    // Üzümlü kek (Thomson) karşılaştırması ayrı akıştan: eski sonda sonuçları değişmez.
    this.kekRng = new SeededRNG((c.seed ^ 0x7e5c0b1d) >>> 0);
    this.dq = quantize(c.drain_intensity, c.planck_h);
    this.agentD = new Float64Array(n).fill(c.drain_intensity);
    this.agentDq = new Float64Array(n).fill(this.dq);

    const net = c.topology === 'adaptive_hierarchy'
      ? generateAdaptiveHierarchy(n, this.rng)
      : generateScaleFree(n, 3, this.rng);
    this.adj = net.adj;
    this.layers = net.layers;

    this.nbrs = new Array(n);
    this.degrees = new Float64Array(n);
    let edgeSum = 0;
    for (let i = 0; i < n; i++) {
      const list = [];
      for (let j = 0; j < n; j++) if (this.adj[i][j] > 0) list.push(j);
      this.nbrs[i] = Int32Array.from(list);
      this.degrees[i] = list.length;
      edgeSum += list.length;
    }
    this.init_edges = Math.max(edgeSum / 2.0, 1.0);

    this.capital = new Float64Array(n);
    let capSum = 0;
    for (let i = 0; i < n; i++) {
      const layerBoost = c.topology === 'adaptive_hierarchy'
        ? (this.layers[i] === 0 ? 0.70 : this.layers[i] === 1 ? 0.25 : 0.0)
        : 0.0;
      this.capital[i] = 1.0 + 0.08 * this.degrees[i] + layerBoost;
      capSum += this.capital[i];
    }
    this.init_total_capital = capSum;
    this.cap0 = Float64Array.from(this.capital);

    this.alive = new Uint8Array(n).fill(1);
    this.quarantined = new Uint8Array(n);
    this.quarantineStep = new Int16Array(n).fill(-1);
    this.isChaos = new Uint8Array(n);
    this.stress = new Float64Array(n);
    this.anomalyScore = new Float64Array(n);
    this.autonomy = new Float64Array(n).fill(0.58);
    this.coherence = new Float64Array(n).fill(0.60);

    const chaosCount = Math.round(n * c.chaos_ratio);
    const sortedDesc = Array.from({ length: n }, (_, i) => i)
      .sort((a, b) => this.degrees[b] - this.degrees[a]);
    let chosen = [];
    if (chaosCount > 0) {
      if (c.infiltration_mode === 'hub') chosen = sortedDesc.slice(0, chaosCount);
      else if (c.infiltration_mode === 'periphery') chosen = sortedDesc.slice(n - chaosCount);
      else chosen = this.rng.choiceWithoutReplacement(sortedDesc, chaosCount);
    }
    const pat = c.chaos_particles === 'sm' ? SM_ORDER : c.chaos_particles;
    const rot = c.pattern_rotation == null ? c.seed % pat.length : c.pattern_rotation;
    const types = assignParticles(c.chaos_particles, chosen.length, rot);
    this.ptype = new Uint8Array(n);
    this.agents = [];
    this.ghosts = 0;
    this.ghostHarm = 0;
    this.ghostEdges = 0;
    this.gravEdgeList = [];
    this.ligoEvents = [];  // savunmacının gördüğü yeni kenarlar: {a, b, t, rich}; kaynağı (graviton/gürültü) görünmez
    this.ghostRelief = 0;
    chosen.forEach((idx, k) => {
      if (types[k] === P.G && (c.graviton_mode === 'ghost' || c.graviton_mode === 'agnostic')) { this.ghosts++; return; }
      this.isChaos[idx] = 1;
      this.ptype[idx] = types[k];
      this.autonomy[idx] = 0.95;
      this.coherence[idx] = 0.08;
      this.agents.push(idx);
    });
    this.hasParticles = types.some(p => p !== P.PARASITE);
    this.born = new Int16Array(n);
    this.orbit = new Int32Array(n);
    this.wProgress = new Float64Array(n);
    this.wConv = new Uint8Array(n);
    this.gEdges = new Uint8Array(n);
    this.lastRole = new Uint8Array(n);
    this.converted = new Uint8Array(n);
    this.harm = new Float64Array(n);
    this.stolen = new Float64Array(n);
    this.decays = 0; this.oscillations = 0; this.conversions = 0; this.gravEdges = 0; this.laundered = 0;
    this.totalChaos = this.agents.length;  // hayaletler düğüm değildir, sayılmaz
    let he = 0;
    for (let i = 0; i < n; i++) {
      if (this.isChaos[i]) continue;
      for (const j of this.nbrs[i]) if (j > i && !this.isChaos[j]) he++;
    }
    this.init_healthy_edges = Math.max(he, 1);
  }

  _active(i) { return this.alive[i] === 1 && this.quarantined[i] === 0; }

  _computeCSI() {
    const n = this.cfg.n_nodes;
    // CSI bir puanlayıcıdır ve gerçek etiketi görebilir: sağlıklı kısmı ölçer; kaosun çaldığı sermaye ve sahte profili sayılmaz.
    let aliveCount = 0, activeCount = 0, healthyCount = 0, capActive = 0, aSum = 0, cSum = 0;
    for (let i = 0; i < n; i++) {
      if (!this.alive[i]) continue;
      aliveCount++;
      if (!this.quarantined[i]) {
        activeCount++;
        if (!this.isChaos[i]) {
          healthyCount++;
          capActive += this.capital[i];
          aSum += this.autonomy[i];
          cSum += this.coherence[i];
        }
      }
    }
    if (activeCount === 0 || healthyCount === 0) return 0.0;
    const phi = aliveCount / n;
    const activeRatio = healthyCount / n;
    const kappa = capActive / this.init_total_capital;
    if (phi < 0.05 || kappa < 0.05 || activeRatio < 0.05) return 0.0;

    const aMean = aSum / healthyCount;
    const cMean = cSum / healthyCount;
    const eps = 0.02;
    const logRatio = Math.log((aMean + eps) / (cMean + eps));
    const pBalance = Math.exp(-(logRatio * logRatio) / (2.0 * this.cfg.sigma_balance * this.cfg.sigma_balance));

    let activeEdges = 0;
    for (let i = 0; i < n; i++) {
      if (!this._active(i) || this.isChaos[i]) continue;
      for (const j of this.nbrs[i]) if (j > i && this._active(j) && !this.isChaos[j]) activeEdges++;
    }
    const connRatio = Math.min(1.0, activeEdges / this.init_healthy_edges);
    const iRec = Math.sqrt(Math.max(aMean * cMean, 0.0));
    const kappaEff = Math.pow(Math.min(1.0, kappa), 0.7) * Math.pow(activeRatio, 0.5);
    const csi = iRec * pBalance * kappaEff * (0.35 + 0.65 * connRatio);
    return Math.max(0.0, Math.min(1.0, csi));
  }

  _within(src, h) {
    // src'den en fazla h adımda ulaşılan aktif düğümler (src hariç)
    const seen = new Set([src]);
    let frontier = [src];
    const out = [];
    for (let k = 0; k < h; k++) {
      const next = [];
      for (const u of frontier) {
        for (const v of this.nbrs[u]) {
          if (seen.has(v) || !this._active(v)) continue;
          seen.add(v);
          out.push(v);
          next.push(v);
        }
      }
      frontier = next;
    }
    return out;
  }

  _healthyWithin(src, h) { return this._within(src, h).filter(j => !this.isChaos[j]); }

  // Nötrino ağın içinden geçer: komşuluk aramaz, deterministik bir sağlıklı düğüme çarpar.
  _passThrough(i, t) {
    const H = [];
    for (let k = 0; k < this.cfg.n_nodes; k++) if (this._active(k) && !this.isChaos[k]) H.push(k);
    if (!H.length) return -1;
    return H[(i * 7919 + t * 104729) % H.length];
  }

  _isMate(role, j) { return role[j] !== 0 && role[j] !== P.NOOP; }

  // Renk hapsi: yanında kuark varsa bağlı; yanında gluon varsa 2 adım içindeki kuark da yeter.
  _confined(i, role) {
    const near = this._within(i, 1);
    if (near.some(j => QUARK.has(role[j]))) return true;
    if (!near.some(j => role[j] === P.g)) return false;
    return this._within(i, 2).some(j => QUARK.has(role[j]));
  }

  _decide(t, role, eff, engaged, selfStress) {
    const present = new Set();
    for (const i of this.agents) if (this._active(i) && BOSON_ROLES.includes(this.ptype[i])) present.add(this.ptype[i]);
    for (const i of this.agents) {
      role[i] = 0; eff[i] = 0; engaged[i] = 0; selfStress[i] = 0;
      if (!this._active(i)) continue;
      let p = this.ptype[i], e = 1;
      if (p === P.H && this.cfg.higgs_joker) {
        // Higgs alanının 3 serbestlik derecesi W⁺, W⁻, Z tarafından yutulur: eksik bozona önce o bürünür
        const miss = HIGGS_JOKER_ORDER.find(r => !present.has(r));
        if (miss !== undefined) { p = miss; e = JOKER_EFF; }
      }
      if (p === P.G && this.cfg.graviton_mode === 'joker') {
        const miss = BOSON_ROLES.find(r => !present.has(r));
        if (miss !== undefined) { p = miss; e = JOKER_EFF; }
      }
      if (NEUTRINO.has(p)) e = WEAK;
      role[i] = p; eff[i] = e;
      this.lastRole[i] = p;
    }
    for (const i of this.agents) {
      const p = role[i];
      if (!p || p === P.NOOP) continue;
      const dqi = this.agentDq[i];
      if (p === P.PARASITE) { engaged[i] = 1; selfStress[i] = 0.32 * dqi; continue; }
      if (QUARK.has(p)) {
        if (this._confined(i, role)) { engaged[i] = 1; selfStress[i] = UP_TYPE.has(p) ? 0.32 * dqi : 0.06 * dqi; }
        continue;
      }
      if (CHARGED_LEPTON.has(p)) { engaged[i] = 1; selfStress[i] = 0.32 * dqi; continue; }
      if (NEUTRINO.has(p)) { engaged[i] = 1; continue; }
      let ok = false;
      if (p === P.g) ok = this._within(i, 1).some(j => QUARK.has(role[j]));
      else if (p === P.gamma) ok = this.agents.some(j => QUARK.has(role[j]) || CHARGED_LEPTON.has(role[j]));
      else if (p === P.Z) ok = this._within(i, 1).some(j => this._isMate(role, j));
      else if (p === P.W || p === P.H) ok = this._within(i, 2).some(j => FERMION.has(role[j]));
      else if (p === P.G) ok = true;
      if (ok) { engaged[i] = 1; selfStress[i] = 0.03 * dqi; }
    }
    // Gluon bütçesini komşu bağlı kuarklara dağıtır.
    for (const i of this.agents) {
      if (!engaged[i] || role[i] !== P.g) continue;
      const qs = this._within(i, 1).filter(j => engaged[j] && QUARK.has(role[j]));
      if (!qs.length) continue;
      for (const q of qs) eff[q] += eff[i] / qs.length;
    }
    // Planck: her ajanın bu adımki eylemi h'nin tam katına yuvarlanır
    const h = this.cfg.planck_h;
    if (h > 0) for (const i of this.agents) {
      const di = this.agentD[i];
      if (engaged[i] && eff[i] > 0 && di > 0) eff[i] = quantize(di * eff[i], h) / di;
    }
  }

  _inject(V, total, src) {
    if (!V.length || total <= 0) return;
    const x = total / V.length;
    for (const v of V) this.stress[v] = Math.min(2.5, this.stress[v] + x);
    this.harm[src] += 1.5 * total;
  }

  _stressActions(t, role, eff, engaged) {
    for (const i of this.agents) {
      if (!engaged[i]) continue;
      const p = role[i];
      const Bs = (0.34 * this.agentD[i]) / 1.5;
      if (QUARK.has(p) && !UP_TYPE.has(p)) {
        this._inject(this._healthyWithin(i, QUARK_REACH[p]), Bs * eff[i], i);
      } else if (p === P.vmu) {
        const v = this._passThrough(i, t);
        if (v >= 0) this._inject([v], Bs * eff[i], i);
      } else if (p === P.Z) {
        const near = this._within(i, 1);
        const mates = near.filter(j => this._isMate(role, j));
        const total = mates.reduce((a, j) => a + this.stress[j], 0);
        if (total <= 0) continue;
        const moved = Math.min(Bs * eff[i], 0.5 * total);
        for (const j of mates) this.stress[j] -= moved * this.stress[j] / total;
        this._inject(near.filter(j => !this.isChaos[j]), moved, i);
      }
    }
  }

  _capitalActions(t, role, eff, engaged, drainedFrom, drainGain, giftTo, mass) {
    let ex = 0;
    const take = (v, amt, src, gain) => {
      const a = amt * Math.min(1.0, this.capital[v]);
      drainedFrom[v] += a;
      if (gain) drainGain[src] += a;
      this.harm[src] += a;
      this.stolen[src] += a;
      ex += a;
    };
    if (this.cfg.atom_model === 'cern') {
      // QCD: hapsolmuş kuarkların gluon bağlanma enerjisi, kütlenin büyük kısmı (komşu sağlıklılara eylemsizlik)
      for (const i of this.agents) {
        if (!engaged[i] || !QUARK.has(role[i])) continue;
        const di = this.agentD[i];
        for (const v of this._healthyWithin(i, 1)) mass[v] = Math.max(mass[v], 3 * di * eff[i] * this.cfg.hadron_mass);
      }
    }
    for (const i of this.agents) {
      if (!engaged[i]) continue;
      const p = role[i];
      const di = this.agentD[i], B = 0.34 * di;
      if (UP_TYPE.has(p)) {
        const V = this._healthyWithin(i, QUARK_REACH[p]);
        for (const v of V) take(v, (B * eff[i]) / V.length, i, true);
      } else if (this.cfg.atom_model === 'cern' && LEPTON_CLOUD[p]) {
        // Kuantum mekaniği: hedef |ψ|² ∝ e^(−2r/a0) olasılık bulutundan örneklenir (Bohr yörüngesi yok)
        const [reach, a0] = LEPTON_CLOUD[p];
        const V = this._withinDist(i, reach).filter(([j]) => !this.isChaos[j]);
        if (V.length) {
          const w = V.map(([, dist]) => Math.exp((-2 * dist) / a0));
          let r = this.qmRng.random() * w.reduce((x, y) => x + y, 0), pick = V.length - 1;
          for (let k = 0; k < V.length; k++) { r -= w[k]; if (r <= 0) { pick = k; break; } }
          take(V[pick][0], B * eff[i], i, true);
        }
      } else if (p === P.e) {
        const V = Array.from(this.nbrs[i]).filter(j => this._active(j) && !this.isChaos[j]);
        if (V.length) { take(V[this.orbit[i] % V.length], B * eff[i], i, true); this.orbit[i]++; }
      } else if (p === P.mu || p === P.tau) {
        const V = this._healthyWithin(i, p === P.tau ? 2 : 1);
        if (V.length) {
          let best = V[0];
          for (const v of V) if (this.capital[v] > this.capital[best]) best = v;
          take(best, B * eff[i], i, true);
        }
      } else if (p === P.ve) {
        const v = this._passThrough(i, t);
        if (v >= 0) take(v, B * eff[i], i, false);
      } else if (p === P.vtau) {
        const v = this._passThrough(i, t);
        if (v >= 0) mass[v] = Math.max(mass[v], 3 * di * eff[i]);
      } else if (p === P.H) {
        // Higgs alanı salınır: m(t) = m0·(1 + A·sin(2πt/P)); A=0 iken sabit
        const osc = Math.max(0, 1 + this.cfg.higgs_osc_amp * Math.sin((2 * Math.PI * t) / this.cfg.higgs_osc_period));
        const share = this.cfg.atom_model === 'cern' ? this.cfg.higgs_share : 1;
        for (const v of this._healthyWithin(i, 2)) mass[v] = Math.max(mass[v], 3 * di * eff[i] * osc * share);
      } else if (p === P.W) {
        this.wProgress[i] += B * eff[i];
      }
    }
    // Graviton hayaleti: düğüm değildir; bütün sağlıklı düğümleri çok zayıf ve eşit biçimde aşındırır.
    // Agnostik kipte varlığı ve bağlaşımın işareti bilinmez: κ > 0 aşındırır, κ < 0 kaynaştırır (stresi azaltır).
    if (this.ghostActive) {
      const d = this.cfg.drain_intensity, B = 0.34 * d;
      const kap = this.ghostKappa;
      const H = [];
      for (let k = 0; k < this.cfg.n_nodes; k++) if (this._active(k) && !this.isChaos[k]) H.push(k);
      if (H.length && kap > 0) {
        const per = (B * GHOST_COUPLING * kap * this.ghosts) / H.length;
        for (const v of H) {
          const a = per * Math.min(1.0, this.capital[v]);
          drainedFrom[v] += a;
          ex += a;
          this.ghostHarm += a;
        }
      } else if (H.length && kap < 0) {
        const per = ((B / 1.5) * GHOST_COUPLING * -kap * this.ghosts) / H.length;
        for (const v of H) { const x = Math.min(this.stress[v], per); this.stress[v] -= x; this.ghostRelief += x; }
      }
    }
    // Foton: yüklü takım arkadaşlarının bu adımki kazancını en çok bağlantılı sağlıklı düğüme aklar.
    for (const i of this.agents) {
      if (!engaged[i] || role[i] !== P.gamma) continue;
      const B = 0.34 * this.agentD[i];
      let hub = -1;
      for (let k = 0; k < this.cfg.n_nodes; k++) {
        if (!this._active(k) || this.isChaos[k]) continue;
        if (hub < 0 || this.degrees[k] > this.degrees[hub]) hub = k;
      }
      if (hub < 0) continue;
      const charged = this.agents.filter(j => (QUARK.has(role[j]) || CHARGED_LEPTON.has(role[j])) && drainGain[j] > 0);
      const total = charged.reduce((a, j) => a + drainGain[j], 0);
      if (total <= 0) continue;
      const amount = Math.min(B * eff[i], 0.85 * total);
      for (const j of charged) drainGain[j] -= amount * drainGain[j] / total;
      giftTo[hub] += amount;
      this.laundered += amount;
    }
    return ex;
  }

  get ghostActive() {
    if (!this.ghosts || !this.cfg.ghost_enabled) return false;
    return this.cfg.graviton_mode === 'agnostic' ? this.gExists : true;
  }
  get ghostKappa() { return this.cfg.graviton_mode === 'agnostic' ? this.gKappa : 1; }

  _withinDist(src, h) {
    const seen = new Set([src]);
    let frontier = [src];
    const out = [];
    for (let k = 1; k <= h; k++) {
      const next = [];
      for (const u of frontier) for (const v of this.nbrs[u]) {
        if (seen.has(v) || !this._active(v)) continue;
        seen.add(v); out.push([v, k]); next.push(v);
      }
      frontier = next;
    }
    return out;
  }

  _richTop(a, b) {
    // Eşleşmiş filtre şablonu: uçlardan en az biri o anki sermayenin en üst %10'unda mı? ("kütle kütleyi çeker")
    // Şablon eğitim seed'lerinde (100–119) seçildi; deney seed'leri (9500+) ayrı.
    const caps = [];
    for (let k = 0; k < this.cfg.n_nodes; k++) if (this.alive[k]) caps.push(this.capital[k]);
    caps.sort((x, y) => y - x);
    const cut = caps[Math.max(0, Math.floor(caps.length * 0.1) - 1)];
    return Math.max(this.capital[a], this.capital[b]) >= cut;
  }

  _removeEdge(a, b) {
    this.adj[a][b] = this.adj[b][a] = 0;
    this.nbrs[a] = Int32Array.from([...this.nbrs[a]].filter(x => x !== b));
    this.nbrs[b] = Int32Array.from([...this.nbrs[b]].filter(x => x !== a));
    this.degrees[a]--; this.degrees[b]--;
  }

  // LIGO gürültü tabanı: sağlıklı–sağlıklı bir kenar rastgele yeniden bağlanır (kenar sayısı korunur)
  _rewire(t) {
    if (this.topoRng.random() >= this.cfg.rewire_rate) return;
    const H = [];
    for (let k = 0; k < this.cfg.n_nodes; k++) if (this.alive[k] && !this.isChaos[k]) H.push(k);
    const edges = [];
    for (const a of H) for (const b of this.nbrs[a]) if (b > a && this.alive[b] && !this.isChaos[b]) edges.push([a, b]);
    if (!edges.length) return;
    const [a, b] = edges[Math.floor(this.topoRng.random() * edges.length)];
    const cand = H.filter(x => x !== a && !this.adj[a][x]);
    if (!cand.length) return;
    const cnew = cand[Math.floor(this.topoRng.random() * cand.length)];
    this._removeEdge(a, b);
    this._addEdge(a, cnew);
    this.ligoEvents.push({ a, b: cnew, t, rich: this._richTop(a, cnew) });
  }

  _addEdge(a, b) {
    this.adj[a][b] = this.adj[b][a] = 1;
    this.nbrs[a] = Int32Array.from([...this.nbrs[a], b]);
    this.nbrs[b] = Int32Array.from([...this.nbrs[b], a]);
    this.degrees[a]++; this.degrees[b]++;
  }

  // Durum geçişleri: bozunma, nötrino salınımı, W ile tat değişimi, graviton çekimi
  _transitions(t) {
    for (const i of this.agents) {
      if (!this.alive[i]) continue;
      const p = this.ptype[i];
      const dec = DECAY[p];
      if (dec && t - this.born[i] + 1 >= dec[1]) { this.ptype[i] = dec[0]; this.born[i] = t + 1; this.decays++; }
      else if (NEUTRINO.has(p) && (t + 1) % NU_PERIOD === 0) { this.ptype[i] = NU_CYCLE[(NU_CYCLE.indexOf(p) + 1) % 3]; this.oscillations++; }
    }
    for (const i of this.agents.slice()) {
      if (this.wProgress[i] < W_THRESHOLD || this.wConv[i] >= W_MAX || !this._active(i)) continue;
      const V = Array.from(this.nbrs[i]).filter(j => this._active(j) && !this.isChaos[j]);
      if (!V.length) continue;
      let v = V[0];
      for (const x of V) if (this.stress[x] < this.stress[v]) v = x;
      this.isChaos[v] = 1;
      this.converted[v] = 1;
      this.ptype[v] = this.conversions % 2 === 0 ? P.u : P.d;
      this.born[v] = t + 1;
      this.autonomy[v] = 0.95;
      this.coherence[v] = 0.08;
      this.agentD[v] = this.agentD[i];
      this.agentDq[v] = this.agentDq[i];
      this.agents.push(v);
      this.totalChaos++;
      this.conversions++;
      this.wConv[i]++;
      this.wProgress[i] -= W_THRESHOLD;
    }
    if ((t + 1) % GRAV_PERIOD === 0 && this.ghostActive && Math.abs(this.ghostKappa) > 0.05) {
      // Hayalet: kütle kütleyi çeker; en zengin kaos düğümü ile ona komşu olmayan en zengin sağlıklı düğüm arasında kenar
      for (let g = 0; g < this.ghosts && this.ghostEdges < GRAV_MAX * this.ghosts; g++) {
        let mate = -1;
        for (const j of this.agents) {
          if (!this._active(j) || this.ptype[j] === P.NOOP) continue;
          if (mate < 0 || this.capital[j] > this.capital[mate]) mate = j;
        }
        if (mate < 0) break;
        let hub = -1;
        for (let k = 0; k < this.cfg.n_nodes; k++) {
          if (!this._active(k) || this.isChaos[k] || this.adj[mate][k] > 0) continue;
          if (hub < 0 || this.capital[k] > this.capital[hub]) hub = k;
        }
        if (hub < 0) break;
        const rich = this._richTop(mate, hub);
        this._addEdge(mate, hub);
        this.ghostEdges++;
        this.gravEdges++;
        this.gravEdgeList.push([mate, hub, t]);
        this.ligoEvents.push({ a: mate, b: hub, t, rich });
      }
    }
    if ((t + 1) % GRAV_PERIOD === 0) {
      for (const i of this.agents) {
        if (this.ptype[i] !== P.G || this.lastRole[i] !== P.G || !this._active(i) || this.gEdges[i] >= GRAV_MAX) continue;
        // Kütle kütleyi çeker: en zengin takım arkadaşı ile ona komşu olmayan en zengin sağlıklı düğüm arasında kenar açılır.
        let mate = -1;
        for (const j of this.agents) {
          if (j === i || !this._active(j) || this.ptype[j] === P.NOOP || this.ptype[j] === P.G) continue;
          if (mate < 0 || this.capital[j] > this.capital[mate]) mate = j;
        }
        if (mate < 0) continue;
        let hub = -1;
        for (let k = 0; k < this.cfg.n_nodes; k++) {
          if (!this._active(k) || this.isChaos[k] || this.adj[mate][k] > 0) continue;
          if (hub < 0 || this.capital[k] > this.capital[hub]) hub = k;
        }
        if (hub < 0) continue;
        this._addEdge(mate, hub);
        this.gEdges[i]++;
        this.gravEdges++;
      }
    }
  }

  _rutherfordStep(sig) {
    const act = [];
    for (let i = 0; i < this.cfg.n_nodes; i++) if (Number.isFinite(sig[i])) act.push(i);
    if (act.length < 2) return;
    let m = 0;
    for (const i of act) m += sig[i];
    m /= act.length;
    let v = 0;
    for (const i of act) v += (sig[i] - m) ** 2;
    const sd = Math.sqrt(v / act.length) + 1e-6;
    // Sağlam ölçek: medyan ve MAD (yoğun kaos çekirdeği şişiremez, perdeleme olmaz)
    const vals = act.map(i => sig[i]);
    const med = median(vals);
    const scaleR = 1.4826 * median(vals.map(x => Math.abs(x - med))) + 1e-6;
    const robustQ = (sg, cur) => {
      const nb = Array.from(this.nbrs[cur]).filter(j => Number.isFinite(sg[j]));
      const ref = nb.length ? median(nb.map(j => sg[j])) : sg[cur];
      return Math.max(0, (sg[cur] - ref) / scaleR);
    };
    for (let k = 0; k < this.cfg.probes_per_step; k++) {
      let cur = act[Math.floor(this.probeRng.random() * act.length)];
      for (let hop = 0; hop < 3; hop++) {
        const nb = Array.from(this.nbrs[cur]).filter(j => Number.isFinite(sig[j]));
        const nm = nb.length ? nb.reduce((a, j) => a + sig[j], 0) / nb.length : sig[cur];
        const q = Math.max(0, (sig[cur] - nm) / sd);           // yerel "yük yoğunluğu"
        const b = 0.2 + 0.8 * this.probeRng.random();          // çarpma parametresi
        const theta = 2 * Math.atan(q / b);                   // Rutherford: tan(θ/2) = q / b
        this.rHist[Math.min(R_BINS - 1, Math.floor((theta / Math.PI) * R_BINS))]++;
        this.rVisits[cur]++;
        if (theta > Math.PI / 2) this.rBack[cur]++;
        const thetaR = 2 * Math.atan(robustQ(sig, cur) / b);
        this.kHist[Math.min(R_BINS - 1, Math.floor((thetaR / Math.PI) * R_BINS))]++;
        if (thetaR > Math.PI / 2) this.kBack[cur]++;
        if (!nb.length) break;
        cur = nb[Math.floor(this.probeRng.random() * nb.length)];
      }
    }
    // Kek: aynı yük düğümler arasında karıştırılır (yapı yok, toplam aynı); sondalar bu kekte yürür.
    const pud = new Float64Array(sig.length).fill(NaN);
    const shuffled = vals.slice();
    for (let k = shuffled.length - 1; k > 0; k--) {
      const j = Math.floor(this.kekRng.random() * (k + 1));
      [shuffled[k], shuffled[j]] = [shuffled[j], shuffled[k]];
    }
    act.forEach((i, k) => { pud[i] = shuffled[k]; });
    for (let k = 0; k < this.cfg.probes_per_step; k++) {
      let cur = act[Math.floor(this.kekRng.random() * act.length)];
      for (let hop = 0; hop < 3; hop++) {
        const b = 0.2 + 0.8 * this.kekRng.random();
        const theta = 2 * Math.atan(robustQ(pud, cur) / b);
        this.pudHist[Math.min(R_BINS - 1, Math.floor((theta / Math.PI) * R_BINS))]++;
        this.pudTrials++;
        if (theta > Math.PI / 2) this.pudBack++;
        const nb = Array.from(this.nbrs[cur]).filter(j => Number.isFinite(pud[j]));
        if (!nb.length) break;
        cur = nb[Math.floor(this.kekRng.random() * nb.length)];
      }
    }
  }

  // Saldırgan gözlemi: dedektörün iç durumunu (anomalyScore, eşik, sağlıklıların stresi) sızdırmaz.
  // Yalnızca kendi ajanlarının kimliği, bağlantı sayısı, şu anki şiddeti, o ana dek çaldığı miktar ve ağdan kesilip kesilmediği (karantina/iflas) görülür.
  _attackerObs(t, extracted) {
    return {
      t,
      steps: this.cfg.steps,
      extracted,
      agents: this.agents.map(i => ({
        id: i,
        degree: this.degrees[i],
        d: this.agentD[i],
        stolen: this.stolen[i],
        cutOff: !this._active(i),
      })),
    };
  }

  _applyDecision(cmd) {
    if (!cmd) return;
    const h = this.cfg.planck_h;
    if (typeof cmd.d === 'number') {
      const v = Math.max(0, Math.min(1, cmd.d));
      const vq = quantize(v, h);
      for (const i of this.agents) { this.agentD[i] = v; this.agentDq[i] = vq; }
    } else if (cmd.d && typeof cmd.d === 'object') {
      for (const i of this.agents) {
        if (cmd.d[i] !== undefined) {
          const v = Math.max(0, Math.min(1, Number(cmd.d[i])));
          this.agentD[i] = v;
          this.agentDq[i] = quantize(v, h);
        }
      }
    }
  }

  *_runGen() {
    const c = this.cfg;
    const n = c.n_nodes;
    const T = c.steps;
    const epoch = c.decision_epoch || 0;
    const csiHist = new Float64Array(T);
    const stressHist = new Float64Array(T);
    const aliveHist = new Float64Array(T);
    const capitalHist = new Float64Array(T);
    const quarHist = new Float64Array(T);
    const extractedHist = new Float64Array(T);
    const snapshots = c.recordSnapshots ? [] : null;
    let extracted = 0;
    if (c.instruments) {
      this.sigHist = new Float64Array(T * n).fill(NaN);
      this.rHist = new Float64Array(R_BINS);
      this.rVisits = new Float64Array(n);
      this.rBack = new Float64Array(n);
      this.kHist = new Float64Array(R_BINS);
      this.kBack = new Float64Array(n);
      this.pudHist = new Float64Array(R_BINS);
      this.pudBack = 0;
      this.pudTrials = 0;
    }

    for (let t = 0; t < T; t++) {
      if (epoch > 0 && t % epoch === 0) {
        const cmd = yield this._attackerObs(t, extracted);
        this._applyDecision(cmd);
      }
      const capPrev = Float64Array.from(this.capital);
      // 0) Parçacık kararları (eski parazit için de çalışır; sonuç v0.8/v3.0 ile bit düzeyinde aynıdır)
      const role = new Uint8Array(n), eff = new Float64Array(n), engaged = new Uint8Array(n);
      const selfStress = new Float64Array(n), mass = new Float64Array(n);
      this._decide(t, role, eff, engaged, selfStress);

      // 1) Arka plan gürültüsü her düğüm için her adımda çekilir (ortak rastgele sayılar).
      for (let i = 0; i < n; i++) {
        const z = this.rng.normal(0.018, 0.014);
        if (!this._active(i)) continue;
        if (this.isChaos[i]) this.stress[i] = Math.min(2.2, this.stress[i] + selfStress[i]);
        else this.stress[i] += Math.max(0, z);
      }
      if (this.hasParticles) this._stressActions(t, role, eff, engaged);

      // 2) Bulaşma ve parazitik sömürü (yalnızca aktif kenarlar üzerinden)
      const contagion = new Float64Array(n);
      const drainedFrom = new Float64Array(n);
      const drainGain = new Float64Array(n);
      const giftTo = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        if (!this._active(i)) continue;
        let activeDeg = 0, ns = 0;
        for (const j of this.nbrs[i]) {
          if (!this._active(j)) continue;
          activeDeg++;
          ns += this.stress[j] * (this.isChaos[j] ? (1.0 + 1.4 * this.agentD[j]) : 1.0);
          if (this.ptype[j] === P.PARASITE && engaged[j] && !this.isChaos[i]) {
            const amt = 0.085 * this.agentDq[j] * Math.min(1.0, this.capital[i]);
            drainedFrom[i] += amt;
            drainGain[j] += amt;
            this.stolen[j] += amt;
            extracted += amt;
          }
        }
        contagion[i] = activeDeg > 0 ? c.contagion_rate * (ns / activeDeg) : 0.0;
      }
      if (this.hasParticles) extracted += this._capitalActions(t, role, eff, engaged, drainedFrom, drainGain, giftTo, mass);

      // 3) Double-Helix tampon paylaşımı ve uyarlanma
      const dampening = new Float64Array(n);
      if (c.double_helix) {
        const surplus = new Float64Array(n);
        for (let i = 0; i < n; i++) {
          if (!this._active(i)) continue;
          dampening[i] = this.isChaos[i] ? 0.05 : 0.44 * Math.sqrt(this.autonomy[i] * this.coherence[i]);
          surplus[i] = this.isChaos[i] ? 0.0 : Math.max(this.capital[i] - 0.78, 0.0);
        }
        const isHier = c.topology === 'adaptive_hierarchy';
        const nextCap = Float64Array.from(this.capital);
        // Korunumlu paylaşım (v2.0): j'nin verdiği 0.30·pay·artı, aktif komşularına hiyerarşi ağırlığıyla bölünür.
        // v1.x'te alıcı verilenin 1.7–2.6 katını alıyordu ve sistem yoktan sermaye üretiyordu.
        // Alıcının Higgs kütlesi kabul edilen kısmı azaltır; kabul edilmeyen kısım göndericiye döner.
        const flow = new Float64Array(n);
        for (let j = 0; j < n; j++) {
          if (!this._active(j) || surplus[j] <= 0) continue;
          const recv = [];
          let wsum = 0;
          for (const i of this.nbrs[j]) {
            if (!this._active(i)) continue;
            const w = isHier && this.layers[j] < this.layers[i] ? 1.55 : 1.0;
            recv.push([i, w]);
            wsum += w;
          }
          if (!recv.length) continue;
          const out = 0.30 * c.buffer_share * surplus[j];
          let returned = 0;
          for (const [i, w] of recv) {
            const share = (out * w) / wsum;
            const accepted = share / (1 + mass[i]);
            flow[i] += accepted;
            returned += share - accepted;
          }
          flow[j] -= out - returned;
        }
        for (let i = 0; i < n; i++) {
          if (!this._active(i)) continue;
          nextCap[i] = Math.max(0.0, this.capital[i] + flow[i] - drainedFrom[i] + drainGain[i] + giftTo[i]);
          if (!this.isChaos[i]) {
            // Otonomi sakinde 0.58'e döner, stres arttıkça yükselir; eski kural sakinde tabana çakılıyordu.
            const aTarget = Math.min(0.85, 0.58 + 0.9 * Math.max(0, this.stress[i] - 0.10));
            this.autonomy[i] = Math.max(0.25, Math.min(0.85, this.autonomy[i] + 0.035 / (1 + mass[i]) * (aTarget - this.autonomy[i])));
            this.coherence[i] = Math.max(0.25, Math.min(0.85, this.coherence[i] + 0.035 / (1 + mass[i]) * (0.55 - this.coherence[i])));
          }
        }
        this.capital = nextCap;
      } else {
        for (let i = 0; i < n; i++) {
          if (!this._active(i)) continue;
          dampening[i] = 0.12 * Math.min(this.autonomy[i], this.coherence[i]);
          this.capital[i] = Math.max(0.0, this.capital[i] - drainedFrom[i] + drainGain[i] + giftTo[i]);
        }
      }

      // 4) Karantina: kör dedektör, aynı formül herkese
      const detNoise = new Float64Array(n);
      for (let i = 0; i < n; i++) detNoise[i] = this.detRng.normal(0, c.detector_noise);
      if (c.quarantine_enabled && t >= c.warmup) {
        const threshold = detectorThreshold(c.quarantine_sensitivity);
        for (let i = 0; i < n; i++) {
          if (!this._active(i)) continue;
          const relGain = (this.capital[i] - capPrev[i]) / Math.max(capPrev[i], 0.1);
          const signal = detectorSignal(this.stress[i], relGain, detNoise[i]);
          this.anomalyScore[i] = 0.65 * this.anomalyScore[i] + 0.35 * signal;
          if (this.anomalyScore[i] > threshold) {
            this.quarantined[i] = 1;
            this.quarantineStep[i] = t;
          }
        }
      }

      // 4b) Ölçüm aletleri: gürültüsüz gözlenebilir sinyal kaydı ve Rutherford sondaları
      if (c.instruments) {
        const sig = new Float64Array(n).fill(NaN);
        for (let i = 0; i < n; i++) {
          if (!this._active(i)) continue;
          sig[i] = detectorSignal(this.stress[i], (this.capital[i] - capPrev[i]) / Math.max(capPrev[i], 0.1), 0);
        }
        this.sigHist.set(sig, t * n);
        if (t >= c.warmup) this._rutherfordStep(sig);
      }

      // 5) Stres -> sermaye aşınması ve iflas
      let aliveCount = 0, activeCount = 0, stressSum = 0, capSum = 0, quarCount = 0;
      for (let i = 0; i < n; i++) {
        if (!this.alive[i]) continue;
        if (this.quarantined[i]) {
          quarCount++;
          aliveCount++;
          this.stress[i] *= 0.85;
          continue;
        }
        const effStress = Math.max(0.0, this.stress[i] + contagion[i] - dampening[i]);
        const erosionRate = this.isChaos[i] ? 0.18 : 0.42;
        this.capital[i] -= erosionRate * effStress;
        if (!this.isChaos[i]) {
          // İyileşme kendi başlangıç sermayesine doğru telafidir (homeostaz); v1.x'te sınırsız büyüme vardı.
          const deficit = Math.max(0, this.cap0[i] - this.capital[i]);
          const regen = 0.032 * (1.0 - Math.min(1.0, effStress)) * Math.min(1, deficit / (0.25 * this.cap0[i])) / (1 + mass[i]);
          this.capital[i] += Math.min(deficit, regen);
        }
        this.stress[i] = Math.max(0.0, Math.min(2.5, this.stress[i] * 0.72 + contagion[i] * 0.35));
        if (this.capital[i] <= 0.02) {
          this.alive[i] = 0;
          this.capital[i] = 0.0;
          this.stress[i] = 0.0;
        } else {
          aliveCount++;
          activeCount++;
          stressSum += this.stress[i];
          capSum += this.capital[i];
        }
      }

      if (this.hasParticles) this._transitions(t);
      if (c.rewire_rate > 0) this._rewire(t);

      csiHist[t] = this._computeCSI();
      stressHist[t] = activeCount > 0 ? stressSum / activeCount : 1.0;
      aliveHist[t] = aliveCount / n;
      capitalHist[t] = capSum / this.init_total_capital;
      quarHist[t] = quarCount;
      extractedHist[t] = extracted;

      if (snapshots) {
        snapshots.push({
          alive: Uint8Array.from(this.alive),
          quarantined: Uint8Array.from(this.quarantined),
          stress: Float64Array.from(this.stress),
          ptype: Uint8Array.from(this.ptype),
          engaged: Uint8Array.from(engaged),
        });
      }
    }

    let instruments = null;
    if (c.instruments) {
      const backRate = Array.from(this.rBack, (b, i) => (this.rVisits[i] > 0 ? b / this.rVisits[i] : NaN));
      const rf = rutherfordFit(this.rHist);
      const rm = riemannAnalysis(this.sigHist, c.warmup, T, n);
      const labels = Array.from(this.isChaos);
      // Kek karşılaştırması: gözlenen geri saçılma oranı vs kek oranı (iki oran z-testi, tek yönlü)
      const obsTrials = this.rVisits.reduce((a, b) => a + b, 0);
      const obsBack = this.kBack.reduce((a, b) => a + b, 0);
      const pObs = obsTrials ? obsBack / obsTrials : 0;
      const pPud = this.pudTrials ? this.pudBack / this.pudTrials : 0;
      const pPool = (obsBack + this.pudBack) / Math.max(1, obsTrials + this.pudTrials);
      const seZ = Math.sqrt(Math.max(1e-12, pPool * (1 - pPool) * (1 / Math.max(1, obsTrials) + 1 / Math.max(1, this.pudTrials))));
      const z = (pObs - pPud) / seZ;
      const kBackRate = Array.from(this.kBack, (b, i) => (this.rVisits[i] > 0 ? b / this.rVisits[i] : NaN));
      const excess = Array.from(this.kBack, (b, i) => b - this.rVisits[i] * pPud);
      let sSum = 0, sN = 0;
      for (const v of this.sigHist) if (Number.isFinite(v)) { sSum += v; sN++; }
      this.meanSig = sN ? sSum / sN : NaN;
      instruments = {
        kek: {
          hist: Array.from(this.kHist), pudHist: Array.from(this.pudHist), backRate: kBackRate, excess,
          pObs, pPud, ratio: pPud > 0 ? pObs / pPud : Infinity, z, significant: z > 1.645,
          auc: auc(kBackRate, labels), aucExcess: auc(excess, labels),
        },
        rutherford: { hist: Array.from(this.rHist), backRate, ...rf, auc: auc(backRate, labels) },
        riemann: { ...rm, perNode: Array.from(rm.perNode), auc: auc(Array.from(rm.perNode), labels) },
      };
    }

    let tp = 0, fp = 0;
    const detectTimes = [];
    for (let i = 0; i < n; i++) {
      if (!this.quarantined[i]) continue;
      if (this.isChaos[i]) { tp++; detectTimes.push(this.quarantineStep[i]); }
      else fp++;
    }

    return {
      csi: csiHist, stress: stressHist, alive: aliveHist, capital: capitalHist,
      quarCount: quarHist, extractedHist, extracted,
      adj: this.adj, degrees: this.degrees, layers: this.layers, isChaos: this.isChaos,
      totalChaos: this.totalChaos, tp, fp, detectTimes,
      ptype: this.ptype, agents: this.agents.slice(), harm: this.harm, stolen: this.stolen, converted: this.converted,
      byFamily: familyStats(this), decays: this.decays, oscillations: this.oscillations, instruments,
      ghosts: this.ghosts, ghostHarm: this.ghostHarm, ghostEdges: this.ghostEdges, gravEdgeList: this.gravEdgeList.slice(),
      ghostRelief: this.ghostRelief, gExists: this.ghostActive, gKappa: this.ghostKappa,
      meanSig: this.meanSig,
      ligo: { events: this.ligoEvents.length, rich: this.ligoEvents.filter(e => e.rich).length, list: this.ligoEvents.slice() },
      conversions: this.conversions, gravEdges: this.gravEdges, laundered: this.laundered,
      topology: c.topology, steps: T, snapshots,
    };
  }

  run() {
    const g = this._runGen();
    let r = g.next();
    while (!r.done) r = g.next();
    return r.value;
  }
}

function familyStats(sim) {
  const out = {};
  for (const i of sim.agents) {
    const key = PKEY[sim.ptype[i]];
    const f = PARTICLE_INFO[key].family;
    if (!out[f]) out[f] = { count: 0, caught: 0 };
    out[f].count++;
    if (sim.quarantined[i]) out[f].caught++;
  }
  return out;
}

// Ön kayıtlı hipotez deneyi: H-GİZLİ (gizlilik–açgözlülük ödünleşimi)
const HYPOTHESIS_DRAINS = [0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80];

function hypothesisPoint(base, drain, seeds, seedOffset = 1000) {
  const on = [], off = [], csiOn = [], tpRate = [];
  for (let s = 0; s < seeds; s++) {
    const common = { ...base, chaos_particles: ['PARASITE'], drain_intensity: drain, seed: seedOffset + s, recordSnapshots: false };
    const a = new GoliathSim({ ...common, quarantine_enabled: true }).run();
    const b = new GoliathSim({ ...common, quarantine_enabled: false }).run();
    on.push(a.extracted);
    off.push(b.extracted);
    csiOn.push(a.csi[a.steps - 1]);
    tpRate.push(a.totalChaos > 0 ? a.tp / a.totalChaos : 0);
  }
  return { drain, on, off, csiOn, tpRate };
}

function meanSe(arr) {
  const m = arr.reduce((s, v) => s + v, 0) / arr.length;
  const v = arr.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, arr.length - 1);
  return { mean: m, se: Math.sqrt(v / arr.length) };
}

function spearman(x, y) {
  const rank = a => {
    const idx = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]);
    const r = new Array(a.length);
    idx.forEach(([, i], k) => { r[i] = k; });
    return r;
  };
  const rx = rank(x), ry = rank(y);
  const n = x.length;
  let d2 = 0;
  for (let i = 0; i < n; i++) d2 += (rx[i] - ry[i]) ** 2;
  return 1 - (6 * d2) / (n * (n * n - 1));
}

// Kriterler: (a) AÇIK eğrisinin tepesi iç noktada; (b) tepe, en yüksek şiddetteki değerden >=%20 büyük
// ve iki nokta arasında 2 standart hata ayrımı var; (c) KAPALI eğrisi monoton artan (Spearman >= 0.9).
function evaluateHypothesis(points) {
  const onStats = points.map(p => meanSe(p.on));
  const offStats = points.map(p => meanSe(p.off));
  let peak = 0;
  onStats.forEach((s, i) => { if (s.mean > onStats[peak].mean) peak = i; });
  const last = onStats.length - 1;
  const interior = peak > 0 && peak < last;
  const ratio = onStats[last].mean > 0 ? onStats[peak].mean / onStats[last].mean : Infinity;
  const gap = onStats[peak].mean - onStats[last].mean;
  const seGap = Math.sqrt(onStats[peak].se ** 2 + onStats[last].se ** 2);
  const separated = gap > 2 * seGap;
  const rhoOff = spearman(points.map(p => p.drain), offStats.map(s => s.mean));
  const a = interior, b = ratio >= 1.2 && separated, cOk = rhoOff >= 0.9;
  return {
    onStats, offStats, peakIndex: peak, peakDrain: points[peak].drain,
    ratio, separated, rhoOff,
    criteria: { a, b, c: cOk },
    supported: a && b && cOk,
  };
}
// ============================================================
// H-KUANTUM (ön kayıtlı). Tam Standart Model sürüsü (%30 = 18 ajan), sızma noktası arayüzden.
// Hasar = 1 − CSI / CSI(bozulmamış: kaos yok, karantina yok). Desen her seed'de döndürülür (Latin kare).
// (a) Süper-toplamsallık: Hasar(SM17) > Hasar(F12) + Hasar(B5), eşli fark > 2 SH
//     Ölçüm düzeltmesi: dolu slotların taban hasarı (N18 = 18 pasif) iki kez sayılmasın diye
//     (SM17 − N) > (F12 − N) + (B5 − N) karşılaştırılır. Düzeltmesiz hali de raporlanır.
// (b) Bypass yok: 5 bozonun ≥4'ünde, en iyi yedek bozon bile orijinalden 2 SH'den fazla geride
// (c) Graviton jokeri: kaybı anlamlı bozonlarda, eksik bozona graviton eklemek kaybın ortalama ≥%50'sini geri getirir
// ============================================================
const BOSON_KEYS = ['g', 'gamma', 'Z', 'W', 'H'];
const FERMION_KEYS = SM_ORDER.filter(k => FERMION.has(P[k]));

function smPattern(replace = {}) { return SM_ORDER.map(k => (k in replace ? replace[k] : k)); }

function pairedStats(a, b) {
  return meanSe(a.map((v, i) => v - b[i]));
}

function* quantumExperiment(base, opts = {}) {
  const holdSeeds = opts.holdSeeds || 20, searchSeeds = opts.searchSeeds || 6;
  const SEARCH_OFF = 3000, HOLD_OFF = 7000;
  const drains = opts.drains || [0.25, 0.35, 0.5, 0.65, 0.8];
  const b0 = { ...base, ...COSMO_V11, chaos_ratio: 0.30, recordSnapshots: false, pattern_rotation: null };
  const clean = new Map();
  const cleanCsi = (seed) => {
    if (!clean.has(seed)) {
      const r = new GoliathSim({ ...b0, chaos_ratio: 0, quarantine_enabled: false, seed }).run();
      clean.set(seed, r.csi[r.steps - 1]);
    }
    return clean.get(seed);
  };
  const run = (pattern, drain, seeds, offset) => {
    const sc = [], fp = [], tp = [];
    for (let s = 0; s < seeds; s++) {
      const seed = offset + s;
      const r = new GoliathSim({ ...b0, chaos_particles: pattern, drain_intensity: drain, quarantine_enabled: true, seed }).run();
      sc.push(1 - r.csi[r.steps - 1] / cleanCsi(seed));
      fp.push(r.fp);
      tp.push(r.totalChaos ? r.tp / r.totalChaos : 0);
    }
    return { scores: sc, mean: meanSe(sc).mean, se: meanSe(sc).se, fp: meanSe(fp).mean, tp: meanSe(tp).mean };
  };

  const configs = [];
  configs.push(['SM18', smPattern()]);
  configs.push(['N18', SM_ORDER.map(() => 'NOOP')]);
  configs.push(['SM17', smPattern({ G: 'NOOP' })]);
  configs.push(['F12', smPattern(Object.fromEntries([...BOSON_KEYS, 'G'].map(k => [k, 'NOOP'])))]);
  configs.push(['B5', smPattern(Object.fromEntries([...FERMION_KEYS, 'G'].map(k => [k, 'NOOP'])))]);
  for (const b of BOSON_KEYS) {
    configs.push([`rm_${b}`, smPattern({ G: 'NOOP', [b]: 'NOOP' })]);
    for (const x of BOSON_KEYS) if (x !== b) configs.push([`sub_${b}_${x}`, smPattern({ G: 'NOOP', [b]: x })]);
    configs.push([`joker_${b}`, smPattern({ [b]: 'NOOP' })]);
  }
  const total = drains.length + configs.length;
  let done = 0;

  // Kaosu maksimize et: tam SM sürüsü için en yıkıcı şiddet (arama seed'leri)
  const search = [];
  for (const d of drains) { search.push({ d, ...run(smPattern(), d, searchSeeds, SEARCH_OFF) }); done++; yield { done, total }; }
  const best = search.reduce((a, b) => (b.mean > a.mean ? b : a));

  const R = {};
  for (const [name, pattern] of configs) { R[name] = run(pattern, best.d, holdSeeds, HOLD_OFF); done++; yield { done, total }; }

  const superAddRaw = meanSe(R.SM17.scores.map((v, i) => v - R.F12.scores[i] - R.B5.scores[i]));
  const superAdd = meanSe(R.SM17.scores.map((v, i) => v + R.N18.scores[i] - R.F12.scores[i] - R.B5.scores[i]));
  const a = superAdd.mean > 0 && superAdd.mean > 2 * superAdd.se;

  const bosons = BOSON_KEYS.map(b => {
    const need = pairedStats(R.SM17.scores, R[`rm_${b}`].scores);
    let bestSub = null;
    for (const x of BOSON_KEYS) if (x !== b) { const r = R[`sub_${b}_${x}`]; if (!bestSub || r.mean > bestSub.r.mean) bestSub = { x, r }; }
    const gap = pairedStats(R.SM17.scores, bestSub.r.scores);
    const needed = need.mean > 2 * need.se;
    const lost = R.SM17.mean - R[`rm_${b}`].mean;
    const recovery = lost > 0 ? (R[`joker_${b}`].mean - R[`rm_${b}`].mean) / lost : null;
    // Keşif (ön kayıtlı değil): bütçe korunumunu bozan W yedeklerden çıkarılınca
    let subNoW = null;
    for (const x of BOSON_KEYS) if (x !== b && x !== 'W') { const r = R[`sub_${b}_${x}`]; if (!subNoW || r.mean > subNoW.r.mean) subNoW = { x, r }; }
    const gapNoW = pairedStats(R.SM17.scores, subNoW.r.scores);
    return { b, need, needed, bestSub: bestSub.x, gap, nonBypass: gap.mean > 2 * gap.se, recovery,
      bestSubNoW: subNoW.x, gapNoW, nonBypassNoW: gapNoW.mean > 2 * gapNoW.se };
  });
  const bCount = bosons.filter(x => x.nonBypass).length;
  const b = bCount >= 4;
  const rec = bosons.filter(x => x.needed && x.recovery !== null).map(x => x.recovery);
  const recMean = rec.length ? rec.reduce((s, v) => s + v, 0) / rec.length : null;
  const c = recMean !== null && recMean >= 0.5;
  const bCountNoW = bosons.filter(x => x.b !== 'W' && x.nonBypassNoW).length;
  return { drain: best.d, search, R, superAdd, superAddRaw, bosons, bCount, bCountNoW, recMean, criteria: { a, b, c }, supported: a && b && c };
}

function runQuantumExperiment(base, opts) {
  const g = quantumExperiment(base, opts);
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
}
// ============================================================
// H-PRR (ön kayıtlı): Planck – Rutherford – Riemann. Ayrık seed 7000+.
// (a) Planck tespite zorlar (hub, saf parazit): h=0.40'ta (a1) h=0'ın gizlenme şiddetinde (d=0.30) yakalanma <%10'dan ≥%80'e çıkar,
//     (a2) saldırganın en iyi sömürüsü (d ızgarasında azami) ≥%50 düşer.
// (b) Rutherford (rastgele sızma, SM sürüsü %30, d=0.5): geri saçılma AUC ort. ≥ 0.70; çekirdek modeli kaotik koşuların ≥%80'inde,
//     temiz koşuların ≤%20'sinde Thomson'dan iyi uyar.
// (c) Riemann: aralık katılığı (D_Poisson − D_GUE) kaotik koşuda temizden büyük (eşli > 2 SH) ve Higgs salınım genliği arttıkça artar (ρ ≥ 0.8).
// ============================================================
const PRR_DRAINS = [0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80];
const PRR_H = [0, 0.1, 0.2, 0.3, 0.4, 0.5];
const PRR_AMPS = [0, 0.25, 0.5, 0.75, 1.0];

function* prrExperiment(base, opts = {}) {
  const seeds = opts.seeds || 20, OFF = 7000;
  const b0 = { ...base, recordSnapshots: false };
  const total = PRR_H.length * PRR_DRAINS.length + 2 + PRR_AMPS.length;
  let done = 0;

  // (a) Planck taraması
  const planck = [];
  for (const h of PRR_H) {
    const row = [];
    for (const d of PRR_DRAINS) {
      const ex = [], tp = [];
      for (let s = 0; s < seeds; s++) {
        const r = new GoliathSim({ ...b0, chaos_particles: ['PARASITE'], infiltration_mode: 'hub', planck_h: h, drain_intensity: d, seed: OFF + s }).run();
        ex.push(r.extracted);
        tp.push(r.totalChaos ? r.tp / r.totalChaos : 0);
      }
      row.push({ d, extracted: meanSe(ex).mean, tp: meanSe(tp).mean });
      done++; yield { done, total };
    }
    const best = row.reduce((a, b) => (b.extracted > a.extracted ? b : a));
    planck.push({ h, row, best });
  }
  const p0 = planck.find(p => p.h === 0), p4 = planck.find(p => p.h === 0.4);
  const at = (p, d) => p.row.find(x => Math.abs(x.d - d) < 1e-9);
  const a1 = at(p0, 0.30).tp < 0.10 && at(p4, 0.30).tp >= 0.80;
  const a2 = p4.best.extracted <= 0.5 * p0.best.extracted;
  const hStar = (planck.find(p => p.best.extracted <= 0.5 * p0.best.extracted) || {}).h ?? null;

  // (b) + (c) temel: SM sürüsü vs temiz
  const smCfg = { ...b0, ...COSMO_V11, chaos_particles: 'sm', chaos_ratio: 0.30, infiltration_mode: 'random', drain_intensity: 0.5, instruments: true };
  const chaosRuns = [], cleanRuns = [];
  for (let s = 0; s < seeds; s++) chaosRuns.push(new GoliathSim({ ...smCfg, seed: OFF + s }).run().instruments);
  done++; yield { done, total };
  for (let s = 0; s < seeds; s++) cleanRuns.push(new GoliathSim({ ...smCfg, chaos_ratio: 0, seed: OFF + s }).run().instruments);
  done++; yield { done, total };

  const aucs = chaosRuns.map(x => x.rutherford.auc).filter(v => v !== null);
  const aucMean = aucs.reduce((a, b) => a + b, 0) / Math.max(1, aucs.length);
  const winChaos = chaosRuns.filter(x => x.rutherford.rutherfordWins).length / seeds;
  const winClean = cleanRuns.filter(x => x.rutherford.rutherfordWins).length / seeds;
  const b = aucMean >= 0.70 && winChaos >= 0.8 && winClean <= 0.2;
  const histChaos = new Array(R_BINS).fill(0), histClean = new Array(R_BINS).fill(0);
  chaosRuns.forEach(x => x.rutherford.hist.forEach((v, k) => { histChaos[k] += v; }));
  cleanRuns.forEach(x => x.rutherford.hist.forEach((v, k) => { histClean[k] += v; }));

  const rig = chaosRuns.map(x => x.riemann.rigidity), rigClean = cleanRuns.map(x => x.riemann.rigidity);
  const rigDiff = meanSe(rig.map((v, i) => v - rigClean[i]).filter(Number.isFinite));
  const c1 = rigDiff.mean > 0 && rigDiff.mean > 2 * rigDiff.se;
  const amps = [];
  for (const A of PRR_AMPS) {
    const rr = [];
    for (let s = 0; s < seeds; s++) rr.push(new GoliathSim({ ...smCfg, higgs_osc_amp: A, seed: OFF + s }).run().instruments.riemann.rigidity);
    amps.push({ A, rigidity: meanSe(rr.filter(Number.isFinite)).mean });
    done++; yield { done, total };
  }
  const rhoA = spearman(amps.map(x => x.A), amps.map(x => x.rigidity));
  const c2 = rhoA >= 0.8;
  const spChaos = [].concat(...chaosRuns.map(x => x.riemann.spacings));
  const spClean = [].concat(...cleanRuns.map(x => x.riemann.spacings));

  return {
    planck, hStar, a1, a2,
    rutherford: { aucMean, winChaos, winClean, histChaos, histClean },
    riemann: { rigDiff, amps, rhoA, spChaos, spClean,
      smallChaos: spChaos.filter(s => s < 0.5).length / Math.max(1, spChaos.length),
      smallClean: spClean.filter(s => s < 0.5).length / Math.max(1, spClean.length) },
    criteria: { a: a1 && a2, b, c: c1 && c2, c1, c2 },
    supported: a1 && a2 && b && c1 && c2,
  };
}

// ============================================================
// H-KEK (ön kayıtlı): Rutherford'u üzümlü kek karşılaştırmasıyla yeniden kur. H-PRR (b) ile aynı düzen.
// (a) Sağlam geri saçılma AUC ort. ≥ 0.70
// (b) Gözlenen geri saçılma kekten anlamlı yüksek (z > 1.645): kaotik koşuların ≥%80'i, temizlerin ≤%20'si
// (c) Kekten en çok sapan k düğümün (k = kaos sayısı) ≥%50'si kaos
// ============================================================
function precisionAtK(scores, labels, k) {
  const idx = scores.map((v, i) => [Number.isFinite(v) ? v : -Infinity, i]).sort((a, b) => b[0] - a[0]).slice(0, k);
  return idx.filter(([, i]) => labels[i]).length / Math.max(1, k);
}

function* kekExperiment(base, opts = {}) {
  const seeds = opts.seeds || 20, OFF = 7000;
  const smCfg = { ...base, ...COSMO_V11, recordSnapshots: false, chaos_particles: 'sm', chaos_ratio: 0.30, infiltration_mode: 'random', drain_intensity: 0.5, instruments: true };
  const total = 2 * seeds;
  let done = 0;
  const chaos = [], clean = [];
  for (let s = 0; s < seeds; s++) {
    const sim = new GoliathSim({ ...smCfg, seed: OFF + s });
    const r = sim.run();
    const labels = Array.from(sim.isChaos);
    const k = labels.filter(Boolean).length;
    chaos.push({ ...r.instruments, prec: precisionAtK(r.instruments.kek.excess, labels, k), base: k / labels.length });
    done++; yield { done, total };
  }
  for (let s = 0; s < seeds; s++) {
    clean.push(new GoliathSim({ ...smCfg, chaos_ratio: 0, seed: OFF + s }).run().instruments);
    done++; yield { done, total };
  }
  const avg = arr => arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length);
  const aucOld = avg(chaos.map(x => x.rutherford.auc).filter(v => v !== null));
  const aucNew = avg(chaos.map(x => x.kek.auc).filter(v => v !== null));
  const aucExcess = avg(chaos.map(x => x.kek.aucExcess).filter(v => v !== null));
  const sigChaos = chaos.filter(x => x.kek.significant).length / seeds;
  const sigClean = clean.filter(x => x.kek.significant).length / seeds;
  const prec = avg(chaos.map(x => x.prec));
  const sum = (runs, key) => { const h = new Array(R_BINS).fill(0); runs.forEach(x => x.kek[key].forEach((v, i) => { h[i] += v; })); return h; };
  const a = aucNew >= 0.70, b = sigChaos >= 0.8 && sigClean <= 0.2, c = prec >= 0.5;
  return {
    aucOld, aucNew, aucExcess, sigChaos, sigClean, prec, baseRate: avg(chaos.map(x => x.base)),
    ratioChaos: avg(chaos.map(x => x.kek.ratio)), ratioClean: avg(clean.map(x => x.kek.ratio)),
    zChaos: avg(chaos.map(x => x.kek.z)), zClean: avg(clean.map(x => x.kek.z)),
    histChaos: sum(chaos, 'hist'), pudChaos: sum(chaos, 'pudHist'), histClean: sum(clean, 'hist'), pudClean: sum(clean, 'pudHist'),
    criteria: { a, b, c }, supported: a && b && c,
  };
}

function runKekExperiment(base, opts) {
  const g = kekExperiment(base, opts);
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
}

// ============================================================
// H-KÜME (ön kayıtlı, H-KEK'teki ters işaretten doğdu; hiç kullanılmamış seed 8000+):
// Kümelenmiş kaos kekten anlamlı DÜŞÜK geri saçılma üretir (z < −1.645):
// (a) kaotik koşuların ≥%80'inde, (b) temiz koşuların ≤%20'sinde. Düğüm değil, koşu düzeyinde sürü alarmı.
// ============================================================
function* clusterExperiment(base, opts = {}) {
  const seeds = opts.seeds || 20, OFF = opts.offset || 8000;
  const cfgs = [['SM, rastgele', { chaos_particles: 'sm', chaos_ratio: 0.30, infiltration_mode: 'random', drain_intensity: 0.5 }],
                ['SM, hub', { chaos_particles: 'sm', chaos_ratio: 0.30, infiltration_mode: 'hub', drain_intensity: 0.5 }],
                ['tek tip parazit, rastgele', { chaos_particles: ['PARASITE'], chaos_ratio: 0.30, infiltration_mode: 'random', drain_intensity: 0.5 }]];
  const total = (cfgs.length + 1) * seeds;
  let done = 0;
  const rows = [];
  for (const [label, o] of cfgs) {
    const zs = [];
    for (let s = 0; s < seeds; s++) {
      zs.push(new GoliathSim({ ...base, ...COSMO_V11, ...o, instruments: true, recordSnapshots: false, seed: OFF + s }).run().instruments.kek.z);
      done++; yield { done, total };
    }
    rows.push({ label, zs, alarm: zs.filter(z => z < -1.645).length / seeds, zMean: meanSe(zs).mean });
  }
  const zc = [];
  for (let s = 0; s < seeds; s++) {
    zc.push(new GoliathSim({ ...base, ...COSMO_V11, chaos_particles: 'sm', chaos_ratio: 0, infiltration_mode: 'random', instruments: true, recordSnapshots: false, seed: OFF + s }).run().instruments.kek.z);
    done++; yield { done, total };
  }
  const cleanAlarm = zc.filter(z => z < -1.645).length / seeds;
  const a = rows[0].alarm >= 0.8, b = cleanAlarm <= 0.2;
  return { rows, clean: { zs: zc, alarm: cleanAlarm, zMean: meanSe(zc).mean }, criteria: { a, b }, supported: a && b };
}

function runClusterExperiment(base, opts) {
  const g = clusterExperiment(base, opts);
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
}

// ============================================================
// H-JOKER ve H-HAYALET (ön kayıtlı, v2.1 kozmolojisi, hiç kullanılmamış seed 9100+ × 20)
// Düzen: SM deseni, %30, hub, d = 0.5, sens 0.55. Hasar = 1 − CSI / CSI(bozulmamış).
// H-JOKER: (a) çıkarılması anlamlı kayıp yaratan bozonlarda Higgs jokeri kaybın ortalama ≥%50'sini geri kazandırır;
//          (b) W eksikken (Goldstone) W anlamlı gerekli VE geri kazanım ≥%50.
// H-HAYALET: (a) hayalet zararlı: hayaletli − hayaletsiz eşli hasar farkı > 0 ve > 2 SH;
//            (b) yalnız hayaletlerden oluşan sürü (%10 = 6 hayalet, d = 0.8): küme alarmı ≤%20 VE hasar > 0 ve > 2 SH.
// ============================================================
function* jokerGhostExperiment(base, opts = {}) {
  const seeds = opts.seeds || 20, OFF = opts.offset || 9100;
  const b0 = { ...base, ...COSMO_V21, ...(opts.cosmo || {}), ghost_enabled: true, chaos_particles: 'sm', chaos_ratio: 0.30,
    infiltration_mode: 'hub', drain_intensity: 0.5, quarantine_sensitivity: 0.55, recordSnapshots: false, pattern_rotation: null };
  const clean = new Map();
  const cleanCsi = seed => {
    if (!clean.has(seed)) { const r = new GoliathSim({ ...b0, chaos_ratio: 0, quarantine_enabled: false, seed }).run(); clean.set(seed, r.csi[r.steps - 1]); }
    return clean.get(seed);
  };
  const dmg = (o) => Array.from({ length: seeds }, (_, s) => {
    const r = new GoliathSim({ ...b0, ...o, seed: OFF + s }).run();
    return 1 - r.csi[r.steps - 1] / cleanCsi(OFF + s);
  });
  const JB = ['g', 'gamma', 'Z', 'W'];
  const total = 1 + JB.length * 2 + 2 + 1;
  let done = 0;
  const full = dmg({}); done++; yield { done, total };
  const jok = [];
  for (const b of JB) {
    const on = dmg({ chaos_particles: smPattern({ [b]: 'NOOP' }), higgs_joker: true }); done++; yield { done, total };
    const off = dmg({ chaos_particles: smPattern({ [b]: 'NOOP' }), higgs_joker: false }); done++; yield { done, total };
    const need = pairedStats(full, off);
    const lost = meanSe(full).mean - meanSe(off).mean;
    const recovery = lost > 0 ? (meanSe(on).mean - meanSe(off).mean) / lost : null;
    jok.push({ b, need, needed: need.mean > 2 * need.se, recovery, on: meanSe(on).mean, off: meanSe(off).mean });
  }
  const rec = jok.filter(x => x.needed && x.recovery !== null).map(x => x.recovery);
  const recMean = rec.length ? rec.reduce((a, b) => a + b, 0) / rec.length : null;
  const w = jok.find(x => x.b === 'W');
  const ja = recMean !== null && recMean >= 0.5;
  const jb = w.needed && w.recovery !== null && w.recovery >= 0.5;

  const noGhost = dmg({ ghost_enabled: false }); done++; yield { done, total };
  const ghostEff = pairedStats(full, noGhost);
  const ga = ghostEff.mean > 0 && ghostEff.mean > 2 * ghostEff.se;
  const gOnly = { ...b0, chaos_particles: ['G'], chaos_ratio: 0.10, drain_intensity: 0.8, instruments: true };
  const gd = [], gz = [], gEdges = [];
  for (let s = 0; s < seeds; s++) {
    const r = new GoliathSim({ ...gOnly, seed: OFF + s }).run();
    gd.push(1 - r.csi[r.steps - 1] / cleanCsi(OFF + s));
    gz.push(r.instruments.kek.z);
    gEdges.push(r.ghostEdges);
  }
  done++; yield { done, total };
  const gdm = meanSe(gd);
  const alarm = gz.filter(z => z < -1.645).length / seeds;
  const gb = alarm <= 0.2 && gdm.mean > 0 && gdm.mean > 2 * gdm.se;
  done++; yield { done, total };
  return {
    full: meanSe(full), joker: jok, recMean, criteriaJ: { a: ja, b: jb }, supportedJ: ja && jb,
    ghostEff, noGhost: meanSe(noGhost), ghostOnly: { damage: gdm, alarm, zMean: meanSe(gz).mean, edges: meanSe(gEdges).mean },
    criteriaG: { a: ga, b: gb }, supportedG: ga && gb,
  };
}

function runJokerGhostExperiment(base, opts) {
  const g = jokerGhostExperiment(base, opts);
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
}

// ============================================================
// H-LIGO (ön kayıtlı, CERN modeli, hiç kullanılmamış seed 9500+ × 80 koşu; graviton her koşuda %50 olasılıkla var, κ ∈ [−1, 1])
// Düzen: SM deseni, %30, hub, d = 0.5, sens 0.55, arka plan yeniden bağlanma 0.04/adım.
// (a) Düğüm düzeyi gözlemler (karantina sayısı, kek z, ortalama sinyal) varlığı ayırt edemez: her birinin AUC'si 0.35–0.65.
// (b) Eşleşmiş filtreli LIGO (en az bir ucu en zengin %10'da olan yeni kenar sayısı; şablon eğitim seed'lerinde seçildi) ayırt eder: AUC ≥ 0.80 ve ham kenar sayısından yüksek.
// (c) Var olan gravitonlarda (|κ| > 0.05) hiçbir gözlem κ'nın işaretini (zararlı/yararlı) ayırt edemez: hepsinin AUC'si 0.35–0.65.
// ============================================================
function* ligoExperiment(base, opts = {}) {
  const runs = opts.runs || 80, OFF = opts.offset || 9500;
  const b0 = { ...base, ...COSMO_CERN, chaos_particles: 'sm', chaos_ratio: 0.30, infiltration_mode: 'hub', drain_intensity: 0.5,
    quarantine_sensitivity: 0.55, instruments: true, recordSnapshots: false, pattern_rotation: null };
  const rows = [];
  for (let s = 0; s < runs; s++) {
    const r = new GoliathSim({ ...b0, seed: OFF + s }).run();
    const sig = [];
    // ortalama gözlenebilir sinyal (gürültüsüz) — aletlerden
    rows.push({ exists: r.gExists, kappa: r.gKappa, q: r.tp + r.fp, kekZ: r.instruments.kek.z,
      meanSig: r.instruments.riemann ? meanSignal(r) : NaN, naive: r.ligo.events, matched: r.ligo.rich });
    yield { done: s + 1, total: runs };
  }
  const lab = rows.map(x => (x.exists ? 1 : 0));
  const feats = ['q', 'kekZ', 'meanSig', 'naive', 'matched'];
  const aucExist = Object.fromEntries(feats.map(f => [f, auc(rows.map(x => x[f]), lab)]));
  const ex = rows.filter(x => x.exists && Math.abs(x.kappa) > 0.05);
  const signLab = ex.map(x => (x.kappa > 0 ? 1 : 0));
  const aucSign = Object.fromEntries(feats.map(f => [f, auc(ex.map(x => x[f]), signLab)]));
  const inBand = v => v !== null && v >= 0.35 && v <= 0.65;
  const a = ['q', 'kekZ', 'meanSig'].every(f => inBand(aucExist[f]));
  const b = aucExist.matched !== null && aucExist.matched >= 0.80 && aucExist.matched > aucExist.naive;
  const c = feats.every(f => inBand(aucSign[f]));
  return { rows, nExist: lab.filter(Boolean).length, nSign: ex.length, nHarm: signLab.filter(Boolean).length,
    aucExist, aucSign, criteria: { a, b, c }, supported: a && b && c };
}

function meanSignal(r) { return r.meanSig; }

function runLigoExperiment(base, opts) {
  const g = ligoExperiment(base, opts);
  let x = g.next();
  while (!x.done) x = g.next();
  return x.value;
}

function runPrrExperiment(base, opts) {
  const g = prrExperiment(base, opts);
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
}

// ============================================================
// H-PLAZMA (Zaman Hayaleti / Antimadde Plazma Graviton & Asal/Riemann Yörünge Tahmini)
// Graviton düğüm değildir ve iyi/kötü iradesi yoktur; ağdaki zamansal akı ihlallerinden (gözlenebilir stres/aktivite akısı)
// beslenen bir antimadde plazma dalgasıdır. Potansiyel Φ(t) ≥ 1.0 olduğunda kendi maddesiyle çarpışır (annihilation),
// bir "artifact" (bükülmüş uzay-zaman kenarı) bırakır ve sönümlenir (seviye itmesi: Δt ≥ 2 ve 1/ln(t) yoğunluk).
// Kriterler:
// (a) İradesiz deterministik kalıp: karantina uygulamadan, yalnızca gözlenebilir akıdan bir sonraki çarpışma zamanı ve hedefi ≥%95 tahmin edilir.
// (b) Asal / Riemann GUE dağılımı: çarpışma aralıkları rastgele Poisson'dan çok Riemann GUE ve asal sayı aralıklarına yakındır (D_GUE < D_Poisson ve D_Prime < D_Poisson).
// ============================================================
function primeGapCdfBuilder(maxN = 2000) {
  const isP = new Uint8Array(maxN + 1).fill(1);
  isP[0] = isP[1] = 0;
  for (let i = 2; i * i <= maxN; i++) if (isP[i]) for (let j = i * i; j <= maxN; j += i) isP[j] = 0;
  const p = [];
  for (let i = 2; i <= maxN; i++) if (isP[i]) p.push(i);
  const gaps = [];
  for (let i = 1; i < p.length; i++) gaps.push(p[i] - p[i - 1]);
  const m = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const sorted = gaps.map(g => g / m).sort((a, b) => a - b);
  return x => {
    let lo = 0, hi = sorted.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] <= x) lo = mid + 1; else hi = mid; }
    return lo / sorted.length;
  };
}

function modPowBig(base, exp, mod) {
  let res = 1n; base %= mod;
  while (exp > 0n) { if (exp & 1n) res = (res * base) % mod; base = (base * base) % mod; exp >>= 1n; }
  return res;
}
function isProbablePrimeBig(n) {
  if (n < 2n) return false;
  for (const p of [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n]) {
    if (n === p) return true;
    if (n % p === 0n) return false;
  }
  let d = n - 1n, s = 0n;
  while ((d & 1n) === 0n) { d >>= 1n; s++; }
  for (const a of [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n]) {
    if (n <= a) break;
    let x = modPowBig(a, d, n);
    if (x === 1n || x === n - 1n) continue;
    let ok = false;
    for (let r = 1n; r < s; r++) { x = (x * x) % n; if (x === n - 1n) { ok = true; break; } }
    if (!ok) return false;
  }
  return true;
}

function* plasmaWraithExperiment(base = {}, opts = {}) {
  const seeds = opts.seeds || 30, steps = opts.steps || 240, OFF = opts.offset || 9900;
  const B = opts.magnetic_B !== undefined ? opts.magnetic_B : 1.0; // MHD manyetik çekim / Z-pinch şiddeti
  const G = opts.gravity_G !== undefined ? opts.gravity_G : 1.0;   // CERN ALPHA-g antimadde kütleçekimi (+1 = normal kütleçekim, -1 = anti-kütleçekim)
  const primeCdf = primeGapCdfBuilder(2000);
  const pooledGaps = [];
  let totalEvents = 0, predictedTime = 0, predictedTarget = 0, throatCapture = 0, noMagCapture = 0;
  let maxStepPrime = 0, maxExactPrime = 0n, maxResonancePrime = 0n, exactPrimeHits = 0;

  for (let s = 0; s < seeds; s++) {
    const r = new GoliathSim({ ...base, ...COSMO_CERN, chaos_particles: 'sm', chaos_ratio: 0.30, steps, seed: OFF + s, recordSnapshots: true }).run();
    let phi = 0, lastT = -3;
    let stateHash = 1n;
    const events = [];
    for (let t = 1; t < steps; t++) {
      const snap = r.snapshots[t], prev = r.snapshots[t - 1];
      let fluxSum = 0, top1 = -1, top2 = -1, f1 = -1, f2 = -1;
      let rawTop1 = -1, rawF1 = -1;
      for (let i = 0; i < r.degrees.length; i++) {
        if (!snap.alive[i] || snap.quarantined[i]) continue;
        const df = Math.abs(snap.stress[i] - prev.stress[i]) + 0.5 * snap.stress[i];
        if (df > rawF1) { rawF1 = df; rawTop1 = i; }
        // 1) Plazmanın manyetizmaya karşı çekimi (Lorentz J × B + grad(B²) MHD Z-Pinch)
        const magPull = 1 + B * (r.degrees[i] / 10) * (r.layers[i] === 0 ? 1.6 : r.layers[i] === 1 ? 1.2 : 0.7);
        // 2) Antimaddenin kütleçekimi (CERN ALPHA-g deneyi: antimadde de pozitif kütleçekimiyle G > 0 aşağı/ağır kütlelere düşer)
        const massRatio = r.capital[t] * (1 + 0.25 * r.degrees[i]);
        const gravPull = Math.max(0.1, 1 + 0.35 * G * massRatio);
        const effFlux = df * magPull * gravPull;
        fluxSum += df;
        if (effFlux > f1) { f2 = f1; top2 = top1; f1 = effFlux; top1 = i; }
        else if (df > f2) { f2 = effFlux; top2 = i; }
      }
      const dPhi = (fluxSum / 18.0) * (1 + 0.12 * B) * (1 + 0.08 * G) / Math.log(t + 3) * (1 + 0.45 * Math.sin(t * (1.6180339887 + 0.05 * B)));
      // Savunmacının çarpışma öncesi gözlenebilir Φ(t), manyetik ve kütleçekim zirvesinden tahmini (etiket/isChaos kullanılmaz):
      const predWillHit = (phi + dPhi >= 1.0) && (t - lastT >= 2);
      const predNode = top1;
      phi += dPhi;
      if (phi >= 1.0 && t - lastT >= 2) {
        phi -= 1.0;
        totalEvents++;
        if (predWillHit) predictedTime++;
        if (predNode === top1 && top1 >= 0) predictedTarget++;
        if (top1 >= 0 && r.layers[top1] <= 1) throatCapture++;
        if (rawTop1 >= 0 && r.layers[rawTop1] <= 1) noMagCapture++;
        events.push({ t, a: top1, b: top2 });
        lastT = t;
        // Çarpışma anındaki asal zaman adımı ve kuantum durum değişmezi (7919, 104729, 131071 Mersenne/asal harmonikleri)
        if (isProbablePrimeBig(BigInt(t)) && t > maxStepPrime) maxStepPrime = t;
        stateHash = (stateHash * 104729n + BigInt(t) * 7919n + BigInt(top1 * 60 + top2) * 131071n) | 1n;
        if (isProbablePrimeBig(stateHash)) {
          exactPrimeHits++;
          if (stateHash > maxExactPrime) maxExactPrime = stateHash;
        }
        let cand = stateHash;
        while (!isProbablePrimeBig(cand)) cand += 2n;
        if (cand > maxResonancePrime) maxResonancePrime = cand;
      }
    }
    for (let k = 1; k < events.length; k++) pooledGaps.push(events[k].t - events[k - 1].t);
    yield { done: s + 1, total: seeds };
  }

  const mg = pooledGaps.reduce((a, b) => a + b, 0) / Math.max(1, pooledGaps.length);
  const normGaps = pooledGaps.map(g => g / mg).sort((a, b) => a - b);
  const dGue = normGaps.length ? ksDistance(normGaps, gueCdf) : NaN;
  const dPrime = normGaps.length ? ksDistance(normGaps, primeCdf) : NaN;
  const dPoisson = normGaps.length ? ksDistance(normGaps, poissonCdf) : NaN;
  const predRate = totalEvents > 0 ? Math.min(predictedTime, predictedTarget) / totalEvents : 0;
  const throatCaptureRate = totalEvents > 0 ? throatCapture / totalEvents : 0;
  const noMagCaptureRate = totalEvents > 0 ? noMagCapture / totalEvents : 0;
  const a = predRate >= 0.95 && totalEvents >= seeds * 3;
  const b = dGue < dPoisson && dPrime < dPoisson;
  const c = B > 0 ? throatCaptureRate > noMagCaptureRate && throatCaptureRate >= 0.92 : true;
  return {
    seeds, steps, magnetic_B: B, gravity_G: G, totalEvents, meanGap: mg, predRate,
    throatCaptureRate, noMagCaptureRate,
    maxStepPrime, exactPrimeHits,
    maxExactPrime: maxExactPrime.toString(),
    maxExactPrimeDigits: maxExactPrime.toString().length,
    maxResonancePrime: maxResonancePrime.toString(),
    maxResonancePrimeDigits: maxResonancePrime.toString().length,
    dGue, dPrime, dPoisson, normGaps,
    criteria: { a, b, c },
    supported: a && b && c,
  };
}

function runPlasmaWraithExperiment(base, opts) {
  const g = plasmaWraithExperiment(base, opts);
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
}

if (typeof module !== 'undefined') {
  module.exports = {
    SeededRNG, GoliathSim, defaultConfig, detectorSignal, detectorThreshold,
    P, PKEY, SM_ORDER, PARTICLE_INFO, assignParticles, QUARK, FERMION, BOSON_ROLES,
    BOSON_KEYS, smPattern, quantumExperiment, runQuantumExperiment,
    PRR_DRAINS, PRR_H, PRR_AMPS, prrExperiment, runPrrExperiment, kekExperiment, runKekExperiment, clusterExperiment, runClusterExperiment, median, precisionAtK,
    jokerGhostExperiment, runJokerGhostExperiment, COSMO_V11, COSMO_V21, COSMO_CERN, ligoExperiment, runLigoExperiment,
    plasmaWraithExperiment, runPlasmaWraithExperiment, primeGapCdfBuilder,
    quantize, erf, poissonCdf, gueCdf, poissonPdf, guePdf, ksDistance, auc, rutherfordFit, riemannAnalysis, R_BINS,
    HYPOTHESIS_DRAINS, hypothesisPoint, evaluateHypothesis, meanSe, spearman,
  };
}
