# Panduan Migrasi: SheetDB ke Google Apps Script (GAS)

Dokumen ini menjelaskan langkah-langkah detail untuk mengganti **SheetDB** dengan **Google Apps Script** sebagai backend API untuk proyek Paket Sembako. Migrasi ini akan menghilangkan keterbatasan kuota SheetDB dan menjadikannya 100% gratis.

---

## 1. Persiapan Backend (Google Sheets)

Anda tidak perlu menghapus data apa pun di Google Sheets. Kita hanya akan menambahkan "mesin" baru di dalamnya.

### Langkah-langkah:
1.  Buka Google Sheets Anda.
2.  Klik menu **Extensions** > **Apps Script**.
3.  Hapus semua kode yang ada di editor, lalu masukkan kode berikut:

```javascript
/**
 * GOOGLE APPS SCRIPT API FOR PAKET SEMBAKO
 * Fitur: CRUD (Read, Create, Update, Delete) & Search
 */

const SHEET_NAME = "Sheet1"; // Sesuaikan dengan nama sheet produk Anda

function doGet(e) {
  const action = e.parameter.action;
  const sheetName = e.parameter.sheet || SHEET_NAME;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) return errorResponse("Sheet not found");

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);

  // ACTION: READ ALL
  if (!action || action === "read") {
    const json = rows.map(row => {
      let obj = {};
      headers.forEach((header, i) => obj[header] = row[i]);
      return obj;
    });
    return successResponse(json);
  }

  // ACTION: SEARCH BY ID
  if (action === "search" && e.parameter.id) {
    const id = e.parameter.id;
    const rowData = rows.find(r => r[headers.indexOf("id")].toString() === id.toString());
    if (rowData) {
      let obj = {};
      headers.forEach((header, i) => obj[header] = rowData[i]);
      return successResponse([obj]);
    }
    return errorResponse("Data not found");
  }
}

function doPost(e) {
  const params = JSON.parse(e.postData.contents);
  const action = params.action;
  const sheetName = params.sheet || SHEET_NAME;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  // ACTION: CREATE
  if (action === "create") {
    const newRow = headers.map(h => params.data[h] || "");
    sheet.appendRow(newRow);
    return successResponse({ message: "Created successfully" });
  }

  // ACTION: UPDATE
  if (action === "update") {
    const id = params.id;
    const idIndex = headers.indexOf("id");
    for (let i = 1; i < data.length; i++) {
      if (data[i][idIndex].toString() === id.toString()) {
        headers.forEach((h, j) => {
          if (params.data[h] !== undefined) {
            sheet.getRange(i + 1, j + 1).setValue(params.data[h]);
          }
        });
        return successResponse({ message: "Updated successfully" });
      }
    }
  }

  // ACTION: DELETE
  if (action === "delete") {
    const id = params.id;
    const idIndex = headers.indexOf("id");
    for (let i = 1; i < data.length; i++) {
      if (data[i][idIndex].toString() === id.toString()) {
        sheet.deleteRow(i + 1);
        return successResponse({ message: "Deleted successfully" });
      }
    }
  }
}

function successResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function errorResponse(msg) {
  return ContentService.createTextOutput(JSON.stringify({ error: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

4.  Klik tombol **Save** (ikon disket) dan beri nama "Paket Sembako API".
5.  Klik tombol **Deploy** > **New Deployment**.
6.  Pilih type: **Web App**.
7.  Deskripsi: "Initial Version".
8.  Execute as: **Me**.
9.  Who has access: **Anyone** (Penting agar website bisa mengakses).
10. Klik **Deploy**. Salin **Web App URL** yang muncul (Simpan URL ini).

---

## 2. Perubahan di Sisi Website (Frontend)

Anda perlu mengubah cara website memanggil API karena struktur URL GAS berbeda dengan SheetDB.

### A. File `assets/js/config.js`
Ubah URL API utama Anda:
```javascript
const CONFIG = {
    // Ganti URL SheetDB lama dengan URL Web App GAS Anda
    API_URL: "https://script.google.com/macros/s/XXXXX_ID_SCRIPT_ANDA_XXXXX/exec",
    
    getMainApiUrl() {
        return this.API_URL;
    },
    getAdminApiUrl() {
        return this.API_URL;
    }
};
```

### B. File `assets/js/script.js` (Fungsi Fetch)
GAS menggunakan metode `GET` untuk membaca data. Fungsi `fetchProducts` Anda tetap sama, namun pastikan URL-nya benar.

### C. File `admin/js/admin-script.js` (Fungsi CRUD)
Ini adalah bagian yang paling banyak berubah karena SheetDB menggunakan metode HTTP (PATCH/DELETE), sedangkan GAS Web App paling stabil menggunakan `POST` dengan parameter `action`.

#### 1. Fungsi Update Status Pesanan:
**Lama (SheetDB):**
```javascript
fetch(`${API_URL}/id/${id}?sheet=orders`, { method: 'PATCH', ... })
```
**Baru (GAS):**
```javascript
fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({
        action: 'update',
        sheet: 'orders',
        id: id,
        data: { status: newStatus }
    })
})
```

#### 2. Fungsi Simpan Produk (Tambah/Edit):
**Lama (SheetDB):**
```javascript
const method = id ? 'PATCH' : 'POST';
const url = id ? `${API_URL}/id/${id}` : API_URL;
```
**Baru (GAS):**
```javascript
const action = id ? 'update' : 'create';
fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({
        action: action,
        sheet: 'Sheet1',
        id: id, // Hanya untuk update
        data: data
    })
})
```

#### 3. Fungsi Hapus Produk:
**Lama (SheetDB):**
```javascript
fetch(`${API_URL}/id/${id}`, { method: 'DELETE' })
```
**Baru (GAS):**
```javascript
fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({
        action: 'delete',
        sheet: 'Sheet1',
        id: id
    })
})
```

---

## 3. Apa yang Dihapus?
1.  **Ketergantungan SheetDB:** Anda bisa menghapus akun SheetDB atau membiarkannya sebagai cadangan.
2.  **API Key SheetDB:** Jika sebelumnya Anda menggunakan API Key di header, ini tidak lagi diperlukan di GAS (kecuali Anda menambahkan sistem token sendiri).

---

## 4. Keuntungan Setelah Migrasi
*   **Tanpa Batas:** Tidak ada lagi batasan 500 request per bulan.
*   **Kontrol Penuh:** Anda bisa menambahkan logika custom di sisi server (misal: kirim email otomatis saat ada pesanan baru) langsung di Apps Script.
*   **Gratis:** Selama Google Sheets gratis, API Anda juga gratis.

---
**Catatan Penting:** 
Saat melakukan `fetch` ke Google Apps Script, browser akan melakukan *redirect*. Pastikan kode JavaScript Anda tidak memblokir redirect (secara default aman). Jika muncul error CORS, pastikan saat Deploy di GAS, bagian "Who has access" sudah diset ke **Anyone**.
