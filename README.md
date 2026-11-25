# Satır İzi

**Okudukların kaybolmasın.**

Satır İzi, basılı kitaplarda altını çizdiğin, fosforlu kalemle boyadığın veya kenarına işaret koyduğun satırları
yapay zekâ (Google Gemini) yardımıyla dijital arşivine aktaran kişisel kitap notları uygulamasıdır.
Sunucusu yoktur; GitHub Pages üzerinde çalışan bir PWA'dır ve bütün verin kendi cihazında kalır.

Canlı adres: https://omerfarukcetin.github.io/satir-izi/

**Temel akış:** Kitabı seç → Fotoğraf çek veya yükle → Yapay zekâ işaretli metinleri çıkarsın → Kontrol et → Kaydet.

---

## Özellikler (v2.0.0)

- **Kitaplar:** ad ve yazar zorunlu; yayınevi, kapak, ISBN, kategori, sayfa sayıları, tarihler, okuma durumu
  (Okunacak / Okunuyor / Tamamlandı / Yarım bırakıldı), puan ve kişisel değerlendirme isteğe bağlı.
  Arama, duruma göre filtreleme, sıralama, onaylı silme.
- **Kitap detayı:** kapak, ilerleme çubuğu, istatistikler, sayfa sırasına göre alıntılar, kişisel notlar,
  tarama ve elle alıntı ekleme, Markdown / TXT / CSV dışa aktarma.
- **Fotoğraf tarama:** kamera, galeri, sürükle-bırak veya panodan yapıştırma; döndürme ve kırpma;
  sayfa numarasını otomatik okuma ya da elle girme.
- **Onay ekranı:** yapay zekânın bulduğu alıntılar arşive doğrudan eklenmez. Orijinal fotoğrafın yanında metni düzeltme,
  sayfa numarası değiştirme, silme, yeni alıntı ekleme, birleştirme, imleçten ayırma, seçerek kaydetme.
  Modelin emin olmadığı alıntılar sarı ile işaretlenir, mükerrer alıntılar uyarı verir.
  Taslak IndexedDB'ye kaydedilir; uygulama kapansa bile kaldığın yerden devam edersin.
- **Alıntılarım:** tüm kitaplarda Türkçe büyük/küçük harf duyarlı arama, kitap ve favori filtresi,
  kişisel not ve etiketler, panoya kopyalama.
- **Ana sayfa:** kitap / okunan / tamamlanan / alıntı / not sayıları, okunmakta olan kitaplar, son alıntılar,
  rastgele eski bir alıntı, bekleyen taramalar, yedek hatırlatması.
- **Ayarlar:** Gemini anahtarı ve model kimliği, bağlantı testi, tarama çözünürlüğü, açık/koyu tema,
  yazı boyutu, yedekleme/geri yükleme, depolama bilgisi, kurulum yardımı, gizlilik açıklaması, tüm verileri silme (çift onay).
- **PWA:** ana ekrana eklenebilir, çevrimdışı açılır (arşiv ve elle ekleme çalışır, tarama kapanır),
  yeni sürüm çıktığında “Güncelle” bildirimi gösterir.

## Kurulum ve kullanım

1. Uygulamayı aç: https://omerfarukcetin.github.io/satir-izi/
2. Ana ekrana ekle:
   - **Android (Chrome):** menü ⋮ → “Ana ekrana ekle / Uygulamayı yükle”
   - **iPhone / iPad (Safari):** Paylaş → “Ana Ekrana Ekle”
   - **Bilgisayar (Chrome / Edge):** adres çubuğundaki yükleme simgesi
3. https://aistudio.google.com/apikey adresinden **faturalandırması açık olmayan** bir projeye ait ücretsiz
   Gemini API anahtarı al.
4. **Ayarlar → Gemini yapay zekâ** bölümüne anahtarı yapıştır, “Bağlantıyı test et” ve “Kaydet” düğmelerine bas.
5. **Kitaplarım → Kitap ekle** ile bir kitap oluştur.
6. **Tara** sekmesinden sayfanın fotoğrafını çek → gerekirse kırp → “İşaretli metinleri çıkar” → kontrol et → kaydet.

### Model

Varsayılan model `gemini-3.5-flash-lite`. Google model adlarını değiştirirse veya ücretsiz katmandaki
modeller değişirse **Ayarlar → Model kimliği** alanından güncelle. Model adı kodda sabit değildir.
Kota dolduğunda uygulama ücretli bir modele veya ücretli kullanıma kendiliğinden geçmez.

### Tarama ipuçları

- Sayfayı düz tut, gölge düşürme; çizgiler net görünsün.
- Silik kurşun kalem veya küçük punto için **Ayarlar → Tarama → Yüksek** çözünürlüğü seç.
- Sayfada uzun bir bölüm işaretliyse Gemini bazen telif koruması nedeniyle aktarmayı durdurur. Böyle olursa
  fotoğrafı yalnızca işaretli bölümü kapsayacak şekilde kırp veya alıntıyı elle ekle.

## Veri, gizlilik ve güvenlik

- Kitaplar, alıntılar ve notlar yalnızca bu tarayıcının **IndexedDB** deposunda tutulur. Cihazlar arasında eşitleme yoktur.
- Uygulama tarayıcıdan **kalıcı depolama** izni ister. İzin verilirse tarayıcı yer darlığında verini kendiliğinden silmez.
  Yine de **düzenli JSON yedeği al**. Uygulama 14 günde bir yedek hatırlatması gösterir.
- **API anahtarı** varsayılan olarak yalnızca oturum boyunca bellekte tutulur. “Bu cihazda hatırla” seçilirse
  tarayıcının yerel deposuna şifrelenmeden yazılır. Anahtar hiçbir yedeğe, dışa aktarma dosyasına veya
  Service Worker önbelleğine girmez, loglanmaz.
- Tarama sırasında yalnızca o sayfanın fotoğrafı, senin anahtarınla doğrudan Google Gemini API'ye gönderilir.
  **Ücretsiz katmanda Google gönderilen içeriği ürünlerini geliştirmek için kullanabilir.** Hassas sayfaları tarama.
- Fotoğraflar kalıcı arşivde saklanmaz. Onay ekranında kaydettiğinde veya taslağı sildiğinde geçici fotoğraf da silinir.
- Yapay zekâ çıktısı hiçbir zaman HTML olarak işlenmez. Bütün içerik `textContent` ile basılır ve sayfada
  Content-Security-Policy tanımlıdır.

## Yedekleme ve dışa aktarma

| İşlem | Nerede |
|---|---|
| Tüm verileri JSON olarak yedekle / geri yükle | Ayarlar → Yedekleme |
| Geri yüklerken **birleştir** veya **üzerine yaz** | Geri yükleme sırasında sorulur. “Üzerine yaz” önce mevcut verinin yedeğini indirir |
| Tek kitabı Markdown / TXT / CSV olarak dışa aktar | Kitap detayı → Dışa aktar |
| Tüm kitapları Markdown / TXT / CSV olarak dışa aktar | Ayarlar → Yedekleme |

Yedek dosyasında şema sürümü (`schemaVersion: 2`) bulunur. İlk sürümün (v1) yedekleri de geri yüklenebilir.
Bozuk veya geçersiz bir dosya mevcut veriye dokunmaz; bütün geri yükleme tek bir veritabanı işleminde yapılır.
Markdown çıktısı Obsidian ile uyumludur.

## Geliştirici notları

Bağımlılık ve derleme adımı yoktur: HTML + CSS + Vanilla JavaScript (ES modülleri).

```text
satir-izi/
├── index.html              Uygulama kabuğu (CSP dahil)
├── manifest.webmanifest
├── sw.js                   Service Worker (sürümlü önbellek)
├── .nojekyll
├── fonts/                  Plus Jakarta Sans (gömülü, diğer projelerle aynı)
├── assets/icons/           192, 512, maskable, apple-touch
├── css/style.css
└── js/
    ├── app.js              Başlatma, navigasyon, SW kaydı ve güncelleme bildirimi
    ├── router.js           Hash yönlendirici (#/kitaplar, #/kitap/:id, #/tara, #/onay/:id …)
    ├── database.js         IndexedDB, şema, v1 → v2 migrasyonu, kayıt fabrikaları
    ├── store.js            Bellekteki durum ve veri değiştiren işlemler
    ├── home.js             Ana sayfa
    ├── books.js            Kitap listesi, detay, kitap formu, kişisel notlar
    ├── highlights.js       Alıntı düzenleme, Alıntılarım, onay ekranı
    ├── scan.js             Tara ekranı
    ├── scanner.js          Görsel açma, döndürme, kırpma, optimize etme
    ├── gemini.js           Gemini API, sistem talimatı, JSON şeması, Türkçe hata eşleme
    ├── backup.js           JSON yedekleme / geri yükleme
    ├── export.js           Markdown, TXT, CSV
    ├── settings.js         Ayarlar ekranı, tema
    ├── ui.js · icons.js · utils.js
```

### Yerelde çalıştırma

```bash
python3 -m http.server 8000
# http://localhost:8000 adresini aç (Service Worker için localhost veya HTTPS gerekir)
```

### Yeni sürüm yayınlarken

1. `sw.js` içindeki `CACHE_VERSION` ve `js/utils.js` içindeki `APP_VERSION` değerlerini artır.
2. Yeni bir JS/CSS dosyası eklediysen `sw.js` → `ASSETS` listesine ekle.
3. Veritabanı yapısı değişiyorsa `database.js` içinde `DB_VERSION` değerini artır ve `upgrade()` fonksiyonuna,
   mevcut veriyi koruyan bir migrasyon adımı ekle. **Depoları hiçbir zaman silme.**

### Veritabanı

`satir-izi` veritabanı, sürüm 2: `books`, `highlights`, `notes`, `scanJobs`, `scanDrafts`, `settings`.
İlk sürümün `data` deposu (alıntıları gömülü kitap dizisi) açılışta otomatik olarak yeni depolara taşınır.
Kayıt kimlikleri korunur. Eski depo güvenlik için silinmeden bırakılır. Eski varsayılan modeli kullananlar
`gemini-3.5-flash-lite` modeline geçirilir; özel model seçimi korunur.

## Sürüm geçmişi

### 2.0.1
- Yazı tipi diğer projelerle aynı yapıldı: cihaza gömülü Plus Jakarta Sans (değişken 200–800, Latin + Latin Genişletilmiş). İnternetsiz de çalışır.

### 2.0.0
- Kod modüllere ayrıldı. Alt navigasyon (mobil) ve yan menü (masaüstü), açık/koyu tema, yazı boyutu ve SVG ikonlar eklendi.
- IndexedDB v2 yapısına geçildi; v1 verisi otomatik ve kayıpsız taşınıyor. Kalıcı depolama izni isteniyor.
- Kitaplara yeni alanlar eklendi, yazar zorunlu oldu. Arama, filtre ve sıralama geldi.
- Gemini: sistem talimatı ayrı gönderiliyor, yapılandırılmış JSON şeması kullanılıyor, işaret türü ve belirsiz bölgeler
  ekleniyor, sayfadaki metinler talimat sayılmıyor. Türkçe hata mesajları ve bağlantı testi eklendi.
- Tarama: döndürme, kırpma, sürükle-bırak, yapıştırma, iptal, çözünürlük ayarı. Sonuçlar kalıcı taslak olarak saklanıyor.
- Onay ekranı: fotoğraf önizlemesi, birleştirme/ayırma, seçerek kaydetme, mükerrer kayıt ve “[okunamadı]” uyarıları.
- Alıntılar: kişisel not, etiketler, favoriler, kopyalama, düzenlenme tarihi. Kitap düzeyinde kişisel notlar eklendi.
- Yedekleme: şema sürümü, birleştirme veya üzerine yazma, v1 yedek uyumu, hatırlatma. TXT ve CSV dışa aktarma eklendi.
- Service Worker: sürümlü önbellek, gerçek çevrimdışı açılış ve güncelleme bildirimi. Ayrı maskable ikon eklendi.

### 1.0.0
- İlk sürüm: kitap ekleme, tek fotoğraf tarama, Markdown ve JSON yedek.

## Sonraki aşama (planlanan)

Toplu fotoğraf tarama ve kuyruk (`scanJobs`), ilerleme ekranı, kesintiden sonra devam etme, seçili sayfaların
fotoğrafını saklama, gelişmiş etiket/kategori yönetimi, PDF çıktısı.
