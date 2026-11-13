const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('docs/gas_v71_blog_support_indomaret_latest.gs', 'utf8');
const sandbox = {
  console,
  isFinite,
  JSON,
  Date,
  String,
  Number,
  Math,
  RegExp,
  Array,
  Object,
  parseFloat,
  parseInt
};
vm.runInNewContext(source, sandbox, { filename: 'gas_v71_blog_support_indomaret_latest.gs' });

assert.strictEqual(
  sandbox.validateIndomaretSourceUrl('https://www.klikindomaret.com/xpress/beras-pulen').success,
  true,
  'KlikIndomaret primary host should be allowed'
);
assert.strictEqual(
  sandbox.validateIndomaretSourceUrl('https://subdomain.klikindomaret.com/product/beras').success,
  true,
  'Relevant KlikIndomaret subdomains should be allowed'
);
assert.strictEqual(
  sandbox.validateIndomaretSourceUrl('https://klikindomaret.com.attacker.example/product').success,
  false,
  'Lookalike domains must be rejected'
);
assert.strictEqual(
  sandbox.validateIndomaretSourceUrl('http://klikindomaret.com/product').success,
  false,
  'Non-HTTPS sources must be rejected'
);
assert.strictEqual(
  sandbox.validateIndomaretSourceUrl('https://klikindomaret.com:8443/product').success,
  false,
  'Non-standard ports must be rejected'
);
assert.strictEqual(
  sandbox.validateIndomaretSourceUrl('https://www.klikindomaret.com/xpress/beras-pulen?store=123').success,
  true,
  'Valid query-string URLs should be accepted without browser URL support'
);

const jsonLdHtml = `<!doctype html>
<html><head>
<script type="application/ld+json">{
  "@context":"https://schema.org",
  "@type":"Product",
  "name":"Indomaret Beras Pulen Wangi Premium 5kg",
  "description":"Beras pulen pilihan untuk kebutuhan keluarga.",
  "image":["/images/beras-premium.jpg"],
  "offers":{"price":"74500","priceCurrency":"IDR"}
}</script>
<meta property="og:title" content="Fallback title">
</head><body><h1>Fallback heading</h1></body></html>`;
const parsedJsonLd = sandbox.parseIndomaretProductHtml(
  jsonLdHtml,
  'https://www.klikindomaret.com/xpress/beras-pulen'
);
assert.strictEqual(parsedJsonLd.name, 'Indomaret Beras Pulen Wangi Premium 5kg');
assert.strictEqual(parsedJsonLd.reference_price, 74500);
assert.strictEqual(parsedJsonLd.reference_currency, 'IDR');
assert.strictEqual(parsedJsonLd.image_url, 'https://www.klikindomaret.com/images/beras-premium.jpg');
assert.strictEqual(parsedJsonLd.description, 'Beras pulen pilihan untuk kebutuhan keluarga.');

const fallbackHtml = `<!doctype html><html><head>
<title>Beras Pulen Wangi Premium 5kg</title>
<meta name="description" content="Beras berkualitas.">
<meta property="og:image" content="https://cdn.klikindomaret.com/beras.jpg">
</head><body><h1>Beras Pulen Wangi Premium 5kg</h1><div>Harga terbaru Rp 74.500</div></body></html>`;
const parsedFallback = sandbox.parseIndomaretProductHtml(
  fallbackHtml,
  'https://klikindomaret.com/xpress/beras-pulen'
);
assert.strictEqual(parsedFallback.name, 'Beras Pulen Wangi Premium 5kg');
assert.strictEqual(parsedFallback.reference_price, 74500);
assert.strictEqual(parsedFallback.image_url, 'https://cdn.klikindomaret.com/beras.jpg');
assert.strictEqual(parsedFallback.description, 'Beras berkualitas.');

assert.strictEqual(sandbox.normalizeImportMoney('Rp 74.500'), 74500);
assert.strictEqual(sandbox.normalizeImportMoney(''), null);
assert.strictEqual(
  sandbox.normalizeIndomaretImageUrl('javascript:alert(1)', 'https://klikindomaret.com/product'),
  '',
  'Unsafe image protocols must be rejected'
);

console.log('Indomaret importer backend tests passed.');
