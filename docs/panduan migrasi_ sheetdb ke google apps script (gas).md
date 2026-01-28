# Panduan Migrasi: SheetDB ke Google Apps Script (GAS)

Dokumen ini menjelaskan langkah-langkah detail untuk mengganti **SheetDB** dengan **Google Apps Script** sebagai backend API untuk proyek Paket Sembako. Migrasi ini akan menghilangkan keterbatasan kuota SheetDB dan menjadikannya 100% gratis.

---

## 1. Persiapan Backend (Google Sheets)

Anda tidak perlu menghapus data apa pun di Google Sheets. Kita hanya akan menambahkan "mesin" baru di dalamnya.

### Langkah-langkah:
1.  Buka Google Sheets Anda.
2.  Klik menu **Extensions** > **Apps Script**.
3.  Hapus semua kode yang ada di editor, lalu masukkan kode GAS yang mendukung doGet(e) dan doPost(e).

**Format Request dari Frontend:**
- Semua operasi write (create/update/delete) menggunakan **POST dengan FormData**
- FormData berisi field `json` dengan stringified payload
- **TIDAK ADA custom headers yang di-set** (browser otomatis set multipart/form-data)
- GAS membaca dari `e.parameter.json` atau `e.postData.contents`

4.  Klik tombol **Save** (ikon disket) dan beri nama "Paket Sembako API".
5.  Klik tombol **Deploy** > **New Deployment**.
6.  Pilih type: **Web App**.
7.  Deskripsi: "Initial Version".
8.  Execute as: **Me**.
9.  Who has access: **Anyone** (Penting agar website bisa mengakses).
10. Klik **Deploy**. Salin **Web App URL** yang muncul (Simpan URL ini).

---

## 2. Perubahan di Sisi Website (Frontend)

Semua operasi write (create/update/delete) telah direfaktor untuk menggunakan **GASActions** helper yang menggunakan FormData tanpa setting headers, menghindari CORS preflight.

### A. File `assets/js/config.js`
URL API sudah dikonfigurasi untuk menggunakan GAS Web App:
```javascript
const CONFIG = {
    DEFAULTS: {
        MAIN_API: 'https://script.google.com/macros/s/AKfycbwDmh_cc-J9c0cuzcSThFQBdiZ7lpy3oUjDENZhHW-4UszuKwPB20g6OeRccVsgvp79hw/exec',
        ADMIN_API: 'https://script.google.com/macros/s/AKfycbwDmh_cc-J9c0cuzcSThFQBdiZ7lpy3oUjDENZhHW-4UszuKwPB20g6OeRccVsgvp79hw/exec'
    }
};
```

### B. File `assets/js/gas-actions.js` (Helper Baru)
Helper ini menyediakan metode untuk semua operasi write menggunakan FormData:

```javascript
const GASActions = {
    async post(payload) {
        const formData = new FormData();
        formData.append('json', JSON.stringify(payload));
        const response = await fetch(CONFIG.getAdminApiUrl(), {
            method: 'POST',
            body: formData  // NO Content-Type header - browser sets multipart/form-data
        });
        return response.json();
    },
    
    async create(sheet, data) {
        return this.post({ action: 'create', sheet, data });
    },
    
    async update(sheet, id, data) {
        return this.post({ action: 'update', sheet, id, data });
    },
    
    async delete(sheet, id) {
        return this.post({ action: 'delete', sheet, id });
    }
};
```

### C. File `assets/js/api-service.js` (POST Method Updated)

**PENTING:** `ApiService.post()` telah diupdate untuk menggunakan FormData tanpa custom headers:

```javascript
async post(endpoint, data, options = {}) {
    // Create FormData and append JSON payload
    const formData = new FormData();
    formData.append('json', JSON.stringify(data));
    
    return this.fetch(endpoint, {
        ...options,
        method: 'POST',
        // No Content-Type header - browser sets multipart/form-data automatically
        body: formData,
        cache: false
    });
}
```

### D. File `assets/js/script.js` (Checkout & Claims)

#### 1. Checkout - Log Order to GAS:
```javascript
// Helper function untuk log order
async function logOrderToGAS(orderData) {
    if (!orderData.id || !orderData.status || !orderData.tanggal) {
        throw new Error('Missing required order fields');
    }
    if (!orderData.point_processed) {
        orderData.point_processed = 'No';
    }
    return await GASActions.create('orders', orderData);
}

// Di sendToWA(), gunakan logOrderToGAS
logOrderToGAS(orderData)
    .then(data => console.log('✅ Order logged successfully:', data))
    .catch(err => console.error('❌ Error logging order:', err));
```

#### 2. Claims - Record via GASActions:
```javascript
// Menggunakan GASActions.create untuk claims
await GASActions.create('claims', {
    id: claimId,
    phone: phone,
    nama: customerName,
    hadiah: rewardName,
    poin: requiredPoints,
    status: 'Menunggu',
    tanggal: new Date().toLocaleString('id-ID')
});
```

### E. File `admin/js/admin-script.js` (Operasi CRUD)

#### 1. Update Status Pesanan:
```javascript
// Menggunakan GASActions.update
await GASActions.update('orders', id, { status: newStatus });
```

#### 2. Simpan Produk (Tambah/Edit):
```javascript
if (id) {
    await GASActions.update('products', id, data);
} else {
    await GASActions.create('products', { ...data, id: Date.now().toString() });
}
```

#### 3. Hapus Produk:
```javascript
await GASActions.delete('products', id);
```

### F. File `admin/js/banner-management.js`

```javascript
// Create banner
await GASActions.create('banners', bannerData);

// Update banner
await GASActions.update('banners', id, bannerData);

// Delete banner
await GASActions.delete('banners', id);
```

### G. File `admin/js/tiered-pricing.js`

```javascript
// Update product with tiered pricing
await GASActions.update('products', productId, { grosir: JSON.stringify(tiers) });
```

---

## 3. Keuntungan Pendekatan FormData

### Menghindari CORS Preflight
- **FormData tanpa custom headers** tidak memicu preflight OPTIONS request
- Browser otomatis set `Content-Type: multipart/form-data` dengan boundary
- GAS Web App dapat langsung memproses request tanpa masalah CORS

### Perbandingan Metode

❌ **Metode Lama (Trigger Preflight):**
```javascript
fetch(url, {
    method: 'PATCH',  // Non-simple method
    headers: { 'Content-Type': 'application/json' },  // Custom header
    body: JSON.stringify(data)
})
// ↑ Ini trigger OPTIONS preflight yang GAS tidak bisa handle
```

✅ **Metode Baru (No Preflight):**
```javascript
const formData = new FormData();
formData.append('json', JSON.stringify(data));
fetch(url, {
    method: 'POST',  // Simple method
    body: formData  // No headers set - browser handles it
})
// ↑ Langsung POST, tidak ada preflight OPTIONS
```

---

## 4. Apa yang Dihapus?
1.  **Metode HTTP PATCH/DELETE:** Tidak lagi digunakan, semua operasi melalui POST dengan FormData
2.  **Custom Headers:** Content-Type tidak di-set manual untuk write operations
3.  **JSON Body Langsung:** Semua data dikirim via FormData dengan key 'json'
4.  **Ketergantungan SheetDB:** Anda bisa menghapus akun SheetDB atau membiarkannya sebagai cadangan.

---

## 5. Keuntungan Setelah Migrasi
*   **Tanpa Batas:** Tidak ada lagi batasan 500 request per bulan.
*   **No CORS Issues:** FormData approach menghindari preflight OPTIONS yang GAS tidak bisa handle.
*   **Kontrol Penuh:** Anda bisa menambahkan logika custom di sisi server (misal: kirim email otomatis saat ada pesanan baru) langsung di Apps Script.
*   **Gratis:** Selama Google Sheets gratis, API Anda juga gratis.

---

## 6. Checklist Implementasi

✅ **Completed:**
- [x] gas-actions.js helper created with FormData approach
- [x] ApiService.post() updated to use FormData (no Content-Type header)
- [x] Checkout flow uses logOrderToGAS() via GASActions
- [x] Claims functionality uses GASActions.create()
- [x] Admin operations (products, categories, orders, tukar_poin, banners) use GASActions
- [x] Tiered pricing updates use GASActions
- [x] User points editing uses GASActions
- [x] No PATCH/DELETE methods remain in admin files
- [x] No Content-Type headers set for write operations

---

**Catatan Penting:** 
- GAS Web App hanya mendukung doGet(e) dan doPost(e). Metode PATCH/DELETE tidak didukung.
- Semua write operations harus menggunakan **POST dengan FormData** berisi field 'json'
- **JANGAN set Content-Type header** - biarkan browser yang set otomatis
- Sheet whitelist: products, categories, orders, users, user_points, tukar_poin, banners, claims, settings
- Untuk debugging, check Network tab di browser - harusnya tidak ada OPTIONS preflight untuk write operations

