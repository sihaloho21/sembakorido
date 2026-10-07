# OPS-01 — Deploy dan Verifikasi Status Toko Live

Dokumen ini menyelesaikan bagian operasional OPS-01 setelah perubahan source backend-first pada commit `a45169b`.

## Tujuan

Status toko harus berasal dari backend `settings`, bukan hanya dari `localStorage`. Admin menulis key `store_closed`, sedangkan pelanggan membaca endpoint read-only:

```text
?action=public_store_status
```

Response yang diharapkan:

```json
{
  "success": true,
  "store_closed": false
}
```

## A. Persiapan deployment GAS v63

1. Buka project Google Apps Script yang menjadi `MAIN_API`/`ADMIN_API` produksi.
2. Backup deployment aktif dan catat deployment ID, URL Web App, spreadsheet target, serta waktu backup.
3. Salin isi `docs/gas_v63_blog_support.gs` dari repository ke project Apps Script produksi. Pastikan tidak ada file source lama yang masih menjadi entrypoint `doGet`/`doPost` secara tidak sengaja.
4. Pastikan Script Properties dan spreadsheet target tetap sama. Jangan menaruh token di source code.
5. Pastikan sheet `settings` memiliki header:

   ```text
   key | value
   ```

6. Pastikan terdapat satu row untuk key `store_closed`. Nilai yang valid untuk tutup adalah `true`, `1`, `yes`, atau `ya`; selain itu dianggap buka.
7. Jalankan fungsi test/authorization yang diminta Apps Script menggunakan akun owner project.
8. Buat deployment baru melalui **Deploy → New deployment → Web app** dengan konfigurasi yang sama seperti deployment produksi. Catat versi dan URL deployment.
9. Setelah endpoint lolos smoke test, arahkan konfigurasi `MAIN_API`/`ADMIN_API` production ke URL deployment baru bila URL deployment berubah.

> Jangan menghapus deployment lama sebelum endpoint baru tervalidasi. Rollback dilakukan dengan mengembalikan deployment ID/versi sebelumnya.

## B. Smoke test read-only dari terminal

Gunakan URL Web App yang baru. Jangan menuliskan token dalam command atau output.

```bash
export GAS_WEB_APP_URL='https://script.google.com/macros/s/DEPLOYMENT_ID/exec'
curl -fsS --max-time 30 "$GAS_WEB_APP_URL?action=public_store_status"
```

Validasi JSON secara aman:

```bash
curl -fsS --max-time 30 "$GAS_WEB_APP_URL?action=public_store_status" \
  | python3 -c 'import json,sys; p=json.load(sys.stdin); assert p.get("success") is True; assert isinstance(p.get("store_closed"), bool); print("public_store_status=valid")'
```

Uji nilai buka dan tutup pada spreadsheet, tunggu propagasi singkat, kemudian ulangi request. Response harus berubah dari `false` ke `true` dan kembali lagi ke `false`.

## C. Verifikasi admin

1. Buka `/admin/` menggunakan sesi admin yang sah.
2. Pastikan status awal pada toggle sama dengan response `public_store_status`.
3. Ubah menjadi **TUTUP**.
4. Pastikan request admin berhasil dan row `store_closed` di sheet `settings` berubah menjadi `true`.
5. Reload halaman admin dan pastikan toggle tetap **TUTUP**.
6. Ubah kembali menjadi **BUKA** dan pastikan row berubah menjadi `false`.
7. Uji token admin yang sudah expired/invalid. Perubahan harus ditolak dan toggle tidak boleh menampilkan status seolah-olah tersimpan.

## D. Verifikasi pelanggan lintas sesi

Gunakan minimal dua browser atau satu browser desktop dan satu perangkat mobile.

| Skenario | Hasil yang diharapkan |
| --- | --- |
| Backend `store_closed=false` | Banner tutup tidak tampil; add-to-cart dapat digunakan |
| Backend `store_closed=true` | Banner/modal tutup tampil; pengguna mendapat pesan operasional |
| Browser baru/incognito | Status sama dengan backend, tanpa bergantung pada localStorage lama |
| Setelah reload | Status tetap sama dengan backend |
| Setelah cache dibersihkan | Status tetap sama dengan backend |
| Admin mengubah status | Sesi pelanggan berikutnya membaca nilai terbaru |
| API gagal sementara | Frontend memakai last-known value dan tidak crash; error tercatat di console/monitoring |

Untuk kondisi toko buka, lakukan read-only checkout sampai halaman ringkasan tanpa mengirim pembayaran. Untuk kondisi toko tutup, pastikan add-to-cart, detail produk, cart, dan checkout menampilkan pesan yang konsisten dan tidak mengirim order baru.

## E. Evidence yang harus disimpan

Simpan metadata berikut, bukan secret:

- commit frontend/GAS yang dideploy;
- deployment ID dan versi GAS;
- waktu deploy dalam timezone Asia/Jakarta;
- response `public_store_status` untuk kondisi buka dan tutup;
- screenshot admin toggle;
- screenshot browser pelanggan atau hasil test matrix;
- hasil smoke test checkout tanpa pembayaran;
- hasil rollback test bila dilakukan;
- nama tester dan perangkat/browser.

Jangan menyimpan token, nomor pelanggan, payload order nyata, atau data spreadsheet ke repository.

## F. Acceptance criteria OPS-01

OPS-01 dapat ditandai **Selesai** apabila seluruh kondisi berikut terpenuhi:

- Deployment GAS v63 aktif dan dapat diakses.
- `public_store_status` mengembalikan JSON valid.
- Admin dapat mengubah `store_closed` melalui backend.
- Browser berbeda membaca status yang sama.
- Status buka/tutup konsisten pada katalog, detail, cart, dan checkout.
- Token invalid tidak dapat mengubah status.
- Smoke test dicatat dengan commit, deployment version, waktu, dan hasil.
- Rollback ke deployment sebelumnya diketahui dan dapat dilakukan.
