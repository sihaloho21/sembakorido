# Runbook Rotasi Credential — paketsembako.com

**Scope:** credential Google Apps Script/backend, admin API token, webhook secret, dan deployment secret.

> Jangan menempelkan token asli ke issue, commit, chat, screenshot, log, atau file repository.

## Status saat ini

- Repository dan Git history publik sudah dibersihkan dari artefak PII/token.
- `npm run test:sensitive-files` wajib lulus di lokal dan CI.
- Rotasi/revoke credential di layanan eksternal masih harus dilakukan oleh owner layanan.

## Prosedur rotasi

1. **Inventarisasi**
   - Identifikasi semua token yang pernah ada di repository, environment deployment, Google Apps Script, webhook, dan panel admin.
   - Catat hanya nama credential, owner, service, scope, dan tanggal; jangan catat nilainya.

2. **Revoke credential lama**
   - Revoke/delete token lama pada provider terkait.
   - Cabut deployment atau API key yang tidak lagi digunakan.
   - Periksa access log untuk penggunaan setelah waktu incident.

3. **Generate credential baru**
   - Buat token baru dengan scope minimum.
   - Pisahkan token read-only katalog dari token admin/write.
   - Set expiry/rotation date bila provider mendukung.

4. **Simpan secara aman**
   - Simpan pada secret manager atau environment variable deployment.
   - Jangan menaruh token pada `localStorage`, source JavaScript publik, CSV export, JSON run artifact, atau dokumentasi.
   - Pastikan nilai production tidak menjadi default di source.

5. **Validasi**
   - Uji endpoint read-only dengan credential baru.
   - Uji operasi admin dengan credential baru.
   - Pastikan token lama gagal.
   - Jalankan:

     ```bash
     npm ci
     npm run test:sensitive-files
     npm test
     ```

6. **Redaction dan monitoring**
   - Redact token, nomor telepon, email, dan ID pengguna dari log.
   - Periksa log CI, deployment, dan backend setelah smoke test.
   - Dokumentasikan tanggal rotasi berikutnya tanpa menulis secret.

## Acceptance criteria SEC-02

- Token lama sudah tidak valid.
- Credential baru hanya berada di secret manager/environment variable.
- Tidak ada credential aktif pada Git history publik.
- CI menolak file credential/PII yang dilarang.
- Log test dan deployment tidak membocorkan token atau PII.
- Access log sudah ditinjau oleh owner layanan.

## Bukti yang perlu dilampirkan owner layanan

- Provider dan nama credential yang dirotasi.
- Waktu revoke token lama.
- Waktu pembuatan token baru.
- Hasil uji token lama ditolak.
- Hasil smoke test token baru.
- Konfirmasi audit access log.

**Catatan:** bukti harus berisi metadata dan status, bukan nilai token.
