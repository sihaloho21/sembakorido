# Broadcast Promo Tersegmentasi (Implementasi Repo)

Dokumen ini menjelaskan paket implementasi yang sudah ditambahkan:

1. `sql/001_broadcast_promo_migration.sql`
2. `sql/002_broadcast_segment_queries.sql`
3. Job GAS:
   - `broadcast_promo_enqueue`
   - `broadcast_promo_send`
4. Runner Node:
   - `scripts/run-broadcast-promo-job.js`

## 1) SQL Artifacts

- Migration schema:
  - `sql/001_broadcast_promo_migration.sql`
- Query segment template:
  - `sql/002_broadcast_segment_queries.sql`

Catatan: stack aktif project saat ini berbasis Google Sheets + GAS. File SQL disediakan untuk jalur migrasi ke PostgreSQL/data warehouse.

## 2) Sheet Baru di GAS

`ensure_schema` akan membuat/menambah header untuk:

- `promo_campaigns`
- `promo_targets`
- `promo_send_logs`

## 3) Settings Key Baru (Sheet `settings`)

Isi key berikut agar fitur berjalan:

- `broadcast_promo_enabled` = `true|false`
- `broadcast_promo_whatsapp_webhook` = URL gateway WhatsApp
- `broadcast_promo_whatsapp_bearer_token` = token opsional
- `broadcast_promo_frequency_cap_7d` = default `2`
- `broadcast_promo_quiet_hour_start` = default `22`
- `broadcast_promo_quiet_hour_end` = default `7`
- `broadcast_promo_default_cooldown_hours` = default `72`
- `broadcast_promo_max_send_per_run` = default `100`
- `broadcast_promo_high_spender_threshold` = default `1000000`
- `broadcast_promo_default_cta_url` = default `https://paketsembako.com/`

## 4) Struktur Campaign (`promo_campaigns`)

Header utama yang dipakai job:

- `id`
- `code`
- `name`
- `status` (`scheduled|running`)
- `segment_code` (`dormant_30d|new_user_no_order_7d|high_spender_inactive_14d`)
- `template_text` (boleh pakai placeholder: `{{name}} {{voucher}} {{link}} {{discount_line}} {{min_order_line}}`)
- `voucher_prefix`
- `discount_text`
- `min_order_text`
- `cta_url`
- `start_at`
- `end_at`
- `cooldown_hours`
- `max_send_per_run`

## 5) Action GAS

### `broadcast_promo_enqueue`

Payload `data`:

```json
{
  "campaign_code": "FEB_DORMANT_01",
  "segment_code": "dormant_30d",
  "limit": 200,
  "dry_run": false,
  "force": false,
  "actor": "ops_scheduler"
}
```

Output:
- total kandidat segmen
- jumlah queued
- jumlah skipped (frequency cap/cooldown/duplicate)
- sample target

### `broadcast_promo_send`

Payload `data`:

```json
{
  "campaign_code": "FEB_DORMANT_01",
  "limit": 100,
  "dry_run": false,
  "ignore_quiet_hours": false
}
```

Output:
- jumlah attempted/sent/failed
- detail status per target

## 6) Runner Node

Script:
- `scripts/run-broadcast-promo-job.js`

NPM command:
- `npm run broadcast:enqueue -- --campaign FEB_DORMANT_01 --segment dormant_30d --limit 200`
- `npm run broadcast:send -- --campaign FEB_DORMANT_01 --limit 100`

Environment:

- `GAS_API_URL`
- `GAS_ADMIN_TOKEN`
- `GAS_ADMIN_ROLE` (opsional, default `manager`)

Contoh:

```bash
set GAS_API_URL=https://script.google.com/macros/s/DEPLOYMENT_ID/exec
set GAS_ADMIN_TOKEN=SECRET123
npm run broadcast:enqueue -- --campaign FEB_DORMANT_01 --segment dormant_30d --dry-run
npm run broadcast:send -- --campaign FEB_DORMANT_01 --dry-run
```

## 7) Segment Yang Sudah Diimplementasikan di GAS

- `dormant_30d`
  - Pernah order sukses, tapi 30 hari terakhir tidak ada order sukses.
- `new_user_no_order_7d`
  - User daftar <= 7 hari dan belum pernah order sukses.
- `high_spender_inactive_14d`
  - GMV sukses 90 hari >= threshold, namun 14 hari terakhir tidak order sukses.

Status order sukses yang dihitung:
- `paid`, `selesai`, `terima`, `diterima`.

## 8) Deploy Checklist (Siap Eksekusi)

Gunakan urutan ini supaya aman dari salah konfigurasi.

1. Pastikan backend terbaru sudah ter-deploy ke Apps Script web app.
2. Jalankan `ensure_schema` dengan mode repair.
3. Isi settings broadcast (tetap `broadcast_promo_enabled=false` dulu saat setup).
4. Isi minimal 1 campaign aktif di `promo_campaigns`.
5. Jalankan `enqueue` mode `dry_run`.
6. Jalankan `send` mode `dry_run`.
7. Jika hasil valid, aktifkan `broadcast_promo_enabled=true`.
8. Jalankan `enqueue` real, lalu `send` real.
9. Verifikasi hasil di sheet `promo_targets` dan `promo_send_logs`.
10. Jika ada issue, set `broadcast_promo_enabled=false` sebagai kill-switch.

## 9) Quick Commands (PowerShell)

Contoh helper request GAS:

```powershell
$GAS_URL = "https://script.google.com/macros/s/<deployment-id>/exec"
$ADMIN_TOKEN = "<ADMIN_TOKEN>"

function Invoke-GasAction {
  param(
    [Parameter(Mandatory = $true)][string]$Action,
    [hashtable]$Data = @{},
    [string]$Token = $ADMIN_TOKEN,
    [string]$AdminRole = "manager"
  )

  $body = @{
    token      = $Token
    admin_role = $AdminRole
    action     = $Action
    data       = $Data
  } | ConvertTo-Json -Depth 20

  Invoke-RestMethod -Method Post -Uri $GAS_URL -ContentType "application/json" -Body $body
}
```

Pre-flight:

```powershell
Invoke-GasAction -Action "ensure_schema" -Data @{ repair = $true } -AdminRole "superadmin"
```

Dry-run:

```powershell
Invoke-GasAction -Action "broadcast_promo_enqueue" -Data @{
  campaign_code = "BRC_DORMANT_20260216"
  segment_code  = "dormant_30d"
  limit         = 100
  dry_run       = $true
  actor         = "manual_dry_run"
}

Invoke-GasAction -Action "broadcast_promo_send" -Data @{
  campaign_code = "BRC_DORMANT_20260216"
  limit         = 50
  dry_run       = $true
}
```

Real-run:

```powershell
Invoke-GasAction -Action "broadcast_promo_enqueue" -Data @{
  campaign_code = "BRC_DORMANT_20260216"
  segment_code  = "dormant_30d"
  limit         = 500
  dry_run       = $false
  actor         = "scheduler_prod"
}

Invoke-GasAction -Action "broadcast_promo_send" -Data @{
  campaign_code = "BRC_DORMANT_20260216"
  limit         = 100
  dry_run       = $false
}
```

Alternatif via Node runner:

```bash
set GAS_API_URL=https://script.google.com/macros/s/<deployment-id>/exec
set GAS_ADMIN_TOKEN=<ADMIN_TOKEN>
set GAS_ADMIN_ROLE=manager

npm run broadcast:enqueue -- --campaign BRC_DORMANT_20260216 --segment dormant_30d --dry-run --limit 100
npm run broadcast:send -- --campaign BRC_DORMANT_20260216 --dry-run --limit 50
```

## 10) Contoh Baris `settings` (Siap Pakai)

Isi key berikut di sheet `settings`:

| key | value |
|---|---|
| `broadcast_promo_enabled` | `false` |
| `broadcast_promo_whatsapp_webhook` | `https://your-wa-gateway.example/send` |
| `broadcast_promo_whatsapp_bearer_token` | `REPLACE_WITH_TOKEN` |
| `broadcast_promo_frequency_cap_7d` | `2` |
| `broadcast_promo_quiet_hour_start` | `22` |
| `broadcast_promo_quiet_hour_end` | `7` |
| `broadcast_promo_default_cooldown_hours` | `72` |
| `broadcast_promo_max_send_per_run` | `100` |
| `broadcast_promo_high_spender_threshold` | `1000000` |
| `broadcast_promo_default_cta_url` | `https://paketsembako.com/` |

Catatan:
- Set `broadcast_promo_enabled=false` saat setup dan dry-run.
- Ubah ke `true` hanya setelah webhook/channel valid.

## 11) Contoh Baris `promo_campaigns` (Siap Pakai)

Header yang perlu terisi:

`id, code, name, status, segment_code, template_text, channel, voucher_prefix, discount_text, min_order_text, cta_url, start_at, end_at, cooldown_hours, max_send_per_run, created_at, updated_at`

Contoh row 1 (Dormant):

```text
PCM-20260216-001, BRC_DORMANT_20260216, Dormant Reactivation Feb 2026, running, dormant_30d, Halo {{name}}, kami kangen. Pakai voucher {{voucher}} untuk {{discount}}. {{min_order_line}}Klik: {{link}}, whatsapp, DOR26, Diskon Rp15.000, Min. belanja Rp100.000, https://paketsembako.com/, 2026-02-16T00:00:00.000Z, 2026-03-01T23:59:59.000Z, 72, 100, 2026-02-16T00:00:00.000Z, 2026-02-16T00:00:00.000Z
```

Contoh row 2 (New User):

```text
PCM-20260216-002, BRC_NEWUSER_20260216, New User First Order Feb 2026, scheduled, new_user_no_order_7d, Halo {{name}}, selamat datang. Gunakan voucher {{voucher}} untuk {{discount}}. {{min_order_line}}Belanja: {{link}}, whatsapp, NEW26, Diskon Rp10.000, Min. belanja Rp75.000, https://paketsembako.com/, 2026-02-16T00:00:00.000Z, 2026-03-01T23:59:59.000Z, 24, 150, 2026-02-16T00:00:00.000Z, 2026-02-16T00:00:00.000Z
```

Contoh row 3 (High Spender):

```text
PCM-20260216-003, BRC_HIGHSP_20260216, High Spender Winback Feb 2026, scheduled, high_spender_inactive_14d, Halo {{name}}, promo prioritas untuk kamu. Voucher {{voucher}} aktif untuk {{discount}}. {{min_order_line}}Akses cepat: {{link}}, whatsapp, VIP26, Diskon Rp25.000, Min. belanja Rp150.000, https://paketsembako.com/, 2026-02-16T00:00:00.000Z, 2026-03-01T23:59:59.000Z, 48, 80, 2026-02-16T00:00:00.000Z, 2026-02-16T00:00:00.000Z
```

## 12) Acceptance Checklist (GO/NO-GO)

Sebelum dinyatakan GO, pastikan:

1. `ensure_schema` sukses tanpa error.
2. `broadcast_promo_enqueue (dry_run)` mengembalikan kandidat > 0 (untuk segmen target).
3. `broadcast_promo_send (dry_run)` menghasilkan output payload tanpa error channel.
4. `broadcast_promo_send (real)` menulis log ke `promo_send_logs`.
5. `promo_targets` ter-update status (`sent/failed`) sesuai hasil gateway.
6. Tidak ada lonjakan `failed` yang mengindikasikan webhook/token salah.

