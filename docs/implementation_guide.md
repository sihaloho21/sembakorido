# Tukar Poin Feature - Implementation Guide

## Quick Start

### Step 1: Prepare Your Google Spreadsheet

1. Open your Google Spreadsheet that's connected to SheetDB
2. Create a new sheet named **`tukar_poin`** (exactly as written)
3. Add the following column headers in the first row:
   - A1: `id`
   - B1: `judul`
   - C1: `poin`
   - D1: `gambar`
   - E1: `deskripsi`

### Step 2: Add Sample Data (Optional)

Add some sample products to test the feature:

| id | judul | poin | gambar | deskripsi |
|----|-------|------|--------|-----------|
| 1 | Voucher Rp 50.000 | 500 | https://via.placeholder.com/200 | Voucher belanja senilai Rp 50.000 |
| 2 | Gratis Ongkir | 300 | https://via.placeholder.com/200 | Gratis ongkir untuk 1 pembelian |

### Step 3: Verify SheetDB Connection

1. Your SheetDB API should already be configured in the admin panel
2. The API URL is stored in `CONFIG.getAdminApiUrl()`
3. Default: `https://sheetdb.io/api/v1/ollu7q79t1lc8`

### Step 4: Test the Feature

1. Open the Admin Dashboard
2. Click "Tukar Poin" in the sidebar
3. You should see your sample products in the table
4. Try adding, editing, and deleting products

---

## Feature Breakdown

### What's New?

#### 1. **Sidebar Menu**
- New "Tukar Poin" menu item with coin icon
- Amber color scheme to distinguish from other sections
- Smooth navigation to the Tukar Poin management page

#### 2. **Product Management Table**
- Displays all point exchange products
- Shows product thumbnail, points required, and description
- Edit and delete buttons for each product

#### 3. **Add/Edit Modal**
- Clean form interface for managing products
- Fields:
  - **Judul Produk** - Product name/title
  - **Nilai Poin** - Points required to redeem
  - **URL Gambar** - Product image URL
  - **Deskripsi** - Product description

#### 4. **CRUD Operations**
- **Create:** Add new products via the modal
- **Read:** View all products in the table
- **Update:** Edit existing products
- **Delete:** Remove products with confirmation

---

## Code Structure

### Files Modified

```
paket-sembako/
├── admin/
│   ├── index.html          # Added Tukar Poin section & modal
│   ├── css/
│   │   └── admin-style.css # Added Tukar Poin styling
│   └── js/
│       └── admin-script.js # Added Tukar Poin functions
├── DEVELOPMENT_LOG.md      # Development summary
└── TUKAR_POIN_DOCUMENTATION.md # Complete documentation
```

### Key Variables

```javascript
const TUKAR_POIN_SHEET = 'tukar_poin';  // Sheet name in Google Spreadsheet
let allTukarPoin = [];                   // Array to store all products
```

### Key Functions

```javascript
// Fetch data from SheetDB
fetchTukarPoin()

// Render products in table
renderTukarPoinTable()

// Modal management
openAddTukarPoinModal()
openEditTukarPoinModal(id)
closeTukarPoinModal()

// CRUD operations
handleDeleteTukarPoin(id)

// Form submission
tukar-poin-form.addEventListener('submit', ...)
```

---

## API Integration

### SheetDB Endpoints Used

#### Get All Products
```
GET /api/v1/{API_ID}?sheet=tukar_poin
```

#### Add Product
```
POST /api/v1/{API_ID}?sheet=tukar_poin
Body: { data: [{ id, judul, poin, gambar, deskripsi }] }
```

#### Update Product
```
PATCH /api/v1/{API_ID}/id/{product_id}?sheet=tukar_poin
Body: { data: { judul, poin, gambar, deskripsi } }
```

#### Delete Product
```
DELETE /api/v1/{API_ID}/id/{product_id}?sheet=tukar_poin
```

---

## Styling & Design

### Color Scheme
- **Primary:** Amber (#d97706 / #f59e0b)
- **Text:** Gray (#1f2937)
- **Hover:** Amber-600 (#b45309)
- **Borders:** Gray-100 (#f3f4f6)

### UI Components
- **Buttons:** Rounded corners (rounded-xl)
- **Cards:** Shadow and border styling
- **Table:** Hover effects on rows
- **Modal:** Centered overlay with backdrop

---

## Common Tasks

### Adding a New Product

```javascript
// Data structure
{
    id: 1,
    judul: "Voucher Rp 50.000",
    poin: 500,
    gambar: "https://example.com/image.jpg",
    deskripsi: "Voucher belanja senilai Rp 50.000"
}
```

### Editing a Product

1. Click the blue Edit button
2. Modal opens with current values
3. Update fields as needed
4. Click Simpan to save

### Deleting a Product

1. Click the red Delete button
2. Confirm in the popup dialog
3. Product is removed from SheetDB

---

## Troubleshooting

### Problem: Products not loading
**Solution:**
1. Check that `tukar_poin` sheet exists in Google Spreadsheet
2. Verify column names are exactly: id, judul, poin, gambar, deskripsi
3. Check browser console for error messages
4. Verify SheetDB API URL is correct

### Problem: Images not displaying
**Solution:**
1. Ensure image URL is valid and accessible
2. Use HTTPS URLs instead of HTTP
3. Check for CORS issues in browser console
4. Try using a placeholder service: `https://via.placeholder.com/200`

### Problem: Form submission fails
**Solution:**
1. Verify all required fields are filled
2. Check that image URL is publicly accessible
3. Look for error messages in browser console
4. Try refreshing the page and try again

### Problem: Changes not appearing in table
**Solution:**
1. Wait a moment for SheetDB to sync
2. Refresh the page
3. Check browser console for errors
4. Verify data was actually saved in Google Spreadsheet

---

## Best Practices

### Image URLs
- Use HTTPS URLs
- Use CDN or cloud storage (Google Drive, Imgur, etc.)
- Ensure images are publicly accessible

### Point Values
- Use whole numbers (no decimals)
- Use reasonable values (100-5000 range)
- Keep consistent with your reward system

### Product Descriptions
- Keep descriptions concise (under 100 characters)
- Use clear, descriptive language
- Include key benefits

---

## Performance Considerations

1. **Image Optimization:** Use optimized images to reduce load time
2. **Data Caching:** Products are fetched fresh each time the section is opened
3. **Pagination:** Consider adding pagination if you have many products (100+)
4. **API Rate Limits:** SheetDB has rate limits; be mindful of frequent updates

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Jan 9, 2026 | Initial implementation |

---

**Ready to go!** Your Tukar Poin feature is now fully integrated and ready to use.
