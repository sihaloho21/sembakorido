# Integrasi Katalog Tanpa CORS

## Keputusan arsitektur API — 7 Oktober 2026

Deployment live `paketsembako.com` saat ini menggunakan **GAS-direct** untuk `MAIN_API` dan `ADMIN_API`. Verifikasi publik menunjukkan `https://paketsembako.com/api/products` masih `404`, sehingga route proxy pada `server.js` belum boleh dianggap sebagai endpoint production.

Route `/api/products` dipertahankan sebagai **opsi deployment server** untuk Railway atau host Node yang menjalankan `node server.js`. Frontend production tidak diarahkan ke route tersebut sampai service Node benar-benar dideploy dan smoke test production lulus. Dengan keputusan ini, tidak ada endpoint baru atau default API baru yang diperkenalkan.

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

Endpoint tersebut dirancang melakukan proxy ke:

```text
https://paket-sembako-online-943127658752.asia-southeast1.run.app/api/catalog/products
```

**Verifikasi 7 Oktober 2026:** URL upstream tersebut mengembalikan HTTP `404`. Proxy lokal menerjemahkannya menjadi JSON `CATALOG_UPSTREAM_ERROR`, sehingga route proxy belum dapat dinyatakan siap production. Jangan mengganti path upstream berdasarkan tebakan; tetapkan endpoint resmi dari owner layanan terlebih dahulu.

Frontend cukup menggunakan:

```javascript
const response = await fetch('/api/products?q=beras&limit=20');
const payload = await response.json();
const products = payload.data.items;
```

Tidak perlu menambahkan `mode: 'no-cors'`. Mode tersebut tidak membuat respons JSON dapat dibaca oleh JavaScript.

## Konfigurasi upstream

Jika deployment proxy dipilih, backend sembakorido menggunakan environment variable berikut:

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

Setelah service proxy dideploy, uji endpoint pada domain service tersebut, bukan langsung dari browser ke domain fitur-sembako-gemini:

```bash
curl -i 'https://DOMAIN-SEMBAKORIDO/api/products?q=beras&limit=2'
```

Pastikan service sembakorido dapat melakukan koneksi keluar ke URL fitur-sembako-gemini dan environment variable `FEATURE_SEMBAKO_API_URL` telah tersedia pada service tersebut.

## Status acceptance API-01

- [x] Arsitektur production saat ini didokumentasikan sebagai GAS-direct berdasarkan konfigurasi dan response live.
- [x] Proxy `/api/products` memiliki timeout 10 detik, cache 60 detik, dan error schema konsisten jika dipakai pada deployment Node.
- [ ] Upstream katalog resmi terkonfirmasi dan mengembalikan JSON katalog.
- [ ] `/api/products` live pada domain production.
- [ ] Frontend production dipindahkan ke proxy setelah deployment Node dan smoke test disetujui.
