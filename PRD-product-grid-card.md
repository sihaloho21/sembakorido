# PRD — Redesign Product Grid Card

**Produk:** Paket Sembako
**Komponen:** Product card pada `#product-grid`
**Class saat ini:** `bg-white rounded-lg md:rounded-xl shadow-md md:shadow-lg hover:shadow-xl transition duration-300 relative`
**Versi dokumen:** 1.0
**Status:** Ready for design and implementation
**Pemilik:** Product & Frontend Team
**Bahasa UI:** Bahasa Indonesia

---

## 1. Ringkasan Eksekutif

Dokumen ini mendefinisikan redesign kartu produk pada product grid agar pengalaman menjelajah, membandingkan, dan menambahkan produk ke keranjang menjadi lebih cepat, jelas, dan konsisten pada mobile maupun desktop. Redesign tidak mengubah sumber data produk atau alur checkout. Fokusnya adalah memperbaiki hierarki informasi, keterbacaan harga dan stok, visibilitas aksi utama, konsistensi ukuran kartu, serta feedback interaksi.

Komponen existing memiliki fondasi visual yang baik melalui `bg-white`, rounded corner, shadow, hover state, dan `relative positioning`. Namun, class tersebut belum mendefinisikan sistem layout kartu secara lengkap. Karena itu, pekerjaan redesign perlu mengembangkan fondasi tersebut menjadi sistem product card yang memiliki struktur tetap, state yang terukur, serta perilaku responsive yang konsisten.

> **Prinsip utama:** pengguna harus dapat memahami produk, harga, ketersediaan, dan tindakan utama tanpa membuka detail produk terlebih dahulu.

---

## 2. Latar Belakang dan Masalah

Product grid merupakan area utama untuk menemukan produk. Pada layar kecil, kartu yang terlalu padat dapat menyebabkan nama produk terpotong, harga sulit dipindai, dan tombol tambah ke keranjang tidak cukup jelas. Pada desktop, kartu dengan tinggi konten yang berbeda dapat membuat grid terlihat tidak rapi dan menyulitkan perbandingan antarproduk.

Class existing menyediakan visual dasar, tetapi belum secara eksplisit mengatur beberapa hal penting berikut:

| Area | Risiko UX saat ini | Dampak |
|---|---|---|
| Hierarki informasi | Nama, harga, unit, promo, dan stok dapat memiliki bobot visual yang sama | Pengguna membutuhkan waktu lebih lama untuk memahami kartu |
| Tinggi kartu | Panjang nama dan deskripsi berbeda-beda | Baris grid tampak tidak sejajar |
| CTA | Aksi tambah ke keranjang dapat kalah menonjol dibanding konten lain | Conversion ke keranjang berpotensi menurun |
| Gambar produk | Rasio dan ruang gambar tidak selalu konsisten | Grid terlihat tidak stabil saat gambar berbeda ukuran |
| Status stok | Produk habis atau terbatas belum tentu terlihat sejak awal | Pengguna dapat memilih produk yang tidak tersedia |
| Mobile interaction | Area sentuh kecil atau terlalu dekat dengan aksi lain | Risiko salah klik meningkat |
| Feedback | Status berhasil ditambahkan belum selalu terlihat kuat | Pengguna tidak yakin apakah aksi berhasil |

---

## 3. Tujuan Produk

Redesign ini memiliki tujuan utama untuk membuat setiap kartu produk lebih mudah dipindai dan digunakan pada semua ukuran layar. Tujuan tersebut diwujudkan melalui layout kartu yang konsisten, penekanan harga dan CTA, status stok yang jelas, serta interaksi yang memberikan feedback langsung tanpa mengganggu browsing.

### Sasaran keberhasilan

| Sasaran | Indikator keberhasilan |
|---|---|
| Scanability | Nama, harga, unit, dan CTA dapat ditemukan secara visual tanpa membaca seluruh kartu |
| Konsistensi | Kartu dalam satu baris memiliki baseline konten dan area CTA yang sejajar |
| Mobile usability | Semua target sentuh utama memiliki area minimal sekitar 44 × 44 px |
| Responsivitas | Tidak ada layout shift signifikan ketika gambar atau data produk selesai dimuat |
| Feedback | Aksi tambah ke keranjang menghasilkan feedback visual dan/atau toast yang jelas |
| Accessibility | Status dan kontrol utama dapat dipahami melalui keyboard dan screen reader |

Dokumen ini menggunakan target kualitas sebagai acceptance criteria produk, bukan sebagai klaim performa yang sudah tercapai.

---

## 4. Non-Goals

Redesign ini tidak mencakup perubahan pada checkout, metode pembayaran, struktur API, model data produk, sistem login, atau algoritma pencarian. Redesign juga tidak mengubah aturan harga, perhitungan stok, atau kebijakan promo. Perubahan hanya boleh memengaruhi presentasi data dan interaksi pada product card, selama kontrak fungsi existing tetap dipertahankan.

---

## 5. Target Pengguna dan User Stories

Target pengguna adalah pembeli Paket Sembako yang menjelajah melalui mobile maupun desktop, termasuk pengguna yang mencari produk tertentu, membandingkan beberapa produk, atau ingin menambahkan item secara cepat.

### User stories

1. Sebagai pengguna mobile, saya ingin memahami nama, harga, dan ukuran produk dengan cepat tanpa membuka detail produk.
2. Sebagai pengguna, saya ingin mengetahui apakah produk tersedia sebelum menekan tombol tambah ke keranjang.
3. Sebagai pengguna, saya ingin menambahkan produk dengan satu tindakan yang mudah ditemukan.
4. Sebagai pengguna, saya ingin melihat perubahan kuantitas secara langsung setelah menambahkan produk.
5. Sebagai pengguna desktop, saya ingin membandingkan beberapa kartu dalam satu baris dengan layout yang rapi.
6. Sebagai pengguna keyboard atau assistive technology, saya ingin mengetahui nama kontrol, status stok, dan hasil aksi dengan jelas.

---

## 6. Konsep Solusi

Konsep yang direkomendasikan adalah **Structured Product Card**. Kartu dibagi menjadi area yang konsisten: media produk, badge/status, informasi utama, harga, dan action zone. Struktur ini mempertahankan estetika putih dan hijau yang sudah digunakan website, tetapi mengurangi ketergantungan pada shadow sebagai satu-satunya pembentuk hierarki.

### Struktur visual yang direkomendasikan

```text
┌──────────────────────────────┐
│ Badge promo       Wishlist   │  ← overlay ringan, jika tersedia
│                              │
│        Gambar produk        │  ← rasio tetap
│                              │
├──────────────────────────────┤
│ Nama produk                  │  ← maksimal 2–3 baris
│ Deskripsi singkat / unit     │  ← informasi sekunder
│                              │
│ Harga utama                  │  ← fokus terbesar
│ Harga lama / promo           │  ← bila ada
│                              │
│ [−] 1 [+]     [Tambah]       │  ← area aksi konsisten
└──────────────────────────────┘
```

Pada mobile, kartu harus tetap ringkas dan tidak memaksa pengguna membaca deskripsi panjang. Pada desktop, ruang tambahan dapat digunakan untuk memberi napas visual, bukan untuk menambah informasi yang tidak esensial.

---

## 7. Functional Requirements

### 7.1 Media dan gambar produk

Setiap kartu harus memiliki area gambar dengan rasio dan tinggi visual yang konsisten. Gambar harus menggunakan `object-fit: contain` atau perilaku equivalent agar produk tidak terpotong. Selama gambar belum tersedia, tampilkan skeleton atau placeholder dengan dimensi yang sama untuk mencegah layout shift.

Gambar harus memiliki `alt` yang informatif, misalnya `"Beras Ramos 5 kg"`. Jika nama produk sudah tampil sebagai teks yang berdekatan dan implementasi menggunakan gambar dekoratif, `alt` dapat disesuaikan agar tidak terjadi pembacaan ganda oleh screen reader.

### 7.2 Nama produk

Nama produk adalah elemen teks utama setelah gambar. Nama harus memiliki kontras tinggi, bobot medium atau semibold, dan line clamp maksimal dua atau tiga baris sesuai breakpoint. Tinggi area nama harus dikunci secara visual agar CTA tetap sejajar antar kartu.

Jika nama produk dipotong, pengguna tetap harus dapat mengakses nama lengkap melalui detail produk, tooltip yang tidak mengganggu, atau accessible label. Jangan memotong nama tanpa menyediakan cara untuk memahami nama lengkap.

### 7.3 Harga dan unit

Harga utama harus menjadi salah satu elemen paling menonjol di kartu. Format harga wajib konsisten dengan format Rupiah yang digunakan aplikasi. Unit produk, seperti `per kg`, `per pcs`, atau `1 paket`, harus tampil dekat dengan harga dan memiliki bobot visual sekunder.

Jika terdapat harga promo, harga aktif harus lebih dominan, harga lama menggunakan strikethrough dan warna sekunder, serta badge promo harus menjelaskan konteks tanpa menutupi gambar produk.

### 7.4 Status stok

Status stok harus dapat dipahami tanpa membuka detail produk. Gunakan minimal tiga state:

| State | Tampilan | Perilaku CTA |
|---|---|---|
| Tersedia | Label hijau atau teks stok ringkas | CTA aktif |
| Stok terbatas | Label amber/oranye dengan teks yang jelas | CTA tetap aktif, tetapi memberi peringatan |
| Habis | Label merah atau netral dengan teks “Stok habis” | CTA disabled dan tidak dapat menambah ke keranjang |

Warna tidak boleh menjadi satu-satunya pembeda status; teks harus selalu tersedia.

### 7.5 CTA tambah ke keranjang

CTA utama harus terlihat jelas pada bagian bawah kartu. Pada mobile, area sentuh minimal sekitar 44 × 44 px. Label dapat berupa `Tambah`, `Tambah ke keranjang`, atau icon-plus dengan accessible label, tetapi konsistensi harus dipertahankan di seluruh grid.

Setelah aksi berhasil, tombol harus memberikan feedback seperti perubahan label singkat, animasi ringan, update quantity, atau toast. Feedback tidak boleh menyebabkan kartu berpindah posisi atau mengganggu scroll pengguna.

### 7.6 Quantity control

Jika produk sudah berada di keranjang, kartu dapat menampilkan quantity control dengan tombol minus, jumlah item, dan plus. Control harus tetap memiliki target sentuh yang memadai serta label aksesibilitas yang menjelaskan produk terkait.

Jika implementasi saat ini menggunakan tombol tambah langsung, quantity control dapat muncul setelah aksi pertama berhasil. Perilaku harus konsisten dengan sumber data keranjang existing.

### 7.7 Detail produk

Klik pada area kartu atau gambar dapat membuka detail produk, tetapi area CTA, quantity control, wishlist, dan elemen interaktif lain tidak boleh ikut memicu navigasi detail secara tidak sengaja. Event propagation harus ditangani secara eksplisit.

---

## 8. Visual Design Specification

### 8.1 Card container

Class existing `bg-white rounded-lg md:rounded-xl shadow-md md:shadow-lg hover:shadow-xl transition duration-300 relative` dapat dipertahankan sebagai fondasi, dengan penyesuaian berikut:

| Property | Mobile | Desktop |
|---|---|---|
| Background | Putih solid | Putih solid |
| Radius | `rounded-xl` atau setara | `rounded-2xl` atau setara |
| Shadow default | Ringan dan halus | Sedang, tidak terlalu berat |
| Hover | Hanya pada perangkat yang mendukung hover | Shadow dan translate sangat ringan |
| Border | Border sangat halus opsional | Border halus opsional |
| Overflow | `overflow-hidden` bila media membutuhkan clipping | Sama, selama tidak memotong badge penting |
| Position | `relative` | `relative` |

Shadow tidak boleh menjadi terlalu gelap karena dapat membuat grid terlihat berat. Pada mobile touch device, jangan mengandalkan hover untuk menyampaikan informasi penting.

### 8.2 Spacing

Gunakan spacing internal yang konsisten. Area gambar harus memiliki padding yang cukup, sedangkan area informasi harus menjaga jarak antara nama, unit, harga, status, dan CTA. Hindari penggunaan padding yang berbeda-beda berdasarkan panjang konten produk.

### 8.3 Warna

Palet disarankan mengikuti identitas existing:

- Hijau utama untuk CTA aktif dan state selected.
- Hijau muda untuk background status positif atau promo ringan.
- Slate atau gray gelap untuk nama dan harga.
- Gray medium untuk unit dan metadata.
- Amber untuk stok terbatas.
- Red atau slate netral untuk stok habis.

Gunakan warna secara hemat. Satu kartu sebaiknya tidak memiliki terlalu banyak aksen warna sekaligus.

---

## 9. Responsive Behavior

### Mobile: hingga 767 px

Product grid harus memprioritaskan keterbacaan, touch interaction, dan kecepatan scan. Kartu dapat menggunakan dua kolom jika lebar layar memungkinkan. Gambar, nama, harga, dan CTA harus tetap terlihat tanpa membuat kartu terlalu tinggi. Hover-only behavior harus dinonaktifkan atau tidak menjadi requirement.

Tombol interaktif tidak boleh terlalu rapat dengan tepi kartu maupun tombol lain. Jika nama produk panjang, line clamp harus menjaga tinggi area tanpa menutupi harga atau CTA.

### Tablet: 768–1023 px

Gunakan layout grid yang memberi ruang lebih untuk gambar dan informasi. Ukuran teks dapat meningkat secara moderat. Quantity control dan CTA harus tetap memiliki struktur yang sama agar pengalaman tidak terasa berubah secara drastis.

### Desktop: mulai 1024 px

Grid harus mendukung perbandingan beberapa produk dalam satu baris. Semua kartu dalam satu row perlu menjaga tinggi relatif konsisten. Hover boleh menambahkan elevation ringan atau translate maksimal beberapa piksel, tetapi tidak boleh membuat kartu lain bergeser secara mengganggu.

---

## 10. Interaction States

Setiap kartu perlu mendukung state berikut:

| State | Requirement |
|---|---|
| Default | Kartu terlihat stabil dengan harga dan CTA jelas |
| Hover | Hanya aktif pada device yang mendukung hover; elevation ringan |
| Focus-visible | Outline kontras pada kontrol yang sedang difokuskan |
| Pressed | Feedback singkat tanpa animasi berlebihan |
| Loading | Skeleton mempertahankan ukuran kartu |
| Added | Quantity atau status berhasil ter-update tanpa layout jump |
| Limited stock | Label stok terbatas terlihat sebelum CTA ditekan |
| Out of stock | CTA disabled, label status tetap terbaca |
| Error | Pesan singkat dan actionable jika penambahan gagal |
|

Transisi harus singkat dan tidak menghambat tindakan. Hormati `prefers-reduced-motion` dengan mengurangi atau menonaktifkan transform dan animasi dekoratif.

---

## 11. Accessibility Requirements

Kartu produk harus memiliki struktur semantik dan nama kontrol yang jelas. Setiap tombol harus dapat dioperasikan dengan keyboard, memiliki focus-visible state, dan tidak hanya dibedakan melalui warna. Status stok, promo, dan hasil aksi harus tersedia dalam teks yang dapat dibaca assistive technology.

Jika seluruh kartu menjadi link atau button, jangan menempatkan button interaktif bersarang di dalam elemen tersebut. Gunakan struktur yang valid, misalnya area detail sebagai link terpisah dan CTA sebagai button terpisah.

Persyaratan minimum:

1. Kontras teks dan kontrol harus memadai terhadap background.
2. Target sentuh kontrol utama minimal sekitar 44 × 44 px.
3. Gambar memiliki `alt` yang sesuai.
4. Tombol quantity memiliki label spesifik, misalnya `Kurangi Beras Ramos 5 kg`.
5. Toast atau feedback tidak boleh menjadi satu-satunya cara untuk mengetahui hasil aksi.
6. Fokus keyboard tidak boleh hilang setelah quantity atau cart state berubah.

---

## 12. Performance Requirements

Redesign harus mempertahankan pengalaman browsing yang cepat. Dimensi gambar harus ditentukan sejak awal, placeholder digunakan selama loading, dan perubahan state kartu tidak boleh memicu reflow besar pada seluruh grid.

Gunakan lazy loading untuk gambar di luar viewport jika sudah sesuai dengan implementasi existing. Hindari listener individual yang berlebihan pada setiap elemen jika event delegation sudah tersedia. Jangan menambahkan library baru hanya untuk animasi kartu sederhana.

Target implementasi:

| Area | Target |
|---|---|
| Layout stability | Tidak ada perubahan tinggi kartu besar setelah gambar selesai dimuat |
| Interaction | Aksi tambah dan quantity terasa langsung, tanpa delay visual yang tidak perlu |
| Animation | Durasi singkat dan dapat dihormati oleh reduced-motion preference |
| Rendering | Tidak ada duplikasi rendering kartu akibat event atau data fetch berulang |

---

## 13. Data and Behavior Constraints

Redesign harus menggunakan field produk dan fungsi keranjang yang sudah tersedia. Frontend tidak boleh mengubah harga, stok, kategori, atau identitas produk hanya untuk kebutuhan visual. Jika data tertentu tidak tersedia, area tersebut harus disembunyikan dengan graceful fallback, bukan menampilkan placeholder yang terlihat seperti data nyata.

Semua aksi add-to-cart harus tetap melalui controller existing agar validasi stok, quantity, dan sinkronisasi cart tidak terpecah menjadi logika baru yang berbeda.

---

## 14. Recommended Component Contract

Struktur konseptual berikut dapat digunakan sebagai acuan implementasi:

```html
<article class="product-card ..." data-product-id="..."><a class="product-card__detail" href="...">
  <div class="product-card__media">
    <img class="product-card__image" src="..." alt="..." loading="lazy">
    <span class="product-card__badge">Promo</span>
  </div>
  <div class="product-card__content">
    <h3 class="product-card__name">Nama produk</h3>
    <p class="product-card__unit">1 paket</p>
    <p class="product-card__price">Rp 25.000</p>
    <p class="product-card__stock">Tersedia</p>
  </div>
</a>
  <div class="product-card__actions">
    <button type="button" aria-label="Tambah Nama Produk ke keranjang">Tambah</button>
  </div>
</article>
```

Contoh ini bersifat kontrak desain, bukan instruksi untuk mengganti struktur aplikasi tanpa menyesuaikan fungsi existing.

---

## 15. Acceptance Criteria

### Layout

- [ ] Semua kartu pada satu row memiliki area gambar dan area aksi yang konsisten.
- [ ] Nama produk tidak mendorong harga atau CTA keluar dari kartu.
- [ ] Product grid tetap rapi pada mobile, tablet, dan desktop.
- [ ] Tidak ada horizontal overflow yang tidak disengaja.

### Content

- [ ] Nama, harga, unit, dan status stok dapat ditemukan tanpa membuka detail.
- [ ] Harga promo menampilkan harga aktif dan harga lama secara jelas.
- [ ] Produk tanpa data promo atau unit tidak menghasilkan ruang kosong yang mengganggu.

### Interaction

- [ ] CTA tambah ke keranjang dapat digunakan melalui touch, mouse, dan keyboard.
- [ ] Quantity control tidak memicu navigasi detail produk.
- [ ] Setelah add-to-cart, pengguna menerima feedback yang jelas.
- [ ] Produk habis tidak dapat ditambahkan ke keranjang.
- [ ] Error add-to-cart ditampilkan tanpa merusak layout grid.

### Accessibility

- [ ] Semua kontrol memiliki accessible name.
- [ ] Focus-visible state terlihat jelas.
- [ ] Status stok tidak hanya menggunakan warna.
- [ ] Gambar memiliki alt text yang sesuai.
- [ ] Reduced-motion preference dihormati.

### Technical quality

- [ ] Tidak ada error JavaScript pada render awal maupun saat interaksi kartu.
- [ ] Tidak ada duplicate event handler ketika grid dirender ulang.
- [ ] `git diff --check` dan validasi syntax JavaScript berhasil.
- [ ] Perubahan tidak memutus filter kategori, pagination, cart, atau detail produk.

---

## 16. QA Test Matrix

| Skenario | Mobile | Desktop | Expected result |
|---|---:|---:|---|
| Render produk tersedia | Ya | Ya | Kartu lengkap dan stabil |
| Nama produk panjang | Ya | Ya | Line clamp bekerja, CTA tetap terlihat |
| Produk promo | Ya | Ya | Harga aktif, harga lama, dan badge terbaca |
| Stok terbatas | Ya | Ya | Status terlihat dengan teks |
| Stok habis | Ya | Ya | CTA disabled dan tidak menambah item |
| Add to cart | Ya | Ya | Cart update dan feedback terlihat |
| Quantity plus/minus | Ya | Ya | Jumlah berubah tanpa navigasi tidak sengaja |
| Keyboard navigation | Opsional pada mobile, wajib desktop | Ya | Fokus terlihat dan aksi dapat dijalankan |
| Reduced motion | Ya | Ya | Animasi diminimalkan |
| Image loading lambat | Ya | Ya | Skeleton/placeholder menjaga layout |
| Grid pagination | Ya | Ya | Scroll dan posisi grid tetap nyaman |

---

## 17. Rollout Plan

Implementasi disarankan dilakukan dalam tiga tahap. Tahap pertama adalah menyamakan struktur markup dan tinggi area gambar. Tahap kedua memperjelas harga, status stok, dan action zone. Tahap ketiga menambahkan state loading, error, accessibility refinement, dan browser verification.

Setelah implementasi, lakukan smoke test pada setidaknya satu viewport mobile sempit, satu mobile lebar, dan desktop. Verifikasi juga produk tanpa gambar, produk dengan nama panjang, produk promo, produk habis, serta produk yang sudah ada di keranjang.

---

## 18. Prioritas Implementasi

| Prioritas | Item | Alasan |
|---|---|---|
| P0 | Struktur kartu konsisten, harga jelas, CTA mudah ditemukan | Berdampak langsung pada pemahaman dan pembelian |
| P0 | State stok habis dan add-to-cart feedback | Mencegah kebingungan dan aksi yang tidak valid |
| P1 | Image placeholder dan line clamp | Menjaga stabilitas visual dan kerapian grid |
| P1 | Quantity control yang konsisten | Mempercepat perubahan jumlah produk |
| P1 | Focus state dan accessible labels | Meningkatkan aksesibilitas dan kualitas interaksi |
| P2 | Wishlist atau micro-interaction tambahan | Nilai tambah setelah fondasi stabil |

---

## 19. Keputusan Desain yang Direkomendasikan

Redesign sebaiknya tidak menambah terlalu banyak informasi ke dalam kartu. Prioritas visual adalah **gambar → nama produk → harga → status → aksi**. Badge promo dan wishlist harus bersifat sekunder agar tidak menutupi produk atau mengganggu CTA.

Shadow existing boleh dipertahankan, tetapi gunakan secara lebih ringan pada default state dan lebih tegas hanya pada hover desktop. Pada mobile, gunakan border, spacing, dan contrast untuk membentuk kartu karena hover tidak tersedia.

Hasil akhir yang diharapkan adalah product card yang terasa sederhana, cepat dipahami, dan langsung dapat digunakan—bukan kartu yang penuh dekorasi tetapi memperlambat keputusan pembelian.

---

## 20. Definition of Done

Redesign dinyatakan selesai apabila struktur dan styling product card telah diterapkan pada data produk nyata, seluruh acceptance criteria P0 dan P1 terpenuhi, tidak ada regression pada filter, pagination, detail produk, dan cart, serta hasilnya telah diverifikasi pada viewport mobile dan desktop.

Dokumen teknis atau komentar implementasi harus menjelaskan perubahan pada struktur card, state stok, CTA, dan event handling bila terdapat perbedaan dari kontrak existing.

---

## Referensi

Dokumen ini disusun berdasarkan konteks implementasi website Paket Sembako dan class existing yang diberikan pengguna. Tidak digunakan data eksternal atau klaim statistik pihak ketiga; seluruh target di atas merupakan requirement produk dan kriteria kualitas implementasi.
