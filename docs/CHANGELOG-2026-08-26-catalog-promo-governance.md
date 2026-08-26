# Changelog — Catalog Promo POP Governance

**Tanggal rilis:** 26 Agustus 2026  
**Commit:** [`7f9f991`](https://github.com/sihaloho21/sembakorido/commit/7f9f991ff60aaca756a87a84a677bcb810c6fbe9)  
**Branch:** `main`  
**Pesan commit:** `feat: productionize catalog promo governance`

## Ringkasan

Rilis ini meningkatkan **Catalog Promo POP** dari editor promosi menjadi fondasi **Campaign Management System** yang memiliki persistence governance production melalui Google Apps Script dan Google Sheets. Perubahan berfokus pada version history, approval workflow, audit log, role-based access control, serta perlindungan minimum price pada seluruh jalur perubahan harga.

Perubahan mencakup **1.356 baris tambahan dan 43 baris penghapusan** pada enam file. Fitur katalog, rendering publik, ekspor, ukuran A4 Portrait, dan margin internal 0,4 cm tetap dipertahankan.

## Perubahan Utama

### 1. Governance persistence melalui GAS

Backend v63 sekarang menyediakan handler dan model persistence untuk:

- konteks governance, actor, role, permission, dan policy;
- version history campaign dengan snapshot JSON, nomor versi, status, dan request ID;
- restore version secara aman sebagai draft baru;
- approval workflow dengan transisi status, decision note, actor, dan timestamp;
- audit log append-only untuk pembuatan, perubahan, publish, approval, dan restore;
- margin policy berbasis global, kategori, atau produk.

Seluruh akses governance tetap menggunakan resolusi identity berbasis token hash di sisi server. Role atau identity dari client tidak dianggap sebagai sumber otoritas.

### 2. Perlindungan minimum price menyeluruh

Validasi minimum price diterapkan pada seluruh mutation path di production controller:

- bulk pricing;
- reset bulk pricing;
- input harga promo langsung dari product list;
- input harga promo pada brochure override;
- restore campaign atau version;
- validasi final sebelum save atau update.

Policy dengan mode **strict** melakukan rollback langsung terhadap nilai yang melanggar. Policy dengan mode **warning** tetap mengizinkan proses, tetapi menghasilkan peringatan. Backend GAS tetap menjadi validasi otoritatif pada boundary write dan publish.

### 3. Role-based access control pada UI

Production controller sekarang memuat governance context saat boot dan menerapkan permission backend-authoritative pada:

- pemilihan dan penghapusan produk campaign;
- perubahan harga dan teks brosur;
- drag-and-drop reorder produk;
- featured product;
- salin/tempel layout;
- penyimpanan dan penghapusan campaign;
- publish dan unpublish campaign.

Permission yang tidak tersedia akan menonaktifkan kontrol UI terkait, sementara backend tetap melakukan enforcement untuk mencegah bypass melalui request manual.

### 4. Error handling governance

Adapter GAS sekarang mempertahankan `error.code` dan payload response backend pada exception. UI dapat membedakan serta menampilkan pesan khusus untuk:

- `PRICE_BELOW_MINIMUM`;
- `PROMO_APPROVAL_REQUIRED`;
- unauthorized atau permission denial;
- kegagalan restore version dan operasi campaign lainnya.

### 5. Migration dan schema documentation

Ditambahkan dokumentasi schema governance production dan migration script yang idempotent untuk membuat atau memperbaiki sheet berikut:

- `promo_flyers`;
- `promo_flyer_versions`;
- `promo_flyer_approvals`;
- `promo_flyer_audit_logs`;
- `promo_admin_users`;
- `promo_role_permissions`;
- `promo_margin_policies`.

Migration juga menambahkan default permission untuk role `superadmin`, `manager`, `operator`, dan `viewer`, serta deterministic permission IDs agar proses seed dapat dijalankan berulang tanpa duplikasi.

## Validasi Rilis

Regression harness baru ditambahkan pada `tests/catalog_promo_pop_governance_regression.js`. Hasil validasi commit ini:

| Pemeriksaan | Hasil |
|---|---:|
| Governance dan minimum-price regression checks | **15/15 PASS** |
| Syntax check production POP controller | **PASS** |
| Syntax check GAS adapter | **PASS** |
| Syntax check migration script | **PASS** |
| Git whitespace validation | **PASS** |

Regression checks mencakup bulk pricing, reset pricing, direct input, brochure override, restore, save-time validation, governance boot, publish permission, structured errors, backend boundary validation, approval requirement, schema migration, A4 Portrait invariant, dan script loading order.

## Deployment Notes

Sebelum mengaktifkan enforcement penuh di production, tempelkan `docs/gas_v63_blog_support.gs` versi terbaru ke project Apps Script aktif. Kemudian jalankan fungsi berikut secara berurutan:

```javascript
runCatalogPromoPopGovernanceMigration();
verifyCatalogPromoPopGovernanceMigration();
seedCatalogPromoPopAdminAccess();
setCatalogPromoPopRoleEnforcement(true);
```

Pastikan `SPREADSHEET_ID` dan `ADMIN_TOKEN` telah tersedia sebagai Script Properties. Token mentah tidak disimpan ke Google Sheets; migration hanya menyimpan SHA-256 hash. Verifikasi data admin dan permission terlebih dahulu sebelum mengaktifkan `setCatalogPromoPopRoleEnforcement(true)`.

## File yang Berubah

| File | Peran |
|---|---|
| `admin/js/catalog-promo-pop.js` | Governance context, RBAC UI, minimum-price guard, save/publish handling, dan restore protection |
| `assets/js/gas-actions.js` | Preservasi structured error payload dari GAS |
| `docs/gas_v63_blog_support.gs` | Handler governance, role resolution, permission guards, versioning, approval, audit, dan server-side price validation |
| `docs/migrate_catalog_promo_pop_governance.gs` | Migration schema, default permissions, admin seeding, verification, dan version backfill |
| `docs/catalog-promo-pop-governance-schema-2026-08-26.md` | Dokumentasi data model dan workflow governance |
| `tests/catalog_promo_pop_governance_regression.js` | Regression harness untuk validasi integrasi governance |

## Catatan Kompatibilitas

Rilis ini tidak mengubah sumber harga asli produk. Override harga hanya disimpan pada snapshot campaign atau brochure. Fitur existing untuk rendering publik, ekspor PNG/PDF, watermark, PPOB wallet manual, dan layout A4 Portrait tetap dipertahankan.
