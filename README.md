# Satır İzi

**Okudukların kaybolmasın.**

Satır İzi, basılı kitaplarda altını çizdiğin, fosforlu kalemle boyadığın veya kenarına işaret koyduğun satırları
yapay zekâ (Google Gemini) yardımıyla dijital arşivine aktaran kişisel kitap notları uygulamasıdır.
Sunucusu yoktur; GitHub Pages üzerinde çalışan bir PWA'dır ve bütün verin kendi cihazında kalır.

Canlı adres: https://omerfarukcetin.github.io/satir-izi/

**Temel akış:** Kitabı seç → Fotoğraf çek veya yükle → Yapay zekâ işaretli metinleri çıkarsın → Kontrol et → Kaydet.

---

## Özellikler (v3.6.1)

- **Otomatik doldurma:** “Kapağın fotoğrafını çek” ile ad ve yazar (arka kapak da eklenirse ISBN ve yayınevi) Gemini ile okunur;
  ISBN bulunursa Google Books ve Open Library’den sayfa sayısı, yayınevi ve kapak tamamlanır. ISBN elle de aranabilir.
  Çekilen fotoğraf kapak olarak kullanılmaz ve saklanmaz; yalnızca boş alanlar doldurulur.
  Kitap bağlantısı (1000kitap, Kitapyurdu, D&R, İdefix, Amazon…) yapıştırılırsa Gemini sayfayı okur (URL bağlamı);
  sayfa açılamazsa (veya Gemini kotası doluysa) bağlantıdaki ad ücretsiz kataloglarda aranır ve bu ekranda belirtilir.
  Google araması kullanılmaz (Gemini 3 ücretsiz katmanında kapalıdır ve ücretli olabilir).
  Sayfadaki kapak görseli de alınır: cihaza kopyalanabiliyorsa saklanır, site izin vermiyorsa adresiyle gösterilir
  (görsel yüklenip dikey bir kapak olduğu doğrulanmadan kabul edilmez).
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
- **Toplu tarama:** aynı kitabın birden fazla sayfasını (en fazla 60) tek seferde ekle: galeriden çoklu seçim,
  kamerayla tek tek çekim, sürükle-bırak. Listeden çıkarma, sıra değiştirme, döndürme ve kırpma.
  Fotoğraflar **sırayla** taranır (paralel istek yok); aralarına ayarlanabilir bekleme konur.
  İlerleme ekranı: toplam, tamamlanan, bekleyen, başarısız, bulunan alıntı ve yüzde.
  Duraklat, hemen durdur, başarısızları yeniden dene. Kota dolunca veya bağlantı kopunca iş kendiliğinden duraklar;
  tamamlananlar kaybolmaz. Uygulama kapanırsa iş “duraklatıldı” olarak açılır ve kaldığı yerden devam eder.
  Bütün sonuçlar tek bir **toplu onay** ekranında kontrol edilip kaydedilir.
  Not: tarayıcı arka plandaki işlemi durdurabilir; tarama sırasında ekran açık tutulmalıdır
  (destekleyen tarayıcılarda ekranın kapanması engellenir).
- **Alıntılarım:** tüm kitaplarda Türkçe büyük/küçük harf duyarlı arama, kitap ve favori filtresi,
  kişisel not ve etiketler, panoya kopyalama.
- **Hesap ve eşitleme (isteğe bağlı):** Emanet ve Sefer ile aynı Supabase projesi ve aynı hesapla e-posta/şifre girişi.
  Kitaplar, alıntılar, notlar, eşitlenen ayarlar (model, tema, yazı boyutu, tarama ayarları) ve Gemini API anahtarı
  bütün cihazlarda eşitlenir. Eşitleme **kayıt düzeyindedir**: iki cihazda ayrı ayrı eklenen alıntıların ikisi de korunur,
  aynı kayıt iki yerde değiştiyse yeni olan kazanır, silinenler diğer cihazlardan da silinir. Her günün son hâli
  30 gün boyunca otomatik bulut yedeği olarak saklanır (API anahtarı hariç). Giriş yapmadan kullanım aynen sürer.
- **Sefer bağlantısı:** Satır İzi, Sefer’in içinde “Kitaplar” sekmesi olarak açılır (ayrıca bağımsız da çalışır).
  Sefer’deki okuma görevi bir Satır İzi kitabına bağlanabilir: Sefer’de girilen sayfalar Satır İzi’deki ilerlemeye,
  Satır İzi’de “Bugün okudum” ile girilenler Sefer’deki göreve işlenir; kitap bitince iki tarafta da tamamlanır.
  Sefer’in Bugün ekranında arşivden “günün satırı” gösterilir.
- **Geçmiş kitaplar:** Kitaplarım → “Okuduğum bir kitap” ile bitirme tarihiyle eklenir (okunan sayfa = toplam sayfa).
- **Toplu elle alıntı:** Kitap sayfasında “Toplu alıntı gir”: alıntıları boş satırla ayırarak yapıştır; “s. 42”, “42:”, “(s. 42)”
  sayfa işaretleri ayrılır. Eklenme tarihi varsayılan olarak kitabın bitirme tarihidir (istatistikler doğru aya düşer).
- **İstatistik:** yıl ve ay seçimi; bitirilen kitap, okunan sayfa, alıntı ve not sayıları; aylara göre grafikler;
  en çok okunan yazarlar, kategoriler, etiketler; yıllar tablosu. Ana sayfada yılın özeti.
- **Etiketler ve bağlantılar (Obsidian tarzı):** alıntılara ve notlara etiket; notlarda `#etiket` ve `[[Kitap adı]]`;
  alıntılar/notlar arası iki yönlü “ilgili” bağlantısı; kitapta “Bu kitaba bağlantı verenler”; Etiketler sayfası;
  Markdown dışa aktarımında `[[...]]` ve `#etiket` korunur.
- **Etiket yönetimi:** Etiketler sayfasında yeniden adlandırma, birleştirme ve silme (metin içindeki #etiketler de güncellenir;
  büyük/küçük harf, tire ve boşluk farkı aynı etiket sayılır).
- **Yapay zekâ ile etiket önerisi:** alıntı düzenlerken “Etiket öner”; Etiketler sayfasında etiketsiz alıntılar 20’şerli
  tek istekte incelenir. Mevcut etiketler önceliklidir; öneriler onaylanmadan kaydedilmez.
- **Kitap raporu:** kitap sayfasında “Rapor oluştur”: yalnızca o kitaptaki alıntılarından, notlarından ve değerlendirmenden
  özet, temalar (sayfalarıyla), öne çıkan alıntılar, düşüncelerin ve düşünmek için sorular. Dışarıdan bilgi eklenmez;
  öne çıkan alıntılar kayıtlı alıntılarla harfiyen eşleşmeyen her şey atılır, olmayan sayfa numaraları silinir.
  Rapor kitapla saklanır/eşitlenir, Markdown dışa aktarıma girer; yeni alıntı eklenince “Yenile” uyarısı çıkar.
- **Haftalık ve aylık özet** (ana sayfada “Okuduklarının izi”, tümü: `#/ozetler`): amaç okuduklarını unutmamak.
  Hafta (pazartesi–pazar) ve ay bitince, uygulamayı açtığında biten son dönemin özeti kendiliğinden hazırlanır
  (Ayarlar → Haftalık ve aylık özet ile kapatılabilir; kapalıyken listeden “Hazırla” ile istenir).
  - Cihazda hesaplanan: alıntı/not/kitap sayısı, Sefer’de o dönemde okunan sayfalar (Sefer bu cihazda açıldıysa),
    başlanan ve biten kitaplar, etiketler, seçilen alıntılar ve **Unutma** bölümü (en az 3 hafta önce kaydedilmiş,
    tercihen aynı etiketli alıntılar).
  - Gemini ile (1 istek): tarafsız genel özet, kitap kitap kısa özet, temalar ve dönemin satırları. Yalnızca o dönemin
    kayıtları gönderilir; her bölüm dayandığı kayıtları belirtmek zorundadır. Kaynağı olmayan, başka kitabın kaydına
    dayanan ya da kayıtlarda geçmeyen tırnaklı söz içeren bölümler atılır ve sayısı gösterilir.
  - Özet alıntı metnini değil kayıt kimliğini saklar; alıntılar her zaman kayıtlı hâliyle gösterilir. Dönemin kayıtları
    sonradan değişirse “Güncelle” önerilir. Anahtar/internet yoksa ya da istek başarısız olursa yalnızca cihaz bölümleri
    kaydedilir; başarısız değerlendirme en erken 12 saat sonra kendiliğinden bir kez daha denenir.
  - Hesap açıksa özetler eşitlenir; diğer cihaz aynı özet için yeniden istek göndermez (açılışta önce eşitleme beklenir).
  - Markdown olarak kopyalanabilir/indirilebilir; alıntılar kart olarak paylaşılabilir.
- **Bağlantı haritası** (Alıntılarım → Harita, Etiketler → Harita): etiketler (turkuaz daire) ve kitaplar (safran
  dikdörtgen) ile aralarındaki bağlar. Bağlar: aynı alıntıda birlikte kullanılan etiketler, kitapta geçen etiketler,
  alt etiketler (kesikli çizgi) ve [[Kitap]] ya da ilgili alıntı bağlantılarıyla kitaplar arası bağ. Düğüme dokununca
  komşuları öne çıkar, panelde birlikte kullanılan etiketler, kitaplar, “Alıntıları gör” ve “Arşivine sor” (soru
  hazırlanır, gönderilmez) çıkar. **Konular** etiketlerin birlikte kullanımından cihazda kendiliğinden çıkarılır
  (yapay zekâ kullanılmaz). Sürükleyerek gezme, iki parmak/tekerlekle yakınlaştırma, arama, kitapları gizleme ve
  ekran okuyucular için **Liste** görünümü vardır. En çok 150 etiket ve 120 kitap gösterilir.
- **Alt etiketler:** `felsefe/stoacılık` gibi eğik çizgiyle yazılır (notta `#felsefe/stoacılık`). Etiketler ekranında
  üst etiketin altında girintili listelenir; yazılmamış üst etiket alt etiketlerinin toplamı olarak görünür.
  Üst etiketle filtrelemek alt etiketlerin alıntılarını da getirir.
- **Arşivine sor** (Alıntılarım → “Arşivine sor” veya ana sayfa): “Sabır hakkında hangi kitaplarda ne not almıştım?” gibi
  sorular yalnızca senin alıntı ve notlarından yanıtlanır. Önce cihazda soruyla ilgili kayıtlar bulunur (arşiv küçükse
  hepsi gönderilir, ~45 bin karakter sınırı); Gemini her paragraf için dayandığı kayıtları belirtmek zorundadır.
  Kaynağı olmayan ya da kayıtlarda geçmeyen tırnaklı alıntı içeren paragraflar atılır ve bu ekranda belirtilir.
  Kaynaklar senin kayıtlı metninle, kitaba giden kartlar olarak gösterilir. Her soru 1 istek; sohbet cihazda saklanmaz
  (sayfa yenilenince silinir), takip sorularında son iki soru-cevap bağlam olarak gider.
- **Kapak bağlantısı:** kitap formunda kapağın yanındaki “Bağlantıdan” ile kapak görselinin adresi yapıştırılabilir
  (tarayıcıda “Resim adresini kopyala”). Site izin veriyorsa görsel küçültülüp cihaza kopyalanır; izin vermiyorsa
  adres yalnızca gerçekten bir resimse bağlantı olarak saklanır (çevrimdışı görünmeyebilir, alıntı kartına eklenemez).
  Resim olmayan sayfa bağlantıları reddedilir; kitap sayfası bağlantısı için “Otomatik doldur” kullanılır.
- **Alıntı kartı:** her alıntıdaki paylaş düğmesi alıntıyı kitap adı, yazar ve sayfayla görsel karta çevirir.
  Biçim: gönderi 4:5, hikâye 9:16, kare; tema: Gece, Gündüz, Kâğıt. Telefonda paylaş menüsü açılır (WhatsApp,
  Instagram…); desteklemeyen tarayıcıda PNG indirilir. Kart cihazda çizilir, internet gerekmez.
  Kitabın kapağı varsa “Kitap kapağı: Ekle / Ekleme” seçeneği çıkar; eklenince kapak, kitap adı ve yazarın solunda
  gölgeli bir kitap olarak durur (hikâye biçiminde daha büyük). Kapak, izin vermeyen bir siteden bağlantı olarak
  kaydedilmişse karta eklenemez; bu durumda uyarı gösterilir ve kart kapaksız hazırlanır.
- **Ana sayfa:** kitap / okunan / tamamlanan / alıntı / not sayıları, okunmakta olan kitaplar, son alıntılar,
  rastgele eski bir alıntı, bekleyen taramalar, yedek hatırlatması.
- **Ayarlar:** Gemini anahtarı ve model kimliği, bağlantı testi, tarama çözünürlüğü, açık/koyu tema,
  yazı boyutu (Sefer ile aynı seçenekler; isteğe bağlı olarak Sefer’i izler), yedekleme/geri yükleme, depolama bilgisi, kurulum yardımı, gizlilik açıklaması, tüm verileri silme (çift onay).
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

## Hesap kurulumu (bir kez)

Satır İzi, Emanet ve Sefer'in kullandığı Supabase projesini kullanır (`js/config.js`). Bu projede yalnızca iki ayar yapılır:

1. **Tabloları oluştur:** Supabase paneli → **SQL Editor** → New query → `supabase/satir-izi.sql` dosyasının tamamını
   yapıştırıp **Run**. (Birden çok kez çalıştırılabilir; Emanet/Sefer tablolarına dokunmaz.)
2. **Yönlendirme adresini ekle:** Authentication → **URL Configuration** → Redirect URLs listesine
   `https://omerfarukcetin.github.io/satir-izi/` ekle. Hesap onay ve şifre yenileme e-postalarındaki bağlantılar
   bu sayede Satır İzi'ye döner.

Bu iki adım yapılmadan giriş çalışır ama eşitleme “Bulut tablosu henüz kurulmamış” uyarısı verir.

## Veri, gizlilik ve güvenlik

- Giriş yapılmazsa kitaplar, alıntılar ve notlar yalnızca bu tarayıcının **IndexedDB** deposunda tutulur.
- Giriş yapılırsa aynı veriler, eşitlenen ayarlar ve Gemini API anahtarı Supabase'de `satir_izi_state` tablosunda,
  hesaba özel tek satırda saklanır. Satır güvenliği (RLS) sayesinde yalnızca hesap sahibi okuyup yazabilir.
  Taslaklar, toplu tarama fotoğrafları ve cihaz tercihleri buluta gitmez.
- Çıkış yaparken “Bu cihazdan sil” seçilirse arşiv ve API anahtarı o cihazdan temizlenir (ortak cihazlar için).
- Uygulama tarayıcıdan **kalıcı depolama** izni ister. İzin verilirse tarayıcı yer darlığında verini kendiliğinden silmez.
  Yine de **düzenli JSON yedeği al**. Uygulama 14 günde bir yedek hatırlatması gösterir.
- **API anahtarı** varsayılan olarak yalnızca oturum boyunca bellekte tutulur. “Bu cihazda hatırla” seçilirse
  tarayıcının yerel deposuna şifrelenmeden yazılır. Hesapla giriş yapıldıysa anahtar hesaba da kaydedilir ve diğer
  cihazlara gelir. Anahtar hiçbir JSON yedeğine, otomatik bulut yedeğine, dışa aktarma dosyasına veya
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
├── supabase/satir-izi.sql  Bulut tabloları (RLS ile)
├── fonts/                  Plus Jakarta Sans (gömülü, diğer projelerle aynı)
├── assets/icons/           192, 512, maskable, apple-touch
├── css/style.css
└── js/
    ├── app.js              Başlatma, navigasyon, SW kaydı ve güncelleme bildirimi
    ├── config.js           Supabase adresi ve herkese açık anahtar
    ├── sync.js             Giriş, kayıt düzeyinde eşitleme, bulut yedeği
    ├── account.js          Hesap arayüzü (giriş, çıkış, bulut yedekleri)
    ├── bridge.js           Sefer köprüsü (bağımsız modül; Sefer içe aktarır)
    ├── vendor/supabase.js  supabase-js 2.45.4 (Emanet ile aynı dosya)
    ├── router.js           Hash yönlendirici (#/kitaplar, #/kitap/:id, #/tara, #/onay/:id …)
    ├── database.js         IndexedDB, şema, v1 → v2 migrasyonu, kayıt fabrikaları
    ├── store.js            Bellekteki durum ve veri değiştiren işlemler
    ├── home.js             Ana sayfa
    ├── books.js            Kitap listesi, detay, kitap formu, kişisel notlar
    ├── highlights.js       Alıntı düzenleme, Alıntılarım, onay ekranı
    ├── scan.js             Tara ekranı (tek sayfa)
    ├── batch.js            Toplu tarama: hazırlık, ilerleme, toplu onay
    ├── batch-runner.js     Sıralı tarama kuyruğu (duraklat, devam, kurtarma)
    ├── review.js           Ortak onay bileşeni ve tek sayfa onay ekranı
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

`satir-izi` veritabanı, sürüm 3: `books`, `highlights`, `notes`, `scanJobs`, `scanDrafts`, `settings`.
`scanJobs` deposunda toplu tarama iş kayıtları (`kind: 'job'`) ve fotoğrafları (`kind: 'photo'`, Blob olarak) tutulur;
fotoğraflar onaydan sonra silinir ve yedeğe girmez.
İlk sürümün `data` deposu (alıntıları gömülü kitap dizisi) açılışta otomatik olarak yeni depolara taşınır.
Kayıt kimlikleri korunur. Eski depo güvenlik için silinmeden bırakılır. Eski varsayılan modeli kullananlar
`gemini-3.5-flash-lite` modeline geçirilir; özel model seçimi korunur.

## Sefer ile bağlantı (geliştirici notu)

İki uygulama aynı alan adında (`omerfarukcetin.github.io`) çalışır; bu yüzden aynı tarayıcıda Supabase oturumu ve
cihazdaki veriler ortaktır. Sefer, `../satir-izi/js/bridge.js` modülünü içe aktarır. Köprü:

- Satır İzi veritabanını **sürüm belirtmeden** açar, hiçbir zaman şema yükseltmesi tetiklemez ve her işlemden sonra kapatır.
- `listBooks`, `getBook`, `setProgress` (Sefer → mutlak okunan sayfa, bitti bilgisi, görev bilgisi), `unlink`,
  `quoteOfDay`, `queuePages` / `takeInbox` (Satır İzi → Sefer “bugün okudum” gelen kutusu) sunar.
- Sayfa ilerlemesinin tek kaynağı Sefer’in günlük kayıtlarıdır; böylece aynı sayfa iki kez sayılmaz.
  Bağlı kitapta Satır İzi’deki “Okunan sayfa” alanı salt okunurdur.
- Köprünün dışa açtığı işlevler değiştirilirken Sefer’deki çağrılar da güncellenmelidir.

## Sürüm geçmişi

### 3.6.1
- Alıntılarım: kitap ve sıralama seçicileri küçük ve tek satırda; uzun kitap adı sayfayı yana taşırmıyor. Telefonda başlık düğmeleri ve Sefer içindeki üst menü daha ince.

### 3.6.0
- Temalar Sefer ile aynı: Lacivert, Krem, Beyaz, Siyah, Zümrüt, Kum ve Cihaza göre (Sefer'deki gibi cihaz gece modundayken
  Sefer'in seçtiği koyu tema, gündüz modundayken açık tema; varsayılan Lacivert/Beyaz). “Sefer ile aynı olsun” açıkken
  Sefer'de seçilen tema ve yazı boyutu kullanılır, Sefer'de değişince açık Satır İzi sayfasına anında geçer.
  Renk örnekli tema seçici. Haritanın renkleri her tema için doğrulandı.

### 3.5.0
- Sade ana sayfa: küçük başlık (Sayfa tara, Kitap ekle, Arşivine sor), aynı anda en fazla bir uyarı (bekleyen tarama >
  giriş önerisi > yedek; hesapla giriş yapılmışsa yedek uyarısı çıkmaz), tek satır sayılar (kitap, alıntı, bu yıl biten →
  İstatistik), okunan kitaplar ilerleme çubuklu kısa satırlar, son alıntılar ve “Eski bir satır” düğmesiz önizleme.

### 3.4.1
- Özetler listesinde art arda gelen boş dönemler tek satırda toplanır.

### 3.4.0
- Haftalık ve aylık özet (Okuduklarının izi).

### 3.3.0
- Bağlantı haritası ve kendiliğinden çıkan konu kümeleri.
- Alt etiketler (felsefe/stoacılık).

### 3.2.2
- Eşitleme düzeltmeleri: iki cihaz aynı anda yazdığında birinin değişikliği kaybolabiliyordu; artık yazma yalnızca
  okunan bulut sürümü değişmediyse yapılır, değiştiyse yeniden okunup birleştirilir (en fazla 4 deneme).
- Açık kalan sayfa (bilgisayar, Sefer içindeki sekme) buluttaki değişikliği 30 sn'de bir ve pencereye dönüldüğünde
  kontrol eder (yalnızca sürüm alanı okunur).
- Uygulama arka plana geçerken bekleyen değişiklik beklemeden gönderilir.
- Ayarlar → Hesap ve eşitleme → “Eşitleme ayrıntıları”: bu cihaz ve buluttaki kayıt sayıları, son hata, sürüm.

### 3.2.1
- Kapak görselini bağlantıdan ekleme.

### 3.2.0
- Alıntı kartına kitap kapağı ekleme seçeneği.

### 3.1.0
- Arşivine sor: kaynak gösteren, doğrulamalı soru-cevap.
- Alıntı kartı paylaşımı (4:5 / 9:16 / kare, 3 tema).

### 3.0.0
- Kitap raporu (yapay zekâ, yalnızca kullanıcının kayıtlarından, doğrulamalı).
- Yazı ölçeği Sefer ile aynı (24/17/15/14/13 px; masaüstünde biraz büyük).
- Ana sayfadan “Kişisel not” sayısı kaldırıldı.

### 2.9.0
- Bağlantıdan doldururken sayfadaki kapak görseli de alınır; katalog adla aramasında da kapak gelir.
  Kopyalanamayan kapaklar adresiyle saklanır, açılamazsa harf kapağa döner.

### 2.8.1
- Bağlantıdan doldurma: Google araması kaldırıldı (ücretsiz katmanda kapalı olduğu için kota hatası veriyordu).
  Sayfa okunamazsa bağlantıdaki ad Google Books / Open Library’de aranır.

### 2.8.0
- Kitap bağlantısından otomatik doldurma (Gemini URL bağlamı, gerekirse Google araması; ISBN bulunursa katalogla tamamlanır).

### 2.7.0
- Etiket yönetimi (yeniden adlandır, birleştir, sil) ve yapay zekâ ile etiket önerisi (tekli ve toplu).

### 2.6.0
- Geçmiş kitap ekleme, toplu elle alıntı girişi, İstatistik ekranı, etiket girişi ve Etiketler sayfası,
  `[[Kitap]]` / `#etiket` bağlantıları, ilgili alıntı/not bağlantıları ve geri bağlantılar.

### 2.5.0
- Renkler Sefer ile aynı: Gece temasında lacivert zemin ve turkuaz/safran vurgular, Gündüz temasında açık mavi-beyaz.
  Satır İzi Sefer’in Kitaplar sekmesinde aynı uygulamanın parçası gibi görünür.

### 2.4.1
- Görünüm ayarları Sefer ile aynı: Tema (Gece / Gündüz / Cihaza göre) ve 5 kademeli yazı boyutu.
  “Sefer ile aynı olsun” (varsayılan) açıkken seçimler Sefer’den alınır ve Sefer’de değişince anında uygulanır.

### 2.4.0
- Kitap formunda otomatik doldurma: kapak/arka kapak fotoğrafı (Gemini) ve ISBN araması (Google Books, Open Library).

### 2.3.0
- Sefer bağlantısı: köprü modülü, Sefer içinde gömülü düzen, bağlı kitapta Sefer kutusu ve “Bugün okudum”,
  masaüstü menüsünde ve Ayarlar’da Sefer’e geçiş.
- Eşitlemeler artık sırayla çalışır; “Şimdi eşitle” işlemin bitmesini bekler.

### 2.2.0
- Hesap ve eşitleme: Emanet/Sefer ile aynı Supabase hesabıyla giriş, kayıt düzeyinde birleştirme, silme izleri,
  ayarların ve Gemini API anahtarının eşitlenmesi, günlük otomatik bulut yedeği ve geri yükleme.
- Çıkış yaparken verileri cihazda bırakma veya silme seçeneği; hesap değişiminde onay.
- JSON geri yükleme ve “Tüm verileri sil” giriş yapılmışken buluta da doğru yansıyor.

### 2.1.0
- Toplu fotoğraf tarama: çoklu seçim, sıralama, döndürme/kırpma, sıralı kuyruk, bekleme süresi, ilerleme ekranı,
  duraklat/durdur/yeniden dene, kota ve kesinti sonrası devam, toplu onay ekranı.
- Kitap detayına “Toplu tara” butonu; ana sayfa ve kitap ekranında bekleyen taramalar.
- Veritabanı sürüm 3 (yalnızca dizin eklendi; veri değişmedi).

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

Gelişmiş arama filtreleri (etiket, kategori, tarih, kitap durumu) ve etiket yönetimi, seçili sayfaların fotoğrafını
saklama, PDF çıktısı; ardından Aşama 3 (tekrar sistemi, istatistikler, yapay zekâ etiketleme, senkronizasyon).
