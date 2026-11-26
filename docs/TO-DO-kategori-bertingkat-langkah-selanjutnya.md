# TO-DO: Langkah Selanjutnya untuk Kategori Bertingkat

Dokumen ini membantu melanjutkan pekerjaan tanpa menebak-nebak. **Spreadsheet produksi belum diubah.** Backup produksi belum dibuat, backend GAS belum dipasang/deploy, schema produksi belum dimigrasikan, dan PR belum di-merge.

## Ringkasan status — 26 November 2026

- Branch fitur: `feat/nested-category-admin-editor-20261126`.
- Draft PR #29: [feat: safe nested category admin editor](https://github.com/sihaloho21/sembakorido/pull/29). PR masih OPEN/Draft; belum di-merge.
- Perbaikan kode sudah di-commit dan dipush sebagai [`a9235cf`](https://github.com/sihaloho21/sembakorido/commit/a9235cf95735daf5828f2b087257288ef9728c87); checklist staging dan catatan CI diperbarui di [`2c75e7d`](https://github.com/sihaloho21/sembakorido/commit/2c75e7d8b687c54e77e35fcf659d9398e608f66b) dan [`a8d8f45`](https://github.com/sihaloho21/sembakorido/commit/a8d8f45). Working tree bersih.
- [Deploy preview PR #29](https://deploy-preview-29--eloquent-jelly-08a8ae.netlify.app) sudah membangun revision terbaru. Pemeriksaan read-only menerima HTTP 200 untuk `admin/index.html` dan `admin/js/admin-script.js`; markup memuat cache-buster `20261126b`. Tidak ada JavaScript admin yang dijalankan, dan tidak ada endpoint backend/spreadsheet yang dipanggil.
- `npm test`, pemeriksaan sintaks JavaScript, dan `git diff --check` lulus setelah push.
- Review independen menemukan beberapa masalah UI/GAS; sudah diperbaiki secara lokal: interaksi saat apply dibekukan, refresh mengambil data sumber terbaru tanpa cache, move invalid ditolak, preview schema tidak lagi menyebut READY jika header literal `id`/`nama` tidak ada, backup diverifikasi dari file salinan, write memeriksa ulang fingerprint dan ID, rollback hanya menyasar sel yang dicoba dan diverifikasi, dan detail kategori dibersihkan setelah reload.
- **Run CI lengkap terakhir pada commit `2c75e7d` gagal hanya di `CI/build`** (1 gagal, 15 sukses, 5 dilewati; deploy preview siap). Log build pada kode `a9235cf` menunjukkan deklarasi `addressIndexToDelete` berulang di `assets/js/akun.bundle.js` (baris 372 dan 559) setelah `scripts/bundle-akun.js` menggabungkan `assets/js/script.min.js` dan `assets/js/akun.min.js`. Berkas input/bundler tidak diubah oleh PR dibanding `origin/main`; kegagalan tampak berasal dari baseline. Setelah commit dokumentasi `a8d8f45`, GitHub memulai checks ulang; status terakhir yang dilihat: 6 sukses, 2 dilewati, 9 masih pending. PR jangan di-merge sebelum seluruh checks selesai dan build hijau atau pemilik repo menyetujui perbaikan baseline.
- Google Workspace connector kini aktif atas izin Anda. Pencarian Drive **metadata-only** tidak menemukan spreadsheet dengan label staging/test/dev; pencarian nama terkait proyek menemukan dua kandidat (satu file utama dan satu salinan), tetapi salinan belum terbukti sebagai staging. Isi spreadsheet tidak dibuka; belum dipastikan mana pun aman untuk tes. Tidak ada file yang diubah.
- Tidak ada tindakan tulis ke spreadsheet, pembuatan backup, instalasi/deploy GAS, atau merge yang dilakukan.

## Yang sudah selesai di kode

1. Drag-and-drop mengubah draft lokal dan UI menolak move yang menghasilkan siklus atau struktur di luar batas.
2. Apply meminta konfirmasi admin, membekukan perubahan/Reset selama proses, lalu hanya meminta backend yang berotorisasi melakukan apply.
3. Setelah apply, frontend memuat ulang kategori, menjalankan validasi, dan menyediakan preview cutover read-only.
4. Patch GAS mensyaratkan `sheetName === 'categories'` dan whitelist, role manager, snapshot yang tidak berubah, backup yang dapat dibuka dengan fingerprint cocok, serta pemulihan yang diverifikasi.
5. Tombol **Refresh tree** memuat ulang data kategori dari sumber dengan cache bypass; jika ada draft lokal, UI meminta konfirmasi sebelum membuang draft.

## Urutan pekerjaan berikutnya

### 1. Sinkronkan revisi terbaru ke PR dan tinjau ulang CI

- [x] Commit dan push perubahan kode (`a9235cf`) beserta checklist/status (`2c75e7d`, `a8d8f45`) ke branch fitur.
- [x] Periksa deploy preview dan pastikan PR tetap Draft; preview terbaru menyajikan berkas admin dengan HTTP 200.
- [ ] Pastikan perbaikan kode lulus CI. Jika `CI/build` tetap gagal pada deklarasi `addressIndexToDelete`, perbaiki penyebab build dasar atau minta pemilik repo menyetujui penanganannya sebelum merge.
- [x] Periksa berkas deploy preview secara read-only. Jangan menggunakan alur apply pada preview sampai backend staging yang terisolasi tersedia.

**Hasil yang diharapkan:** PR terbarui dan pemeriksaan kode transparan. Langkah ini tidak mengubah spreadsheet.

### 2. Pastikan spreadsheet staging yang aman

- [x] Aktifkan akses Google Workspace setelah izin Anda; cari metadata Drive saja tanpa membaca isi file.
- [ ] Minta Anda/admin teknis menunjuk file/ID staging secara eksplisit. Jangan menganggap file salinan sebagai staging sebelum dikonfirmasi.
- [ ] Pastikan file staging bukan spreadsheet produksi dan tidak mengandung data yang tidak boleh diduplikasi.
- [ ] Catat pemilik, project GAS, spreadsheet target, dan siapa yang dapat memulihkan backup.

**Hasil yang diharapkan:** target uji teridentifikasi jelas. Jangan menebak berdasarkan nama file dan jangan membuat salinan data produksi tanpa persetujuan.

### 3. Siapkan schema pada staging saja

- [ ] Jalankan preview schema read-only dan pastikan file staging yang benar.
- [ ] Buat backup staging setelah target diverifikasi; pastikan backup bisa dibuka dan isi/header cocok.
- [ ] Setelah disetujui admin teknis, tambahkan header sesuai migrasi resmi: `categories.parent_id`, `categories.sort_order`, `categories.is_active`, dan `products.kategori_id`.
- [ ] Pastikan data lama, produk, field `kategori`, dan `category_showcase_config` tidak berubah.

### 4. Pasang serta uji backend GAS di staging

- [ ] Pasang `docs/gas_nested_category_admin_actions.gs` hanya pada project GAS staging.
- [ ] Sambungkan action setelah guard otorisasi **dan** validasi whitelist sheet; keduanya mensyaratkan role `manager` serta `sheetName=categories`.
- [ ] Saat apply, hentikan sementara edit manual, sort, insert, dan delete baris di sheet kategori karena ScriptLock tidak memblokir edit langsung di Google Sheets UI.
- [ ] Uji backup yang dapat dibuka dan cocok dengan fingerprint, apply valid, snapshot stale, ID duplikat/parent invalid, serta kegagalan rollback. Pastikan hanya `categories.parent_id` yang berubah.
- [ ] Deploy Web App GAS staging dan uji dengan akun manager yang diotorisasi.

### 5. Uji alur editor di staging

- [ ] Buka admin staging → Kategori dan pastikan schema siap.
- [ ] Coba drag kategori; pastikan perubahan tetap lokal sebelum apply.
- [ ] Pastikan drop yang membuat siklus/kedalaman invalid ditolak tanpa menyembunyikan tree atau menghilangkan draft yang benar.
- [ ] Pastikan Reset, Refresh tree, Apply, reload kategori, dan `validateNestedCategoryTree()` bekerja seperti yang diharapkan.
- [ ] Jalankan **Preview cutover (read-only)**; tinjau jumlah kategori/produk, exception mapping, header, dan status READY/BLOCKED. Pastikan laporan menyatakan tidak ada write.
- [ ] Simpan hasil tes dan minta persetujuan sebelum membahas produksi.

### 6. Produksi — belum diotorisasi

Bagian ini tetap berhenti sampai staging lolos, target dan pemilik data jelas, backup serta prosedur pemulihan siap, dan persetujuan eksplisit untuk produksi diberikan.

- [ ] Tetapkan target spreadsheet/deployment GAS, operator, jadwal, maintenance window, dan prosedur pemulihan.
- [ ] Jalankan preview read-only produksi dan tinjau seluruh exception.
- [ ] Buat serta verifikasi backup produksi sebelum ada write.
- [ ] Dapatkan persetujuan eksplisit yang menyebut target dan perubahan yang diizinkan.
- [ ] Apply hanya melalui backend manager; muat ulang kategori, validasi tree, dan jalankan preview cutover read-only kembali.

## Jangan dilakukan dulu

- Jangan merge PR #29 selama CI gagal atau sebelum PR ditinjau.
- Jangan menjalankan migrasi schema, backup, atau apply pada spreadsheet produksi.
- Jangan memasang patch GAS ke project aktif sebelum target dan environment staging dikonfirmasi.
- Jangan membuat duplikat spreadsheet produksi tanpa persetujuan pemilik data.
- Jangan mengedit `parent_id` atau kolom kategori secara manual saat apply berjalan.

## Referensi

- [PR #29](https://github.com/sihaloho21/sembakorido/pull/29)
- [Deploy preview PR #29](https://deploy-preview-29--eloquent-jelly-08a8ae.netlify.app)
- [Panduan editor admin](nested-category-admin-editor.md)
- [Runbook cutover](nested-category-cutover-runbook.md)
- [Patch handler backend GAS](gas_nested_category_admin_actions.gs)
