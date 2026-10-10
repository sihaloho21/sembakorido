# Audit Perbaikan Website paketsembako.com

**Tanggal:** 4 Oktober 2026
**Website:** [https://paketsembako.com/](https://paketsembako.com/)
**Repositori:** [https://github.com/sihaloho21/sembakorido](https://github.com/sihaloho21/sembakorido)
**Basis audit:** inspeksi website live, source branch `main`, commit `6c6af508c25326df37139ab96144d1bc45eb4483`, konfigurasi deployment, endpoint publik, dokumentasi proyek, dan test bawaan repository.

Dokumen ini bukan hanya daftar masalah. Isinya adalah **blueprint perbaikan** yang dapat digunakan sebagai backlog engineering, QA, SEO, dan operasional.

## 1. Keputusan dan target perbaikan

### Keputusan saat ini

Website memiliki fitur bisnis yang cukup lengkap, tetapi belum aman untuk menambah fitur baru yang menyentuh checkout, PayLater, data pelanggan, atau admin sebelum blocker P0 ditutup.

### Target setelah perbaikan

Website seharusnya memenuhi kondisi berikut:

- Tidak ada PII pelanggan atau token di repository publik maupun Git history.

- `npm test`, test integrasi, build, dan smoke test production lulus.

- Produk memiliki URL nyata yang dapat dirayapi, bukan URL fragment.

- Halaman produk memiliki metadata SEO dan structured data yang unik.

- Checkout memiliki alur idempotent, konsisten, dan dapat diuji tanpa pembayaran nyata.

- Frontend dan server menggunakan satu arsitektur API yang terdokumentasi.

- Header keamanan minimum tersedia tanpa mematahkan fitur yang sah.

- Performa mobile diukur dengan data nyata, bukan hanya estimasi dokumentasi.

- Modal, form, cart, checkout, dan notifikasi dapat digunakan dengan keyboard dan screen reader.

- Status toko, harga, stok, dan eligibility PayLater berasal dari sumber backend yang authoritative.

## 2. Ringkasan backlog prioritas

| ID | Area | Prioritas | Dampak | Owner yang disarankan | Status awal |
| --- | --- | --- | --- | --- | --- |
| SEC-01 | Data produksi di repository publik | P0 | Kebocoran PII dan pelanggaran privasi | Engineering + owner data | Selesai |
| SEC-02 | Token/credential dalam artefak dokumentasi | P0 | Akses tidak sah ke backend atau sheet | Engineering + owner backend | Terbuka |
| QA-01 | `npm test` gagal | P0 | Quality gate tidak dapat dipercaya | Frontend | Selesai |
| QA-02 | Test integrasi PayLater gagal | P0 | Risiko salah hitung invoice/postmortem | Backend/QA | Selesai |
| OPS-01 | Status toko live sedang tutup | P0 | Checkout tidak menghasilkan pesanan | Operasional | Source diperbaiki; deploy GAS perlu diverifikasi |
| API-01 | Proxy `/api/products` tidak sama dengan deployment | P1 | Arsitektur drift dan debugging sulit | Backend/DevOps | Source diperkeras; deployment proxy live masih terbuka |
| SEO-01 | Sitemap produk menggunakan fragment | P1 | Produk sulit diindeks | SEO/Frontend | Source diperbaiki; deploy dan validasi live masih terbuka |
| SEO-02 | Tidak ada halaman produk dan JSON-LD unik | P1 | Kehilangan trafik long-tail/rich result | SEO/Frontend | Source diperbaiki; validasi live/Search Console masih terbuka |
| SEC-03 | Tidak ada CSP/HSTS/Permissions Policy yang memadai | P1 | Defense-in-depth lemah | DevOps/Security | Header baseline source selesai; observasi CSP live masih terbuka |
| PERF-01 | HTML dan inline CSS terlalu besar | P1 | Initial load dan parsing berat | Frontend | Source diperbaiki; dampak live menunggu deploy |
| PERF-02 | Aset gambar besar | P1 | Pengguna mobile mengunduh terlalu banyak | Frontend/Design | Terbuka |
| UX-01 | Checkout dan status toko perlu fallback | P1 | Konversi dan kejelasan transaksi rendah | Product/Frontend | Terbuka |
| A11Y-01 | Modal, label tombol, dan focus management | P2 | Aksesibilitas rendah dan error penggunaan | Frontend/QA | Terbuka |
| DATA-01 | Validasi harga/stok/idempotency | P1 | Order salah atau duplikat | Backend | Terbuka |
| CI-01 | Secret scan, dependency audit, smoke test | P1 | Regresi dan kebocoran terlambat terdeteksi | DevOps | Terbuka |

## 3. P0 — Perbaikan yang harus dilakukan segera

### SEC-01 — Hapus data pelanggan dari repository dan Git history

**Bukti:** repository melacak file CSV seperti `Paket Sembako - users.csv`, `orders.csv`, `claims.csv`, `user_points.csv`, dan `tukar_poin.csv`. Struktur file menunjukkan adanya data pengguna, nomor telepon, transaksi, dan klaim.

**Risiko:** file publik dapat diunduh tanpa autentikasi. Risiko tetap ada walaupun file dihapus pada commit berikutnya karena data mungkin masih berada di Git history, fork, cache, atau clone lokal.

**Perbaikan teknis:**

1. Bekukan sementara perubahan yang tidak berkaitan dengan incident.

1. Identifikasi seluruh file produksi/PII dengan `git log --all --name-only`.

1. Ganti seluruh data produksi dengan fixture sintetis.

1. Rewrite history dengan `git filter-repo` atau prosedur resmi organisasi.

1. Force-push branch yang relevan setelah persetujuan owner repository.

1. Minta penghapusan clone/backup yang tidak diperlukan.

1. Jika ada data pelanggan nyata, dokumentasikan incident dan lakukan rotasi akses sesuai kebijakan internal.

1. Tambahkan `.gitignore` untuk export CSV, `.env`, backup, dan file hasil run.

**Acceptance criteria:**

- `git grep` dan `git log -S` tidak menemukan data pelanggan pada branch publik.

- Repository hanya berisi fixture sintetis.

- Ada CI check yang gagal jika file baru memiliki pola PII.

- File export produksi tidak dapat dibuat di root repository secara tidak sengaja.

### SEC-02 — Rotasi credential dan bersihkan artefak token

**Bukti:** terdapat file bernama `docs/run_sheet_stage1_3_2026-02-14_token_provided.json` dan variannya.

**Perbaikan teknis:**

- Perlakukan semua token yang pernah tersimpan di artefak tersebut sebagai compromised.

- Revoke dan generate token baru di backend terkait.

- Audit access log untuk penggunaan token lama.

- Pindahkan secret ke secret manager/environment variable.

- Jangan menyimpan token dalam screenshot, JSON hasil run, dokumentasi, issue, atau commit.

- Tambahkan secret scanner di pre-commit dan CI.

**Status implementasi:** Repository dan history publik sudah dibersihkan dari artefak token. Sensitive-file scan sudah menjadi gate CI dan runbook rotasi tersedia di [`docs/SECURITY_CREDENTIAL_ROTATION.md`](SECURITY_CREDENTIAL_ROTATION.md). Rotasi/revoke credential di layanan eksternal masih menunggu tindakan owner layanan.

**Acceptance criteria:**

- Token lama tidak valid.

- Tidak ada credential aktif di seluruh Git history publik.

- Test lokal menerima token melalui environment variable.

- Log test otomatis melakukan redaction terhadap token, nomor telepon, email, dan ID pengguna.

**Evidence repository:** commit `c003efc` membersihkan artefak produksi/token dari history, dan commit berikutnya mempertahankan `npm run test:sensitive-files` sebagai gate CI. Acceptance terakhir—token lama ditolak dan access log layanan eksternal ditinjau—belum dapat diverifikasi dari repository.

### QA-01 — Pulihkan `npm test`

**Temuan saat audit:**

- `admin/js/admin-script.js:3219`: `innerHTML` template tanpa `escapeHtml`.

- `assets/js/akun.js:617`: `innerHTML` template tanpa `escapeHtml`.

- `index.html:4592`: inline `onclick`.

- `promo_katalog.html`: dua pola duplicate id.

**Perbaikan teknis:**

- Gunakan `textContent` untuk teks biasa.

- Untuk template HTML yang memang diperlukan, gunakan sanitizer terpusat dan escape setiap nilai API.

- Pindahkan inline `onclick` ke `addEventListener`.

- Pastikan setiap komponen promo menggunakan ID deterministik dan unik.

- Tambahkan unit test untuk nilai dengan karakter `<`, `>`, `&`, kutip, URL berbahaya, dan input kosong.

**Acceptance criteria:**

```bash
npm test
```

harus selesai dengan exit code `0`, tanpa warning lint yang ditoleransi secara diam-diam.

### QA-02 — Perbaiki test integrasi PayLater

**Temuan:** `npm run test:paylater:integration` gagal dengan pesan `Invoice total window harus 4` pada `scripts/test-paylater-gas-integration.js:661`.

**Kemungkinan sumber masalah:**

- Fixture tanggal tidak deterministik.

- Kontrak `invoice total window` berubah, tetapi test tidak diperbarui.

- Filter tanggal menggunakan timezone yang berbeda.

- Field invoice yang dihitung berbeda antara source GAS dan test.

- Data fixture mengandung invoice duplikat atau status yang tidak diperhitungkan.

**Perbaikan teknis:**

1. Pisahkan fixture dari tanggal sistem.

1. Inject `now` atau gunakan fixed clock.

1. Dokumentasikan definisi window: inclusive/exclusive, timezone, status invoice, dan field tanggal.

1. Tambahkan assertion intermediate: jumlah invoice scanned, eligible, excluded, dan alasan exclude.

1. Uji boundary: tepat di awal window, tepat di akhir window, satu detik di luar window, timezone Asia/Jakarta, dan invoice tanpa due date.

1. Jangan mengubah expected `4` tanpa memastikan kontrak bisnisnya.

**Acceptance criteria:**

```bash
npm run test:paylater
npm run test:paylater:integration
npm run test:gas:auth-referral-security
```

semuanya lulus pada mesin CI dan lokal.

### OPS-01 — Verifikasi status toko live

Saat audit, website menampilkan **“Toko Sedang Tutup”** dan menyatakan bahwa pesanan baru diproses setelah toko kembali beroperasi.

**Perbaikan produk:**

- Pastikan status ini memang disengaja.

- Bila toko tutup sementara, tampilkan jam buka berikutnya dan alasan singkat.

- Sediakan CTA “Ingatkan saya saat toko buka” atau kontak WhatsApp.

- [x] Status operasional dibaca dari endpoint `public_store_status` berbasis sheet `settings`; `localStorage` hanya menjadi fallback last-known saat API gagal.

- [x] Admin menulis `store_closed` melalui `GASActions.upsertSetting`; audit log deployment/backend tetap perlu dikonfirmasi di layanan GAS.

**Acceptance criteria:**

- Status di browser baru, perangkat berbeda, dan setelah cache dibersihkan sama.

- Saat toko buka, add-to-cart dan checkout dapat digunakan tanpa hard refresh khusus.

- Saat toko tutup, pesan pengguna konsisten di katalog, product detail, cart, dan checkout.

**Status implementasi 5 Oktober 2026:** Source frontend, admin, dan GAS v63 sudah diubah ke backend-first. Panduan deployment dan evidence tersedia di [`docs/OPS-01_DEPLOYMENT_VERIFICATION.md`](OPS-01_DEPLOYMENT_VERIFICATION.md). Deployment GAS v63 dan verifikasi dua browser/device masih diperlukan sebelum OPS-01 ditutup penuh.

## 4. P1 — Perbaikan arsitektur dan discoverability

### API-01 — Pilih satu arsitektur API

Source `server.js` menyediakan route `/api/products` sebagai proxy same-origin. Namun endpoint live `https://paketsembako.com/api/products` mengembalikan `404`, sedangkan frontend mengonfigurasi Google Apps Script sebagai `MAIN_API` dan `ADMIN_API`. Keputusan API-01 saat ini adalah mempertahankan GAS-direct sebagai arsitektur production sampai service Node proxy benar-benar dideploy; proxy tidak boleh dianggap live hanya karena route tersedia di source.

**Masalah:** terdapat dua pola yang tidak jelas:

- browser → `/api/products` → server → upstream; atau

- browser → Google Apps Script secara langsung.

**Rekomendasi utama:** gunakan proxy same-origin untuk operasi publik yang dapat diproxy dengan aman. Ini memudahkan CORS, observability, rate limit, dan pemindahan provider backend.

**Perubahan yang diperlukan:**

- Pastikan deployment menjalankan `node server.js` jika route proxy dipilih.

- Ubah frontend agar menggunakan `/api/products` dan endpoint same-origin lain yang relevan.

- Tambahkan timeout, retry terbatas, cache response, dan error schema yang konsisten.

- Jangan proxy operasi admin tanpa autentikasi dan audit log yang kuat.

- Jika GAS direct dipertahankan, hapus route proxy yang tidak digunakan atau beri dokumentasi bahwa route hanya untuk deployment tertentu.

**Acceptance criteria:**

- `/api/products` mengembalikan JSON valid pada staging dan production.

- CORS tidak diperlukan untuk request browser utama.

- Error upstream menghasilkan status dan payload yang terdokumentasi.

- Monitoring dapat membedakan error frontend, proxy, dan upstream.

**Status implementasi 7 Oktober 2026:** Proxy source sudah diperkeras dengan timeout 10 detik, cache 60 detik, dan error schema `CATALOG_UPSTREAM_ERROR`, `CATALOG_UPSTREAM_TIMEOUT`, atau `CATALOG_API_UNAVAILABLE`. Smoke test lokal membuktikan contract error berjalan, tetapi upstream katalog yang dikonfigurasi mengembalikan HTTP `404`; deployment `/api/products` live dan migrasi frontend belum dilakukan. Endpoint upstream resmi harus dikonfirmasi terlebih dahulu, bukan ditebak dari route lama.

### SEO-01 — Ganti sitemap fragment dengan URL produk nyata

**Masalah:** `sitemap-products.xml` menggunakan URL seperti `/#produk-minyak-kita-1l-2l`. Google Search menyatakan fragment umumnya tidak digunakan untuk mengubah konten halaman.

**Rekomendasi route:**

```
/produk/minyak-kita-1l-2l
/produk/gula-pasir-curah-1-kg
/produk/beras-slyp-super-cap-ketupat
```

**Perubahan:**

- Tambahkan `slug` stabil di data produk.

- Buat route server atau file prerender per produk.

- Redirect slug lama jika sudah pernah dipublikasikan.

- Jangan memasukkan route akun, transaksi, notifikasi, atau checkout ke sitemap publik.

- Generate sitemap dari data produk yang berstatus aktif dan memiliki canonical URL.
- Generate halaman statis `produk/<slug>/index.html` dari sumber katalog non-PII yang sama agar URL dapat dibuka tanpa `localStorage`.

**Acceptance criteria:**

- Setiap URL produk menghasilkan halaman HTTP 200 yang bermakna tanpa mengharuskan klik dari halaman utama.

- HTML response sudah memuat nama produk, harga, gambar, stok, dan deskripsi dasar.

- Sitemap tidak mengandung URL fragment.

- URL produk aktif tidak memerlukan `localStorage` untuk menampilkan konten utama.

**Status implementasi 7 Oktober 2026:** Generator sitemap sekarang menghasilkan URL `/produk/<slug>/` tanpa fragment dan membuat halaman statis produk dengan title, description, canonical, Open Graph, dan konten produk dasar. Route live dan validasi Google Search Console masih perlu dilakukan setelah deploy.

### SEO-02 — Tambahkan metadata produk dan structured data

Untuk setiap halaman produk, sediakan:

- `<title>` unik.

- Meta description unik.

- Canonical absolut.

- Open Graph dan Twitter image absolut HTTPS.

- `Product` JSON-LD.

- `Offer` dengan currency `IDR`, price, availability, dan URL.

- `BreadcrumbList`.

- `Organization`/`LocalBusiness` pada halaman utama.

- Informasi varian yang tidak membingungkan crawler.

**Acceptance criteria:**

- Validasi structured data tidak menghasilkan error wajib.

- Tidak ada harga palsu atau harga checkout yang berbeda tanpa penjelasan.

- Produk habis stok menampilkan `OutOfStock` atau status yang sesuai.

**Status implementasi 10 Oktober 2026:** Halaman produk statis sekarang memiliki metadata unik, URL gambar absolut HTTPS, Product JSON-LD dengan Offer IDR dan availability, BreadcrumbList, serta daftar varian yang konsisten dengan katalog. Homepage memiliki Organization JSON-LD dengan logo dan kontak publik. Regression test `npm run test:seo` memeriksa seluruh 15 halaman produk. Validasi Rich Results/Search Console dan deployment live masih perlu dilakukan.

## 5. P1 — Keamanan aplikasi dan backend

### SEC-03 — Tambahkan security headers secara bertahap

Header yang sudah terlihat live: `X-Content-Type-Options`, `X-Frame-Options`, dan `Referrer-Policy`. Header penting yang belum tampak pada respons utama: CSP, HSTS, dan Permissions Policy.

Karena halaman masih memiliki inline CSS/JS dan event handler, jangan langsung memasang CSP ketat di production tanpa mode observasi.

**Tahapan:**

1. Tambahkan `Content-Security-Policy-Report-Only`.

1. Kumpulkan violation dari halaman utama, akun, admin, dan checkout.

1. Pindahkan inline handler dan inline script yang tidak perlu.

1. Gunakan nonce/hash untuk inline yang memang dibutuhkan.

1. Enforce CSP.

1. Tambahkan `Strict-Transport-Security` setelah seluruh domain/subdomain siap HTTPS.

1. Tambahkan `Permissions-Policy` untuk camera, microphone, geolocation, payment, dan fitur lain sesuai kebutuhan aktual.

**Status implementasi 10 Oktober 2026:** Header baseline sekarang dipasang pada server Node dan `netlify.toml`: CSP masih `Content-Security-Policy-Report-Only` karena source memakai inline CSS/JS dan alur GAS/WhatsApp perlu diobservasi; HSTS `max-age=31536000` dan Permissions Policy sudah diterapkan. Policy mematikan object embed, camera, microphone, payment, serta membatasi geolocation, clipboard, dan fullscreen ke origin sendiri. Pemeriksaan otomatis `npm run test:security-headers` memvalidasi response runtime dan konfigurasi Netlify. Tahap tersisa: kumpulkan violation CSP di halaman utama, akun, admin, dan checkout; kemudian migrasikan inline code ke nonce/hash atau file eksternal sebelum enforcement CSP.

**Acceptance criteria:**

- Tidak ada inline script tidak dikenal yang dapat dieksekusi.

- External origin yang diizinkan hanya domain yang dibutuhkan.

- Checkout, QRIS, WhatsApp, ImageKit, GAS/proxy, dan admin tetap berfungsi sesuai desain.

- CSP violation rate turun ke nol untuk flow normal.

### SEC-04 — Audit semua input-output DOM

Target awal:

- `admin/js/admin-script.js:3219`.

- `assets/js/akun.js:617`.

- `index.html` dan `promo_katalog.html` yang membentuk kartu, badge, promo, dan modal.

**Aturan implementasi:**

- Teks dari API → `textContent`.

- Atribut URL → validasi protocol dan host sebelum `setAttribute`.

- HTML kaya → sanitizer yang teruji.

- Jangan menaruh data pengguna mentah ke template literal HTML.

- Validasi juga data dari `localStorage`, query string, dan parameter WhatsApp.

### DATA-01 — Jadikan backend authoritative untuk harga dan order

Frontend boleh menampilkan kalkulasi awal, tetapi backend harus menghitung ulang:

- harga produk dan varian;

- tiered pricing;

- diskon bundle;

- biaya kemasan;

- ongkos kirim;

- reward points;

- fee dan penalty PayLater;

- total invoice;

- ketersediaan stok;

- status toko.

**Acceptance criteria:**

- Harga yang dikirim client tidak dapat menggantikan harga backend.

- Order dengan harga lama ditolak atau direkalkulasi dengan pesan jelas.

- Submit checkout dua kali menghasilkan satu order melalui idempotency key.

- Order memiliki audit trail perubahan status.

- Pengguna tidak dapat mengubah nominal pembayaran melalui DevTools.

## 6. P1 — Performa dan reliability frontend

### PERF-01 — Kurangi initial HTML dan inline CSS

Pengukuran source menunjukkan:

- `index.html` sekitar 275 KB.

- Inline CSS sekitar 109 KB.

- Inline JS sekitar 11,7 KB.

- Banyak modal dan state checkout berada dalam satu dokumen awal.

**Perbaikan:**

- Pindahkan style komponen ke file CSS yang dapat di-cache.

- Pertahankan hanya critical CSS minimal untuk first viewport.

- Render modal berat ketika dibutuhkan.

- Pecah shell katalog, akun, checkout, dan admin menjadi route/bundle yang lebih terisolasi.

- Hapus CSS duplikat dan selector yang tidak terpakai.

- Pastikan `tailwind-fallback.css` tidak ikut mengirim rule yang juga ada di `tailwind.min.css` tanpa kebutuhan browser yang jelas.

**Status implementasi 10 Oktober 2026:** Inline CSS pada `index.html`, `akun.html`, dan `promo_katalog.html` dipindahkan ke tiga asset CSS minified yang dapat di-cache. Total HTML ketiga halaman turun dari 489.570 byte menjadi 324.950 byte (-164.620 byte / -33,6%); inline CSS turun dari 164.760 karakter menjadi 0. Detail audit sebelum/sesudah ada di [`docs/PERFORMANCE_AUDIT_2026-10-10.md`](PERFORMANCE_AUDIT_2026-10-10.md). Hasil live baru dapat diukur ulang setelah deployment commit ini.

### PERF-02 — Optimalkan gambar

`logo.png` sekitar 1 MB; repository juga memiliki GIF besar dan beberapa katalog PDF.

**Perbaikan:**

- Buat versi WebP/AVIF.

- Gunakan `srcset` dan `sizes`.

- Berikan `width` dan `height` agar layout tidak bergeser.

- Gunakan `loading="lazy"` untuk gambar di bawah fold.

- Gunakan `fetchpriority="high"` hanya untuk hero image yang benar-benar LCP.

- Jangan memuat PDF/katalog sampai pengguna meminta preview/download.

- Audit apakah logo dirujuk dua kali dan apakah salah satu referensi dapat dihapus.

### PERF-03 — Kurangi API request dan tambah observability

`ApiService` sudah memiliki cache dan request deduplication, tetapi perlu dibuktikan dengan telemetry nyata.

Tambahkan metrik:

- jumlah request per page view;

- cache hit/miss;

- waktu response upstream;

- error rate per endpoint;

- retry count;

- abandoned checkout;

- waktu dari page load ke katalog siap.

**Acceptance criteria:**

- Katalog tidak melakukan request yang sama berulang tanpa alasan.

- Retry tidak menggandakan operasi tulis.

- Error API memiliki pesan pengguna dan correlation ID untuk admin.

## 7. P2 — UX, accessibility, dan conversion

### A11Y-01 — Perbaiki label dan focus management

Audit statis menemukan 4 button yang tidak memiliki teks, `aria-label`, atau `title` yang terdeteksi.

**Checklist:**

- Setiap icon-only button memiliki `aria-label`.

- Modal memakai `role="dialog"`, `aria-modal="true"`, dan label.

- Fokus masuk ke modal dan kembali ke trigger saat modal ditutup.

- Escape menutup modal bila aman.

- Background modal tidak dapat menerima fokus.

- Toast dan status loading memakai `aria-live` yang tepat.

- Field error terhubung dengan field melalui `aria-describedby`.

- Tombol disabled memiliki alasan yang terlihat, bukan hanya warna.

- Kontras badge diskon, stok, dan status toko memenuhi WCAG AA.

### UX-01 — Buat checkout lebih transparan

Checkout saat ini memuat banyak pilihan: COD, QRIS, bayar gajian, dan PayLater. Ini kuat sebagai fitur, tetapi berpotensi membebani pengguna.

**Perbaikan:**

- Urutkan metode pembayaran berdasarkan eligibility dan kebiasaan pengguna.

- Jelaskan fee PayLater sebelum pengguna memilihnya.

- Tampilkan ringkasan harga tetap di semua tahap.

- Bedakan `estimasi`, `terverifikasi`, dan `final`.

- Tampilkan alasan ketika PayLater tidak eligible.

- Berikan progress checkout yang jelas.

- Jangan meminta nomor WhatsApp berulang jika sudah tersedia di akun.

- Sediakan recovery bila pengguna kembali dari WhatsApp atau QRIS.

### UX-02 — Tingkatkan trust

Tambahkan informasi yang mudah ditemukan:

- area layanan yang benar-benar tersedia;

- estimasi pengiriman berdasarkan lokasi;

- jam operasional;

- kebijakan retur dan kerusakan;

- kontak WhatsApp yang konsisten;

- alamat pickup dan tautan peta;

- review atau bukti transaksi yang tidak dibuat-buat;

- tanggal pembaruan harga/stok.

## 8. CI/CD dan quality assurance

### CI-01 — Pipeline minimum

Pipeline pull request sebaiknya menjalankan:

```bash
npm ci
npm test
npm run build:tailwind
npm run build:sitemap
npm run test:paylater
npm run test:paylater:integration
npm run test:gas:auth-referral-security
```

Tambahkan:

- secret scan;

- PII scan;

- dependency vulnerability scan;

- HTML validation;

- duplicate ID check;

- accessibility smoke check;

- bundle size budget;

- link checker;

- preview deployment.

### Test matrix minimum

| Flow | Desktop | Mobile | Guest | Login | Toko buka | Toko tutup |
| --- | --- | --- | --- | --- | --- | --- |
| Browse katalog | Ya | Ya | Ya | Ya | Ya | Ya |
| Search dan filter | Ya | Ya | Ya | Ya | Ya | Ya |
| Detail produk/varian | Ya | Ya | Ya | Ya | Ya | Ya |
| Add/update cart | Ya | Ya | Ya | Ya | Ya | Ya |
| Checkout COD | Ya | Ya | Ya | Ya | Ya | Ya |
| QRIS | Ya | Ya | Ya | Ya | Ya | Ya |
| Bayar gajian | Ya | Ya | Terbatas | Ya | Ya | Ya |
| PayLater | Ya | Ya | Terbatas | Ya | Ya | Ya |
| Reward points | Ya | Ya | Tidak | Ya | Ya | Ya |
| Riwayat transaksi | Ya | Ya | Tidak | Ya | Ya | Ya |
| Logout/session expiry | Ya | Ya | Tidak | Ya | Ya | Ya |

### Smoke test production

Setelah deploy, jalankan test read-only dan order dummy yang aman:

1. Buka homepage tanpa cache.

1. Pastikan katalog muncul.

1. Cari satu produk.

1. Buka detail dan pilih varian.

1. Tambah ke cart.

1. Ubah quantity.

1. Cek total.

1. Uji modal checkout tanpa mengirim pembayaran.

1. Verifikasi status error API dengan mematikan upstream di staging.

1. Uji status toko tutup dan toko buka.

1. Pastikan admin route tetap `noindex` dan tidak bocor ke sitemap.

## 9. Urutan implementasi yang disarankan

### Sprint 1 — Stabilitas dan keamanan

- SEC-01: bersihkan PII dari repo/history.

- SEC-02: rotasi token.

- QA-01: perbaiki lint.

- QA-02: perbaiki test PayLater.

- OPS-01: verifikasi status toko.

- CI-01: jadikan test gate required.

**Gate Sprint 1:** tidak ada P0 terbuka, test utama lulus, token lama tidak valid.

### Sprint 2 — API, checkout, dan data integrity

- API-01: putuskan arsitektur proxy/direct GAS.

- DATA-01: backend recalculation dan idempotency.

- UX-01: perbaiki ringkasan checkout dan eligibility.

- Smoke test production dan staging.

**Gate Sprint 2:** order dummy konsisten, tidak ada double-submit, endpoint terdokumentasi.

### Sprint 3 — SEO dan discoverability

- SEO-01: route produk nyata.

- SEO-02: metadata dan JSON-LD.

- Sitemap generator baru.

- Redirect/canonical dan link internal.

**Gate Sprint 3:** produk dapat dibuka lewat URL langsung, sitemap valid, structured data valid.

### Sprint 4 — Performa dan accessibility

- PERF-01 dan PERF-02.

- PERF-03 telemetry.

- A11Y-01 keyboard/screen-reader pass.

- Lighthouse/WebPageTest baseline dan regression budget.

**Gate Sprint 4:** tidak ada critical accessibility error, bundle budget lulus, Core Web Vitals terukur.

## 10. Definition of Done keseluruhan

Perbaikan dianggap selesai bila:

- [x] Tidak ada PII/token produksi di repository atau history publik.

- [ ] Semua secret aktif disimpan di secret manager/environment variable.

- [x] `npm test` lulus.

- [x] Test PayLater lulus secara deterministik.

- [ ] Build dan sitemap berhasil dibuat dari source yang sama dengan deployment.

- [ ] `/api/products` atau arsitektur API pilihan tersedia dan terdokumentasi.

- [ ] Produk memiliki URL crawlable individual.

- [ ] JSON-LD produk tervalidasi.

- [ ] Harga/order dihitung ulang backend.

- [ ] Checkout idempotent dan diuji untuk double-submit.

- [ ] CSP report-only kemudian enforce tanpa violation normal.

- [ ] HSTS dan Permissions Policy terpasang sesuai kebutuhan.

- [ ] Gambar besar sudah dioptimalkan.

- [ ] Keyboard navigation dan screen reader smoke test lulus.

- [ ] Production smoke test memiliki evidence tanggal, commit, dan hasil.

- [ ] Monitoring tersedia untuk API error, checkout failure, dan perubahan status toko.

## 11. Prioritas paling praktis

Jika hanya ada waktu untuk lima pekerjaan, lakukan dalam urutan ini:

1. **Hapus PII dan token dari repository serta rotasi credential.**

1. **Perbaiki ****`npm test`**** dan test integrasi PayLater.**

1. **Verifikasi status toko dan checkout live.**

1. **Selaraskan API production dengan source.**

1. **Ganti sitemap fragment dengan halaman produk crawlable.**

Perbaikan SEO, performa, dan accessibility tetap penting, tetapi tidak boleh menutupi risiko keamanan dan ketidakpastian transaksi yang ada sekarang.

## Referensi

[1]: https://paketsembako.com/ "Website publik Paket Sembako"

[2]: https://github.com/sihaloho21/sembakorido "Repository GitHub sihaloho21/sembakorido"

[3]: https://developers.google.com/search/docs/crawling-indexing/url-structure "Google Search Central: URL structure best practices"

[4]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP "MDN: Content Security Policy"
