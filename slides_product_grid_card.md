# Presentasi — Redesign Product Grid Card

## Cover
**Redesign Product Grid Card**
Structured Product Card untuk Paket Sembako
PRD v1.0 · Product & Frontend Team

## Slide 1
**Product card adalah titik keputusan utama**

- Pengguna perlu memahami produk tanpa membuka detail.
- Informasi inti: gambar, nama, harga, unit, stok, dan aksi.
- Fokus redesign: cepat dipindai, mudah dibandingkan, dan mudah ditambahkan ke keranjang.

## Slide 2
**Fondasi visual sudah ada, sistemnya belum lengkap**

- Class existing: `bg-white rounded-lg md:rounded-xl shadow-md md:shadow-lg hover:shadow-xl transition duration-300 relative`.
- Fondasi memberi background, radius, elevation, hover, dan positioning.
- Yang perlu diperkuat: hierarki, tinggi kartu, CTA, stok, feedback, dan responsive behavior.

## Slide 3
**Masalah UX paling terasa di mobile**

- Nama produk panjang dapat mendorong harga atau CTA.
- Rasio gambar yang berbeda membuat grid tidak stabil.
- Status stok dan aksi tambah belum selalu terbaca sejak awal.
- Area sentuh dan feedback perlu dibuat lebih jelas.

## Slide 4
**Solusi: Structured Product Card**

- Satu struktur konsisten: media → informasi → harga → status → action zone.
- Mempertahankan identitas putih-hijau Paket Sembako.
- Mengurangi ketergantungan pada shadow sebagai satu-satunya pembentuk hierarki.
- Tidak mengubah API, data produk, aturan harga, atau checkout.

## Slide 5
**Struktur kartu mengarahkan mata ke keputusan**

- Media: rasio tetap, `object-fit: contain`, placeholder stabil.
- Informasi: nama maksimal 2–3 baris dan unit sebagai metadata.
- Harga: harga aktif paling dominan; harga lama sekunder.
- Aksi: CTA atau quantity control selalu berada di zona bawah.

## Slide 6
**Mobile: ringkas, terbaca, dan mudah disentuh**

- Dua kolom ketika lebar layar memungkinkan.
- Target sentuh utama minimal sekitar 44 × 44 px.
- Hover tidak menjadi sumber informasi penting.
- Line clamp menjaga tinggi kartu tanpa menutupi harga atau CTA.

## Slide 7
**Desktop: rapi untuk membandingkan produk**

- Tinggi kartu dan baseline area aksi dibuat konsisten.
- Ruang tambahan dipakai untuk breathing room, bukan informasi berlebih.
- Hover hanya memberi elevation atau translate ringan.
- Grid tetap mendukung perbandingan beberapa produk dalam satu baris.

## Slide 8
**Status stok dan CTA harus selalu jujur**

- Tersedia: CTA aktif dengan label status positif.
- Stok terbatas: label amber/oranye dan CTA tetap aktif.
- Stok habis: teks status jelas dan CTA disabled.
- Warna bukan satu-satunya pembeda; status selalu memiliki teks.

## Slide 9
**Interaction states menghilangkan keraguan**

- Default: harga dan CTA langsung terlihat.
- Loading: skeleton mempertahankan ukuran kartu.
- Added: quantity atau status diperbarui tanpa layout jump.
- Error: pesan singkat dan actionable.
- Focus-visible dan pressed state konsisten di seluruh kontrol.

## Slide 10
**Aksesibilitas dan performa dibangun sejak awal**

- Alt text gambar dan accessible name pada setiap kontrol.
- Keyboard focus tetap terlihat setelah state berubah.
- Lazy loading dan dimensi gambar mencegah layout shift.
- Event delegation dipertahankan untuk mencegah listener berlebihan.
- `prefers-reduced-motion` dihormati.

## Slide 11
**Acceptance criteria dan prioritas implementasi**

- P0: struktur konsisten, harga jelas, CTA terlihat, state stok valid, feedback add-to-cart.
- P1: placeholder gambar, line clamp, quantity control, focus state, accessible labels.
- P2: wishlist dan micro-interaction tambahan.
- Done ketika tidak ada regression pada filter, pagination, detail produk, dan cart.

## Slide 12
**Keputusan desain**

> Gambar → nama produk → harga → status → aksi

- Product card harus terasa sederhana, cepat dipahami, dan langsung digunakan.
- Visual yang rapi mendukung keputusan; dekorasi tidak boleh memperlambatnya.
- Langkah berikutnya: implementasi bertahap dan browser verification pada mobile serta desktop.
