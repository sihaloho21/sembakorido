# Export Price Parity Test — 2026-08-27

## Test state

A single product was selected in the admin Catalog Promo POP editor. The database price was 20.000 and the brochure promo price was set to 18.000, producing one semantic `<del class="strike-price">20.000</del>` element in the live preview.

## PNG result

File: `promo-pop-A4-Portrait (1).png`

The PNG export completed successfully at 1206 × 1704 pixels. The normal price `20.000` is visible above the promotional price `18.000` with a clear horizontal strike-through line. Product image, price hierarchy, CTA, QR code, and A4 portrait composition are visible without cropping.

## Previous PDF check

A PDF export completed successfully as a one-page A4 document, but the first PDF inspected after a page reload had zero selected products because the editor state was reset. A second controlled PDF export was triggered after recreating the selected-product state; its artifact is `promo-pop-A4 (5).pdf` and requires final visual inspection.

## Conclusion so far

PNG rendering is correct. The controlled PDF export completed and must be visually compared against the controlled PNG, not against the earlier zero-product PDF generated after reload.

## Source

Preview URL: https://4173-ieiw6kb5mtpf3etn2g1pq-7ddd2839.sg1.manus.computer/admin/catalog-promo-pop.html

The preview and export implementations use the same normalized strike-through markup and shared capture DOM.
