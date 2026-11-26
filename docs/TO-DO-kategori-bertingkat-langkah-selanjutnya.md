# TO-DO: Langkah Selanjutnya untuk Kategori Bertingkat

Dokumen ini ditujukan untuk membantu melanjutkan pekerjaan tanpa perlu menebak-nebak. **Jangan mengubah spreadsheet produksi sekarang.** Beberapa perubahan kode sudah disiapkan, tetapi belum diaktifkan di website dan belum dipasang di backend GAS.

## Ringkasnya: posisi kita sekarang

- [x] Fitur editor kategori dibuat pada branch GitHub terpisah: `feat/nested-category-admin-editor-20261126`.
- [x] Perubahan kode sudah dites dengan `npm test`.
- [ ] Perubahan belum masuk ke branch utama `main`, sehingga kemungkinan belum tampil di website yang dipakai sekarang.
- [ ] Spreadsheet belum diubah dan belum dibuat backup.
- [ ] Backend Google Apps Script (GAS) belum dipasang atau di-deploy.
- [ ] Header `parent_id` belum tersedia di data kategori saat ini. Karena itu, tombol ubah/apply sengaja belum aktif.

**Artinya: Anda belum melakukan kesalahan dan tidak ada perubahan data produksi yang dibuat oleh pekerjaan ini.**

## Urutan pekerjaan yang disarankan

### 1. Tinjau perubahan kode — belum mengubah website

- [ ] Buka [Pull Request untuk branch fitur](https://github.com/sihaloho21/sembakorido/pull/new/feat/nested-category-admin-editor-20261126).
- [ ] Tinjau judul dan daftar file. Jika Anda belum yakin, **jangan klik Merge dulu**; minta bantuan untuk menjelaskan atau meninjau PR.
- [ ] Setelah PR disetujui dan di-merge, pastikan proses website melakukan deploy dari `main` seperti biasanya.

**Hasil yang diharapkan:** kode editor ada di versi utama website. Langkah ini sendiri belum membuat kategori bertingkat atau mengubah spreadsheet.

### 2. Pastikan target dan siapkan tempat uji — jangan mulai dari data produksi

- [ ] Minta admin teknis memastikan project GAS/API mana yang dipakai website dan spreadsheet mana yang menjadi sumber data.
- [ ] Siapkan salinan spreadsheet atau lingkungan uji/staging untuk percobaan.
- [ ] Catat siapa yang boleh mengubah kategori dan siapa yang bisa memulihkan backup.
- [ ] Pastikan semua pihak sepakat bahwa saat uji coba pertama, perubahan dilakukan pada salinan/staging, bukan spreadsheet produksi.

**Hasil yang diharapkan:** kita tahu persis project dan spreadsheet yang akan diuji. Jangan menebak berdasarkan nama file saja.

### 3. Pasang schema kategori pada lingkungan uji

- [ ] Jalankan **preview schema** terlebih dahulu untuk melihat header yang belum ada.
- [ ] Tinjau hasil preview dan pastikan spreadsheet target benar.
- [ ] Buat backup spreadsheet dan pastikan file backup bisa dibuka.
- [ ] Baru setelah itu, admin teknis menambahkan header schema yang dibutuhkan melalui prosedur migrasi resmi. Header terkait mencakup `parent_id`, `sort_order`, dan `is_active` di sheet `categories`, serta `kategori_id` di sheet `products`.
- [ ] Pastikan data/baris lama tidak ikut berubah; pekerjaan ini hanya menambahkan kolom schema.

**Hasil yang diharapkan:** struktur kolom siap untuk mendukung fitur baru. Belum ada kategori yang dipindahkan dan belum ada produk yang dipetakan ulang.

### 4. Pasang dan uji backend GAS pada lingkungan uji

- [ ] Admin teknis memasang handler backend pada file [aksi backend GAS](gas_nested_category_admin_actions.gs).
- [ ] Pastikan action backup/apply ditempatkan **setelah pemeriksaan login/otorisasi**, bukan sebelum pemeriksaan tersebut.
- [ ] Pastikan hanya admin dengan peran yang sesuai yang boleh melakukan perubahan.
- [ ] Deploy versi GAS ke lingkungan uji dan tes bahwa backup benar-benar dibuat.
- [ ] Uji apply dengan beberapa kategori contoh. Pastikan parent berubah sesuai pilihan, sedangkan produk dan konfigurasi showcase tidak ikut berubah.
- [ ] Uji juga skenario gagal (misalnya parent salah atau snapshot sudah berubah); backend harus menolak perubahan.

**Hasil yang diharapkan:** tombol apply hanya berfungsi lewat backend yang sudah memeriksa akses, membuat backup, dan memvalidasi ulang.

### 5. Uji tampilan dan alur editor di lingkungan uji

- [ ] Buka halaman admin → Kategori.
- [ ] Pastikan schema yang siap membuat editor dapat dipakai.
- [ ] Seret kategori hanya untuk mengubah **preview lokal**; pastikan spreadsheet tidak berubah saat menyeret.
- [ ] Pastikan UI menandai cycle, parent yang salah, atau kedalaman lebih dari tiga tingkat sebagai tidak valid.
- [ ] Coba batalkan preview dan pastikan struktur kembali seperti semula.
- [ ] Jalankan **Preview cutover (read-only)** dan pastikan laporan menyebut bahwa tidak ada penulisan dilakukan.
- [ ] Setelah semua uji berhasil, catat hasil dan minta persetujuan sebelum rencana produksi dibuat.

**Hasil yang diharapkan:** seluruh alur sudah dipahami dan terbukti aman di lingkungan uji.

### 6. Baru rencanakan perubahan produksi

Bagian ini **belum diotorisasi dan belum dilakukan**. Jangan lanjutkan hanya karena langkah-langkah sebelumnya terlihat berhasil.

- [ ] Tetapkan tanggal/jam, admin pelaksana, spreadsheet target, dan prosedur pemulihan.
- [ ] Jalankan preview read-only pada spreadsheet produksi yang benar.
- [ ] Tinjau semua error, produk yang belum cocok, nama kategori ambigu, jumlah kategori/produk, dan kedalaman tree.
- [ ] Buat serta verifikasi backup produksi sebelum ada write.
- [ ] Minta persetujuan eksplisit untuk perubahan produksi setelah target dan isi preview disepakati.
- [ ] Admin melakukan perubahan yang sudah disetujui, lalu memuat ulang kategori dan menjalankan `validateNestedCategoryTree()`.
- [ ] Jalankan preview cutover read-only sekali lagi dan simpan hasilnya bersama referensi backup.

**Penting:** jika data berubah antara preview dan apply, proses harus dihentikan, preview diulang, dan backup baru dibuat.

## Hal yang jangan dilakukan dulu

- Jangan menjalankan `applyNestedCategorySchema()` pada spreadsheet produksi sekarang.
- Jangan mengedit `parent_id` atau kolom lain secara manual di spreadsheet produksi.
- Jangan menempelkan token admin, URL rahasia, atau isi spreadsheet ke chat publik/PR.
- Jangan merge PR jika Anda belum mengerti dampaknya; minta saya menjelaskan dulu.
- Jangan menganggap fitur sudah aktif hanya karena branch GitHub sudah ada.

## Langkah pertama paling mudah

Jika Anda ingin melanjutkan dengan aman, mulai dari **langkah 1 saja**: buka PR, lalu minta peninjauan. Setelah itu, pekerjaan dapat dilanjutkan satu langkah pada satu waktu. Saya bisa membantu menyiapkan instruksi yang lebih rinci untuk admin teknis ketika sudah jelas siapa yang menangani deploy website dan GAS.

## Referensi kode

- Branch fitur: [feat/nested-category-admin-editor-20261126](https://github.com/sihaloho21/sembakorido/tree/feat/nested-category-admin-editor-20261126)
- Panduan editor dan backend: [nested-category-admin-editor.md](nested-category-admin-editor.md)
- Prosedur preview/cutover: [nested-category-cutover-runbook.md](nested-category-cutover-runbook.md)
- Handler GAS yang perlu dipasang dan diuji oleh admin teknis: [gas_nested_category_admin_actions.gs](gas_nested_category_admin_actions.gs)
