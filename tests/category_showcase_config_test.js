const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const renderHost = {
    classList: { add() {}, toggle() {} },
    querySelectorAll: () => [],
    innerHTML: ''
};
const source = fs.readFileSync('assets/js/category-showcase.js', 'utf8');
const context = {
    console,
    window: {},
    document: { addEventListener() {}, getElementById: (id) => id === 'category-showcase' ? renderHost : null },
    ApiService: { get: async () => ({ success: true, config: {} }) },
    setTimeout,
    clearTimeout
};
vm.runInNewContext(source, context, { filename: 'category-showcase.js' });
const normalize = context.window.CategoryShowcase.normalizeConfig;
const normalizeBackgroundColor = context.window.CategoryShowcase.normalizeBackgroundColor;
const filterAvailableProducts = context.window.CategoryShowcase.filterAvailableProducts;
const sortProductsByAvailability = context.window.CategoryShowcase.sortProductsByAvailability;

assert.deepEqual(JSON.parse(JSON.stringify(normalize({ enabled: true, categories: [
    { category: ' Minyak   Goreng ', enabled: true, sort_order: 2, max_products: 10 },
    { category: 'minyak goreng', enabled: true, sort_order: 1, max_products: 10 },
    { category: 'Minuman', enabled: true, sort_order: 3, max_products: 51 },
    { category: 'Mie Instan', enabled: false, sort_order: 4, max_products: 5 }
] }))), {
    version: 1,
    enabled: true,
    background_color: '#f0fdf4',
    categories: [
        { category: 'Minyak Goreng', enabled: true, sort_order: 2, max_products: 10, image_url: '', image_alt: 'Promo kategori produk Minyak Goreng', theme_color: '#f0fdf4' },
        { category: 'Mie Instan', enabled: false, sort_order: 4, max_products: 5, image_url: '', image_alt: 'Promo kategori produk Mie Instan', theme_color: '#f0fdf4' }
    ]
});

assert.deepEqual(JSON.parse(JSON.stringify(normalize({ enabled: 'false', categories: [{ category: 'X', max_products: 0 }] }))), {
    version: 1, enabled: false, background_color: '#f0fdf4', categories: []
});
assert.equal(normalizeBackgroundColor('#10B981'), '#10b981');
assert.equal(normalizeBackgroundColor('red; background:url(javascript:alert(1))'), '#f0fdf4');
assert.equal(normalize({ background_color: '#abc' }).background_color, '#f0fdf4');
assert.equal(normalize({ background_color: '#f0fdf4', categories: [{ category: 'X', max_products: 1, theme_color: '#123456' }] }).categories[0].theme_color, '#123456');
assert.equal(normalize({ categories: [{ category: 'X', max_products: 1, image_url: 'javascript:alert(1)' }] }).categories[0].image_url, '');
assert.equal(normalize({ categories: [{ category: 'X', max_products: 1, image_url: 'https://example.com/x.webp' }] }).categories[0].image_url, 'https://example.com/x.webp');
const products = [
    { id: 'available-1', stok: 4, isHidden: false },
    { id: 'hidden', stok: 9, isHidden: true },
    { id: 'available-2', stok: 1, isHidden: false },
    { id: 'out-of-stock', stok: 0, isHidden: false },
    { id: 'hidden-zero-stock', stok: 0, isHidden: true },
    { id: 'unavailable-status', stok: 6, status: 'Tidak Tersedia', isHidden: false },
    { id: 'variation-stocked', stok: 0, variations: [{ stok: 0 }, { stok: 3 }], isHidden: false },
    { id: 'variation-empty', stok: 0, variations: [{ stok: 0 }], isHidden: false }
];
assert.deepEqual(sortProductsByAvailability(products).map((product) => product.id), [
    'available-1', 'available-2', 'variation-stocked', 'hidden', 'out-of-stock', 'hidden-zero-stock', 'unavailable-status', 'variation-empty'
]);
assert.deepEqual(filterAvailableProducts(products).map((product) => product.id), [
    'available-1', 'available-2', 'variation-stocked'
]);

const homepageSource = fs.readFileSync('assets/js/script.js', 'utf8');
const showcaseCss = fs.readFileSync('assets/css/category-showcase.css', 'utf8');
const adminSource = fs.readFileSync('admin/js/admin-script.js', 'utf8');
const adminMarkup = fs.readFileSync('admin/index.html', 'utf8');
const gasSource = fs.readFileSync('docs/gas_v71_category_showcase_merged.gs', 'utf8');
assert.match(homepageSource, /filterAvailableProducts\(allProducts\)/);
assert.match(homepageSource, /'tidak tersedia'/);

assert.doesNotMatch(source, /showcase-view-all|category-showcase-view-all|function viewAll/);
assert.doesNotMatch(source, /Lihat Semua/);
assert.match(source, /category-showcase-promo__image/);
assert.match(showcaseCss, /\.category-showcase-promo\s*\{[^}]*flex:\s*0 0/);
assert.match(showcaseCss, /\.category-showcase-promo\s*\{\s*display:\s*none;\s*\}/, 'category promo images should be hidden outside mobile widths by default');
assert.match(showcaseCss, /@media\s*\(max-width:\s*767px\)[\s\S]*?\.category-showcase-promo\s*\{[^}]*display:\s*flex/, 'category promo images should be shown on mobile only');
assert.match(showcaseCss, /flex-basis:\s*calc\(\(100vw - 3\.25rem\)\s*\/\s*2\.5\)/);
assert.match(showcaseCss, /flex-basis:\s*calc\(\(100% - 2\.6rem\)\s*\/\s*4\.25\)/);
assert.match(showcaseCss, /flex-basis:\s*calc\(\(100% - 4rem\)\s*\/\s*5\.2\)/);
assert.match(showcaseCss, /\.category-showcase-section\s*\{[^}]*border:\s*0;[^}]*border-radius:\s*0;/s, 'category panels should have square edges and no border');
assert.match(showcaseCss, /\.category-showcase-section::before\s*\{[^}]*background:\s*var\(--category-showcase-row-color,[^}]+\);[\s\S]*?width:\s*100vw;/, 'each category background should fill the full viewport width');
assert.match(showcaseCss, /\.category-showcase-title\s*\{[^}]*font-size:\s*18px;[^}]*font-weight:\s*600;/s, 'category titles should be 18px semibold');
assert.match(source, /<div class="category-showcase-header"><h2[^>]*class="category-showcase-title"[\s\S]*?<section class="category-showcase-section"/, 'the title should sit outside and above the colored category panel');
assert.doesNotMatch(source, /category-showcase-title-icon/, 'the title icon should be removed');
assert.doesNotMatch(showcaseCss, /category-showcase-title-icon/, 'unused title icon styles should be removed');
assert.doesNotMatch(showcaseCss, /\.category-showcase-promo\s*\{[^}]*border(?:-radius)?:/s, 'promo imagery should have no border or rounded corners');
assert.match(source, /class="category-showcase-section" style="--category-showcase-row-color:\$\{escapeAttribute\(entry\.theme_color\)\}"/, 'each category panel should retain its configured background');
assert.match(homepageSource, /product-card-shell bg-white/, 'product cards should remain white over the green surface');
assert.match(showcaseCss, /\.category-showcase-track\s*\{[^}]*overflow-x:\s*auto/s, 'horizontal carousel scrolling must remain enabled');
assert.match(showcaseCss, /scroll-behavior:\s*smooth;[\s\S]*?scroll-snap-type:\s*x mandatory;/, 'carousel movement should animate and snap to products');
assert.match(showcaseCss, /\.category-showcase-track\s*>\s*\.product-card-shell\s*\{[^}]*scroll-snap-stop:\s*always;/s, 'carousel transitions should settle on each product card');
assert.match(showcaseCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?scroll-snap-type:\s*none;/, 'carousel motion should respect reduced-motion preferences');
assert.match(adminMarkup, /id="category-showcase-background-color" type="color"/, 'admin should expose a native background color picker');
assert.match(adminMarkup, /Warna latar/, 'admin should expose a per-category background color column');
assert.match(adminMarkup, /data-action="category-showcase-color-reset"/, 'admin should provide a way to restore the default color');
assert.match(adminSource, /data-showcase-theme-color-hex type="text"/, 'admin should allow manual HEX entry for each category background');
assert.match(adminSource, /theme_color: themeColor/, 'admin should persist each category background independently');
assert.match(adminSource, /background_color: normalizeCategoryShowcaseBackgroundColor\(backgroundColor\)/, 'admin should persist the selected color in the existing showcase config');
assert.match(adminSource, /data-showcase-image-url/);
assert.match(adminSource, /Tempel URL gambar/);
assert.match(adminSource, /URL publik yang diawali http:\/\/ atau https:\/\//);
assert.doesNotMatch(adminSource, /readShowcaseImageAsBase64|uploadCategoryShowcaseImage|upload_category_showcase_image|data-showcase-image-file|type=\"file\"/, 'category showcase images should be configured with a URL, not file upload');
assert.match(gasSource, /background_color: normalizeCategoryShowcaseBackgroundV71\(source\.background_color\)/, 'GAS should validate the persisted color');
assert.match(gasSource, /background_color: config\.background_color/, 'public GAS response should expose only the normalized selected color');
assert.match(gasSource, /image_url: row\.image_url/);

console.log('category showcase config tests: PASS');
