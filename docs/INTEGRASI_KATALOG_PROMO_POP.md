# Panduan Integrasi Katalog Promo POP (PRD Flyer)

Panduan ini menjelaskan cara menjadikan **sembakorido** sebagai website utama yang menyediakan akses ke Generator **Katalog Promo POP (PRD Flyer)** dari aplikasi **fitur-sembako-gemini**.

Integrasi yang digunakan adalah **Opsi A: launcher/link**. Sembakorido menampilkan tombol, lalu membuka aplikasi fitur-sembako-gemini pada URL khusus. Generator Promo POP tetap berjalan di aplikasi asal sehingga seluruh fitur yang sudah tersedia—pemilihan produk, tema, diskon, banner, QR code, download PNG, print, dan share WhatsApp—tidak perlu dipindahkan atau ditulis ulang.

> **Hasil akhir:** pengguna membuka `sembakorido`, masuk ke halaman Promo, memilih **Buka Generator Promo POP**, lalu generator dari `fitur-sembako-gemini` terbuka dan langsung menampilkan modal Promo POP.

## 1. Pahami arsitektur integrasi

Alur integrasinya adalah sebagai berikut:

```text
Pengguna
   |
   v
sembakorido/promo.html
   |
   | Klik "Buka Generator Promo POP"
   v
fitur-sembako-gemini/?feature=promo-pop
   |
   v
PromoFlyerModal terbuka otomatis
```

Metode ini berbeda dari integrasi API. Browser tidak mengambil data lintas domain melalui `fetch()`, sehingga tidak memerlukan CORS. Sembakorido hanya membuka aplikasi generator pada tab baru.

| Komponen | Tanggung jawab |
|---|---|
| `sembakorido/promo.html` | Menampilkan tombol launcher kepada pengguna |
| `fitur-sembako-gemini/src/App.tsx` | Mengenali query `feature=promo-pop` |
| `fitur-sembako-gemini/src/components/PromoFlyerModal.tsx` | Menampilkan dan menjalankan Generator Promo POP |
| Cloud Run | Menyajikan aplikasi fitur-sembako-gemini secara online |

## 2. Pastikan repositori tersedia

Clone kedua repositori jika belum tersedia di komputer lokal:

```bash
gh repo clone sihaloho21/sembakorido
gh repo clone sihaloho21/fitur-sembako-gemini
```

Masuk ke folder masing-masing untuk memeriksa branch dan commit terbaru:

```bash
cd fitur-sembako-gemini
git checkout main
git pull origin main

cd ../sembakorido
git checkout main
git pull origin main
```

Commit integrasi launcher yang sudah dibuat adalah:

| Repositori | Commit |
|---|---|
| `fitur-sembako-gemini` | `8d6a71e` — mendukung pembukaan langsung Promo POP |
| `sembakorido` | `f11a2ea` — menambahkan tombol launcher pada halaman promo |

## 3. Tambahkan mode pembukaan otomatis pada fitur-sembako-gemini

Buka file:

```text
fitur-sembako-gemini/src/App.tsx
```

Temukan state modal Promo POP:

```tsx
const [isPromoFlyerOpen, setIsPromoFlyerOpen] = useState<boolean>(false);
```

Ganti dengan initializer yang membaca query URL:

```tsx
const [isPromoFlyerOpen, setIsPromoFlyerOpen] = useState<boolean>(() => {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('feature') === 'promo-pop';
});
```

Dengan perubahan ini, URL berikut akan langsung membuka PromoFlyerModal:

```text
https://paket-sembako-online-943127658752.asia-southeast1.run.app/?feature=promo-pop
```

URL tanpa query tetap membuka halaman utama seperti biasa:

```text
https://paket-sembako-online-943127658752.asia-southeast1.run.app/
```

## 4. Tambahkan tombol di halaman sembakorido

Buka file:

```text
sembakorido/promo.html
```

Pada bagian judul **Catalog Promo POP**, tambahkan link berikut:

```html
<a
  href="https://paket-sembako-online-943127658752.asia-southeast1.run.app/?feature=promo-pop"
  target="_blank"
  rel="noopener noreferrer"
  class="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-red-600 to-orange-500 px-4 py-3 text-sm font-black text-white shadow-md transition hover:from-red-700 hover:to-orange-600 hover:shadow-lg"
>
  <span aria-hidden="true">🔥</span>
  Buka Generator Promo POP
</a>
```

Atribut penting pada link tersebut adalah:

| Atribut | Kegunaan |
|---|---|
| `href` | Menentukan URL aplikasi generator dan query pembuka Promo POP |
| `target="_blank"` | Membuka generator pada tab baru agar halaman sembakorido tetap terbuka |
| `rel="noopener noreferrer"` | Mengisolasi tab baru dari halaman asal |

Jika ingin membuka generator pada tab yang sama, hapus `target="_blank"` dan `rel="noopener noreferrer"`.

## 5. Letakkan tombol di lokasi yang tepat

Lokasi yang direkomendasikan adalah di header section Catalog Promo POP, dekat judul **Promo Produk Aktif**. Dengan posisi tersebut, pengguna dapat membedakan dua fungsi:

| Elemen | Fungsi |
|---|---|
| **Promo Produk Aktif** | Melihat campaign promo yang sedang dipublikasikan |
| **Buka Generator Promo POP** | Membuat dan mengunduh flyer promo baru |

Jangan menaruh generator di dalam `iframe` kecuali benar-benar diperlukan. Membuka aplikasi pada tab baru lebih sederhana, lebih stabil untuk fitur download/print, dan tidak terganggu oleh batasan tampilan embedded.

## 6. Install dan build fitur-sembako-gemini

Masuk ke repositori fitur-sembako-gemini dan pasang dependensi:

```bash
cd fitur-sembako-gemini
pnpm install
```

Jalankan pemeriksaan TypeScript:

```bash
./node_modules/.bin/tsc --noEmit
```

Build frontend:

```bash
./node_modules/.bin/vite build
```

Jika build berhasil, pastikan tidak ada error TypeScript. Peringatan tentang ukuran chunk JavaScript tidak otomatis berarti build gagal.

## 7. Deploy ulang fitur-sembako-gemini ke Cloud Run

Karena URL launcher menunjuk ke Cloud Run, aplikasi harus dideploy ulang setelah perubahan `App.tsx` dibuat. Pastikan server menggunakan port yang diberikan Cloud Run:

```ts
const PORT = Number(process.env.PORT) || 8080;
```

Deploy dari folder repositori:

```bash
gcloud auth login
gcloud config set project PROJECT_ID

gcloud run deploy fitur-sembako-gemini \\
  --source . \\
  --region asia-southeast1 \\
  --platform managed \\
  --allow-unauthenticated \\
  --set-env-vars NODE_ENV=production
```

Ganti `PROJECT_ID` dengan project Google Cloud yang digunakan oleh service tersebut. Gunakan nama service yang sama agar URL Cloud Run tetap menunjuk ke service yang benar.

Setelah deployment selesai, buka URL berikut secara manual:

```text
https://paket-sembako-online-943127658752.asia-southeast1.run.app/?feature=promo-pop
```

Modal Promo POP harus tampil otomatis.

## 8. Deploy perubahan sembakorido

Setelah `promo.html` berisi tombol launcher, deploy sembakorido sesuai platform hosting yang digunakan. Sebelum deploy, validasi link secara lokal:

```bash
cd sembakorido
node --check server.js
grep -Fq 'feature=promo-pop' promo.html
```

Jika sembakorido menggunakan server Node.js, pastikan environment variable port tetap menggunakan port dari platform hosting:

```text
PORT=8080
```

Jika sembakorido juga menggunakan Cloud Run, contoh perintah deploynya:

```bash
gcloud run deploy sembakorido \\
  --source . \\
  --region asia-southeast1 \\
  --platform managed \\
  --allow-unauthenticated
```

## 9. Uji integrasi dari browser

Lakukan pengujian berurutan berikut:

| Langkah | Hasil yang diharapkan |
|---|---|
| Buka halaman `https://DOMAIN-SEMBAKORIDO/promo.html` | Halaman promo tampil normal |
| Temukan tombol **Buka Generator Promo POP** | Tombol terlihat pada section Catalog Promo POP |
| Klik tombol | Tab baru terbuka |
| Periksa URL tab baru | Memiliki query `?feature=promo-pop` |
| Tunggu aplikasi selesai dimuat | Modal Generator Promo POP terbuka otomatis |
| Pilih produk dan ubah diskon | Preview flyer berubah tanpa error |
| Klik Download PNG atau Print | Browser menjalankan proses export/print |
| Kembali ke sembakorido | Halaman awal tetap terbuka di tab sebelumnya |

## 10. Uji otomatis melalui skrip

Repositori sembakorido sudah memiliki skrip pemeriksaan API:

```bash
npm run test:api
```

Skrip tersebut memeriksa upstream API, proxy katalog, dan link Promo POP. Untuk pengujian lokal end-to-end, jalankan server upstream pada port 3100 dan sembakorido pada port 3200, kemudian:

```bash
UPSTREAM_URL=http://127.0.0.1:3100 \\
PROXY_URL=http://127.0.0.1:3200 \\
node scripts/test-api-integration.mjs
```

Hasil yang diharapkan untuk pemeriksaan link adalah:

```text
PASS Promo POP launcher link
```

Perlu diperhatikan bahwa skrip otomatis memeriksa keberadaan link dan endpoint HTTP. Pembukaan modal, download PNG, dan print tetap perlu diuji melalui browser karena bergantung pada interaksi visual dan API browser.

## 11. Troubleshooting

| Masalah | Kemungkinan penyebab | Solusi |
|---|---|---|
| Tombol tidak muncul | File `promo.html` yang dideploy bukan versi terbaru | Pull commit terbaru dan deploy ulang sembakorido |
| Tab baru hanya menampilkan halaman utama | Query `?feature=promo-pop` belum diproses oleh `App.tsx` | Pastikan initializer state PromoFlyerModal sudah diterapkan |
| Modal tidak terbuka pada Cloud Run | Cloud Run masih menjalankan revision lama | Deploy revision baru dan periksa revision aktif |
| URL menghasilkan 404 | Service atau region Cloud Run salah | Gunakan nama service dan region yang benar |
| Produk pada flyer kosong | Data produk belum tersedia pada aplikasi fitur-sembako-gemini | Periksa `src/data/mockData.ts` dan proses `getProducts()` |
| Download/print gagal di iframe | Pembatasan browser pada embedded document | Gunakan `target="_blank"` seperti panduan ini |
| Perubahan tidak terlihat karena cache | Browser atau CDN masih menyimpan halaman lama | Hard refresh, gunakan versi asset baru, atau tunggu cache kadaluarsa |

## 12. Checklist final

Sebelum menyatakan integrasi selesai, pastikan seluruh item berikut terpenuhi:

- [ ] `App.tsx` membaca query `feature=promo-pop`.
- [ ] `PromoFlyerModal` terbuka otomatis pada URL khusus.
- [ ] `promo.html` memiliki tombol **Buka Generator Promo POP**.
- [ ] Tombol mengarah ke URL Cloud Run yang benar.
- [ ] Link menggunakan `target="_blank"` dan `rel="noopener noreferrer"`.
- [ ] Fitur-sembako-gemini sudah dideploy ulang.
- [ ] Sembakorido sudah dideploy ulang.
- [ ] URL Promo POP dapat dibuka dari browser.
- [ ] Generator dapat memilih produk dan mengubah diskon.
- [ ] Download PNG dan print berhasil.
- [ ] `npm run test:api` dijalankan dan hasilnya tercatat.

## Referensi

[1]: https://github.com/sihaloho21/fitur-sembako-gemini "Repositori fitur-sembako-gemini"
[2]: https://github.com/sihaloho21/sembakorido "Repositori sembakorido"
[3]: https://cloud.google.com/run/docs/deploying-source-code "Google Cloud Run: Deploying from source code"
[4]: https://cloud.google.com/run/docs/configuring/services/containers "Google Cloud Run: Configure containers"
