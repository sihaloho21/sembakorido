# Strike-price export verification — 2026-08-27

## Issue
The normal price digits and the strike-through line were visually detached in brochure captures, especially in PNG/PDF output.

## Fix
Admin and public brochure renderers now use the same `.strike-price` implementation: an inline-block element with `text-decoration` disabled and an explicit `::after` line centered at `top: 50%`, using `background: currentColor` and a 2px height. This is stable for browser rendering and DOM-to-canvas/PDF capture.

## Controlled verification
A selected product was rendered with normal price `20.000` and promo price `18.000`. The preview contained semantic markup:

```html
<del class="strike-price" aria-label="Harga normal 20.000">20.000</del>
```

The same preview DOM was used for PNG, PDF, and print export.

## Artifacts

- PNG: `promo-pop-A4-Portrait (2).png`
- PNG dimensions: 1206 × 1704 px, RGBA
- PDF: `promo-pop-A4 (6).pdf`
- PDF: 1 page, 595.28 × 841.89 pt (A4)

## Automated validation

- JavaScript syntax check: PASS
- Governance and export regression suite: 19/19 PASS
- `git diff --check`: PASS
