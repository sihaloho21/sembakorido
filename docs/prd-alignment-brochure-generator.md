# Catatan Status — Generator Brosur

**Status:** UI generator brosur admin dinonaktifkan pada 17 Oktober 2026.

Halaman `/admin-brosur.html` dan controller khusus `assets/js/brosur.js` telah dihapus dari frontend. Tautan ke fitur tersebut juga dihapus dari dashboard admin dan toolbar Kelola Produk. URL lama seharusnya mengembalikan HTTP 404 setelah deployment.

Penghapusan ini hanya mencakup UI admin generator brosur. Kode Google Apps Script, endpoint/backend dan skema `promo_flyers`, modul API bersama (`assets/js/gas-actions.js` dan `assets/js/api-service.js`), serta katalog publik `promo_katalog.html` tetap dipertahankan.

Detail implementasi terdahulu pada dokumen ini telah dipensiunkan karena mengacu pada UI dan controller yang tidak lagi ada. Riwayat perubahan lama masih dapat ditinjau melalui Git.
