# Ön kayıt: H-KALKAN (Kör Savunma Dedektörü Onarımı vs KOVAN-V2 & 353p Öğrenci Modeli)

Bu dosya deney çalıştırılmadan önce yazıldı (2026-11-27). Sabitler, formüller ve kriterler test seed'leri (`12000–12149`) çalıştırıldıktan sonra değiştirilmez.

## Motivasyon

`WHITEPAPER-GOLIATH.md` Bölüm 4 ve 5'te kör anomali dedektörünün iki yapısal açığı kanıtlanmıştır:
1. **Sermaye-Seyreltme Açığı:** Dedektörün `relGain = (C(t) - C(t-1)) / max(C(t-1), 0.1)` oranını kullanması, birikmiş sermayesi yükselen hayatta kalan parazitlerin aynı mutlak çalımı daha düşük göreceli sinyalle gizlemesine olanak tanımaktadır.
2. **Derece–Eşik & Kümülatif Drift Açığı:** Düşük dereceli uç düğümler (`deg`) adım başına daha az kazandığı için eşik altında kalabilmekte, ayrıca ilk dönemi alttan atlatan ajanlar kümülatif sermaye fazlası (`C(t) - C(0)`) biriktirip sessizce sızmayı sürdürebilmektedir.

**H-KALKAN**, dedektörün **%100 kör** kalma zorunluluğunu koruyarak (`isChaos` veya `stolen` bilgisi asla okunmaz; yalnız `stress`, `capital`, `capPrev`, `cap0`, `degree`, `noise` kullanılır) bu açıkları kapatan savunma yamalarını sınar.

## Düzen & Ayrık Seed Kümeleri

- **Motor:** `engine.js` v4.0 + geriye dönük uyumlu `detector_mode` parametresi (`baseline` varsayılan davranışı tek bit değiştirmez).
- **Saldırı Ayarları:** `chaos_ratio: 0.20`, `infiltration_mode: 'random'`, `chaos_particles: ['PARASITE']`, `decision_epoch: 8`, `drain_intensity: 0.5`, `steps: 80`.
- **Hiç Kullanılmamış Ayrık Test Seed'leri:**
  - **Birincil ($\sigma = 0.55$):** `12000–12049` (50 seed)
  - **Gevşek ($\sigma = 0.35$):** `12050–12099` (50 seed)
  - **Sıkı ($\sigma = 0.75$):** `12100–12149` (50 seed)
- **Temiz Ağ FP Kontrolü:** `chaos_ratio: 0.0` ile aynı `150` seed (`12000–12149`) üzerinde 3 hassasiyette sağlıklı düğüm yanlış pozitif (`FP`) oranı ölçülür.

## Kilitli Dedektör Kipleri (`detector_mode`)

Her kip yalnızca dış gözlenebilir nicelikler kullanır:
- `gain = max(0, cap - capPrev)`
- `absRelGain = gain / max(cap0, 0.5)`
- `degGain = gain / max(1.0, 0.35 * degree + 0.65)`
- `excess = max(0, (cap - cap0) / max(cap0, 0.5))`

Formüller:
1. **`baseline`:** `0.55 * stress + 2.0 * max(0, (cap - capPrev) / max(capPrev, 0.1)) + noise`
2. **`kalkan_abs`:** `0.55 * stress + 2.0 * absRelGain + noise`
3. **`kalkan_deg`:** `0.55 * stress + 1.5 * absRelGain + 1.4 * degGain + noise`
4. **`kalkan_drift`:** `0.55 * stress + 2.0 * absRelGain + 0.35 * excess + noise`
5. **`kalkan_full`:** `0.55 * stress + 1.4 * absRelGain + 1.2 * degGain + 0.38 * excess + noise`

## Ön Kayıtlı Kriterler (Birincil Küme `12000–12049`, $\sigma = 0.55$)

- **(a) Çalım Düşüşü:** `kalkan_full` altında hem `KOVAN-V2` hem `STUDENT-353p` çalınan sermayesi `baseline` değerine kıyasla **en az %50 azalır** (`<= 0.50 × baseline` VE eşli fark `> 2 SE`).
- **(b) Yüksek Yakalama (TP):** `kalkan_full` altında `TP(KOVAN-V2) >= %85` VE `TP(STUDENT-353p) >= %85`.
- **(c) Sıkı Yanlış Pozitif (FP) Kalkanı:** `kalkan_full` altında saldırı altındaki sağlıklı düğüm `FP` oranı `<= %5` VE temiz ağlarda (`chaos_ratio = 0`) üç hassasiyetin tamamında `FP <= %3`.
- **(d) Çoklu Rejim Genellemesi:** Üç hassasiyetin ($\sigma \in \{0.35, 0.55, 0.75\}$) **tamamında** `KOVAN-V2` ve `STUDENT-353p` çalınan sermayesi `baseline`'a göre **en az %40 azalır** (`<= 0.60 × baseline` VE eşli fark `> 2 SE`).
- **(e) Nedensellik Kesimleri:** `kalkan_full` vs `kalkan_abs`, `kalkan_deg` ve `kalkan_drift` (`mean ± SE`, `TP` ve `FP`) raporlanır.
