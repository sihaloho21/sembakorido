# Presentasi PRD — Redesign Mobile Category Filters

## Cover
Redesign Mobile Category Filters
Membuat navigasi kategori produk lebih cepat, jelas, dan modern
Paket Sembako · Product & Frontend

## Slide 1
### Mengapa filter kategori perlu diperbarui?

- `#category-filters` saat ini sudah berfungsi sebagai horizontal chip carousel.
- Namun, pengguna mobile belum selalu memahami bahwa daftar kategori dapat digeser.
- Active state belum cukup kuat, indikator scroll belum merepresentasikan posisi nyata, dan kategori panjang mudah membuat rail terasa penuh.

**Fokus:** kurangi kebingungan dalam tiga hal — kategori aktif, kategori lain, dan dampak setiap tap.

## Slide 2
### Prinsip desain: cepat, terlihat, dan scalable

- **One-tap first:** kategori umum tetap dapat dipilih tanpa membuka modal.
- **Hierarchy jelas:** kategori aktif terlihat berbeda tanpa hanya mengandalkan warna.
- **Discoverable scroll:** edge fade dan posisi chip memberi sinyal bahwa masih ada konten.
- **Scalable:** kategori tambahan tetap mudah ditemukan meskipun katalog bertambah.

## Slide 3
### Konsep solusi: Compact Category Dock

- Blok filter ringkas di atas product grid.
- Baris header: ikon kategori, label `Kategori`, dan ringkasan seperti `Semua dipilih`.
- Chip rail satu baris dengan native touch scrolling dan snap alignment.
- Active chip menggunakan check icon, green fill, white text, dan shadow ringan.

> Satu komponen, satu sumber state, satu tap untuk memfilter.

## Slide 4
### Rail tetap cepat untuk kategori yang paling sering dipakai

- Hingga 5 kategori termasuk `Semua`: tampilkan seluruhnya di rail.
- Lebih dari 5 kategori: tampilkan `Semua`, tiga kategori pertama/relevan, lalu chip `Lainnya`.
- Edge fade hanya muncul ketika masih ada kategori di luar viewport.
- Chip terpilih otomatis di-scroll ke posisi yang terlihat atau mendekati tengah.

## Slide 5
### `Lainnya` membuka akses ke seluruh kategori

- Bottom sheet berjudul `Pilih kategori` menampilkan daftar lengkap.
- Layout dua kolom untuk kategori pendek; satu kolom untuk label yang lebih panjang.
- Tap di luar sheet, tombol close, dan tombol Escape menutup sheet tanpa mengubah pilihan.
- Memilih kategori langsung menerapkan filter, menutup sheet, dan memperbarui summary.

## Slide 6
### User flow yang lebih sederhana

1. Pengguna melihat label `Kategori` dan active summary.
2. Pengguna tap chip umum atau swipe rail untuk melihat kategori lain.
3. Sistem langsung memperbarui selected state dan product grid.
4. Jika kategori tidak terlihat, pengguna tap `Lainnya`.
5. Pengguna memilih kategori dari bottom sheet; sheet menutup otomatis.

**Target UX:** tidak ada tombol Apply tambahan untuk single-select category filter.

## Slide 7
### Visual direction: Paket Sembako yang lebih modern

| Komponen | Arah desain |
|---|---|
| Dock | White translucent surface, soft border, subtle blur |
| Active chip | Green fill, white text, check icon, medium shadow |
| Inactive chip | White surface, slate text, thin neutral border |
| Chip | Pill radius, tinggi 44–48px, jarak 8px |
| Typography | Plus Jakarta Sans, 12–13px semibold |
| Motion | Smooth scroll ringan; hormati `prefers-reduced-motion` |

**Tone:** clean, tactile, ringan, dan tetap konsisten dengan visual hijau-putih website.

## Slide 8
### Mobile-first, desktop tetap aman

- **320–374px:** rail paling compact, tanpa dekorasi yang tidak penting, tap target tetap minimal 44px.
- **375–767px:** Compact Category Dock lengkap dengan edge fade dan overflow sheet bila diperlukan.
- **768px ke atas:** arrow carousel desktop dan perilaku existing tetap dipertahankan.
- Container filter tidak boleh menyebabkan page-level horizontal overflow.

## Slide 9
### Aksesibilitas dan performa adalah bagian dari desain

- Gunakan native `button` untuk setiap kategori.
- Expose `aria-pressed="true/false"` pada selected state.
- Sediakan label rail: `Pilih kategori produk`.
- Bottom sheet memiliki dialog label, focus yang logis, close button, dan Escape support.
- Gunakan native scrolling dan CSS; jangan menambah request API atau memperlambat first product render.

## Slide 10
### Acceptance criteria dan rencana delivery

**Acceptance criteria utama**

- Berfungsi dan tetap nyaman pada viewport 320px.
- Active category selalu terlihat jelas dan dapat diumumkan screen reader.
- Tap chip langsung memfilter product grid melalui flow existing.
- `Lainnya` menyediakan seluruh kategori dan menutup setelah selection.
- Tidak ada page overflow atau console error baru.
- Desktop carousel tidak mengalami regresi.

**Rencana delivery**

1. Visual foundation: chip hierarchy, spacing, active state, edge fade.
2. Overflow experience: `Lainnya` dan bottom sheet.
3. QA: mobile narrow viewport, accessibility, reduced motion, desktop regression.

## Slide 11
### Rekomendasi keputusan

Adopsi **Compact Category Dock dengan conditional `Lainnya` bottom sheet**.

- Kategori umum tetap one-tap.
- Kategori tambahan tetap discoverable.
- UI tidak menjadi penuh ketika katalog bertambah.
- Implementasi berisiko rendah karena tetap memakai `currentCategory`, `setCategory()`, dan `filterProducts()` yang sudah ada.

**Next step:** validasi visual pada prototype mobile, lalu implementasikan Phase 1 tanpa mengubah logic filtering.
