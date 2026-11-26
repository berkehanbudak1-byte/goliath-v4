# GOLIATH v0.7 → v4.0 (v08) — Durum ve Devam Özeti

- **Kaynak Oturum:** `https://claude.ai/code/session_01VYTeJbz85DRnwxUTMNkDUD` (`/home/user/goliath-v08`)
- **Durma Sebebi:** Claude Web haftalık kredi limiti doldu (`Resets Mon, Nov 30, 3:00 AM`); arka planda çalışan `node --no-warnings llm_atom.js` durduruldu.

## Yerelde Kurtarılan Dosyalar (`goliath-v4` depo kökü)
| Dosya | Durum | Açıklama |
|---|---|---|
| `engine.js` | Kurtarıldı & doğrulandı (v4.0) | `goliath-v3.0.html` içindeki v3.0 motoru + v4.0 karar üreteci yamaları (`30/30` v3.0 uyumu, `20/20` eşdeğerlik). |
| `engine-v3.0.js` | Kurtarıldı | v3.0 taban motoru (CERN güncel modeli, LIGO, QCD kütlesi, agnostik graviton). |
| `llm_atom.js` | Kurtarıldı & düzenlendi | H-ATOM / DÜZ / KURAL deney sürücüsü + hız sınırlayıcı (`GAP_MS=12500`, `HOUR_MAX=145`) + `llm-runs.partial.jsonl` kaldığı yerden devam desteği. |
| `analyze_atom.js` | Kurtarıldı | `llm-runs.json` -> `atom-results.json` ön kayıt analiz betiği + birebir tekrar oynatma (`replay`). |
| `ONKAYIT-H-ATOM.md` | Kurtarıldı | Ön kayıtlı H-ATOM düzeni ve kriterler `(a)`, `(b)`, `(c)`. |
| `RAPOR.md` | Kurtarıldı | v0.7–v3.0 doğrulama raporu (H-GİZLİ, H-KUANTUM, H-JOKER, H-LIGO, geri çekilen H-PRR(c)/H-KÜME). |
| `goliath-v3.0.html`, `goliath-v2.1.html` | Kurtarıldı | Tek dosyalık tarayıcı simülatörleri. |

> **Bulut Sandbox'ta Kalanlar:** `llm-runs.partial.jsonl` içindeki 4 ATOM koşusunun ham JSONL kayıtları (`ccr-6acbe457-4vriuu` kapandığı için indirilmedi), `validate.js` / `build.js` / `template.html` (ancak `goliath-v3.0.html` arayüz + `engine.js` v4.0 yerelde mevcut).

## Oturumda Gözlenen Tamamlanmış Sonuçlar (Seed 9700–9703)
- `rule seed 9700`: çalınan **17.1**, TP **12/12** *(tüm 10 `rule` ve 80 `fixed` koşusu deterministiktir ve LLM'siz yerelde anında hesaplanabilir)*
- `atom seed 9700`: çalınan **31.0**, TP **11/12** (142 çağrı, 7 hata, 29.4 dk)
- `atom seed 9701`: çalınan **14.8**, TP **12/12** (116 çağrı, 6 hata, 24.0 dk)
- `atom seed 9702`: çalınan **12.0**, TP **11/12** (137 çağrı, 6 hata, 28.4 dk)
- `atom seed 9703`: çalınan **35.2**, TP **6/12** (114 çağrı, 6 hata, 23.6 dk)

## Sonraki Adımlar (Oturum Planı)
1. **H-ATOM Tamamlama:** Kalan `atom` (seed 9704–9709) ve `flat` (DÜZ, seed 9700–9709) koşularını tamamla → `node analyze_atom.js`.
2. **KOVAN Koşulu (Seeley Arı Kovanı Uzlaşması):** Kraliçe LLM strateji önermez, üreme/görev dağılımını yönetir; kâşif ajanlar sallanma dansıyla paylaşır, çoğunluk eşiğinde sürü strateji değiştirir; eşit bütçe korunur. `ATOM` ve `DÜZ` ile aynı seed'lerde kıyasla.
3. **8 GB RAM / CPU İçin Öğrenci Model Damıtması:** Biriken `(gözlem -> d)` kararlarından tarayıcı içi hafif sinir ağı / karar ağacı eğitip `KURAL` ve öğretmen LLM (%90 hedefi) ile sına.
4. **White Paper:** `RAPOR.md` + `atom-results.json` bulgularıyla teknik makaleyi yaz.
