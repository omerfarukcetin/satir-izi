# Satır İzi – V1
GitHub Pages üzerinde çalışabilen, bağımlılıksız Türkçe PWA.

## Kurulum
1. GitHub'da `satir-izi` adlı repo oluştur. ZIP içindeki dosyaları repo köküne yükle.
2. Settings → Pages → Build and deployment → Deploy from a branch → main / (root) → Save.
3. Yayınlanan `https://KULLANICI.github.io/satir-izi/` adresini aç.
4. https://aistudio.google.com/apikey adresinden ücretsiz, faturalandırması etkin olmayan bir projeye ait Gemini anahtarı al. Uygulamada Ayarlar'a gir, anahtarı ve model kimliğini ayarla. Varsayılan gemini-2.5-flash-lite; model erişimi değişirse ayarlardan değiştir. Anahtarı GitHub'a yükleme.
5. Kitap ekle → Sayfa tara → Kamera/Galeri → Çizili yerleri çıkar → Kontrol et ve kaydet.
6. Chrome/Edge yükleme menüsünü veya Ayarlar'daki yükleme düğmesini kullan. iOS Safari: Paylaş → Ana Ekrana Ekle.

## Veri ve güvenlik
- Arşiv IndexedDB'de, cihaz ve tarayıcıya özeldir; senkronizasyon yoktur. Tarayıcı verisini silmek arşivi silebilir. JSON yedeklemesi düzenli yapılmalı; geri yükleme mevcut veriyi değiştirir.
- API anahtarı varsayılan olarak yalnızca açık oturumun belleğinde; isteğe bağlı localStorage saklama risklidir. Bu statik prototipte API anahtarı tarayıcıdan Google'a gönderilir; üretim için güvenli, kimlik doğrulamalı sunucu vekili önerilir.
- Görseller Gemini'ye gönderilir; ücretsiz katmanda ürün geliştirme amacıyla kullanılabilir. Hassas notları tarama. Faturalandırma etkin bir API anahtarı kullanılırsa ücret oluşabilir. Kota dolduğunda otomatik ücretli modele geçilmez.
- Eski notlar ve manuel ekleme çevrimdışı çalışır (ilk başarılı çevrimiçi açılıştan sonra); Gemini taraması internet gerektirir. Fotoğraf kalıcı olarak saklanmaz.
- Canlı Gemini çağrısı kişisel anahtar gerektirir. Gerçek kitap fotoğraflarıyla doğruluğu kontrol et.

## Yerelde çalıştırma
`python -m http.server 8000` komutuyla klasörü sun ve http://localhost:8000 adresini aç. PWA için HTTPS veya localhost gerekir.
