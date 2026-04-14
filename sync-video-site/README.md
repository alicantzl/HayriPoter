# Video Senkronizasyon Platformu

Bu platform, bir host tarafından paylaşılan video izleme deneyimi sunar. Katılımcılar, videonun belirli bir zamanından başlayarak eş zamanlı olarak izleyebilir.

## Özellikler

- **Host ve Katılımcı Modu**: Host video oluşturur, katılımcılar oda ile katılır
- **Zaman Senkronizasyonu**: Tüm katılımcılar aynı videonun aynı zamanını izler
- **Esnek Medya Destekleri**: 
  - Tek link (video + ses birleşik)
  - Ayrı video ve ses linkleri
  - Ayrı video, ses ve alt yazı linkleri
- **Kontroller**: 
  - 15 saniye ileri/geri
  - Play/Pause
  - Tam ekran
  - Katılımcı sayısı göstergesi
- **Gerçek Zamanlı Güncellemeler**: Socket.IO ile anlık senkronizasyon
- **Yeniden Bağlanma**: Kopan bağlantı otomatik yeniden bağlanır
- **Mobil Uyumlu**: Telefon ve tabletlerden erişim

## Kurulum

1. Node.js ve npm yüklü olduğundan emin olun
2. Proje ana dizinine gidin:
   ```bash
   cd HayriPoter
   ```
3. Bağımlılıkları yükleyin:
   ```bash
   npm install
   ```

## Kullanım

1. Sunucuyu başlatın (proje ana dizininde):
   ```bash
   npm start
   ```
2. Tarayıcınızda `http://localhost:3000` adresine gidin
3. **Host Olarak**:
   - Video linki (zorunlu) girin
   - İsteğe bağlı olarak ses ve alt yazı linklerini ekleyin
   - "Oda Oluştur ve Yayını Başlat" butonuna tıklayın
   - Oluşturulan oda ID'sini katılımcılarla paylaşın
4. **Katılımcı Olarak**:
   - Host tarafından verilen oda ID'sini girin
   - "Odaya Katıl" butonuna tıklayın

## Render Uzerinden Yayinlama

Bu projeyi tek basina **Render** uzerinden calistirabilirsin.
Frontend ve backend ayni servis uzerinden yayinlanir.

### 1) Render'a deploy et

- Render'da repo'yu bagla.
- `render.yaml` zaten hazir, Blueprint ile olustur.
- Servis ayarlari otomatik gelir:
  - `rootDir: sync-video-site`
  - `buildCommand: npm install`
  - `startCommand: node server.js`

### 2) Domain uzerinden kullan

- Render URL'i acildiginda arayuz gelir.
- Ayni domain uzerinden Socket.IO baglantisi otomatik kurulur.
- `config.js` icinde ekstra URL ayarina gerek yoktur.

### 3) Kontrol

- Host oda olusturabilmeli.
- Farkli cihazdan katilimci baglandiginda senkron calismali.
- `https://<render-domain>/health` endpoint'i `{"ok":true}` donmeli.

## Notlar

- Host videoyu kontrol eder (play/pause/seek)
- Katılımcılar sadece izleyebilir, kontrol edemez
- Bağlantı kesildiğinde otomatik yeniden bağlanma denemesi yapılır
- Mobil cihazlarda uygulama değişikliği sırasında da yeniden bağlanma desteklenir

## Teknolojiler

- Node.js
- Express.js
- Socket.IO
- HTML5 Video API
- CSS3
- Vanilla JavaScript
