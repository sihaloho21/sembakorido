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

## URL gambar dari Admin

Panel Admin → Pengaturan → Tampilan Kategori Beranda menyediakan:

- URL gambar publik;
- alt text;
- preview gambar;
- input upload JPG, PNG, atau WEBP.

URL yang dimasukkan akan divalidasi di browser dan divalidasi ulang oleh GAS sebelum disimpan melalui `upsert_setting`.

## Upload gambar dari Admin

Upload dibatasi di frontend dan backend:

- tipe: `image/jpeg`, `image/png`, `image/webp`;
- ukuran maksimum: 2 MB;
- nama file disanitasi oleh GAS;
- file disimpan di folder Google Drive yang ditentukan melalui Script Property;
- hasil upload berupa URL publik Drive, lalu URL tersebut diisi ke `image_url`;
- konfigurasi belum berubah sampai tombol **Simpan Showcase** ditekan.

Tambahkan patch [`gas_v72_category_showcase_images.gs`](gas_v72_category_showcase_images.gs) ke source GAS deployed. Set Script Property berikut:

```text
CATEGORY_SHOWCASE_IMAGE_FOLDER_ID=<ID folder Google Drive>
```

Folder tersebut harus dapat diakses oleh deployment Apps Script. Route upload harus diletakkan setelah authorization gate existing:

```javascript
if (String(payload.action || '') === 'upload_category_showcase_image') {
  return jsonOutput(handleCategoryShowcaseImageUpload(payload.data));
}
```

Jangan membuka route upload sebagai public action. Endpoint harus tetap melewati guard admin/superadmin existing.

## Endpoint publik

Frontend membaca konfigurasi melalui:

```text
?action=public_category_showcase_config
```

Handler publik GAS harus mengembalikan `image_url`, `image_alt`, dan `theme_color` yang sudah dinormalisasi. Patch v7.1 merged yang dipelihara di repository sudah mengikutsertakan field tersebut dalam response.
