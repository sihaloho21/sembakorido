# Bootstrap API Implementation Guide

## Overview

Bootstrap API adalah sistem konfigurasi terpusat yang memungkinkan admin mengubah API URL tanpa perlu update kode atau clear cache pengguna. Semua pengguna akan secara otomatis menggunakan API baru yang di-set oleh admin.

## Arsitektur

```
┌─────────────────────────────────────────────────────────────┐
│                    Bootstrap API (Settings)                 │
│  - Menyimpan: main_api_url, admin_api_url, dll              │
│  - URL tetap: https://sheetdb.io/api/v1/XXXXX               │
└─────────────────────────────────────────────────────────────┘
                            ↓
        ┌───────────────────┼───────────────────┐
        ↓                   ↓                   ↓
   ┌─────────┐         ┌─────────┐         ┌─────────┐
   │ Website │         │  Akun   │         │  Admin  │
   │(index)  │         │(akun)   │         │(admin)  │
   └─────────┘         └─────────┘         └─────────┘
        ↓                   ↓                   ↓
   Fetch Settings      Fetch Settings      Fetch Settings
        ↓                   ↓                   ↓
   Use Main API        Use Main API        Use Admin API
```

## Fitur Utama

### 1. **Automatic Settings Fetch**
Setiap halaman secara otomatis fetch konfigurasi dari Bootstrap API saat load:

```javascript
// Dipanggil di index.html, akun.html, admin/index.html
await CONFIG.fetchSettings();
```

### 2. **API Change Detection**
Website secara otomatis mendeteksi jika API berubah dan:
- Clear cache
- Reload halaman
- Menggunakan API baru

```javascript
CONFIG.startApiChangeMonitoring(); // Check setiap 5 detik
```

### 3. **Priority System**
API URL dipilih dengan prioritas:

```
Priority 1: sessionStorage (runtime dari Bootstrap API)
    ↓
Priority 2: localStorage (manual dari admin)
    ↓
Priority 3: Default (fallback)
```

## Setup

### Step 1: Siapkan Bootstrap API

Bootstrap API adalah sheet terpisah yang menyimpan konfigurasi. Struktur:

**Sheet: `settings`**

| key | value |
|-----|-------|
| main_api_url | https://sheetdb.io/api/v1/XXXXX |
| admin_api_url | https://sheetdb.io/api/v1/YYYYY |

### Step 2: Set Bootstrap API di Admin Panel

1. Buka halaman Admin → Pengaturan
2. Masukkan URL Bootstrap API (URL sheet settings)
3. Klik "Test Bootstrap API"
4. Jika berhasil, klik "Simpan Pengaturan"

### Step 3: Verifikasi

Buka browser console dan lihat log:

```
✅ [CONFIG] Fetching settings from bootstrap API...
📥 [CONFIG] Settings received: [...]
✅ [CONFIG] Main API URL updated: https://sheetdb.io/api/v1/XXXXX
✅ [CONFIG] API change monitoring started
```

## Alur Kerja

### Skenario 1: Pengguna Buka Website Pertama Kali

```
1. Buka index.html
2. Load config.js
3. Panggil CONFIG.fetchSettings()
4. Fetch dari Bootstrap API
5. Update sessionStorage dengan API baru
6. Load script.js dengan API baru
7. Start monitoring untuk perubahan API
```

### Skenario 2: Admin Ubah API

```
1. Admin buka halaman pengaturan
2. Ubah Main API URL
3. Klik "Simpan Pengaturan"
4. CONFIG.setMainApiUrl() → simpan ke localStorage
5. Kirim ke Bootstrap API (sheet settings)
6. Pengguna yang sedang online:
   - Monitoring detect perubahan
   - Clear cache
   - Reload halaman
   - Gunakan API baru
```

### Skenario 3: Pengguna Baru Login Setelah Admin Ubah API

```
1. Pengguna buka akun.html
2. CONFIG.fetchSettings() fetch dari Bootstrap API
3. Dapatkan API baru
4. Login dengan API baru
5. Tidak perlu clear cache manual
```

## Implementasi di Halaman

### index.html (Website Utama)

```html
<script src="assets/js/config.js"></script>
<script src="assets/js/api-service.js"></script>

<script>
    (async () => {
        await CONFIG.fetchSettings();
        CONFIG.startApiChangeMonitoring();
    })();
</script>

<script src="assets/js/script.js"></script>
```

### akun.html (Halaman Akun)

```html
<script src="assets/js/config.js"></script>
<script src="assets/js/api-service.js"></script>

<script>
    (async () => {
        await CONFIG.fetchSettings();
        CONFIG.startApiChangeMonitoring();
    })();
</script>

<script src="assets/js/script.js"></script>
<script src="assets/js/akun.js"></script>
```

### admin/index.html (Admin Panel)

```html
<script src="../assets/js/config.js"></script>
<script src="../assets/js/api-service.js"></script>

<script>
    (async () => {
        await CONFIG.fetchSettings();
        CONFIG.startApiChangeMonitoring();
    })();
</script>

<script src="js/tiered-pricing.js"></script>
<script src="js/admin-script.js"></script>
```

## API Reference

### CONFIG.fetchSettings()

Fetch konfigurasi dari Bootstrap API dan update sessionStorage.

```javascript
await CONFIG.fetchSettings();
```

**Returns:** `Promise<boolean>`

**Behavior:**
- Fetch dari Bootstrap API
- Parse settings (key-value pairs)
- Update sessionStorage dengan `main_api_url` dan `admin_api_url`
- Set `_settingsFetched = true` untuk skip fetch berikutnya

### CONFIG.startApiChangeMonitoring()

Mulai monitoring perubahan API setiap 5 detik.

```javascript
CONFIG.startApiChangeMonitoring();
```

**Behavior:**
- Check setiap 5 detik apakah API berubah
- Jika berubah: clear cache, reload halaman
- Terus monitor sampai halaman ditutup

### CONFIG.stopApiChangeMonitoring()

Hentikan monitoring API changes.

```javascript
CONFIG.stopApiChangeMonitoring();
```

### CONFIG.getMainApiUrl()

Dapatkan Main API URL dengan priority system.

```javascript
const apiUrl = CONFIG.getMainApiUrl();
```

**Priority:**
1. sessionStorage `runtime_main_api_url` (dari Bootstrap API)
2. localStorage `sembako_main_api_url` (manual dari admin)
3. Default `https://sheetdb.io/api/v1/2nu6gqeb0w4ku`

### CONFIG.setMainApiUrl(url)

Set Main API URL ke localStorage.

```javascript
CONFIG.setMainApiUrl('https://sheetdb.io/api/v1/XXXXX');
```

### CONFIG.getBootstrapApiUrl()

Dapatkan Bootstrap API URL.

```javascript
const bootstrapUrl = CONFIG.getBootstrapApiUrl();
```

### CONFIG.setBootstrapApiUrl(url)

Set Bootstrap API URL ke localStorage.

```javascript
CONFIG.setBootstrapApiUrl('https://sheetdb.io/api/v1/YYYYY');
```

## Troubleshooting

### Problem 1: "No bootstrap API configured"

**Penyebab:** Bootstrap API URL belum di-set di admin panel

**Solusi:**
1. Buka Admin Panel → Pengaturan
2. Masukkan URL Bootstrap API
3. Klik "Test Bootstrap API"
4. Klik "Simpan Pengaturan"

### Problem 2: "Failed to fetch settings"

**Penyebab:** Bootstrap API URL salah atau sheet tidak ada

**Solusi:**
1. Verifikasi URL Bootstrap API
2. Pastikan sheet "settings" ada di spreadsheet
3. Pastikan kolom "key" dan "value" ada
4. Check browser console untuk error detail

### Problem 3: Pengguna masih menggunakan API lama

**Penyebab:** 
- Cache browser masih menyimpan API lama
- Monitoring belum detect perubahan

**Solusi:**
1. Hard refresh browser (Ctrl+Shift+R)
2. Clear localStorage: `localStorage.clear()`
3. Tunggu monitoring detect perubahan (max 5 detik)
4. Halaman akan auto-reload

### Problem 4: Halaman terus reload

**Penyebab:** API change detection terlalu sensitif

**Solusi:**
1. Check console untuk log perubahan API
2. Verifikasi Bootstrap API URL benar
3. Pastikan sheet "settings" struktur benar
4. Disable monitoring: `CONFIG.stopApiChangeMonitoring()`

## Best Practices

### 1. Gunakan Dedicated Bootstrap API

Jangan gunakan API yang sama untuk Bootstrap dan Main API:

```
❌ Salah:
Bootstrap API: https://sheetdb.io/api/v1/XXXXX (sheet: settings, products, orders)
Main API: https://sheetdb.io/api/v1/XXXXX

✅ Benar:
Bootstrap API: https://sheetdb.io/api/v1/YYYYY (sheet: settings saja)
Main API: https://sheetdb.io/api/v1/XXXXX (sheet: products, orders, users)
```

### 2. Backup Bootstrap API URL

Simpan Bootstrap API URL di tempat aman:

```javascript
// Disimpan di localStorage dengan key: sembako_bootstrap_api_url
localStorage.getItem('sembako_bootstrap_api_url');
```

### 3. Monitor API Changes

Selalu aktifkan monitoring di semua halaman:

```javascript
CONFIG.startApiChangeMonitoring();
```

### 4. Test Sebelum Deploy

Test Bootstrap API di admin panel sebelum production:

1. Klik "Test Bootstrap API"
2. Lihat status (hijau = berhasil)
3. Verifikasi settings muncul dengan benar

## Monitoring & Debugging

### Enable Detailed Logging

Buka browser console dan lihat log:

```
🔄 [CONFIG] Fetching settings from bootstrap API...
📥 [CONFIG] Settings received: [...]
✅ [CONFIG] Main API URL updated: https://sheetdb.io/api/v1/XXXXX
✅ [CONFIG] API change monitoring started
```

### Check Current API

Di browser console:

```javascript
// Lihat API yang digunakan
console.log(CONFIG.getMainApiUrl());

// Lihat Bootstrap API
console.log(CONFIG.getBootstrapApiUrl());

// Lihat semua settings
console.log(sessionStorage.getItem('runtime_main_api_url'));
```

### Simulate API Change

Di browser console:

```javascript
// Ubah API untuk test
localStorage.setItem('sembako_main_api_url', 'https://sheetdb.io/api/v1/NEWAPI');

// Monitoring akan detect dalam 5 detik
// Halaman akan auto-reload
```

## Performance Impact

- **Fetch Settings:** ~200-500ms (tergantung network)
- **Monitoring Check:** ~10ms setiap 5 detik
- **Cache Clear:** ~50ms
- **Page Reload:** ~1-2 detik

Total impact: Minimal, hanya saat load halaman dan saat API berubah.

## Security Considerations

1. **Bootstrap API URL** disimpan di localStorage (bisa dilihat di browser)
   - Ini OK karena URL sudah public
   - Tidak ada sensitive data di localStorage

2. **Settings Sheet** bisa dibaca siapa saja
   - Hanya berisi URL API (public)
   - Tidak ada API key atau password

3. **Admin Panel** dilindungi dengan PIN
   - Hanya admin yang bisa ubah settings

## Resources

- **Config File:** `/assets/js/config.js`
- **Admin Panel:** `/admin/index.html` → Pengaturan
- **Implementation:** `index.html`, `akun.html`, `admin/index.html`

---

**Last Updated:** January 24, 2026
**Version:** 1.0.0
