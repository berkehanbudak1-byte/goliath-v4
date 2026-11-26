# Ön kayıt: H-KALKAN-V3 (Ölü-Bölge + Eşzamanlı Süreklilik Drift Kalkanı vs KOVAN-V2 & 353p Öğrenci Modeli)

Bu dosya deney çalıştırılmadan önce yazıldı (2026-11-27). Sabitler, formüller ve kriterler test seed'leri (`12400–12549`) çalıştırıldıktan sonra değiştirilmez.

## Motivasyon

`H-KALKAN-V2` (`12200–12349`, `450/450` replay) deneyinde `kalkan_v2` çalınan sermayeyi **%82.5–%84.0** azaltmış (`KV2 43.56→7.34`, `353p 44.92→7.17`) ve temiz ağlarda `%0.0/%0.0/%0.1` FP korumuştur; ancak:
1. Birincil kümede yakalama oranı `%83.8` / `%85.2` seviyesinde kalarak `%90` barının altında kalmıştır.
2. Sıkı rejimde (`σ=0.75`) saldırı altındaki sağlıklı düğümlerde tampon paylaşımı ve stres birikimi nedeniyle `FP` oranı `%7.7–%7.8`'e çıkmıştır.

**H-KALKAN-V3 (`kalkan_v3`)**, düğüm başına kör bir kalıcılık durumu (`detPersist[i]`) tutarak:
- Saldırı + stres + sermaye büyümesinin eşzamanlı ve ısrarlı olduğu ajanlarda birikimli kalıcılığı yükseltmeyi,
- Kazancı olmayan veya başlangıç sermayesinin altında kalan sağlıklı düğümlerde `excess` terimini ölü-bölgeye alıp stres katsayısını azaltarak (`0.55 → 0.35`) sıkı rejim yanlış pozitiflerini (`FP`) söndürmeyi hedefler (`isChaos` / `stolen` asla okunmaz).

## Düzen & Ayrık Seed Kümeleri

- **Motor:** `engine.js` v4.0 (`detector_mode: 'kalkan_v3'`, `detPersist` tamamen kör gözlemlerden güncellenir).
- **Saldırı Ayarları:** `chaos_ratio: 0.20`, `infiltration_mode: 'random'`, `chaos_particles: ['PARASITE']`, `decision_epoch: 8`, `drain_intensity: 0.5`, `steps: 80`.
- **Hiç Kullanılmamış Ayrık Test Seed'leri:**
  - **Birincil ($\sigma = 0.55$):** `12400–12449` (50 seed)
  - **Gevşek ($\sigma = 0.35$):** `12450–12499` (50 seed)
  - **Sıkı ($\sigma = 0.75$):** `12500–12549` (50 seed)
- **Temiz Ağ FP Kontrolü:** `chaos_ratio: 0.0` ile aynı `150` seed (`12400–12549`) üzerinde 3 hassasiyette sağlıklı düğüm FP oranı ölçülür.

## Kilitli `kalkan_v3` Formülü

```js
// Kör düğüm kalıcılık güncellemesi (her aktif adımda warmup sonrası):
const gain = Math.max(0, cap - capPrev);
const absRelGain = gain / Math.max(cap0, 0.5);
let pNext = prevPersist;
if (gain > 0.005 && cap > cap0 * 1.01 && stress > 0.035) {
  pNext = Math.min(2.0, prevPersist + 0.09 + 1.8 * absRelGain);
} else if (cap > cap0 * 1.22) {
  pNext = Math.min(2.0, prevPersist + 0.06);
} else {
  pNext = prevPersist * 0.72;
}

// Kör sinyal:
const degNorm = 1.0 / Math.max(0.5, 0.30 * degree + 0.55);
const degGainV3 = gain * degNorm;
const excess = Math.max(0, (cap - cap0) / Math.max(cap0, 0.5));
const activeAccum = gain > 0.005 && cap > cap0 * 1.01;
const degExcess = (activeAccum || excess > 0.20)
  ? excess * Math.min(1.85, 0.85 + 1.4 / Math.max(1, degree))
  : 0;
const stressTerm = (gain > 0.002 ? 0.55 : 0.35) * stress;
return stressTerm + 1.4 * absRelGain + 1.3 * degGainV3 + 0.65 * degExcess + 0.52 * (persist || 0) + noise;
```

## Ön Kayıtlı Yanlışlanabilir Kriterler (`12400–12549`)

- **(a) Derin Çalım Düşüşü:** `kalkan_v3` altında birincil kümede hem `KOVAN-V2` hem `353p` çalınan sermayesi `baseline` değerine kıyasla **en az %70 azalır** (`<= 0.30 × baseline` VE eşli fark `> 2 SE`).
- **(b) Yüksek Yakalama (`>= %90 TP`):** `kalkan_v3` altında birincil kümede `TP(KOVAN-V2) >= %90` VE `TP(353p) >= %90`.
- **(c) Tüm Rejimlerde Sıkı FP Kalkanı (`<= %2`):** `kalkan_v3` altında birincil ($\sigma=0.55$) saldırı `FP <= %2`, sıkı ($\sigma=0.75$) saldırı `FP <= %2` VE üç hassasiyetteki temiz ağlarda (`chaos_ratio = 0`) `FP <= %2`.
- **(d) Çoklu Rejim Genellemesi:** Üç hassasiyetin ($\sigma \in \{0.35, 0.55, 0.75\}$) **tamamında** `KOVAN-V2` ve `353p` çalınan sermayesi `baseline`'a göre **en az %60 azalır** (`<= 0.40 × baseline` VE eşli fark `> 2 SE`).
