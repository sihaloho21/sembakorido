# Manual Smoke Test Runbook (Frontend, Checkout, Scheduler)

Tanggal: ____________________  
Environment: `staging` / `production`  
Executor: ____________________

## 1. Pre-Flight

- Pastikan URL website yang dites:
  - FE: `https://<domain-website>`
  - GAS API: `https://script.google.com/macros/s/<deployment-id>/exec`
- Pastikan akun uji siap:
  - User lama aktif
  - User baru (belum terdaftar)
  - Minimal 1 user dengan data referral
  - Minimal 1 user dengan credit account PayLater
- Pastikan akses admin/API:
  - `ADMIN_TOKEN` tersedia
  - Jika role enforcement aktif, siapkan role `superadmin`/`manager`
- Pastikan sheet target bisa dipantau:
  - `orders`, `users`, `user_points`, `claims`, `credit_invoices`, `credit_ledger`, `paylater_postmortem_logs`

## 2. Frontend Smoke (Landing, Katalog, Cart)

| ID | Langkah Uji | Expected Result | Status | Evidence |
|---|---|---|---|---|
| FE-01 | Buka landing page | Halaman tampil normal, tidak blank | [ ] | Screenshot + console |
| FE-02 | Cek navbar/menu/banner | Semua komponen utama tampil | [ ] | Screenshot |
| FE-03 | Search produk | Hasil sesuai keyword | [ ] | Screenshot |
| FE-04 | Filter kategori | Produk sesuai kategori | [ ] | Screenshot |
| FE-05 | Buka detail produk | Detail, harga, stok/variasi tampil | [ ] | Screenshot |
| FE-06 | Tambah ke cart | Item masuk cart | [ ] | Screenshot |
| FE-07 | Ubah qty (+/-) | Subtotal/total update benar | [ ] | Screenshot |
| FE-08 | Hapus item cart | Item hilang, total update | [ ] | Screenshot |

Catatan FE: ____________________________________________________

## 3. Checkout Smoke

| ID | Langkah Uji | Expected Result | Status | Evidence |
|---|---|---|---|---|
| CO-01 | Checkout data valid (nama, phone, payment, shipping) | Tombol submit aktif, order terkirim | [ ] | Screenshot + network |
| CO-02 | Verifikasi row `orders` sesudah submit | Kolom penting terisi: `id/order_id`, `phone`, `status`, `qty`, `total` | [ ] | Screenshot sheet |
| CO-03 | Uji invalid order (`qty<=0`/`total<=0`) | Request ditolak (error jelas) | [ ] | Screenshot response |
| CO-04 | Uji metode kirim berbeda | Fee/total konsisten | [ ] | Screenshot |
| CO-05 | Uji metode bayar berbeda (Tunai/QRIS/PayLater jika aktif) | Flow dan kalkulasi benar | [ ] | Screenshot |

Catatan Checkout: ______________________________________________

## 4. Scheduler & Background Job Smoke

Gunakan request POST ke GAS:

```bash
curl -X POST "<GAS_URL>" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"<ADMIN_TOKEN>\",\"action\":\"<ACTION>\",\"data\":{...}}"
```

### 4.1 PayLater Limit Scheduler

| ID | Action | Payload `data` contoh | Expected |
|---|---|---|---|
| SCH-L1 | `install_paylater_limit_scheduler` | `{"mode":"hourly"}` | `success:true` |
| SCH-L2 | `get_paylater_limit_scheduler` | `{}` | `active:true` |
| SCH-L3 | `process_paylater_limit_from_orders` | `{"dry_run":true}` | `success:true` |
| SCH-L4 | `remove_paylater_limit_scheduler` | `{}` | `success:true` |

### 4.2 Due Notification Scheduler

| ID | Action | Payload `data` contoh | Expected |
|---|---|---|---|
| SCH-D1 | `install_paylater_due_notification_scheduler` | `{"mode":"daily","hour":9}` | `success:true` |
| SCH-D2 | `get_paylater_due_notification_scheduler` | `{}` | `active:true` |
| SCH-D3 | `run_paylater_due_notifications` | `{"force":true}` | `success:true` |
| SCH-D4 | `remove_paylater_due_notification_scheduler` | `{}` | `success:true` |

### 4.3 Monitoring/Reconciliation

| ID | Action | Payload `data` contoh | Expected |
|---|---|---|---|
| SCH-M1 | `run_referral_reconciliation_audit` | `{}` | `success:true` + log audit masuk |
| SCH-M2 | `run_paylater_postmortem_two_weeks` | `{"window_days":14}` | `success:true` + log postmortem masuk |

Catatan Scheduler: _____________________________________________

## 5. Evidence Minimum

- Screenshot halaman FE untuk tiap blok utama.
- Screenshot Network tab untuk request checkout (success + invalid).
- Screenshot row baru pada sheet terkait (`orders`, `paylater_postmortem_logs`, `referral_audit_logs`).
- Salinan response JSON untuk action scheduler utama.

## 6. Exit Decision

- [ ] Semua test kritikal lulus tanpa blocker.
- [ ] Tidak ada error berulang di console FE.
- [ ] Tidak ada mismatch data penting setelah smoke test.
- [ ] Rekomendasi: `GO` / `NO-GO`

Kesimpulan: _________________________________________________

