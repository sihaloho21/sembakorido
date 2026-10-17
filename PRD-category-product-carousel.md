# PRD — Baris Produk per Kategori dengan Carousel

- **Produk:** Paket Sembako
- **Fitur:** Beranda — carousel produk per kategori
- **Status:** **Disetujui — Fase 0–4 telah diimplementasikan; Fase 5 (QA, rilis, dan pemantauan) masih pending**
- **Versi:** 1.0
- **Tanggal:** 17 Oktober 2026
- **Platform:** Web responsif (mobile, tablet, desktop)

> Pengguna telah menyetujui PRD ini sebagai dasar pengembangan bertahap pada 17 Oktober 2026. Implementasi Fase 1–4 telah tersedia di repository dan mengikuti roadmap dokumen ini. Fase 5 tetap diperlukan untuk menyelesaikan QA, verifikasi gate, dan rilis terukur.

## 1. Ringkasan

Fitur ini menambahkan beberapa section produk pada halaman beranda, satu section untuk setiap kategori yang dipilih admin. Setiap section memiliki judul kategori, deretan kartu produk horizontal yang dapat digeser ke kiri/kanan, serta tautan **Lihat Semua**.

Contoh kategori yang dapat dipilih admin: **Minyak Goreng**, **Mie Instan**, dan **Minuman**. Kategori tidak dikodekan secara permanen: daftar harus berasal dari kategori dan produk yang dikelola melalui sistem saat ini.

Saat pengguna memilih **Lihat Semua**, situs memakai katalog grid dan filter kategori yang sudah ada untuk menampilkan produk kategori tersebut saja. Dengan demikian, fitur baru menjadi jalur penemuan produk tambahan, bukan pengganti atau duplikasi katalog utama.

### Keputusan yang telah dikonfirmasi pengguna

1. “Jumlah slide” berarti **batas maksimum jumlah produk dalam carousel pada setiap kategori**, bukan jumlah kartu yang terlihat sekaligus. Jumlah kartu yang terlihat menyesuaikan lebar layar.
2. Batas jumlah produk dapat diatur **secara terpisah untuk setiap kategori**.
3. Saat **Lihat Semua** diklik, kata kunci pencarian aktif dikosongkan agar grid menampilkan seluruh produk pada kategori tersebut.

## 2. Latar belakang dan masalah

Saat ini halaman utama menampilkan satu katalog melalui `#product-grid`. Pengguna dapat memilih kategori melalui filter kategori, lalu hasilnya ditampilkan dalam grid dengan pagination. Ini berguna untuk menjelajahi katalog, tetapi pengguna harus memilih kategori atau menelusuri grid untuk menemukan kategori produk tertentu.

Pola section kategori ber-carousel, seperti pada contoh visual yang diberikan, dapat menonjolkan kelompok belanja penting lebih awal. Pengguna dapat melihat beberapa kartu dengan cepat, menggeser untuk melihat produk lainnya, atau berpindah ke grid penuh dari **Lihat Semua**.

## 3. Tujuan dan indikator keberhasilan

| Tujuan | Indikator keberhasilan produk |
|---|---|
| Mempercepat penemuan produk populer menurut kategori | Pengguna dapat menemukan section dan memahami bahwa daftar dapat digeser |
| Menampilkan kategori yang relevan tanpa hard-code | Admin dapat memilih kategori yang sudah ada, termasuk kategori baru setelah ditambahkan ke katalog |
| Memberi jalur dari carousel ke katalog lengkap | **Lihat Semua** membuka grid existing dengan kategori yang tepat aktif |
| Mempertahankan pembelian yang sudah tersedia | Harga, stok, variasi, keranjang, detail, promo, poin, dan harga grosir tetap konsisten dengan kartu existing |
| Memungkinkan pengaturan operasional | Pengaturan kategori dan batas produk tersimpan di backend bersama, bukan hanya di browser admin |
| Menjaga beranda tetap responsif | Tidak ada horizontal overflow pada halaman; carousel hanya bergeser di dalam areanya |

Keberhasilan bisnis dapat diukur setelah analytics yang sudah disetujui tersedia, misalnya klik **Lihat Semua**, interaksi carousel, dan penambahan ke keranjang dari section. PRD ini tidak mengasumsikan bahwa pipeline analytics tertentu sudah terpasang.

## 4. Pengguna dan user stories

1. **Sebagai pembeli**, saya ingin melihat baris produk Minyak Goreng, Mie Instan, atau Minuman agar bisa menemukan pilihan relevan tanpa lebih dahulu mengubah filter.
2. **Sebagai pembeli mobile**, saya ingin menggeser deretan produk dengan jari agar dapat menjelajahi lebih banyak produk dalam kategori yang sama.
3. **Sebagai pembeli**, saya ingin menekan **Lihat Semua** agar saya mendapatkan grid lengkap kategori yang sedang saya lihat.
4. **Sebagai admin**, saya ingin memilih kategori yang tampil di beranda dan mengatur urutannya agar kategori yang penting terlihat lebih dahulu.
5. **Sebagai admin**, saya ingin menentukan jumlah maksimum produk pada setiap carousel agar panjang baris sesuai kebutuhan kategori.
6. **Sebagai pengguna keyboard atau teknologi bantu**, saya ingin memahami nama kategori, keadaan tombol geser, dan posisi kontrol tanpa bergantung hanya pada gerakan visual.

## 5. Ruang lingkup

### Termasuk

- Section kategori yang dikonfigurasi admin di beranda.
- Header section berisi nama kategori dan tautan **Lihat Semua**.
- Carousel horizontal yang dapat digeser dengan touch, trackpad, mouse/scroll, dan tombol kontrol yang aksesibel.
- Batas jumlah produk per kategori, urutan section, dan aktif/nonaktif per kategori di pengaturan admin.
- Integrasi dengan data produk/kategori dan kartu produk yang sudah ada.
- Perpindahan ke `#product-grid` dengan kategori yang sesuai dipilih melalui alur filter existing.
- Fallback aman bila konfigurasi gagal dimuat atau kategori tidak memiliki produk.

### Tidak termasuk (non-goals)

- Mengubah format data produk, sheet `products`, sheet `categories`, harga, aturan stok, checkout, pembayaran, diskon, atau login.
- Membuat halaman produk/grid kategori baru yang terpisah dari katalog existing.
- Mengubah tampilan atau aturan filter kategori existing di dock/rail. Pengecualian yang disetujui: **Lihat Semua** mengosongkan query pencarian aktif sebelum menerapkan kategori.
- Menambah mekanisme merchandising manual per produk, ranking rekomendasi, personalisasi, atau iklan.
- Mengganti desain kartu produk atau menambah perilaku keranjang yang berbeda.
- Menghapus/memindahkan kategori atau produk di Google Sheets.

## 6. Alur pengguna

### 6.1 Menjelajah dari beranda

1. Beranda memuat data produk dan kategori melalui layanan existing.
2. Beranda membaca konfigurasi showcase publik yang hanya berisi pengaturan aman untuk ditampilkan.
3. Untuk setiap kategori yang aktif dan memiliki produk yang memenuhi syarat, situs membuat satu section.
4. Pengguna menggeser carousel secara horizontal. Kontrol panah dapat ditampilkan pada desktop, sedangkan gesture swipe tersedia pada perangkat sentuh.
5. Setiap kartu mempertahankan aksi existing seperti melihat detail, memilih variasi, dan menambah/mengubah jumlah di keranjang.

### 6.2 Membuka grid kategori lengkap

1. Pengguna menekan **Lihat Semua** pada section.
2. Situs mengosongkan kata kunci pencarian aktif, memilih kategori terkait melalui fungsi kategori existing (`setCategory()`/alur setara), mereset katalog ke halaman pertama, lalu menggulir ke `#product-grid`.
3. Grid hanya menampilkan produk kategori tersebut melalui filter yang sudah ada; pagination existing tetap berlaku.
4. Filter kategori, field pencarian, tombol kategori aktif, header kategori, dan grid harus berada pada state yang sama.

### 6.3 Mengatur section di admin

1. Admin membuka **Pengaturan** pada panel admin.
2. Admin memilih kategori dari kategori yang telah dikelola pada fitur katalog.
3. Admin mengaktifkan/menonaktifkan kategori, menentukan urutan tampil, dan mengatur batas jumlah produk untuk masing-masing kategori.
4. Admin menyimpan pengaturan. Perubahan hanya dianggap berhasil setelah nilai tersimpan pada server.
5. Beranda membaca konfigurasi yang sama untuk semua pengunjung, dengan keterlambatan cache yang ditentukan di bagian teknis.

## 7. Persyaratan fungsional

| ID | Persyaratan | Prioritas |
|---|---|---|
| FR-01 | Beranda harus dapat menampilkan nol atau lebih section kategori sesuai konfigurasi server. | Must |
| FR-02 | Nama kategori harus berasal dari sumber kategori/produk existing, bukan daftar kategori hard-coded. | Must |
| FR-03 | Setiap section harus menampilkan nama kategori dan **Lihat Semua** yang jelas. | Must |
| FR-04 | Setiap section menampilkan produk yang kategorinya sama setelah normalisasi kategori, sesuai batas produk per kategori. | Must |
| FR-05 | Carousel harus mendukung geser horizontal dengan touch, mouse/trackpad/scroll, dan navigasi tombol yang tersedia. | Must |
| FR-06 | Pengguna harus dapat mengoperasikan carousel dengan keyboard; posisi awal/akhir harus tercermin pada state tombol kontrol. | Must |
| FR-07 | **Lihat Semua** harus mengosongkan query pencarian aktif, memilih kategori yang sama melalui alur filter existing, mereset pagination ke halaman pertama, dan menggulir ke katalog grid. | Must |
| FR-08 | Perpindahan ke grid tidak boleh membuat filter kategori dan header kategori yang sudah ada tidak sinkron. | Must |
| FR-09 | Kartu carousel harus menggunakan markup/rendering dan behavior produk yang sama atau komponen bersama dengan `#product-grid`. | Must |
| FR-10 | Aksi kartu—detail produk, variasi, harga, promo, stok, produk tersembunyi, poin, grosir, dan keranjang—harus tetap mengikuti implementasi existing. | Must |
| FR-11 | Admin harus dapat memilih kategori yang aktif, mengubah urutan section, dan mengatur batas jumlah produk per section. | Must |
| FR-12 | Admin harus dapat melihat dan mengubah konfigurasi yang tersimpan; nilai tidak hanya disimpan di `localStorage`/`sessionStorage`. | Must |
| FR-13 | Kategori tanpa produk yang dapat ditampilkan tidak menghasilkan section kosong; admin dapat diberi status/peringatan di panel pengaturan. | Must |
| FR-14 | Jika konfigurasi tidak ada/tidak valid/gagal dimuat, katalog utama tetap berfungsi. Rekomendasi default: tidak menampilkan section kategori sampai admin mengaktifkannya. | Must |
| FR-15 | Perubahan kategori produk di panel admin harus tercermin setelah data/cache katalog diperbarui, tanpa mengubah konfigurasi kategori secara diam-diam. | Should |
| FR-16 | Urutan produk dalam suatu carousel mengikuti urutan sumber katalog/aturan existing; tidak menambahkan ranking baru pada fase ini. | Should |
| FR-17 | Bila URL state didukung tanpa konflik dengan routing existing, pilihan **Lihat Semua** dapat direpresentasikan di URL agar refresh/back tetap mempertahankan kategori. | Could |

### 7.1 Rancangan pengaturan admin

Bagian baru di dalam panel **Pengaturan**, misalnya **Tampilan Kategori Beranda**, memuat tabel atau daftar konfigurasi berikut:

| Kolom | Fungsi |
|---|---|
| Tampilkan | Mengaktifkan/nonaktifkan section kategori |
| Kategori | Dropdown kategori dari sheet/data kategori yang ada |
| Urutan | Angka atau kontrol naik/turun untuk mengurutkan section beranda |
| Jumlah produk | Batas maksimum kartu yang dimuat pada carousel kategori ini |
| Jumlah produk tersedia | Informasi baca-saja dari katalog agar admin tahu jumlah aktual |
| Status | Menjelaskan jika kategori belum memiliki produk atau konfigurasi invalid |

Nilai awal yang direkomendasikan: **10 produk per kategori**. Admin mendapat pilihan cepat **5, 10, 15, 20, 30** dan dapat memasukkan angka khusus **1–50**; validasi menolak nilai nol, pecahan, atau di luar rentang. Nilai dapat berbeda untuk setiap kategori. Jika produk aktual lebih sedikit daripada batas, tampilkan produk yang tersedia saja.

Daftar kategori harus mencegah penambahan kategori yang sama dua kali. Jika kategori dihapus atau namanya diganti melalui pengelolaan kategori, konfigurasi lama tidak boleh menyebabkan beranda crash; admin harus dapat mengetahui dan memperbaikinya.

## 8. Konsep tampilan dan responsive behavior

Contoh visual pengguna memperlihatkan judul kategori di kiri, **Lihat Semua** di kanan, dan baris kartu yang dapat digeser. Desain final perlu mengikuti design system Paket Sembako dan kartu produk existing, bukan menyalin elemen merek/warna dari gambar referensi.

- **Mobile:** satu baris horizontal; swipe natural; sebagian kartu berikutnya dapat terlihat sebagai petunjuk bahwa row bisa digeser. Sediakan tombol panah atau kontrol alternatif yang dapat diakses tanpa menghalangi swipe. Halaman induk tidak ikut mengalami overflow horizontal.
- **Tablet:** beberapa kartu terlihat dengan ruang antar-kartu yang cukup; gesture dan kontrol tetap tersedia.
- **Desktop:** tampilkan beberapa kartu sekaligus, tombol panah kiri/kanan untuk menggeser satu langkah yang masuk akal, dan state disabled saat sudah di ujung.
- Lebar kartu dan banyak kartu yang tampak sekaligus ditentukan breakpoint layar; jangan menyamakan nilai ini dengan batas jumlah produk yang admin pilih.
- Gambar dan kartu mempertahankan rasio/dimensi agar layout stabil saat gambar dimuat.
- Section yang diaktifkan admin mengikuti urutan yang disimpan. Section tidak aktif tidak muncul.
- Hormati `prefers-reduced-motion`; transisi scroll tidak wajib dianimasikan.

### Wireframe konseptual

```text
MINYAK GORENG                            Lihat Semua  ›
[ kartu 1 ] [ kartu 2 ] [ kartu 3 ] [ kartu 4 ]  →

MIE INSTAN                               Lihat Semua  ›
[ kartu 1 ] [ kartu 2 ] [ kartu 3 ] [ kartu 4 ]  →

MINUMAN                                  Lihat Semua  ›
[ kartu 1 ] [ kartu 2 ] [ kartu 3 ] [ kartu 4 ]  →

Katalog Produk
[filter kategori existing]
[grid produk existing + pagination]
```

## 9. Integrasi dengan fitur existing

### Katalog dan kategori

- Data produk storefront saat ini dimuat oleh `fetchProducts()` ke `allProducts`; kategori juga dimuat melalui `fetchCategories()` dan digabung dengan kategori yang terdeteksi dari produk.
- Normalisasi kategori existing perlu digunakan agar perbedaan kapitalisasi/spasi tidak menciptakan dua section untuk kategori yang sama.
- Fitur kategori jangan mengubah pengelolaan kategori, filter dock, bottom sheet kategori, atau aturan pemfilteran `filterProducts()`.

### Grid, pagination, dan pencarian

- Katalog tujuan **Lihat Semua** adalah `#product-grid` existing.
- Gunakan alur `setCategory()` dan `filterProducts()` agar state tombol filter, header menu, hasil grid, reset halaman, dan pagination tetap sejalan.
- Saat **Lihat Semua** dipilih, query pencarian dikosongkan sebelum filter kategori diterapkan; state field pencarian dan grid harus sinkron. Dukungan URL state bersifat opsional dan tidak boleh mengubah perilaku tersebut.

### Kartu, stok, dan keranjang

- Hindari membuat salinan renderer kartu yang berbeda. PRD merekomendasikan fungsi/komponen kartu bersama atau refactor terkontrol agar kartu grid dan carousel memakai sumber markup dan logika yang sama.
- Delegasi event saat ini perlu mencakup container carousel agar kontrol `show-detail`, variasi, dan kontrol keranjang tetap berfungsi di luar `#product-grid`.
- Produk dengan status disembunyikan, stok habis/terbatas, harga promo, harga grosir, variasi, dan poin harus tetap menunjukkan state yang sama dengan grid.
- Penambahan dari carousel harus memperbarui cart state dan indikator cart global existing; jangan membuat keranjang lokal terpisah.

### Pengaturan admin dan backend

- Panel admin existing memiliki bagian `Pengaturan`, `loadSettings()` dan `saveSettings()` pada `admin/js/admin-script.js`; `GASActions.upsertSetting()` menyimpan key/value ke sheet `settings`.
- Konfigurasi server yang diusulkan disimpan sebagai satu setting versi-terstruktur, contoh key: `category_showcase_config`, berisi status global serta entri kategori (`category`, `enabled`, `sort_order`, `max_products`). Ini menyimpan preferensi katalog di backend bersama, bukan per-browser.
- `upsert_setting` saat ini memiliki otorisasi role yang harus tetap dihormati—termasuk batas Superadmin yang telah berlaku pada aksi tersebut.
- Jangan membuat setting menjadi publik dengan membuka seluruh sheet `settings`. Saat ini sheet `settings` termasuk daftar data sensitif. Jika storefront perlu membaca konfigurasi, sediakan endpoint GET publik yang hanya mengembalikan konfigurasi showcase yang di-allowlist/validasi; jangan mengembalikan token, setting PayLater, referral, webhook, atau data internal lainnya.
- Perubahan GAS, kontrak API, dan storefront akan dikerjakan berurutan sesuai fase dan gate pada PRD ini; persetujuan dokumen tidak mengubah ruang lingkup fase secara otomatis.

### Cache dan sinkronisasi

- API katalog produk/kategori saat ini menggunakan cache client sekitar lima menit. PRD mengusulkan agar data konfigurasi mengikuti pola cache terkendali dan dapat diperbarui setelah TTL atau invalidasi cache.
- Rekomendasi target propagasi perubahan konfigurasi: muncul untuk pengunjung dalam waktu **maksimal 5 menit** tanpa harus admin mengubah local storage pengunjung.
- Jika konfigurasi belum bisa dibaca, jangan tampilkan data parsial/malformed; halaman utama tetap menyajikan grid existing.

## 10. Model konfigurasi usulan

Contoh konseptual nilai pada key `category_showcase_config`:

```json
{
  "version": 1,
  "enabled": true,
  "categories": [
    { "category": "Minyak Goreng", "enabled": true, "sort_order": 1, "max_products": 10 },
    { "category": "Mie Instan", "enabled": true, "sort_order": 2, "max_products": 10 },
    { "category": "Minuman", "enabled": true, "sort_order": 3, "max_products": 15 }
  ]
}
```

Model ini adalah kontrak konseptual PRD, **bukan perubahan database yang sudah diterapkan**. Nilai kategori harus divalidasi/di-escape, `max_products` harus integer 1–50, dan konfigurasi yang tidak valid harus diabaikan dengan fallback aman.

## 11. Persyaratan nonfungsional

### Kinerja

- Jangan membuat request produk baru untuk setiap kategori. Gunakan data produk yang sudah dimuat dan saring di sisi client, kecuali analisis implementasi menyimpulkan payload terlalu besar.
- Maksimal satu pembacaan konfigurasi publik per sesi halaman (cache sesuai TTL); hindari request berulang ketika setiap carousel digeser.
- Terapkan lazy loading gambar di luar viewport sesuai standar gambar existing.
- Render section secara efisien; jangan memasang listener individual untuk setiap kartu jika delegasi event dapat digunakan.
- Carousel tidak boleh menghambat interaksi search, grid, atau add-to-cart.

### Aksesibilitas

- Judul setiap carousel harus terhubung secara semantik ke container.
- Tombol harus memiliki label seperti `Geser Minyak Goreng ke kiri`/`Geser Minyak Goreng ke kanan` dan state disabled/hidden yang tepat.
- Container harus dapat dioperasikan dengan keyboard; focus-visible harus jelas.
- Gesture swipe bukan satu-satunya cara mengakses produk.
- Hormati pengurangan gerak dan gunakan target kontrol sentuh yang memadai.

### Keamanan dan privasi

- Konfigurasi kategori publik hanya berisi nama/urutan/status kategori serta batas tampilan.
- Endpoint publik tidak boleh meneruskan sheet `settings` keseluruhan.
- Perubahan konfigurasi hanya dilakukan melalui admin yang memiliki otorisasi sesuai kebijakan existing.

## 12. Edge cases dan aturan fallback

1. **Kategori terpilih tidak ada:** abaikan entri konfigurasi itu di storefront dan tampilkan status yang dapat diperbaiki di admin.
2. **Kategori ada tetapi tidak memiliki produk:** jangan render section kosong; admin melihat hitungan nol.
3. **Produk kurang dari batas:** render jumlah yang tersedia tanpa placeholder tambahan.
4. **Konfigurasi kosong/tidak valid:** sembunyikan section showcase dan biarkan filter/grid existing berjalan.
5. **API konfigurasi gagal:** tampilkan grid tanpa error fatal; jangan menghalangi checkout atau cart.
6. **API produk gagal:** ikuti perilaku error katalog existing; carousel tidak boleh menampilkan snapshot yang berbeda dari katalog aktif.
7. **Perubahan kategori produk saat halaman terbuka:** section boleh tetap pada snapshot halaman tersebut; refresh data berikutnya harus menggunakan kategori terbaru.
8. **Nama kategori panjang atau mengandung karakter khusus:** tampilkan dengan aman, jangan merusak layout atau markup.
9. **Layar sangat sempit:** carousel tetap dapat digeser tanpa membuat body melebar.
10. **Klik kartu vs gesture:** swipe/scroll tidak boleh salah memicu detail produk atau tombol cart.
11. **Produk tersembunyi/stok nol:** gunakan tampilan/status dan aturan interaksi kartu existing; jangan memperkenalkan policy stok baru.
12. **Refresh atau tombol Back setelah Lihat Semua:** kategori/filter harus tetap konsisten menurut routing existing; URL state khusus boleh ditambahkan sebagai peningkatan opsional, bukan syarat peluncuran awal.

## 13. Acceptance criteria

1. Admin yang berwenang dapat memilih lebih dari satu kategori valid untuk ditampilkan di beranda.
2. Admin dapat mengaktifkan/nonaktifkan section, mengatur urutan section, dan menyimpan jumlah maksimum produk per kategori.
3. Setelah disimpan, konfigurasi bertahan di backend dan dapat dibaca oleh pengunjung lain; tidak bergantung pada browser admin.
4. Beranda menampilkan satu section untuk setiap kategori aktif yang memiliki produk, dengan header kategori dan **Lihat Semua**.
5. Produk di satu section hanya berasal dari kategori section tersebut dan jumlah kartu tidak melebihi batas konfigurasi.
6. Pengguna dapat menggeser carousel dengan touch dan metode alternatif yang tersedia; tidak ada horizontal overflow pada halaman.
7. **Lihat Semua** mengosongkan pencarian aktif, mengaktifkan kategori yang benar pada filter existing, mereset halaman grid ke awal, dan membawa pengguna ke `#product-grid`.
8. Filter, pencarian, header kategori, bottom sheet, dan pagination existing tidak kehilangan sinkronisasi.
9. Kartu carousel mendukung harga, stok, promo, variasi, detail produk, poin/grosir sesuai behavior kartu existing.
10. Add-to-cart dari carousel mengubah keranjang global satu kali dan kuantitas tetap konsisten dengan grid.
11. Kegagalan konfigurasi tidak membuat homepage/grid utama gagal dirender.
12. Endpoint publik konfigurasi tidak mengekspos data setting selain field yang diizinkan.
13. Pengguna keyboard dapat menjangkau carousel dan menggesernya; kontrol memiliki label yang bermakna.
14. Tidak ada error JavaScript baru pada load katalog, swipe, tombol panah, **Lihat Semua**, add-to-cart, atau navigasi kembali.
15. Tampilan diuji pada viewport 320px, 375px, 768px, 1024px, dan desktop lebar.
16. Tes regresi memastikan filter existing, pagination, pencarian, produk tersembunyi, stok, cart, variasi, serta aturan role pengaturan tetap berfungsi.

## 14. Rencana QA

| Skenario | Hasil yang diharapkan |
|---|---|
| 0 kategori dikonfigurasi | Showcase tidak tampil; grid lama tetap normal |
| 1, 3, atau 10 kategori aktif | Section tampil sesuai urutan setting |
| Kategori dengan 3 produk, batas 10 | Hanya 3 produk ditampilkan |
| Batas produk preset 5/10/15/20/30 dan angka khusus 1/25/50 | Jumlah kartu tidak melebihi nilai per kategori; nilai 0/pecahan/di luar 1–50 ditolak |
| Kategori Minuman dipilih untuk **Lihat Semua** | Query dikosongkan, filter kategori Minuman aktif, dan grid berada pada halaman pertama |
| Search sebelumnya berisi teks | Field pencarian tampak kosong; grid menampilkan seluruh produk kategori yang dipilih |
| Produk ada promo, grosir, variasi atau stok habis | Kartu/aksi konsisten dengan grid existing |
| Produk ditambahkan ke cart dari carousel | Cart badge dan jumlah item diperbarui tanpa duplikasi |
| API setting 500/timeout/konfigurasi rusak | Beranda dan grid tetap dapat digunakan |
| Admin tidak punya role memadai | Simpan ditolak sesuai aturan otorisasi; tidak ada perubahan setting |
| Kategori dihapus/diubah namanya | Section usang tidak menyebabkan crash; admin mendapat indikator |
| Touch, keyboard, reduced-motion | Semua kontrol dapat dioperasikan tanpa bergantung pada animasi/gesture |

## 15. Risiko dan mitigasi

| Risiko | Mitigasi PRD |
|---|---|
| Kartu dibuat ulang khusus carousel lalu behavior keranjang berbeda | Gunakan renderer/komponen bersama dan regresi add-to-cart/variasi |
| Setiap section memicu request sendiri dan memperlambat halaman | Gunakan produk/kategori yang telah dimuat; satu konfigurasi publik ter-cache |
| Endpoint membuka seluruh sheet `settings` | Buat read endpoint publik dengan allowlist khusus showcase |
| Admin dan pengunjung melihat config yang berbeda karena local storage/cache | Persisten di `settings` melalui `upsert_setting`; target cache/propagasi lima menit |
| Perubahan kategori membuat config yatim | Validasi konfigurasi dan tampilkan kategori tidak valid di admin |
| Carousel mengganggu scroll vertikal atau klik kartu | Uji gesture, pointer, keyboard, dan event delegation di mobile/desktop |
| Terlalu banyak section membuat homepage panjang | Admin mengatur enable/urutan/jumlah; rekomendasi 3–6 section aktif, beri peringatan jika melebihi 6 tanpa memblokir konfigurasi |
| Batas produk terlalu besar meningkatkan payload/render | Validasi nilai per kategori pada rentang 1–50, gunakan lazy loading, dan uji jumlah maksimum |

## 16. Keputusan dan nilai awal yang disepakati

Keputusan berikut dikonfirmasi pengguna pada 17 Oktober 2026 dan menjadi persyaratan dasar:

| Keputusan | Ketentuan final |
|---|---|
| Makna “jumlah slide” | Batas maksimum **jumlah produk dalam carousel** untuk suatu kategori; bukan jumlah kartu yang terlihat sekaligus. |
| Cakupan pengaturan jumlah | Nilai diatur **secara terpisah per kategori**. |
| Perilaku **Lihat Semua** | Kosongkan pencarian aktif, pilih kategori terkait, reset pagination ke halaman pertama, lalu arahkan ke grid. |
| Status PRD | Pengguna menyetujui PRD sebagai dasar pengembangan bertahap. Persetujuan ini tidak berarti implementasi dilakukan dalam tugas penyusunan/push PRD ini. |

Nilai awal untuk desain implementasi:

- Default batas carousel: **10 produk untuk setiap kategori**.
- Pilihan cepat: **5, 10, 15, 20, atau 30**; angka khusus **1–50** juga dapat dimasukkan.
- Kategori tidak otomatis diaktifkan hanya karena tersedia. Admin memilih section dan urutannya.
- Rekomendasi operasional adalah **3–6 section aktif**. Tidak ada batas keras pada jumlah section; tampilkan peringatan admin ketika lebih dari 6.
- Banyak kartu yang terlihat sekaligus menyesuaikan breakpoint perangkat. Urutan produk dalam carousel mengikuti urutan katalog existing; tidak menambahkan ranking/rekomendasi baru.
- State kategori di URL/history boleh ditambahkan bila tidak mengganggu routing existing; fitur ini bukan prasyarat peluncuran awal.
- Jika konfigurasi showcase belum tersedia atau belum diaktifkan, storefront hanya menampilkan katalog existing.

## 17. Roadmap pengembangan bertahap

Fase dilaksanakan berurutan. Setiap fase menghasilkan perubahan dan tes yang dapat ditinjau sebelum fase berikutnya dimulai.

| Fase | Fokus | Hasil kerja | Gate untuk melanjutkan |
|---|---|---|---|
| **0 — PRD dan kontrak produk** | Menetapkan kebutuhan, keputusan pengguna, batas integrasi, model konfigurasi, dan kriteria penerimaan. | PRD v1.0 ini, termasuk definisi jumlah produk per kategori dan perilaku pencarian saat **Lihat Semua**. **Status: selesai/disetujui.** | Scope dan keputusan utama dicatat. |
| **1 — Kontrak backend dan keamanan konfigurasi** | Menyediakan penyimpanan konfigurasi bersama dan read path publik terbatas. | Setting berversi `category_showcase_config`; validasi kategori, urutan dan nilai 1–50; upsert melalui pola `settings` existing; endpoint publik khusus yang hanya mengembalikan field showcase yang di-allowlist; default/fallback dan cache. **Status: diimplementasikan** pada `32d4cd5` dan `7a53f33`. | Implementasi tersedia; verifikasi gate keamanan dan regresi formal dilanjutkan pada Fase 5. |
| **2 — Pengaturan admin** | Memungkinkan admin mengelola section tanpa mengubah data produk. | Panel **Tampilan Kategori Beranda** di Pengaturan: pilih kategori, aktif/nonaktif, urutan, jumlah maksimum per kategori (preset dan angka khusus), jumlah produk tersedia/status, validasi duplikasi serta kategori tidak aktif/hilang; load/save dari server. **Status: diimplementasikan** pada `32d4cd5`. | Implementasi tersedia; verifikasi role dan persistensi end-to-end dilanjutkan pada Fase 5. |
| **3 — Section beranda dan carousel** | Menampilkan produk per kategori memakai katalog serta kartu existing. | Section berurutan sesuai konfigurasi; render hanya kategori aktif yang memiliki produk; geser touch/trackpad, tombol desktop dan keyboard; responsive; renderer kartu bersama; gambar lazy-load; cart/detail/variasi mempertahankan perilaku existing. **Status: diimplementasikan** pada `32d4cd5`. | Implementasi tersedia; verifikasi browser, aksesibilitas, responsive, dan regresi kartu dilanjutkan pada Fase 5. |
| **4 — Navigasi Lihat Semua dan sinkronisasi katalog** | Menghubungkan section ke katalog grid existing. | Saat diklik: kosongkan search input/state, terapkan kategori dengan API filter existing, reset halaman ke 1, update rail/sheet/header state, dan scroll ke `#product-grid`; pagination existing tetap berlaku. **Status: diimplementasikan** pada `32d4cd5`. | Implementasi tersedia; verifikasi sinkronisasi state dan regresi katalog dilanjutkan pada Fase 5. |
| **5 — QA, rilis, dan pemantauan** | Memastikan regresi terkendali dan mengaktifkan fitur secara terukur. | Tes unit/integrasi/browser; viewport 320/375/768/1024/desktop; aksesibilitas, kinerja, security, error/fallback; rencana rilis bertahap; daftar kategori awal hanya diaktifkan setelah data nyata diverifikasi. | Semua acceptance criteria Must lulus; katalog, search, filter, pagination, stok, detail, variasi, dan cart existing lulus regresi; tersedia cara mematikan showcase tanpa mematikan katalog utama. |

### Ketergantungan antar fase

1. Fase 1 mengunci kontrak API/config yang dipakai Fase 2 dan Fase 3.
2. Fase 2 perlu membaca katalog kategori existing dan menyimpan konfigurasi melalui otorisasi setting yang berlaku.
3. Fase 3 menggunakan data katalog dan konfigurasi publik; Fase 4 memakai fungsi filter yang sama dengan katalog grid.
4. Fase 5 menguji gabungan Fase 1–4. Tidak ada fase yang boleh melewati gate keamanan atau regresi yang menjadi dependensinya.

### Rilis dan pemulihan

- Gunakan sakelar global showcase pada konfigurasi agar section dapat dinonaktifkan cepat tanpa memengaruhi `#product-grid`, filter, atau keranjang.
- Jika pembacaan konfigurasi gagal atau konfigurasi harus dipulihkan, matikan showcase dan pertahankan alur katalog lama.
- Aktifkan kategori contoh Minyak Goreng, Mie Instan, dan Minuman hanya bila kategori tersebut benar-benar tersedia dan memiliki produk valid di data produksi.
- Rilis/deployment dilakukan setelah gate fase QA terpenuhi; penyusunan dan push PRD tidak melakukan deployment.

## 18. Status pengembangan

- **PRD:** disetujui sebagai dasar roadmap.
- **Fase 0:** selesai.
- **Fase 1:** selesai diimplementasikan pada commit `32d4cd5`, dengan integrasi endpoint GAS v7.1 pada `7a53f33`; gate QA formal masih pending.
- **Fase 2:** selesai diimplementasikan pada commit `32d4cd5`; gate verifikasi role dan persistensi end-to-end masih pending.
- **Fase 3:** selesai diimplementasikan pada commit `32d4cd5`; gate verifikasi browser, aksesibilitas, responsive, dan regresi kartu masih pending.
- **Fase 4:** selesai diimplementasikan pada commit `32d4cd5`; gate verifikasi sinkronisasi katalog dan regresi filter/search/pagination/cart masih pending.
- **Fase 5:** belum selesai; QA, rilis, pemantauan, dan verifikasi seluruh acceptance criteria masih pending.
- Perubahan kode dan patch Google Apps Script sudah tersedia di repository; deployment spreadsheet/backend produksi belum dinyatakan selesai oleh PRD ini.
- Validasi repository yang tersedia: lint dasar dan test konfigurasi category showcase lulus; suite penuh masih memerlukan dependency build Tailwind yang tersedia.
