# Pengujian Pohon Kategori 3 Tingkat dan Persiapan Cutover

Dokumen ini menjelaskan bukti pengujian storefront yang sudah dijalankan serta prosedur persiapan cutover data kategori. Dokumen ini **bukan** otorisasi untuk menulis spreadsheet produksi.

## 1. Unit test yang sudah dijalankan

Test utama berada di `tests/category_tree_test.js` dan dijalankan dengan:

```bash
npm run test:category-tree
```

Implementasi yang diuji berada di `assets/js/category-tree.js`. Test menjalankan modul secara terisolasi menggunakan Node.js `vm`, sehingga tidak membutuhkan browser, API GAS, atau spreadsheet produksi.

### Skenario yang diverifikasi

1. **Normalisasi tiga level**
   Dataset uji membuat kategori utama `Dapur & Bahan`, subkategori `Minyak`, dan sub-subkategori `Minyak Sawit`. Relasi ditentukan oleh `parent_id`. Test memastikan kategori level 3 menghasilkan path:
   `Dapur & Bahan › Minyak › Minyak Sawit`.

2. **Daftar anak langsung**
   `childrenOf(categories, 'root')` harus mengembalikan `Minyak`, tetapi tidak langsung mengembalikan `Minyak Sawit`. Ini memastikan relasi parent-child tidak diratakan secara keliru.

3. **Cakupan descendant**
   `scopeIds()` untuk kategori `Minyak` harus menghasilkan ID `oil` dan `palm`. Dengan demikian, kategori level 1/2 dapat mencakup produk langsung dan seluruh descendant, sedangkan kategori level 3 hanya memiliki dirinya sendiri.

4. **Status aktif**
   Kategori `Lama` dibuat nonaktif. Kategori tersebut tidak muncul sebagai anak aktif dan tidak masuk ke cakupan produk aktif.

5. **Produk dengan `kategori_id`**
   Produk langsung dengan `kategori_id=oil` dan produk turunan dengan `kategori_id=palm` harus masuk ketika cakupan aktif adalah `Minyak`.

6. **Kompatibilitas kategori teks lama**
   Produk lama tanpa `kategori_id`, tetapi memiliki `kategori: Minyak Sawit`, tetap dapat ditemukan melalui pencocokan nama kategori selama nama tersebut berada di cakupan aktif.

7. **Deduplikasi produk**
   Baris produk duplikat dengan ID yang sama hanya dihitung satu kali. Ini memastikan count kategori tidak menghitung baris spreadsheet, varian, atau unit stok sebagai produk terpisah.

8. **Resolusi route**
   `findCategory()` dapat menemukan kategori level 3 melalui slug dan path yang dikirim pada URL. ID kategori juga digunakan oleh URL baru untuk menghindari ambiguitas nama yang sama di cabang berbeda.

### Test regresi terkait

Selain unit test tree, validasi yang dijalankan:

```bash
npm run test:category-showcase
npm run test:category-view-all
npm test
```

`npm test` terakhir lulus, termasuk lint dasar, pemeriksaan Tailwind, showcase, view-all, category tree, kartu produk, disclosure produk, maintenance mode, SEO, security headers, image performance, dan regresi backend promo publik.

### Batasan test saat ini

Unit test tidak membuktikan isi spreadsheet produksi dan tidak melakukan request ke endpoint produksi. Validasi produksi tetap harus dilakukan melalui preview read-only terhadap target spreadsheet yang benar, lalu ditinjau sebelum apply.

## 2. Persiapan cutover data produksi

### Tahap A — Bekukan scope dan akses

- Tetapkan spreadsheet produksi, deployment GAS, dan versi kode yang menjadi target.
- Pastikan hanya akun Admin yang dapat menjalankan preview/apply.
- Jangan mengubah `category_showcase_config` selama proses migrasi.
- Siapkan jendela maintenance atau prosedur komunikasi jika perubahan kategori dapat memengaruhi admin yang sedang mengedit produk.

### Tahap B — Jalankan preview read-only

Preview harus membaca `categories` dan `products` tanpa menulis apa pun. Simpan hasil preview sebagai artefak review dengan timestamp dan identitas spreadsheet. Preview minimal harus memuat:

- jumlah kategori dan produk;
- kategori tanpa ID;
- kategori akar yang dipertahankan;
- pasangan produk-kategori yang cocok secara unik;
- nilai `kategori` yang tidak cocok;
- nama kategori ambigu setelah normalisasi spasi dan kapitalisasi;
- produk tanpa `kategori_id` yang masih perlu dipetakan;
- jumlah produk per kategori utama dan descendant;
- status `ready` atau `blocked` untuk cutover.

Cutover wajib `blocked` jika ada produk tidak cocok, kandidat ganda, kategori tanpa ID yang dipakai produk, atau struktur parent yang tidak valid.

### Tahap C — Review dan rekonsiliasi

- Cocokkan jumlah produk sumber dengan jumlah produk yang dapat dipetakan.
- Tinjau setiap exception satu per satu; jangan menebak kategori yang ambigu.
- Pastikan kategori lama menjadi akar dan field lama `kategori` tetap dipertahankan.
- Pastikan level maksimum adalah tiga dan tidak ada siklus parent.
- Pastikan kategori nonaktif tidak dipakai sebagai tujuan baru.
- Pastikan showcase berbasis ID tetap menunjuk ke kategori level 2 yang aktif.

### Tahap D — Backup dan rencana pemulihan

Sebelum apply, buat backup immutable untuk `categories` dan `products`, termasuk header dan seluruh baris. Catat:

- waktu backup;
- spreadsheet dan sheet target;
- hash atau identitas file backup;
- jumlah baris tiap sheet;
- operator yang melakukan backup;
- prosedur restore dan siapa yang berwenang menjalankannya.

Apply harus idempotent, menggunakan lock, dan gagal sebelum penulisan jika backup tidak berhasil.

### Tahap E — Otorisasi eksplisit

Minta persetujuan eksplisit setelah preview dan backup ditinjau. Persetujuan harus menyebut target spreadsheet, hasil preview, dan bahwa tindakan yang diizinkan adalah **apply migrasi kategori**. Tanpa persetujuan tersebut, hanya preview, review, dan perubahan kode yang boleh dilakukan.

### Tahap F — Apply terkontrol

Saat sudah diotorisasi:

1. ambil lock;
2. verifikasi ulang revision/versi target;
3. buat backup atau pastikan backup yang sesuai masih valid;
4. tambahkan header yang belum ada tanpa memindahkan atau menghapus header lama;
5. isi `parent_id`, `sort_order`, `is_active`, dan `kategori_id` hanya sesuai mapping yang sudah disetujui;
6. pertahankan `kategori` teks lama;
7. jangan mengubah `category_showcase_config`;
8. tulis dalam operasi idempotent;
9. lepaskan lock hanya setelah verifikasi selesai.

Jika revision berubah sejak preview, apply harus berhenti dan meminta preview ulang.

### Tahap G — Verifikasi pasca-apply

Jalankan preview ulang dan bandingkan dengan snapshot sebelum apply. Verifikasi minimal:

- tidak ada produk yang hilang;
- semua produk lama memiliki mapping yang disetujui;
- jumlah produk per kategori akar cocok dengan baseline;
- produk langsung dan descendant muncul di storefront sesuai level kategori;
- kategori level 3 tidak menarik produk saudara atau parent;
- pencarian dan count produk unik tetap benar;
- showcase lama tetap memiliki gambar, warna, urutan, dan batas produk;
- tidak ada perubahan tak disengaja pada `category_showcase_config`.

Simpan hasil verifikasi, log operator, dan referensi backup sebagai bukti cutover. Checklist TODO produksi baru boleh diperbarui setelah bukti tersebut tersedia.

## Status saat ini

- Unit test dan regresi kode: **lulus**.
- Tool preview read-only: tersedia melalui `npm run preview:category-cutover` atau `node scripts/preview-category-cutover.js <read-only-api-url>`.
- Preview target produksi pada 2026-11-26: **BLOCKED** untuk apply karena header nested belum tersedia.
- Hasil preview produksi: 13 kategori, 46 produk, kedalaman tree 1, 0 produk dengan `kategori_id`, 46 produk legacy-only, 0 unmatched, dan 0 ambiguous.
- Header yang masih harus ditambahkan melalui proses schema resmi: `categories.parent_id`, `categories.sort_order`, `categories.is_active`, dan `products.kategori_id`.
- Produk lama masih aman untuk dipreview karena seluruh 46 nilai `kategori` cocok unik terhadap kategori aktif, tetapi belum boleh dianggap cutover selesai sebelum schema ditambahkan dan mapping ditulis melalui apply yang diotorisasi.
- Backup produksi: **belum dibuat**.
- Otorisasi apply produksi: **belum diberikan**.
- Apply/cutover produksi: **belum dijalankan**.
- Editor admin drag-and-drop kini men-stage perubahan secara lokal, memvalidasi cycle/depth, dan menampilkan preview sebelum apply.
- Aksi backend `nested_category_backup` dan `nested_category_apply` disediakan pada `docs/gas_nested_category_admin_actions.gs`; keduanya belum dianggap aktif sampai dipasang dan dideploy di project GAS.
- Dengan schema sumber yang masih belum memuat `parent_id`, kontrol drag/apply sengaja tetap nonaktif. Preview cutover tetap read-only.
- Detail pemasangan dan alur UI: `docs/nested-category-admin-editor.md`.
