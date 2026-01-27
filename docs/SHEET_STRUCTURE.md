# 📊 Struktur Sheet untuk Fitur Akun Pengguna - GoSembako

## 🗂️ Sheet yang Dibutuhkan

### 1️⃣ **Sheet: `users`**

Menyimpan data pengguna yang terdaftar.

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `id` | Text | ID unik pengguna | `USR-001` |
| `nama` | Text | Nama lengkap pengguna | `Ahmad Rizki` |
| `whatsapp` | Text | Nomor WhatsApp (tanpa +62) | `081234567890` |
| `pin` | Text | PIN 6 digit untuk login | `123456` |
| `tanggal_daftar` | Date | Tanggal pendaftaran | `2026-01-22` |
| `status` | Text | Status akun (aktif/nonaktif) | `aktif` |

**Contoh Data:**
```
id          | nama              | whatsapp      | pin    | tanggal_daftar | status
------------|-------------------|---------------|--------|----------------|--------
USR-001     | Ahmad Rizki       | 081234567890  | 123456 | 2026-01-22     | aktif
USR-002     | Siti Nurhaliza    | 082198765432  | 654321 | 2026-01-22     | aktif
USR-003     | Budi Santoso      | 085312345678  | 111222 | 2026-01-23     | aktif
```

---

### 2️⃣ **Sheet: `order_history`**

Menyimpan riwayat pesanan pengguna (bisa menggunakan sheet `orders` yang sudah ada, atau buat baru).

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `id_pesanan` | Text | ID pesanan unik | `ORD-976253` |
| `id_pengguna` | Text | ID pengguna (foreign key) | `USR-001` |
| `whatsapp` | Text | Nomor WhatsApp pengguna | `081234567890` |
| `nama_pelanggan` | Text | Nama pelanggan | `Ahmad Rizki` |
| `tanggal_pesanan` | DateTime | Tanggal & waktu pesanan | `2026-01-22 14:30:00` |
| `produk` | Text | Daftar produk (JSON/text) | `Beras 5kg (2), Minyak Goreng (1)` |
| `total_bayar` | Number | Total pembayaran | `150000` |
| `metode_pembayaran` | Text | Metode pembayaran | `Tunai` |
| `metode_pengiriman` | Text | Metode pengiriman | `Antar Nikomas` |
| `status_pesanan` | Text | Status pesanan | `Selesai` |

**Contoh Data:**
```
id_pesanan  | id_pengguna | whatsapp      | nama_pelanggan  | tanggal_pesanan      | produk                          | total_bayar | metode_pembayaran | metode_pengiriman | status_pesanan
------------|-------------|---------------|-----------------|----------------------|---------------------------------|-------------|-------------------|-------------------|---------------
ORD-976253  | USR-001     | 081234567890  | Ahmad Rizki     | 2026-01-22 14:30:00  | Beras 5kg (2), Minyak Goreng (1)| 150000      | Tunai             | Antar Nikomas     | Selesai
ORD-876543  | USR-001     | 081234567890  | Ahmad Rizki     | 2026-01-20 10:15:00  | Gula Pasir 1kg (3)              | 45000       | QRIS              | Antar Kerumah     | Diproses
ORD-765432  | USR-002     | 082198765432  | Siti Nurhaliza  | 2026-01-21 16:45:00  | Paket Sembako A                 | 200000      | Bayar Gajian      | Ambil Ditempat    | Selesai
```

---

## 🔗 Relasi Data

```
users (1) ──────── (N) order_history
  │                        │
  └─ id                    └─ id_pengguna (FK)
  └─ whatsapp              └─ whatsapp
```

**Cara Koneksi:**
- `order_history.id_pengguna` = `users.id`
- `order_history.whatsapp` = `users.whatsapp`

---

## 📋 Status Pesanan

| Status | Keterangan |
|--------|------------|
| `Menunggu Konfirmasi` | Pesanan baru, belum dikonfirmasi |
| `Diproses` | Pesanan sedang diproses |
| `Dikirim` | Pesanan dalam pengiriman |
| `Selesai` | Pesanan sudah diterima |
| `Dibatalkan` | Pesanan dibatalkan |

---

## 🔐 Keamanan PIN

**Rekomendasi:**
1. **PIN 6 digit** (lebih aman dari 4 digit)
2. **Enkripsi** (opsional, untuk keamanan lebih)
3. **Rate limiting** (batasi percobaan login)

**Untuk implementasi sederhana:**
- Simpan PIN dalam bentuk plain text (untuk MVP)
- Validasi di client-side dan server-side

**Untuk implementasi production:**
- Hash PIN menggunakan bcrypt/SHA256
- Simpan hash di sheet, bukan plain text

---

## 🔄 Alur Data

### **Login Flow:**
```
1. User input WhatsApp + PIN
2. Fetch data dari sheet `users`
3. Filter by whatsapp
4. Validasi PIN
5. Jika match → Login berhasil
6. Simpan session (localStorage)
7. Redirect ke dashboard
```

### **Dashboard Flow:**
```
1. Ambil user_id dari session
2. Fetch data dari sheet `order_history`
3. Filter by id_pengguna atau whatsapp
4. Tampilkan riwayat pesanan
5. Sort by tanggal_pesanan (terbaru dulu)
```

---

## 📡 API Endpoints (SheetDB)

### **1. Get User by WhatsApp**
```
GET https://sheetdb.io/api/v1/j29539mbwzs2c?sheet=users&whatsapp=081234567890
```

**Response:**
```json
[
  {
    "id": "USR-001",
    "nama": "Ahmad Rizki",
    "whatsapp": "081234567890",
    "pin": "123456",
    "tanggal_daftar": "2026-01-22",
    "status": "aktif"
  }
]
```

### **2. Get Order History by User**
```
GET https://sheetdb.io/api/v1/j29539mbwzs2c?sheet=order_history&id_pengguna=USR-001
```

**Response:**
```json
[
  {
    "id_pesanan": "ORD-976253",
    "id_pengguna": "USR-001",
    "whatsapp": "081234567890",
    "nama_pelanggan": "Ahmad Rizki",
    "tanggal_pesanan": "2026-01-22 14:30:00",
    "produk": "Beras 5kg (2), Minyak Goreng (1)",
    "total_bayar": "150000",
    "metode_pembayaran": "Tunai",
    "metode_pengiriman": "Antar Nikomas",
    "status_pesanan": "Selesai"
  }
]
```

### **3. Create New User (Register)**
```
POST https://sheetdb.io/api/v1/j29539mbwzs2c?sheet=users

Body:
{
  "id": "USR-004",
  "nama": "Dedi Wijaya",
  "whatsapp": "087654321098",
  "pin": "999888",
  "tanggal_daftar": "2026-01-23",
  "status": "aktif"
}
```

---

## 🎯 Fitur Tambahan (Opsional)

### **1. Registrasi Pengguna Baru**
- Form input: Nama, WhatsApp, PIN
- Validasi WhatsApp belum terdaftar
- Generate ID otomatis
- Simpan ke sheet `users`

### **2. Lupa PIN**
- Verifikasi via WhatsApp
- Reset PIN

### **3. Edit Profil**
- Update nama
- Ganti PIN

### **4. Detail Pesanan**
- Klik pesanan → Lihat detail lengkap
- Tracking status

---

## 📝 Catatan Implementasi

1. **Sheet `users` harus dibuat manual** di Google Sheets
2. **Sheet `order_history`** bisa menggunakan sheet `orders` yang sudah ada, atau buat baru
3. **Tambahkan kolom `id_pengguna` dan `whatsapp`** di sheet orders yang sudah ada
4. **API SheetDB** sudah support filter by column
5. **Session management** menggunakan localStorage

---

## ✅ Checklist Setup

- [ ] Buat sheet `users` di Google Sheets
- [ ] Tambahkan kolom header sesuai struktur
- [ ] Buat sheet `order_history` atau update sheet `orders`
- [ ] Test API endpoint dengan Postman/browser
- [ ] Implementasi halaman login
- [ ] Implementasi halaman dashboard
- [ ] Test login flow
- [ ] Test order history display

---

**Struktur sheet siap digunakan! 🎉**
