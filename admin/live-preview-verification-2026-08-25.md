# Live Preview Verification — 2026-08-25

## Access
- URL: https://8099-i0mejgnhovyd6hsq0able-6dd65a00.sg1.manus.computer/admin/catalog-promo-pop.html
- Admin login succeeded using the token supplied by the user; session redirected to the dashboard and then opened the Catalog Promo POP page.

## Desktop observations
- Product data loaded successfully: 14 products across categories including Cemilan, Lainnya, and Perawatan & Pembersih.
- Live preview initially showed the empty state correctly.
- Selected products: PSM Gula Pasir Kristal Putih Premium 1 kg, Minute Maid Pulpy Rasa Jeruk Botol 300 ml, and Kratingdaeng Minuman Energi 150 ml.
- The live flyer preview rendered all three product artworks inside the product tiles. The packaging remained visible within the frame, centered with white margins, and no visible clipping/cropping was observed.
- The rendered preview uses the `.flyer-media-frame` and `img` rules with flex centering, `max-width/max-height:100%`, and `object-fit:contain`.
- Desktop screenshots captured by the browser during verification:
  - /home/ubuntu/screenshots/8099-i0mejgnhovyd6hs_2026-08-25_01-19-32_4220.webp (one product)
  - /home/ubuntu/screenshots/8099-i0mejgnhovyd6hs_2026-08-25_01-19-43_3675.webp (two products)
  - /home/ubuntu/screenshots/8099-i0mejgnhovyd6hs_2026-08-25_01-19-52_8361.webp (three products)

## Next check
- Verify a wider range of product aspect ratios and inspect mobile breakpoint stability without saving or publishing a campaign.

## Live-source discrepancy discovered
The provided live URL currently serves an older `catalog-promo-pop.js` asset despite the repository’s committed renderer using `.flyer-media-frame`. An uncached fetch of the live script reported `hasMediaFrame: false` and `hasLegacyClass: true`.

The live DOM measurement on the authenticated page reported three product wrappers with class `.flyer-item-image`, each frame measuring approximately 124 × 72 px while its 400 × 400 image measured approximately 124 × 124 px. The wrapper’s computed `overflow` was `hidden` and the image’s computed `object-fit` was `contain`; because the image height exceeds the 72 px frame and the wrapper clips overflow, the live deployment still crops the product artwork. This means the repository fix is committed, but the supplied live preview has not yet picked up the current JavaScript/CSS version.

## Production verification on paketsembako.com
Source: https://paketsembako.com/admin/catalog-promo-pop.html (accessed 2026-08-25)

The production page authenticated successfully with the existing admin session. After selecting **Bento Box Highlight** and adding PSM Gula Pasir Kristal Putih Premium 1 kg, Minute Maid Pulpy Rasa Jeruk Botol 300 ml, and Pocari Sweat Minuman Isotonik Botol 350 ml, the live DOM still rendered `.flyer-item-image` wrappers. Console measurements showed the first wrapper at approximately 192 × 86 px with a 192 × 192 px image, and the other wrappers at approximately 81 × 86 px with 81 × 86 px images. The image rules were `object-fit: cover`, `object-position: 50% 50%`, and the wrapper had `overflow: hidden`. This confirms the production deployment is running the old renderer and crops portrait artwork in Bento layouts.

The repository renderer at `admin/catalog-promo-pop.html` and `admin/js/catalog-promo-pop.js` already contains `.flyer-media-frame`, `overflow: visible`, and `object-fit: contain !important`; the remaining production issue is a deployment/version mismatch rather than the current local rule.

## Bento hardening patch

The current source was strengthened for the Bento layout: product images are constrained with `width:auto !important`, `height:auto !important`, `max-width:calc(100% - 8px)`, and `max-height:calc(100% - 8px)` inside the flex-centered `.flyer-media-frame`. The first Bento tile receives a larger frame (`170px` desktop, `140px` narrow screens) so portrait artwork has room to remain fully visible. The promo renderer asset version was bumped from `20260825b` to `20260825c` to invalidate stale JavaScript references. The obsolete `.flyer-item-image` selector remains absent from the current source.

## Local Bento regression check

The local server was restarted with the updated source and served `Cache-Control: no-cache, max-age=0, must-revalidate`. The local page served `catalog-promo-pop.js?v=20260825c`, six `.flyer-media-frame` references, and no `.flyer-item-image` reference. In the browser, **Bento Featured** rendered PSM Gula Pasir Kristal Putih Premium 1 kg and Minute Maid Pulpy Rasa Jeruk Botol 300 ml without visible cropping: the portrait sugar package remained fully visible in the enlarged first tile, while the beverage remained contained in the secondary tile.

Console measurement after three products in local Bento preview: layout class `flyer-layout-bento`; frame 1 = 274 × 170 px with image 162 × 162 px, frames 2–3 = 124 × 82 px with images 74 × 74 px. All images computed as `object-fit: contain`; all frames computed as `overflow: visible`; every measured image stayed within its frame bounds.
