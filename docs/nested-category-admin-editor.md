# Editor Admin Kategori Bertingkat

## Status implementasi

Admin kategori memiliki editor hierarki berbasis drag-and-drop. Perubahan drag hanya mengubah draft di browser. Draft divalidasi untuk ID kosong/duplikat, parent yang tidak ditemukan, siklus, dan batas maksimum tiga tingkat. UI menampilkan perubahan, menyediakan pembatalan, dan menahan tombol apply jika struktur invalid.

Saat admin memilih **Terapkan perubahan**, urutannya:

1. frontend memvalidasi ulang draft dan meminta konfirmasi admin;
2. aksi `nested_category_backup` memeriksa fingerprint snapshot lalu membuat salinan penuh spreadsheet;
3. aksi `nested_category_apply` mengambil ScriptLock, memastikan backup masih tersedia dan snapshot tidak berubah, memvalidasi tree ulang di backend, lalu hanya menulis kolom `categories.parent_id`;
4. backend memverifikasi hasil dan memulihkan nilai parent_id awal jika verifikasi gagal;
5. frontend memuat ulang kategori dan menjalankan `validateNestedCategoryTree()`;
6. admin dapat menjalankan **Preview cutover (read-only)** untuk membaca ulang `categories` dan `products`; preview tidak menulis spreadsheet.

Tidak ada produk, field `kategori` lama, atau `category_showcase_config` yang diubah oleh aksi hierarki ini.

## Prasyarat deployment

Repositori menyimpan frontend, tetapi backend GAS aktif bukan bagian dari build website. Sebelum editor dapat menerapkan perubahan:

- jalankan migrasi schema kategori secara terpisah dan setelah otorisasi yang sesuai; minimal sheet `categories` harus mempunyai `id`, `nama`, dan `parent_id`;
- salin fungsi dari `docs/gas_nested_category_admin_actions.gs` ke project Apps Script API aktif;
- sambungkan dua action di `doPost(e)` **sesudah** `guardActionAuthorization(...)` dan sebelum fallback CRUD generik, mengikuti contoh di header file;
- pastikan `getRequiredRoleForAction()` mengharuskan role `manager` untuk kedua action; sheet `categories` harus tetap di whitelist;
- uji pada spreadsheet non-produksi/duplikat, redeploy Web App GAS, lalu verifikasi dengan akun manager.

Schema saat ini di CSV repo masih `id,nama,deskripsi`; karena itu UI akan tetap menonaktifkan drag/apply sampai kolom `parent_id` terdeteksi. Backend yang belum dideploy akan menolak action secara aman. Saya tidak menjalankan backup, migrasi schema, deploy GAS, ataupun penulisan spreadsheet produksi saat implementasi ini.

## Tes

```bash
npm run test:nested-category-editor
npm run test:category-tree
npm test
```

Tes menggunakan data fixture lokal dan tidak memanggil endpoint GAS.
