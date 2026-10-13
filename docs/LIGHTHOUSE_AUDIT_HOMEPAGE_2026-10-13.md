# Audit Lighthouse Homepage `paketsembako.com`

Tanggal pengujian: **12–13 Oktober 2026**  
URL: `https://paketsembako.com/`  
Tool: Lighthouse CLI melalui Chromium headless  
Profil: mobile 412×915 dan desktop 1350×900  
Throttling: preset Lighthouse sesuai profil.

## Ringkasan skor

| Kategori | Mobile | Desktop | Interpretasi |
| --- | ---: | ---: | --- |
| Performance | **60** | **61** | Prioritas utama: LCP, latency dokumen, delivery gambar |
| Accessibility | **92** | **96** | Kontras dan ukuran target sentuh perlu diperbaiki |
| Best Practices | **93** | **96** | Ada Chrome DevTools issue terkait CSP |
| SEO | **100** | **100** | Tidak ada audit SEO Lighthouse yang gagal |

> Skor Lighthouse dapat berubah antar-run karena latency upstream/API, cache, dan data katalog dinamis. Gunakan tren beberapa run, bukan satu angka tunggal, sebagai KPI.

## Core Web Vitals dan metrik utama

| Metrik | Mobile | Desktop | Status |
| --- | ---: | ---: | --- |
| First Contentful Paint | 7,3 s | 1,6 s | Buruk di mobile, perlu optimasi critical path |
| Largest Contentful Paint | 10,5 s | 5,5 s | **Buruk pada kedua profil** |
| Speed Index | 9,4 s | 6,2 s | Buruk |
| Total Blocking Time | 356 ms | 0 ms | Mobile perlu perbaikan moderat |
| Cumulative Layout Shift | 0,003 | 0,010 | Baik |
| Time to Interactive | 13,2 s | 5,5 s | Lambat, terutama mobile |
| Max Potential FID | 320 ms | 150 ms | Mobile perlu perbaikan |
| Root document response | 1.580 ms | 1.041 ms | **Server response terlalu lambat** |

## Temuan utama

### 1. LCP adalah bottleneck terbesar — P0

Elemen LCP adalah banner promo utama:

```html
<img class="promo-banner-image"
     loading="eager"
     fetchpriority="high"
     width="1200"
     height="400">
```

Pada desktop, breakdown LCP menunjukkan:

- TTFB: **2.803 ms / 51%**;
- load delay: **1.875 ms / 34%**;
- image load: **565 ms / 10%**;
- render delay: **235 ms / 4%**.

Pada mobile, LCP sekitar **10,5 s**. Artinya masalah utama bukan hanya ukuran asset, tetapi **dokumen dan data katalog/banners menunggu terlalu lama sebelum banner dapat ditampilkan**.

Rekomendasi:

1. Render satu hero/banner kritis secara statis atau inline metadata dari server, bukan menunggu seluruh fetch katalog.
2. Jangan menunggu endpoint produk/promosi untuk menampilkan shell utama.
3. Pastikan banner LCP memakai URL yang dapat di-cache panjang dan format WebP/AVIF.
4. Tambahkan preload hanya untuk satu banner LCP yang benar-benar dipilih; jangan preload seluruh carousel.
5. Ukur ulang setelah memisahkan banner critical path dari API katalog.

### 2. Latency root document terlalu tinggi — P0

Lighthouse mencatat estimasi penghematan:

- Mobile: sekitar **1.210 ms**;
- Desktop: sekitar **940 ms**.

Root document terukur sekitar 1,04–1,58 detik sebelum browser mulai memproses halaman. Perlu dicek jalur deployment, origin server, edge cache, dan apakah static HTML benar-benar dilayani dari CDN terdekat.

Rekomendasi:

- pastikan HTML homepage memiliki cache policy yang tepat bila kontennya aman untuk stale-while-revalidate;
- aktifkan/validasi HTTP/2 atau HTTP/3 pada origin yang menyajikan 9 request non-HTTP/2;
- kurangi middleware/proxy hop sebelum static HTML;
- pisahkan data dinamis dari request dokumen awal;
- ukur TTFB langsung dari beberapa region sebelum dan sesudah perubahan.

### 3. Gambar produk external terlalu besar — P0/P1

Lighthouse menemukan estimasi penghematan sekitar:

- mobile: **1.330 KiB** pada image delivery;
- desktop: **1.044 KiB** pada image delivery;
- responsive sizing mobile: **1.192 KiB**;
- responsive sizing desktop: **736 KiB**.

Produk memakai URL JPG upstream `c.alfagift.id` dengan ukuran sumber sekitar 400×400/1024×1024, sementara sebagian tampil hanya sekitar 121×121 px pada mobile atau 226×226 px pada desktop. Beberapa gambar juga belum memakai WebP/AVIF.

Rekomendasi:

1. Gunakan image transformation/CDN resize berdasarkan slot tampilan, misalnya 160–240 px untuk kartu.
2. Gunakan `srcset`/`sizes` atau URL transformasi yang menghasilkan lebar sesuai device.
3. Pilih WebP/AVIF dari upstream bila endpoint mendukung content negotiation.
4. Pertahankan `loading="lazy"` untuk produk di bawah fold.
5. Jangan menjadikan API produk mengembalikan URL original besar bila kartu hanya membutuhkan thumbnail.

### 4. JavaScript dan CSS yang tidak terpakai — P1

Audit menemukan:

- JavaScript tidak terpakai: sekitar **44 KiB**;
- JavaScript belum diminifikasi penuh: sekitar **14 KiB**;
- CSS tidak terpakai: sekitar **11 KiB**;
- DOM homepage: sekitar **1.500 elemen**.

`assets/js/script.js` sekitar 60 KiB dan banyak fungsi halaman/modal dimuat meskipun tidak digunakan pada initial viewport.

Rekomendasi:

- pecah script berdasarkan halaman/fitur;
- gunakan `defer` dan dynamic import untuk modal, akun, checkout, tracking, serta fitur admin yang tidak diperlukan di homepage;
- lakukan tree-shaking atau bundling entrypoint homepage;
- purge CSS khusus halaman tanpa menggabungkan seluruh utility/komponen yang tidak dipakai;
- tunda render komponen promo/katalog yang berada di bawah fold.

### 5. Accessibility — P1

Temuan mobile dan desktop:

- `color-contrast` gagal;
- mobile juga gagal `target-size`;
- contoh kontras yang dilaporkan:
  - tombol promo hijau dengan teks putih: rasio sekitar **3,76**;
  - filter aktif hijau dengan teks putih: sekitar **2,53**;
  - harga lama abu-abu di atas putih: sekitar **2,53**;
  - badge diskon kecil: sekitar **3,76**.

Rekomendasi:

- gunakan hijau yang lebih gelap atau teks yang lebih gelap untuk tombol/filter;
- naikkan kontras harga lama dan metadata;
- jangan gunakan teks 8–12 px untuk informasi penting;
- pastikan tombol/filter mobile memiliki area sentuh minimal sekitar 44×44 px dan spacing cukup.

### 6. Best Practices / CSP Inspector issue — P1

Lighthouse mencatat `inspector-issues` terkait Content Security Policy pada resource gambar external, terutama domain produk `c.alfagift.id` dan `image.astronauts.cloud`.

Ini konsisten dengan status CSP yang sebelumnya masih Report-Only. Jangan langsung mengaktifkan enforcement tanpa verifikasi seluruh domain yang benar-benar dipakai.

Rencana aman:

1. kumpulkan seluruh violation CSP dari header Report-Only;
2. whitelist hanya origin yang benar-benar dibutuhkan;
3. pastikan `img-src` mencakup image CDN yang valid;
4. pertahankan `object-src 'none'`, `base-uri 'self'`, dan `frame-ancestors 'none'` bila kompatibel;
5. setelah tidak ada violation penting, ubah CSP dari Report-Only ke enforcement;
6. jalankan Lighthouse ulang setelah deployment.

## Hal yang sudah berjalan baik

- SEO: **100/100** pada mobile dan desktop.
- CLS sangat baik: **0,003 mobile** dan **0,010 desktop**.
- TBT desktop hampir nol.
- Logo WebP hasil PERF-02 memiliki cache immutable dan tidak lagi dirujuk sebagai PNG pada homepage.
- Lazy loading produk sudah terlihat pada markup katalog.

## Backlog prioritas

| Prioritas | Item | Acceptance criteria |
| --- | --- | --- |
| P0 | Percepat root document/TTFB | TTFB homepage konsisten <800 ms pada desktop region utama |
| P0 | Optimalkan banner LCP | LCP banner ter-request tanpa menunggu fetch katalog; desktop <2,5 s |
| P0 | Resize dan modernisasi product images | Estimasi image-delivery saving Lighthouse turun >80% |
| P1 | Split/defer JavaScript homepage | Unused JS turun dari ~44 KiB dan TTI mobile <6 s |
| P1 | Perbaiki contrast dan touch target | Accessibility minimal 98 dan tidak ada `color-contrast`/`target-size` failure |
| P1 | CSP enforcement bertahap | Tidak ada violation resource valid saat mode enforcement |
| P2 | Kurangi DOM dan CSS unused | DOM <1.000 elemen dan unused CSS <5 KiB |

## Artefak audit

- Mobile HTML: `audits/lighthouse-2026-10-12/homepage-mobile.report.html`
- Mobile JSON: `audits/lighthouse-2026-10-12/homepage-mobile.report.json`
- Desktop HTML: `audits/lighthouse-2026-10-12/homepage-desktop.report.html`
- Desktop JSON: `audits/lighthouse-2026-10-12/homepage-desktop.report.json`
