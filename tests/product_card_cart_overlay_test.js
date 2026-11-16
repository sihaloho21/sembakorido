const assert = require('node:assert/strict');
const fs = require('node:fs');

const script = fs.readFileSync('assets/js/script.js', 'utf8');
const showcase = fs.readFileSync('assets/js/category-showcase.js', 'utf8');
const css = fs.readFileSync('assets/css/category-showcase.css', 'utf8');
const rendererStart = script.indexOf('function renderProducts(products) {');
const rendererEnd = script.indexOf('\nfunction sortProductsByAvailability', rendererStart);
assert.notEqual(rendererStart, -1, 'renderProducts should exist');
assert.notEqual(rendererEnd, -1, 'renderProducts should have a clear end');
const renderer = script.slice(rendererStart, rendererEnd);
const quickViewStart = script.indexOf('function openQuickView(product) {');
const quickViewEnd = script.indexOf('\nfunction closeQuickView', quickViewStart);
const quickView = script.slice(quickViewStart, quickViewEnd);

const imageWrapperStart = renderer.indexOf('<div class="lazy-image-wrapper');
const imageContentStart = renderer.indexOf('<div class="p-2 md:p-3">', imageWrapperStart);
const overlaySlotStart = renderer.indexOf('class="product-card-cart-slot product-card-cart-slot--overlay"');
const titleStart = renderer.indexOf('<h4 class="text-[11px]', imageContentStart);
const rewardBadgePosition = renderer.indexOf('${rewardPointsBadge}');
const priceRowStart = renderer.indexOf('product-card-price-row', titleStart);
assert.ok(imageWrapperStart >= 0 && imageContentStart > imageWrapperStart, 'image wrapper and product content should exist');
assert.ok(overlaySlotStart > imageWrapperStart && overlaySlotStart < imageContentStart, 'cart slot must be inside the image wrapper');
assert.ok(rewardBadgePosition >= 0 && rewardBadgePosition < imageWrapperStart, 'reward points badge should return to the image upper-left overlay');
assert.match(renderer, /absolute top-0 left-0 z-10 flex flex-col gap-1/, 'reward points badge wrapper should touch the card top and left edges');
assert.match(renderer, /rounded-br-lg rounded-tl-lg md:rounded-tl-xl/, 'reward badge corner should align with the rounded card corner');
assert.ok(titleStart > imageContentStart && priceRowStart > titleStart, 'product title should remain above the price');
assert.doesNotMatch(renderer.slice(imageWrapperStart, imageContentStart), /rewardPointsBadge/, 'reward badge should not be duplicated in the image content');
assert.doesNotMatch(renderer, /stokLabel|product-card-stock-badge|Stok tersedia|Stok habis|Tidak Tersedia/, 'homepage product cards should not display stock availability status');
assert.doesNotMatch(quickView, /p2-stock-indicator|stock\.text|stock\.detail|getP2StockLabel/, 'homepage quick view should not display stock availability status');
assert.equal((renderer.match(/data-product-cart-slot/g) || []).length, 1, 'the shared renderer should emit one cart slot only');
assert.match(renderer, /!isHiddenProd\s*&&\s*!hasVariations[\s\S]*?product-card-cart-slot--overlay/, 'only available simple products should render the overlay slot');
assert.match(renderer, /!isHiddenProd\s*&&\s*hasVariations[\s\S]*?aria-label="Lihat Pilihan"/, 'variation products should retain the existing choice action');
assert.match(renderer, /const imageActionAttrs = isHiddenProd \? '' : `data-action="show-detail"/, 'the image should retain its detail action');
assert.match(renderer, /data-cart-mode="\$\{inlineCartState\.mode\}" data-cart-qty="\$\{inlineCartState\.quantity\}"/, 'slot state attributes must remain available to cart synchronization');
assert.doesNotMatch(renderer, /product-card-cart-slot[^\n]*\n[^`]*flex items-center justify-end/, 'the cart slot should not remain in the lower action row');

assert.match(script, /querySelectorAll\('\[data-product-cart-slot\]'\)/, 'cart synchronization must continue to find every slot');
assert.match(script, /case 'add-to-cart':[\s\S]*?case 'update-product-card-qty'/, 'delegated cart actions must remain handled by the product grid');
assert.match(showcase, /host\.addEventListener\('click',[\s\S]*?handleAction\(event\)/, 'carousel cards must keep delegated action handling');
assert.match(showcase, /'show-detail', 'add-to-cart', 'update-product-card-qty'/, 'carousel delegation must support detail and cart controls');

assert.match(script, /<button type="button" data-action="add-to-cart"/, 'add control must be a semantic button');
assert.match(script, /focus-visible:ring-2/, 'cart buttons must retain visible keyboard focus');
assert.match(css, /\.product-card-cart-slot--overlay\s*\{[^}]*position:\s*absolute;[^}]*right:/s, 'overlay should be positioned at the image upper-right corner');
assert.match(css, /z-index:\s*20/, 'overlay should appear above image and non-interactive badges');
assert.match(css, /@media\s*\(max-width:\s*420px\)/, 'stepper sizing should adapt for narrow phones');
assert.match(css, /@media\s*\(max-width:\s*359px\)/, 'controls should fit the narrowest supported phone layout');
assert.match(css, /min-height:\s*2\.5rem;\s*min-width:\s*2\.5rem/, 'add target should reach 40px where the viewport permits');
assert.match(css, /product-card-cart-slot--overlay\s+\.product-card-cart-step-button\s*\{[^}]*flex:\s*0 0 2\.25rem;[^}]*height:\s*2\.25rem;[^}]*width:\s*2\.25rem/s, 'desktop stepper buttons should be reduced to 36px');
assert.match(css, /flex-basis:\s*1\.875rem;\s*height:\s*1\.875rem;\s*width:\s*1\.875rem/, 'mobile stepper buttons should be reduced to 30px');
assert.match(css, /min-width:\s*min\(5\.75rem,\s*100%\)/, 'stepper minimum width should be reduced to 92px');
assert.doesNotMatch(css, /product-card-reward-badge/, 'unused reward badge CSS should be removed after restoring the original overlay');

console.log('product card cart overlay tests: PASS');
