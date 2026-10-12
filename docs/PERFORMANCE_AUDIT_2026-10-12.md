
## Verifikasi production sesudah deploy

Commit `a8acc5d` sudah ter-deploy dan diverifikasi pada 12 Oktober 2026:

| Pemeriksaan | Hasil |
| --- | --- |
| Homepage `/` | HTTP 200, 167.158 B raw HTML |
| `/akun.html` | HTTP 200, 90.648 B raw HTML |
| `/promo_katalog.html` | HTTP 200, 67.607 B raw HTML |
| `assets/img/logo-optimized.webp` | HTTP 200, `image/webp`, 77.204 B |
| Cache logo WebP | `public, max-age=2592000, immutable` |
| Referensi WebP logo pada homepage | 7 |
| `loading="lazy"` pada homepage | 6 |
| Referensi `logo.png`/`logo-share.png` pada homepage | 0 |

PNG lama tetap merespons HTTP 200 untuk kompatibilitas direct URL, tetapi tidak lagi dirujuk markup halaman. CI PERF-02 juga lulus pada workflow `38206775302`.

**Status final PERF-02: selesai dan terverifikasi live.**
