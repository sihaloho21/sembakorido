# Tukar Poin (Point Exchange) Feature - Complete Documentation

## Overview
The **Tukar Poin** feature is a new admin panel section that allows administrators to manage products that can be redeemed using customer loyalty points. This feature integrates seamlessly with the existing Paket Sembako admin dashboard.

---

## Architecture & Implementation

### 1. Database Schema (SheetDB)
The feature uses a new sheet named **`tukar_poin`** in the Google Spreadsheet connected to SheetDB.

**Required Columns:**
| Column | Type | Description |
|--------|------|-------------|
| `id` | String/Number | Unique identifier for the product |
| `judul` | String | Product title/name |
| `poin` | Number | Points required to redeem this product |
| `gambar` | String | URL of the product image |
| `deskripsi` | String | Product description |

**Example Data:**
```
id          | judul              | poin | gambar                          | deskripsi
1           | Voucher Rp 50.000  | 500  | https://example.com/voucher.jpg | Voucher belanja senilai Rp 50.000
2           | Gratis Ongkir      | 300  | https://example.com/shipping.jpg| Gratis ongkir untuk 1 pembelian
3           | Diskon 20%         | 400  | https://example.com/discount.jpg| Diskon 20% untuk pembelian berikutnya
```

---

## UI Components

### 1. Sidebar Navigation
**Location:** `admin/index.html` (lines 36-39)

The "Tukar Poin" menu item is added to the main sidebar with:
- **Icon:** Money/coin icon (SVG)
- **Color:** Amber (active state)
- **Action:** Triggers `showSection('tukar-poin')`

```html
<button onclick="showSection('tukar-poin')" id="nav-tukar-poin" 
        class="sidebar-item w-full flex items-center gap-3 px-4 py-3 rounded-xl transition font-medium">
    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <!-- Money icon SVG -->
    </svg>
    Tukar Poin
</button>
```

### 2. Main Content Section
**Location:** `admin/index.html` (lines 210-235)

Displays a table of all point exchange products with:
- **Header:** "Produk Tukar Poin" title and "Tambah Produk Tukar" button
- **Table Columns:**
  - Produk (with thumbnail image)
  - Poin Dibutuhkan
  - Deskripsi
  - Aksi (Edit/Delete buttons)

### 3. Add/Edit Modal
**Location:** `admin/index.html` (lines 428-456)

A modal form for creating and editing point exchange products with fields:
- **Judul Produk** (required, text input)
- **Nilai Poin** (required, number input)
- **URL Gambar** (required, URL input)
- **Deskripsi** (optional, textarea)

---

## JavaScript Functions

### 1. Data Fetching
**Function:** `fetchTukarPoin()`
- Fetches all point exchange products from SheetDB
- Handles errors gracefully with user-friendly messages
- Calls `renderTukarPoinTable()` to display data

```javascript
async function fetchTukarPoin() {
    const tbody = document.getElementById('tukar-poin-list');
    tbody.innerHTML = '<tr><td colspan="4" class="px-6 py-10 text-center text-gray-500">Memuat data tukar poin...</td></tr>';
    
    try {
        const response = await fetch(`${API_URL}?sheet=${TUKAR_POIN_SHEET}`);
        allTukarPoin = await response.json();
        if (!Array.isArray(allTukarPoin)) allTukarPoin = [];
        renderTukarPoinTable();
    } catch (error) {
        console.error('Error:', error);
        tbody.innerHTML = '<tr><td colspan="4" class="px-6 py-10 text-center text-red-500">Gagal memuat data tukar poin. Pastikan sheet "tukar_poin" sudah ada.</td></tr>';
    }
}
```

### 2. Table Rendering
**Function:** `renderTukarPoinTable()`
- Renders the table with all products
- Shows product image thumbnail
- Displays edit and delete action buttons
- Handles empty state

### 3. Modal Management
**Functions:**
- `openAddTukarPoinModal()` - Opens modal for adding new product
- `openEditTukarPoinModal(id)` - Opens modal for editing existing product
- `closeTukarPoinModal()` - Closes the modal

### 4. CRUD Operations

#### Create (Add)
```javascript
// POST request to SheetDB
response = await fetch(`${API_URL}?sheet=${TUKAR_POIN_SHEET}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: [data] })
});
```

#### Read (Fetch)
Already covered in `fetchTukarPoin()`

#### Update (Edit)
```javascript
// PATCH request to SheetDB
response = await fetch(`${API_URL}/id/${id}?sheet=${TUKAR_POIN_SHEET}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data })
});
```

#### Delete
**Function:** `handleDeleteTukarPoin(id)`
```javascript
async function handleDeleteTukarPoin(id) {
    if (!confirm('Apakah Anda yakin ingin menghapus produk tukar poin ini?')) return;
    
    try {
        const response = await fetch(`${API_URL}/id/${id}?sheet=${TUKAR_POIN_SHEET}`, {
            method: 'DELETE'
        });
        const result = await response.json();
        if (result.deleted > 0) {
            alert('Produk tukar poin berhasil dihapus!');
            fetchTukarPoin();
        }
    } catch (e) {
        console.error(e);
        alert('Gagal menghapus produk.');
    }
}
```

### 5. Form Submission
**Event Listener:** `tukar-poin-form` submit

Handles both add and edit operations:
- Validates form data
- Sends appropriate request (POST for new, PATCH for edit)
- Shows success/error messages
- Refreshes the table

---

## Styling

### CSS Classes
**Location:** `admin/css/admin-style.css`

```css
#nav-tukar-poin.active {
    background-color: #d97706; /* amber-600 */
    color: white;
}
```

### Tailwind Classes Used
- `bg-amber-500` / `bg-amber-600` - Amber color scheme for point exchange
- `shadow-lg shadow-amber-100` - Subtle shadow effect
- `hover:bg-amber-600` - Hover state for buttons
- `text-amber-600` - Text color for point values

---

## Integration Points

### 1. Navigation Integration
The feature is integrated into the main `showSection()` function:
```javascript
if (sectionId === 'tukar-poin') fetchTukarPoin();
```

### 2. SheetDB Integration
Uses the same API URL configuration as other features:
- `API_URL` from `CONFIG.getAdminApiUrl()`
- `TUKAR_POIN_SHEET` constant set to `'tukar_poin'`

### 3. Configuration
Inherits from existing configuration system in `assets/js/config.js`

---

## User Workflow

### Adding a New Product
1. Click "Tukar Poin" in sidebar
2. Click "Tambah Produk Tukar" button
3. Fill in the form:
   - Enter product title (e.g., "Voucher Rp 50.000")
   - Enter points required (e.g., "500")
   - Enter image URL (must be publicly accessible)
   - Enter product description
4. Click "Simpan" button
5. Product appears in the table

### Editing a Product
1. Click the blue Edit button next to a product
2. Modal opens with current values
3. Update any fields
4. Click "Simpan" to save changes

### Deleting a Product
1. Click the red Delete button next to a product
2. Confirm deletion in the popup dialog
3. Product is removed from the table

---

## Error Handling

### Common Issues & Solutions

**Issue:** "Gagal memuat data tukar poin. Pastikan sheet 'tukar_poin' sudah ada."
- **Solution:** Create a new sheet named `tukar_poin` in your Google Spreadsheet with the required columns

**Issue:** Form submission fails with "Gagal menyimpan data."
- **Solution:** 
  - Check that all required fields are filled
  - Verify image URL is valid and publicly accessible
  - Ensure SheetDB API is accessible

**Issue:** Product images don't display
- **Solution:** 
  - Verify image URL is correct and publicly accessible
  - Use HTTPS URLs for better compatibility
  - Check browser console for CORS errors

---

## Best Practices

1. **Image URLs:** Always use HTTPS URLs for product images
2. **Point Values:** Use reasonable point values (typically 100-1000 range)
3. **Descriptions:** Keep descriptions concise (under 100 characters recommended)
4. **Product Titles:** Use clear, descriptive titles
5. **Data Backup:** Regularly backup your Google Spreadsheet

---

## Future Enhancements

Potential improvements for future versions:
1. **Image Upload:** Add direct image upload instead of URL input
2. **Point Categories:** Group products by category
3. **Stock Management:** Track available quantity of each reward
4. **Redemption History:** View customer redemption records
5. **Point Expiration:** Set expiration dates for points
6. **Bulk Actions:** Add/edit/delete multiple products at once
7. **Analytics:** Track most redeemed products

---

## Files Modified

1. **`admin/index.html`**
   - Added sidebar menu item
   - Added section content
   - Added modal form

2. **`admin/js/admin-script.js`**
   - Added TUKAR_POIN_SHEET constant
   - Added allTukarPoin array
   - Added all CRUD functions
   - Added modal management functions

3. **`admin/css/admin-style.css`**
   - Added active state styling for Tukar Poin menu

4. **`DEVELOPMENT_LOG.md`** (New)
   - Development summary

5. **`TUKAR_POIN_DOCUMENTATION.md`** (New)
   - This comprehensive documentation

---

## Testing Checklist

- [ ] Navigate to Tukar Poin section loads without errors
- [ ] "Tambah Produk Tukar" button opens modal
- [ ] Form validation works (required fields)
- [ ] Add new product successfully
- [ ] Edit existing product successfully
- [ ] Delete product with confirmation
- [ ] Product images display correctly
- [ ] Table updates after add/edit/delete
- [ ] Error messages display appropriately
- [ ] Works with different image URLs
- [ ] Modal closes properly after save
- [ ] Modal closes properly after cancel

---

## Support & Maintenance

For issues or questions:
1. Check the error messages in the browser console
2. Verify SheetDB sheet structure matches requirements
3. Ensure all image URLs are valid and accessible
4. Test with sample data first

---

**Last Updated:** January 9, 2026
**Version:** 1.0
**Status:** Ready for Production
