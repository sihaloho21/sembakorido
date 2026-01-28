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
- **PENTING:** Semua operasi write (create/update/delete) HARUS menggunakan POST dengan FormData
- FormData berisi field `json` dengan stringified payload
- **TIDAK BOLEH** menggunakan metode HTTP PATCH atau DELETE
- **TIDAK BOLEH** men-set header `Content-Type` secara manual untuk operasi write
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

### C. File `assets/js/api-service.js` (Updated)
ApiService.post() telah direfaktor untuk menggunakan FormData:

```javascript
async post(endpoint, data, options = {}) {
    // Create FormData to avoid preflight
    const formData = new FormData();
    formData.append('json', JSON.stringify(data));
    
    return this.fetch(endpoint, {
        ...options,
        method: 'POST',
        body: formData,
        cache: false
    });
}
```

**CATATAN PENTING:** ApiService.patch() sudah deprecated. Gunakan GASActions.update() untuk semua operasi update.

### D. File `assets/js/akun.js` (Safe Phone Normalization)

Phone normalization now safely handles numeric values from Google Sheets:

```javascript
// Safe phone normalization that handles numbers, null, undefined
const normalizePhoneTo08 = (phone) => {
    // Safely convert to string first to handle numbers, null, undefined
    const phoneStr = String(phone == null ? '' : phone);
    const digits = phoneStr.replace(/[^0-9]/g, '');
    if (!digits) return '';
    let core = digits;
    if (core.startsWith('62')) core = core.slice(2);
    if (core.startsWith('0')) core = core.slice(1);
    if (!core.startsWith('8')) return '';
    return '0' + core;
};

// Used in loadOrderHistory to safely filter orders
async function loadOrderHistory(user) {
    // ... fetch orders ...
    orders = orders.filter(order => {
        const orderPhone = normalizePhoneTo08(order.phone || order.whatsapp || '');
        const userPhone = normalizePhoneTo08(user.whatsapp);
        return orderPhone === userPhone;
    });
}
```

**IMPORTANT:** When phone/whatsapp values come from Google Sheets as numbers (not strings), the safe conversion ensures no TypeError occurs.

### E. File `assets/js/script.js` (Checkout Flow)

Fungsi checkout telah diperbarui untuk menggunakan `logOrderToGAS()`:

```javascript
async function logOrderToGAS(order) {
    const orderData = {
        id: order.id || generateOrderId(),
        pelanggan: order.pelanggan || '',
        produk: order.produk || '',
        qty: order.qty || 0,
        total: order.total || 0,
        status: order.status || 'Pending',
        tanggal: order.tanggal || new Date().toLocaleString('id-ID'),
        phone: order.phone || '',
        poin: order.poin || 0,
        point_processed: order.point_processed || 'No'
    };
    
    return await GASActions.create('orders', orderData);
}

async function sendToWA() {
    // ... validations ...
    
    try {
        await logOrderToGAS(orderData);  // Log to GAS first
        // ... clear cart and show success ...
        showSuccessNotification(orderId, waUrl);  // Then redirect to WhatsApp
    } catch (err) {
        alert('Gagal menyimpan pesanan. Silakan coba lagi.');
    }
}
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

### G. File `admin/js/tiered-pricing.js` (Robust Implementation)

Tiered pricing now handles ID type mismatches and invalid data robustly:

```javascript
// Safe product matching using String comparison
async function toggleTieredPricing(productId) {
    // Use String comparison to avoid type mismatch
    const product = tieredPricingProducts.find(p => String(p.id) === String(productId));
    if (!product) {
        console.error('Product not found:', productId);
        return;
    }
    
    // ... rest of logic ...
    
    // Safe default tier price calculation
    const basePrice = parseInt(product.harga) || 0;
    const defaultPrice = basePrice > 0 ? Math.floor(basePrice * 0.95) : 0;
    const defaultTier = [{ min_qty: 5, price: defaultPrice }];
}

// Parse and filter valid entries only
function parseGrosirData(grosirString) {
    if (!grosirString) return [];
    try {
        const parsed = JSON.parse(grosirString);
        if (Array.isArray(parsed)) {
            // Filter valid entries only
            const validTiers = parsed.filter(tier => {
                const minQty = parseInt(tier.min_qty);
                const price = parseInt(tier.price);
                return !isNaN(minQty) && !isNaN(price) && minQty > 0 && price >= 0;
            });
            return validTiers.sort((a, b) => b.min_qty - a.min_qty);
        }
        return [];
    } catch (e) {
        console.error('Error parsing grosir data:', e);
        return [];
    }
}

// Update with String productId for consistency
async function updateProductGrosir(productId, tiers) {
    const normalizedTiers = tiers.map(tier => ({
        min_qty: parseInt(tier.min_qty),
        price: parseInt(tier.price)
    }));
    
    await GASActions.update(PRODUCTS_SHEET, String(productId), { 
        grosir: JSON.stringify(normalizedTiers)
    });
}
```

**ROBUSTNESS IMPROVEMENTS:**
- Product ID matching uses `String(p.id) === String(productId)` to handle both number and string IDs
- Default tier price calculation safely handles non-numeric `product.harga` (produces 0 instead of NaN)
- `parseGrosirData` filters out invalid entries with NaN or negative values
- `updateProductGrosir` normalizes tier values and ensures productId is String

### H. File `admin/js/tiered-pricing.js`

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
- **CRITICAL:** Setting `Content-Type: application/json` AKAN memicu preflight yang GAS tidak bisa handle

### Perbandingan Metode

❌ **Metode Lama (Trigger Preflight):**
```javascript
// JANGAN LAKUKAN INI - Akan trigger preflight!
fetch(url, {
    method: 'PATCH',  // Non-simple method triggers preflight
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
})

// JANGAN LAKUKAN INI - Akan trigger preflight!
fetch(url, {
    method: 'DELETE'  // Non-simple method triggers preflight
})

// JANGAN LAKUKAN INI - Akan trigger preflight!
fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },  // Custom header triggers preflight
    body: JSON.stringify(data)
})
```

✅ **Metode Baru (No Preflight):**
```javascript
const formData = new FormData();
formData.append('json', JSON.stringify(data));
fetch(url, {
    method: 'POST',  // Simple method
    body: formData  // No headers set - browser handles it automatically
})
```

---

## 4. Apa yang Dihapus?
1.  **Metode HTTP PATCH/DELETE:** ❌ TIDAK LAGI DIGUNAKAN - Semua operasi melalui POST
2.  **Custom Headers pada Write Operations:** ❌ TIDAK BOLEH set Content-Type manual
3.  **ApiService.patch():** ⚠️ DEPRECATED - Gunakan GASActions.update()
4.  **JSON.stringify() di body tanpa FormData:** ❌ Akan trigger preflight
5.  **Ketergantungan SheetDB:** ✅ Anda bisa menghapus akun SheetDB atau membiarkannya sebagai cadangan.

---

## 5. Keuntungan Setelah Migrasi
*   **Tanpa Batas:** Tidak ada lagi batasan 500 request per bulan.
*   **No CORS Issues:** FormData approach menghindari preflight OPTIONS yang GAS tidak bisa handle.
*   **Kontrol Penuh:** Anda bisa menambahkan logika custom di sisi server (misal: kirim email otomatis saat ada pesanan baru) langsung di Apps Script.
*   **Gratis:** Selama Google Sheets gratis, API Anda juga gratis.
*   **Checkout Flow Fixed:** Order logging berhasil sebelum redirect ke WhatsApp, tidak ada lagi CORS error.

---

## 6. Checklist Validasi

Setelah migrasi, pastikan:

✅ **Grep Checks:**
```bash
# Harus return 0 matches
grep -R "method:\s*'PATCH'\|\"PATCH\"" admin/js
grep -R "method:\s*'DELETE'\|\"DELETE\"" admin/js

# Content-Type tidak boleh di-set untuk write operations
grep -R "Content-Type.*application/json" admin/js
```

✅ **Manual Tests:**
- Checkout: Click "Kirim Pesanan ke WhatsApp" → Order logged (check Network tab: 200 OK, no OPTIONS) → WhatsApp redirect
- Akun Page: Order history loads correctly with numeric phone/whatsapp values from Sheets (no TypeError)
- Admin Products: Create/Update/Delete works without preflight
- Admin Banners: Create/Update/Delete works without preflight  
- Admin Categories: Create/Update/Delete works without preflight
- Admin Tukar Poin: Create/Update/Delete works without preflight
- Admin User Points: Update works without preflight
- Tiered Pricing: Toggle shows "Tingkatan Harga Grosir" section when enabled
- Tiered Pricing: Works with both string and numeric product IDs
- Tiered Pricing: Default tier price is valid (not NaN) even with invalid base price

---

**Catatan Penting:** 
- GAS Web App hanya mendukung doGet(e) dan doPost(e). Metode PATCH/DELETE tidak didukung.
- **SEMUA write operations HARUS menggunakan POST dengan FormData berisi field 'json'**
- **JANGAN PERNAH set Content-Type header untuk write operations - biarkan browser yang handle**
- Sheet whitelist: products, categories, orders, users, user_points, tukar_poin, banners, claims, settings
- Setelah checkout berhasil, order akan tercatat di sheet 'orders' SEBELUM redirect ke WhatsApp
- **Phone normalization:** `normalizePhoneTo08` uses `String()` conversion to safely handle numeric values from Sheets
- **Tiered pricing:** Product ID matching uses String comparison to handle type mismatches
- **Tiered pricing:** Default tier price calculation handles invalid base prices safely (no NaN)
- **Tiered pricing:** `parseGrosirData` filters out invalid entries with NaN values

