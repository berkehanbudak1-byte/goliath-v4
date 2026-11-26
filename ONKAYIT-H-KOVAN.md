# Ön kayıt: H-KOVAN (Topolojik Uzmanlaşma & Sermaye-Seyreltme Kalkanı)

Bu dosya deney çalıştırılmadan önce yazıldı (2026-11-26). Kriterler ve sabitler test seed'leri (`9800–9949`) çalıştırıldıktan sonra değiştirilmez.

## Fiziksel/Matematiksel Gerekçe (`engine.js` v4.0)

1. **Derece–Eşik Ters Ölçeklemesi:** Bir parazit ajanın adım başı çaldığı sermaye komşu sağlıklı düğüm sayısı $k_i$ ile orantılıdır ($\Delta C_i \propto k_i \cdot d_i$). Kör dedektör sinyali `0.55 * stress + 2.0 * max(0, relGain) + noise` düğüm başına aynı eşiği kullandığı için yüksek dereceli merkez düğümler (hub) çok daha düşük $d_i$ değerinde karantinaya girer; uç düğümler (periphery) ise yüksek $d_i$ değerini taşıyabilir.
2. **Sermaye-Seyreltme Kalkanı:** Dedektör göreli artışı `relGain = (capital[i] - capPrev[i]) / max(capPrev[i], 0.1)` olarak hesaplar ve parazit düğümler çaldığı sermayeyi dağıtmaz (`surplus = 0`). Dolayısıyla hayatta kalan bir parazitin biriken sermayesi sonraki adımlardaki göreli artışı seyreltir; güvenli şiddet tavanı $d_i^*(t)$ zamanla yukarı tırmanabilir.

## Düzen

- **Motor:** `engine.js` v4.0 (değişiklik yok), korunumlu ekonomi, varsayılan kozmoloji, `n_nodes: 60`, `steps: 80`, `topology: 'adaptive_hierarchy'`, `chaos_ratio: 0.20` (12 `PARASITE` ajan), `infiltration_mode: 'random'`, `decision_epoch: 8` (10 karar dönemi), `drain_intensity: 0.5`.
- **Körlük Kısıtı:** Kontrolcüler yalnızca `_attackerObs(t)` (`id`, `degree`, `d`, `stolen`, `cutOff`) gözlemlerini alır. Dedektör hassasiyeti (`quarantine_sensitivity`), eşik (`detectorThreshold`), `anomalyScore` ve sağlıklı düğümler **verilmez**.
- **Ayrık Seed Kümeleri (Hiç Kullanılmamış):**
  - **Birincil Test Kümesi:** 50 seed (`9800–9849`), `quarantine_sensitivity = 0.55`.
  - **Genelleme (Gevşek Dedektör):** 50 seed (`9850–9899`), `quarantine_sensitivity = 0.35`.
  - **Genelleme (Sıkı Dedektör):** 50 seed (`9900–9949`), `quarantine_sensitivity = 0.75`.

## Koşullar (Aynı Seed'lerde Eşli)

| Koşul | Açıklama |
|---|---|
| `SABİT d` | $d \in \{0.1, 0.2, \dots, 0.8\}$ sabit. `Açgözlü` = $0.8$. `Kâhin` = o hassasiyette en yüksek ortalama `extracted` veren tekdüze sabit $d$. |
| `KURAL` | `ONKAYIT-H-ATOM.md` uyarlanır taban kuralı ($d=0.5$, grup kesilirse $\times 0.7$, kesilmezse $\times 1.15$, en çok $0.8$). |
| `KOVAN` | Seeley arı kovanı çoğunluk uzlaşması (`SCOUT_COUNT=3` en düşük dereceli uç kâşifler) + derece ters ölçeklemesi ($1 + 0.5 k_i$, $k_{\text{ref}}=4$) + sermaye-seyreltme rampası ($1 + 0.35 \cdot \min(\text{stolen}_i, 3.0)$). |
| `KOVAN-TERS` | Nedensellik kesimi #1 (`scoutRole: 'hub'`): kâşiflik görevi uçlar yerine en yüksek dereceli 3 merkez düğüme verilir. |
| `KOVAN-NO-DEG` | Nedensellik kesimi #2 (`degreeScale: false`): derece ters ölçeklemesi kapatılır. |
| `KOVAN-NO-RAMP` | Nedensellik kesimi #3 (`capitalRamp: false`): sermaye-seyreltme rampası kapatılır ($\gamma = 0$). |

## Ön Kayıtlı Kriterler (Birincil Küme `9800–9849`, $\sigma = 0.55$)

Ölçü: toplam çalınan sermaye (`extracted`).

- **(a) Açgözlülüğü geçer:** `KOVAN >= 1.5 × Açgözlü` ve eşli fark `> 2 SE`.
- **(b) Mevcut uyarlanır kuralı geçer:** `KOVAN > KURAL` ve eşli fark `> 2 SE`.
- **(c) Tekdüze Kâhin'i geçer:** `KOVAN > Kâhin` (`ratio > 1.0`) ve eşli fark `> 2 SE`.
- **(d) Nedensellik Kesimleri:** `KOVAN − KOVAN-TERS`, `KOVAN − KOVAN-NO-DEG` ve `KOVAN − KOVAN-NO-RAMP` eşli farklarının tümü (`mean ± SE` ve `> 2 SE`) raporlanır.
- **(e) Kör Eşik Genellemesi:** Parametre değiştirmeden $\sigma = 0.35$ (`9850–9899`) ve $\sigma = 0.75$ (`9900–9949`) kümelerinin **ikisinde birden** `KOVAN > KURAL` (`> 2 SE`).
