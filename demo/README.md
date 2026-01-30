# Demo: Flipbook (StPageFlip via CDN)

Isi:
- `flipbook-demo.html` — halaman demo flipbook yang menggunakan distribusi browser dari `page-flip` (CDN).
- `assets/demo-pages/page1.jpg`, `page2.jpg`, `page3.jpg` — tempatkan tiga gambar contoh di path tersebut.

Cara menjalankan (lokal):
1. Pastikan file demo dan gambar ada di repo:
   - `demo/flipbook-demo.html`
   - `assets/demo-pages/page1.jpg`
   - `assets/demo-pages/page2.jpg`
   - `assets/demo-pages/page3.jpg`

2. Buka langsung `demo/flipbook-demo.html` di browser (double-click file atau `file://`), atau jalankan simple HTTP server dari root repo:
   - Dengan Python 3:
     ```
     python -m http.server 8000
     ```
     lalu buka http://localhost:8000/demo/flipbook-demo.html

Kontrol:
- Tombol "Sebelumnya" / "Berikut" untuk navigasi.
- Keyboard: panah kiri/kanan.
- Sentuh: swipe (pada fallback scroll-snap) atau StPageFlip handling swipe jika tersedia.

Catatan teknis:
- Demo menggunakan CDN: `https://unpkg.com/page-flip/dist/page-flip.browser.min.js` dan `https://unpkg.com/page-flip/dist/page-flip.min.css`. Ganti URL jika ingin menggunakan dist dari StPageFlip resmi.
- Demo mencoba menginisialisasi PageFlip; jika gagal, akan otomatis turun ke fallback scroll-snap agar tetap bisa melihat halaman.
- Hormon prefers-reduced-motion diaktifkan via CSS.
- Periksa lisensi `page-flip` / `StPageFlip` sebelum penggunaan produksi.
