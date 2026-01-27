# Panduan Implementasi Fitur Harga Grosir Bertingkat (Tiered Pricing)

Dokumen ini merinci rencana implementasi untuk fitur harga grosir bertingkat pada proyek **Paket Sembako**, mencakup pengembangan antarmuka admin (UI Admin) untuk pengelolaan harga, serta integrasi logika harga ke dalam keranjang belanja dan format pesanan WhatsApp. Tujuan utamanya adalah mendorong pembelian dalam jumlah besar sambil memberikan pengalaman pengguna yang transparan dan efisien.

## 1. Struktur Data Harga Grosir di Google Sheets

Untuk mendukung fleksibilitas (tidak semua produk memiliki harga grosir) dan kemudahan pengelolaan melalui UI Admin, data harga grosir akan disimpan dalam format JSON di sebuah kolom khusus di Google Sheets. Ini memungkinkan penambahan tingkatan harga yang dinamis.

### 1.1. Contoh Struktur Kolom di Google Sheets

| Nama Produk | Harga Satuan | Data Grosir (JSON) |
| :--- | :--- | :--- |
| Indomie Goreng | 3.500 | `[{"min_qty": 5, "price": 3400}, {"min_qty": 10, "price": 3300}, {"min_qty": 11, "price": 3200}]` |
| Kopi Kapal Api | 2.000 | `[]` atau `null` |

*   **`Data Grosir (JSON)`:** Kolom ini akan berisi array objek, di mana setiap objek merepresentasikan satu tingkatan harga grosir. Jika produk tidak memiliki harga grosir, kolom ini bisa kosong (`[]`) atau `null`.
*   **`min_qty`:** Kuantitas minimal untuk mendapatkan harga tersebut.
*   **`price`:** Harga per unit untuk tingkatan kuantitas tersebut.

### 1.2. Logika Harga "Batas Atas" (Harga Terendah Berlaku Seterusnya)

Sesuai diskusi, jika pelanggan membeli kuantitas melebihi batas maksimal tingkatan harga grosir terakhir, harga terendah dari tingkatan terakhir tersebut akan tetap berlaku.

*   **Contoh:** Jika tingkatan terakhir adalah `min_qty: 11, price: 3200`, maka pembelian 41 pcs atau lebih akan tetap dihitung Rp 3.200 per unit.
*   **Implementasi:** Fungsi perhitungan harga akan mengurutkan tingkatan harga berdasarkan `min_qty` secara menurun dan mencari tingkatan pertama yang `min_qty`-nya kurang dari atau sama dengan kuantitas yang dibeli pelanggan.

## 2. Tahap 2: Pengembangan Halaman Admin untuk Input Harga Grosir

### 2.1. Tujuan
Memberikan antarmuka yang intuitif bagi admin untuk mengelola tingkatan harga grosir untuk setiap produk tanpa perlu mengedit Google Sheets secara langsung.

### 2.2. Desain UI Admin

*   **Daftar Produk:** Halaman admin akan menampilkan daftar semua produk yang diambil dari Google Sheets.
*   **Tombol/Toggle "Aktifkan Harga Grosir":** Di samping setiap produk, akan ada tombol atau *toggle* yang memungkinkan admin untuk mengaktifkan atau menonaktifkan fitur harga grosir untuk produk tersebut.
*   **Form Dinamis untuk Tingkatan Harga:**
    *   Jika harga grosir diaktifkan, sebuah form akan muncul untuk produk tersebut.
    *   Form ini akan memungkinkan admin untuk menambahkan, mengedit, atau menghapus tingkatan harga secara dinamis.
    *   Setiap tingkatan harga akan memiliki dua input: `Minimal Kuantitas (min_qty)` dan `Harga per Unit (price)`.
    *   Tombol `+ Tambah Tingkatan` dan `x Hapus` akan tersedia untuk fleksibilitas.
*   **Validasi Input:** Memastikan `min_qty` selalu lebih besar dari tingkatan sebelumnya dan `price` selalu lebih rendah dari tingkatan sebelumnya (atau harga satuan normal).
*   **Tombol Simpan:** Setelah perubahan dilakukan, tombol simpan akan mengirimkan data yang diperbarui ke Google Sheets melalui SheetDB API.

### 2.3. Alur Teknis UI Admin

1.  **Otentikasi Admin:** Memastikan hanya pengguna yang berwenang yang dapat mengakses halaman admin (jika sistem otentikasi sudah ada atau akan diimplementasikan).
2.  **Fetch Data Produk:** Mengambil seluruh daftar produk dari SheetDB API.
3.  **Render Daftar Produk:** Menampilkan setiap produk dengan informasi dasar dan status harga grosirnya.
4.  **Logika Form Dinamis:** Menggunakan *state management* (misalnya React State) untuk mengelola input tingkatan harga secara real-time di UI.
5.  **Update Google Sheets via SheetDB API:**
    *   Saat tombol simpan diklik, data harga grosir yang baru akan diformat menjadi string JSON.
    *   Permintaan `PUT` atau `PATCH` akan dikirim ke SheetDB API untuk memperbarui kolom `Data Grosir (JSON)` pada baris produk yang bersangkutan.
    *   **Penting:** SheetDB API harus dikonfigurasi untuk memungkinkan pembaruan data.

## 3. Tahap 3: Integrasi Logika Harga ke Keranjang Belanja dan WhatsApp

### 3.1. Tujuan
Memastikan harga grosir diterapkan secara otomatis di keranjang belanja, ditampilkan secara informatif kepada pelanggan, dan tercermin dengan benar dalam format pesanan yang dikirim ke WhatsApp.

### 3.2. Implementasi di Halaman Detail Produk & Keranjang Belanja

1.  **Tampilan Harga Grosir di Halaman Detail Produk:**
    *   Jika produk memiliki harga grosir, tampilkan tabel atau daftar tingkatan harga yang jelas (misalnya, "Beli 5-9: Rp 3.400", "Beli 10+: Rp 3.300").
    *   Tampilkan harga satuan normal sebagai harga dasar.
2.  **Update Harga Otomatis di Keranjang:**
    *   Saat pelanggan mengubah kuantitas produk di keranjang, fungsi perhitungan harga akan dipanggil.
    *   Harga per unit dan subtotal akan diperbarui secara *real-time*.
    *   **Visualisasi:** Tampilkan harga lama yang dicoret dan harga baru yang lebih rendah dengan penekanan visual (warna, ukuran font) untuk menyoroti diskon grosir.
3.  **Fitur "Progress Bar" (Opsional tapi Direkomendasikan):**
    *   Saat kuantitas produk di keranjang belum mencapai tingkatan grosir berikutnya, tampilkan pesan informatif.
    *   **Contoh:** Jika pelanggan membeli 3 Indomie (harga Rp 3.500), muncul pesan: *"Tambahkan 2 Indomie lagi untuk mendapatkan harga Rp 3.400 per bungkus!"*.
    *   Ini akan mendorong pelanggan untuk membeli lebih banyak.

### 3.3. Logika Perhitungan Harga (`calculateTieredPrice`)

Fungsi ini akan menjadi inti dari perhitungan harga grosir.

```javascript
function calculateTieredPrice(basePrice, quantity, tieredPrices) {
  // Pastikan tieredPrices diurutkan berdasarkan min_qty secara menurun
  // Contoh: [{min_qty: 11, price: 3200}, {min_qty: 10, price: 3300}, {min_qty: 5, price: 3400}]
  
  if (!tieredPrices || tieredPrices.length === 0) {
    return basePrice; // Tidak ada harga grosir, gunakan harga dasar
  }

  let effectivePrice = basePrice;
  for (const tier of tieredPrices) {
    if (quantity >= tier.min_qty) {
      effectivePrice = tier.price;
      break; // Tingkatan tertinggi yang memenuhi syarat ditemukan
    }
  }
  return effectivePrice;
}

// Contoh penggunaan:
const product = { basePrice: 3500, tieredPrices: [{min_qty: 5, price: 3400}, {min_qty: 10, price: 3300}, {min_qty: 11, price: 3200}] };
const qty = 15;
const pricePerUnit = calculateTieredPrice(product.basePrice, qty, product.tieredPrices);
const totalPrice = pricePerUnit * qty; // Hasil: 3200 * 15 = 48000
```

### 3.4. Integrasi ke Format Pesanan WhatsApp

1.  **Penyesuaian Pesan WhatsApp:** Saat pesanan dibuat dan dikirim ke WhatsApp, format pesan harus mencerminkan harga grosir yang diterapkan.
2.  **Detail Item:** Setiap item dalam pesanan akan mencakup kuantitas, harga per unit yang berlaku (setelah diskon grosir), dan subtotal untuk item tersebut.
    *   **Contoh:**
        ```
        *Pesanan Baru*
        --------------------
        Indomie Goreng (15 pcs) @Rp 3.200 = Rp 48.000
        Kopi Kapal Api (2 pcs) @Rp 2.000 = Rp 4.000
        --------------------
        Total: Rp 52.000
        ```
3.  **Kejelasan:** Memastikan bahwa penerima pesanan (admin) dan pelanggan memahami bahwa harga yang tertera sudah memperhitungkan diskon grosir.

## 4. Langkah-langkah Implementasi

1.  **Analisis & Persiapan:** Memahami struktur kode yang ada dan menyiapkan lingkungan pengembangan.
2.  **Modifikasi Google Sheets:** Menambahkan kolom `Data Grosir (JSON)` ke Google Sheets yang ada.
3.  **Pengembangan UI Admin:**
    *   Membuat halaman atau komponen admin baru.
    *   Mengimplementasikan fitur daftar produk, toggle harga grosir, dan form dinamis.
    *   Mengintegrasikan dengan SheetDB API untuk menyimpan data harga grosir.
4.  **Pengembangan Logika Harga:**
    *   Mengimplementasikan fungsi `calculateTieredPrice`.
    *   Mengintegrasikan fungsi ini ke dalam logika keranjang belanja untuk pembaruan harga otomatis.
    *   Mengembangkan UI untuk menampilkan tingkatan harga dan "Progress Bar" (jika disetujui).
5.  **Integrasi WhatsApp:** Menyesuaikan format pesan yang dikirim ke WhatsApp agar mencakup detail harga grosir.
6.  **Pengujian Menyeluruh:** Menguji semua skenario:
    *   Produk dengan/tanpa harga grosir.
    *   Berbagai kuantitas pembelian.
    *   Perubahan harga di keranjang.
    *   Format pesan WhatsApp yang benar.
    *   Fungsi UI Admin untuk menambah/mengedit/menghapus tingkatan harga.

## 5. Manfaat dan Pertimbangan

### 5.1. Manfaat
*   **Peningkatan Penjualan:** Mendorong pembelian dalam jumlah lebih besar.
*   **Efisiensi Admin:** Pengelolaan harga grosir yang mudah melalui UI Admin.
*   **Transparansi Harga:** Pelanggan mendapatkan informasi harga yang jelas dan *real-time*.
*   **Fleksibilitas:** Mudah menambahkan atau mengubah tingkatan harga tanpa perubahan kode.

### 5.2. Pertimbangan
*   **Keamanan UI Admin:** Memastikan halaman admin terlindungi dengan baik.
*   **Penanganan Error API:** Mengimplementasikan penanganan error yang robust untuk komunikasi dengan SheetDB API.
*   **UX Mobile:** Memastikan tampilan harga grosir dan keranjang belanja responsif dan mudah digunakan di perangkat mobile.

Dokumen ini akan menjadi panduan utama untuk pengembangan fitur harga grosir. Saya siap untuk memulai implementasi fitur katalog acak terlebih dahulu, dan kemudian beralih ke fitur ini sesuai rencana. 
