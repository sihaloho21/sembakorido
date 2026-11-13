# Backend Importer Produk KlikIndomaret

Implementasi backend importer canonical berada di `docs/gas_v71_blog_support_indomaret_latest.gs` dan memakai Google Apps Script yang sudah menjadi backend utama paketsembako.com. File `docs/gas_v63_blog_support.gs` adalah snapshot lama dan tidak boleh dipakai untuk deployment importer.

## Action yang tersedia

Semua action berikut wajib dikirim melalui `POST` ke URL Admin API dengan token admin yang valid. Token tidak boleh ditulis di repository atau dikirim melalui URL publik.

### Preview URL

```json
{
  "action": "indomaret_import_preview",
  "data": {
    "url": "https://www.klikindomaret.com/xpress/beras-pulen-wangi-premium"
  }
}
```

Action ini hanya mengambil dan mem-parsing halaman sumber. Action tidak menulis row ke spreadsheet.

### Buat draft

```json
{
  "action": "indomaret_import_draft",
  "data": {
    "url": "https://www.klikindomaret.com/xpress/beras-pulen-wangi-premium",
    "nama": "",
    "deskripsi": "",
    "gambar": "",
    "harga": "",
    "kategori": "",
    "stok": 0
  }
}
```

Hasilnya disimpan di sheet `products` dengan:

- `status = sembunyikan`;
- `import_status = draft_import` atau `needs_review`;
- harga sumber pada `source_reference_price`;
- harga jual internal tetap kosong kecuali dikirim manual;
- URL sumber pada `source_url`;
- URL gambar sumber pada `source_image_url` dan `gambar`;
- catatan parser pada `import_notes`.

### Preview import ulang

```json
{
  "action": "indomaret_reimport_preview",
  "data": {
    "product_id": "PROD-IMP-...",
    "url": "https://www.klikindomaret.com/xpress/beras-pulen-wangi-premium"
  }
}
```

Action ini mengembalikan data sumber terbaru dan data produk saat ini. Tidak ada snapshot historis yang disimpan.

### Approve draft

```json
{
  "action": "indomaret_approve_product",
  "data": {
    "product_id": "PROD-IMP-...",
    "harga": 78000
  }
}
```

Harga jual internal wajib lebih besar dari nol. Approval mengubah `import_status` menjadi `approved`, tetapi tetap mempertahankan `status = sembunyikan`. Produk dapat dipublikasikan melalui alur status produk admin yang sudah ada setelah pemeriksaan akhir.

### Reject draft

```json
{
  "action": "indomaret_reject_product",
  "data": {
    "product_id": "PROD-IMP-...",
    "reason": "Data sumber tidak lengkap"
  }
}
```

Reject mengubah `import_status` menjadi `rejected` dan memastikan produk tetap tersembunyi.

## Parser dan keamanan

Parser membaca JSON-LD `Product`/`Offer`, Open Graph, metadata, dan fallback `title`/`h1` serta pola harga rupiah. Backend hanya mengizinkan HTTPS dari `klikindomaret.com` dan subdomainnya, memvalidasi setiap redirect, menolak kredensial atau port non-standar, membatasi URL 2.048 karakter, response HTML 3 MB, dan maksimal tiga redirect.

Backend tidak mengeksekusi JavaScript halaman sumber, tidak mengirim cookie atau token login ke sumber, tidak membaca stok sumber, dan tidak menyalin file gambar. Jika parser gagal, hasil draft diberi status `needs_review` sehingga admin dapat melengkapi field secara manual.

## Deployment

1. Buka project Google Apps Script yang menjadi Admin API production.
2. Backup source GAS aktif sesuai prosedur operasional.
3. Tempelkan isi terbaru `docs/gas_v71_blog_support_indomaret_latest.gs` sebagai source utama. Jangan menempelkan `gas_v63_blog_support.gs`, karena file tersebut masih menggunakan `new URL(...)` dan dapat mengembalikan pesan `URL sumber tidak valid` pada runtime Apps Script tertentu.
4. Pastikan Script Properties `SPREADSHEET_ID` dan `ADMIN_TOKEN` tetap diatur di deployment, bukan di source repository.
5. Deploy versi baru Web App GAS.
6. Jalankan `ensure_schema` dengan token admin atau biarkan action importer menambahkan kolom products secara idempotent.
7. Uji `indomaret_import_preview` pada URL yang sah.
8. Uji domain terlarang, HTTP, redirect keluar domain, URL terlalu panjang, dan response besar.
9. Uji pembuatan draft dan pastikan row baru tidak tampil pada katalog publik.
10. Uji approval tanpa harga jual dan dengan harga jual valid.

Implementasi repository belum melakukan deployment ke Google Apps Script production. Deployment tetap memerlukan akses ke project GAS yang sesuai.
