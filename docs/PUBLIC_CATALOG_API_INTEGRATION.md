# Integrasi Public Catalog API

Repositori `fitur-sembako-gemini` menyediakan API katalog read-only yang dapat dipanggil dari website lain. API ini bersifat publik sesuai kebutuhan integrasi, sehingga **jangan mengirim data pribadi, PIN, token, atau operasi admin** melalui endpoint ini.

## Base URL

```text
https://paket-sembako-online-943127658752.asia-southeast1.run.app
```

## Endpoint

| Method | Endpoint | Kegunaan |
|---|---|---|
| `GET` | `/api` | Melihat metadata dan daftar endpoint |
| `GET` | `/api/health` | Memeriksa status layanan |
| `GET` | `/api/catalog/categories` | Mengambil daftar kategori |
| `GET` | `/api/catalog/products` | Mengambil katalog produk |
| `GET` | `/api/catalog/products/:id` | Mengambil satu produk berdasarkan ID |
| `GET` | `/api/catalog/store` | Mengambil konfigurasi publik toko |

## Contoh respons katalog

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "prod-1",
        "name": "Beras Medium Ramos Super 5kg",
        "category": "Beras",
        "unit": "Karung 5kg",
        "retailPrice": 72000,
        "stock": 85,
        "image": "https://...",
        "description": "...",
        "priceTiers": [
          { "minQty": 1, "pricePerUnit": 72000, "label": "Eceran" }
        ]
      }
    ],
    "total": 1,
    "limit": 100,
    "offset": 0
  }
}
```

Field `hpp` atau harga modal sengaja tidak disertakan pada respons publik. Parameter katalog yang tersedia adalah `q`, `category`, `limit`, dan `offset`.

## Contoh pemakaian dari website lain

```javascript
const API_BASE = 'https://paket-sembako-online-943127658752.asia-southeast1.run.app';

async function loadProducts({ q = '', category = '', limit = 20, offset = 0 } = {}) {
  const params = new URLSearchParams({ q, category, limit, offset });
  const response = await fetch(`${API_BASE}/api/catalog/products?${params}`);
  if (!response.ok) throw new Error(`API error: HTTP ${response.status}`);
  const payload = await response.json();
  return payload.data.items;
}
```

API mengizinkan akses lintas domain melalui CORS. Untuk beban tinggi, gunakan cache di website pemanggil dan manfaatkan header cache dari server. Endpoint ini bersifat **read-only**; checkout, perubahan stok, data pengguna, dan operasi admin tetap harus memakai backend internal yang memiliki kontrol akses.
