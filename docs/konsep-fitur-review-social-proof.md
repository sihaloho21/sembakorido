# Konsep Fitur Review, Rating, dan Bukti Pembeli untuk GoSembako

## Ringkasan

Dokumen ini merangkum konsep fitur `review`, `rating`, dan `bukti pembeli` yang paling cocok untuk website GoSembako saat ini, dengan fokus pada:

- meningkatkan kepercayaan calon pembeli
- membantu user mengambil keputusan lebih cepat
- memanfaatkan struktur website yang sudah ada
- menjaga alur belanja tetap ringan dan cepat

Rekomendasi utama untuk GoSembako adalah:

`Ulasan Pembeli Terverifikasi`

Artinya, review hanya muncul dari pembeli yang benar-benar sudah melakukan pesanan dan status pesanannya sudah `Diterima` atau `Selesai`.

---

## Tujuan Fitur

### Tujuan bisnis

- meningkatkan conversion rate dari pengunjung menjadi pembeli
- mengurangi keraguan user baru
- memperkuat citra bahwa GoSembako aktif, dipercaya, dan barangnya sesuai
- meningkatkan repeat order lewat interaksi setelah pesanan selesai

### Tujuan UX

- user cepat melihat bukti bahwa toko ini terpercaya
- user mendapat dorongan tambahan tepat sebelum membeli
- pembeli lama punya tempat yang jelas untuk memberi ulasan
- social proof terasa natural, bukan tempelan

---

## Prinsip Dasar

### 1. Trust harus muncul sebelum user ragu

Review dan bukti pembeli harus muncul di area yang membantu keputusan beli, bukan disembunyikan di halaman belakang.

### 2. Jangan mengganggu alur belanja cepat

GoSembako kuat di flow cepat: cari produk, lihat detail, checkout. Fitur review harus memperkuat flow ini, bukan memperlambat.

### 3. Verified lebih penting daripada ramai

Sedikit review, tapi terverifikasi, lebih kuat daripada banyak testimoni yang tidak jelas asalnya.

### 4. Untuk tahap awal, fokus pada review layanan

Karena bisnis sembako punya variasi stok, ukuran, dan bundling yang bisa berubah, maka review `pengalaman belanja` lebih stabil daripada review produk yang terlalu spesifik.

---

## Rekomendasi Fitur Inti

Fitur inti yang disarankan:

- `rating bintang 1-5`
- `ulasan singkat`
- `badge pembeli terverifikasi`
- `opsional foto bukti barang diterima`
- `moderasi admin sebelum tayang`

Struktur tampilannya:

- rating ringkas untuk trust cepat
- review singkat untuk meyakinkan
- foto bukti untuk memperkuat kredibilitas

---

## Penempatan UI yang Direkomendasikan

## 1. Homepage: blok social proof utama

### Lokasi

Tempatkan setelah:

- `promo banner carousel`
- `bundle carousel`

Dan sebelum:

- filter kategori
- grid produk

### Alasan

Ini adalah titik paling strategis untuk membangun trust saat user baru masuk, sebelum mereka terlalu dalam masuk ke katalog.

Saat ini homepage langsung masuk ke katalog. Dengan tambahan blok social proof di sini, user mendapat alasan untuk percaya sebelum mulai membandingkan produk.

### Bentuk UI

Gunakan satu section khusus, lebar penuh container, tinggi sedang, jangan terlalu panjang.

Struktur yang disarankan:

```text
[ Judul ]
Dipercaya ribuan pembeli GoSembako

[ Statistik singkat ]
4.9/5 rating layanan
10rb+ pelanggan puas
95% pesanan selesai dengan baik

[ 3 kartu review ]
- review 1
- review 2
- review 3

[ CTA kecil ]
Lihat semua ulasan
```

### Komponen yang ditampilkan

- angka rating rata-rata
- jumlah review terverifikasi
- 3 review singkat terbaru atau terbaik
- 1 tombol menuju modal atau halaman `semua ulasan`

### Copy yang cocok

Judul:

- `Dipercaya Pembeli GoSembako`
- `Bukti Belanja Nyata dari Pelanggan Kami`

Subcopy:

- `Ulasan asli dari pembeli yang telah menerima pesanan mereka.`

### Catatan UX

- jangan tampilkan review terlalu panjang
- cukup 2 sampai 3 baris per kartu
- nama disamarkan, misalnya `Bu S***, Ciruas`
- kalau ada foto, tampilkan maksimal 1 thumbnail kecil per kartu

---

## 2. Modal detail produk: review sebagai pendorong keputusan

### Lokasi

Tempatkan di modal rincian produk, pada area setelah:

- harga
- benefit atau isi paket

Dan sebelum:

- tombol `Beli Sekarang`
- tombol `+ Keranjang`

### Alasan

Di titik ini user sedang mempertimbangkan beli. Review di sini berfungsi sebagai penguat keputusan.

Kalau review ditempatkan terlalu atas, user belum siap membaca. Kalau terlalu bawah setelah tombol utama, nilainya berkurang.

### Bentuk UI

Gunakan card ringkas.

Struktur yang disarankan:

```text
[ Ulasan Pembeli Terverifikasi ]
4.9/5 dari 128 ulasan

- "Barang sesuai dan cepat sampai"
- "Admin responsif, paket rapi"

[ thumbnail foto opsional ]

Lihat review lainnya
```

### Isi review di modal

Untuk tahap awal, gunakan review layanan umum, bukan review produk yang terlalu detail.

Jika nanti sudah matang, bisa dibagi:

- review layanan umum GoSembako
- review khusus produk tertentu

### Catatan UX

- cukup 2 ulasan pendek
- jangan buat area ini lebih tinggi dari blok harga
- kalau tidak ada review, tampilkan fallback:
  - `Belum ada ulasan untuk produk ini`
  - `Jadilah pembeli pertama yang memberi ulasan`

---

## 3. Akun > Riwayat Belanja: titik input review utama

### Lokasi

Tempatkan di setiap kartu pesanan pada halaman akun, khusus untuk order yang statusnya:

- `Diterima`
- `Selesai`

### Alasan

Ini titik paling natural untuk meminta review karena:

- pesanan sudah selesai
- user sudah merasakan pengalaman belanja
- review menjadi terverifikasi

### Bentuk UI

Tambahkan tombol aksi sekunder pada kartu order:

- `Beri Ulasan`

Kalau review sudah pernah dibuat:

- `Ulasan Terkirim`
- atau `Edit Ulasan`

### Alur user

1. User membuka akun
2. User masuk ke `Riwayat Belanja`
3. Pada order selesai, user melihat tombol `Beri Ulasan`
4. User klik dan membuka modal form review
5. User isi rating, komentar, dan opsional foto
6. Data masuk ke sistem
7. Admin approve
8. Review tayang di homepage atau area lain

### Struktur modal form review

```text
[ Judul ]
Beri Ulasan untuk Pesanan Anda

[ Rating ]
1 2 3 4 5 bintang

[ Pilihan cepat ]
Barang sesuai
Pengiriman cepat
Admin ramah
Harga cocok

[ Textarea ]
Ceritakan pengalaman Anda

[ Upload opsional ]
Tambah foto bukti paket diterima

[ Tombol ]
Kirim Ulasan
```

### Catatan UX

- buat form singkat
- textarea opsional tetap boleh, tapi rating wajib
- upload foto opsional
- jika ingin meningkatkan partisipasi, tampilkan insentif:
  - `Dapat +3 poin reward setelah ulasan diverifikasi`

---

## 4. Popup kiri bawah: social proof sekunder

### Lokasi

Memanfaatkan area popup kecil kiri bawah yang saat ini dipakai untuk notifikasi `Baru saja memesan`.

### Alasan

Area ini sudah dikenal user sebagai notifikasi aktivitas toko. Sangat cocok untuk dipakai sebagai social proof tambahan.

### Pola konten yang direkomendasikan

Jangan hanya menampilkan notifikasi order. Putar beberapa jenis data:

- `Bu S*** dari Ciruas baru saja memesan`
- `Pak A*** memberi 5★ untuk layanan`
- `Paket sudah diterima dengan baik`

### Aturan tampilan

- tampil bergantian
- tidak terlalu sering
- tidak boleh menutupi CTA penting
- mobile tetap aman dan tidak mengganggu bottom navigation

### Catatan UX

- gunakan maksimal 1 baris utama dan 1 baris kecil
- jangan tampilkan data sensitif
- prioritaskan trust, bukan kebisingan

---

## 5. Modal Tentang GoSembako: perkuat statistik yang sudah ada

### Lokasi

Di modal `Tentang GoSembako`, saat ini sudah ada statistik:

- `500+ Produk Tersedia`
- `10rb+ Pelanggan Puas`
- `4.9★ Rating Layanan`

### Rekomendasi

Biarkan statistik ini tetap ada, tetapi ubah menjadi data dinamis jika fitur review sudah jalan.

Contoh:

- `4.9/5 dari 327 ulasan terverifikasi`
- `10.248 pelanggan puas`

### Fungsi

Area ini bukan titik utama konversi, tapi cocok menjadi penguat brand trust.

---

## Struktur Halaman yang Disarankan

## Homepage

Urutan yang direkomendasikan:

1. Header
2. Hero
3. Promo banner
4. Bundle carousel
5. `Blok social proof utama`
6. Search, sort, kategori
7. Grid produk
8. Footer

### Alasan urutan ini

- promo menarik perhatian
- bundle mengarahkan penjualan
- social proof memberi alasan untuk percaya
- setelah itu user masuk ke eksplorasi produk

---

## Detail Produk

Urutan yang direkomendasikan:

1. Gambar
2. Nama produk
3. Variasi
4. Harga
5. Deskripsi isi paket
6. `Card review ringkas`
7. Tombol beli

### Alasan urutan ini

User butuh:

- tahu produk apa
- tahu harganya
- tahu reviewnya
- lalu mengambil keputusan

---

## Halaman Akun

Urutan yang direkomendasikan pada kartu order:

1. Order ID
2. Status
3. Ringkasan produk
4. Qty
5. Poin
6. Total bayar
7. Tombol aksi

Tombol aksi bisa menjadi:

- `Belanja Lagi`
- `Lacak Pesanan`
- `Beri Ulasan`

Untuk mobile, jika tombol terlalu ramai:

- `Beri Ulasan` lebih diprioritaskan untuk order selesai
- `Belanja Lagi` bisa dijadikan tombol sekunder

---

## Komponen yang Perlu Dibuat

## 1. Review Summary Block

Digunakan di homepage dan modal detail.

Isi:

- rata-rata rating
- jumlah ulasan
- label `Pembeli Terverifikasi`
- 2 sampai 3 highlight review

## 2. Review Card

Isi:

- nama samar
- lokasi singkat
- rating
- isi ulasan pendek
- tanggal
- badge verified
- foto bukti opsional

## 3. Review Submission Modal

Digunakan di akun setelah pesanan selesai.

Isi:

- rating selector
- quick tags
- textarea
- upload foto
- submit button

## 4. Review List Modal atau Halaman

Untuk CTA `Lihat Semua Ulasan`.

Isi:

- filter bintang
- urutan terbaru / terpopuler
- galeri foto bukti

---

## Struktur Data yang Direkomendasikan

Disarankan buat sheet baru:

`reviews`

Kolom yang direkomendasikan:

| Kolom | Fungsi |
|---|---|
| `id` | ID review |
| `order_id` | relasi ke pesanan |
| `phone` | validasi pembeli |
| `customer_name` | nama asli internal |
| `display_name` | nama samaran untuk publik |
| `city` | lokasi singkat |
| `rating` | nilai 1-5 |
| `review_text` | isi ulasan |
| `review_tags` | tag cepat |
| `photo_url` | bukti foto opsional |
| `status` | pending, approved, rejected |
| `is_verified_purchase` | true/false |
| `review_scope` | service, product |
| `product_id` | opsional jika nanti review produk |
| `created_at` | waktu submit |
| `approved_at` | waktu approve |

### Catatan

Untuk tahap awal:

- cukup fokus pada `service review`
- `product_id` boleh kosong
- yang penting ada `order_id` dan `phone`

---

## Moderasi dan Validasi

## Aturan validasi

- review hanya bisa dibuat jika order milik user yang login
- review hanya untuk order berstatus `Diterima` atau `Selesai`
- satu order idealnya satu review utama
- foto opsional harus aman dan relevan

## Moderasi admin

Status review:

- `pending`
- `approved`
- `rejected`

Yang tampil di publik hanya:

- review `approved`

## Kenapa moderasi penting

- menjaga kualitas konten
- mencegah spam
- mencegah review palsu atau bahasa yang tidak pantas

---

## Strategi Konten

## Konten yang paling efektif

Untuk GoSembako, review yang biasanya paling kuat adalah:

- barang sesuai pesanan
- harga cocok
- admin cepat merespons
- pengiriman aman
- paket rapi

## Contoh review yang cocok

- `Barang sesuai foto, admin cepat balas, pengiriman aman.`
- `Pesanan sampai dengan baik dan isi paket lengkap.`
- `Cocok untuk belanja bulanan, praktis dan jelas.`

## Hal yang sebaiknya tidak dominan

- review terlalu panjang
- review terlalu generik tanpa konteks
- review yang menampilkan data pribadi pembeli

---

## Rekomendasi Tampilan Mobile

Karena user GoSembako kemungkinan besar dominan mobile, maka:

- blok review homepage cukup 1 kolom atau horizontal snap
- review card di modal produk harus pendek
- popup kiri bawah harus mengecil dan tidak bentrok dengan bottom nav
- form review harus sederhana dan thumb-friendly

### Pola mobile untuk homepage

Format terbaik:

- statistik 1 baris atau 3 kolom kecil
- review card horizontal swipe

### Pola mobile untuk akun

Format terbaik:

- tombol `Beri Ulasan` berada di bagian bawah kartu order
- modal form tinggi sedang, fokus ke rating dan komentar

---

## Prioritas Implementasi

## Fase 1: MVP paling aman

Bangun:

- tombol `Beri Ulasan` di halaman akun
- modal submit review
- sheet `reviews`
- blok review ringkas di homepage

Tujuan:

- review sudah nyata dan terhubung ke pesanan

## Fase 2: Trust lebih kuat

Tambah:

- foto bukti pembeli
- popup social proof campuran order dan review
- statistik rating dinamis

Tujuan:

- trust naik tanpa banyak menambah kompleksitas

## Fase 3: Lebih matang

Tambah:

- halaman semua ulasan
- filter berdasarkan rating
- review per produk jika data sudah cukup

Tujuan:

- social proof menjadi aset konten jangka panjang

---

## Rekomendasi Utama yang Paling Pas

Jika hanya memilih satu susunan terbaik untuk website saat ini, maka urutan prioritasnya adalah:

1. `Blok social proof di homepage sebelum grid produk`
2. `Tombol Beri Ulasan di Riwayat Belanja`
3. `Card review ringkas di modal detail produk`
4. `Popup kiri bawah untuk review dan order activity`

Ini paling seimbang antara:

- dampak bisnis
- kesesuaian dengan flow website sekarang
- tingkat usaha implementasi

---

## Kesimpulan

Fitur review yang paling cocok untuk GoSembako bukan model marketplace besar yang berat, tetapi sistem `ulasan pembeli terverifikasi` yang ringan, jelas, dan ditaruh di titik keputusan beli.

Penempatan terbaik adalah:

- homepage sebelum user masuk terlalu jauh ke katalog
- modal detail produk tepat sebelum tombol beli
- halaman akun setelah pesanan selesai untuk submit review
- popup kecil sebagai penguat aktivitas dan trust

Dengan struktur ini, GoSembako bisa terlihat lebih aktif, lebih terpercaya, dan lebih meyakinkan tanpa merusak flow belanja yang saat ini sudah cepat.
