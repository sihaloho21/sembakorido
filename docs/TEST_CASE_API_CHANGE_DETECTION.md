# 📋 Test Case - API Change Detection System

**Tujuan:** Memverifikasi bahwa pengguna mendapatkan API baru meskipun tidak ada interval monitoring, hanya dengan event-based trigger.

**Sistem yang Diuji:** Lazy Loading Bootstrap API + Event-Based Trigger

---

## 🎯 Test Scenario 1: Initial Page Load (Lazy Loading)

### **Test Case 1.1: Page Load Tanpa User Interaksi**

| Aspek | Detail |
|-------|--------|
| **Tujuan** | Verifikasi bahwa Bootstrap API tidak di-fetch saat page load |
| **Precondition** | Browser sudah clear cache |
| **Steps** | 1. Buka website di tab baru<br>2. Buka DevTools → Network tab<br>3. Buka DevTools → Console tab<br>4. Tunggu 5 detik tanpa interaksi |
| **Expected Result** | ✅ Bootstrap API call TIDAK muncul di Network tab<br>✅ Console tidak ada log "Fetching settings"<br>✅ Page load dalam <1 detik |
| **Actual Result** | _Isi saat testing_ |
| **Status** | ☐ Pass ☐ Fail |
| **Notes** | _Isi jika ada catatan_ |

### **Test Case 1.2: Page Load Performance**

| Aspek | Detail |
|-------|--------|
| **Tujuan** | Verifikasi loading speed improvement |
| **Precondition** | Browser sudah clear cache |
| **Steps** | 1. Buka DevTools → Performance tab<br>2. Klik record<br>3. Refresh halaman<br>4. Tunggu sampai page interactive<br>5. Stop recording |
| **Expected Result** | ✅ Page interactive dalam <1 detik<br>✅ First Contentful Paint (FCP) < 1 detik<br>✅ Largest Contentful Paint (LCP) < 1.5 detik |
| **Actual Result** | _Isi saat testing_ |
| **Status** | ☐ Pass ☐ Fail |
| **Notes** | _Isi jika ada catatan_ |

---

## 🎯 Test Scenario 2: Lazy Loading Trigger

### **Test Case 2.1: Lazy Load Saat User Click**

| Aspek | Detail |
|-------|--------|
| **Tujuan** | Verifikasi Bootstrap API di-fetch saat user click |
| **Precondition** | 1. Page sudah load<br>2. DevTools Console terbuka<br>3. Tidak ada user interaksi sebelumnya |
| **Steps** | 1. Buka DevTools → Network tab<br>2. Klik di area halaman<br>3. Lihat Network tab untuk Bootstrap API call<br>4. Lihat Console untuk log |
| **Expected Result** | ✅ Bootstrap API call muncul di Network tab<br>✅ Response status 200<br>✅ Settings berhasil di-fetch<br>✅ lazyFetchSettings() hanya dipanggil sekali |
| **Actual Result** | _Isi saat testing_ |
| **Status** | ☐ Pass ☐ Fail |
| **Notes** | _Isi jika ada catatan_ |

### **Test Case 2.2: Lazy Load Saat User Scroll**

| Aspek | Detail |
|-------|--------|
| **Tujuan** | Verifikasi Bootstrap API di-fetch saat user scroll |
| **Precondition** | 1. Page sudah load<br>2. Tidak ada user interaksi sebelumnya |
| **Steps** | 1. Buka DevTools → Network tab<br>2. Scroll halaman<br>3. Lihat Network tab untuk Bootstrap API call |
| **Expected Result** | ✅ Bootstrap API call muncul<br>✅ Settings di-fetch<br>✅ Event listener di-remove setelah triggered |
| **Actual Result** | _Isi saat testing_ |
| **Status** | ☐ Pass ☐ Fail |
| **Notes** | _Isi jika ada catatan_ |

### **Test Case 2.3: Lazy Load Saat Tab Focus**

| Aspek | Detail |
|-------|--------|
| **Tujuan** | Verifikasi Bootstrap API di-fetch saat tab mendapat focus |
| **Precondition** | 1. Website sudah load<br>2. Buka tab lain<br>3. DevTools terbuka |
| **Steps** | 1. Buka tab lain (misal: Google)<br>2. Tunggu 3 detik<br>3. Klik kembali ke tab website<br>4. Lihat Network tab |
| **Expected Result** | ✅ Bootstrap API call muncul saat tab focus<br>✅ Settings di-fetch<br>✅ Page tidak reload |
| **Actual Result** | _Isi saat testing_ |
| **Status** | ☐ Pass ☐ Fail |
| **Notes** | _Isi jika ada catatan_ |

---

## 🎯 Test Scenario 3: Admin Change API (Event-Based Trigger)

### **Test Case 3.1: Admin Ubah API - Single Tab**

| Aspek | Detail |
|-------|--------|
| **Tujuan** | Verifikasi pengguna dapat API baru saat admin ubah |
| **Precondition** | 1. Website sudah load di tab 1<br>2. Admin panel sudah load di tab 2<br>3. Bootstrap API sudah di-fetch di tab 1 |
| **Steps** | 1. Di tab 1: Buka DevTools → Network tab<br>2. Di tab 2: Buka admin panel<br>3. Di tab 2: Ubah Main API URL ke URL baru<br>4. Di tab 2: Klik "Simpan Pengaturan"<br>5. Lihat di tab 1: Network tab untuk API change event<br>6. Tunggu 1-2 detik |
| **Expected Result** | ✅ Event 'api-config-changed' di-dispatch<br>✅ _detectApiChange() dipanggil<br>✅ Cache di-clear<br>✅ Page auto-reload<br>✅ API baru di-load setelah reload |
| **Actual Result** | _Isi saat testing_ |
| **Status** | ☐ Pass ☐ Fail |
| **Notes** | _Isi jika ada catatan_ |

### **Test Case 3.2: Admin Ubah API - Multiple Tabs**

| Aspek | Detail |
|-------|--------|
| **Tujuan** | Verifikasi semua tab mendapat API baru |
| **Precondition** | 1. Website sudah load di tab 1, 2, 3<br>2. Semua tab sudah fetch settings<br>3. Admin panel di tab 4 |
| **Steps** | 1. Di tab 4: Ubah Main API URL<br>2. Di tab 4: Klik "Simpan Pengaturan"<br>3. Lihat tab 1, 2, 3 untuk page reload |
| **Expected Result** | ✅ Tab 1, 2, 3 auto-reload dalam 1-2 detik<br>✅ Semua tab menggunakan API baru<br>✅ Tidak ada error di console |
| **Actual Result** | _Isi saat testing_ |
| **Status** | ☐ Pass ☐ Fail |
| **Notes** | _Isi jika ada catatan_ |

### **Test Case 3.3: Admin Ubah API - Tab Tidak Active**

| Aspek | Detail |
|-------|--------|
| **Tujuan** | Verifikasi tab yang tidak active juga dapat API baru |
| **Precondition** | 1. Website di tab 1 (active)<br>2. Website di tab 2 (hidden)<br>3. Admin panel di tab 3 |
| **Steps** | 1. Di tab 3: Ubah API URL<br>2. Di tab 3: Klik "Simpan Pengaturan"<br>3. Klik ke tab 2 (yang hidden)<br>4. Lihat apakah tab 2 sudah reload |
| **Expected Result** | ✅ Tab 2 auto-reload saat di-click<br>✅ Atau tab 2 sudah reload di background<br>✅ Tab 2 menggunakan API baru |
| **Actual Result** | _Isi saat testing_ |
| **Status** | ☐ Pass ☐ Fail |
| **Notes** | _Isi jika ada catatan_ |

---

## 🎯 Test Scenario 4: No Interval Monitoring (Verify)

### **Test Case 4.1: Verifikasi Tidak Ada Interval Monitoring**

| Aspek | Detail |
|-------|--------|
| **Tujuan** | Verifikasi interval monitoring tidak berjalan (interval = 0) |
| **Precondition** | Page sudah load dan user sudah interaksi |
| **Steps** | 1. Buka DevTools → Console<br>2. Jalankan: `console.log(CONFIG._apiChangeCheckInterval)`<br>3. Lihat hasilnya |
| **Expected Result** | ✅ Output: `null` atau `undefined`<br>✅ Tidak ada interval yang berjalan<br>✅ Hanya event listener yang aktif |
| **Actual Result** | _Isi saat testing_ |
| **Status** | ☐ Pass ☐ Fail |
| **Notes** | _Isi jika ada catatan_ |

### **Test Case 4.2: Verifikasi Event Listener Aktif**

| Aspek | Detail |
|-------|--------|
| **Tujuan** | Verifikasi event listener untuk 'api-config-changed' aktif |
| **Precondition** | Page sudah load dan user sudah interaksi |
| **Steps** | 1. Buka DevTools → Console<br>2. Jalankan: `window.dispatchEvent(new Event('api-config-changed'))`<br>3. Lihat apakah _detectApiChange() dipanggil |
| **Expected Result** | ✅ Event listener triggered<br>✅ _detectApiChange() dipanggil<br>✅ Cache di-clear (jika ada API change) |
| **Actual Result** | _Isi saat testing_ |
| **Status** | ☐ Pass ☐ Fail |
| **Notes** | _Isi jika ada catatan_ |

---

## 🎯 Test Scenario 5: Cache Invalidation

### **Test Case 5.1: Cache Clear Saat API Change Terdeteksi**

| Aspek | Detail |
|-------|--------|
| **Tujuan** | Verifikasi cache di-clear saat API berubah |
| **Precondition** | 1. Website sudah load<br>2. Sudah ada API cache di ApiService |
| **Steps** | 1. Buka DevTools → Console<br>2. Jalankan: `console.log(ApiService._cache)`<br>3. Lihat cache yang ada<br>4. Admin ubah API URL<br>5. Jalankan lagi: `console.log(ApiService._cache)`<br>6. Lihat apakah cache sudah kosong |
| **Expected Result** | ✅ Cache berisi data sebelum API change<br>✅ Cache kosong setelah API change<br>✅ Page reload dengan API baru |
| **Actual Result** | _Isi saat testing_ |
| **Status** | ☐ Pass ☐ Fail |
| **Notes** | _Isi jika ada catatan_ |

### **Test Case 5.2: SessionStorage Clear Saat API Change**

| Aspek | Detail |
|-------|--------|
| **Tujuan** | Verifikasi sessionStorage di-clear saat API change |
| **Precondition** | 1. Website sudah load<br>2. SessionStorage berisi runtime API URLs |
| **Steps** | 1. Buka DevTools → Application → Session Storage<br>2. Lihat `runtime_main_api_url` dan `runtime_admin_api_url`<br>3. Admin ubah API URL<br>4. Lihat sessionStorage setelah page reload |
| **Expected Result** | ✅ SessionStorage keys di-remove saat API change<br>✅ Setelah reload, sessionStorage di-update dengan API baru |
| **Actual Result** | _Isi saat testing_ |
| **Status** | ☐ Pass ☐ Fail |
| **Notes** | _Isi jika ada catatan_ |

---

## 🎯 Test Scenario 6: Different Pages (index, akun, admin)

### **Test Case 6.1: Lazy Loading di index.html**

| Aspek | Detail |
|-------|--------|
| **Tujuan** | Verifikasi lazy loading bekerja di index.html |
| **Precondition** | Browser clear cache |
| **Steps** | 1. Buka index.html<br>2. Lihat Network tab<br>3. Tidak ada user interaksi<br>4. Tunggu 3 detik |
| **Expected Result** | ✅ Bootstrap API tidak di-fetch<br>✅ Page load cepat <1 detik |
| **Actual Result** | _Isi saat testing_ |
| **Status** | ☐ Pass ☐ Fail |
| **Notes** | _Isi jika ada catatan_ |

### **Test Case 6.2: Lazy Loading di akun.html**

| Aspek | Detail |
|-------|--------|
| **Tujuan** | Verifikasi lazy loading bekerja di akun.html |
| **Precondition** | User sudah login |
| **Steps** | 1. Buka akun.html<br>2. Lihat Network tab<br>3. Tidak ada user interaksi<br>4. Tunggu 3 detik |
| **Expected Result** | ✅ Bootstrap API tidak di-fetch<br>✅ Page load cepat |
| **Actual Result** | _Isi saat testing_ |
| **Status** | ☐ Pass ☐ Fail |
| **Notes** | _Isi jika ada catatan_ |

### **Test Case 6.3: Lazy Loading di admin/index.html**

| Aspek | Detail |
|-------|--------|
| **Tujuan** | Verifikasi lazy loading bekerja di admin panel |
| **Precondition** | Admin sudah login |
| **Steps** | 1. Buka admin/index.html<br>2. Lihat Network tab<br>3. Tidak ada user interaksi<br>4. Tunggu 3 detik |
| **Expected Result** | ✅ Bootstrap API tidak di-fetch<br>✅ Admin panel load cepat |
| **Actual Result** | _Isi saat testing_ |
| **Status** | ☐ Pass ☐ Fail |
| **Notes** | _Isi saat testing_ |

---

## 🎯 Test Scenario 7: Edge Cases

### **Test Case 7.1: Rapid Admin API Changes**

| Aspek | Detail |
|-------|--------|
| **Tujuan** | Verifikasi sistem handle multiple API changes dengan cepat |
| **Precondition** | Website di tab 1, Admin panel di tab 2 |
| **Steps** | 1. Di tab 2: Ubah API URL ke URL A<br>2. Klik Simpan<br>3. Tunggu 0.5 detik<br>4. Ubah API URL ke URL B<br>5. Klik Simpan<br>6. Tunggu 0.5 detik<br>7. Ubah API URL ke URL C<br>8. Klik Simpan |
| **Expected Result** | ✅ Tab 1 reload setiap kali ada perubahan<br>✅ Akhirnya menggunakan API C (terakhir)<br>✅ Tidak ada error atau crash |
| **Actual Result** | _Isi saat testing_ |
| **Status** | ☐ Pass ☐ Fail |
| **Notes** | _Isi jika ada catatan_ |

### **Test Case 7.2: API Change Saat Page Sedang Load**

| Aspek | Detail |
|-------|--------|
| **Tujuan** | Verifikasi sistem handle API change saat page sedang load |
| **Precondition** | Website sedang loading (network throttle) |
| **Steps** | 1. Buka DevTools → Network → Throttle ke "Slow 3G"<br>2. Refresh halaman<br>3. Saat page sedang load (50%), admin ubah API<br>4. Lihat apa yang terjadi |
| **Expected Result** | ✅ Page reload dengan API baru<br>✅ Tidak ada error atau incomplete load<br>✅ Akhirnya load dengan API baru |
| **Actual Result** | _Isi saat testing_ |
| **Status** | ☐ Pass ☐ Fail |
| **Notes** | _Isi jika ada catatan_ |

### **Test Case 7.3: Bootstrap API Tidak Tersedia**

| Aspek | Detail |
|-------|--------|
| **Tujuan** | Verifikasi fallback saat Bootstrap API error |
| **Precondition** | Bootstrap API URL salah atau offline |
| **Steps** | 1. Ubah Bootstrap API URL ke URL yang tidak valid<br>2. Refresh halaman<br>3. Interaksi dengan halaman<br>4. Lihat console untuk error |
| **Expected Result** | ✅ Tidak ada crash<br>✅ Gunakan localStorage API URL sebagai fallback<br>✅ Website tetap berfungsi |
| **Actual Result** | _Isi saat testing_ |
| **Status** | ☐ Pass ☐ Fail |
| **Notes** | _Isi jika ada catatan_ |

---

## 🎯 Test Scenario 8: User Journey

### **Test Case 8.1: Complete User Journey - New User**

| Aspek | Detail |
|-------|--------|
| **Tujuan** | Verifikasi complete flow untuk user baru |
| **Precondition** | Browser clear cache, user belum pernah buka website |
| **Steps** | 1. Buka website<br>2. Page load (tidak ada interaksi)<br>3. User scroll halaman<br>4. User klik produk<br>5. User buka modal produk<br>6. Admin ubah API di panel lain<br>7. Lihat apakah user dapat API baru |
| **Expected Result** | ✅ Page load cepat <1 detik<br>✅ Bootstrap API di-fetch saat scroll<br>✅ User dapat API baru saat admin ubah<br>✅ Semua fitur berfungsi normal |
| **Actual Result** | _Isi saat testing_ |
| **Status** | ☐ Pass ☐ Fail |
| **Notes** | _Isi jika ada catatan_ |

### **Test Case 8.2: Complete User Journey - Existing User**

| Aspek | Detail |
|-------|--------|
| **Tujuan** | Verifikasi complete flow untuk user yang sudah pernah buka website |
| **Precondition** | User sudah pernah buka website (ada cache) |
| **Steps** | 1. Buka website lagi<br>2. Page load (tidak ada interaksi)<br>3. User login<br>4. User browse produk<br>5. Admin ubah API<br>6. User refresh halaman |
| **Expected Result** | ✅ Page load cepat (dari cache)<br>✅ Bootstrap API di-fetch saat user interaksi<br>✅ User dapat API baru setelah admin ubah<br>✅ Semua data konsisten |
| **Actual Result** | _Isi saat testing_ |
| **Status** | ☐ Pass ☐ Fail |
| **Notes** | _Isi jika ada catatan_ |

---

## 📊 Test Summary

### **Checklist Keseluruhan**

- ☐ Test Scenario 1: Initial Page Load (2 test cases)
- ☐ Test Scenario 2: Lazy Loading Trigger (3 test cases)
- ☐ Test Scenario 3: Admin Change API (3 test cases)
- ☐ Test Scenario 4: No Interval Monitoring (2 test cases)
- ☐ Test Scenario 5: Cache Invalidation (2 test cases)
- ☐ Test Scenario 6: Different Pages (3 test cases)
- ☐ Test Scenario 7: Edge Cases (3 test cases)
- ☐ Test Scenario 8: User Journey (2 test cases)

**Total Test Cases:** 25

### **Results Summary**

| Scenario | Pass | Fail | Notes |
|----------|------|------|-------|
| Initial Page Load | _/2 | _/2 | |
| Lazy Loading Trigger | _/3 | _/3 | |
| Admin Change API | _/3 | _/3 | |
| No Interval Monitoring | _/2 | _/2 | |
| Cache Invalidation | _/2 | _/2 | |
| Different Pages | _/3 | _/3 | |
| Edge Cases | _/3 | _/3 | |
| User Journey | _/2 | _/2 | |
| **TOTAL** | _/25 | _/25 | |

### **Overall Status**

- ✅ All Pass: Website siap untuk production
- ⚠️ Some Fail: Ada bug yang perlu diperbaiki
- ❌ Many Fail: Sistem perlu review ulang

---

## 🔧 Debugging Tips

### **Jika Test Gagal, Cek:**

1. **Console Errors:**
   ```javascript
   // Buka DevTools Console dan lihat error
   // Cari error terkait CONFIG, ApiService, atau fetch
   ```

2. **Network Issues:**
   ```javascript
   // Buka DevTools Network tab
   // Lihat Bootstrap API call status
   // Cek response body untuk error
   ```

3. **Cache Issues:**
   ```javascript
   // Clear cache: Ctrl+Shift+Delete
   // Atau: DevTools → Application → Clear storage
   ```

4. **Check CONFIG State:**
   ```javascript
   // Di Console, jalankan:
   console.log('CONFIG:', CONFIG);
   console.log('Main API:', CONFIG.getMainApiUrl());
   console.log('Settings Fetched:', CONFIG._settingsFetched);
   console.log('Interval:', CONFIG._apiChangeCheckInterval);
   ```

5. **Check Event Listener:**
   ```javascript
   // Trigger event manual untuk test
   window.dispatchEvent(new Event('api-config-changed'));
   ```

---

## 📝 Notes

- Semua test case harus dijalankan di browser yang berbeda (Chrome, Firefox, Safari) untuk memastikan compatibility
- Test dengan network throttling untuk simulasi slow connection
- Test dengan multiple tabs untuk memastikan cross-tab communication
- Catat semua hasil test untuk dokumentasi

---

**Test Date:** _______________
**Tested By:** _______________
**Browser:** _______________
**OS:** _______________
**Notes:** _______________
