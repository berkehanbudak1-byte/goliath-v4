# GOLIATH: Kör Anomali Dedektörlerine Karşı Çoklu-Ajan Sömürü Dinamikleri, Topolojik Uzmanlaşma ve Hiyerarşik Kontrol

**Tarih:** 26 Kasım 2026  
**Depo / Çalışma Alanı:** `goliath-v4` depo kökü (Motor v4.0, Çekirdek Taban v3.0)  
**Durum:** Ön kayıtlı doğrulamalar (`v0.7–v3.0`, `H-KOVAN` 150 seed, `H-KOVAN-V2` 150 yeni seed) tamamlandı; `H-ATOM` (LLM hiyerarşisi) kısmi ön veri (`seed 9700–9703`) ile raporlanmaktadır.

---

## Abstract (English Summary)

We present **GOLIATH**, an agent-based conservative-economy network simulator (`n = 60` nodes, `T = 80` steps) designed to evaluate how heterogeneous and adaptive parasitic swarms interact with a **blind, observable-only anomaly detector** (`detectorSignal = 0.55·stress + 2.0·max(0, relGain) + noise`). Across pre-registered experimental families (`H-GİZLİ`, `H-KUANTUM`, `H-JOKER`, `H-LIGO`, `H-ATOM`, `H-KOVAN`, and `H-KOVAN-V2`), we document both corroborated structural laws and honest falsifications/retractions. In our 150-seed (`9800–9949`) `H-KOVAN` v1 study (`750/750` bit-exact replay), a honeybee-quorum controller outperformed the greedy baseline (`2.00×`) and adaptive rule (`1.45×`), driven by **degree-inverse allocation** (`−17.84 ± 1.83`) and **periphery-first scouting** (`−10.43 ± 1.30`), yet failed against the omniscient Oracle due to a **First-Epoch Cliff Trap**. In our follow-up pre-registered 150-seed (`10000–10149`) **H-KOVAN-V2** study (`900/900` bit-exact replay), sub-threshold safe ascent (`F_0 = 0.18`) plus crash-barrier locking reduced quarantine crash rates from **87.7% → 46.0%** (`σ=0.55`) and **99.8% → 34.0%** (`σ=0.75`), outperforming V1 (`1.35×`, `2.53×` at `σ=0.75`) and `KURAL` (`1.75×`, `2.76×` at `σ=0.75`). Crucially, once crashes were prevented, the **Capital-Dilution Ramp** became significantly positive across **all three** sensitivities (`+3.16 ± 0.61`, `+4.00 ± 0.49`, `+3.16 ± 0.41`), while the remaining gap to the Oracle (`0.66×–0.77×`) quantifies the fundamental **Blind Exploration Tax** when the threshold is unknown.

---

## 1. Problem Tanımı ve GOLIATH v4.0 Mimarisi

GOLIATH, 60 düğümlü hiyerarşik bir ağ (`topology: 'adaptive_hierarchy'`) üzerinde sermaye akışını, stres bulaşmasını ve kör karantina mekanizmasını modelleyen deterministik çekirdekli (tohumlu PRNG: `SeededRNG`) bir simülatördür (`engine.js`).

### 1.1 Korunumlu Ekonomi ve Kör Dedektör
- **Korunumlu paylaşım (v2.0+):** Sağlıklı düğümlerin tampon paylaşımı yoktan sermaye üretmez; kabul edilmeyen pay göndericiye geri döner (`accepted = share / (1 + mass[i])`).
- **Kör Dedektör (`detectorSignal` / `detectorThreshold`):** Dedektör hiçbir zaman ajanın `isChaos` etiketini almaz; yalnızca her düğüm için dışarıdan gözlenebilir üç niceliği izler:
  $$S_i(t) = 0.55 \cdot \text{stress}_i(t) + 2.0 \cdot \max\bigl(0,\, \text{relGain}_i(t)\bigr) + \varepsilon_i(t)$$
  $$\text{relGain}_i(t) = \frac{C_i(t) - C_i(t-1)}{\max(C_i(t-1),\, 0.1)}, \qquad \theta(\sigma) = 0.71 - 0.525\,\sigma$$
  Üstel hareketli ortalama (`0.65·A_i + 0.35·S_i`) eşiği $\theta(\sigma)$ aşarsa düğüm `warmup = 4` sonrasında kalıcı karantinaya alınır.
- **v4.0 Karar Üreteci (`_attackerObs` / `_runGen`):** Her `decision_epoch = 8` adımda (80 adımda 10 dönem) dış kontrolcülere **yalnızca** parazit ajanların kimliği, ağ derecesi (`degree`), mevcut şiddeti (`d`), toplam çaldığı (`stolen`) ve kesilip kesilmediği (`cutOff`) verilir. Dedektör eşiği $\theta(\sigma)$, anomali skoru $A_i$ ve sağlıklı düğüm durumları kesinlikle gizlidir.

---

## 2. Önceki Ön Kayıtlı Bulguların Özeti (v0.7 → v3.0)

Tüm sayılar bu model içindir; gerçek ağlara veya fiziğe dair deneysel kanıt değildir (`RAPOR.md`).

| Hipotez | Sonuç | Temel Bulgu / Not |
|---|---|---|
| **H-GİZLİ (a, b)** | **✓ Sağlam (6/6)** | Karantina açıkken sömürü ters-U çizer; en kârlı saldırı eşiğin hemen altındaki "sessiz" parazittir. |
| **H-GİZLİ (c)** | ✗ (v2.x: 0/6) | Korunumlu ekonomide hırsızlık kurbanı tükettiği için karantina kapalıyken bile monoton artmaz. |
| **H-KUANTUM (a)** | **✓ Sağlam** | Bozonlar tek başına zararsız, fermiyonlarla birlikte süper-toplamsaldır (taban düzeltmesiyle). |
| **H-KUANTUM (b)** | **✗ Çürütme** | Ortogonal mekanizmalar hedef tek bir skaler olduğu sürece birbirinin yerine geçebiliyor (bypass edemiyor). |
| **H-PRR (a)** | v2.x: ✗ | Planck kuantizasyonu ancak hiçbir kuantum seviyesi gizlenme penceresine düşmezse savunmaya yarar (`h=0.30` rezonans). |
| **H-PRR (c), H-KÜME** | **Geri Çekildi** | Kısa pencerede (80 adım) normalizasyon artefaktı ve geçersiz sıfır modeli nedeniyle dürüstçe geri çekildi. |
| **H-JOKER (CERN)** | **✓ (CERN modelinde)** | Kütle QCD bağlanmasından geldiğinde (`hadron_mass=0.9`) Higgs jokerinin bedeli düşer; W geri kazanımı %114. |
| **H-LIGO (seed 9500+)** | **✓ (Varlık ≠ Nitelik)** | Eşleşmiş filtreli uzay-zaman izi varlığı ayırt eder (AUC 0.96), fakat hiçbir gözlem etkenin zararlı mı yararlı mı olduğunu ayırt edemez (0.35–0.64). |

---

## 3. H-ATOM: Hiyerarşik LLM Sürüsü (Kısmi Ön Telemetri)

`ONKAYIT-H-ATOM.md` düzeninde 12 parazit ajan bağlantı derecesine göre 4'er kişilik **çekirdek**, **1. kabuk** ve **2. kabuk** gruplarına ayrılmış; Cerebras `gpt-oss-120b` (`temperature=0`) ile yönetilmiştir. Claude Web kredi limiti nedeniyle yalnızca ilk 4 `ATOM` ve deterministik `KURAL`/`SABİT` koşuları gözlenebilmiştir (eksik 6 `ATOM` ve 10 `DÜZ` koşusu nedeniyle H-ATOM henüz nihai hükme bağlanmamıştır):

- `rule seed 9700`: çalınan **17.1** (TP `12/12`), `fixed(9700, 0.8)`: **18.2**
- `atom seed 9700`: **31.0** (TP `11/12`), `atom seed 9701`: **14.8** (TP `12/12`), `atom seed 9702`: **12.0** (TP `11/12`), `atom seed 9703`: **35.2** (TP `6/12`).

---

## 4. Yeni Keşif: H-KOVAN — Topolojik Uzmanlaşma ve Sermaye-Seyreltme Kalkanı

`engine.js` denklemlerinden iki yapısal asimetri türetilmiştir:

1. **Derece–Eşik Ters Ölçeklemesi:** Bir parazitin adım başı kazancı komşu sağlıklı düğüm sayısı $k_i$ ile çarpılır ($\Delta C_i \approx 0.085\,d_i \sum_{j\in N(i)\cap H} \min(1, C_j)$). Sabit eşik $\theta(\sigma)$ nedeniyle yüksek dereceli merkez (`hub`) parazitler aynı $d$ değerinde uç (`periphery`) parazitlerden çok daha hızlı karantinaya girer.
2. **Sermaye-Seyreltme Kalkanı:** Dedektör mutlak artışı değil `relGain = ΔC_i / max(C_i, 0.1)` oranını izler ve parazitlerde `surplus = 0` olduğu için biriken sermaye dağıtılmaz. Hayatta kalan parazit sermaye biriktirdikçe gelecek dönemlerde aynı mutlak çalım daha küçük `relGain` üretir.

Bu iki mekanizma, yalnızca `_attackerObs(t)` kullanan **KOVAN** kontrolcüsüyle (`ONKAYIT-H-KOVAN.md`, hiç kullanılmamış **150 seed: `9800–9949`**, toplam 1.950 koşu, **`750/750` birebir replay doğrulaması**) ve üç nedensellik kesimiyle (`KOVAN-TERS`, `KOVAN-NO-DEG`, `KOVAN-NO-RAMP`) sınanmıştır (`kovan_experiment.js`, `kovan-results.json`).

### 4.1 Deneysel Sonuçlar (`mean ± SE` Çalınan Sermaye & TP Yakalanma Oranı)

| Küme ($\sigma$, Seed) | **KOVAN** | **KURAL** | **Açgözlü ($0.8$)** | **Kâhin (Sabit $d^*$)** | **KOVAN-TERS** (Hub Kâşif) | **KOVAN-NO-DEG** | **KOVAN-NO-RAMP** |
|---|---|---|---|---|---|---|---|
| **Birincil** ($\sigma=0.55$, `9800–9849`) | **33.55 ± 1.96** (%86.5) | 23.19 ± 1.42 (%95.3) | 16.81 ± 0.33 (%98.3) | 61.95 ± 1.28 (`d=0.3`, %39.0) | 23.12 ± 1.46 (%93.3) | 15.70 ± 0.33 (%98.0) | 38.23 ± 1.43 (%70.8) |
| **Gevşek** ($\sigma=0.35$, `9850–9899`) | **54.06 ± 1.67** (%66.2) | 39.81 ± 1.41 (%86.5) | 20.17 ± 0.36 (%96.8) | 66.64 ± 1.19 (`d=0.3`, %30.8) | 46.02 ± 2.09 (%72.8) | 20.30 ± 0.35 (%95.5) | 46.24 ± 1.20 (%57.2) |
| **Sıkı** ($\sigma=0.75$, `9900–9949`) | **13.28 ± 0.22** (%100) | 12.48 ± 0.24 (%100) | 16.00 ± 0.31 (%99.8) | 52.37 ± 1.02 (`d=0.2`, %19.7) | 14.30 ± 0.34 (%99.8) | 14.07 ± 0.27 (%100) | 18.16 ± 0.82 (%94.8) |

### 4.2 Ön Kayıtlı Kriterlerin Dürüst Değerlendirmesi

- **(a) Açgözlülüğü $\ge 1.5\times$ geçer (`✓ DESTEKLENDİ`):** Birincil kümede `33.55 / 16.81 = 2.00×` (`+16.74 ± 1.83`, `9.1 SE`); gevşek kümede `2.68×` (`+33.89 ± 1.40`).
- **(b) Mevcut uyarlanır `KURAL`'ı geçer (`✓ DESTEKLENDİ`):** Birincil kümede `1.45×` (`+10.35 ± 2.05`, `5.0 SE`).
- **(e) Kör Eşik Genellemesi (`✓ DESTEKLENDİ`):** Parametre değiştirmeden 3 hassasiyetin **üçünde de** `KOVAN > KURAL` (`σ=0.35`: `+14.25 ± 1.50`; `σ=0.55`: `+10.35 ± 2.05`; `σ=0.75`: `+0.81 ± 0.10`).
- **(d) Nedensellik Kesimleri:**
  - **Derece-Ters Ölçekleme (`✓`):** `KOVAN-NO-DEG` kesimi birincil kümede **−17.84 ± 1.83** (`9.7 SE`), gevşek kümede **−33.76 ± 1.40** (`24.1 SE`) çöküşe yol açmıştır. Tekdüze $d$ yerine $d_i \propto 1/(1 + 0.5\,k_i)$ dağıtımı tüm kazancın ana taşıyıcısıdır.
  - **Uç Kâşiflik (`✓`):** Kâşiflerin hub yerine düşük dereceli uç düğümlerden seçilmesi (`KOVAN` vs `KOVAN-TERS`) birincil kümede **+10.43 ± 1.30** (`8.0 SE`), gevşek kümede **+8.04 ± 1.04** (`7.7 SE`) avantaj sağlamıştır.
  - **Sermaye-Seyreltme Rampası (Rejim Bağımlı — kısmi `✗`):** Gevşek rejimde (`σ=0.35`) hayatta kalan ajanlar rampa sayesinde **+7.82 ± 1.21** (`6.5 SE`, `✓`) ek kazanç üretmiştir. Ancak $\sigma=0.55$ ve $\sigma=0.75$ kümelerinde rampa erken dönem sınırındaki ajanları eşik üstüne ittiği için `KOVAN-NO-RAMP` daha yüksek kalmıştır (`38.23` vs `33.55` ve `18.16` vs `13.28`).
- **(c) Tekdüze `Kâhin`'i geçer (`✗ YANLIŞLANDI`):** `KOVAN` hiçbir kümede sabit $d^* \in \{0.2, 0.3\}$ Kâhin'i geçememiştir (`33.55` vs `61.95` at `σ=0.55`; `54.06` vs `66.64` at `σ=0.35`; `13.28` vs `52.37` at `σ=0.75`).
  - **Teşhis — İlk-Dönem Uçurum Tuzağı (First-Epoch Cliff Trap):** Sabit $d$ eğrileri $\sigma=0.55$'te `d=0.3` (`61.95`, TP %39) ile `d=0.5` (`16.07`, TP %96) arasında, $\sigma=0.75$'te ise `d=0.2` (`52.37`, TP %20) ile `d=0.3` (`16.79`, TP %97) arasında keskin bir uçurum göstermektedir. `KOVAN` başlangıçta `hiveFlux = 0.65` ile başladığından, `t=0..7` arasındaki ilk dönemde bile uçurumun ötesine geçip işçilerin %86.5–%100'ünü kalıcı karantinaya sokmakta ve `t=8`'deki aşağı yönlü düzeltme (`×0.82`) artık iş işten geçtikten sonra çalışmaktadır.

### 4.3 H-KOVAN-V2: Sıfır-Kaza Yavaş Tırmanış ve Kâhin Sınaması (`10000–10149`)

İlk-Dönem Uçurum Tuzağını ortadan kaldırmak için ön kayıtlı `ONKAYIT-H-KOVAN-V2.md` tasarımı (`F_0 = 0.18`, 2 uç kâşif `[0.26, 0.38]`, ilk kazada `0.88×` bariyer kilidi + rampa soğuması ve kâşiften toplayıcıya geçiş) hiç kullanılmamış **150 ayrık seed (`10000–10149`, `900/900` replay)** üzerinde sınanmıştır (`kovan_v2_experiment.js`, `kovan-v2-results.json`):

| Küme ($\sigma$, Seed) | **KOVAN-V2** | **KOVAN-V1** | **KURAL** | **Kâhin (Sabit $d^*$)** | **V2-TERS** | **V2-NO-DEG** | **V2-NO-RAMP** |
|---|---|---|---|---|---|---|---|
| **Birincil** ($\sigma=0.55$, `10000–10049`) | **43.49 ± 1.42** (%46.0) | 32.25 ± 2.10 (%87.7) | 24.80 ± 1.36 (%95.7) | 62.58 ± 1.33 (`d=0.3`, %39.5) | 43.50 ± 1.60 | 46.96 ± 1.54 | 40.33 ± 1.40 |
| **Gevşek** ($\sigma=0.35$, `10050–10099`) | **52.37 ± 1.14** (%38.7) | 50.48 ± 1.43 (%70.3) | 41.68 ± 1.48 (%84.3) | 67.80 ± 1.08 (`d=0.4`, %50.5) | 50.02 ± 1.41 | 49.03 ± 2.17 | 48.37 ± 1.16 |
| **Sıkı** ($\sigma=0.75$, `10100–10149`) | **32.92 ± 0.91** (%34.0) | 12.99 ± 0.35 (%99.8) | 11.94 ± 0.22 (%100.0) | 49.63 ± 0.91 (`d=0.2`, %22.8) | 21.42 ± 1.27 | 16.89 ± 1.58 | 29.75 ± 0.76 |

- **Kaza Önleme (`a_noCrash: ✓`):** Birincil kümede karantina yakalanma oranı `%87.7 → %46.0`'a, sıkı kümede (`σ=0.75`) **`%99.8 → %34.0`'a** indi!
- **V1 ve KURAL Üstünlüğü (`b: ✓`):** `KOVAN-V2`, V1'i birincil kümede **`1.35×` (`+11.24 ± 2.36`)**, sıkı kümede **`2.53×` (`+19.93 ± 0.90`)**; `KURAL`'ı ise sırasıyla **`1.75×` (`+18.69 ± 1.59`)** ve **`2.76×` (`+20.98 ± 0.77`)** geçti.
- **Sermaye-Seyreltme Rampası Artık Tüm Rejimlerde Pozitif (`e_noRamp: ✓`):** Kazalar durdurulduğunda fizik türevli rampa **üç hassasiyetin tamamında** `> 5 SE` anlamlı pozitif katkı verdi (`σ=0.55`: `+3.16 ± 0.61`; `σ=0.35`: `+4.00 ± 0.49`; `σ=0.75`: `+3.16 ± 0.41`).
- **Sıkı Rejimde Derece & Uç Uzmanlaşması (`σ=0.75: ✓`):** Uçurumun en dar olduğu `σ=0.75`'te derece ölçeklemesi (`+16.02 ± 1.64`, `9.8 SE`) ve uç kâşiflik (`+11.50 ± 1.34`, `8.6 SE`) hayatta kalmanın belirleyicisi oldu.
- **Kâhin Sınaması ve Kör Keşif Vergisi (`c: ✗`):** `KOVAN-V2`, `Kâhin`'in `0.66×–0.77×`'ine ulaştı ancak eşik bilgisini başlangıçta bilen Kâhin'i (`62.58`) geçemedi (`−19.10 ± 0.88`). Fark, bilinmeyen eşiğe karşı alttan güvenli tırmanmanın ödediği **Kör Keşif Vergisidir (`t=0..24` ısınma maliyeti)**; V2 kazayı engelleyerek önceki `0.25×`–`0.54×` bandını `0.66×`–`0.77×` bandına taşımıştır.

### 4.4 H-LOCAL-HARNESS: 1.9 GB Yerel LLM + KOVAN İskelesi vs 120B Bulut ATOM (`9700–9703`)

Ön kayıtlı `ONKAYIT-H-LOCAL-HARNESS.md` düzeninde (`local_llm_duel.js`, `local-duel-results.json`, `16/16` birebir replay), yalnızca CPU üzerinde çalışan **1.9 GB yerel Ollama (`homunculus-q3:latest`)** modeli `9700–9703` seed'lerinde (`σ=0.55`) hem ham (`LOCAL-FLAT`) hem de KOVAN-V2 topolojik iskelesi içinde (`LOCAL-KOVAN`) test edilmiş; `session_01VYTeJbz85DRnwxUTMNkDUD` oturumundan kayıtlı 120B bulut modeliyle (`CLOUD-ATOM: gpt-oss-120b`) kıyaslanmıştır:

| Yöntem | Ortalama Çalınan (`mean ± SE`) | Yakalanma (TP) | Seed `9700 / 9701 / 9702 / 9703` | Not / Çağrı |
|---|---|---|---|---|
| **KOVAN-V2** (Deterministik İskele) | **40.11 ± 6.15** | %45.8 | — | Saf algoritma tabanı |
| **LOCAL-KOVAN** (1.9 GB + İskele) | **37.85 ± 5.13** | **%41.7** | `44.3 / 48.5 / 26.8 / 31.7` | **0/36 JSON hata**, 450 ms/çağrı |
| **CLOUD-ATOM** (`gpt-oss-120b` Kayıtlı Ref.) | 23.25 ± 5.78 | %83.3 | `31.0 / 14.8 / 12.0 / 35.2` | Bulut 120B (oturum logu) |
| **KURAL** | 17.07 ± 1.61 | %97.9 | — | Adaptif taban |
| **Açgözlü (`d=0.8`)** | 15.50 ± 1.23 | %97.9 | — | Üst sabit |
| **LOCAL-FLAT** (Ham 1.9 GB LLM) | 14.56 ± 1.48 | %97.9 | `18.3 / 15.3 / 11.6 / 13.0` | 3/40 JSON hata, 1686 ms/çağrı |
| **Kâhin (`d=0.3`)** | 60.02 ± 5.48 | %35.4 | — | Eşli üst referans |

- **Her İki Ön Kayıtlı Kriter Doğrulandı (`a: ✓`, `b: ✓`):** Topolojik iskele içine alınan 1.9 GB yerel model, ham haline kıyasla **`2.60×`** (`37.85` vs `14.56`, yakalanma `%97.9 → %41.7`) ve tarihsel 120B bulut ATOM modeline kıyasla **`1.63×`** (`37.85` vs `23.25`, `Açgözlü`'nün **`2.44×`i**) daha yüksek sermaye toplamıştır.
- **İskele > Ham Parametre Ölçeği:** `LOCAL-KOVAN` en düşük yakalanma oranını (`%41.7`) ve 0 JSON hatasını (`0/36`) yakalarken saf deterministik `KOVAN-V2`'nin (`40.11`) gerisinde kalması, başarının ham LLM zekâsından ziyade **topolojik görev dağılımı + derece ölçeklemesi + çarpışma bariyeri** iskelesinden geldiğini kanıtlar.

### 4.5 H-DISTILL: 353 Parametreli (2.6 KB) Sıfır-GPU Tarayıcı-İçi Öğrenci Damıtması (`11200–11349`)

`KOVAN-V2` yörüngelerinden (eğitim: `11000–11039` × 3 hassasiyet = `10,272` kör örnek, `1.9 sn` Adam eğitimi, son MSE `0.00036`) yalnızca `_attackerObs(t)`'den türetilen 12 kör özellikli **`12 → 16 → 8 → 1` tanh/sigmoid MLP** damıtılmıştır (`distill_student.js`, `student-model.json`: **353 parametre, 2,643 bayt**; etkileşimli tek dosyalık tarayıcı arayüzü: `goliath-student-v4.html`). Hiç görülmemiş **150 test seed'inde (`11200–11349`, `450/450` replay)**:

| Rejim ($\sigma$, Seed) | **Öğrenci MLP (353p)** | **Öğretmen KOVAN-V2** | **KURAL** | **Öğrenci / Öğretmen** | **Öğrenci − KURAL** | **Süre / Koşu** |
|---|---|---|---|---|---|---|
| **Birincil** ($\sigma=0.55$, `11200–11249`) | **46.24 ± 1.26** (%50.3) | 45.29 ± 1.34 (%46.2) | 23.43 ± 1.44 | **%102.1** | **+22.81 ± 1.70** (`13.4 SE`) | `0.221 ms` |
| **Gevşek** ($\sigma=0.35$, `11250–11299`) | **48.51 ± 1.13** (%41.8) | 48.62 ± 1.26 (%42.5) | 38.47 ± 1.68 | **%99.8** | **+10.04 ± 1.40** (`7.2 SE`) | `0.195 ms` |
| **Sıkı** ($\sigma=0.75$, `11300–11349`) | **35.50 ± 1.03** (%37.7) | 34.09 ± 1.00 (%34.8) | 12.32 ± 0.27 | **%104.1** | **+23.17 ± 0.81** (`28.6 SE`) | `0.188 ms` |

- **Tüm Damıtma Kriterleri Geçti (`a: ✓`, `b: ✓`, `c: ✓`):** 2.6 KB'lık öğrenci ağ, GPU ve internet olmadan koşu başına **`~0.2 ms`** içinde öğretmenin `%99.8–%104.1`'ini yakalamış (pürüzsüzleştirme etkisiyle birincil ve sıkı rejimde öğretmeni de hafifçe geçmiştir) ve `KURAL`'ı üç rejimde de açık farkla yenmiştir.

---

## 5. Savunma Çıkarımları (Kör Dedektör Nasıl Güçlendirilir?)

Bu bulgular savunma tarafı için doğrudan iki somut dedektör düzeltmesi önerir:
1. **Mutlak Sermaye Kazancı + Derece Normalizasyonu:** Yalnızca `relGain = ΔC_i / max(C_i, 0.1)` kullanmak yerine `ΔC_i` (mutlak kazanç) veya `ΔC_i / max(1, deg_i)` teriminin eklenmesi, hem **Sermaye-Seyreltme Kalkanını** hem de uç düğüm saklanmasını kapatır.
2. **Düşük Başlangıçlı Yavaş-Tırmanış Yakalaması (Kümülatif Drift):** Kalıcı karantinanın yanında pencere içi kümülatif çalım (`sum(ΔC)`) izlenmezse, düşük $d$ ile başlayan (`d=0.2–0.3`) akıllı ajanlar erken dönemi atlatıp uzun süre sessizce sızmaya devam eder.

### 5.1 H-KALKAN: Ön Kayıtlı Kör Savunma Sınaması (`12000–12149`, 450/450 Replay)

`ONKAYIT-H-KALKAN.md` kapsamında `engine.js` v4.0'a `%100` kör (yalnız dış gözlenebilir `stress`, `capital`, `capPrev`, `cap0`, `degree`, `noise` kullanan) `detector_mode` eklenmiş; hiç kullanılmamış **150 ayrık seed (`12000–12149`, 450/450 birebir replay)** ve `150` temiz ağ (`chaos_ratio = 0`) üzerinde sınanmıştır (`kalkan_experiment.js`, `kalkan-results.json`):

| Küme ($\sigma$, Seed) | Kip | **KOVAN-V2** (`TP`) | **Öğrenci 353p** (`TP`) | **Kâhin** (`d^*`) | **Saldırı FP** | **Temiz Ağ FP** |
|---|---|---|---|---|---|---|
| **Birincil** ($\sigma=0.55$, `12000–12049`) | `baseline` | `43.43 ± 1.42` (`%38.7`) | `45.61 ± 1.40` (`%47.8`) | `65.06 ± 1.29` (`0.3`) | `%0.0` | `%0.0` |
| **Birincil** ($\sigma=0.55$, `12000–12049`) | **`kalkan_full`** | **`11.82 ± 0.44`** (`%81.5`) | **`11.27 ± 0.41`** (`%83.2`) | **`14.49 ± 0.35`** (`0.2`) | **`%0.0`** | **`%0.0`** |
| **Gevşek** ($\sigma=0.35$, `12050–12099`) | `baseline` | `50.59 ± 1.32` (`%41.8`) | `49.91 ± 1.30` (`%39.5`) | `66.03 ± 1.28` (`0.4`) | `%0.0` | `%0.0` |
| **Gevşek** ($\sigma=0.35$, `12050–12099`) | **`kalkan_full`** | **`15.47 ± 0.52`** (`%72.3`) | **`13.96 ± 0.43`** (`%79.2`) | **`22.57 ± 0.59`** (`0.3`) | **`%0.0`** | **`%0.0`** |
| **Sıkı** ($\sigma=0.75$, `12100–12149`) | `baseline` | `33.73 ± 0.96` (`%35.5`) | `34.32 ± 0.90` (`%38.7`) | `50.48 ± 1.14` (`0.2`) | `%0.0` | `%0.0` |
| **Sıkı** ($\sigma=0.75$, `12100–12149`) | **`kalkan_full`** | **`7.11 ± 0.13`** (`%90.2`) | **`6.96 ± 0.13`** (`%91.3`) | **`8.55 ± 0.16`** (`0.4`) | **`%0.0`** | **`%0.0`** |

- **Çalım Çöküşü (`a: ✓`, `d: ✓`):** `kalkan_full`, çalınan sermayeyi birincilde **%72.8 (`KOVAN-V2`, `-31.61 ± 1.59`)** ve **%75.3 (`353p`, `-34.34 ± 1.43`)**; gevşekte **%69.4 / %72.0**; sıkıda **%78.9 / %79.7** oranında düşürdü (hatta `Kâhin`'i bile `65.06 → 14.49`'a kırdı).
- **Sıfır Yanlış Pozitif (`c: ✓`):** Hem saldırı altındaki sağlıklı düğümlerde hem de `150` temiz ağda **üç rejimde de `%0.0` FP** korundu.
- **Nedensellik Kesimleri (`e`):** Birincilde `kalkan_abs` tek başına yalnız `43.43 → 39.86` ve `kalkan_deg` `43.43 → 34.96` düşüş sağlarken, kümülatif fazlalık (`excess`) ekleyen **`kalkan_drift`** (`43.43 → 12.95`, `TP %78.7`) düşüşün ana itici gücüdür; **`kalkan_full`** üç bileşeni birleştirerek en düşük çalımı (`11.82` / `11.27`) elde etmiştir.
- **Ön Kayıtlı `(b) >= %85 TP` Kriteri (`✗`):** Birincil kümede yakalama oranı `%38.7 → %81.5` (`KOVAN-V2`) ve `%47.8 → %83.2` (`353p`) seviyesine sıçrasa da ön kayıtlı `%85` eşiğinin kıl payı altında kaldığı için genel hüküm dürüstçe **Kısmi / Revizyon** olarak kaydedilmiştir (sıkı rejimde `%90.2 / %91.3` ile geçmiştir).

### 5.2 H-KALKAN-V2: Derece-Normalize Drift Kalkanı (`12200–12349`, 450/450 Replay)

`ONKAYIT-H-KALKAN-V2.md` kapsamında `degree` ağırlıklı kümülatif fazlalık (`degExcess`) ve güçlendirilmiş derece normalizasyonu (`kalkan_v2`) hiç kullanılmamış **150 yeni ayrık seed (`12200–12349`, `450/450` birebir replay)** üzerinde sınanmıştır (`kalkan_v2_experiment.js`, `kalkan-v2-results.json`):

| Küme ($\sigma$, Seed) | Kip | **KOVAN-V2** (`TP`, `FP`) | **Öğrenci 353p** (`TP`, `FP`) | **Kâhin** (`d^*`) | **Temiz Ağ FP** |
|---|---|---|---|---|---|
| **Birincil** (`0.55`, `12200–12249`) | `baseline` | `43.56 ± 1.36` (`%43.7`, `%0.0`) | `44.92 ± 1.24` (`%49.8`, `%0.0`) | `65.52 ± 1.35` (`0.3`) | `%0.0` |
| **Birincil** (`0.55`, `12200–12249`) | **`kalkan_v2`** | **`7.34 ± 0.15`** (`%83.8`, `%0.4`) | **`7.17 ± 0.16`** (`%85.2`, `%0.5`) | **`9.45 ± 0.16`** (`0.4`) | **`%0.0`** |
| **Gevşek** (`0.35`, `12250–12299`) | `baseline` | `51.22 ± 1.36` (`%41.0`, `%0.0`) | `51.72 ± 1.26` (`%40.0`, `%0.0`) | `66.26 ± 1.23` (`0.4`) | `%0.0` |
| **Gevşek** (`0.35`, `12250–12299`) | **`kalkan_v2`** | **`8.95 ± 0.20`** (`%84.3`, `%0.1`) | **`8.52 ± 0.20`** (`%85.8`, `%0.1`) | **`12.17 ± 0.46`** (`0.3`) | **`%0.0`** |
| **Sıkı** (`0.75`, `12300–12349`) | `baseline` | `31.62 ± 0.93` (`%38.2`, `%0.0`) | `32.62 ± 0.88` (`%38.5`, `%0.0`) | `48.77 ± 1.15` (`0.2`) | `%0.0` |
| **Sıkı** (`0.75`, `12300–12349`) | **`kalkan_v2`** | **`5.45 ± 0.11`** (`%88.7`, `%7.7`) | **`5.33 ± 0.11`** (`%89.7`, `%7.8`) | **`7.57 ± 0.15`** (`0.4`) | **`%0.1`** |

- **`a: ✓`, `c: ✓`, `d: ✓`:** `kalkan_v2`, üç hassasiyetin tamamında çalınan sermayeyi **`%82.5–%84.0`** oranında kesti (yalnız `%16.0–%17.5` kaldı) ve temiz ağlarda **`%0.0 / %0.0 / %0.1`** FP korudu (birincilde saldırı FP `%0.4/%0.5`, sıkıda saldırı stresi altında `%7.7/%7.8`).
- **`b: ✗` (`>= %90 TP`):** Birincilde `%83.8` (`KOVAN-V2`) ve `%85.2` (`353p`) elde edildi; `kalkan_v2` agresif saldırıyı `7.17–7.34` tabanına sıkıştırdığı için kalan son 1–2 ultra-düşük akılı ajan çok düşük hasarla eşik altında kalabilmektedir.

### 5.3 H-KALKAN-V3: Israrlı Kalıcılık Drift Sınaması ve Otofaji Çürütmesi (`12400–12549`, 450/450 Replay)

`ONKAYIT-H-KALKAN-V3.md` kapsamında `detPersist[i]` kör kalıcılık durumu (`kalkan_v3`), hiç kullanılmamış **150 yeni ayrık seed (`12400–12549`, `450/450` birebir replay)** üzerinde sınanmıştır (`kalkan_v3_experiment.js`, `kalkan-v3-results.json`):

| Küme ($\sigma$, Seed) | Kip | **KOVAN-V2** (`TP`, `FP`) | **Öğrenci 353p** (`TP`, `FP`) | **Kâhin** (`d^*`) | **Temiz Ağ FP** |
|---|---|---|---|---|---|
| **Birincil** (`0.55`, `12400–12449`) | `baseline` | `44.76 ± 1.36` (`%42.8`, `%0.0`) | `43.92 ± 1.32` (`%51.8`, `%0.0`) | `64.92 ± 1.27` (`0.3`) | `%0.0` |
| **Birincil** (`0.55`, `12400–12449`) | `kalkan_v2` | `7.36 ± 0.14` (`%84.7`, `%0.4`) | `7.17 ± 0.14` (`%85.7`, `%0.4`) | `9.43 ± 0.16` (`0.4`) | `%0.0` |
| **Birincil** (`0.55`, `12400–12449`) | **`kalkan_v3`** | **`5.13 ± 0.09`** (`%90.5`, **`%45.8`**) | **`5.12 ± 0.09`** (`%90.2`, **`%46.0`**) | `8.61 ± 0.16` (`0.4`) | **`%50.5`** |
| **Gevşek** (`0.35`, `12450–12499`) | `kalkan_v3` | `6.24 ± 0.14` (`%79.7`, `%40.3`) | `5.96 ± 0.13` (`%81.5`, `%41.5`) | `9.84 ± 0.16` (`0.4`) | `%48.2` |
| **Sıkı** (`0.75`, `12500–12549`) | `kalkan_v3` | `4.07 ± 0.07` (`%95.2`, `%47.8`) | `4.06 ± 0.08` (`%95.2`, `%47.6`) | `7.38 ± 0.13` (`0.4`) | `%49.8` |

- **`a: ✓`, `b: ✓`, `d: ✓`:** `kalkan_v3` birincil kümede çalınan sermayeyi **`%88.5` (`44.76 → 5.13`) / `%88.3` (`43.92 → 5.12`)** düşürdü ve ön kayıtlı **`>= %90 TP` (`%90.5` / `%90.2`)** eşiğini geçti.
- **`c: ✗` (Önemli Dürüst Bulgulama — Sağlıklı Tampon Otofajisi):** `detPersist` durumu `cap > 1.01·cap0` / `cap > 1.22·cap0` koşulunu sağlıklı homeostatik tampon paylaşımında büyüyen düğümlerde de tetiklediği için temiz ağlarda **%48.2–%50.5 yanlış pozitif (otofaji)** üretti. Bu sonuç, yüksek `TP` ile `%0` `FP`'yi aynı anda sağlayan optimal karar sınırının **`kalkan_v2`** (`%0.0` temiz ağ FP, `%84.7–%85.7` birincil TP) olduğunu ortaya koymuştur.

---

## 6. Sınırlamalar ve Tekrarlanabilirlik

- Tüm `H-KOVAN` (`750/750` replay), `H-KOVAN-V2` (`900/900` replay), `H-LOCAL-HARNESS` (`16/16` replay), `H-DISTILL` (`450/450` replay), `H-KALKAN` (`450/450` replay) ve `H-KALKAN-V2` (`450/450` replay) sonuçları yeniden üretilebilir:
  ```powershell
  # Depo kök dizininde (goliath-v4):
  node kovan_experiment.js
  node kovan_v2_experiment.js
  node local_llm_duel.js
  node distill_student.js
  node kalkan_experiment.js
  node kalkan_v2_experiment.js
  node kalkan_v3_experiment.js
  ```
- Etkileşimli 3B doğrulama ekranı (`build_3d.js` → `goliath-3d.html`, `goliath-student-v4.html`) doğrudan **`Savunma Kalkanı`** seçicisiyle `baseline`, `kalkan_full` ve `kalkan_v2` kiplerini canlı karşılaştırır.
