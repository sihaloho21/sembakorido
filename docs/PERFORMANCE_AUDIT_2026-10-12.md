# Audit Performa Gambar — PERF-02

Tanggal: 12 Oktober 2026  
Repository: `sihaloho21/sembakorido`  
Scope: optimasi asset gambar, pencegahan layout shift, dan lazy loading selektif.

## Temuan baseline

Inventarisasi source menemukan:

| Asset | Ukuran baseline | Catatan |
| --- | ---: | --- |
| `assets/img/logo.png` | 1.058.482 B | PNG RGBA 1536×1024 |
| `assets/img/logo-share.png` | 1.058.482 B | Identik byte-for-byte dengan `logo.png` |
| `assets/images/grocery.gif` | 1.039.796 B | Animasi 77 frame, dipakai hanya pada timeline order |
| `assets/images/grocery-basket.gif` | 828.860 B | Animasi 45 frame, dipakai hanya pada timeline order |
| `assets/images/success-shield.gif` | 597.913 B | Animasi 44 frame |
| `assets/images/wait.gif` | 563.251 B | Animasi 73 frame |
| `assets/images/shipping.gif` | 433.147 B | Animasi 27 frame |
| katalog PDF terbesar | 887.838 B | Dibuka melalui link/catalog action, bukan initial image request |

## Perubahan yang diterapkan

### 1. Logo WebP production

PNG logo asli dikonversi secara deterministik ke `assets/img/logo-optimized.webp` dengan:

- ukuran 1200×800;
- transparansi RGBA tetap dipertahankan;
- kualitas WebP 90;
- ukuran output 77.204 B (sekitar 75 KB).

Semua referensi halaman terhadap `logo.png` dan `logo-share.png` diganti ke asset WebP baru. File PNG asli tetap disimpan sebagai fallback/arsip kompatibilitas, tetapi tidak lagi dirujuk oleh halaman.

Penghematan dari satu download logo:

- `logo.png` → `logo-optimized.webp`: **981.278 B atau 92,7% lebih kecil**.
- Dua file PNG identik tidak lagi perlu menjadi dua referensi berbeda.

### 2. Layout stability

Dimensi intrinsik ditambahkan pada logo (`width="1200" height="800"`) dan beberapa gambar UI lokal agar browser dapat mencadangkan ruang sebelum image decode selesai.

### 3. Lazy loading selektif

`loading="lazy"` dan `decoding="async"` ditambahkan pada asset yang tidak dibutuhkan untuk initial render:

- empty basket image;
- gift box pada area akun;
- QRIS yang berada di area checkout/payment UI;
- thumbnail katalog admin yang dibuat dinamis.

Logo header dan gambar produk utama tidak dipaksa lazy agar tidak menunda visual penting/LCP.

### 4. Regression test

Ditambahkan `npm run test:image-performance`, yang memvalidasi:

- asset WebP memiliki signature RIFF/WEBP dan tetap di bawah 100 KB;
- halaman utama tidak lagi merujuk PNG logo 1 MB;
- gambar non-kritis memiliki `loading="lazy"` serta dimensi;
- test masuk ke `npm test`.

## Keputusan GIF dan PDF

GIF timeline order tidak dimuat pada initial page HTML; asset baru diminta saat pengguna membuka detail tracking order. Karena GIF bersifat animasi dan perubahan format dapat mengubah timing/transparency, konversi animated WebP dipisahkan dari perubahan PERF-02 ini agar tidak mengubah UX transaksi tanpa visual regression test.

PDF katalog juga tidak di-embed atau diunduh pada initial render. File hanya digunakan sebagai target download/open setelah pengguna memilih katalog. Optimasi PDF dapat menjadi subtask terpisah dengan validasi kualitas dokumen.

## Validasi

```text
npm run test:image-performance       passed
npm run test:sensitive-files         passed
npm test                             passed
```

Status source PERF-02: **selesai**. Verifikasi payload live dilakukan setelah deployment commit ini.
