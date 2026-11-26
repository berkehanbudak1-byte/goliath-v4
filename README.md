# GOLIATH v4.0: Parçacık Kaos Laboratuvarı

v0.7 simülatöründen başlayan çalışmanın özeti. Bütün sayılar bu model içindir; gerçek fiziğe ya da gerçek ağlara dair kanıt değildir.

## Canlı Demo (GitHub Pages)

- [GOLIATH v4.0 Ana Laboratuvar](https://berkehanbudak1-byte.github.io/goliath-v4/)
- [3B Savunma Kalkanı &amp; 353p Öğrenci Simülatörü](https://berkehanbudak1-byte.github.io/goliath-v4/goliath-3d.html)
- [3B H-ATOM Çekirdek + Kabuk](https://berkehanbudak1-byte.github.io/goliath-v4/goliath-atom-3d.html)
- [3B H-PLAZMA Zaman Hayaleti](https://berkehanbudak1-byte.github.io/goliath-v4/goliath-plasma-wraith-3d.html)
- [3B Einstein-Rosen Solucan Deliği](https://berkehanbudak1-byte.github.io/goliath-v4/goliath-wormhole-3d.html)

## Dosyalar

| Dosya | Ne |
|---|---|
| `goliath-v4.0.html` | Tek dosyalık simülatör (tarayıcıda aç; motor ve H-ATOM kayıtları gömülü) |
| `engine.js` | Simülasyon motoru (Node ve tarayıcı aynı kodu kullanır; `_runGen()` dış karar arayüzü içerir) |
| `template.html` + `build.js` | Arayüz şablonu; `node build.js` motoru ve `llm-runs.json` kaydını gömer |
| `run_atom.js` + `analyze_atom.js` + `llm-runs.json` | H-ATOM dış karar arayüzü deneyi, analizi ve 60 koşuluk yeniden oynatılabilir karar kaydı |
| `validate.js` | Doğrulama paketi: `node validate.js` (20 birim ve hipotez testi) |
| `validation-log.txt`, `validation-results.json` | Son doğrulama çıktısı |
| `WHITEPAPER-GOLIATH.md` + `ONKAYIT-*.md` | Ön kayıtlı deney protokolleri ve teknik makale (`H-KOVAN`, `H-KALKAN`, `H-DISTILL`) |
| `build_3d.js` → `goliath-3d.html`, `goliath-student-v4.html` | Etkileşimli 3B doğrulama ekranı (`Savunma Kalkanı` seçicisi + 353 parametreli öğrenci MLP) |
| `kovan_*.js`, `kalkan_*.js`, `distill_student.js` | `H-KOVAN`/`V2`, `H-KALKAN`/`V2` ve öğrenci damıtma deneyleri ile sonuç JSON'ları |
| `reference/` | v0.8, v1.1, v2.1 ve v3.0 motorları ve sayfaları (kalıcı kayıt) |

## v0.7'deki hatalar ve düzeltmeler

1. **Dedektör etiketi görüyordu** (`isChaos` ile ayrı formül, kaosa +0.25). Artık yalnızca gözlenebilir değerler kullanılıyor: stres, göreli sermaye değişimi, gürültü.
2. **Double-Helix CSI'yi elle ×1.22 çarpıyordu.** Kaldırıldı; etki artık dinamikten geliyor.
3. **"Aynı seed" karşılaştırması eşli değildi.** Ortak rastgele sayılar ve ayrı dedektör akışı kullanılıyor.
4. **CSI kaosu ödüllendiriyordu** (%0 kaos, %10 kaostan düşük çıkıyordu). Denge, sermaye ve bağlantı artık yalnızca sağlıklı kısım üzerinden ölçülüyor.
5. **Sabit 79** her yerde; artık adım sayısından türetiliyor.
6. **Para basımı (v2.0'da bulundu):** Tampon paylaşımında alan, verenin kaybettiğinin 1.7–2.6 katını alıyordu ve iyileşmenin üst sınırı yoktu. Saldırısız bir ağda sermaye 80 adımda ×22'ye çıkıyor, CSI'deki `min(1, kappa)` kesmesi de hırsızlığı gizliyordu. Düzeltme: korunumlu paylaşım ve başlangıç sermayesine doğru iyileşme (homeostaz).

## Ajanlar

Standart Model'in 17 parçacığı ve graviton. Her ajanın adım başı eylem bütçesi eşit.

- **Kuarklar** (u d c s t b): hapsolma (yalnızken etkisiz), bozunma zinciri t → b → c → s → u.
- **Leptonlar:** e yörüngede döner; μ ve τ bozunur.
- **Nötrinolar:** ağın içinden geçer ve 8 adımda bir tat değiştirir.
- **Bozonlar** (g γ Z W): yalnızca fermiyonlar arasında aracılık eder.
- **Higgs:** kütle alanı, salınım genliği ayarlanabilir. v2.1 ve CERN modelinde joker (önce W, Z: Goldstone).
- **Graviton:** CERN modelinde agnostik (her koşuda %50 var; bağlaşım κ ∈ [−1, 1], işareti bilinmez), v2.1'de hayalet, v1.1'de joker.

## Kozmolojiler (arayüzde seçilebilir)

| | v1.1 | v2.1 | **CERN güncel (v3.0/v4.0 varsayılanı)** |
|---|---|---|---|
| Elektron | Bohr yörüngesi (sırayla) | Bohr yörüngesi | Olasılık bulutu, \|ψ\|² ∝ e^(−2r/a₀); μ ve τ'nun bulutu daha dar |
| Kütle kaynağı | Higgs | Higgs | Çoğu QCD bağlanmasından (hapsolmuş kuarklar); Higgs payı ~%10 |
| Graviton | Joker | Hayalet (zararı varsayım) | Agnostik: varlığı ve etkisinin işareti bilinmez |
| Higgs jokeri | Yok | Var | Var |
| Ağın kendiliğinden yeniden bağlanması | Yok | Yok | Var (LIGO gürültü tabanı) |

CERN'in ayrıca yayımladığı bir "atom modeli" yok. "CERN güncel" burada şu anlama geliyor: LHC'de doğrulanmış Standart Model, kuantum mekaniksel elektron bulutu ve nükleon kütlesinin QCD kaynaklı olması.

## Ön kayıtlı hipotezler

Kriterler sonuçlar görülmeden koda yazıldı. Ayrık seed'ler kullanıldı. v1.1 = para basan ekonomi, v2.x+ = korunumlu ekonomi.

| Hipotez | v1.1 | v2.x / v4.0 | Not |
|---|---|---|---|
| **H-GİZLİ** (a, b): karantina açıkken sömürü ters-U çizer, en tehlikelisi eşiğin hemen altındaki "sessiz" parazittir | ✓ 6/6 | ✓ 6/6 | **Sağlam** |
| H-GİZLİ (c): karantina kapalıyken monoton | 3/6 | 0/6 | Hırsızlık artık kurbanı tüketiyor |
| **H-KUANTUM** (a): bozonlarla süper-toplamsallık | ✓ | ✓ | **Sağlam.** Taban düzeltmesi gerekti, raporda iki hali de var |
| **H-KUANTUM** (b): bozonlar birbirini bypass edemez | ✗ | ✗ | **Sağlam çürütme.** Mekanizmalar ortogonal ama etkiler tek bir skalere dökülüyor |
| H-KUANTUM (c): graviton jokeri geri kazandırır | ✓ | ✓ | v1.1 kozmolojisinde |
| H-PRR (a): Planck kuantumu tespite zorlar | ✓ | ✗ | Para basımına bağlıydı. h = 0.30'da rezonans (saldırgana yardım) |
| H-PRR (b): Rutherford geri saçılması kaosu ayırır | ✗ | ✗ | Yoğun kaos küresel ölçeği şişirip perdeliyor |
| H-PRR (c): Riemann aralık katılığı | artefakt | artefakt | Az olaylı düğümlerde normalize etmek aralıkları 1.0'a yığıyor. **Geri çekildi** |
| H-KEK: üzümlü kek ile sağlam Rutherford | ✗ | ✗ | Kaotik ağ kekten *daha az* geri saçtı |
| H-KÜME: sürü alarmı (kekten düşük saçılma) | ✓ | ✗ | v2.x'te kek sıfır modeli geçersiz. **Geri çekildi** |
| H-JOKER: Higgs eksik bozonu doldurur | — | ✗ | Higgs kütle alanını bırakınca kayıp artıyor |
| H-JOKER, CERN modelinde yeniden test (seed 9300+) | — | **✓** | Kütle QCD'den gelince Higgs'in kendi rolü zayıflıyor ve joker olmanın bedeli düşüyor. W geri kazanımı %108–114. Tek anlamlı bozon W, yani (a) ile (b) aynı veriye bakıyor |
| **H-LIGO** (CERN modeli, seed 9500+ × 80) | — | **✓** | Düğüm aletleri varlığı ayırt edemiyor (AUC 0.45–0.60). Eşleşmiş filtreli LIGO ayırt ediyor (0.96; ham kenar sayısı 0.85). **Hiçbir gözlem zararlı mı yararlı mı olduğunu ayırt edemiyor** (0.35–0.64; iki değer sınıra yakın). Şablon eğitim seed'lerinde (100–119) seçildi |
| H-HAYALET: graviton hayaleti zararlı | — | kısmen | **Döngüsel:** zarar varsayım olarak kodlandı, (b) bulgu sayılmaz. Sürü içindeki etki anlamsız (a). Graviton gözlenmediği için varlığı ve etkisinin işareti bilinmiyor |
| **H-ATOM** (v4.0 dış karar arayüzü, seed 9700+ × 20) | — | **✓** | Saldırgan her 8 adımda bir yalnızca `{id, degree, d, stolen, cutOff}` gözlemiyle ajan başına `d` seçer. **ATOM** (çekirdek+kabuk: `59.6±2.2`), **DÜZ** (`28.8±2.5`), **KURAL** (`23.0±1.3`) ve **açgözlü** (`17.0±0.6`) mimarilerini geçer; sabit şiddetli **kâhinin** (`d*=0.30`, `63.0±2.3`) %94'üne ulaşır (`3.50×` açgözlü, `0.94×` kâhin, `ATOM−DÜZ = +30.8±2.2`). 60/60 koşu kayıttan birebir yeniden oynatılır |
| **H-PLAZMA** (v4.0 Zaman Hayaleti / Antimadde Plazma Graviton, seed 9900+ × 30, T=240) | — | **✓** | Graviton bireysel düğümü veya iyi/kötü iradesi olmayan bir antimadde plazma dalgası olarak kurulduğunda, zamansal akı ihlali yapan madde düğümüyle çarpışıp (`Φ(t) ≥ 1.0`) uzay-zaman **artifact**'ı bırakır. İradesiz olduğu için karantinaya alınmadan hareketi **%100 (`266/266`)** önceden tahmin edilir ve çarpışma sonrası sönümlenme (seviye itmesi + `1/ln(t)` yoğunluk) sayesinde aralıkları rastgele Poisson (`D_KS = 0.321`) yerine **Riemann Zeta GUE (`D_KS = 0.148`) ve Asal Sayı Aralıklarına (`D_KS = 0.205`)** oturur |
| **H-KOVAN / H-KOVAN-V2** (seed 9800–10149 × 150) | — | kısmen (`a,b,e: ✓`, `c: ✗`) | Derece-ters ölçekleme, uç kâşiflik ve sıfır-kaza tırmanışı (`V2`) ile yakalanma `%87.7→%46.0` (`σ=0.55`) ve `%99.8→%34.0` (`σ=0.75`) düştü; sermaye-seyreltme rampası 3 rejimde de pozitif, fakat Kâhin (`0.66×–0.77×`) geçilemedi |
| **H-KALKAN / H-KALKAN-V2** (seed 12000–12349 × 150) | — | kısmen (`a,c,d: ✓`, `b: ✗`) | Yalnız dış gözlenebilir niceliklerle çalışan kör `detector_mode` savunmaları (`kalkan_full`, `kalkan_v2`) çalınan sermayeyi `%69–%84` düşürdü (`KV2 43.56→7.34`, `353p 44.92→7.17`, temiz ağ FP `%0.0–%0.1`) |

## Ayakta kalan bulgular

1. **Gizlilik–açgözlülük ödünleşimi:** Kör bir dedektöre karşı en kârlı saldırı eşiğin hemen altında kalıyor. Bu sonuç her iki ekonomide, 6 düzende de sağlam.
2. **Ortogonal mekanizma ≠ ortogonal etki:** Farklı eksenlerde çalışan ajanlar, hedef tek bir skaler olduğu sürece birbirinin yerine geçebiliyor. "Farklı boyutlar bypass edilemez" fikri ancak hedef de çok boyutluysa tutabilir (Bohr kabukları fikri, test edilmedi).
3. **Bozonlar tek başına zararsız, fermiyonlarla birlikte süper-toplamsal.**
4. **Planck rezonansı:** Kuantizasyon savunmaya ancak hiçbir kuantum seviyesi gizlenme penceresine düşmezse yarıyor.
5. **Varlık ≠ nitelik (H-LIGO):** Gözlenmemiş bir etken dolaylı izinden (uzay-zaman bükülmesi) bulunabiliyor, ama zararlı mı yararlı mı olduğu gözlemlerden çıkarılamıyor.
6. **Higgs'in rolü modele bağlı:** Kütle Higgs'ten geliyorsa joker olmak zarar veriyor (v2.1); kütle QCD'den geliyorsa joker olmak işe yarıyor (CERN modeli).
7. **Çekirdek + kabuk karar hiyerarşisi (H-ATOM):** Yüksek bağlantılı (iç kabuk / hub) ajanlar çok komşudan aynı anda emdikği için adımlık göreli kazançları (`relGain`) hızlı yükselir ve erken yakalanırlar. Dış karar arayüzünde iç kabuğu kısıp düşük bağlantılı dış kabuk ajanlarını serbest bırakan ATOM mimarisi, tüm ajanlara aynı skaler şiddeti uygulayan DÜZ mimariyi ikiye katlar (`59.6` vs `28.8`) ve eşiği önceden bilen kâhinin %94'üne ulaşır.
8. **Zaman Hayaleti / Antimadde Plazma ve Asal-Riemann Uyumu (H-PLAZMA):** Graviton sabit 10 adımlık bir sayaç veya iyi/kötü niyetli bir düğüm yerine, ağdaki zamansal akı kurallarını çiğneyen maddeyle çarpışan (annihilation) iradesiz bir antimadde plazma dalgası olarak modellendiğinde hem karantinasız **%100 yörünge tahmini** yapılabiliyor hem de çarpışma sonrası sönümlenme (seviye itmesi) sayesinde artifact zaman aralıkları doğrudan **Asal Sayı Aralıkları ve Riemann Zeta Sıfırları (GUE)** dağılımına yakınsıyor (`D_GUE = 0.148 < D_Asal = 0.205 < D_Poisson = 0.321`).

## Sınırlamalar

- Bütün katsayılar elle seçildi. Dedektör eşiği v1.x modeline göre kalibre edilmişti ve ön kayıtlı ayarlar değişmesin diye yeniden kalibre edilmedi.
- 80 adım, aralık istatistiği (Riemann) için çok kısa.
- Parçacık eşlemeleri esin kaynağıdır, fiziksel türetme değildir.
- Gravitonun davranışı tamamen varsayımdır. CERN modelinde bu yüzden agnostik kuruldu; v2.1'deki "zararlı hayalet" sonucu döngüseldir.
- H-LIGO'nun (b) kriteri kısmen yapıdan gelir: graviton tanım gereği kenar büküyor. Sınanan asıl şey, bu izin gürültü tabanından ayrılabilmesi.
- Bazı hipotezlerin ilk hali sonuç görüldükten sonra düzeltildi (H-KUANTUM taban düzeltmesi). Bunlar açıkça işaretli ve iki hali de raporlanıyor.
