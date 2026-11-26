# Ön kayıt: H-ATOM (LLM atomu)

Bu dosya deney çalıştırılmadan önce yazıldı (2026-11-26). Kriterler sonuç görüldükten sonra değiştirilmez.

## Düzen

- Motor v4.0, varsayılan kozmoloji ayarları (v2.1), korunumlu ekonomi.
- Hiyerarşik topoloji, rastgele sızma, %20 kaos = 12 tek tip parazit ajan, hassasiyet 0.55, 80 adım.
- Kararlar 8 adımda bir alınır (10 dönem). Şiddet d ∈ [0, 0.8].
- Atom: ajanlar bağlantı sayısına göre sıralanır. İlk 4'ü **çekirdek**, sonraki 4'ü **1. kabuk**, son 4'ü **2. kabuk**.
- Model: Cerebras `gpt-oss-120b`, sıcaklık 0. Bütün istemler, ham cevaplar ve kararlar `llm-runs.json` dosyasına kaydedilir.
- LLM'ler dedektörün eşiğini, anomali skorlarını ve sağlıklı düğümlerin durumunu **görmez**. Yalnızca kendi ajanlarının şiddetini, dönemde çaldığını ve bağlantısının kesilip kesilmediğini görür. Hedef: 80 adımda sürünün toplam çaldığı sermayeyi en çoklamak.
- Deney seed'leri: 9700–9709 (hiç kullanılmadı). Bütün koşullar aynı seed'lerde, eşli karşılaştırılır.

## Koşullar

| Koşul | Açıklama |
|---|---|
| ATOM | Çekirdek LLM kendi 4 ajanını yönetir ve her kabuğa yönerge (d aralığı + not) gönderir. Her kabuğun kendi LLM'i yönergeyle kendi 4 ajanını yönetir. Dönem başına 3 çağrı |
| DÜZ | Tek bir LLM 12 ajanın hepsini doğrudan yönetir. Dönem başına 1 çağrı |
| KURAL | LLM'siz uyarlanır kural: d = 0.5'ten başlar; grubunda bir ajanın bağlantısı kesildiyse d ×0.7, kesilmediyse d ×1.15 (en fazla 0.8) |
| SABİT d | d ∈ {0.1, …, 0.8} sabit. Açgözlü = 0.8. Kâhin = aynı seed'lerde en iyi sabit d (sonradan seçildiği için üst referanstır) |

## Hipotez H-ATOM

Ölçü: toplam çalınan sermaye (`extracted`).

- **(a) Açgözlülüğü öğrenir:** ATOM ≥ 1.5 × Açgözlü, ve eşli fark > 2 SH.
- **(b) Eşiği bilmeden en iyiye yaklaşır:** ATOM ≥ 0.8 × Kâhin (ortalamalar).
- **(c) Hiyerarşi katkı sağlar:** ATOM > DÜZ, eşli fark > 2 SH.

Üçü de sağlanırsa H-ATOM desteklenir.

## Keşif (ön kayıtlı değil)

- ATOM ve KURAL karşılaştırması: LLM, basit bir uyarlanır kuraldan fazlasını katıyor mu?
- Ajanların son şiddetleri H-GİZLİ'nin gizlenme penceresine (d ≈ 0.30–0.35) yakınsıyor mu?
- Gerekçe metinleri (LLM'in kendi açıklamaları): eşiği "keşfettiğini" söylüyor mu?

## Bilinen sınırlamalar

- 10 seed az; (c) için istatistiksel güç düşük olabilir.
- Sıcaklık 0 olsa da LLM çıktısı tam deterministik değildir. Bu yüzden kararlar kaydedilir ve tekrar oynatılır; yeniden çağırmak aynı sonucu vermeyebilir.
