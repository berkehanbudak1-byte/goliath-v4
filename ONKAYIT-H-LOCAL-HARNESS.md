# Ön kayıt: H-LOCAL-HARNESS (1.9 GB Yerel LLM + KOVAN İskelesi vs Ham Yerel LLM vs 120B Bulut ATOM)

Bu dosya deney çalıştırılmadan önce yazıldı (2026-11-26). Kriterler ve istemler sonuçlar görülmeden önce kilitlenmiştir.

## Bağlam ve Model

- **Kullanılan Yerel Model:** Ollama `homunculus-q3:latest` (~1.9 GB GGUF, yalnızca CPU, 8 GB RAM dostu, `temperature: 0`, `format: "json"`, `concurrency = 1`).
- **Bulut Referansı (Tarihsel Oturum Kaydı):** `session_01VYTeJbz85DRnwxUTMNkDUD` oturumundan Cerebras `gpt-oss-120b` `ATOM` koşuları: `seed 9700 = 31.0`, `9701 = 14.8`, `9702 = 12.0`, `9703 = 35.2` (ortalama **23.25**).
- **Seed'ler:** `9700, 9701, 9702, 9703` (`quarantine_sensitivity = 0.55`, `BASE` düzeni: `chaos_ratio = 0.20`, `decision_epoch = 8`, `steps = 80`).

## Koşullar (Aynı 4 Seed'de Eşli)

1. **`LOCAL-FLAT`:** `homunculus-q3` doğrudan 12 ajanın tamamı için tek tek `d_i` JSON çıktısı üretir (dönem başına 1 çağrı).
2. **`LOCAL-KOVAN`:** `homunculus-q3` **Kovan Stratejisti** olarak yalnızca kör sürü telemetrisini (`t`, `activeCount`, `newlyCutCount`, `hiveFlux`, `fluxCeil`, `lastEpochStolen`, `scoutSummary`) görür ve `{"action": "up"|"hold"|"down", "step": 0.80..1.35, "gerekce": "..."}` üretir. **KOVAN-V2** topolojik iskelesi `hiveFlux` değerini derece-ters ölçekleme (`DEG_ALPHA=0.5`), 2 uç kâşif, çarpışma bariyeri (`0.88×`) ve sermaye-seyreltme rampası ile ajanlara dağıtır.
3. **Eşli Deterministik Tabanlar:** `KOVAN-V2`, `KURAL`, `Açgözlü (d=0.8)`, `Kâhin` (sabit `d ∈ {0.1..0.8}` en iyisi) ve tarihsel referans `CLOUD-ATOM-120B` (`23.25`).

## Ön Kayıtlı Kriterler

- **(a) İskele Ham Yerel Modeli Geçer:** `mean(LOCAL-KOVAN) > mean(LOCAL-FLAT)` VE `TP(LOCAL-KOVAN) < TP(LOCAL-FLAT)`.
- **(b) 1.9 GB Yerel + İskele, 120B Bulut ATOM Referansını Geçer:** `mean(LOCAL-KOVAN) > 23.25` VE `mean(LOCAL-KOVAN) >= 1.5 × Açgözlü`.
- **(c) Keşif (ön kayıtlı değil):** `LOCAL-KOVAN` vs deterministik `KOVAN-V2` kıyaslaması, JSON ayrıştırma hata oranı (`badCalls/totalCalls`) ve yerel modelin Türkçe stratejik gerekçeleri dürüstçe raporlanır.
