# Laporan Pemeriksaan Adaptasi Catalog Promo POP

**Target:** `sihaloho21/sembakorido`
**Sumber fitur:** `sihaloho21/fitur-sembako-gemini`
**Ruang lingkup:** `🔥 Catalog Promo POP (PRD Flyer)`
**Status:** Analisis selesai; implementasi fitur belum dimulai.

## Ringkasan keputusan

Catalog Promo POP dari repositori sumber **tidak membutuhkan backend promo khusus untuk versi awal**. Fitur generator flyer berjalan di sisi klien: produk dipilih dari katalog yang sudah tersedia, harga promo dihitung di memori, preset disimpan di `localStorage`, lalu flyer diekspor, dicetak, atau dibagikan dari browser [1] [2].

Karena `sembakorido` sudah memiliki pipeline produk berbasis Google Apps Script/Google Sheets melalui `ApiService` dan endpoint `?sheet=products`, penyesuaian utama bukan memindahkan server sumber, melainkan membuat **adapter data produk target ke bentuk `PromoFlyerItem`**. Backend baru hanya diperlukan jika flyer atau campaign harus disimpan, diedit, dan diakses lintas perangkat atau oleh beberapa admin.

> Rekomendasi: mulai dengan generator POP client-side yang menggunakan katalog aktif sembakorido. Jangan menambahkan tabel promo atau mengubah harga dasar produk sebelum alur flyer tervalidasi oleh admin.

## Apa yang benar-benar diimplementasikan di sumber

PRD mendefinisikan generator desktop-publishing untuk flyer retail: pemilihan banyak produk, diskon seragam berbasis persentase atau nominal, custom item, reordering, tema, grid 2/3/4 kolom, badge, banner, watermark, QR, preset, export PNG, print, dan share WhatsApp [1].

Komponen sumber `PromoFlyerModal.tsx` mengimplementasikan pengalaman utama tersebut di frontend. Perhitungan harga promo, pilihan tema, susunan item, preview, QR, export, print, dan share tidak memerlukan request ke endpoint promo. Preset flyer disimpan lokal melalui `localStorage`. `server.ts` pada repositori sumber hanya menyediakan endpoint AI/video; tidak ada endpoint penyimpanan promo flyer, preset, campaign, atau katalog produk yang perlu di-port [2] [3].

## Perbandingan kontrak produk

Komponen sumber menggunakan bentuk data flyer yang relatif kecil. Data katalog sembakorido lebih kaya, sehingga adapter harus memilih harga dan field yang aman untuk dipublikasikan tanpa merusak data checkout.

| Kebutuhan flyer | Sumber `PromoFlyerItem` | Mapping target sembakorido | Keputusan adaptasi |
|---|---|---|---|
| ID produk | `productId` | `productId` hasil normalisasi, fallback `id`/`sku`/`slug` | Gunakan ID stabil yang sama dengan keranjang. |
| Nama | `name` | `nama` | Wajib, dengan fallback aman jika kosong. |
| Kategori | `category` | `category`/`kategori` hasil normalisasi | Gunakan kategori aktif target. |
| Gambar | `image` | `gambar`, ambil URL pertama bila berisi daftar | Sanitasi URL dan sediakan placeholder. |
| Harga normal | `normalPrice` | `harga` atau harga retail target | Jangan gunakan HPP. Harga normal harus harga publik. |
| Harga promo | `promoPrice` | Dihitung client-side dari harga publik | Tidak menulis balik ke `products` pada versi pertama. |
| Unit | `unit` | `satuan`/`unit` | Tampilkan sebagai bagian kartu harga. |
| Badge | `customBadge` | Input admin lokal per item | Tidak perlu kolom produk baru untuk tahap awal. |
| Catatan | `customNotes` | Input admin lokal per item | Cocok untuk “Maks. 2 pcs/transaksi” atau periode. |
| Hero | `isHeroFeatured` | State konfigurasi flyer | Tidak mengubah layout product-grid utama. |
| Tier grosir | `tierNotes` | Turunan dari `grosir`/variasi harga target | Perlu normalisasi eksplisit agar tidak mencampur harga checkout. |

Produk yang digunakan flyer harus berasal dari katalog yang aktif/terlihat. Produk tersembunyi, stok tidak valid, atau produk tanpa ID stabil harus dikeluarkan dari pemilih flyer. Jika harga target memiliki beberapa mode (`harga`, `hargaGajian`, grosir, atau variasi), UI flyer harus memilih satu price mode secara eksplisit agar angka poster tidak ambigu.

## Kondisi backend sembakorido saat ini

Sembakorido mengambil katalog utama dari Google Apps Script melalui `CONFIG.getMainApiUrl()` dan `ApiService`, dengan data produk pada `?sheet=products`. Konfigurasi endpoint saat ini dikelola oleh `config.js` dan dapat berasal dari localStorage atau default API [4] [5].

Sembakorido juga telah memiliki pipeline promo terpisah untuk katalog PDF. `promo_katalog.html` mengambil `?sheet=katalog_promo`, menormalisasi metadata PDF, menampilkan status periode, serta menyediakan preview/download. `admin/katalog-manager.html` melakukan CRUD metadata katalog melalui `GASActions.create/update/delete` dan menerapkan satu katalog unggulan [6] [7].

Pipeline `katalog_promo` **bukan pengganti langsung** untuk flyer POP karena menyimpan metadata file PDF (`pdf_url`), bukan konfigurasi produk, harga promo, tema, grid, dan banner. Namun pola tersebut dapat dijadikan acuan bila nanti flyer perlu dipublikasikan lintas perangkat.

## Rekomendasi arsitektur bertahap

### Tahap 1 — Generator client-side, tanpa perubahan backend

Tambahkan modal atau halaman POP di `sembakorido` yang mengambil `allProducts`/pipeline katalog yang sudah ada. Buat fungsi adapter khusus, misalnya `toPromoFlyerProduct(product)`, lalu biarkan konfigurasi flyer, diskon, badge, tema, dan urutan item tersimpan di state lokal. Tahap ini memenuhi sebagian besar PRD tanpa menambah risiko ke checkout atau kontrak Google Sheets.

Preset tetap disimpan di `localStorage`, tetapi key harus diberi namespace target, misalnya `sembakorido_promo_flyers_v1`, agar tidak bentrok dengan key sumber. Export, print, QR, dan share WhatsApp tetap client-side. URL QR sebaiknya mengarah ke `promo_katalog.html` atau deep-link produk target yang memang tersedia.

### Tahap 2 — Publikasi flyer/campaign melalui backend target

Jika admin membutuhkan akses lintas browser, tambahkan sheet/kontrak baru, bukan memperluas `katalog_promo` secara sembarangan. Bentuk minimal yang disarankan adalah `promo_flyers` untuk metadata dan konfigurasi JSON, atau kombinasi `promo_campaigns` dan `promo_campaign_items` bila data perlu dicari/filter secara server-side.

| Field minimum | Fungsi |
|---|---|
| `id` | Identitas flyer/campaign. |
| `title`, `subtitle`, `period` | Teks header publik. |
| `start_date`, `end_date`, `status` | Status penayangan dan validasi periode. |
| `theme_id`, `columns`, `watermark_text`, `qr_code_url` | Konfigurasi visual. |
| `items_json` atau tabel item terpisah | ID produk, harga promo, badge, catatan, urutan, hero. |
| `banner_config_json` | Banner horizontal/sidebar dan layanan tambahan. |
| `image_url`, `pdf_url` | Artefak hasil render bila disimpan ke storage. |
| `featured`, `created_by`, `updated_at` | Pengelolaan admin dan katalog unggulan. |

Untuk tahap ini, gunakan pola `GASActions` yang sudah dipakai admin katalog. Endpoint harus melakukan validasi ID produk dan status akses, bukan menerima harga dasar/HPP secara buta dari browser. Harga flyer yang sudah dipublikasikan perlu dianggap sebagai snapshot promosi; checkout tetap harus memakai aturan harga resmi target dan tidak boleh mempercayai nilai dari gambar flyer.

### Tahap 3 — Integrasi katalog publik dan badge promo

Setelah campaign tersimpan secara server-side, product-grid dapat mengambil daftar ID campaign aktif dan menampilkan badge `Promo` pada kartu produk. Ini sebaiknya berupa data turunan atau cache ringan, bukan mengubah field harga produk utama setiap kali flyer dibuat. Integrasi AI/rekomendasi dan broadcast WhatsApp dapat dilakukan setelah kontrak campaign stabil.

## Risiko dan guardrail

| Risiko | Guardrail |
|---|---|
| Harga flyer berbeda dari harga checkout | Flyer adalah materi promosi; checkout tetap menghitung harga dari aturan katalog resmi. |
| Produk dihapus setelah flyer dibuat | Simpan snapshot nama/gambar/harga promo atau tampilkan status produk tidak tersedia. |
| URL gambar eksternal gagal saat export | Sanitasi URL, placeholder, dan fallback asset lokal. |
| Preset localStorage hilang/terbatas lintas perangkat | Jelaskan bahwa Tahap 1 bersifat browser-local; gunakan backend pada Tahap 2. |
| HPP atau data internal bocor ke flyer | Adapter hanya mengekspos harga publik, unit, stok/status, dan metadata yang disetujui. |
| Custom item tidak masuk checkout | Tandai custom item sebagai materi promo saja atau buat alur produk manual terpisah. |
| QR mengarah ke halaman yang tidak cocok | Tetapkan URL QR berdasarkan URL publik target dan uji sebelum export. |

## Kesimpulan

Backend sumber `fitur-sembako-gemini` **tidak perlu di-port**. Adaptasi backend yang paling aman untuk `sembakorido` adalah menggunakan API produk yang sudah ada, menambahkan adapter field khusus flyer, dan mempertahankan seluruh perhitungan serta preset pada client-side untuk tahap pertama. Backend baru hanya diperlukan untuk persistence dan publikasi lintas perangkat; bila dibutuhkan, gunakan kontrak campaign baru yang terpisah dari `katalog_promo` PDF dan tidak mengubah harga dasar atau alur checkout.

Belum ada perubahan kode fitur Catalog Promo POP yang diterapkan pada `sembakorido`. Dokumen analisis ini dibuat sebagai dasar implementasi berikutnya.

## References

[1]: https://github.com/sihaloho21/fitur-sembako-gemini/blob/main/PRD_CATALOG_PROMO_POP.md "PRD Catalog Promo POP"

[2]: https://github.com/sihaloho21/fitur-sembako-gemini/blob/main/src/components/PromoFlyerModal.tsx "PromoFlyerModal source component"

[3]: https://github.com/sihaloho21/fitur-sembako-gemini/blob/main/server.ts "Source repository server implementation"

[4]: https://github.com/sihaloho21/sembakorido/blob/main/assets/js/config.js "Sembakorido configuration manager"

[5]: https://github.com/sihaloho21/sembakorido/blob/main/assets/js/api-service.js "Sembakorido API service"

[6]: https://github.com/sihaloho21/sembakorido/blob/main/promo_katalog.html "Sembakorido public promo catalog"

[7]: https://github.com/sihaloho21/sembakorido/blob/main/admin/katalog-manager.html "Sembakorido catalog admin manager"

## Perubahan requirement: admin-only dan publikasi ke `/promo.html`

Dengan requirement terbaru, Catalog Promo POP tidak boleh menjadi fitur pada halaman publik. Generator ditempatkan di area dashboard admin, idealnya sebagai entrypoint baru `admin/promo-flyer.html` atau sebagai section baru pada `admin/index.html`. Menu publik hanya menampilkan hasil campaign yang berstatus aktif di `/promo.html`.

### Kontrol akses admin

Halaman generator harus memanggil `AdminAuth.ensureOrRedirect()` sebelum memuat data atau mengaktifkan aksi simpan/publikasi. Pola autentikasi yang sudah tersedia memeriksa session admin bertanda waktu dan token admin sebelum membiarkan halaman berjalan. Namun perlindungan menu/redirect saja tidak cukup: endpoint backend untuk `create`, `update`, `delete`, dan `publish` wajib memvalidasi token admin di sisi Google Apps Script.

`admin/katalog-manager.html` saat ini memuat `config.js` dan `gas-actions.js`, kemudian menggunakan `GASActions.create/update/delete` untuk operasi admin. Generator POP sebaiknya memakai pola yang sama, tetapi dengan kontrak data campaign flyer terpisah dari sheet `katalog_promo` PDF.

### Alur yang disarankan

1. Admin masuk melalui `/admin/login.html` dan dashboard memvalidasi session/token.
2. Admin membuka menu **Catalog Promo POP** dari `/admin/index.html`.
3. Generator mengambil produk aktif dari `?sheet=products`, memilih produk, menetapkan diskon, badge, tema, banner, periode, dan urutan item.
4. Admin memilih **Simpan Draft**, **Preview**, atau **Publikasikan**.
5. Backend memvalidasi token admin, ID produk, periode, dan field publik; kemudian menyimpan campaign ke kontrak `promo_flyers` atau `promo_campaigns`.
6. `/promo.html` mengambil campaign berstatus `published`/`active` dan merender flyer atau membuka artefak PNG/PDF yang telah dipublikasikan.
7. Checkout tetap memakai pipeline harga resmi `products`; nilai pada flyer tidak pernah menjadi sumber otorisasi harga transaksi.

### Kontrak publik minimal

Agar `/promo.html` dapat menampilkan hasil generator, campaign publik perlu menyimpan setidaknya `id`, `title`, `subtitle`, `start_date`, `end_date`, `status`, `theme_id`, `items`, `banner`, `qr_code_url`, `image_url`, `pdf_url`, `featured`, `created_at`, dan `updated_at`. `items` dapat disimpan sebagai JSON snapshot agar flyer tidak berubah diam-diam ketika nama/gambar produk di katalog berubah. Setiap item sebaiknya menyimpan `product_id`, `name_snapshot`, `image_snapshot`, `normal_price_snapshot`, `promo_price`, `unit`, `badge`, `notes`, `sort_order`, dan `is_hero`.

### Keputusan terhadap `katalog_promo`

Sheet `katalog_promo` yang ada saat ini cocok untuk metadata katalog PDF, tetapi tidak cukup untuk menyimpan konfigurasi flyer POP. Ada dua pilihan. Pilihan yang lebih bersih adalah membuat sheet baru `promo_flyers` untuk campaign POP dan membiarkan `katalog_promo` tetap kompatibel dengan katalog PDF lama. Pilihan kedua adalah memperluas `katalog_promo` dengan kolom `type` dan `config_json`, tetapi ini membutuhkan perubahan normalisasi pada `/promo.html` dan berisiko mencampurkan dua jenis katalog.

Rekomendasi final adalah **sheet baru `promo_flyers`** dengan endpoint publik read-only dan endpoint admin write-protected. `/promo.html` dapat menampilkan campaign PDF lama dan campaign POP melalui dua renderer berdasarkan `type`, atau fokus pada campaign POP setelah migrasi yang disetujui.

### Integrasi dengan `/promo.html`

Halaman `/promo.html` saat ini berfungsi sebagai landing page promo yang menautkan pengguna ke `/promo_katalog.html`; kartu `Promo Produk` masih berstatus “Segera Hadir”. Posisi ini cocok untuk menambahkan kartu atau section **Catalog Promo POP** yang menampilkan campaign POP aktif, sementara generator tetap berada di area `/admin/`.

Agar publik hanya melihat hasil yang sudah disetujui, `/promo.html` sebaiknya memanggil endpoint publik read-only seperti `?sheet=promo_flyers&status=published` atau `?sheet=promo_campaigns&status=active`. Tidak boleh ada token admin, fungsi `GASActions.create/update/delete`, atau konfigurasi draft pada halaman publik. Draft, preview internal, edit, publish, unpublish, dan delete hanya tersedia pada dashboard admin.

Untuk tahap kompatibilitas, `/promo.html` dapat mempertahankan kartu `Promo Katalog` lama dan mengaktifkan kartu `Catalog Promo POP` ketika ada campaign aktif. Bila campaign POP dipublikasikan sebagai `image_url`/`pdf_url`, halaman publik cukup menampilkan thumbnail, periode, badge, tombol lihat, dan tombol download; bila konfigurasi JSON dirender langsung, renderer publik harus membatasi field ke data snapshot yang telah divalidasi backend.

## Kontrak implementasi yang dikonfirmasi

`assets/js/gas-actions.js` mengirim operasi write sebagai `multipart/form-data` dengan field `json`, serta menduplikasi token pada payload dan field `token`/`admin_token`; operasi standar yang tersedia adalah `create`, `update`, dan `delete`. Helper membaca URL admin dari `CONFIG.getAdminApiUrl()` dan token dari storage/session. Modul backend `promo_flyers` harus mempertahankan format request ini agar kompatibel dengan dashboard admin yang sudah ada.

Repositori frontend tidak memiliki satu file `.gs` aktif yang menjadi source-of-truth; implementasi Google Apps Script saat ini dipelihara melalui dokumen migrasi/versi di `docs/`. Modul baru sebaiknya dibuat sebagai file source yang dapat ditempel/deploy ke GAS, disertai kontrak `doGet` publik read-only dan `doPost` admin-only.

## Konfirmasi ruang lingkup implementasi

Catalog Promo POP akan ditempatkan sebagai halaman generator admin-only di `/admin/catalog-promo-pop.html` dan ditautkan dari dashboard admin. Halaman tersebut memakai `AdminAuth.ensureOrRedirect()` serta `GASActions` untuk operasi tulis. Hasil publikasi disimpan sebagai campaign pada sheet `promo_flyers`; `/promo.html` tetap token-free dan hanya membaca campaign aktif/published melalui endpoint publik. Kartu "Promo Produk" yang sebelumnya berstatus "Segera Hadir" menjadi entrypoint/section untuk campaign POP aktif.

Sumber yang dianalisis: `https://github.com/sihaloho21/fitur-sembako-gemini`, khususnya `PRD_CATALOG_PROMO_POP.md`, `src/types.ts`, dan `src/components/PromoFlyerModal.tsx`; target: `https://github.com/sihaloho21/sembakorido`, khususnya `admin/index.html`, `admin/js/admin-auth.js`, `admin/katalog-manager.html`, dan `promo.html`.

## Kontrak implementasi tahap 1

- Backend GAS akan menambah sheet whitelist dan schema `promo_flyers` dengan field campaign, periode, status, tema, banner, item snapshot, dan metadata publikasi.
- Read publik menggunakan action khusus `public_promo_flyers` dan hanya mengembalikan campaign `published`/`active` yang sedang berada pada periode valid.
- Write admin menggunakan `GASActions.create/update/delete` dengan `AdminAuth.ensureOrRedirect()`; token dikirim melalui helper FormData yang sudah ada.
- Generator admin akan mengambil produk melalui endpoint katalog `products` yang sama, menyimpan `items_json` sebagai snapshot agar isi campaign tidak berubah ketika harga produk dasar diperbarui.
- `/promo.html` tetap token-free dan membaca endpoint publik; data tidak boleh membuka token admin atau endpoint write.
