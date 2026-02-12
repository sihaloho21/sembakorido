# TODO Implementasi PayLater GoSembako

Dokumen ini jadi fokus kerja utama implementasi.  
Checklist boleh ditambah/diubah di tengah jalan sesuai kebutuhan teknis.

## Cara Pakai Dokumen

- Centang item saat selesai (`[x]`).
- Tambahkan sub-task baru di bagian terkait jika ada temuan baru.
- Jika ada perubahan keputusan bisnis, tulis di bagian `Keputusan`.
- Prioritas:
  - `P0` = wajib sebelum rilis
  - `P1` = penting, bisa menyusul
  - `P2` = peningkatan lanjutan

---

## 0. Keputusan Bisnis Final

- [x] `P0` Finalkan rumus limit:
  - Limit awal manual oleh admin
  - Kenaikan limit = `10% profit bersih` dari transaksi yang valid
- [ ] `P0` Finalkan definisi transaksi valid untuk tambah limit (disarankan: setelah order `Diterima/Lunas`)
- [x] `P0` Finalkan aturan tenor aktif (1-4 minggu) dan fee per tenor
- [x] `P0` Finalkan aturan denda:
  - `0.5% per hari`
  - cap total denda `15%`
- [ ] `P0` Finalkan aksi gagal bayar:
  - reduce limit
  - freeze kredit
  - lock akun (kriteria jelas)

---

## 1. Desain Data (Sheet/API)

- [x] `P0` Tambah/siapkan tabel `credit_accounts`
  - user_id / phone
  - credit_limit
  - available_limit
  - used_limit
  - status (`active`, `frozen`, `locked`)
  - admin_initial_limit
  - limit_growth_total
  - created_at, updated_at
- [x] `P0` Tambah/siapkan tabel `credit_invoices`
  - invoice_id
  - phone/user
  - principal
  - tenor_weeks
  - fee_percent, fee_amount
  - due_date
  - daily_penalty_percent
  - penalty_cap_percent
  - penalty_amount
  - total_due
  - paid_amount
  - status (`active`, `overdue`, `paid`, `defaulted`, `cancelled`)
  - created_at, updated_at, paid_at
- [x] `P0` Tambah/siapkan tabel `credit_ledger`
  - entry_id
  - phone/user
  - type (`limit_init`, `limit_increase`, `invoice_create`, `payment`, `penalty`, `freeze`, `unfreeze`, `lock`, `unlock`, `adjustment`)
  - ref_id (order_id/invoice_id)
  - amount
  - note
  - actor (`system`/`admin`)
  - created_at
- [ ] `P0` Tambah field order untuk integrasi kredit:
  - `payment_method` (`cash`, `qris`, `gajian`, `paylater`)
  - `profit_net`
  - `credit_limit_processed` (`Yes/No`)

---

## 2. Engine Perhitungan & Rules

- [x] `P0` Buat util hitung fee tenor berdasarkan konfigurasi admin
- [x] `P0` Buat util hitung denda harian + cap 15%
- [x] `P0` Buat util validasi eligibility PayLater:
  - akun kredit aktif
  - tidak ada tagihan aktif
  - available limit cukup
  - akun tidak frozen/locked
- [x] `P0` Buat util penambahan limit dari profit:
  - hanya sekali per order (`idempotent`)
  - hanya untuk order valid (status final)
- [x] `P0` Pastikan semua operasi uang dibulatkan konsisten (integer rupiah)

---

## 3. Backend/API (GAS / endpoint)

- [x] `P0` Endpoint: get credit account by phone/user
- [x] `P0` Endpoint: create/update initial limit (admin only)
- [x] `P0` Endpoint: create credit invoice saat checkout PayLater
- [x] `P0` Endpoint: post payment ke invoice + update status
- [x] `P0` Endpoint: apply penalty job/manual trigger
- [x] `P0` Endpoint: freeze/unfreeze/lock/unlock account
- [x] `P0` Endpoint: process limit increase from order profit
- [x] `P0` Tambahkan proteksi idempotency untuk:
  - create invoice
  - process limit increase
  - posting payment

---

## 4. Admin Panel

- [x] `P0` Halaman/section `PayLater Settings`
  - tenor aktif (1-4 minggu)
  - fee per tenor
  - denda harian
  - cap denda
- [x] `P0` Halaman `Credit Accounts`
  - set limit awal manual
  - lihat status akun (active/frozen/locked)
  - aksi freeze/unfreeze/lock/unlock
- [x] `P0` Halaman `Credit Invoices`
  - list tagihan
  - filter status
  - detail tagihan
  - input pembayaran manual
- [ ] `P1` Halaman `Credit Ledger` untuk audit trail
- [ ] `P1` Validasi role/akses admin pada aksi sensitif

---

## 5. Frontend User

- [ ] `P0` Tampilkan info PayLater di akun user:
  - limit total
  - limit tersedia
  - limit terpakai
  - status akun kredit
- [ ] `P0` Checkout: opsi bayar `PayLater` dengan validasi eligibility realtime
- [ ] `P0` Sebelum konfirmasi, tampilkan simulasi:
  - pokok
  - fee tenor
  - denda harian
  - cap denda
  - total jatuh tempo
- [ ] `P0` Halaman riwayat tagihan user + status
- [ ] `P0` Halaman detail tagihan + tombol bayar/konfirmasi bayar
- [ ] `P1` Notifikasi WA/push untuk H-1 jatuh tempo dan overdue

---

## 6. Integrasi Order & Profit

- [ ] `P0` Pastikan sumber `profit_net` jelas dan konsisten (per order)
- [ ] `P0` Trigger limit increase saat order mencapai status final
- [ ] `P0` Pastikan order batal/retur tidak menambah limit
- [ ] `P1` Mekanisme reversal jika ada refund setelah limit terlanjur naik

---

## 7. Risk Control

- [ ] `P0` Rule `1 active invoice per user`
- [ ] `P0` Auto-freeze saat overdue melewati ambang (tentukan hari)
- [ ] `P0` Auto-lock untuk gagal bayar berat (tentukan kriteria)
- [ ] `P0` Unfreeze/unlock hanya setelah pelunasan + verifikasi
- [ ] `P1` Batas maksimum limit global per user (ceiling)

---

## 8. Testing

- [ ] `P0` Unit test kalkulasi fee tenor
- [ ] `P0` Unit test kalkulasi denda + cap 15%
- [ ] `P0` Unit test validasi eligibility
- [ ] `P0` Integration test alur:
  - checkout paylater -> invoice aktif
  - bayar -> invoice lunas -> limit pulih
  - overdue -> penalty -> freeze
- [ ] `P0` Test idempotency (double click / retry request)
- [ ] `P1` UAT skenario admin manual limit + perubahan setting tenor

---

## 9. Rollout Plan

- [ ] `P0` Soft launch ke user terbatas (pilot)
- [ ] `P0` Monitoring dashboard KPI:
  - on-time payment rate
  - overdue rate
  - default rate
  - repeat order lift
  - net margin PayLater
- [ ] `P0` Siapkan SOP operasional penagihan
- [ ] `P1` Post-mortem 2 minggu pertama + tuning rule

---

## 10. Backlog / Tambahan Saat Implementasi

- [ ] Tambahan 1:
- [ ] Tambahan 2:
- [ ] Tambahan 3:

---

## 11. Progress Tahap Awal (Selesai)

- [x] Tambah konfigurasi PayLater di `CONFIG` (default + getter/setter)
- [x] Tambah helper kalkulasi PayLater (`assets/js/paylater-logic.js`)
- [x] Integrasikan helper ke pipeline bundle (`scripts/bundle-index.js`, `scripts/bundle-akun.js`)
- [x] Tambah dokumen fondasi teknis `docs/PAYLATER_PHASE_1.md`

## 12. Progress Phase 2 (Berjalan)

- [x] Definisi schema PayLater masuk ke GAS `SCHEMA_REQUIREMENTS`
- [x] Tambah action GAS dasar:
  - `credit_account_get`
  - `credit_account_upsert`
  - `credit_invoice_create`
  - `credit_invoice_pay`
  - `credit_limit_from_profit`
- [x] Tambah wrapper client di `assets/js/gas-actions.js`
- [x] Dokumentasi teknis Phase 2: `docs/PAYLATER_PHASE_2_SCHEMA_API.md`
