# UAT Admin PayLater

Dokumen ini untuk validasi manual fitur admin PayLater sebelum rollout penuh.

## Scope UAT

- Manual update limit kredit oleh admin.
- Perubahan setting tenor fee dan dampaknya ke invoice baru.
- Verifikasi audit trail di Credit Ledger.

## Prasyarat

- Admin login ke panel `pengaturan`, `credit accounts`, `credit invoices`, `credit ledger`.
- `paylater_enabled=true`.
- User uji sudah memiliki `credit_account` aktif.

## Skenario 1: Manual Limit oleh Admin

1. Buka `Credit Accounts`.
2. Pilih user uji dan ubah:
   - `credit_limit` ke nilai baru (contoh: 300000).
   - `available_limit` mengikuti limit baru.
3. Simpan.
4. Verifikasi:
   - Nilai limit berubah sesuai input.
   - Ada entry baru di `Credit Ledger` dengan type `limit_adjustment`.
   - `actor` dan `ref_id` (jika diisi) tercatat.

## Skenario 2: Ubah Setting Tenor dan Buat Invoice Baru

1. Buka `Pengaturan -> Konfigurasi PayLater`.
2. Ubah salah satu fee tenor (contoh `paylater_fee_week_2` dari 10 ke 12.5).
3. Simpan setting.
4. Buka `Credit Invoices` lalu buat invoice baru:
   - principal: 200000
   - tenor: 2 minggu
5. Verifikasi:
   - `fee_amount` = 25000 (12.5% x 200000).
   - `total_due` = 225000.
   - Invoice lama tidak berubah (hanya invoice baru yang pakai setting baru).

## Skenario 3: Audit Trail Konsistensi

1. Buka `Credit Ledger`.
2. Filter by phone user uji.
3. Verifikasi urutan event:
   - `limit_adjustment` (saat admin ubah limit).
   - `invoice_create` (saat invoice baru dibuat).
4. Pastikan setiap row memiliki:
   - `created_at`
   - `actor`
   - `type`
   - `ref_id` (jika ada)

## Kriteria Lulus

- Semua skenario di atas lulus tanpa error.
- Nilai nominal perhitungan sesuai setting terbaru.
- Ledger merekam perubahan admin secara lengkap.
