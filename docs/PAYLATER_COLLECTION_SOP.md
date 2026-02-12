# SOP Operasional Penagihan PayLater (Pilot)

Dokumen ini dipakai tim operasional untuk menjalankan penagihan PayLater secara konsisten selama fase pilot.

## 1. Tujuan

- Menjaga pembayaran tepat waktu.
- Menurunkan rasio overdue/default.
- Menetapkan aksi yang konsisten untuk freeze, lock, dan reduce limit.

## 2. Ruang Lingkup

- Berlaku untuk semua invoice PayLater dengan status `active`, `overdue`, atau `defaulted`.
- Berlaku pada proses otomatis (scheduler) dan tindakan manual admin.

## 3. Role

- `Collector Ops`: follow up user, catat hasil kontak.
- `Admin Finance`: verifikasi pembayaran, update status bila perlu.
- `Admin Risk`: approval unfreeze/unlock dan penyesuaian limit khusus.

## 4. Sumber Data Utama

- `credit_invoices`: status tagihan, due date, penalty, paid amount.
- `credit_accounts`: status akun (`active`, `frozen`, `locked`) dan limit.
- `credit_ledger`: jejak audit aksi finansial dan status.

## 5. Jadwal Eksekusi Harian

1. Jalankan penalty job (otomatis/scheduler): `credit_invoice_apply_penalty`.
2. Review daftar invoice `overdue` dan `defaulted`.
3. Jalankan follow-up sesuai bucket DPD (days past due).
4. Catat semua hasil kontak di catatan internal tim.
5. Verifikasi pembayaran masuk dan proses `credit_invoice_pay`.

## 6. SLA Follow-up Penagihan

1. H-1 sebelum jatuh tempo:
   - Reminder sopan (WA/telepon).
2. DPD 1-3:
   - Reminder harian, edukasi nominal total_due termasuk denda.
3. DPD 4-7:
   - Eskalasi intensitas follow-up.
   - Pastikan akun ter-freeze bila threshold freeze tercapai.
4. DPD 8-14:
   - Fokus pelunasan, komunikasikan risiko lock.
   - Pastikan reduce limit dan lock berjalan sesuai threshold.
5. DPD >= default threshold:
   - Status `defaulted` + lock akun.
   - Hanya Admin Risk yang boleh approve aktivasi kembali.

## 7. Aturan Aksi Risiko (Konfigurasi Settings)

- `paylater_overdue_freeze_days`: ambang freeze akun.
- `paylater_overdue_lock_days`: ambang lock akun.
- `paylater_overdue_reduce_limit_days`: ambang reduce limit.
- `paylater_overdue_reduce_limit_percent`: persentase reduce limit.
- `paylater_overdue_default_days`: ambang status `defaulted` + lock.

Catatan: nilai dapat diubah dari panel Admin Pengaturan dan harus terdokumentasi di changelog operasional.

## 8. Prosedur Verifikasi Pembayaran

1. Validasi bukti bayar atau mutasi.
2. Eksekusi `credit_invoice_pay` dengan `payment_ref_id` unik (idempotent).
3. Pastikan:
   - `paid_amount` bertambah benar.
   - Jika lunas, status invoice menjadi `paid`.
   - Jika lunas, limit release tercatat di `credit_ledger`.
4. Simpan bukti pembayaran sesuai SOP internal finance.

## 9. Syarat Unfreeze/Unlock

- Invoice open (`active`/`overdue`/`defaulted`) harus sudah nol.
- Admin wajib kirim verifikasi:
  - `verification_passed=true`
  - `verification_note` minimal 8 karakter
- Eksekusi perubahan status akun ke `active` oleh admin berwenang.

## 10. KPI Monitoring Mingguan

- On-time payment rate.
- Overdue rate.
- Default rate.
- Recovery rate (overdue kembali lancar).
- Total outstanding amount.

## 11. Checklist Operasional Harian

- [ ] Penalty job sudah berjalan.
- [ ] Daftar overdue/default ditinjau.
- [ ] Follow-up sesuai bucket DPD dilakukan.
- [ ] Pembayaran hari ini diverifikasi.
- [ ] Ledger audit sampling minimal 5 transaksi.

