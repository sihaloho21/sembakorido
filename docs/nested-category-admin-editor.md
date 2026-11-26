# Editor Admin Kategori Bertingkat

## Status implementasi

Admin kategori memiliki editor hierarki berbasis drag-and-drop. Perubahan drag hanya mengubah draft di browser. Draft divalidasi untuk ID kosong/duplikat, parent yang tidak ditemukan, siklus, dan batas maksimum tiga tingkat; move yang membuat struktur invalid ditolak sebelum tree berubah. UI menampilkan perubahan, menyediakan pembatalan, memuat ulang sumber kategori lewat **Refresh tree**, dan membekukan drag/reset selama apply.

Saat admin memilih **Terapkan perubahan**, urutannya:

1. frontend memvalidasi ulang draft dan meminta konfirmasi admin;
2. aksi `nested_category_backup` memeriksa fingerprint snapshot, membuat salinan penuh spreadsheet, membuka kembali salinan, lalu memastikan fingerprint sheet `categories` pada salinan sama sebelum menyatakan backup berhasil;
3. aksi `nested_category_apply` mengambil ScriptLock, memastikan isi backup dan snapshot aktif cocok, memvalidasi tree ulang, membaca ulang ID kategori sebelum setiap penulisan, lalu hanya menulis kolom `categories.parent_id`;
4. backend memverifikasi hasil; bila verifikasi gagal, backend mencari ulang kategori berdasarkan ID, mencoba memulihkan setiap nilai awal, dan memverifikasi rollback. Kegagalan pemulihan dilaporkan eksplisit;
5. frontend memuat ulang kategori dan menjalankan `validateNestedCategoryTree()`;
6. admin dapat menjalankan **Preview cutover (read-only)** untuk membaca ulang `categories` dan `products`; preview tidak menulis spreadsheet.

Tidak ada produk, field `kategori` lama, atau `category_showcase_config` yang diubah oleh aksi hierarki ini.

## Prasyarat deployment

Repositori menyimpan frontend, tetapi backend GAS aktif bukan bagian dari build website. Sebelum editor dapat menerapkan perubahan:

- jalankan migrasi schema kategori secara terpisah dan setelah otorisasi yang sesuai; minimal sheet `categories` harus mempunyai `id`, `nama`, dan `parent_id`;
- salin fungsi dari `docs/gas_nested_category_admin_actions.gs` ke project Apps Script API aktif;
- sambungkan dua action di `doPost(e)` **sesudah** `guardActionAuthorization(...)` dan validasi whitelist sheet, sebelum fallback CRUD generik, mengikuti contoh di header file;
- pastikan `getRequiredRoleForAction()` mengharuskan role `manager` untuk kedua action; handler juga mensyaratkan `sheetName === 'categories'` dan keanggotaan di `SHEET_WHITELIST`;
- saat apply berjalan, hentikan sementara edit manual, sort, insert, atau delete baris pada spreadsheet; ScriptLock hanya mengunci eksekusi Apps Script dan tidak menghalangi edit langsung di UI Sheets;
- uji pada spreadsheet non-produksi/duplikat, redeploy Web App GAS, lalu verifikasi dengan akun manager.

Schema saat ini di CSV repo masih `id,nama,deskripsi`; karena itu UI akan tetap menonaktifkan drag/apply sampai kolom `parent_id` terdeteksi. Backend yang belum dideploy akan menolak action secara aman. Saya tidak menjalankan backup, migrasi schema, deploy GAS, ataupun penulisan spreadsheet produksi saat implementasi ini.

## Tes

```bash
npm run test:nested-category-editor
npm run test:category-tree
npm test
```

Tes menggunakan data fixture lokal dan tidak memanggil endpoint GAS.
