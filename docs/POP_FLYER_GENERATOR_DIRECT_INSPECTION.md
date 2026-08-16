# Direct Inspection — POP Flyer Generator

## Source

URL: https://paket-sembako-online-943127658752.asia-southeast1.run.app

Inspection date: 2026-08-16.

## Initial catalog view

The example app opens as a grocery catalog with a top navigation and a visible `🔥 Katalog Promo POP (PRD Flyer)` feature entry. The catalog shows product cards with product image, category, stock, packaging, base price, and price-tier information.

## POP Flyer Generator view

Opening the feature displays a dark generator workspace with a header labeled `POP FLYER GENERATOR` and `Katalog Promo Retail POP Multiguna`.

Visible top controls:

- `Preview Flyer (5)` — active tab showing the flyer preview and five selected products.
- `Multi-Pilih Katalog (5)` — product selection workflow.
- `Pengaturan Gaya & Grid` — flyer visual/grid settings.
- `Riwayat Flyer (0)` — saved flyer history.
- `Simpan Flyer` — save the current flyer configuration.
- `Download PNG` — export flyer as a high-resolution PNG.
- `Share WA + Gambar` — share flyer image and promotional text to WhatsApp.
- `Cetak` — print the flyer.
- Close button.

The preview is a full promotional flyer rather than a simple product list. It includes a red store/period header with QR code, an orange promo banner, a hero product block with original and promotional prices, smaller supporting product cards, and additional lower promotional sections. The rendered flyer uses strong brand colors, badges, discount labels, image-heavy product blocks, and a watermark-like visual treatment.

## Initial compatibility implication

The current sembakorido implementation has the correct admin-only generator and public campaign pipeline, but its preview is currently a compact responsive card grid. To match the direct example, the generator needs a richer flyer configuration model: store/header block, QR/link block, validity period, hero product, supporting products, promo banners, discount badges, grid/layout selection, export/share state, and saved history/published campaign distinction.

## Product selection and discount workflow

The `Multi-Pilih Katalog (5)` tab exposes `Pilih Semua (10)`, `Hapus Pilihan`, and `Lihat Flyer (5)`. It supports search by product name, category filters, per-product selection, per-product discount percentage, and optional badge text. It also provides a bulk pricing tool with percentage or nominal reduction modes, a common percentage input, badge prefix, `Terapkan Massal`, quick presets from 10% to 50%, and a reset action.

The selected product cards show base price, promo price, discount percentage, and optional badge text. Five of ten catalog products were selected in the inspected state.

## Visual style and grid workflow

The `Pengaturan Gaya & Grid` tab exposes ten visual themes:

- Alfamidi Retail / Retail POP
- Modern Sleek / Minimalist
- Seasonal Festive / Gold Festival
- Midnight Flash / Neon Flash
- Fresh Organic / Eco Sembako
- Warung Kelontong / Vintage Retro
- Cyberpunk Grosir / Cyber Matrix
- Pasar Kaget Pesta / Festival Pesta
- Wholesale VIP Gold / VIP Platinum
- K-Mart Aesthetic / Soft Pastel

It also exposes layout presets including Studio Generator Grid Fleksibel, Auto Adaptive Grid, Bento Box Highlight, Diagonal Split Showcase, Magazine Asymmetric, Mosaic Masonry Grid, Dual Spotlight Hero, Zig-Zag Staggered, Explosive Starburst, and Horizontal Filmstrip. The inspected default state showed Auto Adaptive Grid selected.

## Adaptation priority

The highest-value parity items for sembakorido are: selected product ordering, per-item promo discount and badge, bulk discount operations, theme selection, layout selection, and a richer preview/export model. The current target generator has basic theme selection and a responsive item grid, but not all ten themes, the layout preset catalog, bulk discount controls, or a full flyer configuration model.

## Direct interaction — Multi-Pilih Katalog

The product-selection tab shows bulk controls above the catalog: select all, clear selections, view flyer, percentage versus nominal discount mode, a uniform discount input, badge prefix input, apply action, reset action, quick presets from 10% through 50%, search, and category filters. Selected cards show checkbox state, product image, category, current promo price, crossed-out base price, per-item discount input, and optional badge text. The inspected example displayed five selected products out of ten and allowed horizontal category navigation on the compact viewport.

The direct UI confirms that parity requires both per-item editing and bulk operations, plus a selected-count state that is reflected in the preview tab and the flyer output.
