const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const renderStyles = {};
const renderHost = {
    style: { setProperty: (name, value) => { renderStyles[name] = value; } },
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
const getContrastTextColor = context.window.CategoryShowcase.getContrastTextColor;
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
        { category: 'Minyak Goreng', enabled: true, sort_order: 2, max_products: 10 },
        { category: 'Mie Instan', enabled: false, sort_order: 4, max_products: 5 }
    ]
});

assert.deepEqual(JSON.parse(JSON.stringify(normalize({ enabled: 'false', categories: [{ category: 'X', max_products: 0 }] }))), {
    version: 1, enabled: false, background_color: '#f0fdf4', categories: []
});
assert.equal(normalizeBackgroundColor('#10B981'), '#10b981');
assert.equal(normalizeBackgroundColor('red; background:url(javascript:alert(1))'), '#f0fdf4');
assert.equal(normalize({ background_color: '#abc' }).background_color, '#f0fdf4');
assert.equal(getContrastTextColor('#f0fdf4'), '#1f2937');
assert.equal(getContrastTextColor('#123456'), '#ffffff');
context.window.CategoryShowcase.render({ enabled: true, background_color: '#123456', categories: [] });
assert.equal(renderStyles['--category-showcase-background'], '#123456');
assert.equal(renderStyles['--category-showcase-heading'], '#ffffff');
context.window.CategoryShowcase.render({ enabled: true, background_color: 'invalid', categories: [] });
assert.equal(renderStyles['--category-showcase-background'], '#f0fdf4');
assert.equal(renderStyles['--category-showcase-heading'], '#1f2937');

const products = [
    { id: 'available-1', stok: 4, isHidden: false },
    { id: 'hidden', stok: 9, isHidden: true },
    { id: 'available-2', stok: 1, isHidden: false },
    { id: 'out-of-stock', stok: 0, isHidden: false },
    { id: 'hidden-zero-stock', stok: 0, isHidden: true },
    { id: 'unavailable-status', stok: 6, status: 'Tidak Tersedia', isHidden: false }
];
assert.deepEqual(sortProductsByAvailability(products).map((product) => product.id), [
    'available-1', 'available-2', 'hidden', 'out-of-stock', 'hidden-zero-stock', 'unavailable-status'
]);
assert.deepEqual(filterAvailableProducts(products).map((product) => product.id), [
    'available-1', 'available-2'
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
assert.match(source, /category-showcase-title-icon/);
assert.match(showcaseCss, /category-showcase-header::before/);
assert.match(showcaseCss, /flex-basis:calc\(\(100vw - 3\.25rem\)\/2\.5\)/);
assert.match(showcaseCss, /flex-basis:calc\(\(100% - 2\.6rem\)\/4\.25\)/);
assert.match(showcaseCss, /flex-basis:calc\(\(100% - 4rem\)\/5\.2\)/);
assert.match(showcaseCss, /\.category-showcase-section\{background:var\(--category-showcase-background,#f0fdf4\);border:1px solid #dcfce7;border-radius:1rem;box-sizing:border-box;padding:/, 'each carousel section should use its configurable background with a safe default');
assert.match(showcaseCss, /@media\(max-width:767px\)\{\.category-showcase-section\{border-radius:\.875rem;padding:/, 'green panels should keep responsive mobile spacing');
assert.match(showcaseCss, /\.category-showcase-title\{color:var\(--category-showcase-heading,#1f2937\)\}/, 'carousel headings should use the contrast color computed for the selected background');
assert.match(source, /class="category-showcase-section"/, 'the green surface should apply to existing category showcase sections');
assert.match(homepageSource, /product-card-shell bg-white/, 'product cards should remain white over the green surface');
assert.match(showcaseCss, /\.category-showcase-track\{[^}]*overflow-x:auto/, 'horizontal carousel scrolling must remain enabled');
assert.match(adminMarkup, /id="category-showcase-background-color" type="color"/, 'admin should expose a native background color picker');
assert.match(adminMarkup, /data-action="category-showcase-color-reset"/, 'admin should provide a way to restore the default color');
assert.match(adminSource, /background_color: normalizeCategoryShowcaseBackgroundColor\(backgroundColor\)/, 'admin should persist the selected color in the existing showcase config');
assert.match(source, /host\.style\.setProperty\('--category-showcase-background', safeConfig\.background_color\)/, 'storefront should apply the validated server color to showcase sections');
assert.match(gasSource, /background_color: normalizeCategoryShowcaseBackgroundV71\(source\.background_color\)/, 'GAS should validate the persisted color');
assert.match(gasSource, /background_color: config\.background_color/, 'public GAS response should expose only the normalized selected color');

console.log('category showcase config tests: PASS');
