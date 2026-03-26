# Rancangan Fitur Blog GoSembako

Dokumen ini berisi rancangan struktur data dan komponen untuk fitur Blog pada platform GoSembako.

## 1. Struktur Data (Google Sheets)

Fitur blog akan membutuhkan dua sheet baru di Google Sheets yang berfungsi sebagai database:

### Sheet: `blog_posts`
Menyimpan data artikel blog.

| Nama Kolom | Tipe Data | Deskripsi |
|---|---|---|
| `id` | String | ID unik artikel (UUID) |
| `title` | String | Judul artikel |
| `slug` | String | URL friendly dari judul (contoh: `tips-hemat-sembako`) |
| `content` | Text | Isi lengkap artikel (mendukung HTML dasar) |
| `excerpt` | String | Ringkasan singkat artikel untuk halaman daftar |
| `author` | String | Nama penulis artikel |
| `published_at` | String | Tanggal publikasi (Format: YYYY-MM-DD HH:mm:ss) |
| `status` | String | Status artikel (`published` atau `draft`) |
| `image_url` | String | URL gambar thumbnail/cover artikel |
| `categories` | String | Kategori artikel (dipisahkan koma jika lebih dari satu) |
| `tags` | String | Tag artikel (dipisahkan koma) |
| `meta_description` | String | Deskripsi meta untuk keperluan SEO |
| `created_at` | String | Waktu pembuatan record |
| `updated_at` | String | Waktu pembaruan record terakhir |

### Sheet: `blog_comments`
Menyimpan data komentar pada artikel.

| Nama Kolom | Tipe Data | Deskripsi |
|---|---|---|
| `id` | String | ID unik komentar (UUID) |
| `post_id` | String | ID artikel yang dikomentari (relasi ke `blog_posts.id`) |
| `user_name` | String | Nama pengunjung yang berkomentar |
| `content` | Text | Isi komentar |
| `status` | String | Status komentar (`approved`, `pending`, `rejected`) |
| `created_at` | String | Waktu komentar dibuat |

## 2. Komponen Frontend (Public)

### `blog.html`
Halaman utama blog yang dapat diakses oleh publik.
- **Fitur:**
  - Menampilkan daftar artikel dengan status `published`.
  - Grid layout modern dengan gambar thumbnail, judul, excerpt, dan tanggal.
  - Fitur pencarian artikel berdasarkan judul atau konten.
  - Filter berdasarkan kategori atau tag.
  - Pagination atau Load More (opsional).

### `blog-detail.html`
Halaman untuk membaca isi lengkap sebuah artikel.
- **Fitur:**
  - Menampilkan judul, penulis, tanggal, gambar cover, dan isi konten.
  - Meta tag dinamis untuk SEO (Title, Description, Open Graph).
  - Menampilkan daftar komentar yang berstatus `approved`.
  - Form untuk mengirim komentar baru (default status `pending` atau langsung `approved` tergantung kebijakan).

### `assets/js/blog.js`
Script untuk menangani logika di halaman publik.
- Mengambil data dari API (`CONFIG.getMainApiUrl()`).
- Merender daftar artikel dan detail artikel.
- Menangani pencarian dan filter.
- Menangani pengiriman komentar.

## 3. Komponen Backend (Admin)

### `admin/blog-manager.html`
Halaman dashboard admin untuk mengelola artikel.
- **Fitur:**
  - Tabel daftar semua artikel (termasuk draft).
  - Tombol "Tambah Artikel Baru".
  - Form modal/halaman terpisah untuk Create/Edit artikel (Input: Judul, Konten, Gambar, Kategori, SEO, dll).
  - Fitur Hapus artikel.
  - Manajemen komentar (Approve/Reject/Delete).

### `admin/js/blog-manager.js`
Script untuk menangani logika CRUD di halaman admin.
- Menggunakan `apiPost` dan `apiGet` dari `api-helper.js`.
- Memvalidasi input sebelum dikirim ke API.
- Menangani upload gambar (menggunakan URL eksternal atau ImageKit seperti yang sudah ada).

## 4. Integrasi API (Google Apps Script)

Karena backend menggunakan Google Apps Script, kita perlu memastikan bahwa sheet `blog_posts` dan `blog_comments` ditambahkan ke dalam `SHEET_WHITELIST` di file `.gs` (jika ada validasi whitelist).

Aksi API yang dibutuhkan:
- `get_blog_posts`: Mengambil daftar artikel (publik hanya `published`, admin semua).
- `get_blog_post`: Mengambil detail artikel berdasarkan ID atau Slug.
- `create_blog_post`: Menambah artikel baru (Admin only).
- `update_blog_post`: Mengubah artikel (Admin only).
- `delete_blog_post`: Menghapus artikel (Admin only).
- `get_blog_comments`: Mengambil komentar untuk suatu artikel.
- `create_blog_comment`: Menambah komentar baru (Public).
- `update_blog_comment_status`: Mengubah status komentar (Admin only).

## 5. Desain UI/UX
- Menggunakan Tailwind CSS yang sudah ada di proyek.
- Desain kartu artikel modern dengan efek hover (scale, shadow).
- Tipografi yang nyaman dibaca untuk halaman detail artikel.
- Responsif untuk tampilan mobile dan desktop.
