
## Pengukuran production sesudah deploy

Commit PERF-01 dan perbaikan cache CI sudah masuk ke `main`, lalu payload production diukur ulang pada 12 Oktober 2026 menggunakan `Accept-Encoding: identity` dan `Accept-Encoding: br`.

| Route | Raw HTML | Brotli body | Raw TTFB | Brotli TTFB | Raw total | Brotli total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `/` | 166.892 B | 26.054 B | 2,846 s | 3,181 s | 4,275 s | 3,832 s |
| `/akun.html` | 90.516 B | 13.524 B | 2,886 s | 3,319 s | 3,568 s | 3,820 s |
| `/promo_katalog.html` | 67.542 B | 14.773 B | 3,111 s | 3,297 s | 4,495 s | 3,739 s |

Semua route mengembalikan HTTP 200. Asset CSS baru juga tersedia di production dengan HTTP 200 dan cache `public, max-age=2592000, immutable`:

- `/assets/css/index-inline.min.css` — 69.674 B raw
- `/assets/css/akun-inline.min.css` — 8.636 B raw
- `/assets/css/promo-katalog-inline.min.css` — 32.162 B raw

Perbandingan homepage terhadap baseline raw 276.141 B menunjukkan pengurangan **109.249 B atau 39,6%**. TTFB masih sekitar 2,8–3,2 detik dan menjadi pekerjaan reliability/deployment terpisah; pemindahan CSS mengurangi payload dan parsing HTML, tetapi tidak mengubah cold start backend.

## Status final PERF-01

- Source optimization: selesai.
- CSS inline pada tiga halaman utama: 0 karakter.
- Asset CSS minified dan cacheable: terverifikasi live.
- HTML production berkurang: terverifikasi live.
- CI cache stale: diperbaiki dan CI final lulus.
- Browser functional smoke test lintas device: tetap direkomendasikan sebagai langkah QA manual berikutnya.
