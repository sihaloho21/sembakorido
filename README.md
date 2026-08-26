# sembakorido

![CI](https://github.com/sihaloho21/sembakorido/actions/workflows/ci.yml/badge.svg)

<!-- CSS_SIZE_BADGES_START -->
![Tailwind Raw](https://img.shields.io/badge/Tailwind%20Raw-47.36KB-blue)
![Tailwind Gzip](https://img.shields.io/badge/Tailwind%20Gzip-8.09KB-blue)
![Tailwind Brotli](https://img.shields.io/badge/Tailwind%20Brotli-6.66KB-blue)
<!-- CSS_SIZE_BADGES_END -->

Paket Sembako adalah storefront e-commerce berbasis HTML, Tailwind CSS, dan JavaScript dengan panel admin untuk mengelola katalog, campaign promo, pesanan, notifikasi, referral, serta fitur PayLater. Data dinamis dan autentikasi admin terhubung ke Google Apps Script (GAS), sedangkan state tertentu pada sisi pelanggan disimpan di browser melalui `localStorage`.

## Menjalankan Project Secara Lokal

### Prasyarat

Pastikan perangkat telah memiliki **Node.js 18 atau yang lebih baru**, **npm**, dan **Git**. Python 3 juga dapat digunakan sebagai server file statis alternatif. Versi Node.js dapat diperiksa dengan perintah berikut:

```bash
node --version
npm --version
```

### Instalasi

Clone repository, masuk ke direktori project, kemudian pasang dependency yang tercantum di `package-lock.json`:

```bash
git clone https://github.com/sihaloho21/sembakorido.git
cd sembakorido
npm install
```

Jika repository sudah tersedia secara lokal, cukup jalankan `git pull` lalu `npm install` setelah mengambil perubahan baru.

### Menyalakan Server Lokal

Project ini merupakan static frontend dan tidak menyediakan script `start` khusus. Jalankan server HTTP dari root repository agar halaman, module JavaScript, asset, dan request API bekerja seperti pada deployment:

```bash
npx serve . -l 8000
```

Alternatif tanpa memasang server tambahan adalah menggunakan Python:

```bash
python3 -m http.server 8000
```

Setelah server berjalan, buka URL berikut di browser:

| Halaman | URL lokal |
| --- | --- |
| Website utama | [http://localhost:8000/](http://localhost:8000/) |
| Akun pelanggan | [http://localhost:8000/akun.html](http://localhost:8000/akun.html) |
| Transaksi | [http://localhost:8000/transaksi.html](http://localhost:8000/transaksi.html) |
| Riwayat notifikasi | [http://localhost:8000/notifikasi.html](http://localhost:8000/notifikasi.html) |
| Katalog promo publik | [http://localhost:8000/promo_katalog.html](http://localhost:8000/promo_katalog.html) |
| Login admin | [http://localhost:8000/admin/login.html](http://localhost:8000/admin/login.html) |
| Admin dashboard | [http://localhost:8000/admin/index.html](http://localhost:8000/admin/index.html) |
| Admin Catalog Promo POP | [http://localhost:8000/admin/catalog-promo-pop.html](http://localhost:8000/admin/catalog-promo-pop.html) |

> Jangan membuka halaman menggunakan `file://`. Jalankan server HTTP lokal karena beberapa browser membatasi module JavaScript, request lintas origin, dan asset ketika halaman dibuka langsung dari filesystem.

## Perintah Development

Dependency project dikelola dengan npm. Perintah utama yang tersedia adalah sebagai berikut:

| Perintah | Fungsi |
| --- | --- |
| `npm test` | Menjalankan lint dasar dan pemeriksaan konsistensi Tailwind. |
| `npm run build:tailwind` | Membuat `assets/css/tailwind.min.css`, lalu menjalankan pelaporan ukuran CSS dan pemeriksaan browser. |
| `npm run build:bundle` | Membuat build Tailwind, membundle JavaScript halaman utama dan akun, serta menghasilkan bundle minified. |
| `npm run build:sitemap` | Membuat atau memperbarui sitemap website. |
| `npm run test:paylater` | Menguji logika PayLater. |
| `npm run test:paylater:integration` | Menjalankan pengujian integrasi PayLater dengan backend GAS. |
| `npm run test:gas:auth-referral-security` | Menguji keamanan autentikasi dan referral pada source GAS. |
| `npm run test:api` | Menjalankan pengujian integrasi API. |

Untuk pemeriksaan standar sebelum membuat commit, jalankan:

```bash
npm test
```

Untuk memperbarui asset CSS dan bundle JavaScript setelah mengubah source frontend, jalankan:

```bash
npm run build:bundle
```

## Konfigurasi API

Endpoint default frontend berada di `assets/js/config.js`. Saat aplikasi berjalan, URL API utama dan URL API admin dapat dioverride melalui `localStorage` menggunakan key berikut:

| Konfigurasi | Key `localStorage` |
| --- | --- |
| API utama | `sembako_main_api_url` |
| API admin | `sembako_admin_api_url` |

Perubahan endpoint melalui pengaturan admin akan dipakai oleh request berikutnya pada browser tersebut. Untuk mengembalikan endpoint ke nilai default, hapus key yang sesuai dari `localStorage` atau gunakan fungsi reset yang tersedia pada konfigurasi aplikasi.

> Nilai `ADMIN_TOKEN` adalah kredensial backend dan **tidak boleh** ditulis ke source code, README, commit, atau repository publik. Gunakan token dari deployment GAS yang sesuai hanya pada halaman login admin atau melalui environment variable untuk script pengujian lokal.

## Catalog Promo POP
Builder tersedia di `admin/catalog-promo-pop.html`. Live preview dan export memakai A4 Portrait dengan margin internal 0,4 cm pada keempat sisi; jarak halaman builder pada desktop tetap 3 cm dari sisi kiri dan kanan layar. Pilihan e-wallet PPOB disimpan pada kolom `ppob_wallets_json` di sheet `promo_flyers`, sehingga hanya DANA, GoPay, OVO, ShopeePay, dan LinkAja yang dipilih admin yang dirender. Watermark dapat diaktifkan dan diberi teks khusus dari panel admin, lalu ikut pada preview, print preview, PNG, dan PDF.

Jika spreadsheet yang sudah ada belum memiliki kolom baru tersebut, jalankan `runPromoFlyerSchemaDeployment()` dari `docs/deploy_promo_flyers_schema.gs` pada project Apps Script yang terhubung ke spreadsheet target. Script bersifat idempotent dan hanya menambahkan header yang belum ada.

## Struktur Direktori Utama

| Direktori atau file | Keterangan |
| --- | --- |
| `index.html` | Halaman storefront utama. |
| `akun.html`, `transaksi.html`, `notifikasi.html` | Halaman akun, riwayat transaksi, dan riwayat notifikasi pelanggan. |
| `admin/` | Halaman dan script panel admin, termasuk builder Catalog Promo POP. |
| `assets/css/` | Tailwind source, CSS hasil build, dan style frontend. |
| `assets/js/` | Controller halaman, konfigurasi API, service, dan bundle JavaScript. |
| `docs/` | Dokumentasi dan source Google Apps Script. |
| `scripts/` | Script build, lint, pengujian, bundling, dan utilitas project. |
| `tailwind.config.js` | Konfigurasi Tailwind CSS. |
| `package.json` | Daftar script npm dan dependency development. |

## Alur Pengembangan yang Disarankan

Mulailah dengan menjalankan server lokal dan buka halaman yang sedang dikerjakan melalui `localhost`. Setelah mengubah HTML, CSS, atau JavaScript, refresh browser dan periksa Console serta Network untuk error runtime atau request API yang gagal. Untuk perubahan pada Tailwind atau source JavaScript yang dibundle, jalankan perintah build yang relevan sebelum melakukan pengujian akhir.

Sebelum push, jalankan `npm test`, tinjau `git diff`, dan pastikan tidak ada token, password, data pelanggan, atau credential lain yang ikut berubah. Perubahan pada source GAS perlu diuji terhadap deployment atau spreadsheet yang memang dituju; server static lokal hanya menyajikan frontend dan tidak menggantikan backend GAS.

## Troubleshooting

| Masalah | Solusi |
| --- | --- |
| Browser menampilkan directory listing atau halaman kosong | Pastikan server dijalankan dari root repository, yaitu direktori `sembakorido`. |
| `npm install` gagal | Periksa versi Node.js, hapus `node_modules` dan `package-lock.json` hanya jika diperlukan, lalu jalankan kembali instalasi. |
| CSS perubahan tidak terlihat | Jalankan `npm run build:tailwind` atau `npm run build:bundle`, kemudian lakukan hard refresh pada browser. |
| Data produk atau pesanan tidak muncul | Periksa endpoint pada `assets/js/config.js`, koneksi internet, Console, dan tab Network browser. Backend GAS harus aktif dan dapat diakses. |
| Login admin ditolak | Gunakan `ADMIN_TOKEN` dari deployment GAS yang benar dan pastikan endpoint admin yang digunakan sesuai dengan deployment tersebut. Jangan menaruh token di repository. |
| Halaman admin mengarah kembali ke login | Login admin disimpan sementara pada tab browser. Login ulang setelah membuka tab baru, menghapus storage, atau ketika sesi telah kedaluwarsa. |

## Repository

Source code tersedia di [github.com/sihaloho21/sembakorido](https://github.com/sihaloho21/sembakorido).
