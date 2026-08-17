# Laporan Pengujian Integrasi API

Tanggal pengujian: 17 Agustus 2026

## Skrip

Skrip tersedia di `scripts/test-api-integration.mjs` dan dapat dijalankan dengan:

```bash
npm run test:api
```

Target dapat diubah melalui environment variable `UPSTREAM_URL` dan `PROXY_URL`.

## Skenario

| Pengujian | Hasil lokal |
|---|---:|
| Upstream health | PASS |
| Daftar katalog dengan limit | PASS |
| Pencarian katalog | PASS |
| Detail produk | PASS |
| Proxy same-origin `/api/products` | PASS |
| Tidak ada header CORS pada proxy | PASS |
| Link pembuka Promo POP | PASS |

Hasil lokal: **6/6 pemeriksaan berhasil**.

## Deployment saat ini

Pengujian terhadap URL Cloud Run `https://paket-sembako-online-943127658752.asia-southeast1.run.app` mendapatkan HTTP 200, tetapi responsnya masih berupa halaman frontend, bukan JSON API. Akibatnya pemeriksaan health dan katalog gagal pada deployment aktif. Ini menunjukkan Cloud Run belum dideploy ulang menggunakan commit API terbaru.

## Menjalankan uji end-to-end lokal

```bash
UPSTREAM_URL=http://127.0.0.1:3100 \\
PROXY_URL=http://127.0.0.1:3200 \\
node scripts/test-api-integration.mjs
```

Server upstream dan server proxy harus dijalankan terlebih dahulu pada port tersebut.
