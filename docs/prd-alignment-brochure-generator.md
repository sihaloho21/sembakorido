# Alignment PRD — Brosur Generator

## Scope yang diterapkan pada MVP

Implementasi menggunakan entrypoint yang sudah ada, `admin-brosur.html`, dan engine `assets/js/brosur.js`. Pendekatan ini mempertahankan generator template-based, bukan editor bebas seperti Canva.

| Kebutuhan PRD | Status | Implementasi |
|---|---|---|
| Template A4 Portrait | Selesai | Template `a4` berukuran 2480×3508 px dengan grid hingga 20 produk dan rasio A4. |
| Judul, subjudul, periode promo | Selesai | Field metadata pada Step 1 dan dirender ke header A4. |
| Pilih produk dari katalog | Selesai | Data tetap diambil dari endpoint produk yang sudah dipakai proyek. |
| Harga normal dan harga promo | Selesai | Override harga per produk dipertahankan; warning muncul jika harga promo lebih tinggi daripada harga normal. |
| Badge produk | Selesai | Input badge dan preset badge tetap tersedia. |
| Drag & drop urutan produk | Selesai | Drag & drop produk terpilih tetap digunakan. |
| Upload banner | Selesai | Upload JPG/PNG/WebP dengan batas 5 MB dan fallback banner bawaan. |
| QR Code otomatis | Selesai | QR dibangkitkan dari URL brosur menggunakan `qrcode-generator`. |
| Preview | Selesai | Preview memakai engine canvas yang sama dengan output. |
| Generate/download PDF | Selesai | jsPDF membungkus output resolusi tinggi ke halaman A4. |
| Download PNG | Selesai | Output PNG lama tetap dipertahankan. |
| Simpan brosur | Hybrid MVP | Draft disimpan lokal terlebih dahulu, lalu disinkronkan ke sheet `promo_flyers` bila API admin dan schema tersedia. |
| Duplicate brosur | Hybrid MVP | Draft dapat diduplikasi dari modal Draft; salinan juga dikirim ke backend bila tersedia. |
| Autentikasi generator | Selesai untuk frontend | PIN hardcoded dihapus sebagai proteksi; halaman memakai session/token admin resmi dan mengarahkan user tanpa session ke `/admin/login.html`. |
| Branding toko | MVP lokal/remote | Nama toko, WhatsApp, alamat/footer, dan logo custom tersedia; metadata toko ikut dikirim saat sinkronisasi draft. |

## Batasan yang disengaja

Penyimpanan draft menggunakan strategi hybrid: localStorage menjadi fallback cepat/offline, sedangkan sinkronisasi remote memakai sheet `promo_flyers` dan field metadata tambahan. Ini memungkinkan penyimpanan terpusat jika deployment GAS terbaru aktif, tetapi belum memakai tabel relasional terpisah `brochures`/`brochure_products`.

Asset Library terpusat, pengaturan branding global, multi-page PDF, export JPG/PNG terpisah, analytics QR, auto-generate, rekomendasi produk, dan template tambahan tetap menjadi Phase 2/3. Template lama di generator tetap dipertahankan sebagai kompatibilitas dan eksperimen desain.

Validasi file di sisi browser sudah membatasi ekstensi MIME untuk banner, logo, background, dan gambar produk. Validasi server-side serta penyimpanan asset permanen perlu ditambahkan ketika upload dipindahkan ke backend.

## File yang berubah

- `admin-brosur.html`
- `assets/js/brosur.js`
- `docs/prd-alignment-brochure-generator.md`
- `docs/deploy_promo_flyers_schema.gs`

## Validasi yang dilakukan

- `node --check assets/js/brosur.js`
- `node --check server.js`
- `git diff --check`
- Source GAS whitelist/schema diperbarui dengan metadata `brochure_name`, `paper_size`, `orientation`, `template_id`, `store_address`, dan `banner_url`.
- Server lokal melayani `admin-brosur.html` dan `assets/js/brosur.js` dengan HTTP 200.

## Catatan deployment

Generator sekarang memakai session/token admin resmi dari `admin/login.html`; PIN hardcoded tidak lagi digunakan. Dependency `qrcode-generator` dan `jsPDF` dimuat dari jsDelivr; deployment produksi perlu mengizinkan akses CDN tersebut, atau dependency perlu dibundel secara lokal untuk mode offline. Sinkronisasi remote membutuhkan source GAS terbaru dan schema `promo_flyers` yang sudah diperbarui.
