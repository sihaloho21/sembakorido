# Panduan Cepat: Mengelola Harga Grosir

## 🚀 Mulai Cepat

### Langkah 1: Persiapan Google Sheets

1. Buka Google Sheet Anda
2. Tambahkan kolom baru dengan nama: **`grosir`**
3. Letakkan kolom ini setelah kolom terakhir di Sheet1
4. Biarkan kosong untuk sekarang

### Langkah 2: Akses Admin Panel

1. Buka admin dashboard: `https://your-domain/admin/`
2. Login dengan akun admin
3. Klik menu **"Harga Grosir"** di sidebar kiri

### Langkah 3: Atur Harga Grosir untuk Produk

#### Contoh: Indomie Goreng

1. Cari produk "Indomie Goreng" di daftar
2. Klik **toggle switch** untuk mengaktifkan harga grosir
3. Form akan muncul dengan satu tingkatan default

#### Tambah Tingkatan Harga

Misalkan harga normal Indomie = Rp 3.500

| Kuantitas | Harga per Unit | Hemat |
|-----------|----------------|-------|
| 1-4 pcs | Rp 3.500 | - |
| 5-9 pcs | Rp 3.400 | Rp 100 |
| 10-14 pcs | Rp 3.300 | Rp 200 |
| 15+ pcs | Rp 3.200 | Rp 300 |

**Cara input:**

1. **Tingkatan 1:**
   - Min. Qty: `5`
   - Harga: `3400`

2. Klik **"+ Tambah Tingkatan"**

3. **Tingkatan 2:**
   - Min. Qty: `10`
   - Harga: `3300`

4. Klik **"+ Tambah Tingkatan"**

5. **Tingkatan 3:**
   - Min. Qty: `15`
   - Harga: `3200`

6. Klik **"Simpan"**

✅ Selesai! Harga grosir sudah aktif untuk Indomie Goreng

---

## 📋 Contoh Skenario

### Skenario 1: Produk Tanpa Harga Grosir

Beberapa produk mungkin tidak perlu harga grosir:
- Toggle tetap **OFF** (nonaktif)
- Produk akan selalu menggunakan harga satuan normal

### Skenario 2: Produk dengan 2 Tingkatan

**Kopi Kapal Api (Harga Normal: Rp 2.000)**

| Qty | Harga |
|-----|-------|
| 10+ | Rp 1.900 |
| 20+ | Rp 1.800 |

**Input:**
1. Min. Qty: `10`, Harga: `1900`
2. Tambah tingkatan
3. Min. Qty: `20`, Harga: `1800`
4. Simpan

### Skenario 3: Perubahan Harga

Jika ingin mengubah harga grosir yang sudah ada:

1. Klik toggle untuk membuka form
2. Edit nilai di input yang sudah ada
3. Klik "Simpan"

Atau untuk menghapus semua harga grosir:

1. Klik toggle untuk menonaktifkan
2. Semua tingkatan akan dihapus
3. Produk kembali ke harga normal

---

## ⚠️ Aturan Penting

### ✅ BENAR

```
Min. Qty: 5   → Harga: 3400
Min. Qty: 10  → Harga: 3300  ✓ Harga turun
Min. Qty: 15  → Harga: 3200  ✓ Harga turun
```

### ❌ SALAH

```
Min. Qty: 5   → Harga: 3400
Min. Qty: 10  → Harga: 3500  ✗ Harga naik (tidak boleh!)
```

```
Min. Qty: 5   → Harga: 3400
Min. Qty: 5   → Harga: 3300  ✗ Min. Qty duplikat (tidak boleh!)
```

---

## 🎯 Tips & Trik

### Tip 1: Strategi Pricing

Buat tingkatan yang menarik untuk mendorong pembelian:

```
Harga Normal: Rp 10.000

Beli 5   → Rp 9.500  (5% diskon)
Beli 10  → Rp 9.000  (10% diskon)
Beli 20  → Rp 8.500  (15% diskon)
Beli 50  → Rp 8.000  (20% diskon)
```

### Tip 2: Minimal Qty

Jangan terlalu kecil minimal qty. Contoh baik:

```
Min. Qty: 5   (bukan 1 atau 2)
Min. Qty: 10
Min. Qty: 20
```

### Tip 3: Profit Margin

Pastikan harga grosir masih menguntungkan:

```
Harga Beli: Rp 2.000
Harga Normal: Rp 5.000 (profit 150%)
Harga Grosir Min: Rp 3.500 (profit 75%)
```

---

## 🔍 Cara Verifikasi

### Cek di Admin Panel

1. Buka "Harga Grosir"
2. Lihat toggle status (ON/OFF)
3. Jika ON, lihat tingkatan harga yang sudah diatur

### Cek di Google Sheets

1. Buka Google Sheet Anda
2. Lihat kolom `grosir`
3. Data akan terlihat seperti:
   ```
   [{"min_qty": 5, "price": 3400}, {"min_qty": 10, "price": 3300}]
   ```

### Cek di Browser Console

1. Buka admin panel
2. Tekan F12 (buka Developer Tools)
3. Klik tab "Console"
4. Ketik: `tieredPricingProducts`
5. Lihat data produk dengan harga grosir

---

## ❓ FAQ

### Q: Berapa banyak tingkatan yang bisa dibuat?

**A:** Tidak ada batasan jumlah tingkatan. Namun disarankan maksimal 5-7 tingkatan untuk UX yang baik.

### Q: Apakah bisa mengatur harga grosir untuk semua produk sekaligus?

**A:** Tidak, harus satu per satu. Ini untuk memastikan setiap produk memiliki strategi pricing yang tepat.

### Q: Bagaimana jika saya ingin menghapus harga grosir?

**A:** Klik toggle untuk menonaktifkan. Semua tingkatan akan dihapus dan produk kembali ke harga normal.

### Q: Apakah pelanggan bisa melihat harga grosir?

**A:** Ya, pada Fase 2 akan ditampilkan di halaman detail produk dan keranjang belanja.

### Q: Apakah harga grosir berlaku otomatis?

**A:** Ya, sistem akan otomatis menerapkan harga grosir berdasarkan kuantitas yang dibeli pelanggan.

---

## 🆘 Troubleshooting

### Masalah: "Gagal menyimpan harga grosir"

**Penyebab:** 
- Koneksi internet terputus
- API tidak merespons
- Kolom `grosir` belum ada di Google Sheets

**Solusi:**
1. Cek koneksi internet
2. Refresh halaman
3. Pastikan kolom `grosir` sudah ditambahkan ke Google Sheets
4. Coba lagi

### Masalah: "Tingkatan harga tidak valid"

**Penyebab:**
- Min. Qty tidak naik
- Harga tidak turun
- Ada input kosong

**Solusi:**
1. Pastikan Min. Qty naik: 5, 10, 15, 20...
2. Pastikan Harga turun: 3400, 3300, 3200...
3. Jangan ada input kosong
4. Coba lagi

### Masalah: Toggle tidak merespons

**Penyebab:**
- JavaScript error
- Browser cache
- Halaman belum fully loaded

**Solusi:**
1. Refresh halaman (Ctrl+F5)
2. Coba browser lain
3. Buka console (F12) dan cek error
4. Clear browser cache

---

## 📞 Butuh Bantuan?

1. **Baca dokumentasi lengkap:** `IMPLEMENTASI_HARGA_GROSIR_FASE_1.md`
2. **Cek code:** `/admin/js/tiered-pricing.js`
3. **Hubungi developer:** Lihat kontak di dokumentasi utama

---

**Selamat menggunakan fitur Harga Grosir! 🎉**

Semoga fitur ini membantu meningkatkan penjualan produk Anda.
