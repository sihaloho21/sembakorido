# Admin UI Import Produk KlikIndomaret

Halaman Admin sekarang memiliki menu **Import KlikIndomaret** dengan alur:

1. Admin menempelkan satu URL HTTPS KlikIndomaret.
2. Admin memilih **Preview Data**.
3. Backend GAS menjalankan `indomaret_import_preview` tanpa menulis data.
4. Admin memeriksa dan mengedit nama, harga jual internal, kategori, stok, URL gambar, dan deskripsi.
5. Admin memilih **Simpan sebagai Draft** untuk menjalankan `indomaret_import_draft`.
6. Draft tampil pada tabel approval bersama harga referensi, harga jual, status import, URL sumber, dan catatan parser.
7. Admin dapat memilih **Approve**, **Reject**, atau **Import ulang**.

Approval mengirim `indomaret_approve_product` dan mensyaratkan harga jual internal lebih besar dari nol. Backend tetap mempertahankan status tampil produk `sembunyikan`; publikasi dilakukan melalui alur produk yang sudah ada.

## Pengujian

Pengujian lokal parser GAS berhasil melalui:

```text
npm run test:indomaret-importer
```

Pengujian static UI berhasil melalui:

```text
npm run test:indomaret-importer-ui
```

Smoke test terhadap deployment GAS yang saat ini ada di `assets/js/config.js` belum dapat mengonfirmasi import production. Request POST ke deployment mengembalikan HTTP 405 / halaman Google Drive **Page not found**, bukan JSON action importer. Selain itu, request langsung ke halaman produk contoh KlikIndomaret dari environment pengujian mendapatkan HTTP 403 Cloudflare challenge. Karena itu, uji production perlu dilakukan setelah deployment GAS terbaru aktif dan menggunakan token admin yang valid; implementasi tidak melewati CAPTCHA atau proteksi situs sumber.
