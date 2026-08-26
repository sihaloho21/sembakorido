# Audit Sistem Existing Catalog Promo POP

**Tanggal audit:** 26 Agustus 2026  
**Repository:** `sihaloho21/sembakorido`  
**Scope:** Audit sebelum implementation plan dan implementasi bertahap sesuai prompt upgrade sistem brochure generator.

> Kesimpulan utama: sistem saat ini sudah memiliki fondasi Catalog Promo POP yang berjalan, tetapi sebagian besar fitur baru dalam prompt belum tersedia sebagai modul tersendiri. Strategi paling aman adalah memperluas kontrak `promo_flyers`, mempertahankan API dan auth GAS yang ada, serta mengimplementasikan fitur secara bertahap tanpa rewrite besar.

## 1. Existing Architecture

PaketSembako adalah static frontend berbasis HTML, CSS/Tailwind, dan JavaScript. Data katalog publik serta autentikasi/persistensi admin terhubung ke Google Apps Script (GAS). Sebagian state pelanggan dan konfigurasi browser menggunakan `localStorage`. Project tidak menggunakan backend Node khusus untuk brochure generator.

| Layer | Implementasi existing | Implikasi |
|---|---|---|
| Storefront | `index.html`, `akun.html`, `transaksi.html`, `notifikasi.html`, `promo_katalog.html` | Harus dijaga agar kontrak katalog dan checkout tidak berubah. |
| Admin | `admin/`, terutama `admin/catalog-promo-pop.html` | POP builder sudah menjadi entry point admin yang aktif. |
| Controller POP | `admin/js/catalog-promo-pop.js` | Menangani loading produk, form, selected items, preview, persistence, publish, reorder, dan export. |
| API utama | `assets/js/api-service.js` dan `assets/js/config.js` | GET katalog menggunakan endpoint GAS utama dengan cache/retry/deduplication. |
| API admin | `GASActions` yang digunakan oleh controller admin | POST CRUD memakai token dan role existing; tidak boleh diganti dengan kontrak baru tanpa alasan. |
| Backend | `docs/gas_v63_blog_support.gs` | GAS menangani whitelist sheet, schema, CRUD, auth/role, publish/unpublish, dan public flyer read model. |
| Database | Google Sheets, bukan relational database | Perubahan wajib berupa penambahan kolom/sheet yang non-destructive dan idempotent. |
| Public POP | `promo_katalog.html` | Membaca campaign published yang aktif dan merender brochure publik. |

## 2. Existing Features

Fitur yang telah ditemukan pada POP builder adalah create/edit campaign, draft save, publish/unpublish, delete, campaign list, product search/category/stock filtering, multi-select product, reorder produk, featured product, per-item brochure overrides, bulk pricing, layout selection, grid rows/columns, manual element positioning, copy/paste layout, watermark, PPOB wallet selection, QR, A4 Portrait safe area, print preview, PNG export, PDF export, dan Share WhatsApp.

Harga promo pada item campaign sudah dipisahkan dari harga katalog melalui data campaign. Field snapshot item mencakup identitas, nama, image, SKU, unit, stock, normal price, promo price, brochure name, brochure normal price, brochure promo price, brochure offer, dan badge. Ini merupakan dasar yang dapat dikembangkan menjadi Product Snapshot formal tanpa mengubah product master.

Template visual existing sudah mempunyai pilihan seperti Promo Grid, Minimalis, Promo Besar, theme warna, serta beberapa layout product grid. Semua layout produk sekarang sudah diarahkan ke shared positioned elements pada preview admin dan public renderer.

## 3. Existing Database and Persistence

Sheet `promo_flyers` sudah terdaftar dalam whitelist GAS, ditandai sebagai sensitive untuk GET, dan mempunyai schema yang mencakup metadata campaign, item snapshot JSON, period, output URLs, QR URL, branding, paper/orientation, template, store address, disclaimer, service/payment flags, dan `ppob_wallets_json`.

| Existing contract | Status audit | Keputusan kompatibilitas |
|---|---|---|
| `promo_flyers.items_json` | Digunakan untuk snapshot item dan konfigurasi produk | Dipertahankan; jangan mengganti format lama secara mendadak. |
| `template_id`, `layout`, `grid_config_json` | Sudah digunakan untuk layout | Dapat diperluas dengan default aman. |
| `show_watermark`, `watermark_text` | Sudah digunakan dalam preview/export/public render | Dipertahankan. |
| `ppob_wallets_json` | Kolom baru sudah ditambahkan | Deployment schema harus tetap idempotent. |
| Campaign status | Existing terutama draft/published/expired/archived | Status tambahan perlu normalisasi backward-compatible. |
| Version/audit/approval records | Belum ditemukan sebagai model brochure khusus | Jangan membuat seluruh tabel sekaligus; mulai dari kebutuhan Phase 1. |

Sumber schema authoritative adalah `docs/gas_v63_blog_support.gs`; helper deployment terpisah berada di `docs/deploy_promo_flyers_schema.gs`. Script deployment menambahkan header yang hilang dan tidak menghapus data lama.

## 4. Existing API and Authentication

Public product data diambil melalui `CONFIG.getMainApiUrl()` menggunakan sheet `products`. Public POP mengambil campaign melalui action `public_promo_flyers`, yang hanya mengembalikan flyer published dan masih aktif setelah normalisasi periode.

Admin campaign read menggunakan endpoint sheet `promo_flyers` dengan token admin dan role. Admin write menggunakan helper `GASActions` yang meneruskan `token`/`admin_token` dan `role`/`admin_role` melalui request GAS. Pada backend, create/update campaign memerlukan akses manager-level; delete dan publish juga dibatasi role manager. Auth existing memakai session browser sementara melalui `admin-auth.js`.

Tidak ditemukan endpoint khusus `/api/campaigns` atau server REST brochure di repository. Karena itu, implementation plan harus memperluas style CRUD/action GAS yang sudah berjalan, bukan memperkenalkan server backend baru secara paralel.

## 5. Existing Brochure System

Pipeline current adalah:

```text
products dari GAS
  → normalizeProduct
  → pilih dan override produk pada browser
  → items_json sebagai snapshot campaign
  → preview A4 safe area
  → print / PNG / PDF / Share WA
  → save ke promo_flyers
  → public_promo_flyers untuk campaign published aktif
```

Sistem sudah kuat pada sisi editor dan output. Kekurangan arsitektural utama adalah belum adanya pemisahan eksplisit antara template master, campaign, brochure version, promo rule engine, bundle model, preflight result, dan audit trail. Beberapa kebutuhan prompt masih bisa dimulai sebagai konfigurasi JSON pada `promo_flyers`, tetapi fitur yang membutuhkan query lintas campaign atau histori immutable kemungkinan membutuhkan sheet baru.

## 6. Gap terhadap Prompt Upgrade

| Area prompt | Kondisi existing | Gap |
|---|---|---|
| Template Manager | Pilihan template/layout ada di builder | Belum ada CRUD template, active/inactive, default, dan template persistence terpisah. |
| Section Builder | Section output sudah ada secara fixed | Belum ada reorder dan konfigurasi section sebagai model. |
| Product Snapshot | Snapshot item sudah tersimpan di `items_json` | Belum ada validasi/kontrak snapshot formal dan version policy. |
| Promo Engine | Diskon persen, potongan tetap, harga promo, bulk pricing sudah ada | Buy X Get Y, bundle rule, dan reusable promo rule belum ada. |
| Bundle Promo | Ada featured/product grouping yang berdekatan | Belum ada bundle entity dan perhitungan original/discount/savings formal. |
| Auto Layout | Grid rows/columns dan layout existing tersedia | Belum ada pagination multi-page untuk jumlah produk besar. |
| Smart Text Fit | Ada batas/layout styling dasar | Belum ada preflight terstruktur untuk overflow dan font scaling. |
| Print Preflight | A4, margin, image wait, export synchronization sudah ada | Belum ada laporan warning sebelum export untuk semua checklist prompt. |
| Autosave | Draft save manual tersedia | Debounced autosave dan recovery state belum tersedia. |
| Version History | Belum ditemukan model version khusus | Memerlukan strategi snapshot/version yang tidak merusak campaign lama. |
| Permission | Auth dan role GAS sudah ada | Permission per aksi brochure belum dimodelkan secara detail. |
| Approval Workflow | Draft/published tersedia | In-review/approved/rejected dengan notes belum tersedia. |
| Audit Log | Sebagian log domain lain tersedia | Belum ada audit log khusus perubahan brochure. |
| Asset Library | Asset URL/upload lokal sudah digunakan terbatas | Belum ada catalog asset reusable dengan reference check. |
| Brand Kit | Theme/store fields tersedia | Belum ada brand snapshot terpisah. |
| Margin Checker | Konfigurasi margin/bundle pada app ada, tetapi POP profit checker belum | Cost price dan margin warning perlu sumber harga modal yang valid. |
| Digital/QR analytics | QR URL dan public brochure tersedia | Tracking scan, clicks, views, campaign analytics belum menjadi event model. |

## 7. Risk Analysis

| Risiko | Level | Dampak | Mitigasi awal |
|---|---:|---|---|
| Perubahan schema GAS tidak sinkron dengan spreadsheet | Tinggi | Save/read campaign gagal | Migration idempotent, schema verifier, backup, dan backward-compatible fallback. |
| Mengubah `items_json` lama | Tinggi | Campaign historis tidak dapat dirender | Parser multi-format dan default field, tanpa menghapus key lama. |
| Menambah autosave terlalu agresif | Sedang | Request GAS berlebihan atau race condition | Debounce, dirty-state, retry terbatas, dan save queue. |
| Menambahkan status workflow tanpa normalisasi | Sedang | Campaign lama hilang dari filter/public | Map status lama ke status baru dan pertahankan `published` behavior. |
| Harga modal tidak tersedia/berbeda format | Tinggi | Margin checker menyesatkan | Tampilkan “data cost belum tersedia”, jangan mengarang profit. |
| Multi-page auto layout merusak export A4 | Tinggi | Produk terpotong atau overflow | Preflight geometry, fixture dataset maksimum, dan output regression test. |
| Upload asset tanpa reference check | Sedang | Asset aktif terhapus | Simpan usage reference sebelum delete. |
| Role baru tidak identik dengan role GAS existing | Tinggi | Akses tidak sesuai | Reuse `admin_role` dan buat permission matrix di layer action, bukan auth baru. |
| Perubahan frontend tidak dibundle/terdeploy | Sedang | Production memakai source lama | Dokumentasikan build path dan cek deployment artifact. |

## 8. Compatibility Issues

Pertama, public POP harus tetap dapat membaca row campaign lama yang belum memiliki kolom/field baru. Kedua, parser campaign harus menerima `items`, `products`, `items_json`, dan struktur lama yang sudah digunakan. Ketiga, harga katalog tidak boleh berubah ketika admin mengedit harga brosur. Keempat, produk dan asset yang hilang harus memiliki fallback rendering, bukan membuat seluruh campaign gagal.

Kelima, endpoint public hanya menampilkan campaign published aktif, sehingga status baru harus memiliki aturan mapping yang jelas. Keenam, role admin existing harus tetap menjadi sumber authorization. Ketujuh, `localStorage` dapat dipakai untuk draft recovery lokal, tetapi tidak boleh dianggap sebagai source of truth untuk histori lintas perangkat.

## 9. Rekomendasi Tahap Berikutnya

Setelah audit ini, tahap berikutnya adalah menyusun **Implementation Plan** terperinci dengan kolom feature, existing integration, required changes, risk level, priority, migration approach, testing approach, dan rollback. Implementation plan harus menetapkan Phase 1 yang realistis dan tidak mencoba membangun semua 30+ fitur prompt sekaligus.

Rekomendasi Phase 1 awal adalah memperkuat fondasi yang paling dekat dengan sistem existing: formal product snapshot contract, promo rule engine yang kompatibel dengan bulk pricing, campaign/template configuration, bundle model ringan, autosave terdebounce, smart text fit, dan print preflight. Setelah Phase 1 diuji, Phase 2 dapat menangani version history, permission matrix, approval workflow, audit log, asset library, brand snapshot, margin checker, dan minimum price protection.

**Status audit:** Selesai. Belum ada implementasi fitur baru berdasarkan prompt upgrade selain perubahan POP yang sudah ada sebelumnya.

## Referensi Internal

1. `README.md`
2. `admin/js/catalog-promo-pop.js`
3. `admin/catalog-promo-pop.html`
4. `promo_katalog.html`
5. `docs/gas_v63_blog_support.gs`
6. `docs/deploy_promo_flyers_schema.gs`
7. `assets/js/api-service.js`
8. `assets/js/config.js`
9. `admin/js/admin-auth.js`
10. `package.json`
11. `PROMPT—UPGRADESISTEMBROCHUREGENERATORPAKETSEMBAKO.COM.md`

> Dokumen audit ini dibuat sebelum implementation plan dan tidak mengubah source code aplikasi selain menambahkan laporan dokumentasi.
