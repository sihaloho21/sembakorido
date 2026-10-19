# PRD Revisi: Posisi Tombol Keranjang pada Kartu Produk

- **Status:** Draft untuk implementasi
- **Versi:** 1.0
- **Tanggal:** 19 Oktober 2026
- **Area:** Kartu produk pada grid beranda dan carousel kategori
- **Elemen utama:** `product-card-cart-slot`
**Elemen utama:** `product-card-cart-slot`

## 1. Ringkasan

Memindahkan kontrol keranjang pada kartu produk dari area bawah kartu ke sudut kanan atas area gambar. Kontrol boleh berada di atas/menimpa gambar sebagai overlay, dengan latar dan kontras yang cukup agar tetap mudah ditemukan dan ditekan.

Perubahan ini adalah revisi tata letak dan presentasi. Perilaku keranjang, aturan stok, pemilihan produk, sinkronisasi kuantitas, dan alur detail produk harus tetap sama.

## 2. Latar Belakang dan Masalah

Saat ini `product-card-cart-slot` dirender pada baris aksi di bagian bawah kartu. Aksi tambah/ubah kuantitas baru terlihat setelah pengguna memindai nama, harga, dan isi kartu. Posisi tersebut juga menambah elemen di bagian bawah kartu, sehingga tinggi/kepadatan tampilan dapat terasa kurang ringkas.

Menempatkan kontrol di atas gambar membuat aksi utama lebih mudah ditemukan dan memberi pola interaksi yang konsisten di grid maupun carousel.

## 3. Tujuan

- Memindahkan `product-card-cart-slot` ke sudut kanan atas gambar produk.
- Menjaga tombol tetap jelas di atas gambar dengan kontras, area tekan, dan urutan layer yang memadai.
- Mempertahankan seluruh logika keranjang dan kontrol kuantitas yang sudah berjalan.
- Mencegah klik pada kontrol overlay memicu aksi gambar untuk membuka detail produk.
- Menghindari perubahan pada fitur kartu dan halaman lain yang tidak terkait.

## 4. Pengguna dan Kebutuhan

Pembeli yang sedang menelusuri katalog membutuhkan akses cepat untuk menambahkan produk ke keranjang atau menyesuaikan jumlahnya tanpa harus mencari tombol di bagian bawah kartu.

## 5. Cakupan

### Termasuk

- Slot kontrol keranjang untuk produk sederhana/non-variasi yang memakai `product-card-cart-slot`.
- Posisi overlay di sudut kanan atas wrapper gambar pada kartu produk bersama, termasuk pemakaian kartu yang sama di grid beranda dan carousel kategori.
- Tampilan slot pada dua keadaan: tombol tambah dan stepper kuantitas.
- Penyesuaian CSS responsif, kontras, fokus keyboard, dan pengujian regresi yang diperlukan.

### Tidak termasuk

- Perubahan logika tambah ke keranjang, pengurangan/penambahan kuantitas, batas stok, harga, atau checkout.
- Perubahan pada produk yang memiliki variasi. Tombol “Lihat Pilihan” tetap mengikuti perilaku dan posisi yang sekarang.
- Perubahan pada gambar, detail produk, filter/pencarian, pagination, atau navigasi kategori.
- Perubahan aturan visibilitas produk tidak tersedia.

## 6. Perilaku Saat Ini yang Harus Dipertahankan

- `getProductCardCartControlState(product)` menentukan mode `button` atau `stepper` berdasarkan jumlah produk di keranjang.
- `renderProductCardCartControl(product)` merender tombol tambah saat jumlah nol, lalu stepper saat jumlah lebih dari nol.
- `syncProductGridCartControls()` menemukan slot melalui `[data-product-cart-slot]` dan memperbarui kontrol setelah isi keranjang atau stok berubah.
- Slot membawa `data-product-id`, `data-cart-mode`, dan `data-cart-qty`.
- Produk tidak tersedia/tersembunyi tidak menampilkan kontrol interaktif.
- Produk dengan variasi menggunakan aksi “Lihat Pilihan”, bukan `product-card-cart-slot`.

## 7. Persyaratan Fungsional dan UI

### FR-1 — Posisi kontrol

Letakkan elemen `product-card-cart-slot` di dalam wrapper gambar produk (`.lazy-image-wrapper`) sebagai elemen overlay. Posisi default adalah inset kanan dan atas sekitar 8–12 piksel dari tepi wrapper gambar. Slot tidak boleh mengubah ukuran atau rasio gambar.

### FR-2 — Urutan layer

Kontrol tampil di atas gambar dan berada di atas badge produk yang tidak interaktif bila diperlukan, tetapi tidak boleh menutupi banner “Tidak Tersedia”. Gunakan nilai z-index yang konsisten dengan layer kartu saat ini. Area klik tombol harus terpisah dari area klik gambar.

### FR-3 — Kontras dan target tekan

- Tombol tambah mempertahankan identitas hijau utama, ikon tambah, bayangan ringan, dan keadaan hover/aktif yang tersedia.
- Stepper tetap berbentuk pill hijau dengan tombol minus, angka kuantitas, dan tombol plus.
- Sediakan latar atau permukaan yang membuat kontrol mudah dibaca pada gambar terang maupun gelap.
- Target tekan pada layar sentuh sebaiknya minimal 40 × 40 piksel bila ruang kartu memungkinkan. Stepper harus tetap muat di dalam kartu pada lebar mobile terkecil yang didukung.
- Tambahkan/pertahankan indikator fokus keyboard yang terlihat tanpa mengubah label aksesibilitas.

### FR-4 — Aksi tombol tidak membuka detail

Klik/tap pada tombol tambah, minus, atau plus hanya menjalankan aksi keranjang masing-masing. Interaksi tidak boleh diteruskan ke gambar atau memicu `show-detail`. Klik area gambar di luar kontrol tetap membuka detail produk seperti sebelumnya.

### FR-5 — Keadaan stepper

- Kuantitas nol: tampilkan tombol tambah.
- Kuantitas lebih dari nol: tampilkan stepper dan jumlah saat ini.
- Tombol plus dinonaktifkan ketika batas stok tercapai.
- Tombol minus tetap mengurangi kuantitas melalui alur yang sudah ada.
- Perubahan isi keranjang memperbarui kontrol yang sama tanpa menduplikasi slot atau mereset posisi overlay.

### FR-6 — Integritas kartu dan responsive layout

Nama, badge stok, harga, diskon, grosir, dan isi informasi kartu tetap berada pada posisi dan urutan semula. Area bawah kartu yang sebelumnya hanya menjadi wadah tombol dapat dihapus atau dirapikan setelah slot dipindahkan, tetapi tinggi, jarak, dan keterbacaan konten kartu tidak boleh rusak.

Pada mobile, kontrol tidak boleh terpotong, keluar dari batas gambar/kartu, atau menutupi bagian penting nama produk pada badge. Pada desktop, posisi tetap di sudut kanan atas gambar dan tidak bergantung pada tinggi teks atau harga.

## 8. Persyaratan Nonfungsional

- Perubahan tidak boleh menambah permintaan jaringan atau ketergantungan baru.
- Render ulang dan sinkronisasi kuantitas harus tetap berjalan untuk semua instance kartu.
- Gunakan HTML tombol semantik dan pertahankan `type="button"`, `aria-label`, status disabled, serta atribut aksi yang digunakan oleh event delegation.
- Hormati gerakan yang dikurangi jika animasi/transisi kontrol ditambahkan.
- Tidak boleh ada pergeseran layout kartu saat gambar selesai dimuat; wrapper gambar tetap mempertahankan rasio saat ini.

## 9. Kriteria Penerimaan

1. Pada kartu produk sederhana yang tersedia, tombol tambah berada di sudut kanan atas area gambar.
2. Setelah produk masuk keranjang, stepper menggantikan tombol pada posisi yang sama dan jumlahnya sesuai isi keranjang.
3. Penambahan/pengurangan kuantitas, batas stok, dan sinkronisasi ke ikon/jumlah keranjang global tetap berfungsi seperti sebelum revisi.
4. Klik kontrol overlay tidak membuka modal detail; klik gambar di luar kontrol tetap membuka detail.
5. Produk tidak tersedia/tersembunyi tidak menampilkan tombol keranjang yang dapat digunakan.
6. Kartu produk bervariasi tetap menampilkan aksi “Lihat Pilihan” dengan perilaku dan posisi yang tidak berubah.
7. Overlay tampil benar pada grid beranda dan carousel kategori; tidak terpotong pada lebar mobile, tablet, maupun desktop.
8. Harga, badge, label stok, promo/grosir, dan konten kartu lainnya tetap terlihat dan berfungsi.
9. Tidak ada error JavaScript di console, kontrol tidak terduplikasi setelah render/sinkronisasi, dan tes regresi lulus.

## 10. Rencana Uji Regresi

- Uji produk sederhana dengan kuantitas nol: tombol tambah terlihat di kanan atas gambar dan menambah satu item.
- Uji kuantitas lebih dari nol: stepper berada di posisi yang sama, minus/plus bekerja, dan jumlah terbarui.
- Uji kuantitas maksimum stok: tombol plus dinonaktifkan, batas stok tetap ditegakkan.
- Uji produk dengan variasi: aksi “Lihat Pilihan” tidak berubah.
- Uji produk tidak tersedia/tersembunyi: tidak ada kontrol keranjang aktif.
- Uji klik/tap overlay versus klik gambar untuk memastikan tindakan tidak tertukar.
- Uji viewport ponsel sempit, tablet, dan desktop; pastikan kontrol tidak menutupi nama/harga atau keluar dari kartu.
- Uji kartu pada grid utama dan carousel kategori, termasuk setelah cart state berubah.

## 11. Catatan Implementasi

- Pindahkan slot yang sama; jangan membuat kontrol duplikat terpisah untuk gambar.
- Pertahankan selector `[data-product-cart-slot]` dan atribut data yang dibaca oleh `syncProductGridCartControls()`.
- Pertahankan semua `data-action`, `data-product-id`, serta `data-delta` pada tombol internal agar event delegation tetap kompatibel.
- Pastikan event yang berasal dari tombol overlay ditangani sebagai aksi kontrol, bukan sebagai klik gambar.
- Setelah implementasi, jalankan tes regresi yang ada dan tambahkan tes markup/aksi untuk penempatan serta perilaku klik kontrol.

## 12. Risiko dan Mitigasi

| Risiko | Mitigasi |
|---|---|
| Tombol sulit terlihat pada gambar dengan warna kontras | Gunakan permukaan tombol solid, bayangan halus, dan outline fokus yang jelas. |
| Tombol menutupi badge atau gambar | Letakkan di kanan atas; badge yang ada umumnya berada di kiri. Batasi lebar stepper dan verifikasi pada kartu sempit. |
| Tap pada tombol ikut membuka detail | Pastikan routing delegated click mengutamakan aksi kontrol atau menghentikan propagasi sesuai pola aplikasi. Tambahkan uji klik. |
| Sinkronisasi keranjang kehilangan referensi slot setelah dipindah | Pindahkan elemen slot yang sama dan pertahankan atribut/selector yang dipakai sinkronisasi. |
| Stepper melampaui lebar gambar di mobile | Uji viewport minimum dan gunakan padding/inset responsif tanpa mengubah fungsi stepper. |

## 13. Keputusan Produk

Posisi yang disetujui untuk revisi ini adalah **overlay di sudut kanan atas wrapper gambar produk**. Slot kontrol yang sama berpindah bersama state tombol/stepper. Semua perubahan dibatasi pada posisi dan penyajian visual agar fitur keranjang lain tetap utuh.
