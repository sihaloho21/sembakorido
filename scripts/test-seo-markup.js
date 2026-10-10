const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const productRoot = path.join(root, "produk");
const productPages = fs.existsSync(productRoot)
  ? fs.readdirSync(productRoot).map((slug) => path.join(productRoot, slug, "index.html"))
    .filter((file) => fs.existsSync(file))
  : [];

const fail = (message) => {
  throw new Error(`[SEO-02] ${message}`);
};

if (productPages.length === 0) fail("no generated product pages found");

for (const file of productPages) {
  const html = fs.readFileSync(file, "utf8");
  const slug = path.basename(path.dirname(file));
  const canonical = `https://paketsembako.com/produk/${slug}/`;
  const jsonLdBlocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((match) => JSON.parse(match[1]));
  const product = jsonLdBlocks.find((data) => data["@type"] === "Product");
  const breadcrumb = jsonLdBlocks.find((data) => data["@type"] === "BreadcrumbList");

  if (!html.includes(`<link rel="canonical" href="${canonical}">`)) fail(`${slug}: canonical mismatch`);
  if (!product) fail(`${slug}: Product JSON-LD missing`);
  if (!product.name || !product.description || !product.sku) fail(`${slug}: Product identity incomplete`);
  if (!Array.isArray(product.image) || product.image.length === 0 || product.image.some((url) => !/^https:\/\//i.test(url))) {
    fail(`${slug}: Product image must contain absolute HTTPS URL`);
  }
  const offers = Array.isArray(product.offers) ? product.offers : [product.offers];
  if (!offers.length || offers.some((offer) => !offer || offer.priceCurrency !== "IDR" || !offer.price || !offer.url || !offer.availability)) {
    fail(`${slug}: Offer must include URL, IDR price, and availability`);
  }
  if (!breadcrumb || breadcrumb.itemListElement?.length < 2) fail(`${slug}: BreadcrumbList incomplete`);
}

const homepage = fs.readFileSync(path.join(root, "index.html"), "utf8");
if (!homepage.includes('"@type": "Organization"') || !homepage.includes('https://paketsembako.com/assets/img/logo-share.png')) {
  fail("homepage Organization schema or absolute logo is missing");
}

console.log(`SEO-02 markup passed (${productPages.length} product pages checked)`);
