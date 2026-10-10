# Audit Performa paketsembako.com — 10 Oktober 2026

## Ringkasan

PERF-01 memindahkan inline CSS dari halaman katalog utama, akun, dan promo ke asset CSS eksternal yang sudah diminifikasi. Tujuannya mengurangi ukuran HTML awal, mengaktifkan cache browser/CDN untuk CSS, dan mengurangi pekerjaan parsing HTML.

## Baseline live sebelum PERF-01

Pengukuran dilakukan terhadap `https://paketsembako.com/` sebelum perubahan PERF-01 dipush:

| Metrik | Hasil |
| --- | ---: |
| HTTP status | 200 |
| HTML body lokal | 276.141 byte |
| Content-Encoding | Brotli |
| TTFB | 3,357 detik |
| Total waktu request | 4,719 detik |
| Cache-Control | `no-cache, max-age=0, must-revalidate` |
| CSP | `Content-Security-Policy-Report-Only` |
| HSTS | `max-age=31536000` |
| Permissions-Policy | tersedia |

> TTFB dan total waktu dapat dipengaruhi kondisi jaringan, cold start, dan platform deployment. Angka ini dipakai sebagai baseline observasi, bukan benchmark laboratorium.

## Perbandingan source sebelum/sesudah

Baseline diambil dari commit sebelum perubahan PERF-01 dan dibandingkan dengan working tree setelah optimasi.

| Halaman | HTML sebelum | HTML sesudah | Pengurangan HTML | Inline CSS sebelum | Inline CSS sesudah | CSS eksternal minified |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `index.html` | 276.124 B | 166.875 B | 109.249 B (-39,6%) | 109.300 | 0 | 69.674 B |
| `akun.html` | 104.946 B | 90.512 B | 14.434 B (-13,8%) | 14.484 | 0 | 8.636 B |
| `promo_katalog.html` | 108.437 B | 67.520 B | 40.917 B (-37,7%) | 40.976 | 0 | 32.162 B |
| **Total** | **489.570 B** | **324.950 B** | **164.620 B (-33,6%)** | **164.760** | **0** | **110.472 B** |

## Smoke test lokal sesudah optimasi

Server Node dijalankan lokal pada port 8098 dengan Brotli/gzip negotiation aktif.

| URL | Status | Body terkompresi | TTFB | Total |
| --- | ---: | ---: | ---: | ---: |
| `/` | 200 | 26.054 B | 0,025 s | 0,026 s |
| `/akun.html` | 200 | 13.524 B | 0,008 s | 0,008 s |
| `/promo_katalog.html` | 200 | 14.773 B | 0,006 s | 0,006 s |
| `/assets/css/index-inline.min.css` | 200 | 12.355 B | 0,006 s | 0,006 s |

Angka lokal tidak dapat dibandingkan langsung dengan TTFB production karena tidak melalui TLS, CDN, atau cold start deployment. Fungsinya adalah memastikan route, asset CSS, dan compression tetap bekerja.

## Perubahan yang dilakukan

- `index.html` menggunakan `assets/css/index-inline.min.css`.
- `akun.html` menggunakan `assets/css/akun-inline.min.css`.
- `promo_katalog.html` menggunakan `assets/css/promo-katalog-inline.min.css`.
- CSS hasil ekstraksi diminifikasi menggunakan cssnano.
- Tidak ada perubahan pada alur JavaScript, API, checkout, atau data transaksi.
- Regression test existing tetap dijalankan setelah ekstraksi.

## Verifikasi

Lulus pada mesin lokal:

```text
node --check server.js
npm run test:sensitive-files
npm test
 git diff --check
```

CI juga harus mengulang pengukuran setelah deployment. Acceptance live PERF-01:

1. `https://paketsembako.com/` menampilkan katalog normal.
2. CSS eksternal baru menerima HTTP 200.
3. Tidak ada console error terkait stylesheet.
4. Ukuran HTML production turun mendekati source result.
5. TTFB production diukur ulang pada kondisi request yang sama.
6. Cache header asset CSS dapat digunakan untuk kunjungan berikutnya.

## Kesimpulan

PERF-01 menghasilkan pengurangan HTML source sebesar **164.620 byte atau 33,6%** pada tiga halaman utama dan menghapus **164.760 karakter inline CSS**. Dampak terhadap pengguna production belum final sampai commit dideploy dan baseline live diukur ulang dengan metode yang sama.
