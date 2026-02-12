# PayLater Phase 2 - Desain Tabel dan Endpoint GAS Dasar

Tanggal: 2026-02-12

Dokumen ini jadi referensi implementasi backend PayLater pada GAS.

## 1. Sheet Baru

### 1.1 `credit_accounts`
Kolom:

1. `id`
2. `phone`
3. `user_id`
4. `credit_limit`
5. `available_limit`
6. `used_limit`
7. `status` (`active` | `frozen` | `locked`)
8. `admin_initial_limit`
9. `limit_growth_total`
10. `notes`
11. `created_at`
12. `updated_at`

### 1.2 `credit_invoices`
Kolom:

1. `id`
2. `invoice_id`
3. `phone`
4. `user_id`
5. `source_order_id`
6. `principal`
7. `tenor_weeks`
8. `fee_percent`
9. `fee_amount`
10. `penalty_percent_daily`
11. `penalty_cap_percent`
12. `penalty_amount`
13. `total_before_penalty`
14. `total_due`
15. `paid_amount`
16. `due_date`
17. `status` (`active` | `overdue` | `paid` | `defaulted` | `cancelled`)
18. `notes`
19. `created_at`
20. `updated_at`
21. `paid_at`
22. `closed_at`

### 1.3 `credit_ledger`
Kolom:

1. `id`
2. `phone`
3. `user_id`
4. `invoice_id`
5. `type`
6. `amount`
7. `balance_before`
8. `balance_after`
9. `ref_id`
10. `note`
11. `actor`
12. `created_at`

## 2. Endpoint GAS Dasar (doPost)

Semua endpoint berikut adalah `action` yang dipanggil via `GASActions.post`.

### 2.1 `credit_account_get`
Tujuan: ambil akun kredit berdasarkan nomor HP.

Payload:

```json
{
  "action": "credit_account_get",
  "data": {
    "phone": "081234567890"
  }
}
```

### 2.2 `credit_account_upsert`
Tujuan: buat/update akun kredit (set limit awal manual, status, notes).

Payload:

```json
{
  "action": "credit_account_upsert",
  "data": {
    "phone": "081234567890",
    "user_id": "USR-001",
    "admin_initial_limit": 100000,
    "status": "active",
    "notes": "Limit awal manual",
    "actor": "admin"
  }
}
```

### 2.3 `credit_invoice_create`
Tujuan: buat tagihan PayLater baru.

Payload:

```json
{
  "action": "credit_invoice_create",
  "data": {
    "phone": "081234567890",
    "user_id": "USR-001",
    "principal": 150000,
    "tenor_weeks": 2,
    "source_order_id": "ORD-123456",
    "due_date": "2026-02-26T00:00:00.000Z",
    "actor": "system"
  }
}
```

### 2.4 `credit_invoice_pay`
Tujuan: catat pembayaran invoice (parsial/pelunasan).

Payload:

```json
{
  "action": "credit_invoice_pay",
  "data": {
    "invoice_id": "INV-123456",
    "payment_amount": 50000,
    "note": "Bayar via transfer",
    "actor": "admin"
  }
}
```

### 2.5 `credit_limit_from_profit`
Tujuan: tambah limit dari profit order (idempotent per `order_id`).

Payload:

```json
{
  "action": "credit_limit_from_profit",
  "data": {
    "phone": "081234567890",
    "order_id": "ORD-123456",
    "profit_net": 10000,
    "actor": "system"
  }
}
```

## 3. Setting Key yang Dipakai Endpoint

Disimpan di sheet `settings`:

1. `paylater_enabled` (`true/false`)
2. `paylater_profit_to_limit_percent` (default `10`)
3. `paylater_fee_week_1` (default `5`)
4. `paylater_fee_week_2` (default `10`)
5. `paylater_fee_week_3` (default `15`)
6. `paylater_fee_week_4` (default `20`)
7. `paylater_daily_penalty_percent` (default `0.5`)
8. `paylater_penalty_cap_percent` (default `15`)
9. `paylater_max_active_invoices` (default `1`)
10. `paylater_max_limit` (default `1000000`)

## 4. Catatan Implementasi

1. Action mutasi memakai lock (`withScriptLock`) untuk mengurangi race condition.
2. `credit_limit_from_profit` punya dedup berbasis ledger (`type=limit_increase`, `ref_id=order_id`, `phone`).
3. Rule `1 active invoice` diterapkan saat `credit_invoice_create`.
4. Release used limit dilakukan saat invoice status berubah menjadi `paid`.

## 5. Next Work Setelah Phase 2

1. Tambah endpoint penalti harian terjadwal (`credit_apply_penalty_job`).
2. Tambah endpoint freeze/lock otomatis berbasis overdue.
3. Integrasi UI admin (list akun kredit, list invoice, pembayaran manual).
4. Integrasi checkout frontend dengan validasi eligibility realtime.

