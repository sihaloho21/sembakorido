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
- [x] `P0` Finalkan definisi transaksi valid untuk tambah limit (disarankan: setelah order `Diterima/Lunas`)
  - Implementasi: hanya status order `diterima`/`lunas` yang diproses untuk kenaikan limit
- [x] `P0` Finalkan aturan tenor aktif (1-4 minggu) dan fee per tenor
- [x] `P0` Finalkan aturan denda:
  - `0.5% per hari`
  - cap total denda `15%`
- [x] `P0` Finalkan aksi gagal bayar:
  - reduce limit
  - freeze kredit
  - lock akun (kriteria jelas)
  - Implementasi:
    - reduce limit saat overdue >= `paylater_overdue_reduce_limit_days` (default 7), besar reduce = `paylater_overdue_reduce_limit_percent` (default 10%)
    - freeze saat overdue >= `paylater_overdue_freeze_days` (default 3)
    - lock saat overdue >= `paylater_overdue_lock_days` (default 14)
    - status `defaulted` + auto lock saat overdue >= `paylater_overdue_default_days` (default 30)

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
- [x] `P0` Tambah field order untuk integrasi kredit:
  - `payment_method` (`cash`, `qris`, `gajian`, `paylater`)
  - `profit_net`
  - `credit_limit_processed` (`Yes/No`)
  - Implementasi: backend auto-ensure kolom saat proses `process_paylater_limit_from_orders`

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
- [x] `P1` Halaman `Credit Ledger` untuk audit trail
- [x] `P1` Validasi role/akses admin pada aksi sensitif
  - Implementasi:
    - backend role guard opsional via setting `admin_role_enforce=true`
    - role dibaca dari request (`admin_role`/`role`) dan divalidasi per aksi sensitif (`operator`/`manager`/`superadmin`)
    - frontend admin mengirim role pada semua request write/read sensitif
    - panel admin pengaturan menambah input role browser + toggle enforce role guard

---

## 5. Frontend User

- [x] `P0` Tampilkan info PayLater di akun user:
  - limit total
  - limit tersedia
  - limit terpakai
  - status akun kredit
- [x] `P0` Checkout: opsi bayar `PayLater` dengan validasi eligibility realtime
- [x] `P0` Sebelum konfirmasi, tampilkan simulasi:
  - pokok
  - fee tenor
  - denda harian
  - cap denda
  - total jatuh tempo
- [x] `P0` Halaman riwayat tagihan user + status
- [x] `P0` Halaman detail tagihan + tombol bayar/konfirmasi bayar
- [x] `P1` Notifikasi WA/push untuk H-1 jatuh tempo dan overdue
  - Implementasi:
    - endpoint/job `run_paylater_due_notifications` (H-1 + overdue) dengan channel email/webhook
    - throttle notifikasi per invoice via cooldown (`paylater_due_notification_cooldown_hours`)
    - scheduler terpisah:
      - `install_paylater_due_notification_scheduler`
      - `remove_paylater_due_notification_scheduler`
      - `get_paylater_due_notification_scheduler`
    - panel admin:
      - tombol run now + install/remove/status scheduler notifikasi
      - pengaturan key notifikasi due di section Pengaturan -> PayLater

---

## 6. Integrasi Order & Profit

- [x] `P0` Pastikan sumber `profit_net` jelas dan konsisten (per order)
  - Implementasi: hanya membaca field `orders.profit_net` (integer rupiah) sebagai basis kenaikan limit
- [x] `P0` Trigger limit increase saat order mencapai status final
  - Implementasi: hook di endpoint `update` sheet `orders` untuk auto-run `process_paylater_limit_from_orders` saat status final
- [x] `P0` Pastikan order batal/retur tidak menambah limit
  - Implementasi: status valid kenaikan limit dibatasi ke `lunas`/`diterima`
- [x] `P1` Mekanisme reversal jika ada refund setelah limit terlanjur naik
  - Implementasi:
    - endpoint `credit_limit_refund_reversal` (idempotent, berbasis ledger `limit_increase` vs `limit_reversal`)
    - auto-trigger saat `orders.status` berubah ke status refund/retur/cancel
    - test integrasi ditambah pada `scripts/test-paylater-gas-integration.js`

---

## 7. Risk Control

- [x] `P0` Rule `1 active invoice per user`
- [x] `P0` Auto-freeze saat overdue melewati ambang (tentukan hari)
- [x] `P0` Auto-lock untuk gagal bayar berat (tentukan kriteria)
- [x] `P0` Unfreeze/unlock hanya setelah pelunasan + verifikasi
  - Implementasi:
    - status `active` wajib `verification_passed=true` + `verification_note` minimal 8 karakter
    - ditolak jika masih ada invoice open (`active`/`overdue`/`defaulted`)
- [x] `P1` Batas maksimum limit global per user (ceiling)

---

## 8. Testing

- [x] `P0` Unit test kalkulasi fee tenor
  - Implementasi: `scripts/test-paylater-logic.js` (`calculatePaylaterInvoice`, tenor fee)
- [x] `P0` Unit test kalkulasi denda + cap 15%
  - Implementasi: `scripts/test-paylater-logic.js` (`calculatePenaltyAmount`, cap penalty)
- [x] `P0` Unit test validasi eligibility
  - Implementasi: `scripts/test-paylater-logic.js` (`evaluatePaylaterEligibility`)
- [x] `P0` Integration test alur:
  - checkout paylater -> invoice aktif
  - bayar -> invoice lunas -> limit pulih
  - overdue -> penalty -> freeze
  - Implementasi: `scripts/test-paylater-gas-integration.js`
- [x] `P0` Test idempotency (double click / retry request)
  - Implementasi: `scripts/test-paylater-gas-integration.js` (invoice create, payment, limit increase)
- [x] `P1` UAT skenario admin manual limit + perubahan setting tenor
  - Implementasi:
    - test integrasi ditambah pada `scripts/test-paylater-gas-integration.js` (`testAdminManualLimitAndTenorSettingChange`)
    - checklist manual UAT admin ditambahkan di `docs/PAYLATER_UAT_ADMIN.md`

---

## 9. Rollout Plan

- [x] `P0` Soft launch ke user terbatas (pilot)
  - Implementasi:
    - setting `paylater_pilot_enabled` + `paylater_pilot_allow_phones`
    - guard backend di `handleCreditInvoiceCreate` (`PILOT_NOT_ELIGIBLE`)
    - eligibility checkout frontend menampilkan reason `pilot_not_included`
    - panel admin settings untuk ubah whitelist pilot
- [x] `P0` Monitoring dashboard KPI:
  - on-time payment rate
  - overdue rate
  - default rate
  - repeat order lift
  - net margin PayLater
  - Implementasi: widget KPI PayLater di `admin/index.html` + kalkulasi di `admin/js/admin-script.js`
- [x] `P0` Siapkan SOP operasional penagihan
  - Implementasi: `docs/PAYLATER_COLLECTION_SOP.md`
- [x] `P1` Post-mortem 2 minggu pertama + tuning rule
  - Implementasi:
    - endpoint `run_paylater_postmortem_two_weeks` untuk ringkasan KPI 14 hari + rekomendasi tuning rule otomatis
    - hasil run dilog ke sheet `paylater_postmortem_logs` (summary + tuning JSON)
    - panel admin tambah tombol `Run Post-mortem` + ringkasan hasil cepat di section Credit Accounts

---

## 10. Backlog / Tambahan Saat Implementasi

- [x] Tambahan 1: Tambah integration test post-mortem + tuning recommendation
  - Implementasi: `scripts/test-paylater-gas-integration.js` (`testPostmortemTwoWeeksAndTuning`)
- [x] Tambahan 2: Snapshot export hasil post-mortem ke CSV dari admin panel
  - Implementasi:
    - endpoint `get_paylater_postmortem_logs` untuk ambil snapshot log post-mortem terbaru
    - tombol `Export CSV` di panel admin (section Credit Accounts -> Post-mortem)
    - export CSV mencakup metadata run, KPI ringkas, dan tabel rekomendasi tuning
- [ ] Tambahan 3: Alert otomatis jika default rate > threshold 2 minggu

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
