# PayLater Phase 1 (Fondasi Teknis)

Tanggal mulai: 2026-02-12

## Tujuan Phase 1

- Menyiapkan fondasi konfigurasi dan perhitungan PayLater tanpa mengganggu fitur existing.
- Menjaga implementasi tetap terarah sebelum masuk ke perubahan data/API besar.

## Scope Phase 1

1. Konfigurasi PayLater terpusat di `CONFIG`.
2. Utility perhitungan PayLater (fee, penalty, eligibility, growth limit).
3. Dokumen keputusan teknis awal untuk tim implementasi.

## Keputusan Teknis Awal

1. Limit awal diberikan manual oleh admin.
2. Pertumbuhan limit dihitung dari `10% profit bersih` (nilai default di config).
3. Tenor didukung 1-4 minggu dengan default fee:
   - 1 minggu: 5%
   - 2 minggu: 10%
   - 3 minggu: 15%
   - 4 minggu: 20%
4. Denda default:
   - 0.5% per hari
   - maksimal total 15%
5. Guardrail default:
   - `maxActiveInvoices = 1`
   - status akun: `active/frozen/locked`

## Artefak Kode Phase 1

- `assets/js/config.js`
  - tambah `PAYLATER_CONFIG`
  - tambah `getPaylaterConfig()` dan `setPaylaterConfig()`
  - expose `paylater` di `getAllConfig()`
- `assets/js/paylater-logic.js`
  - helper murni:
    - `calculatePaylaterInvoice`
    - `calculatePenaltyAmount`
    - `calculateTotalDueWithPenalty`
    - `calculateLimitIncreaseFromProfit`
    - `evaluatePaylaterEligibility`
- bundling:
  - `scripts/bundle-index.js`
  - `scripts/bundle-akun.js`
- admin include:
  - `admin/index.html` memuat `paylater-logic.min.js`

## Out of Scope Phase 1

- Pembuatan sheet/tabel baru di backend.
- Endpoint GAS untuk invoice/payment/paylater account.
- UI final admin/user untuk transaksi PayLater.
- Automation freeze/lock berbasis scheduler.

## Next Step (Phase 2)

1. Finalisasi skema tabel `credit_accounts`, `credit_invoices`, `credit_ledger`.
2. Implement endpoint GAS inti (create invoice, apply payment, update limit).
3. Integrasi checkout + admin setting.
