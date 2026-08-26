# A4 Portrait print-preview test notes

Date: 2026-08-26

The authenticated Catalog Promo POP page loaded with A4 paper selected (`A4 · 210 × 297 mm · Aktif`) and Portrait selected (`Portrait · 210 × 297 mm`). The new `Pratinjau cetak` button opened an in-app modal titled `Pratinjau cetak` with the label `A4 Portrait · 210 × 297 mm · margin cetak 5 mm`.

The preview sheet was displayed as a single portrait page inside the modal. The first test had zero selected products, so the brochure showed the normal empty-product placeholder; no product clipping could be assessed yet. The modal provided `Kembali` and `Cetak sekarang` controls, and the admin page remained behind the modal.

Next checks: inspect computed dimensions and run the PDF generation path with selected products, then check for console errors and generated file presence.

Do not treat the admin instructional text about dragging elements as part of the print preview; it is outside the brochure canvas and should not be printed.

---

## Follow-up measurement

To be appended after the browser dimension and PDF regression checks.

## Measured browser result

With one selected product, the in-app print-preview modal opened successfully. The print sheet measured approximately `794 × 1123 px`, ratio `0.7071`, which matches the A4 Portrait ratio `210 / 297 = 0.7071`. The captured brochure image was ready at `948 × 1274 px`, ratio `0.7441`; the sheet uses containment, so it is fit within the A4 page rather than clipped. The modal was visibly open and displayed the selected product, including product image, name, strike-through old price, and promo price. The remaining ratio difference means the brochure artwork is centered with extra page margin on the sides, not cropped.

The PDF handler was also updated to synchronize selected brochure fields and re-render before capture, preventing stale campaign-only prices or text in generated PDFs. The PNG handler received the same synchronization safeguard.

## Strike-through hardening follow-up

The refreshed authenticated builder exposed 14 catalog products and the first product was selected through the normal `Pilih` button. The admin renderer now emits semantic `<del class="strike-price">` markup, with explicit `text-decoration-line`, thickness, color, and `text-decoration-skip-ink:none` rules applied to admin and public normal-price containers. This is intended to keep the strike-through visible in browser, print preview, PNG, and PDF capture.

## Deployed-browser regression note

The authenticated remote preview accepted a temporary normal price of `20.000` and promo price of `18.000` through the selected-product editor. The remote page’s current runtime still returned `<span class="strike-price">20.000</span>`, indicating that this deployed preview is serving the pre-hardening bundle rather than the local `<del>` change. Local source verification and a local static-server test are required before treating the final implementation as verified in-browser.

## Maximum-grid stress test setup

- Available catalog dataset: 14 real products.
- All 14 available products were selected through the normal UI flow.
- Grid configuration was set to the maximum supported values: 8 rows × 6 columns = 48 slots.
- The selected dataset therefore fills all available catalog items while leaving 34 empty capacity slots in the maximum grid.

## Full-grid PDF stress test

- All 14 available catalog products were selected.
- Maximum grid settings were active at 8 rows × 6 columns (48 slots).
- The live preview displayed 14 products across the configured grid and reported `14 produk promo`.
- The real PDF button completed with status `PDF A4 berhasil dibuat dan diunduh.`.
- No render or CORS error appeared in the visible status during generation.
- Next check: inspect the downloaded PDF metadata and rendered page for page count and overflow.

## Maximum-grid export result

The latest full-grid export used all 14 available catalog products with the maximum 8 × 6 grid configuration. The generated file was `promo-pop-A4 (1).pdf`. `pdfinfo` reported exactly 1 page, A4 dimensions of 595.28 × 841.89 points, PDF version 1.3, and a file size of approximately 571 KB. The first page was rendered at 1241 × 1754 pixels for visual inspection. The complete artwork, 14 product tiles, service/payment sections, QR code, store footer, and disclaimer remained inside the single A4 page; no second page or page continuation was produced. The render showed some external product images falling back to placeholders, which is an asset/CORS availability issue rather than page overflow.

## A4 safe-area full-grid regression — 2026-08-26

- Test origin: local patched builder at the exposed 8012 origin; no campaign was saved or published.
- Dataset: all 14 available catalog products selected through the UI.
- Grid: 8 rows × 6 columns (48 slots), layout tested in Auto Adaptive Grid and Retail Tile.
- Preview: A4 Portrait, preview box 467.33 × 660.92 CSS px; safe-area content rect 389.77 × 583.36 CSS px; inset measured at approximately 38.78 CSS px per side, matching 10 mm at CSS physical scale.
- Auto Adaptive Grid: 163 descendants inspected; 0 descendants outside the safe-area rectangle.
- Retail Tile: 14 tiles, 177 descendants inspected; 0 descendants outside the safe-area rectangle; 0 draggable tile elements outside their tile bounds.
- PDF: latest generated artifact `promo-pop-A4 (2).pdf`; `pdfinfo` reports 1 page, A4 595.28 × 841.89 pt, rotation 0, file size 333669 bytes.
- Rendered PDF: `a4-safe-area-test/full-grid-a4.png`, 1241 × 1754 px; visual inspection shows the artwork, 14 product tiles, footer, QR code, payment text, and disclaimer inside the page with no second-page continuation or clipping.
- Note: some product images can appear blank/placeholder when their external host does not allow canvas loading; this is an asset/CORS issue, not a page-overflow issue.
