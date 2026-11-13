# PRD — Import Produk dari URL KlikIndomaret

**Produk:** paketsembako.com
**Status:** Implementasi backend dimulai — admin UI dan deployment production masih pending
**Tanggal:** 13 November 2026
**Pemilik fitur:** Admin katalog paketsembako.com

## 1. Latar Belakang

Pengelolaan katalog produk saat ini mengharuskan admin memasukkan nama, harga, deskripsi, dan gambar produk secara manual. Proses tersebut memerlukan waktu dan berisiko menimbulkan kesalahan pengetikan.

Fitur ini memungkinkan admin menempelkan satu URL produk dari KlikIndomaret. Sistem kemudian mencoba mengambil judul, harga terbaru yang terlihat pada halaman sumber, deskripsi, dan gambar produk untuk ditampilkan sebagai draft import. Produk tidak boleh langsung tampil di website. Admin wajib memeriksa dan menyetujui hasil import terlebih dahulu.

## 2. Tujuan

1. Mempercepat pembuatan draft produk baru.

1. Mengurangi penyalinan data produk secara manual.

1. Menyediakan harga KlikIndomaret sebagai referensi bagi admin.

1. Menyediakan gambar dan informasi awal produk untuk ditinjau sebelum dipublikasikan.

1. Mempertahankan kontrol admin atas harga jual, stok, kategori, dan status publikasi.

## 3. Keputusan Produk yang Sudah Disepakati

| Keputusan | Ketentuan |
| --- | --- |
| Domain sumber | Seluruh domain dan subdomain KlikIndomaret yang relevan pada fase awal |
| API resmi | Tidak digunakan |
| Izin khusus | Belum diperlukan menurut keputusan saat ini; risiko kebijakan dan operasional tetap harus diterima serta dipantau |
| Harga sumber | Hanya sebagai harga referensi, bukan harga jual otomatis |
| Approval | Wajib disetujui admin sebelum tampil di website |
| Gambar | Hanya menyimpan URL gambar sumber jika tersedia |
| Pembaruan harga | Manual, dengan memasukkan URL dan menjalankan import ulang |
| Jumlah produk | Satu URL menghasilkan satu produk |
| Varian | Tidak diimport sebagai beberapa produk pada fase awal |
| Stok | Tidak diambil dari KlikIndomaret; stok dikelola internal |
| URL sumber | Disimpan dan ditampilkan di halaman admin |
| Fallback | Admin boleh mengisi atau memperbaiki data secara manual jika import gagal atau tidak lengkap |
| Penyimpanan draft | Hasil import disimpan sebagai draft di sheet `products` |
| Status approval | Menggunakan status import baru yang terpisah dari status tampil produk |
| Approver | Satu-satunya admin yang tersedia |
| Validitas harga referensi | Tidak kedaluwarsa berdasarkan waktu; dianggap referensi aktif sampai admin mengisi harga jual manual |
| Harga jual approval | Wajib diisi admin sebelum approval |
| Tanpa harga referensi | Tetap boleh di-approve jika harga jual diisi manual |
| Snapshot import ulang | Tidak disimpan sebagai snapshot historis |

## 4. Di Luar Cakupan Fase Awal

Fitur berikut tidak termasuk dalam fase awal:

- Import otomatis berkala.

- Sinkronisasi harga otomatis.

- Sinkronisasi stok dari KlikIndomaret.

- Dukungan domain lain seperti marketplace atau supplier lain.

- Pengambilan beberapa varian dari satu halaman.

- Publikasi otomatis tanpa approval.

- Pengambilan data dengan melewati CAPTCHA, login, paywall, rate limit, atau mekanisme perlindungan situs sumber.

- Penggunaan API resmi KlikIndomaret.

- Pengambilan rating, ulasan, promo, ongkos kirim, lokasi toko, atau informasi checkout.

## 5. Pengguna dan Hak Akses

Hanya admin yang sudah terautentikasi dan memiliki akses pengelolaan produk yang dapat menggunakan fitur ini.

Pengunjung website tidak dapat menjalankan importer, memasukkan URL sumber, melihat hasil parsing sementara, atau memicu request ke KlikIndomaret.

## 6. Alur Pengguna

### 6.1 Membuat Draft dari URL

1. Admin membuka halaman pengelolaan produk.

1. Admin memilih aksi **Import dari URL KlikIndomaret**.

1. Admin menempelkan satu URL produk KlikIndomaret.

1. Sistem memvalidasi bahwa URL menggunakan HTTPS dan host yang diizinkan.

1. Backend mengambil halaman sumber dengan timeout dan batas ukuran response.

1. Sistem mengekstrak data produk.

1. Sistem menampilkan halaman preview.

1. Admin memeriksa, mengoreksi, dan melengkapi data.

1. Sistem menyimpan hasil import sebagai draft di sheet `products` dengan status import `draft_import` atau `needs_review`.

1. Admin mengisi harga jual internal dan memilih **Approve** setelah data dianggap benar.

### 6.2 Approval Produk

Hasil import harus memiliki field `import_status` baru yang terpisah dari field status tampil atau publikasi produk:

- `draft_import`: data baru saja diambil dan belum disetujui.

- `needs_review`: sebagian data tidak lengkap atau parser memberikan peringatan.

- `approved`: admin menyetujui data hasil import. Status tampil produk tetap dikelola oleh field publikasi yang sudah ada.

- `rejected`: hasil import ditolak atau dibatalkan.

Produk dengan status `draft_import`, `needs_review`, atau `rejected` tidak boleh tampil pada katalog publik.

### 6.3 Pembaruan Manual

Jika admin ingin memperbarui harga referensi atau gambar:

1. Admin membuka produk yang sudah tersimpan.

1. Admin memilih **Import Ulang dari URL**.

1. Sistem mengambil data terbaru dari URL sumber.

1. Sistem membuat preview perubahan.

1. Admin melihat preview data baru berdampingan dengan field produk saat ini.

1. Admin menyetujui perubahan secara manual.

Import ulang tidak boleh mengubah harga jual internal, stok internal, kategori, atau status publikasi secara otomatis.

## 7. Data yang Diambil

Sistem mencoba membaca data dengan urutan prioritas berikut:

1. JSON-LD `Product` dan `Offer` jika tersedia.

1. Meta tag Open Graph untuk judul dan gambar.

1. Meta tag `title` dan `description`.

1. Selector HTML khusus KlikIndomaret sebagai fallback.

1. Input manual admin jika data tidak berhasil ditemukan.

Field hasil import:

| Field | Sumber | Wajib | Catatan |
| --- | --- | --- | --- |
| Nama produk | `Product.name`, title, atau manual | Ya | Dapat diedit admin |
| Harga referensi | `Offer.price` atau selector harga | Tidak | Bukan harga jual |
| Mata uang | `priceCurrency` atau default IDR | Tidak | Ditampilkan sebagai informasi sumber |
| Deskripsi | `Product.description`, meta description, atau manual | Tidak | Dapat diedit admin |
| Gambar sumber | `Product.image`, Open Graph, atau manual | Tidak | Harus divalidasi dan dinormalisasi |
| URL sumber | Input admin | Ya | Disimpan di produk |
| Domain sumber | Hasil parsing URL | Ya | Harus `klikindomaret.com` atau host yang disetujui |
| Waktu pengambilan | Backend | Ya | Untuk audit dan informasi freshness |
| Status import | Sistem | Ya | Mengikuti lifecycle approval |
| Catatan parser | Sistem | Tidak | Menjelaskan field gagal atau ambigu |

Field berikut tetap dikelola internal:

- Harga jual.

- Harga coret atau diskon internal.

- Stok.

- Kategori.

- SKU internal.

- Poin reward.

- Harga grosir.

- Status tampil atau sembunyi.

## 8. Aturan Harga

Harga yang terbaca dari KlikIndomaret harus diberi label yang jelas, misalnya **Harga referensi sumber**. Harga tersebut tidak boleh menggantikan field harga jual internal secara otomatis.

Jika harga sumber gagal dibaca, produk tetap dapat dibuat melalui input manual, tetapi sistem harus menyimpan peringatan bahwa harga referensi tidak tersedia.

Jika harga sumber berbeda dari harga internal, sistem menampilkan keduanya secara terpisah pada preview agar admin tidak salah memahami harga sumber sebagai harga jual.

## 9. Aturan Gambar

Sistem hanya menyimpan URL gambar sumber dari halaman KlikIndomaret. Sistem tidak mengunduh atau menyalin file gambar ke storage internal pada fase awal. Jika URL gambar gagal ditampilkan atau kedaluwarsa, admin dapat mengganti URL tersebut atau mengunggah gambar manual melalui alur produk yang sudah tersedia.

Sistem tidak boleh menerima URL gambar dari host internal, alamat loopback, atau alamat jaringan privat.

## 10. Arsitektur Teknis yang Disarankan

Pengambilan data harus dilakukan di server-side, bukan dari JavaScript halaman publik.

Komponen yang diperlukan:

1. **Admin UI** untuk memasukkan URL dan melihat preview.

1. **Endpoint importer terproteksi** yang hanya dapat dipanggil admin.

1. **URL validator** dengan allowlist host KlikIndomaret.

1. **HTTP fetcher** dengan timeout, batas ukuran response, dan user-agent yang dapat diidentifikasi.

1. **Parser berlapis** untuk JSON-LD, Open Graph, metadata, dan fallback selector.

1. **Normalizer** untuk nama, harga, mata uang, deskripsi, dan gambar.

1. **Preview perubahan** untuk membandingkan field produk saat ini dengan hasil import ulang tanpa menyimpan snapshot historis.

1. **Persistence layer** untuk menyimpan draft, sumber, status, dan audit timestamp.

1. **Audit log** untuk mencatat admin, URL, hasil, error, dan waktu proses.

Importer harus memiliki cache atau jeda request yang wajar. Sistem tidak boleh mencoba berulang-ulang tanpa batas ketika sumber gagal.

## 11. Keamanan

Implementasi wajib memenuhi aturan berikut:

- Hanya menerima `https://`.

- Hanya mengizinkan domain dan subdomain KlikIndomaret yang relevan dalam allowlist. Pemeriksaan host harus memastikan suffix domain tidak dapat dipalsukan oleh domain seperti `klikindomaret.com.attacker.example`.

- Menolak username, password, port tidak standar, dan URL dengan redirect ke host yang tidak diizinkan.

- Memvalidasi setiap redirect, bukan hanya URL awal.

- Memblokir localhost, loopback, link-local, alamat multicast, dan seluruh private network untuk mencegah SSRF.

- Membatasi timeout maksimal 15 detik, response HTML maksimal 3 MB, jumlah redirect maksimal 3, panjang URL maksimal 2.048 karakter, dan frekuensi request per admin.

- Tidak menjalankan JavaScript atau kode dari halaman sumber di server importer.

- Tidak mengirim cookie, token login, atau kredensial admin ke situs sumber.

- Membersihkan HTML dan meng-escape semua nilai sebelum dimasukkan ke admin UI.

- Menyimpan hasil parsing sebagai data biasa, bukan sebagai HTML mentah.

- Menyediakan pesan error yang tidak membocorkan detail internal server.

## 12. Risiko dan Mitigasi

### 12.1 URL atau produk tidak tersedia

URL dapat berubah atau mengembalikan 404. Mitigasi: tampilkan status gagal dengan opsi input manual dan jangan membuat produk publik secara otomatis.

### 12.2 Halaman dinamis

Harga atau judul dapat dirender setelah JavaScript berjalan. Mitigasi: prioritaskan structured data jika tersedia, gunakan parser fallback, dan sediakan input manual. Penggunaan browser automation hanya dipertimbangkan jika benar-benar diperlukan karena biayanya dan kompleksitasnya lebih tinggi.

### 12.3 Struktur halaman berubah

Selector HTML dapat rusak setelah redesign situs sumber. Mitigasi: gunakan parser berlapis, simpan versi parser, tambahkan logging, dan selalu gunakan approval manual.

### 12.4 Harga berbeda berdasarkan lokasi atau sesi

Harga yang berhasil diambil belum tentu berlaku untuk semua pengguna. Mitigasi: labeli sebagai harga referensi, simpan timestamp, dan jangan menjadikannya harga jual otomatis.

### 12.5 Kebijakan dan beban situs sumber

Keputusan untuk tidak memakai API resmi atau meminta izin meningkatkan risiko perubahan akses, pemblokiran, dan potensi pelanggaran kebijakan sumber. Implementasi tidak boleh mengakali CAPTCHA, login, rate limit, atau proteksi teknis. Request harus dibatasi, transparan, dan menghormati aturan crawler serta kebijakan situs yang berlaku.

### 12.6 URL gambar tidak dapat digunakan permanen

URL gambar dapat kedaluwarsa atau hotlink dapat diblokir. Karena keputusan fase awal hanya menyimpan URL sumber, admin harus dapat mengganti URL atau mengunggah gambar manual jika gambar tidak dapat ditampilkan. Sistem tidak mengunduh atau menyalin file gambar ke storage internal.

## 13. Acceptance Criteria

### URL dan validasi

- Admin dapat memasukkan satu URL KlikIndomaret.

- URL non-HTTPS ditolak.

- Domain di luar allowlist ditolak.

- URL kosong atau tidak valid menampilkan pesan yang mudah dipahami.

- Redirect ke domain yang tidak diizinkan ditolak.

### Parsing dan preview

- Sistem menampilkan preview satu produk untuk satu URL.

- Jika tersedia, nama, harga referensi, deskripsi, dan gambar berhasil ditampilkan.

- Field yang gagal dibaca diberi peringatan.

- Admin dapat mengubah seluruh field hasil import sebelum menyimpan.

- Harga referensi terlihat terpisah dari harga jual internal.

### Approval dan publikasi

- Hasil import baru tidak tampil di katalog publik sebelum approval.

- Produk yang ditolak tidak tampil di katalog publik.

- Approval tidak mengubah stok internal secara otomatis.

- Approval tidak mengubah harga jual internal secara otomatis.

- Admin dapat melihat URL sumber dan waktu pengambilan pada halaman admin.

- Harga jual internal wajib terisi sebelum tombol approval dapat digunakan.

- Produk tanpa harga referensi tetap dapat di-approve apabila admin mengisi harga jual manual.

### Import ulang

- Admin dapat menjalankan import ulang secara manual.

- Sistem menampilkan perbandingan data lama dan data baru.

- Admin harus menyetujui perubahan.

- Import ulang tidak menghapus data internal yang tidak berasal dari sumber.

### Kegagalan dan keamanan

- Kegagalan sumber menyediakan opsi input manual.

- Timeout dan response terlalu besar ditangani tanpa membuat halaman admin macet.

- Request importer tidak dapat digunakan untuk mengakses alamat internal.

- Nilai dari sumber tidak dapat menyisipkan HTML atau script ke halaman admin.

## 14. Roadmap Implementasi

### Fase 1 — Fondasi dan kontrak data

- Menentukan field internal untuk URL sumber, harga referensi, timestamp, status import, dan catatan parser.

- Menentukan host KlikIndomaret yang diizinkan.

- Menentukan status lifecycle dan permission admin.

### Fase 2 — Importer dan preview

- Membuat endpoint server-side.

- Membuat validator URL dan perlindungan SSRF.

- Membuat parser JSON-LD, Open Graph, metadata, dan fallback.

- Membuat UI preview dengan edit manual.

### Fase 3 — Approval dan persistence

- Menyimpan draft import.

- Menambahkan approval dan reject.

- Menampilkan URL sumber dan metadata import pada halaman admin.

- Menjaga harga jual, stok, kategori, dan SKU internal tetap terpisah.

### Fase 4 — Import ulang manual dan QA

- Menambahkan import ulang manual.

- Menambahkan diff data lama versus data baru.

- Menambahkan audit log dan error handling.

- Menguji URL valid, 404, redirect, data tidak lengkap, harga berubah, gambar gagal, dan domain terlarang.

### Fase 5 — Rilis terbatas

- Mengaktifkan untuk admin terbatas.

- Memantau keberhasilan parser dan error sumber.

- Meninjau beban request serta hasil data.

- Memutuskan apakah perlu adapter parser tambahan atau perubahan kebijakan sumber.

## 15. Keputusan Final Sebelum Implementasi

Keputusan berikut sudah ditetapkan:

- Allowlist mencakup seluruh domain dan subdomain KlikIndomaret yang relevan.
- Sistem hanya menyimpan URL gambar sumber; sistem tidak menyalin gambar ke storage internal pada fase awal.
- Hasil import disimpan sebagai draft di sheet `products`.
- Approval memakai status import baru.
- Hanya satu admin yang dapat memeriksa dan menyetujui hasil import.
- Harga referensi tidak memiliki batas kedaluwarsa berbasis waktu. Harga tersebut dianggap referensi aktif sampai admin mengisi harga jual manual.
- Harga jual internal wajib diisi sebelum approval.
- Produk tanpa harga referensi tetap dapat di-approve apabila harga jual diisi manual.
- Snapshot historis tidak disimpan saat import ulang.
- Batas teknis yang direkomendasikan adalah timeout 15 detik, response HTML maksimal 3 MB, maksimal 3 redirect, dan URL maksimal 2.048 karakter. Karena gambar hanya disimpan sebagai URL, tidak ada batas ukuran file gambar yang diunduh oleh importer.

Hal yang masih perlu dipastikan saat desain teknis adalah daftar konkret host/subdomain KlikIndomaret yang akan dimasukkan ke konfigurasi allowlist dan nama field status import baru di sheet `products`.

## 16. Keputusan Rilis

Implementasi backend telah dimulai sesuai keputusan yang tercatat: penyimpanan URL gambar sumber, draft pada sheet `products`, status import baru, approval oleh satu admin, harga jual manual wajib sebelum approval, dan import ulang tanpa snapshot historis. Admin UI dan deployment ke Google Apps Script production masih menjadi langkah berikutnya.
