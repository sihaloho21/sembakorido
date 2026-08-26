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
