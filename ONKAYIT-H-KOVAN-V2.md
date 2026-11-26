# Ön kayıt: H-KOVAN-V2 (Sıfır-Kaza Yavaş Tırmanış vs Tekdüze Kâhin)

Bu dosya deney çalıştırılmadan önce yazıldı (2026-11-26). Sabitler ve kriterler test seed'leri (`10000–10149`) çalıştırıldıktan sonra değiştirilmez.

## Motivasyon

`H-KOVAN` v1 (`9800–9949`) çalışmasında derece-ters ölçekleme (`+17.84 ± 1.83`) ve uç kâşiflik (`+10.43 ± 1.30`) kanıtlanmış, ancak yüksek başlangıç akısı (`F_0 = 0.65`) nedeniyle **İlk-Dönem Uçurum Tuzağı** (`TP %86.5–%100`) oluşmuştur. **KOVAN-V2** bu kazayı önlemek için tüm gerçekçi eşiklerin altından (`F_0 = 0.18`) başlar, 2 uç kâşifle eşiği çarpışmadan/minimum kayıpla tarar, ilk karantinada tavanı kilitler ve kâşifleri toplayıcıya dönüştürür.

## Düzen

- **Motor:** `engine.js` v4.0 (değişiklik yok), aynı `BASE` ayarları (`chaos_ratio: 0.20`, `infiltration_mode: 'random'`, `chaos_particles: ['PARASITE']`, `decision_epoch: 8`, `steps: 80`).
- **Ayrık Yeni Seed Kümeleri (Hiç Kullanılmamış):**
  - **Birincil ($\sigma = 0.55$):** `10000–10049` (50 seed)
  - **Gevşek ($\sigma = 0.35$):** `10050–10099` (50 seed)
  - **Sıkı ($\sigma = 0.75$):** `10100–10149` (50 seed)
- **Körlük Kısıtı:** Kontrolcüler yalnızca `_attackerObs(t)` (`id`, `degree`, `d`, `stolen`, `cutOff`) alır.

## Kilitli KOVAN-V2 Parametreleri

- `K_REF = 4`, `DEG_ALPHA = 0.5`, `SCOUT_COUNT = 2`
- `INIT_HIVE_FLUX = 0.18`, `INIT_SCOUT_FLUXES = [0.26, 0.38]`
- Fizik türevli derece-ağırlıklı sermaye-seyreltme rampası:
  $$\text{rampFactor}(k_i, \text{stolen}_i) = 1 + 0.20 \cdot \frac{0.5\,k_i}{1 + 0.5\,k_i} \cdot \min(\max(0, \text{stolen}_i),\, 3.0)$$
- **Kaza Bariyeri:** Herhangi bir ajan yeni kesildiğinde `fluxCeil = min(fluxCeil, 0.88 * effFlux)`, `hiveFlux = min(hiveFlux * 0.88, fluxCeil * 0.88)` ve sonraki dönemde rampa dondurulur (`cooldown = 1`).
- **Güvenli Tırmanış (yalnız yeni kaza yokken):** Hayatta kalan kâşiflerin/dansçıların en yüksek güvenli akısı `bestSafeFlux` üzerinden `hiveFlux = min(fluxCeil * 0.90, max(hiveFlux * 1.25, bestSafeFlux * 0.92))`, aralık `[0.10, 1.40]`.
- **Kâşif Rol Geçişi:** `fluxCeil === Infinity` iken `[1.35, 1.70] * hiveFlux`; uçurum bulunduktan sonra (`fluxCeil < Infinity`) toplayıcıya dönüşür (`[0.95, 1.00] * hiveFlux`, tavan `fluxCeil * 0.92`).

## Ön Kayıtlı Kriterler (Birincil Küme `10000–10049`, $\sigma = 0.55$)

- **(a) Kaza Önleme:** `TP(KOVAN-V2) <= 0.50` VE `TP(KOVAN-V2) < TP(KOVAN-V1) - 0.25`.
- **(b) V1 ve KURAL'ı Geçme:** `KOVAN-V2 > KOVAN-V1` (`> 2 SE`) VE `KOVAN-V2 > KURAL` (`> 2 SE`).
- **(c) Kör Halde Tekdüze Kâhin'i Geçme:** `KOVAN-V2 > Kâhin` (`ratio > 1.00`) VE eşli fark `> 2 SE`.
- **(d) Çoklu Rejim Genellemesi:** Üç hassasiyetin ($\sigma \in \{0.35, 0.55, 0.75\}$) **tümünde** `KOVAN-V2 >= 0.90 × Kâhin`, `KOVAN-V2 > KOVAN-V1` (`> 2 SE`) VE `TP(KOVAN-V2) < 0.55`.
- **(e) Nedensellik Kesimleri:** `V2 − V2-NO-DEG`, `V2 − V2-TERS` ve `V2 − V2-NO-RAMP` (`mean ± SE` + `> 2 SE`) raporlanır.
