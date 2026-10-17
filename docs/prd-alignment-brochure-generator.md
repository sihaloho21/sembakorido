# Catatan Status — Generator Brosur dan Promo POP

**Status:** UI generator brosur dan UI admin Catalog Promo POP dinonaktifkan pada Oktober 2026.

Halaman `/admin-brosur.html`, controller khusus `assets/js/brosur.js`, halaman admin Catalog Promo POP beserta controllernya telah dihapus. CRUD admin `promo_flyers`, publish/unpublish, approval, version history, audit, validasi harga, dan kebijakan margin terkait juga dipensiunkan dari source GAS aktif `docs/gas_v63_blog_support.gs`.

Endpoint baca `public_promo_flyers` tetap dipertahankan karena `promo_katalog.html` masih menampilkannya. Konfigurasi publik seperti `grid_config_json`, `visual_config_json`, watermark, disclaimer, dan pilihan layanan juga tetap menjadi bagian skema aktif. `promo_admin_users` serta pemeriksaan token/role admin bersama tidak dihapus karena masih digunakan otorisasi endpoint lain.

File `docs/deploy_promo_flyers_schema.gs` hanya memastikan header yang dibutuhkan katalog publik. Script itu bersifat append-only: tidak menghapus sheet, kolom, atau data yang sudah ada. File migrasi governance POP telah dihapus dari source agar tidak dapat dijalankan kembali secara tidak sengaja; tabel/rekaman governance lama di Google Spreadsheet tidak disentuh.

`docs/gas_v62_referral_hardening.gs` adalah snapshot versi lama untuk riwayat, bukan sumber GAS terbaru yang harus ditempelkan. Source terbaru yang disiapkan untuk project Apps Script adalah `docs/gas_v63_blog_support.gs`.
