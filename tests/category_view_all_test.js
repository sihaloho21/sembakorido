const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const showcaseSource = fs.readFileSync('assets/js/category-showcase.js', 'utf8');
const storefrontSource = fs.readFileSync('assets/js/script.js', 'utf8');
const homepageMarkup = fs.readFileSync('index.html', 'utf8');
const showcaseHost = {
    style: { setProperty() {} },
    classList: { add() {}, toggle() {} },
    innerHTML: '',
    querySelectorAll() { return []; },
    addEventListener() {}
};
const showcaseWindow = {
    location: {
        href: 'https://shop.example.test/index.html?campaign=ramadan#top',
        search: '?campaign=ramadan',
        pathname: '/index.html'
    },
    categoryShowcaseProducts: [
        { id: 'beras-1', category: 'Keperluan Dapur', nama: 'Beras Premium', stok: 3, isHidden: false },
        { id: 'susu-1', category: 'Susu & Olahan', nama: 'Susu Murni', stok: 4, isHidden: false },
        { id: 'susu-2', category: 'Susu Olahan', nama: 'Susu Olahan', stok: 2, isHidden: false }
    ]
};
const showcaseDocument = {
    getElementById(id) { return id === 'category-showcase' ? showcaseHost : null; },
    addEventListener() {}
};
const showcaseContext = {
    window: showcaseWindow,
    document: showcaseDocument,
    URL,
    URLSearchParams,
    console,
    escapeHtml(value) {
        return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
};
vm.runInNewContext(showcaseSource, showcaseContext, { filename: 'category-showcase.js' });

const showcase = showcaseWindow.CategoryShowcase;
assert.equal(showcase.slugifyCategory('Keperluan Dapur'), 'keperluan-dapur');
assert.equal(showcase.buildCategoryPageUrl('Beras'), '/index.html?view=category&category=beras');
assert.equal(showcase.slugifyCategory('Susu & Olahan'), showcase.slugifyCategory('Susu Olahan'));
assert.equal(showcase.buildCategoryPageUrl('Susu & Olahan'), '/index.html?view=category&category=susu-olahan&category_name=Susu+%26+Olahan');
assert.equal(showcase.buildCategoryPageUrl('Susu Olahan'), '/index.html?view=category&category=susu-olahan&category_name=Susu+Olahan');
showcase.render({
    enabled: true,
    categories: [
        { category: 'Keperluan Dapur', enabled: true, sort_order: 1, max_products: 8 },
        { category: 'Susu & Olahan', enabled: true, sort_order: 2, max_products: 8 },
        { category: 'Susu Olahan', enabled: true, sort_order: 3, max_products: 8 }
    ]
});
assert.match(showcaseHost.innerHTML, /class="category-showcase-view-all"/);
assert.match(showcaseHost.innerHTML, /Lihat Semua/);
assert.match(showcaseHost.innerHTML, /aria-label="Lihat semua produk dalam kategori Keperluan Dapur"/);
assert.match(showcaseHost.innerHTML, /href="\/index\.html\?view=category&amp;category=keperluan-dapur"/);
assert.match(showcaseHost.innerHTML, /href="\/index\.html\?view=category&amp;category=susu-olahan&amp;category_name=Susu\+%26\+Olahan"/);
assert.match(showcaseHost.innerHTML, /href="\/index\.html\?view=category&amp;category=susu-olahan&amp;category_name=Susu\+Olahan"/);

function extractFunction(source, name) {
    const start = source.indexOf(`function ${name}(`);
    assert.notEqual(start, -1, `function ${name} should exist`);
    const nextFunction = source.indexOf('\nfunction ', start + 1);
    return source.slice(start, nextFunction === -1 ? source.length : nextFunction);
}

const helperNames = [
    'normalizeCategoryLabel',
    'slugifyCategoryLabel',
    'resolveCategoryNameFromRoute',
    'formatCategoryResultsCount',
    'normalizeSearch',
    'tokenize',
    'matchesQuery',
    'getCategoryPageProducts'
];
const helperContext = {
    window: { CategoryShowcase: showcase },
    categoryPageCategoryRecord: null,
    allCategories: [],
    hasProductAvailableStock(product) {
        const ownStock = Number(product && product.stok);
        return (Number.isFinite(ownStock) && ownStock > 0) ||
            (Array.isArray(product && product.variations) && product.variations.some((variation) => Number(variation && variation.stok) > 0));
    }
};
const helperProgram = [
    ...helperNames.map((name) => extractFunction(storefrontSource, name)),
    'globalThis.categoryViewTestHelpers = { formatCategoryResultsCount, getCategoryPageProducts, resolveCategoryNameFromRoute };'
].join('\n\n');
vm.runInNewContext(helperProgram, helperContext, { filename: 'category-view-helpers.js' });

const categoryProducts = [
    {
        id: 'variant-label-match',
        category: 'Beras',
        nama: 'Beras Ramos',
        stok: 0,
        variations: [{ nama: 'Premium Slyp 5 kg', stok: 4 }]
    },
    { id: 'name-match', category: 'Beras', nama: 'Beras Premium', stok: 3, variations: [] },
    { id: 'other-category', category: 'Bahan Kue', nama: 'Beras Slyp', stok: 5, variations: [] },
    { id: 'no-stock', category: 'Beras', nama: 'Beras Slyp', stok: 0, variations: [{ nama: '5 kg', stok: 0 }] },
    { id: 'hidden', category: 'Beras', nama: 'Beras Slyp', stok: 5, isHidden: true, variations: [] }
];
const searchByVariant = helperContext.categoryViewTestHelpers.getCategoryPageProducts(categoryProducts, 'beras', 'slyp');
assert.deepEqual(Array.from(searchByVariant, (product) => product.id), ['variant-label-match']);
const allAvailableInCategory = helperContext.categoryViewTestHelpers.getCategoryPageProducts(categoryProducts, 'Beras', '');
assert.deepEqual(Array.from(allAvailableInCategory, (product) => product.id), ['variant-label-match', 'name-match']);
helperContext.categoryPageCategoryRecord = { id: 'rice-category' };
const productsWithCategoryIds = [
    { id: 'direct-category-product', kategori_id: 'rice-category', category: 'Beras', stok: 1 },
    { id: 'other-category-product', kategori_id: 'other-category', category: 'Beras', stok: 1 },
    { id: 'legacy-category-product', category: 'Beras', stok: 1 }
];
const directCategoryProducts = helperContext.categoryViewTestHelpers.getCategoryPageProducts(productsWithCategoryIds, 'Beras', '');
assert.deepEqual(Array.from(directCategoryProducts, (product) => product.id), ['direct-category-product', 'legacy-category-product']);
helperContext.categoryPageCategoryRecord = null;
assert.equal(helperContext.categoryViewTestHelpers.formatCategoryResultsCount(24), 'Menampilkan 24 Produk');
assert.equal(helperContext.categoryViewTestHelpers.formatCategoryResultsCount(0), 'Menampilkan 0 Produk');
const categoryNames = ['Susu & Olahan', 'Susu Olahan', 'Beras'];
assert.equal(helperContext.categoryViewTestHelpers.resolveCategoryNameFromRoute(categoryNames, 'susu-olahan', 'Susu Olahan'), 'Susu Olahan');
assert.equal(helperContext.categoryViewTestHelpers.resolveCategoryNameFromRoute(categoryNames, 'susu-olahan', 'Susu & Olahan'), 'Susu & Olahan');
assert.equal(helperContext.categoryViewTestHelpers.resolveCategoryNameFromRoute(categoryNames, 'susu-olahan', ''), '');
assert.equal(helperContext.categoryViewTestHelpers.resolveCategoryNameFromRoute(categoryNames, 'beras', ''), 'Beras');
assert.equal(helperContext.categoryViewTestHelpers.resolveCategoryNameFromRoute(['Beras  Premium', 'Beras Premium'], 'beras-premium', ''), 'Beras  Premium');

assert.match(homepageMarkup, /id="category-page-view"/);
assert.match(homepageMarkup, /id="category-product-search-form"/);
assert.match(homepageMarkup, /id="category-results-count"[^>]*aria-live="polite"/);
assert.match(storefrontSource, /params\.get\('view'\) === 'category'/);
assert.match(storefrontSource, /categoryPageMode\) resolveCategoryPageRoute\(\)/);
assert.match(storefrontSource, /getCategoryPageProducts\(allProducts, categoryPageCategory, categoryQuery\)/);
assert.match(storefrontSource, /setTimeout\(\(\) => filterProducts\(\), 160\)/);

console.log('category view all tests: PASS');
