# PRD — Redesign Mobile `#category-filters`

**Product:** Paket Sembako
**Feature:** Mobile category filter experience
**Status:** Proposed
**Owner:** Product & Frontend
**Target platform:** Mobile web, viewport width below the existing `md` breakpoint
**Primary component:** `id="category-filters"`

## 1. Executive summary

The current `#category-filters` component is a horizontal row of pill buttons inside an overflow container. It is functional, but on mobile it can feel like an undifferentiated strip of controls: users may not immediately recognize that the row is horizontally scrollable, the active category has limited visual hierarchy, and there is no clear indication of how many categories are available or where the selected category sits in the list.

This PRD proposes a **Compact Category Dock**: a mobile-first filter area consisting of a clear section label, a strongly differentiated active category, horizontally scrollable chips with edge-fade affordances, and an optional “Lainnya” bottom sheet for larger category sets. The experience should feel lightweight and tactile while preserving the existing filtering behavior and the `#category-filters` integration point.

> **Recommended direction:** Keep the speed of one-tap horizontal chips, but add stronger hierarchy, scroll discoverability, dynamic category overflow handling, and accessible selected states.

## 2. Problem statement

Users browsing grocery products need to move quickly between categories such as **Semua**, **Bahan Pokok**, **Paket Hemat**, and **Paket Lengkap**. The existing mobile carousel allows horizontal scrolling, but the interaction is not sufficiently self-explanatory. Long category names can consume the viewport, inactive pills compete visually with the selected category, and the optional indicator bars do not communicate the actual scroll position or category count.

The redesign should reduce the cognitive effort required to answer three questions: **What category is active? Where can I find more categories? What will happen when I tap a category?**

## 3. Goals and non-goals

| Area | Goal | Success condition |
|---|---|---|
| Discoverability | Make horizontal category navigation visibly scrollable | Most users can discover additional categories without instruction |
| Selection clarity | Make the active category immediately recognizable | Active state remains obvious against the page background and inactive chips |
| Speed | Apply a category filter with one tap | Product results update using the existing `setCategory()` flow |
| Mobile ergonomics | Make chips comfortable for thumb interaction | Tap targets are at least 44px high and do not require precision tapping |
| Scalability | Support a small or large number of dynamic categories | The layout remains tidy from 2 categories through 15+ categories |
| Accessibility | Expose selected state and keyboard/focus behavior | Screen readers identify the active category and all controls are reachable |

The redesign does **not** change product filtering rules, category data contracts, desktop arrow behavior, product-card design, search behavior, or backend APIs. It also does not introduce multi-select filtering in this phase.

## 4. Recommended UX concept: Compact Category Dock

### 4.1 Visual structure

On mobile, the component should appear as a compact, visually separated block directly above the product grid. The block contains a small heading row and a horizontally scrollable chip rail.

| Element | Proposed treatment | Purpose |
|---|---|---|
| Section label | `Kategori` with a small category/grid icon | Gives the control a clear semantic anchor |
| Active summary | Optional text such as `Semua dipilih` or `Bahan Pokok` | Helps users understand the current state before scanning the chips |
| Chip rail | Single-line horizontal scroll with `snap-x` and smooth scrolling | Preserves one-tap filtering while avoiding multi-line clutter |
| Active chip | Filled green background, white text, subtle shadow, check icon | Creates a strong selected state |
| Inactive chip | White or translucent surface, gray text, thin neutral border | Keeps alternatives visible but visually secondary |
| Edge fade | Soft gradient mask at the right edge when more content exists | Signals that more categories are available off-screen |
| Scroll cue | Small animated or static progress dots only when necessary | Provides position awareness without decorative noise |
| Overflow action | `Lainnya` chip when categories exceed the preferred visible set | Opens a bottom sheet for direct category selection |

### 4.2 Interaction model for category counts

For up to five categories including **Semua**, display all categories in the horizontal rail. For more than five categories, show **Semua**, the most relevant or first three dynamic categories, and a final **Lainnya** chip. The overflow sheet should display the complete category list in a two-column or single-column grid, depending on available width.

The overflow strategy prevents a long row of chips from becoming visually noisy while still making every category accessible. The exact category ordering should continue to come from the existing category ordering logic; the PRD does not require a new ranking algorithm.

### 4.3 Selected category behavior

When the user taps a category chip, the component should immediately:

1. Apply the selected visual state.
2. Scroll the selected chip into the center or nearest visible position.
3. Run the existing product filtering behavior.
4. Return the product list to its first relevant page when applicable.
5. Close the overflow sheet if the selection came from **Lainnya**.
6. Preserve the selected category when the user returns from a product detail modal, unless the existing product-page behavior intentionally resets filters.

The selected chip should use `aria-pressed="true"` or an equivalent selected-state pattern. Inactive chips should expose `aria-pressed="false"`.

## 5. User stories

As a mobile shopper, I want to see which category is active so that I know what products I am currently viewing.

As a mobile shopper, I want to swipe through categories naturally so that I can browse without opening a separate menu for common categories.

As a mobile shopper, I want a clear way to access categories that are not immediately visible so that no category feels hidden.

As a mobile shopper, I want the product list to update immediately after selecting a category so that I can compare products without extra confirmation steps.

As a keyboard or assistive-technology user, I want category controls to expose their selected state and have visible focus so that I can understand and operate the filter.

## 6. Functional requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-01 | The existing `id="category-filters"` remains the primary container for mobile category controls. | Must |
| FR-02 | Categories continue to be rendered dynamically from the existing category data source. | Must |
| FR-03 | Selecting a chip continues to call the existing category selection and product-filtering flow. | Must |
| FR-04 | Exactly one category is selected at a time, with **Semua** as the default. | Must |
| FR-05 | The active category has a clearly differentiated visual style and accessible selected state. | Must |
| FR-06 | The rail supports touch scrolling, momentum scrolling, and snap alignment on supported mobile browsers. | Must |
| FR-07 | A visible right-edge affordance appears only when additional categories exist beyond the viewport. | Should |
| FR-08 | When the total category count exceeds the compact display limit, show a `Lainnya` action that opens a bottom sheet. | Should |
| FR-09 | Selecting a category from the bottom sheet closes the sheet and updates the chip rail to show the selected category. | Should |
| FR-10 | The component must not cause horizontal page overflow outside its own scroll container. | Must |
| FR-11 | Category controls must remain usable at 320px viewport width. | Must |
| FR-12 | The component respects `prefers-reduced-motion` and avoids mandatory animation. | Should |
| FR-13 | Desktop behavior, including the existing arrow controls, remains unchanged in this phase. | Must |

## 7. Non-functional requirements

### Performance

The redesign should use CSS transforms, opacity, gradients, and native scrolling rather than continuous JavaScript scroll calculations. Event listeners should remain passive unless preventing default behavior is necessary. The component must not add a new network request or delay the first product render.

### Accessibility

Each category must be a native `button`. The active category must expose `aria-pressed="true"`, while inactive categories expose `aria-pressed="false"`. Focus rings must remain visible against both the page background and the active green surface. The horizontal rail should have a concise accessible label such as `Pilih kategori produk`. The bottom sheet must have a dialog label, a close button, Escape-key support, and logical focus behavior.

### Responsive behavior

| Viewport | Behavior |
|---|---|
| 320–374px | Compact horizontal rail, no unnecessary decorative text, minimum 44px chip height |
| 375–767px | Full Compact Category Dock with edge fade and optional `Lainnya` overflow |
| 768px and above | Preserve the existing desktop filter carousel and arrow controls unless a later desktop redesign is approved |

## 8. Visual design specification

The visual language should match the existing green, white, and soft-gray Paket Sembako interface while introducing stronger depth and hierarchy.

| Token | Recommendation |
|---|---|
| Dock background | `bg-white/85` or equivalent with subtle backdrop blur where supported |
| Dock border | Soft neutral border such as `border-slate-100` |
| Active chip | Green fill, white text, medium shadow, optional check icon |
| Inactive chip | White surface, slate text, light border |
| Hover/press | Slight background shift and `scale(0.97)` on active press only |
| Chip radius | Full pill radius, approximately 16–18px |
| Chip height | 44–48px including padding |
| Horizontal spacing | 8px between chips; 16px container inset on mobile |
| Typography | Existing Plus Jakarta Sans; 12–13px semibold or bold |
| Edge fade | White-to-transparent gradient aligned with the rail edge |
| Section spacing | 12–16px below the search control and 16–20px above the product grid |

The selected state should not rely on color alone. A check icon, stronger weight, and `aria-pressed` state should reinforce selection. Avoid excessive gradients or large shadows because the filter is a high-frequency control.

## 9. Suggested mobile layout

```text
┌─────────────────────────────────────┐
│  Kategori                 Semua dipilih │
│  [✓ Semua] [Bahan Pokok] [Paket Hemat] ▸│
└─────────────────────────────────────┘

Tap “Lainnya” or overflow action:

┌─────────────────────────────────────┐
│  Pilih kategori                 ×    │
│  [✓ Semua]       [Bahan Pokok]       │
│  [Paket Hemat]   [Paket Lengkap]     │
│  [Minuman]       [Kebutuhan Rumah]   │
└─────────────────────────────────────┘
```

The exact number of visible chips should be calculated by available width rather than hardcoded pixel widths. Long category labels may use natural width with a reasonable maximum and ellipsis only as a last resort; the full category name must remain available through the overflow sheet or accessible label.

## 10. Bottom-sheet behavior

The bottom sheet is an enhancement for category sets that do not fit comfortably in the compact rail. It should open from the bottom with a short, subtle transition under 300ms. The sheet should include a clear title, a close button, and the complete category list. Tapping outside the sheet or pressing Escape closes it without changing the selection.

When a user chooses a category, the sheet closes after the selection is committed. The selected category should then be scrolled into view in the horizontal rail if that category is represented there; otherwise, the compact summary should show the selected category and the `Lainnya` chip should become the active overflow affordance.

## 11. Content and microcopy

| Context | Copy |
|---|---|
| Section label | `Kategori` |
| Default selected summary | `Semua dipilih` |
| Overflow action | `Lainnya` |
| Bottom-sheet title | `Pilih kategori` |
| Bottom-sheet close label | `Tutup pilihan kategori` |
| Screen-reader rail label | `Pilih kategori produk` |
| Empty category fallback | `Semua` |

Copy should remain in Indonesian and use sentence case. Avoid labels such as `Filter by` or `More` that are inconsistent with the existing product experience.

## 12. Analytics and measurement

Analytics are optional and should only be added if the project already has an approved analytics pipeline. If available, track the following events without sending personal information:

| Event | Parameters | Purpose |
|---|---|---|
| `category_filter_selected` | category value, source (`rail` or `sheet`) | Measure category engagement |
| `category_filter_overflow_opened` | category count | Measure discoverability of the overflow control |
| `category_filter_rail_scrolled` | optional scroll direction | Identify whether users discover hidden categories |

Do not send phone numbers, session tokens, order identifiers, or product-personalization data with these events.

## 13. Acceptance criteria

1. At a 320px viewport, the filter area does not create horizontal overflow on the page itself.
2. Users can swipe the category rail horizontally with native touch scrolling.
3. The active category is visually obvious and exposes the correct accessible selected state.
4. Tapping any category updates the product grid through the existing filtering behavior.
5. The selected chip is automatically brought into a visible position after selection.
6. When there are more categories than the compact rail can reasonably display, an accessible `Lainnya` action exposes the complete list.
7. Selecting a category in the bottom sheet closes the sheet and updates the product grid.
8. The bottom sheet can be closed by its close button, outside click, or Escape key.
9. Focus states are visible for every chip and the overflow action.
10. Reduced-motion users do not receive mandatory sliding or scaling animation.
11. The existing desktop category carousel and arrow controls continue to work unchanged.
12. No new console errors appear during category rendering, scrolling, selection, or sheet interactions.
13. Existing product search and category filtering remain compatible with dynamically loaded categories.

## 14. QA test matrix

| Test | Mobile expected result | Desktop regression check |
|---|---|---|
| One category | Single active chip is tidy and centered | Existing filter still renders |
| Three categories | All chips visible or naturally scrollable | Existing desktop spacing preserved |
| 6–10 categories | Rail shows overflow affordance and sheet contains all categories | Desktop arrows still operate |
| Very long category name | Text remains readable or is safely truncated with full accessible label | No desktop layout break |
| 320px viewport | No page-level horizontal scroll; chips remain tappable | Not applicable |
| Tap active category again | No duplicate state or broken filter | Existing behavior preserved |
| Select hidden category from sheet | Sheet closes, selection applies, active summary updates | Not applicable |
| Keyboard navigation | Focus visible, selected state announced | Desktop buttons remain keyboard accessible |
| Reduced motion | No mandatory animated transition | Existing desktop motion remains acceptable |
| API/category loading delay | Existing fallback and loading behavior remain stable | Existing category rendering preserved |

## 15. Implementation notes for the existing codebase

The redesign should be implemented as a mobile presentation layer around the current `#category-filters` container rather than as a separate filtering system. Existing data normalization, `currentCategory`, `setCategory()`, `filterProducts()`, and desktop arrow controls should remain the source of truth.

The current `setCategory()` implementation compares button text with the category value. As part of implementation, prefer comparing a stable `data-category` value rather than rendered text so that icons, whitespace, truncation, or localized labels cannot break selection. This is a small robustness improvement directly related to the new visual treatment.

The existing scroll indicator bars should be replaced by state-aware edge fades or real progress indicators. Decorative indicators that always show two bars should not remain if they do not represent the actual number of categories or the current scroll position.

The final implementation should keep category control rendering safe for dynamic values, preserve the existing sanitization approach, and avoid adding a second independent category state inside the bottom sheet.

## 16. Rollout plan

**Phase 1 — Visual foundation.** Update mobile spacing, chip hierarchy, active state, edge fade, and accessible labels while retaining the existing horizontal rail.

**Phase 2 — Overflow experience.** Add the `Lainnya` chip and bottom sheet only when the category count or available width requires it.

**Phase 3 — Validation.** Test the component on narrow Android and iOS-sized viewports, verify keyboard and screen-reader semantics, and confirm that desktop behavior is unchanged.

**Definition of done:** All must-have functional requirements pass, all acceptance criteria pass, no page-level horizontal overflow exists on supported mobile widths, and browser console verification shows no new errors.

## 17. Product recommendation

Adopt the **Compact Category Dock with conditional `Lainnya` bottom sheet**. This approach is more modern than the current plain chip strip without making every user open a modal. Common categories remain one tap away, less common categories remain discoverable, and the component scales as the catalog grows. It also minimizes risk because the existing category data flow and filter function can remain intact.
