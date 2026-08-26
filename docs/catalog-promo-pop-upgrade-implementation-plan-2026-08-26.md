# Implementation Plan — Upgrade Catalog Promo POP

**Tanggal:** 26 Agustus 2026  
**Basis:** Audit `docs/catalog-promo-pop-upgrade-audit-2026-08-26.md` dan prompt upgrade sistem brochure generator.  
**Prinsip:** Extend before replace, non-destructive migration, backward compatibility, testing setelah setiap fase, dan production rollout hanya setelah preview/local validation.

## 1. Batasan dan Strategi Utama

Implementasi tidak akan melakukan rewrite total terhadap storefront, checkout, admin authentication, product master, atau renderer POP yang sudah berjalan. `products` tetap menjadi sumber live catalog. Campaign menyimpan data brochure sebagai snapshot sehingga perubahan product master tidak mengubah brochure historis. `promo_flyers` tetap menjadi resource utama campaign/brochure pada tahap awal.

Fitur yang membutuhkan histori immutable, multi-user approval, reusable assets, atau query lintas campaign akan memakai sheet baru secara terukur. Tidak semua tabel yang tercantum pada prompt akan dibuat sekaligus. Setiap sheet baru memiliki deployment helper idempotent, header version, dan fallback ketika belum tersedia.

## 2. Integration Contract Existing

| Komponen | Integrasi yang dipertahankan | Aturan |
|---|---|---|
| Product catalog | `?sheet=products` melalui `CONFIG.getMainApiUrl()` | Tidak membuat duplicate product table. |
| Admin reads | GAS GET `promo_flyers` dengan token dan role | Pertahankan auth/session existing. |
| Admin writes | `GASActions.create/update/delete` dan action publish/unpublish | Tidak membuat transport API baru. |
| Public brochure | `public_promo_flyers` hanya untuk published aktif | Status baru wajib dinormalisasi agar public behavior lama tetap aman. |
| Campaign payload | `items_json`, `grid_config_json`, `banner_config_json`, metadata existing | Parser harus menerima format lama dan field baru bersifat optional. |
| Preview/export | Admin preview, `promo_katalog.html`, print, PNG, PDF | Semua output memakai satu normalized campaign model. |

## 3. Phase 1 — Core Professional

Phase 1 mengutamakan fitur yang paling dekat dengan codebase saat ini dan dapat diimplementasikan tanpa merusak data lama.

| Feature | Existing integration | Required changes | Risk level | Priority |
|---|---|---|---|---:|
| Product snapshot contract | `items_json` sudah menyimpan field snapshot dan override brosur | Tetapkan `snapshot_version`, normalisasi field wajib, validasi image/price/name, dan fallback parser untuk campaign lama | Tinggi | P0 |
| Campaign management foundation | `promo_flyers` sudah memiliki create/edit/save/publish/unpublish/delete dan periode | Tambahkan normalisasi status `draft`, `review`, `approved`, `published`, `expired`, `archived`; pertahankan status lama | Tinggi | P0 |
| Template Manager v1 | Select template/layout existing dan `template_id` | Tambahkan sheet `promo_templates` minimal dengan `id`, `name`, `status`, `is_default`, `config_json`, timestamps, actor; buat CRUD, duplicate, activate/deactivate, default, preview; fallback ke template built-in bila sheet belum tersedia | Sedang | P0 |
| Template configuration | `theme`, `layout`, paper/orientation, grid config existing | Validasi konfigurasi template dan merge dengan campaign override tanpa mengubah template master | Sedang | P0 |
| Promo rule engine v1 | Bulk percentage/fixed pricing dan per-item promo price existing | Tambahkan normalized rule type: `percentage`, `fixed_discount`, `fixed_price`; simpan rule metadata pada campaign/item; jadikan current pricing path sebagai adapter | Tinggi | P0 |
| Bundle Promo v1 | Selected items dan featured IDs existing | Tambahkan `bundle_config_json` optional atau bagian namespaced pada campaign config; hitung original total, discount, promo price, savings; render sebagai optional featured section | Sedang | P1 |
| Auto Layout | Grid rows/columns dan shared element positions existing | Buat capacity/page calculation, deterministic ordering, safe-area clamp, dan multi-page model tanpa mengubah single-page output untuk dataset kecil | Tinggi | P0 |
| Smart Text Fit | CSS truncation/layout existing | Tambahkan max line policy, safe text measurement, class warning untuk overflow, dan font scaling terbatas hanya pada brochure renderer | Sedang | P1 |
| Print Preflight v1 | A4 safe margin, image wait, PNG/PDF export existing | Tambahkan preflight sebelum export untuk paper/orientation, safe margin, image, price, QR, font, empty section, overflow; tampilkan warning dan izinkan admin memilih cancel/continue | Tinggi | P0 |
| Draft Autosave v1 | Manual draft save dan existing GAS update | Tambahkan dirty state, debounce 1–2 detik, request deduplication, status `Saving/Saved/Error`, local recovery copy, serta guard agar tidak menyimpan saat campaign tidak memiliki ID valid | Tinggi | P0 |

### 3.1 Phase 1 Data Changes

Phase 1 mengutamakan pemakaian field existing. Jika hasil implementasi memerlukan persistence tambahan, perubahan minimum yang disiapkan adalah:

| Data resource | Perubahan | Migration behavior |
|---|---|---|
| `promo_flyers` | Tambah `snapshot_version`, `template_config_json`, `promo_rules_json`, `bundle_config_json`, `sections_json`, `autosave_revision` bila benar-benar diperlukan oleh implementasi | Append missing headers only; row lama menerima default kosong dan tetap dirender memakai defaults. |
| `promo_templates` | Sheet baru untuk template manager v1 | Create sheet only if absent; seed built-in templates secara idempotent dengan flag source/system. |
| Product master | Tidak diubah | Harga, gambar, stok, dan field existing tetap menjadi live source. |

Sebelum migration, export/backup header dan data `promo_flyers`. Tidak ada `DROP TABLE`, `DROP COLUMN`, reset spreadsheet, atau overwrite seluruh rows.

### 3.2 Phase 1 UI and API Changes

UI Phase 1 tetap berada di admin POP builder atau modul child yang terpisah agar source existing mudah di-rollback. Tambahkan panel template manager, rule/bundle controls, status autosave, dan preflight result secara modular. Public renderer hanya menerima normalized published data; editor-only controls tidak dikirim ke publik jika tidak diperlukan.

GAS menambahkan action modular seperti `promo_template_list`, `promo_template_create`, `promo_template_update`, `promo_template_duplicate`, `promo_template_activate`, dan `promo_template_set_default` hanya jika CRUD existing generic path tidak cukup. Semua action memakai token/role validation yang sama. Campaign save tetap kompatibel dengan generic `create/update`.

## 4. Phase 1 Testing Gate

Phase 2 tidak dimulai sebelum semua pemeriksaan berikut selesai dan hasilnya dicatat:

| Test group | Acceptance criteria |
|---|---|
| Existing regression | Product catalog, admin login, dashboard, product price/image, current POP CRUD, publish/unpublish, public catalog, QR, print, PNG, PDF tetap berfungsi. |
| Snapshot | Setelah harga/gambar product master berubah, brochure yang sudah disimpan tetap menampilkan snapshot lama. Campaign lama tanpa `snapshot_version` tetap dapat dibuka. |
| Promo rules | Percentage, fixed discount, fixed promo price menghasilkan nominal yang benar; harga database tidak berubah. |
| Bundle | Original total, discount, promo price, savings konsisten dan bundle optional tidak merusak layout non-bundle. |
| Auto layout | Dataset kecil tetap single page; dataset penuh tidak overlap, tidak keluar safe area, dan page count deterministic. |
| Smart text | Nama panjang tidak memecahkan card; warning tampil ketika fallback/scale digunakan. |
| Preflight | Warning muncul untuk missing image/price, QR terlalu kecil, overflow, empty section, dan margin tidak valid. |
| Autosave | Debounce bekerja, refresh dapat memulihkan draft lokal, request tidak dikirim pada setiap keystroke. |
| Backend compatibility | Schema deployment idempotent; campaign lama dapat dibaca; role manager/operator tetap mengikuti aturan existing. |
| Browser/export | Console bebas dari error baru; preview admin, public, print, PNG, dan PDF memiliki struktur yang sama. |

## 5. Phase 2 — Management

Phase 2 dimulai hanya setelah Phase 1 testing gate lulus.

| Feature | Existing integration | Required changes | Risk level | Priority |
|---|---|---|---|---:|
| Version History | Campaign snapshot existing dan `updated_at` | Sheet `promo_flyer_versions` berisi version number, campaign ID, snapshot JSON, actor, timestamp, summary; create version on explicit save/publish, compare, restore with confirmation | Tinggi | P0 |
| Role Permission | GAS token/role existing | Buat permission matrix untuk owner/admin/editor/viewer menggunakan role resolver existing; enforce server-side untuk create/edit/delete/export/approve/template/analytics | Tinggi | P0 |
| Approval Workflow | Campaign status draft/published existing | Tambahkan `in_review`, `approved`, `rejected`, notes, rejected reason, approved actor/time; public endpoint hanya publish aktif | Tinggi | P0 |
| Audit Log | Logging domain existing pada beberapa feature | Sheet `promo_flyer_audit_logs` atau adapter audit generic dengan append-only event: create, update, price change, delete, export, approve, publish | Tinggi | P0 |
| Asset Library | Product image and banner URLs existing | Sheet `promo_assets` dengan type, URL, metadata, tags, status, usage count/reference; upload/reuse/preview; block delete while referenced | Sedang | P1 |
| Brand Kit | Store name/theme existing | Sheet `promo_brand_kits` atau namespaced settings; template uses brand snapshot at campaign creation so historical output is stable | Sedang | P1 |
| Margin Checker | Product cost field may or may not exist | Read cost only when validated; calculate profit/margin; if cost missing show unavailable instead of estimated value | Tinggi | P1 |
| Minimum Price Protection | Promo price inputs existing | Add configurable warning/strict mode and minimum price check; never silently rewrite admin input; preserve audit trail | Tinggi | P1 |

### 5.1 Phase 2 Migration

All Phase 2 sheets are additive and idempotent. Version, audit, asset, and brand rows reference the campaign/template IDs without copying or changing product master rows. Existing campaign rows remain valid when Phase 2 columns are blank. Restore operations create a new campaign revision rather than destroying historical versions.

## 6. API and Backend Strategy

The implementation will reuse the current GAS contract. New actions are added only for operations that cannot be safely represented by generic CRUD. Server-side validation must happen before any write: authenticated actor, allowed role, required fields, valid status transition, safe JSON size, and referenced campaign/template existence.

GET responses should preserve existing array/object response tolerance. Unknown optional columns must be ignored by older frontend code. Public responses must exclude sensitive admin-only fields and continue filtering to published active campaigns.

## 7. Rollback Strategy

Every phase starts with a Git commit and a schema/data backup. Frontend rollout can be reverted by restoring the previous HTML/JS files because the production page is not rewritten until the preview/local gate passes. Backend migration rollback is additive-first: disable new actions, keep new columns/sheets unused, and fall back to existing fields. No destructive migration is permitted.

For a failed deployment, restore the previous Git commit, disable the new UI entry points, and keep the migrated headers/sheets in place if they are empty or additive. If rows were written by a new feature, use a targeted migration repair rather than resetting the spreadsheet.

## 8. Delivery Sequence

```text
Audit report
  → Implementation plan approval
  → Phase 1 implementation
  → Phase 1 browser/export/regression testing
  → Phase 1 fixes and test gate
  → Phase 2 implementation
  → Phase 2 browser/API/regression testing
  → Final report
  → Production rollout only after explicit approval
```

Phase 3 digital/QR analytics and Phase 4 multi-channel output dari prompt belum masuk coding pada siklus ini. Keduanya akan direncanakan setelah Phase 1 dan Phase 2 stabil.

## 9. Definition of Done untuk Siklus Ini

Siklus dianggap selesai jika Phase 1 dan Phase 2 lulus test gate masing-masing, existing data tidak hilang, campaign lama tetap dapat dirender, permission/approval tidak dapat dilewati melalui API, export tidak memotong elemen, dan hasil testing memiliki daftar known issues yang jelas.

**Status:** Implementation plan selesai. Belum ada implementasi Phase 1 pada dokumen ini.

## Referensi Internal

1. `docs/catalog-promo-pop-upgrade-audit-2026-08-26.md`
2. `admin/js/catalog-promo-pop.js`
3. `admin/catalog-promo-pop.html`
4. `promo_katalog.html`
5. `docs/gas_v63_blog_support.gs`
6. `docs/deploy_promo_flyers_schema.gs`
7. `assets/js/api-service.js`
8. `admin/js/admin-auth.js`
9. `package.json`
10. `PROMPT—UPGRADESISTEMBROCHUREGENERATORPAKETSEMBAKO.COM.md`
