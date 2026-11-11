# Category Showcase: Fixed-Left Image

## Struktur `category_showcase_config` versi 2

```json
{
  "version": 2,
  "enabled": true,
  "background_color": "#f0fdf4",
  "categories": [
    {
      "category": "Makanan Ringan",
      "enabled": true,
      "sort_order": 1,
      "max_products": 8,
      "image_url": "https://example.com/promo-makanan-ringan.webp",
      "image_alt": "Promo makanan ringan",
      "theme_color": "#f51edb"
    }
  ]
}
```

`image_url` harus menggunakan `http://` atau `https://`. Jika kosong, storefront menampilkan placeholder dan rail produk tetap berfungsi. `image_alt` digunakan untuk aksesibilitas. `theme_color` mengatur warna latar baris tersebut; jika tidak valid, backend menggunakan `background_color`.

## Perilaku frontend

Setiap section menggunakan dua area terpisah:

- `.category-showcase-promo`: gambar tetap di sisi kiri.
- `.category-showcase-track`: satu-satunya area yang dapat digeser secara horizontal.

Pada mobile, gambar tetap di kiri dengan lebar yang lebih kecil. Karena gambar tidak berada di dalam `.category-showcase-track`, swipe produk tidak menggeser gambar.

## Pengaturan URL gambar dari Admin
Panel Admin → Pengaturan → Tampilan Kategori Beranda menggunakan URL gambar publik; unggah file foto tidak disediakan. Tempel URL yang diawali `http://` atau `https://`, lalu gunakan pratinjau untuk memeriksa gambar sebelum menyimpan. Alt text tetap tersedia untuk aksesibilitas. Jika URL kosong, storefront menampilkan placeholder dan rail produk tetap berfungsi.

URL divalidasi di browser dan divalidasi ulang oleh GAS sebelum disimpan melalui `upsert_setting`. Perubahan konfigurasi baru diterapkan setelah tombol **Simpan Showcase** ditekan.

## Endpoint publik

Frontend membaca konfigurasi melalui:

```text
?action=public_category_showcase_config
```

Handler publik GAS harus mengembalikan `image_url`, `image_alt`, dan `theme_color` yang sudah dinormalisasi. Patch v7.1 merged yang dipelihara di repository sudah mengikutsertakan field tersebut dalam response.
