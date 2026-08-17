# Integrasi Katalog Tanpa CORS

Integrasi menggunakan pola **server-to-server**. Browser website kedua hanya memanggil endpoint lokal milik website tersebut, yaitu `/api/products`. Backend sembakorido kemudian mengambil data dari aplikasi fitur-sembako-gemini. Karena request lintas domain berlangsung antarserver, browser tidak memerlukan CORS.

## Alur koneksi

```text
Browser website kedua
        |
        | GET /api/products
        v
Backend website kedua / sembakorido
        |
        | GET ke API fitur-sembako-gemini
        v
fitur-sembako-gemini
```

## Endpoint frontend yang sederhana

```text
GET /api/products
GET /api/products?q=beras
GET /api/products?category=Beras&limit=20&offset=0
```

Endpoint tersebut melakukan proxy ke:

```text
https://paket-sembako-online-943127658752.asia-southeast1.run.app/api/catalog/products
```

Frontend cukup menggunakan:

```javascript
const response = await fetch('/api/products?q=beras&limit=20');
const payload = await response.json();
const products = payload.data.items;
```

Tidak perlu menambahkan `mode: 'no-cors'`. Mode tersebut tidak membuat respons JSON dapat dibaca oleh JavaScript.

## Konfigurasi upstream

Backend sembakorido menggunakan environment variable berikut:

```text
FEATURE_SEMBAKO_API_URL=https://paket-sembako-online-943127658752.asia-southeast1.run.app
```

Jika tidak diatur, URL tersebut digunakan sebagai nilai default. Untuk deployment lain, ubah environment variable tanpa mengubah kode frontend.

## Bentuk respons

```json
{
  "success": true,
  "data": {
    "items": [],
    "total": 0,
    "limit": 20,
    "offset": 0
  }
}
```

Backend proxy menyimpan cache singkat selama 60 detik untuk mengurangi request berulang ke API upstream. API publik upstream tetap read-only dan tidak menyertakan field HPP atau data sensitif.

## Catatan deployment

Setelah kedua repositori dideploy, uji endpoint pada domain sembakorido, bukan langsung dari browser ke domain fitur-sembako-gemini:

```bash
curl -i 'https://DOMAIN-SEMBAKORIDO/api/products?q=beras&limit=2'
```

Pastikan service sembakorido dapat melakukan koneksi keluar ke URL fitur-sembako-gemini dan environment variable `FEATURE_SEMBAKO_API_URL` telah tersedia pada service tersebut.
