# Panduan Implementasi Fitur Katalog Paket Sembako

Dokumen ini merinci rencana implementasi untuk fitur pengacakan katalog produk dan sistem paginasi *hybrid infinite scroll* pada proyek **Paket Sembako**. Tujuan utamanya adalah meningkatkan pengalaman pengguna dengan tampilan katalog yang dinamis sekaligus menjaga performa dan memberikan kontrol administratif yang mudah.

## 1. Pengacakan Produk Halaman Utama (Top 12 Randomized)

### 1.1. Konsep dan Tujuan
Fitur ini bertujuan untuk menampilkan 12 produk pertama di halaman utama secara acak setiap hari, memberikan kesan segar dan adil bagi semua produk. Pengacakan akan bersifat konsisten sepanjang hari tersebut untuk setiap pengguna.

### 1.2. Mekanisme "Kontrol Zona Acak" via Google Sheets

*   **Definisi Zona Acak:** Aplikasi akan secara spesifik mengambil **12 baris data teratas** dari Google Sheets Anda (yang terhubung ke SheetDB API) sebagai kandidat untuk pengacakan di halaman utama.
*   **Kontrol Administratif:** Anda dapat mengontrol produk mana saja yang akan masuk ke dalam "Zona Acak" ini dengan hanya mengubah urutan baris di Google Sheets. Produk yang Anda tempatkan di baris 1-12 akan menjadi bagian dari 12 produk yang diacak setiap hari.
*   **Manfaat:** Ini memungkinkan Anda untuk mempromosikan produk tertentu (misalnya, produk dengan stok berlebih, produk baru, atau produk musiman) dengan menempatkannya di 12 baris teratas Google Sheets, tanpa perlu mengubah kode.

### 1.3. Algoritma Pengacakan (Seed-based Fisher-Yates Shuffle)

Untuk memastikan pengacakan yang adil dan konsisten per hari, kita akan menggunakan algoritma Fisher-Yates Shuffle yang dimodifikasi dengan "seed" berbasis tanggal.

*   **Seed (Benih):** Tanggal hari ini (misalnya, `YYYY-MM-DD`) akan digunakan sebagai benih. Ini berarti urutan acak akan sama untuk semua pengguna sepanjang hari tersebut, dan akan berubah secara otomatis pada hari berikutnya.
*   **Fungsi Pseudo-Random:** Akan diimplementasikan fungsi `pseudoRandom` yang menghasilkan angka acak berdasarkan `seed` yang diberikan, menggantikan `Math.random()` standar.
*   **Alur:**
    1.  Aplikasi mengambil seluruh data produk dari SheetDB.
    2.  Memisahkan 12 produk pertama (berdasarkan urutan asli dari SheetDB) ke dalam sebuah array terpisah.
    3.  Menerapkan fungsi `seededShuffle` pada array 12 produk ini, menggunakan tanggal hari ini sebagai `seed`.
    4.  Menggabungkan kembali 12 produk yang sudah diacak dengan sisa produk (dari baris ke-13 dan seterusnya) yang tetap dalam urutan aslinya.

```javascript
// Contoh implementasi (akan disesuaikan dengan struktur kode proyek)

// Fungsi untuk menghasilkan angka dari seed (contoh sederhana)
function generateNumberFromSeed(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash;
}

// Fungsi pseudo-random generator (Linear Congruential Generator)
let m = 0x80000000; // 2^31
let a = 1103515245;
let c = 12345;

function pseudoRandom(seed) {
  seed = (a * seed + c) % m;
  return seed / m;
}

function seededShuffle(array, seed) {
  let currentSeed = generateNumberFromSeed(seed);
  const shuffledArray = [...array]; // Buat salinan agar array asli tidak berubah

  for (let i = shuffledArray.length - 1; i > 0; i--) {
    // Gunakan pseudoRandom untuk mendapatkan indeks acak
    const j = Math.floor(pseudoRandom(currentSeed++) * (i + 1));
    [shuffledArray[i], shuffledArray[j]] = [shuffledArray[j], shuffledArray[i]];
  }
  return shuffledArray;
}

// Contoh penggunaan:
const today = new Date().toISOString().slice(0, 10); // e.g., "2026-01-12"
const allProducts = [...]; // Data dari SheetDB

const top12Products = allProducts.slice(0, 12);
const remainingProducts = allProducts.slice(12);

const shuffledTop12 = seededShuffle(top12Products, today);
const finalProductList = [...shuffledTop12, ...remainingProducts];
```

## 2. Paginasi Hybrid Infinite Scroll (dengan Batas)

### 2.1. Konsep dan Tujuan
Sistem paginasi ini dirancang untuk memberikan pengalaman *infinite scroll* yang mulus di awal, namun tetap memungkinkan pengguna untuk mengakses footer dengan mudah. Ini adalah kombinasi antara *infinite scroll* dan tombol "Muat Lebih Banyak".

### 2.2. Mekanisme Paginasi

1.  **Tampilan Awal:** Halaman akan memuat dan menampilkan 12 produk pertama (yang sudah diacak).
2.  **Gulir Otomatis (Infinite Scroll):**
    *   Saat pengguna menggulir ke bawah dan mendekati akhir daftar produk yang terlihat, aplikasi akan secara otomatis memuat dan menampilkan 12 produk berikutnya (produk ke-13 hingga ke-24).
    *   Proses ini akan berulang untuk memuat produk ke-25 hingga ke-36.
3.  **Batas Infinite Scroll:** *Infinite scroll* akan berhenti setelah produk ke-36 ditampilkan.
4.  **Tombol "Muat Lebih Banyak":** Setelah produk ke-36, sebuah tombol dengan teks seperti "Muat Lebih Banyak" atau "Lihat Semua Produk" akan muncul. Pengguna harus mengklik tombol ini untuk melihat sisa produk lainnya.
5.  **Akses Footer:** Dengan adanya batas pada *infinite scroll* dan tombol manual, pengguna dapat dengan mudah menggulir ke bawah untuk mengakses informasi di footer halaman (kontak, alamat, dll.) tanpa terhalang oleh produk yang terus-menerus dimuat.

### 2.3. Alur Teknis Implementasi

1.  **State Management:** Mengelola state dalam aplikasi untuk melacak jumlah produk yang saat ini ditampilkan dan indeks produk berikutnya yang akan dimuat.
2.  **Event Listener Scroll:** Menambahkan *event listener* pada window atau elemen kontainer produk untuk mendeteksi posisi scroll pengguna.
3.  **Deteksi Batas:** Ketika pengguna menggulir hingga ambang batas tertentu (misalnya, 200px dari bagian bawah kontainer produk), dan jumlah produk yang ditampilkan kurang dari 36, fungsi untuk memuat lebih banyak produk akan dipanggil.
4.  **Tombol Kondisional:** Tombol "Muat Lebih Banyak" akan ditampilkan secara kondisional hanya jika:
    *   Jumlah produk yang ditampilkan saat ini adalah 36 atau lebih.
    *   Masih ada produk yang belum ditampilkan dari daftar `finalProductList`.
5.  **Fungsi Tombol:** Saat tombol diklik, sisa produk akan dimuat dan ditampilkan sekaligus, atau dalam blok-blok tertentu (misalnya, 12 produk per klik).

## 3. Langkah-langkah Implementasi

Berikut adalah urutan langkah yang akan saya lakukan untuk mengimplementasikan fitur-fitur ini:

1.  **Kloning Repositori GitHub:** Mengambil kode sumber proyek **Paket Sembako** dari `https://github.com/sihaloho21/paket-sembako/`.
2.  **Analisis Struktur Proyek:** Memahami struktur file, komponen, dan cara data produk saat ini diambil dan ditampilkan.
3.  **Implementasi Fungsi `seededShuffle`:** Menambahkan fungsi `generateNumberFromSeed`, `pseudoRandom`, dan `seededShuffle` ke dalam utilitas atau file helper yang sesuai.
4.  **Modifikasi Logika Pengambilan Data:** Mengubah bagian kode yang mengambil data dari SheetDB untuk menerapkan logika pemisahan 12 produk pertama, pengacakan, dan penggabungan kembali.
5.  **Pembaruan Komponen Tampilan:** Menyesuaikan komponen yang merender daftar produk untuk:
    *   Menampilkan hanya 12 produk awal.
    *   Mengimplementasikan logika *scroll event listener*.
    *   Menambahkan state untuk mengelola jumlah produk yang ditampilkan.
    *   Menambahkan tombol "Muat Lebih Banyak" secara kondisional.
6.  **Pengujian:** Melakukan pengujian menyeluruh untuk memastikan:
    *   12 produk pertama diacak dengan benar setiap hari.
    *   Urutan acak konsisten sepanjang hari.
    *   *Infinite scroll* berfungsi hingga 36 produk.
    *   Tombol "Muat Lebih Banyak" muncul dan berfungsi dengan benar.
    *   Footer dapat diakses.
    *   Tidak ada masalah performa yang signifikan.
7.  **Commit dan Push:** Mengunggah perubahan ke repositori GitHub Anda.

## 4. Manfaat dan Pertimbangan

### 4.1. Manfaat
*   **Peningkatan UX:** Pengalaman menjelajah yang lebih dinamis dan menarik di halaman utama.
*   **Kontrol Administratif:** Kemampuan untuk mempromosikan produk tertentu dengan mudah melalui Google Sheets.
*   **Performa Optimal:** Mengurangi beban rendering awal dan komputasi pengacakan.
*   **Aksesibilitas Footer:** Memastikan informasi penting di footer mudah dijangkau oleh pengguna.

### 4.2. Pertimbangan
*   **Kompatibilitas Browser:** Memastikan fungsi JavaScript yang digunakan kompatibel dengan browser target.
*   **Responsivitas:** Memastikan tampilan dan fungsi paginasi bekerja dengan baik di berbagai ukuran layar (desktop, tablet, mobile).

Dokumen ini akan menjadi referensi utama selama proses pengembangan. Saya siap untuk memulai implementasi setelah Anda mengkonfirmasi bahwa detail ini sesuai dengan harapan Anda.
