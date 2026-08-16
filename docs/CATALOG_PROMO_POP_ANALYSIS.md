# Analisis Awal Catalog Promo POP (PRD Flyer)

Tanggal pemeriksaan: 2026-08-16

## Sumber

- Repositori sumber: https://github.com/sihaloho21/fitur-sembako-gemini
- Repositori target: https://github.com/sihaloho21/sembakorido
- PRD sumber: `PRD_CATALOG_PROMO_POP.md`
- Komponen utama: `src/components/PromoFlyerModal.tsx`
- Model data sumber: `src/types.ts`
- Data layer sumber: `src/services/storage.ts`

## Temuan utama

Catalog Promo POP saat ini terutama merupakan fitur frontend/client-side. `PromoFlyerModal.tsx` menerima daftar `products`, memilih produk, menerapkan diskon di memori, menyusun layout flyer, membuat QR code dengan library `qrcode`, mengekspor DOM ke PNG dengan `html-to-image`, mencetak melalui `window.print()`, dan membagikan teks/gambar ke WhatsApp. Preset flyer disimpan di `localStorage` dengan key `saved_pop_flyers`.

Fitur flyer tidak memanggil endpoint promo khusus. `src/services/storage.ts` pada repositori sumber menyimpan produk, pesanan, pengguna, dan konfigurasi melalui `localStorage`; server Express sumber berisi endpoint AI/video, bukan endpoint katalog promo atau penyimpanan flyer. Oleh karena itu, layer storage/server sumber tidak boleh dipindahkan sebagai backend promo ke target.

## Kontrak data yang diharapkan komponen sumber

Komponen memilih dan merender field produk berikut:

| Kebutuhan flyer | Field sumber |
|---|---|
| Identitas stabil | `id` |
| Nama | `name` |
| Kategori | `category` |
| Gambar | `image` |
| Harga dasar | `retailPrice` |
| Deskripsi | `description` |
| Unit penjualan | `unit` |
| Stok | `stock` |

Harga promo dihitung client-side dari `retailPrice` dan diskon per produk. Komponen juga menyediakan badge promo, banner, tema visual, grid fleksibel, watermark, QR, history preset, export PNG, print, dan share WhatsApp.

## Pipeline target sembakorido

`assets/js/script.js` target mengambil produk dari `ApiService.get('?sheet=products')` dan kategori dari `ApiService.get('?sheet=categories')`. Produk dinormalisasi menjadi object dengan field utama:

| Kebutuhan flyer | Field target / mapping awal |
|---|---|
| Identitas stabil | `productId`, fallback `id` / `sku` / `slug` |
| Nama | `nama` |
| Kategori | `category`, dari `kategori` atau fallback berbasis harga |
| Gambar | `gambar` atau field gambar dari row API; perlu verifikasi renderer final |
| Harga dasar | `harga` |
| Harga coret | `hargaCoret` dari `harga_coret` |
| Harga gajian | `hargaGajian` hasil `calculateGajianPrice` |
| Deskripsi | `deskripsi` dengan fallback default |
| Stok | `stok` |
| Variasi | `variations` dari JSON `variasi` |
| Harga grosir | `grosir` yang disanitasi |
| Visibilitas | `status` dan `isHidden` |

`ApiService` membangun URL memakai `CONFIG.getMainApiUrl()`, memiliki cache/retry/deduplication, dan menyediakan POST berbasis `FormData` jika nantinya diperlukan. Catalog Promo POP sebaiknya menggunakan data katalog target melalui `allProducts`/pipeline yang sama, bukan membuat endpoint atau sumber produk baru.

## Implikasi backend awal

1. Tidak ada backend promo khusus pada repositori sumber yang dapat langsung di-port.
2. Untuk versi awal, generator flyer dapat berjalan client-side dan tidak memerlukan tabel backend baru.
3. Adaptasi yang wajib adalah adapter field produk target ke shape yang diminta flyer, validasi produk aktif/terlihat/stok, serta pemilihan harga promo yang tidak mengubah harga dasar katalog.
4. Jika history flyer harus lintas perangkat/admin, diperlukan persistence baru (misalnya endpoint/tabel khusus) dan otorisasi; `localStorage` hanya cocok untuk preset per browser.
5. Jika campaign/broadcast hendak dihubungkan, tabel SQL `promo_campaign` target bersifat outbound broadcast dan bukan model komposisi flyer; integrasinya harus dibuat sebagai tahap terpisah.

## Status

Pemeriksaan masih pada tahap analisis. Belum ada perubahan kode pada `sembakorido` terkait Catalog Promo POP.

## Temuan tambahan dari pipeline promo target

`sembakorido/promo_katalog.html` sudah memiliki pipeline publik berbasis Google Sheets. Fungsi `loadCatalogs()` mengambil `?sheet=katalog_promo` melalui `CONFIG.getMainApiUrl()`, lalu menormalisasi field `id`, `title`, `month`, `period`, `start_date`, `end_date`, `pdf_url`, `badge`, `color`, `description`, dan `featured`. Halaman tersebut menampilkan katalog PDF, status aktif/berakhir/segera, preview, dan download; bukan flyer yang dirakit dari produk.

Target juga memiliki admin manager untuk sheet `katalog_promo` dengan pola CRUD melalui `GASActions.create/update/delete`, termasuk aturan satu katalog unggulan. Ini adalah pola backend yang sudah tersedia jika preset/flyer nantinya perlu dipublikasikan atau disimpan lintas perangkat.

Kesimpulan integrasi: Catalog Promo POP dapat dimulai sebagai generator privat client-side yang mengambil data dari `?sheet=products` dan menyimpan preset di `localStorage`. Untuk katalog flyer publik lintas perangkat, struktur `katalog_promo` saat ini belum cukup karena hanya menyimpan metadata PDF. Opsi backend tahap berikutnya adalah menambah sheet/kontrak terpisah untuk `promo_flyers` atau menyimpan hasil PNG/PDF beserta konfigurasi flyer, tanpa mengubah kontrak `products`.
