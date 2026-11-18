# TODO — Category Showcase “Lihat Semua”

## Homepage CTA “Lihat Semua” per kategori
- [x] Setiap section category showcase yang dirender memiliki CTA **“Lihat Semua”** di sisi kanan header.
- [x] Nama kategori dan CTA **“Lihat Semua”** berada sejajar dalam satu baris; CTA rata ke tepi kanan header.
- [x] CTA membuka kategori yang tepat; kategori lain tidak tercampur pada daftar.
- [x] CTA dapat diakses dengan keyboard dan memiliki nama aksesibel yang menyebut kategori.
- [x] Section yang tidak dirender karena tidak ada produk yang memenuhi syarat tidak menampilkan CTA.

## Tampilan penuh kategori dengan produk yang memenuhi syarat
- [x] Daftar mencakup semua produk tersedia dalam kategori, tidak hanya jumlah `max_products` carousel.
- [x] Produk tersembunyi/tidak tersedia/tanpa stok tidak muncul; produk varian muncul jika setidaknya satu varian stoknya positif walaupun stok induk nol.
- [x] Kategori dipertahankan di URL sehingga halaman dapat dimuat langsung/dibagikan, dan tersedia jalan kembali ke homepage.
- [x] Kategori kosong atau tidak dikenal menampilkan keadaan “Kategori tidak ditemukan” dengan tautan kembali ke homepage.

## Pencarian kategori dan hitung hasil
- [x] Halaman menampilkan form pencarian dan tepat di bawahnya teks **“Menampilkan XX Produk”**.
- [x] Pencarian hanya mencari di dalam kategori yang dibuka, mendukung keyboard/submit form, serta mencari nama produk dan label varian.
- [x] Count sama dengan total produk yang cocok setelah kategori, status ketersediaan, dan kata kunci diterapkan; count diperbarui ketika query berubah atau dibersihkan.
- [x] Hasil pencarian nol menampilkan “Produk tidak ditemukan. Coba kata kunci lain.” dan kontrol untuk menghapus pencarian.
- [x] Kategori valid tanpa produk tersedia menampilkan “Belum ada produk tersedia di kategori ini.”
- [x] Loading dan kegagalan pemuatan memiliki keadaan UI yang sesuai, termasuk opsi mencoba ulang.

## Konsistensi kartu dan layout
- [x] Kartu memakai renderer dan aksi produk storefront yang sama serta tidak menampilkan status stok di grid.
- [x] Kartu produk pada category showcase memiliki sudut atas rounded; perubahan clipping hanya berlaku pada kartu carousel showcase, bukan grid utama.
- [x] Tampilan responsif pada desktop/mobile dan menggunakan pola visual storefront yang ada.
- [x] Jumlah hasil menghitung produk katalog, bukan jumlah varian atau unit stok; bila pagination digunakan, count menunjukkan total yang cocok, bukan hanya kartu pada halaman aktif.
