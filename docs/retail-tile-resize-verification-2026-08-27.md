# Retail Tile Resize Verification — 2026-08-27

## Scope

Verified the per-product resize behavior for the `Retail Tile · Brosur Vertikal` layout in the Catalog Promo POP admin preview.

## Implemented behavior

- Each Retail Tile has an independent bottom-right resize handle.
- Resize uses a single scale value per product and keeps the tile aspect ratio locked.
- Product image, name, normal price, promo price, badge, and offer text remain proportionally scaled with the tile.
- Scale is constrained to the supported range `0.65`–`1.8`.
- Tile geometry is checked against the brochure canvas before accepting a new scale.
- Tile overlap is permitted for the freeform editor; only geometry that would leave the brochure canvas is rolled back to the last valid scale.
- Tile scale is persisted with campaign grid configuration and restored for admin and public rendering.
- Resize handles are editor-only and excluded from export output.

## Browser verification

The authenticated admin preview rendered the Retail Tile resize handle correctly. A controlled inward drag changed the first tile scale while the resize mode was cleared after pointer release. A controlled outward drag was rejected when it would exceed the available canvas, preserving the last valid scale. Overlap is intentionally supported by the freeform layout.

With the controlled fixture, the measured tile rectangles remained within the preview canvas. The freeform implementation does not reject overlap, so overlapping tiles and independently positioned elements remain valid when they stay inside the canvas.

## Automated checks

The focused governance and visual regression harness passed `29/29` checks. JavaScript syntax validation and `git diff --check` also passed.

## Files covered

- `admin/js/catalog-promo-pop.js`
- `admin/catalog-promo-pop.html`
- `promo_katalog.html`
- `tests/catalog_promo_pop_governance_regression.js`

The change is currently local and has not been committed or pushed.

## Usage

1. Choose `Retail Tile · Brosur Vertikal` under **Layout Produk**.
2. Select one or more products.
3. In the Live Preview, locate the small handle at the bottom-right of a tile.
4. Press and hold the mouse button, then drag inward or outward.
5. Release the mouse button to save the valid scale in the current campaign state.

If a resize would make a tile leave the brochure canvas, the system keeps the previous valid size. Overlap with other tiles or elements is allowed by design.
