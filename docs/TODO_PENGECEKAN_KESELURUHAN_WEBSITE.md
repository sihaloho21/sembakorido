# TODO Pengecekan Keseluruhan Kode Website (End-to-End)

Gunakan checklist ini untuk memastikan semua sistem saling terhubung dengan benar dari sisi user, admin, API, dan data sheet.

Runbook eksekusi manual:
- `docs/MANUAL_SMOKE_TEST_FRONTEND_CHECKOUT_SCHEDULER.md`

## Template Laporan PASS/FAIL (Isi Saat Eksekusi Manual)

Gunakan format ini saat menjalankan smoke test frontend, checkout, dan scheduler di environment aktif.

### A. Metadata Eksekusi

| Field | Value |
|---|---|
| Tanggal eksekusi | |
| Environment | `staging` / `production` |
| Executor | |
| Build/Commit | |
| Scope run | `frontend` / `checkout` / `scheduler` |

### B. Rekap PASS/FAIL

| Area Uji | Total Case | PASS | FAIL | BLOCKED | Catatan Singkat |
|---|---:|---:|---:|---:|---|
| Frontend Smoke (`FE-01` s.d. `FE-08`) | 8 | | | | |
| Checkout Smoke (`CO-01` s.d. `CO-05`) | 5 | | | | |
| Scheduler PayLater Limit (`SCH-L1` s.d. `SCH-L4`) | 4 | | | | |
| Scheduler Due Notification (`SCH-D1` s.d. `SCH-D4`) | 4 | | | | |
| Monitoring/Reconciliation (`SCH-M1` s.d. `SCH-M2`) | 2 | | | | |
| **TOTAL** | **23** | | | | |

### C. Detail Failure/Blocker

| ID Test | Status (`FAIL`/`BLOCKED`) | Severity (`High`/`Medium`/`Low`) | Bukti (URL/screenshot/log) | Dampak | PIC | ETA |
|---|---|---|---|---|---|---|
| | | | | | | |

### D. Verifikasi Operasional Live

| Item Operasional | Hasil (`PASS`/`FAIL`) | Evidence |
|---|---|---|
| Error log runtime GAS (`doGet`/`doPost`) tidak menunjukkan error berulang kritikal | | |
| Trigger scheduler benar-benar terpasang dan aktif sesuai jadwal | | |
| Trigger manual run menghasilkan output sukses dan data log masuk sheet terkait | | |
| Perilaku UI end-to-end di environment aktif (landing -> cart -> checkout -> akun) berjalan normal | | |

### E. Keputusan Rilis

| Gate | Status |
|---|---|
| Siap rilis (`GO`) / belum siap (`NO-GO`) | |
| Alasan keputusan | |
| Tindak lanjut wajib (jika `NO-GO`) | |

## Urutan Eksekusi Prioritas 1 Sesi (Quick Critical Closure)

Target sesi: **90 menit** untuk menutup item kritikal paling berdampak.

### Tahap 1 (0-15 menit): Pre-Flight dan Validasi Environment

Tujuan: memastikan baseline benar sebelum smoke run.

- Checklist target:
  - `## 1. Persiapan Environment` (semua item)
- Aksi cepat:
  - Verifikasi `SPREADSHEET_ID`, header sheet wajib, dan `settings` kunci.
  - Jalankan `ensure_schema`.
- Output wajib:
  - Isi `Template Laporan PASS/FAIL > A. Metadata Eksekusi`.
  - Tandai PASS/FAIL awal di `D. Verifikasi Operasional Live` untuk kesiapan trigger/log.

### Tahap 2 (15-50 menit): Frontend + Checkout Smoke

Tujuan: menutup risiko user-facing paling kritikal.

- Checklist target:
  - `## 0. Poin Besar Fitur Website (landing/katalog/cart/checkout)`
  - `## 4. Katalog, Cart, dan Checkout`
- Aksi cepat (mengacu runbook):
  - Jalankan `FE-01` s.d. `FE-08`.
  - Jalankan `CO-01` s.d. `CO-05`.
- Output wajib:
  - Screenshot UI + Network untuk checkout valid dan invalid.
  - Verifikasi row `orders` terisi benar.
  - Isi tabel `B. Rekap PASS/FAIL`.

### Tahap 3 (50-75 menit): Scheduler Operasional Live

Tujuan: memastikan job berjalan real di environment aktif.

- Checklist target:
  - `## 9. Scheduler & Background Jobs`
  - bagian operasional `## 13. Monitoring, Logging, dan Operasional`
- Aksi cepat (mengacu runbook):
  - PayLater limit: `SCH-L1` -> `SCH-L4`.
  - Due notification: `SCH-D1` -> `SCH-D4`.
  - Monitoring: `SCH-M1` dan `SCH-M2`.
- Output wajib:
  - Simpan response JSON tiap action scheduler utama.
  - Bukti log masuk ke `referral_audit_logs` dan `paylater_postmortem_logs`.
  - Update `D. Verifikasi Operasional Live` (trigger aktif + run sukses + error log runtime).

### Tahap 4 (75-85 menit): Integritas Data Cepat

Tujuan: memastikan tidak ada mismatch finansial/points setelah run.

- Checklist target:
  - item utama di `## 11. Integritas Data & Rekonsiliasi`
- Aksi cepat:
  - Jalankan `run_referral_reconciliation_audit`.
  - Spot check 3 konsistensi inti:
    - `user_points.points` vs sum `point_transactions.points_delta`
    - `credit_accounts.available_limit` vs `credit_limit - used_limit`
    - `credit_invoices.total_due` vs `total_before_penalty + penalty_amount`
- Output wajib:
  - Isi `C. Detail Failure/Blocker` bila ada mismatch.

### Tahap 5 (85-90 menit): Gate Keputusan

Tujuan: tutup sesi dengan keputusan jelas.

- Checklist target:
  - `## 15. Exit Criteria (Go/No-Go)`
- Aksi cepat:
  - Hitung total PASS/FAIL/BLOCKED dari rekap.
  - Putuskan `GO` atau `NO-GO` dengan alasan.
- Output wajib:
  - Isi `E. Keputusan Rilis`.
  - Jika `NO-GO`, tulis action item + PIC + ETA.

### Definisi Selesai Sesi Prioritas

- Semua test FE/CO/Scheduler run minimal 1 kali.
- Tidak ada blocker `High` yang terbuka tanpa mitigasi.
- Keputusan rilis (`GO/NO-GO`) terdokumentasi dengan evidence.

## Run Sheet Operasional (Copy-Paste)

### 1) Setup Cepat (PowerShell)

```powershell
$GAS_URL = "https://script.google.com/macros/s/<deployment-id>/exec"
$ADMIN_TOKEN = "<ADMIN_TOKEN>"

function Invoke-GasAction {
  param(
    [Parameter(Mandatory=$true)][string]$Action,
    [hashtable]$Data = @{},
    [string]$Token = $ADMIN_TOKEN
  )

  $body = @{
    token  = $Token
    action = $Action
    data   = $Data
  } | ConvertTo-Json -Depth 12

  Invoke-RestMethod -Method Post -Uri $GAS_URL -ContentType "application/json" -Body $body
}
```

### 2) Timeline Eksekusi per Tahap

| Tahap | Jam Mulai | Jam Selesai | Durasi (menit) | Executor | Status (`PASS`/`FAIL`/`BLOCKED`) | Evidence |
|---|---|---|---:|---|---|---|
| Tahap 1 - Pre-Flight | | | | | | |
| Tahap 2 - Frontend + Checkout | | | | | | |
| Tahap 3 - Scheduler Live | | | | | | |
| Tahap 4 - Integritas Data Cepat | | | | | | |
| Tahap 5 - Gate GO/NO-GO | | | | | | |

### 3) Command API Siap Eksekusi

```powershell
# Tahap 1: Pre-flight
Invoke-GasAction -Action "ensure_schema" -Data @{ repair = $true }
Invoke-GasAction -Action "get_paylater_limit_scheduler" -Data @{}
Invoke-GasAction -Action "get_paylater_due_notification_scheduler" -Data @{}

# Tahap 3: Scheduler paylater limit
Invoke-GasAction -Action "install_paylater_limit_scheduler" -Data @{ mode = "hourly" }
Invoke-GasAction -Action "get_paylater_limit_scheduler" -Data @{}
Invoke-GasAction -Action "process_paylater_limit_from_orders" -Data @{ dry_run = $true; actor = "smoke_run_sheet" }
Invoke-GasAction -Action "remove_paylater_limit_scheduler" -Data @{}

# Tahap 3: Scheduler due notification
Invoke-GasAction -Action "install_paylater_due_notification_scheduler" -Data @{ mode = "daily"; hour = 9 }
Invoke-GasAction -Action "get_paylater_due_notification_scheduler" -Data @{}
Invoke-GasAction -Action "run_paylater_due_notifications" -Data @{ force = $true; actor = "smoke_run_sheet" }
Invoke-GasAction -Action "remove_paylater_due_notification_scheduler" -Data @{}

# Tahap 3-4: Monitoring & rekonsiliasi
Invoke-GasAction -Action "run_referral_reconciliation_audit" -Data @{}
Invoke-GasAction -Action "run_paylater_postmortem_two_weeks" -Data @{ window_days = 14 }
Invoke-GasAction -Action "get_paylater_postmortem_logs" -Data @{ limit = 5 }
```

### 4) Log Hasil API per Langkah

| No | Action | Jam Eksekusi | Response Ringkas | Status | Evidence (raw JSON/screenshot) |
|---|---|---|---|---|---|
| 1 | `ensure_schema` | | | | |
| 2 | `get_paylater_limit_scheduler` | | | | |
| 3 | `get_paylater_due_notification_scheduler` | | | | |
| 4 | `install_paylater_limit_scheduler` | | | | |
| 5 | `process_paylater_limit_from_orders (dry_run)` | | | | |
| 6 | `remove_paylater_limit_scheduler` | | | | |
| 7 | `install_paylater_due_notification_scheduler` | | | | |
| 8 | `run_paylater_due_notifications` | | | | |
| 9 | `remove_paylater_due_notification_scheduler` | | | | |
| 10 | `run_referral_reconciliation_audit` | | | | |
| 11 | `run_paylater_postmortem_two_weeks` | | | | |
| 12 | `get_paylater_postmortem_logs` | | | | |

### 5) Template Catatan Blocker Cepat

| Waktu | Tahap | Isu | Dampak | Keputusan Sementara | PIC | ETA Fix |
|---|---|---|---|---|---|---|
| | | | | | | |

### 6) Operator Mode (Contoh Terisi - Dummy)

Catatan:
- Semua data di bawah ini **dummy** untuk contoh format.
- Saat eksekusi nyata, tim cukup overwrite nilai jam, status, dan evidence.

#### 6.1 Contoh Timeline Terisi

| Tahap | Jam Mulai | Jam Selesai | Durasi (menit) | Executor | Status | Evidence |
|---|---|---|---:|---|---|---|
| Tahap 1 - Pre-Flight | 09:00 | 09:14 | 14 | Rido | PASS | `logs/preflight-2026-02-13.json` |
| Tahap 2 - Frontend + Checkout | 09:15 | 09:48 | 33 | Rido | PASS | `screenshots/fe-co-2026-02-13/` |
| Tahap 3 - Scheduler Live | 09:49 | 10:11 | 22 | Rido | PASS | `logs/scheduler-2026-02-13.json` |
| Tahap 4 - Integritas Data Cepat | 10:12 | 10:20 | 8 | Rido | PASS | `logs/reconcile-2026-02-13.json` |
| Tahap 5 - Gate GO/NO-GO | 10:21 | 10:27 | 6 | Rido | PASS | `reports/go-no-go-2026-02-13.md` |

#### 6.2 Contoh Log API Terisi

| No | Action | Jam Eksekusi | Response Ringkas (Dummy) | Status | Evidence |
|---|---|---|---|---|---|
| 1 | `ensure_schema` | 09:02 | `success:true, repaired:[]` | PASS | `logs/preflight-2026-02-13.json#ensure_schema` |
| 2 | `get_paylater_limit_scheduler` | 09:03 | `success:true, active:false` | PASS | `logs/preflight-2026-02-13.json#get_limit_sched_before` |
| 3 | `get_paylater_due_notification_scheduler` | 09:03 | `success:true, active:false` | PASS | `logs/preflight-2026-02-13.json#get_due_sched_before` |
| 4 | `install_paylater_limit_scheduler` | 09:51 | `success:true, mode:hourly` | PASS | `logs/scheduler-2026-02-13.json#install_limit` |
| 5 | `process_paylater_limit_from_orders (dry_run)` | 09:54 | `success:true, scanned:12, eligible:2, failed:0` | PASS | `logs/scheduler-2026-02-13.json#dryrun_limit` |
| 6 | `remove_paylater_limit_scheduler` | 09:56 | `success:true, removed:1` | PASS | `logs/scheduler-2026-02-13.json#remove_limit` |
| 7 | `install_paylater_due_notification_scheduler` | 10:00 | `success:true, mode:daily, hour:9` | PASS | `logs/scheduler-2026-02-13.json#install_due` |
| 8 | `run_paylater_due_notifications` | 10:03 | `success:true, matched:3, sent:2, failed:0` | PASS | `logs/scheduler-2026-02-13.json#run_due` |
| 9 | `remove_paylater_due_notification_scheduler` | 10:04 | `success:true, removed:1` | PASS | `logs/scheduler-2026-02-13.json#remove_due` |
| 10 | `run_referral_reconciliation_audit` | 10:13 | `success:true, status:ok, mismatch_count:0` | PASS | `logs/reconcile-2026-02-13.json#audit` |
| 11 | `run_paylater_postmortem_two_weeks` | 10:15 | `success:true, metrics.default_rate:0.02` | PASS | `logs/reconcile-2026-02-13.json#postmortem` |
| 12 | `get_paylater_postmortem_logs` | 10:16 | `success:true, count:5` | PASS | `logs/reconcile-2026-02-13.json#get_postmortem_logs` |

#### 6.3 Contoh Keputusan Akhir (Dummy)

| Gate | Nilai (Dummy) |
|---|---|
| Keputusan | `GO` |
| Alasan | Semua tahapan kritikal PASS, tidak ada blocker `High` |
| Follow-up | Lanjut monitor 24 jam pertama pasca rilis |

### 7) Operator Mode - FAIL Case (Contoh NO-GO - Dummy)

Catatan:
- Semua data di bawah ini **dummy** untuk contoh saat eksekusi gagal.
- Tujuannya agar format dokumentasi saat insiden tetap konsisten dan cepat.

#### 7.1 Contoh Timeline Terisi (Ada Blocker)

| Tahap | Jam Mulai | Jam Selesai | Durasi (menit) | Executor | Status | Evidence |
|---|---|---|---:|---|---|---|
| Tahap 1 - Pre-Flight | 09:00 | 09:13 | 13 | Rido | PASS | `logs/preflight-2026-02-13-failcase.json` |
| Tahap 2 - Frontend + Checkout | 09:14 | 09:46 | 32 | Rido | PASS | `screenshots/fe-co-2026-02-13-failcase/` |
| Tahap 3 - Scheduler Live | 09:47 | 10:20 | 33 | Rido | FAIL | `logs/scheduler-2026-02-13-failcase.json` |
| Tahap 4 - Integritas Data Cepat | 10:21 | 10:31 | 10 | Rido | BLOCKED | `logs/reconcile-2026-02-13-failcase.json` |
| Tahap 5 - Gate GO/NO-GO | 10:32 | 10:40 | 8 | Rido | FAIL | `reports/go-no-go-2026-02-13-failcase.md` |

#### 7.2 Contoh Log API Terisi (Ada Failure)

| No | Action | Jam Eksekusi | Response Ringkas (Dummy) | Status | Evidence |
|---|---|---|---|---|---|
| 1 | `ensure_schema` | 09:02 | `success:true, repaired:[]` | PASS | `logs/preflight-2026-02-13-failcase.json#ensure_schema` |
| 2 | `install_paylater_limit_scheduler` | 09:50 | `success:true, mode:hourly` | PASS | `logs/scheduler-2026-02-13-failcase.json#install_limit` |
| 3 | `process_paylater_limit_from_orders (dry_run)` | 09:53 | `success:true, scanned:14, eligible:3, failed:0` | PASS | `logs/scheduler-2026-02-13-failcase.json#dryrun_limit` |
| 4 | `install_paylater_due_notification_scheduler` | 09:58 | `success:true, mode:daily, hour:9` | PASS | `logs/scheduler-2026-02-13-failcase.json#install_due` |
| 5 | `run_paylater_due_notifications` | 10:01 | `success:true, matched:4, sent:1, failed:3` | FAIL | `logs/scheduler-2026-02-13-failcase.json#run_due` |
| 6 | `run_referral_reconciliation_audit` | 10:24 | `success:true, status:warning, mismatch_count:2` | FAIL | `logs/reconcile-2026-02-13-failcase.json#audit` |
| 7 | `run_paylater_postmortem_two_weeks` | 10:26 | `success:true, default_rate_alert.alerted:false, reason:no_channel` | FAIL | `logs/reconcile-2026-02-13-failcase.json#postmortem` |

#### 7.3 Contoh Detail Blocker (Dummy)

| Waktu | Tahap | Isu | Dampak | Keputusan Sementara | PIC | ETA Fix |
|---|---|---|---|---|---|---|
| 10:03 | Scheduler Live | `run_paylater_due_notifications` gagal kirim mayoritas notifikasi (`failed:3`) | Risiko reminder tagihan tidak terkirim | Freeze deploy, investigasi channel webhook/email | Ops Eng | 4 jam |
| 10:25 | Integritas Data | Audit referral `status:warning` dengan `mismatch_count:2` | Potensi mismatch points | Blok release sampai mismatch terverifikasi | Backend Eng | 1 hari |
| 10:27 | Monitoring | Postmortem alert channel kosong (`reason:no_channel`) | Insiden default rate bisa lolos tanpa alert | Wajib isi channel alert sebelum release | DevOps | 2 jam |

#### 7.4 Contoh Keputusan Akhir (NO-GO - Dummy)

| Gate | Nilai (Dummy) |
|---|---|
| Keputusan | `NO-GO` |
| Alasan | Ada blocker `High` di scheduler notifikasi + mismatch data audit belum closed |
| Tindak lanjut wajib | 1) Perbaiki channel notifikasi, 2) Investigasi mismatch, 3) Re-run Tahap 3-4 |
| Rencana re-test | Re-test parsial hari yang sama pukul 15:00 |

### 8) Eksekusi Aktual Tahap 1-3 (2026-02-14)

Sumber bukti mentah:
- `docs/run_sheet_stage1_3_2026-02-14.json`

#### 8.1 Metadata Eksekusi Aktual

| Field | Value |
|---|---|
| Tanggal/Jam run | 2026-02-14 08:08 (SE Asia Standard Time) |
| Executor | Codex CLI |
| Scope | Tahap 1-3 run sheet |
| Endpoint | `https://script.google.com/macros/s/AKfycbwDmh_cc-J9c0cuzcSThFQBdiZ7lpy3oUjDENZhHW-4UszuKwPB20g6OeRccVsgvp79hw/exec` |
| `ADMIN_TOKEN` di shell | Tidak tersedia (`admin_token_present=false`) |

#### 8.2 Rekap Hasil Aktual

| Area | PASS | FAIL | Catatan |
|---|---:|---:|---|
| Tahap 1 - Pre-Flight | 1 | 4 | Aksi admin/sensitive gagal `Unauthorized` |
| Tahap 2 - Safe API Proxy | 3 | 1 | `invalid_checkout_create_order` mengembalikan `INVALID_PAYLOAD` (validasi backend aktif) |
| Tahap 3 - Scheduler Live | 0 | 11 | Semua action scheduler/admin gagal `Unauthorized` |
| **TOTAL** | **4** | **16** | Dari 20 langkah API yang dieksekusi |

#### 8.3 Timeline Tahap 1-3 (Aktual)

| Tahap | Jam Mulai | Jam Selesai | Durasi | Status | Evidence |
|---|---|---|---:|---|---|
| Tahap 1 - Pre-Flight | 08:07:54 | 08:08:01 | 7 menit | FAIL | `docs/run_sheet_stage1_3_2026-02-14.json` |
| Tahap 2 - Frontend+Checkout (Safe API Proxy) | 08:08:04 | 08:08:12 | 8 menit | PARTIAL | `docs/run_sheet_stage1_3_2026-02-14.json` |
| Tahap 3 - Scheduler Live | 08:08:13 | 08:08:32 | 19 menit | FAIL | `docs/run_sheet_stage1_3_2026-02-14.json` |

#### 8.4 Temuan Kritis Aktual

| Waktu | Tahap | Temuan | Dampak | Status |
|---|---|---|---|---|
| 08:07:56 | Tahap 1 | `settings_sheet_read` => `Unauthorized` | Tidak bisa verifikasi settings sensitif | FAIL |
| 08:07:58 | Tahap 1 | `ensure_schema` => `Unauthorized` | Tidak bisa validasi schema live | FAIL |
| 08:08:13-08:08:32 | Tahap 3 | Semua action scheduler (`install/get/run/remove`) => `Unauthorized` | Verifikasi operasional scheduler live belum bisa dilakukan | FAIL |
| 08:08:12 | Tahap 2 | `create orders` invalid (`qty=0,total=0`) ditolak `INVALID_PAYLOAD` | Validasi checkout backend terkonfirmasi | PASS (kontrol validasi) |

#### 8.5 Keputusan Sementara Aktual

| Gate | Status |
|---|---|
| Keputusan Tahap 1-3 | `NO-GO` |
| Alasan utama | Akses admin live belum valid (`Unauthorized`) sehingga verifikasi kritikal scheduler/operasional belum bisa ditutup |
| Tindak lanjut wajib | Set `ADMIN_TOKEN` valid lalu re-run Tahap 1 dan Tahap 3 |
| Catatan | Tahap 2 manual UI end-to-end tetap wajib dieksekusi di browser sesuai runbook |

#### 8.6 Re-Run Tahap 1-3 Dengan Token (2026-02-14)

Sumber bukti:
- `docs/run_sheet_stage1_3_2026-02-14_token_provided.json`
- `docs/run_sheet_stage1_3_2026-02-14_token_provided_v2.json`

Ringkasan hasil re-run final (v2):

| Area | PASS | FAIL | Catatan |
|---|---:|---:|---|
| Tahap 1 - Pre-Flight | 3 | 2 | `public_paylater_config`, `settings_sheet_read`, `ensure_schema` sukses |
| Tahap 2 - Safe API Proxy | 4 | 0 | Read API sukses, validasi checkout invalid terkonfirmasi |
| Tahap 3 - Scheduler Live | 5 | 6 | Job non-trigger berjalan, operasi trigger install/get/remove gagal izin |
| **TOTAL** | **12** | **8** | Dari 20 langkah API |

Blocker utama setelah token valid:

| Kategori | Temuan | Dampak |
|---|---|---|
| OAuth scope deployment GAS | Error `ScriptApp.getProjectTriggers` (butuh scope `script.scriptapp`) | Verifikasi install/get/remove scheduler belum bisa ditutup |
| Operasional scheduler | Karena trigger tidak bisa dipasang/dibaca, validasi jadwal nyata (hourly/daily) belum final | Checklist scheduler live masih partial |

Status sementara setelah re-run token:

| Gate | Status |
|---|---|
| Keputusan Tahap 1-3 | `NO-GO (partial)` |
| Alasan | Masih ada blocker izin ScriptApp untuk operasi trigger scheduler |
| Tindak lanjut | Re-authorize/redeploy GAS dengan scope trigger, lalu re-run action scheduler install/get/remove |

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

## Status Cek Otomatis (2026-02-13) - Run Lokal Terbaru
- [x] `npm test` lulus (`lint-basic`, `check-tailwind-up-to-date`, `check-tailwind-not-manual`).
- [x] `npm run -s test:paylater` lulus (`PayLater logic tests passed.`).
- [x] `npm run -s test:paylater:integration` lulus (`PayLater GAS integration + idempotency tests passed.`).
- [x] `npm run -s test:gas:auth-referral-security` lulus (`GAS auth/referral/reward/security tests passed.`).
- [x] `assets/js/akun.js` tidak lagi menggunakan query `?sheet=` untuk flow akun (`rg -n "\\?sheet=" assets/js/akun.js` => tidak ada match).
- [x] Endpoint strict-public akun terpasang di frontend (`public_user_profile`, `public_user_points`, `public_user_orders`, `public_paylater_*`, `public_claim_history`, `public_rewards_catalog`, `public_update_profile`).
- [x] Guard backend untuk endpoint public baru tersedia di GAS (`PUBLIC_POST_RULES.public_update_profile`, `handlePublicClaimHistory`, `handlePublicRewardsCatalog`, `handlePublicUpdateProfile`).
- [ ] Verifikasi manual/E2E lintas environment masih wajib untuk item checklist selain yang sudah terbukti otomatis di atas.

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
- [x] PayLater sisi backend (invoice create/pay/penalty/freeze-lock/default) berjalan dan idempotent.
- [x] Security hardening aktif (session guard, whitelist action public, rate limit, no direct sheet exposure di flow user).
- [ ] Scheduler/monitoring operasional (due notification, limit processor, postmortem, alert) berjalan tanpa error kritikal.

## 1. Persiapan Environment
- [ ] Pastikan `SPREADSHEET_ID` mengarah ke sheet produksi/staging yang benar.
- [x] Pastikan semua sheet wajib ada dan header valid (`users`, `orders`, `user_points`, `claims`, `referrals`, `settings`, `credit_accounts`, `credit_invoices`, `credit_ledger`).
- [x] Jalankan `ensure_schema` dan pastikan tidak ada error.
- [ ] Verifikasi konfigurasi penting pada `settings`:
  - [x] `paylater_enabled`, `paylater_pilot_enabled`
  - [x] `referral_enabled`
  - [x] `public_create_require_hmac` (jika dipakai)
  - [ ] parameter rate-limit dan notifikasi

## 2. Auth & Session (Register/Login)
- [x] Register user baru berhasil dan data masuk ke sheet `users`.
- [x] Register dengan nomor yang sama ditolak (`DUPLICATE_PHONE`).
- [x] Login valid menghasilkan `session_token`.
- [x] Login salah PIN ditolak.
- [x] Login untuk akun nonaktif ditolak.
- [x] Endpoint publik berbasis session (`public_user_profile`, `public_user_points`, `public_user_orders`) gagal jika token invalid.
- [x] Token session lama (expired) tidak bisa dipakai.

### Bukti Verifikasi Auth (2026-02-13)
- `rg -n "\\?sheet=" assets/js/akun.js` => tidak ada match (flow akun source sudah tanpa query `sheet=`).
- `assets/js/akun.js` sudah pakai:
  - `action: 'public_update_profile'` untuk edit profil/PIN.
  - `akunApiPost({ action: 'create', sheet: 'users', ... })` untuk register public.
- `docs/gas_v62_referral_hardening.gs` sudah expose guard public untuk:
  - `PUBLIC_POST_RULES.public_update_profile`
  - `doPost` handler `public_update_profile`
  - helper sesi `resolvePublicSessionPhoneFromData(...)`
- Script verifikasi otomatis backend: `scripts/test-gas-auth-referral-security.js` (register duplicate, login valid/invalid/inactive, guard session invalid, simulasi session expiry cache).
- Catatan: smoke test UI manual register/login/session-expiry lintas browser/device tetap pending.

## 3. Profil User & Data Dasar
- [x] `public_user_profile` mengembalikan data user sesuai nomor login.
- [x] Kode referral otomatis terbentuk jika kosong.
- [x] `public_user_points` sinkron dengan `user_points`.
- [x] `public_user_orders` hanya menampilkan order milik user login.

## 4. Katalog, Cart, dan Checkout
- [x] Produk/kategori/banner terbaca normal dari endpoint/listing UI.
- [ ] Harga, stok, qty, dan subtotal di cart sesuai perhitungan.
- [ ] Checkout membuat order dengan field penting terisi (`id/order_id`, `phone`, `status`, `total`, `qty`).
- [x] Order invalid (qty/total <= 0) ditolak.

## 5. Order Lifecycle
- [ ] Update status order berjalan normal via admin/API.
- [ ] Transisi status final non-paylater (mis. `paid`, `selesai`) tidak merusak data order.
- [ ] Transisi status final paylater limit (mis. `lunas`, `diterima`) memicu update limit jika relevan.
- [ ] Status refund/cancel memicu reversal limit jika sebelumnya pernah increase.

## 6. Referral Flow (Attach -> Evaluate -> Reverse)
- [x] Attach referral valid berhasil untuk user baru.
- [x] Self referral ditolak.
- [x] Ref code tidak valid ditolak.
- [x] Attach dua kali untuk referee yang sama ditolak.
- [x] Evaluate referral hanya sukses saat status order eligible dan min order terpenuhi.
- [x] Idempotency `trigger_order_id` berjalan (request ulang tidak double reward).
- [x] Fraud review/block bekerja sesuai rule dan log masuk `fraud_risk_logs`.
- [x] Reversal referral saat order cancel berjalan dan idempotent.

### Bukti Verifikasi Referral (2026-02-13)
- Endpoint public referral di frontend tetap pakai action ketat:
  - `public_referral_history`, `public_referral_config` (lihat `assets/js/akun.js`).
- Guard backend referral masih aktif (cek `docs/gas_v62_referral_hardening.gs`):
  - idempotency order referral (`findReferralByTriggerOrderId`)
  - fraud engine (`evaluateReferralFraudRisk`, `logFraudRiskEvent`)
  - reversal lifecycle (`handleReverseReferralByOrder`)
- Script verifikasi otomatis backend: `scripts/test-gas-auth-referral-security.js` (attach valid, self/invalid/duplicate reject, evaluate eligible + idempotency, reverse + idempotency, fraud blocked + log).
- Catatan: uji lintas environment produksi/staging masih diperlukan untuk validasi data nyata.

## 7. Reward Points & Claim
- [ ] Poin loyalty dari order diproses sekali per order (`point_processed`).
- [x] Claim reward valid memotong poin user dan mengurangi stok reward.
- [x] Claim duplikat dengan `request_id` sama tidak memotong poin dua kali.
- [x] Klaim saat poin tidak cukup/stok habis ditolak.
- [x] Ledger `point_transactions` terbentuk dan konsisten.

### Bukti Verifikasi Reward (2026-02-13)
- Script verifikasi otomatis backend: `scripts/test-gas-auth-referral-security.js`.
- Cakupan: claim valid (potong poin + stok), idempotency `request_id`, reject saat poin tidak cukup/stock habis, dan ledger `point_transactions` untuk `reward_claim`.

## 8. PayLater Core
- [x] `credit_account_upsert` bisa create/update akun kredit.
- [ ] Aktivasi akun kredit memerlukan verifikasi + tanpa invoice outstanding.
- [ ] `credit_invoice_create` gagal jika limit tidak cukup atau akun tidak aktif.
- [x] Pembuatan invoice menghitung fee dan `total_due` dengan benar.
- [ ] Pembayaran parsial/full update `paid_amount`, `status`, dan release limit saat lunas.
- [x] Apply penalty berjalan sesuai overdue days dan cap.
- [ ] Auto freeze/lock/defaulted berjalan sesuai konfigurasi hari overdue.
- [x] `public_paylater_summary`, `public_paylater_invoices`, `public_paylater_invoice_detail` hanya akses milik user login.

### Bukti Verifikasi PayLater (2026-02-13)
- Test logic lulus: `npm run test:paylater` => `PayLater logic tests passed.`
- Test integrasi lulus: `npm run test:paylater:integration` => `PayLater GAS integration + idempotency tests passed.`
- Test akses endpoint public paylater lulus: `npm run test:gas:auth-referral-security` (session guard + ownership invoice detail).
- Endpoint public akun untuk paylater tetap aktif di frontend:
  - `public_paylater_summary`
  - `public_paylater_invoices`
  - `public_paylater_invoice_detail`
- Catatan: item checklist PayLater di section ini tetap pending sampai smoke test data nyata selesai.

## 9. Scheduler & Background Jobs
- [ ] Scheduler paylater limit terpasang dan handler trigger benar.
- [ ] Scheduler due notification terpasang sesuai mode (daily/hourly).
- [x] Trigger run manual (`run_paylater_due_notifications`, `process_paylater_limit_from_orders`) sukses.
- [x] Postmortem 2 minggu menghasilkan log di `paylater_postmortem_logs`.
- [ ] Alert cooldown bekerja (tidak spam email/webhook).

## 10. Admin API Authorization & Security
- [x] Endpoint non-publik menolak request tanpa `ADMIN_TOKEN` valid.
- [x] Public action whitelist benar-benar terbatas (`attach_referral`, `claim_reward`, `create` sheet tertentu).
- [x] Role-based access (jika aktif) memblokir role yang tidak cukup.
- [x] HMAC public create (jika aktif) menolak signature invalid/expired.
- [x] Rate-limit login/register/attach/claim aktif.

### Bukti Verifikasi Security (2026-02-13)
- Script verifikasi otomatis backend: `scripts/test-gas-auth-referral-security.js`.
- Cakupan: public whitelist, guard non-public (`ADMIN_TOKEN_NOT_CONFIGURED`), role guard aktif, valid/invalid/expired HMAC signature, serta rate-limit login/register/attach/claim.

## 11. Integritas Data & Rekonsiliasi
- [x] Jalankan `run_referral_reconciliation_audit` (2026-02-14: status `warning`, `mismatch_count=2`).
- [ ] Investigasi mismatch rekonsiliasi sampai clear/terdokumentasi.
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
