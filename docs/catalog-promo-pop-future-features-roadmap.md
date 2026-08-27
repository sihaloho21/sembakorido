# Roadmap Fitur Lanjutan Catalog Promo POP

**Status:** Rancangan implementasi ke depan  
**Dokumen:** Catalog Promo POP Campaign Management System  
**Referensi visual:** `HMI-27Ags.pdf`  
**Tanggal:** 27 Agustus 2026  

## 1. Tujuan Dokumen

Dokumen ini menjadi acuan pengembangan fitur lanjutan yang terinspirasi dari brosur referensi `HMI-27Ags.pdf`. Fokus utamanya adalah meningkatkan kemampuan merchandising, fleksibilitas visual, konsistensi data promo, keterbacaan hasil cetak, dan kesiapan campaign untuk berbagai kanal distribusi.

Brosur referensi tidak akan disalin secara identik. Pola yang diadaptasi adalah prinsip visual dan bisnisnya, yaitu produk unggulan yang lebih dominan, harga promo yang mudah dipindai, badge yang kuat, mekanisme promo yang jelas, identitas campaign yang konsisten, serta informasi kanal pembelian yang mudah ditemukan.

## 2. Fitur yang Sudah Tersedia

Fitur berikut telah tersedia pada implementasi saat ini dan menjadi fondasi untuk roadmap selanjutnya:

| Fitur | Status | Catatan |
|---|---:|---|
| Featured Product Tile | Selesai | Produk unggulan dapat diberi penekanan visual pada layout yang mendukung. |
| Badge promo semantik | Selesai | Mendukung tipe seperti Best Seller, Harga Spesial, dan Stok Terbatas. |
| Promo mechanic dasar | Selesai | Mendukung label multi-buy dan quantity promo. |
| Retail Tile freeform | Selesai | Tile dan elemen internal dapat dipindahkan serta di-resize secara fleksibel. |
| Product-image background ON/OFF | Selesai | Background area gambar dapat dibuat transparan. |
| Preset visual campaign | Selesai | Tersedia beberapa preset gaya visual. |
| Theme dan CTA dasar | Selesai | Mendukung theme, hero layout, CTA, watermark, QR, dan footer dasar. |
| Grouping kategori dasar | Selesai | Produk dapat dikelompokkan berdasarkan kategori. |
| PNG, PDF, dan print preview | Selesai | Menggunakan renderer preview yang sama untuk menjaga parity. |
| Governance dan audit | Selesai | Version history, approval workflow, audit log, RBAC, dan price protection telah tersedia. |

## 3. Backlog Prioritas

### 3.1 Prioritas P0 — Fondasi Promo dan Kualitas Output

#### P0.1 Promo Rule Engine

**Tujuan:** Mengubah mekanisme promo dari sekadar teks menjadi struktur data yang konsisten dan dapat digunakan oleh admin preview, public preview, PNG, PDF, print preview, serta kanal pembelian.

Jenis promo yang direncanakan:

| Jenis promo | Contoh konfigurasi | Contoh label visual |
|---|---|---|
| Harga promo langsung | Harga normal `25000`, harga promo `19900` | `Harga Spesial` |
| Buy N | Quantity `2` | `Beli 2 pcs` |
| Multi-buy | Quantity `2`, harga paket `35000` | `2 lebih hemat` |
| Paket produk | Quantity `3`, nama paket `Paket Hemat Isi 3` | `Paket Hemat` |
| Minimum belanja | Minimum `100000` | `Min. belanja Rp100.000` |
| Batas pembelian | Maksimum `2` per user | `Maks. 2 per pelanggan` |
| Kanal khusus | Kanal `app`, `whatsapp`, atau `marketplace` | `Harga khusus aplikasi` |

**Rancangan data awal:**

```json
{
  "promo_mechanic": "multi_buy",
  "buy_quantity": 2,
  "promo_quantity": 2,
  "bundle_price": 35000,
  "minimum_spend": 0,
  "max_per_customer": 2,
  "channel_restriction": "all",
  "promo_label": "2 lebih hemat"
}
```

**Kriteria penerimaan:**

1. Admin dapat memilih jenis promo per produk.
2. Field yang tidak relevan disembunyikan atau dinonaktifkan secara otomatis.
3. Label promo dapat dibuat otomatis, tetapi masih dapat diubah secara manual.
4. Harga asli katalog tidak berubah.
5. Harga minimum tetap divalidasi pada seluruh jalur perubahan.
6. Konfigurasi tersimpan pada `items_json` dan dapat dipulihkan melalui version history.
7. Public preview dan seluruh format export menggunakan label serta harga yang sama.

#### P0.2 Panel Harga Promo Configurable

**Tujuan:** Meniru kekuatan visual panel harga pada brosur referensi dengan tetap mempertahankan kebebasan freeform.

Konfigurasi yang direncanakan:

| Konfigurasi | Contoh nilai |
|---|---|
| Warna panel harga | Kuning, oranye, merah, putih, custom HEX |
| Bentuk panel | Rectangle, ribbon, pill, burst, custom freeform |
| Ukuran nominal | Small, medium, large, custom |
| Ukuran teks `Rp` | Rasio terpisah dari nominal |
| Label unit | `/pcs`, `/kg`, `/liter`, custom |
| Posisi panel | Mengikuti sistem freeform |
| Tampilan harga coret | ON/OFF, warna, ketebalan garis |
| Tampilan saving | Persentase, nominal, keduanya, atau OFF |

**Kriteria penerimaan:**

1. Admin dapat mengatur panel harga per campaign.
2. Pengaturan per produk dapat menimpa pengaturan campaign jika diperlukan.
3. Nominal promo selalu lebih dominan daripada harga normal.
4. Format harga Indonesia tetap konsisten.
5. Harga coret tetap terlihat benar pada live preview, PNG, PDF, print preview, dan public page.
6. Panel harga tidak keluar dari canvas saat export.

#### P0.3 Visual Saving Calculator

**Tujuan:** Menghasilkan informasi penghematan secara otomatis dari harga normal dan harga promo.

Perhitungan yang direncanakan:

```text
saving_amount = normal_price - promo_price
saving_percent = (saving_amount / normal_price) * 100
```

**Aturan:**

| Kondisi | Perilaku |
|---|---|
| Harga promo lebih rendah | Tampilkan nominal dan/atau persentase hemat. |
| Harga promo sama dengan harga normal | Jangan tampilkan badge hemat. |
| Harga promo lebih tinggi | Ditolak oleh validasi harga. |
| Harga normal tidak tersedia | Gunakan label promo manual dan beri peringatan admin. |
| Pembulatan persentase | Default ke bilangan bulat, dengan opsi satu desimal jika diperlukan. |

#### P0.4 Safe-Area dan Readability Validator

**Tujuan:** Menjaga hasil brosur tetap terbaca dan tidak terpotong tanpa menghilangkan kebebasan overlap antar-elemen.

Validator hanya memberikan peringatan dan tidak memindahkan elemen secara otomatis.

| Pemeriksaan | Contoh peringatan |
|---|---|
| Canvas boundary | `Harga promo keluar dari area canvas.` |
| Safe margin | `Badge terlalu dekat dengan tepi cetak.` |
| Minimum readable size | `Nominal promo di bawah ukuran minimum.` |
| Text overflow | `Nama produk berpotensi terpotong.` |
| Image visibility | `Area gambar terlalu kecil untuk artwork.` |
| Contrast | `Kontras teks dan background terlalu rendah.` |
| Export clipping | `Elemen berpotensi terpotong pada PDF.` |

**Kriteria penerimaan:**

1. Warnings tampil jelas pada admin preview.
2. Warning dibedakan antara `info`, `warning`, dan `error`.
3. Overlap antar-elemen tetap diperbolehkan.
4. Error tidak mengubah posisi elemen secara otomatis.
5. Export dapat diblokir hanya untuk kondisi yang benar-benar berisiko menghasilkan file rusak.

### 3.2 Prioritas P1 — Identitas Visual dan Struktur Campaign

#### P1.1 Theme Ornament Builder

**Tujuan:** Menambahkan ornamen, emblem, logo, dan dekorasi yang terlihat pada brosur referensi.

Komponen yang direncanakan:

| Komponen | Fungsi |
|---|---|
| Logo retailer | Identitas brand atau toko. |
| Emblem event | Contoh: ulang tahun, akhir pekan, Ramadan, atau payday. |
| Ornamen tepi | Dekorasi sisi atau sudut brosur. |
| Sticker/burst | Aksen promo seperti `Hemat` atau `Spesial`. |
| Background decoration | Pola, gradient, tekstur, atau bentuk geometris. |
| Hero decoration | Elemen visual yang memperkuat headline. |

Setiap elemen harus memiliki konfigurasi `visible`, `asset_url`, `x`, `y`, `width`, `height`, `rotation`, `opacity`, `z_index`, dan `locked`.

#### P1.2 Footer Channel Builder

**Tujuan:** Mengubah footer menjadi area informasi pembelian yang modular.

Field yang direncanakan:

- Nomor WhatsApp atau hotline.
- Website publik.
- Instagram, TikTok, Facebook, dan marketplace.
- Alamat toko.
- Jam operasional.
- QR code katalog atau landing page.
- QR code WhatsApp.
- Label aplikasi atau member.
- Disclaimer campaign.

Admin dapat menyalakan atau mematikan setiap kanal. Footer harus tetap mengikuti margin internal A4 dan dapat menyesuaikan diri untuk Square, Story, dan Landscape.

#### P1.3 Section Header dan Thematic Grouping

**Tujuan:** Membuat campaign dengan jumlah produk besar tetap mudah dipindai.

Contoh section:

| Section | Gaya yang disarankan |
|---|---|
| Sembako | Header merah atau kuning dengan label kebutuhan pokok. |
| Minuman | Header biru atau hijau dengan ikon kategori. |
| Snack | Header oranye dengan badge ringan. |
| Paket Hemat | Header khusus dengan panel harga dominan. |
| Produk Rumah Tangga | Header netral agar tidak mengalahkan promo. |

Setiap section dapat memiliki judul, subtitle, warna, ikon, urutan, jumlah kolom, dan aturan produk unggulan sendiri.

#### P1.4 Channel-Specific Promotion Labels

**Tujuan:** Menyampaikan promo yang hanya berlaku untuk kanal tertentu.

Contoh label:

- `Harga khusus aplikasi`.
- `Promo WhatsApp`.
- `Khusus member`.
- `Promo marketplace`.
- `Ambil di toko`.
- `Gratis ongkir`.

Label kanal tidak boleh dianggap sebagai perubahan harga otomatis kecuali backend memiliki aturan harga resmi untuk kanal tersebut.

### 3.3 Prioritas P2 — Fleksibilitas Kreatif dan Reusable Assets

#### P2.1 Asset Library Campaign

**Tujuan:** Mempercepat pembuatan campaign dan menjaga identitas visual tetap konsisten.

Jenis asset:

| Asset | Contoh |
|---|---|
| Logo | Logo utama, logo kecil, logo monochrome. |
| Emblem | Ulang tahun, weekend, payday, clearance. |
| Ornament | Burst, pita, bintang, pola, confetti. |
| Background | Gradient, tekstur, pattern, warna brand. |
| QR template | Katalog, WhatsApp, aplikasi, marketplace. |
| Footer preset | Footer minimal, footer retail, footer digital. |

Asset harus memiliki metadata nama, kategori, URL, status aktif, owner, versi, dan audit trail.

#### P2.2 Template Layout Tambahan

Template yang dapat ditambahkan:

| Template | Karakter visual | Kegunaan |
|---|---|---|
| Zig-Zag Layout | Produk bergantian kiri dan kanan | Campaign yang dinamis. |
| Newspaper Editorial | Kolom padat dan tipografi editorial | Campaign dengan banyak produk. |
| Retro/Vintage | Ornamen klasik dan warna hangat | Produk tradisional atau event tematik. |
| Neon/Dark Mode | Background gelap dengan aksen neon | Flash sale dan campaign digital. |
| Polaroid Grid | Gambar produk dalam frame foto | Campaign lifestyle atau seasonal. |
| Editorial Hero | Satu hero besar dengan daftar produk | Produk unggulan dan storytelling. |

Semua template baru harus tetap mendukung sistem geometri yang sama, terutama transform, canvas bounds, export parity, dan hidden editor handles.

#### P2.3 Campaign Copy Assistant

**Tujuan:** Membantu admin membuat headline, subtitle, badge, dan CTA yang konsisten dengan tipe campaign.

Contoh output yang dapat dipilih admin:

- Headline campaign.
- Subtitle singkat.
- Label promo.
- CTA.
- Deskripsi section.
- Label urgensi seperti `stok terbatas`.

Fitur ini sebaiknya bersifat opsional, tidak mengubah data harga, dan selalu memerlukan review admin sebelum disimpan atau dipublikasikan.

## 4. Rancangan Schema Tambahan

Field campaign yang disarankan:

```json
{
  "promo_engine_version": 1,
  "price_panel_config": {
    "enabled": true,
    "background": "#FACC15",
    "shape": "rectangle",
    "show_saving": true,
    "saving_mode": "percent",
    "normal_price_style": "strike",
    "unit_label": "/pcs"
  },
  "safe_area_config": {
    "enabled": true,
    "margin_mm": 4,
    "min_font_px": 8,
    "contrast_check": true,
    "block_unsafe_export": false
  },
  "theme_assets": [],
  "footer_channels": {
    "whatsapp": "",
    "website": "",
    "instagram": "",
    "marketplace": "",
    "address": "",
    "operating_hours": ""
  },
  "sections": []
}
```

Field tambahan pada item produk:

```json
{
  "badge_type": "best_seller",
  "badge_text": "BEST SELLER",
  "promo_mechanic": "multi_buy",
  "promo_quantity": 2,
  "buy_quantity": 2,
  "bundle_price": 35000,
  "minimum_spend": 0,
  "max_per_customer": 2,
  "channel_restriction": "all",
  "saving_mode": "auto",
  "featured": true,
  "section_id": "sembako"
}
```

Semua field baru harus dinormalisasi dengan default aman agar campaign lama tetap dapat dibuka, diedit, di-restore, dan dipublikasikan tanpa migrasi yang merusak data.

## 5. Rencana Implementasi Bertahap

| Fase | Cakupan | Output utama |
|---|---|---|
| Phase 1 | Promo Rule Engine dasar | Schema promo, form admin, label otomatis, persistence. |
| Phase 2 | Panel harga dan saving calculator | Panel configurable, harga hemat, strike-price parity. |
| Phase 3 | Safe-area dan readability validator | Warning engine, indikator preview, export guard. |
| Phase 4 | Theme Ornament Builder | Asset, layer, z-index, visibility, freeform decoration. |
| Phase 5 | Footer Channel Builder dan section grouping | Footer modular, section tematik, responsive adaptation. |
| Phase 6 | Asset library dan template tambahan | Reusable asset, Zig-Zag, Editorial, Retro, Neon, Polaroid. |
| Phase 7 | Hardening dan governance | Regression, approval, audit, migration, public/export parity. |

## 6. Persyaratan Teknis Umum

Setiap fitur baru harus memenuhi persyaratan berikut:

1. **Tidak mengubah harga asli katalog.** Semua perubahan harga hanya berlaku pada snapshot campaign.
2. **Tetap mengikuti minimum-price protection.** Validasi dilakukan pada input langsung, bulk pricing, restore, import, dan save final.
3. **Memiliki persistence yang backward-compatible.** Campaign lama harus tetap dapat dibuka dan menghasilkan default yang aman.
4. **Menggunakan renderer yang konsisten.** Admin preview, public preview, PNG, PDF, dan print preview harus mengambil sumber markup atau konfigurasi yang sama.
5. **Mendukung A4 Portrait sebagai standar utama.** Format Square, Story, dan Landscape tetap harus mempertahankan proporsi serta safe area masing-masing.
6. **Mempertahankan kebebasan Retail Tile.** Overlap antar-elemen tetap diperbolehkan sesuai requirement, sedangkan pembatasan utama adalah canvas brosur.
7. **Menyembunyikan kontrol editor saat export.** Resize handle, outline seleksi, indikator warning, dan metadata interaksi tidak boleh masuk ke file hasil.
8. **Terhubung ke RBAC dan audit log.** Perubahan konfigurasi campaign harus mengikuti permission backend dan tercatat pada audit trail.
9. **Tidak menambahkan endpoint API yang tidak diperlukan.** Integrasi baru harus menggunakan konfigurasi API yang telah disetujui project.
10. **Tidak mengorbankan responsivitas UI.** Perubahan kontrol harus memperbarui preview tanpa delay yang mengganggu.

## 7. Matriks Pengujian

| Area pengujian | Skenario minimum |
|---|---|
| Schema | Campaign lama, campaign baru, field kosong, field tidak dikenal. |
| Price protection | Harga di bawah minimum melalui direct input, bulk, restore, dan import. |
| Promo engine | Single price, buy N, multi-buy, bundle, minimum spend, max customer. |
| Visual | Featured tile, badge, panel harga, saving label, section, footer. |
| Freeform | Drag, resize delapan arah, overlap, canvas boundary, z-index. |
| Responsive | A4 Portrait, Square, Story, Landscape, viewport desktop dan mobile. |
| Export | PNG, PDF satu halaman A4, print preview, hidden editor controls. |
| Public parity | Konfigurasi admin sama dengan halaman publik. |
| Governance | Role tanpa izin, role editor, role publisher, approval dan audit log. |
| Performance | Campaign dengan jumlah produk maksimum dan asset dekorasi maksimum. |

## 8. Definition of Done

Sebuah fitur dianggap selesai apabila:

- Kontrol admin tersedia dan memiliki label yang jelas.
- State memiliki normalizer dan default backward-compatible.
- State tersimpan dan dapat dipulihkan melalui save/restore.
- Admin preview menampilkan hasil yang benar.
- Public preview menampilkan konfigurasi yang sama.
- PNG, PDF, dan print preview memiliki parity visual.
- Permission backend tetap dihormati.
- Audit log mencatat perubahan penting.
- Regression harness memiliki assertion baru.
- Browser verification berhasil pada minimal satu fixture produk.
- Tidak ada error pada `node --check` dan `git diff --check`.
- Perubahan didokumentasikan dan dipush ke repository.

## 9. Rekomendasi Prioritas Berikutnya

Urutan yang paling disarankan adalah:

> **Promo Rule Engine → Panel Harga Configurable → Saving Calculator → Safe-Area Validator → Theme Ornament Builder → Footer Channel Builder → Template Layout Tambahan**

Urutan tersebut dipilih karena membangun fondasi data promo terlebih dahulu, lalu meningkatkan hierarki visual, kualitas export, identitas campaign, dan fleksibilitas kreatif.

Implementasi awal paling ideal adalah menggabungkan **Promo Rule Engine** dan **Panel Harga Configurable** dalam satu fase. Keduanya merupakan fitur yang paling dekat dengan pola brosur referensi dan memberikan dampak paling besar terhadap kejelasan promo.

## 10. Referensi Internal

1. `HMI-27Ags.pdf` — brosur referensi yang ditinjau secara visual.
2. `docs/brochure-reference-hmi-27ags-analysis.md` — analisis pola visual dan merchandising dari brosur referensi.
3. `admin/catalog-promo-pop.html` — antarmuka admin Catalog Promo POP.
4. `admin/js/catalog-promo-pop.js` — controller, state, persistence, renderer, dan export flow.
5. `promo_katalog.html` — public campaign renderer.
6. `tests/catalog_promo_pop_governance_regression.js` — regression harness governance dan visual invariants.

---

**Dokumen ini adalah roadmap desain dan implementasi.** Setiap fase tetap memerlukan audit kode, pembaruan schema, implementasi bertahap, pengujian browser, validasi export, serta review sebelum masuk production.

**Author:** Manus AI
