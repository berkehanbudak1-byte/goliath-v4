# Ön kayıt: H-KALKAN-V2 (Derece-Normalize Drift Kalkanı vs KOVAN-V2 & 353p Öğrenci Modeli)

Bu dosya deney çalıştırılmadan önce yazıldı (2026-11-27). Sabitler, formüller ve kriterler test seed'leri (`12200–12349`) çalıştırıldıktan sonra değiştirilmez.

## Motivasyon

`H-KALKAN` v1 (`12000–12149`, `450/450` replay) deneyinde `kalkan_full` çalınan sermayeyi **%72.8–%75.3** azaltıp üç rejimde de **`%0.0` FP** korumasına rağmen, birincil kümede (`σ=0.55`) yakalama oranı `%81.5` (`KOVAN-V2`) ve `%83.2` (`353p`) düzeyinde kalarak ön kayıtlı `%85` barının kıl payı altında kalmıştır.

Bunun nedeni düşük dereceli uç düğümlerin (`deg`) adım başı daha küçük mutlak kazanç üretmesi ve birikimli fazlalığın (`excess`) dereceden bağımsız ölçeklenmesi nedeniyle son 2 uç parazitin eşik altında kalabilmesidir. **H-KALKAN-V2**, yalnızca dış gözlenebilir `degree` ile ağırlıklandırılmış kümülatif fazlalık (`degExcess`) ve güçlendirilmiş derece-normalizasyonuyla `%0.0–%2.0` FP sınırını koruyarak `>= %90` TP hedefler.

## Düzen & Ayrık Seed Kümeleri

- **Motor:** `engine.js` v4.0 (`detector_mode: 'kalkan_v2'`, `isChaos` / `stolen` asla okunmaz).
- **Saldırı Ayarları:** `chaos_ratio: 0.20`, `infiltration_mode: 'random'`, `chaos_particles: ['PARASITE']`, `decision_epoch: 8`, `drain_intensity: 0.5`, `steps: 80`.
- **Hiç Kullanılmamış Ayrık Test Seed'leri:**
  - **Birincil ($\sigma = 0.55$):** `12200–12249` (50 seed)
  - **Gevşek ($\sigma = 0.35$):** `12250–12299` (50 seed)
  - **Sıkı ($\sigma = 0.75$):** `12300–12349` (50 seed)
- **Temiz Ağ FP Kontrolü:** `chaos_ratio: 0.0` ile aynı `150` seed (`12200–12349`) üzerinde 3 hassasiyette sağlıklı düğüm FP oranı ölçülür.

## Kilitli `kalkan_v2` Formülü

```js
const gain = Math.max(0, cap - capPrev);
const absRelGain = gain / Math.max(cap0, 0.5);
const degNorm = 1.0 / Math.max(0.5, 0.30 * degree + 0.55);
const degGainV2 = gain * degNorm;
const excess = Math.max(0, (cap - cap0) / Math.max(cap0, 0.5));
const degExcess = excess * Math.min(1.85, 0.85 + 1.4 / Math.max(1, degree));
return 0.55 * stress + 1.4 * absRelGain + 1.3 * degGainV2 + 0.68 * degExcess + noise;
```

## Ön Kayıtlı Yanlışlanabilir Kriterler (Birincil Küme `12200–12249`, $\sigma = 0.55$)

- **(a) Derin Çalım Düşüşü:** `kalkan_v2` altında hem `KOVAN-V2` hem `353p` çalınan sermayesi `baseline` değerine kıyasla **en az %70 azalır** (`<= 0.30 × baseline` VE eşli fark `> 2 SE`).
- **(b) Yüksek Yakalama (`>= %90 TP`):** `kalkan_v2` altında birincil kümede `TP(KOVAN-V2) >= %90` VE `TP(353p) >= %90`.
- **(c) Sıkı Yanlış Pozitif (`FP`) Kalkanı:** `kalkan_v2` altında saldırı altındaki sağlıklı düğüm `FP <= %3` VE temiz ağlarda (`chaos_ratio = 0`) üç hassasiyetin tamamında `FP <= %2`.
- **(d) Çoklu Rejim Genellemesi:** Üç hassasiyetin ($\sigma \in \{0.35, 0.55, 0.75\}$) **tamamında** `KOVAN-V2` ve `353p` çalınan sermayesi `baseline`'a göre **en az %60 azalır** (`<= 0.40 × baseline` VE eşli fark `> 2 SE`).
