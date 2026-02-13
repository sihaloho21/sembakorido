# TODO Pengecekan Keseluruhan Kode Website (End-to-End)

Gunakan checklist ini untuk memastikan semua sistem saling terhubung dengan benar dari sisi user, admin, API, dan data sheet.

## Status Cek Ulang (2026-02-13) - Akun Focus
- [x] Dashboard akun sudah pakai endpoint public ketat untuk area target:
  - `public_login`, `public_user_profile`, `public_referral_history`
  - `public_user_points`, `public_user_orders`
  - `public_paylater_summary`, `public_paylater_invoices`, `public_paylater_invoice_detail`
- [x] UI error/loading/retry untuk section target akun sudah ada (`referral`, `paylater`, `orders`, `points`).
- [x] Retry per section sudah diarahkan ke refetch section terkait (bukan full reload halaman).
- [x] Build artifact frontend JS sudah diregenerate.
- [x] `npm run test` lulus di environment lokal saat cek ulang ini.
- [x] Flow non-target akun sudah migrasi strict-public (tanpa `?sheet=` di `assets/js/akun.js`):
  - Register: tanpa prefetch `users`, rely pada response public `create`.
  - Forgot PIN: tanpa enumerasi `users`, langsung alur kontak admin.
  - Edit profile: pindah ke action public `public_update_profile`.
  - Loyalty non-target: riwayat klaim + katalog reward pindah ke `public_claim_history` dan `public_rewards_catalog`.
- [x] `npm run test:paylater:integration` lulus setelah skenario overdue dibuat dinamis terhadap tanggal runtime.
- [ ] Checklist end-to-end lain di bawah ini masih perlu verifikasi manual/integrasi sesuai scope masing-masing.

## 0. Poin Besar Fitur Website (Checklist Cepat)
- [ ] Landing page, navigasi utama, dan konten promosi tampil normal.
- [ ] Katalog produk (search, kategori, sorting, detail, variasi, stok, harga) berjalan normal.
- [ ] Keranjang belanja (tambah/hapus/ubah qty) dan kalkulasi subtotal/total konsisten.
- [ ] Checkout (data pelanggan, metode kirim, metode bayar) tervalidasi dan bisa submit order.
- [ ] Akun user (register, login, logout, update profil, ubah PIN, lupa PIN) berjalan end-to-end.
- [ ] Loyalty points tampil benar dan sinkron dengan data backend.
- [ ] Reward & claim (katalog hadiah, tukar poin, riwayat klaim) berjalan tanpa mismatch poin.
- [ ] Referral (attach kode, riwayat, evaluasi reward, reverse saat cancel) berjalan sesuai rule.
- [ ] PayLater sisi user (eligibility, ringkasan limit, list invoice, detail invoice) bisa diakses sesuai session.
- [ ] PayLater sisi backend (invoice create/pay/penalty/freeze-lock/default) berjalan dan idempotent.
- [ ] Security hardening aktif (session guard, whitelist action public, rate limit, no direct sheet exposure di flow user).
- [ ] Scheduler/monitoring operasional (due notification, limit processor, postmortem, alert) berjalan tanpa error kritikal.

## 1. Persiapan Environment
- [ ] Pastikan `SPREADSHEET_ID` mengarah ke sheet produksi/staging yang benar.
- [ ] Pastikan semua sheet wajib ada dan header valid (`users`, `orders`, `user_points`, `claims`, `referrals`, `settings`, `credit_accounts`, `credit_invoices`, `credit_ledger`).
- [ ] Jalankan `ensure_schema` dan pastikan tidak ada error.
- [ ] Verifikasi konfigurasi penting pada `settings`:
  - [ ] `paylater_enabled`, `paylater_pilot_enabled`
  - [ ] `referral_enabled`
  - [ ] `public_create_require_hmac` (jika dipakai)
  - [ ] parameter rate-limit dan notifikasi

## 2. Auth & Session (Register/Login)
- [ ] Register user baru berhasil dan data masuk ke sheet `users`.
- [ ] Register dengan nomor yang sama ditolak (`DUPLICATE_PHONE`).
- [ ] Login valid menghasilkan `session_token`.
- [ ] Login salah PIN ditolak.
- [ ] Login untuk akun nonaktif ditolak.
- [ ] Endpoint publik berbasis session (`public_user_profile`, `public_user_points`, `public_user_orders`) gagal jika token invalid.
- [ ] Token session lama (expired) tidak bisa dipakai.

### Bukti Verifikasi Auth (2026-02-13)
- `rg -n "\\?sheet=" assets/js/akun.js` => tidak ada match (flow akun source sudah tanpa query `sheet=`).
- `assets/js/akun.js` sudah pakai:
  - `action: 'public_update_profile'` untuk edit profil/PIN.
  - `akunApiPost({ action: 'create', sheet: 'users', ... })` untuk register public.
- `docs/gas_v62_referral_hardening.gs` sudah expose guard public untuk:
  - `PUBLIC_POST_RULES.public_update_profile`
  - `doPost` handler `public_update_profile`
  - helper sesi `resolvePublicSessionPhoneFromData(...)`
- Catatan: verifikasi E2E manual register/login/session-expiry belum dijalankan pada putaran ini.

## 3. Profil User & Data Dasar
- [ ] `public_user_profile` mengembalikan data user sesuai nomor login.
- [ ] Kode referral otomatis terbentuk jika kosong.
- [ ] `public_user_points` sinkron dengan `user_points`.
- [ ] `public_user_orders` hanya menampilkan order milik user login.

## 4. Katalog, Cart, dan Checkout
- [ ] Produk/kategori/banner terbaca normal dari endpoint/listing UI.
- [ ] Harga, stok, qty, dan subtotal di cart sesuai perhitungan.
- [ ] Checkout membuat order dengan field penting terisi (`id/order_id`, `phone`, `status`, `total`, `qty`).
- [ ] Order invalid (qty/total <= 0) ditolak.

## 5. Order Lifecycle
- [ ] Update status order berjalan normal via admin/API.
- [ ] Transisi status final non-paylater (mis. `paid`, `selesai`) tidak merusak data order.
- [ ] Transisi status final paylater limit (mis. `lunas`, `diterima`) memicu update limit jika relevan.
- [ ] Status refund/cancel memicu reversal limit jika sebelumnya pernah increase.

## 6. Referral Flow (Attach -> Evaluate -> Reverse)
- [ ] Attach referral valid berhasil untuk user baru.
- [ ] Self referral ditolak.
- [ ] Ref code tidak valid ditolak.
- [ ] Attach dua kali untuk referee yang sama ditolak.
- [ ] Evaluate referral hanya sukses saat status order eligible dan min order terpenuhi.
- [ ] Idempotency `trigger_order_id` berjalan (request ulang tidak double reward).
- [ ] Fraud review/block bekerja sesuai rule dan log masuk `fraud_risk_logs`.
- [ ] Reversal referral saat order cancel berjalan dan idempotent.

### Bukti Verifikasi Referral (2026-02-13)
- Endpoint public referral di frontend tetap pakai action ketat:
  - `public_referral_history`, `public_referral_config` (lihat `assets/js/akun.js`).
- Guard backend referral masih aktif (cek `docs/gas_v62_referral_hardening.gs`):
  - idempotency order referral (`findReferralByTriggerOrderId`)
  - fraud engine (`evaluateReferralFraudRisk`, `logFraudRiskEvent`)
  - reversal lifecycle (`handleReverseReferralByOrder`)
- Catatan: checklist referral section ini masih butuh uji integrasi end-to-end (attach/evaluate/reverse real data).

## 7. Reward Points & Claim
- [ ] Poin loyalty dari order diproses sekali per order (`point_processed`).
- [ ] Claim reward valid memotong poin user dan mengurangi stok reward.
- [ ] Claim duplikat dengan `request_id` sama tidak memotong poin dua kali.
- [ ] Klaim saat poin tidak cukup/stok habis ditolak.
- [ ] Ledger `point_transactions` terbentuk dan konsisten.

## 8. PayLater Core
- [ ] `credit_account_upsert` bisa create/update akun kredit.
- [ ] Aktivasi akun kredit memerlukan verifikasi + tanpa invoice outstanding.
- [ ] `credit_invoice_create` gagal jika limit tidak cukup atau akun tidak aktif.
- [ ] Pembuatan invoice menghitung fee dan `total_due` dengan benar.
- [ ] Pembayaran parsial/full update `paid_amount`, `status`, dan release limit saat lunas.
- [ ] Apply penalty berjalan sesuai overdue days dan cap.
- [ ] Auto freeze/lock/defaulted berjalan sesuai konfigurasi hari overdue.
- [ ] `public_paylater_summary`, `public_paylater_invoices`, `public_paylater_invoice_detail` hanya akses milik user login.

### Bukti Verifikasi PayLater (2026-02-13)
- Test logic lulus: `npm run test:paylater` => `PayLater logic tests passed.`
- Test integrasi lulus: `npm run test:paylater:integration` => `PayLater GAS integration + idempotency tests passed.`
- Endpoint public akun untuk paylater tetap aktif di frontend:
  - `public_paylater_summary`
  - `public_paylater_invoices`
  - `public_paylater_invoice_detail`
- Catatan: item checklist PayLater di section ini tetap pending sampai smoke test data nyata selesai.

## 9. Scheduler & Background Jobs
- [ ] Scheduler paylater limit terpasang dan handler trigger benar.
- [ ] Scheduler due notification terpasang sesuai mode (daily/hourly).
- [ ] Trigger run manual (`run_paylater_due_notifications`, `process_paylater_limit_from_orders`) sukses.
- [ ] Postmortem 2 minggu menghasilkan log di `paylater_postmortem_logs`.
- [ ] Alert cooldown bekerja (tidak spam email/webhook).

## 10. Admin API Authorization & Security
- [ ] Endpoint non-publik menolak request tanpa `ADMIN_TOKEN` valid.
- [ ] Public action whitelist benar-benar terbatas (`attach_referral`, `claim_reward`, `create` sheet tertentu).
- [ ] Role-based access (jika aktif) memblokir role yang tidak cukup.
- [ ] HMAC public create (jika aktif) menolak signature invalid/expired.
- [ ] Rate-limit login/register/attach/claim aktif.

## 11. Integritas Data & Rekonsiliasi
- [ ] Jalankan `run_referral_reconciliation_audit` dan pastikan status `ok` atau mismatch terinvestigasi.
- [ ] Cek konsistensi:
  - [ ] `user_points.points` = sum `point_transactions.points_delta`
  - [ ] `credit_accounts.available_limit` = `credit_limit - used_limit`
  - [ ] `credit_invoices.total_due` = `total_before_penalty + penalty_amount`
- [ ] Pastikan tidak ada data orphan (contoh: invoice tanpa account, referral tanpa user).

## 12. Frontend Integration & UX Error Handling
- [ ] Semua halaman utama memanggil endpoint benar (tidak hardcoded endpoint lama).
- [ ] Semua response error API ditampilkan jelas di UI (bukan silent fail).
- [ ] Loading state, retry, dan empty state bekerja pada halaman akun, order, referral, paylater.
- [ ] Navigasi antar halaman tidak memutus session user.

## 13. Monitoring, Logging, dan Operasional
- [ ] Logger tidak menunjukkan error berulang pada `doGet/doPost`.
- [ ] Alert email/webhook berfungsi untuk skenario anomali.
- [ ] Ada SOP penanganan insiden untuk:
  - [ ] fraud referral
  - [ ] default rate paylater naik
  - [ ] mismatch ledger points

## 14. Regression Smoke Test (Wajib Setelah Deploy)
- [ ] Login user lama.
- [ ] Register user baru.
- [ ] Buat 1 order normal.
- [ ] Buat 1 order yang memicu limit paylater.
- [ ] Attach + evaluate referral pada user uji.
- [ ] Klaim reward poin.
- [ ] Bayar 1 invoice paylater (parsial/lunas).
- [ ] Jalankan minimal 1 job scheduler manual.

## 15. Exit Criteria (Go/No-Go)
- [ ] Tidak ada error kritikal di auth, checkout, payment, paylater, referral.
- [ ] Tidak ada mismatch data finansial/points yang tidak terjelaskan.
- [ ] Semua flow utama user dan admin lulus smoke test.
- [ ] Monitoring aktif dan channel alert tervalidasi.
