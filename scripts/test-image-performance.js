const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const optimizedLogo = path.join(root, "assets/img/logo-optimized.webp");
const logoStats = fs.statSync(optimizedLogo);
const logoBytes = fs.readFileSync(optimizedLogo);
const criticalPromo = path.join(root, "assets/img/promo-critical.webp");
const criticalPromoStats = fs.statSync(criticalPromo);
const criticalPromoBytes = fs.readFileSync(criticalPromo);

assert(logoStats.size < 100 * 1024, "optimized logo must remain below 100 KB");
assert.strictEqual(logoBytes.toString("ascii", 0, 4), "RIFF", "optimized logo must be a RIFF WebP");
assert.strictEqual(logoBytes.toString("ascii", 8, 12), "WEBP", "optimized logo must be WebP");
assert(criticalPromoStats.size < 100 * 1024, "critical promo banner must remain below 100 KB");
assert.strictEqual(criticalPromoBytes.toString("ascii", 0, 4), "RIFF", "critical promo banner must be a RIFF WebP");
assert.strictEqual(criticalPromoBytes.toString("ascii", 8, 12), "WEBP", "critical promo banner must be WebP");

for (const file of ["index.html", "akun.html", "promo_katalog.html", "admin_katalog.html"]) {
  const html = fs.readFileSync(path.join(root, file), "utf8");
  assert(!html.includes("assets/img/logo.png"), `${file} still references the 1 MB logo PNG`);
  assert(!html.includes("assets/img/logo-share.png"), `${file} still references the duplicate logo-share PNG`);
}

const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const account = fs.readFileSync(path.join(root, "akun.html"), "utf8");
const adminCatalog = fs.readFileSync(path.join(root, "admin_katalog.html"), "utf8");
assert(index.includes('rel="preload" as="image" href="assets/img/promo-critical.webp"'), "homepage must preload the critical promo banner");
assert(index.includes('src="assets/img/promo-critical.webp"'), "homepage must render the local critical promo banner fallback");
const hasAttributes = (html, marker, attributes) => {
  const tag = html.split("\n").find((line) => line.includes(marker) && line.includes("<img")) || "";
  return attributes.every((attribute) => tag.includes(attribute));
};
assert(hasAttributes(index, "empty_basket.webp", ['loading="lazy"', 'width="256"', 'height="256"']), "empty basket needs lazy loading and dimensions");
assert(hasAttributes(account, "gift-box.png", ['loading="lazy"', 'width="512"', 'height="512"']), "gift box needs lazy loading and dimensions");
assert(hasAttributes(adminCatalog, "catalog.thumbnail", ['loading="lazy"', 'width="80"', 'height="112"']), "catalog thumbnails need lazy loading and dimensions");

console.log(`PERF-02 image checks passed (logo ${Math.round(logoStats.size / 1024)} KB)`);
