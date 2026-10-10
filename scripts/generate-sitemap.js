const fs = require("fs");
const path = require("path");

const domain = "https://paketsembako.com";
const today = new Date().toISOString().slice(0, 10);

const pages = [
  { loc: `${domain}/`, changefreq: "weekly", priority: "1.0" },
  { loc: `${domain}/akun.html`, changefreq: "monthly", priority: "0.6" },
  { loc: `${domain}/transaksi.html`, changefreq: "daily", priority: "0.8" },
  { loc: `${domain}/notifikasi.html`, changefreq: "daily", priority: "0.7" },
  { loc: `${domain}/promo_katalog.html`, changefreq: "monthly", priority: "0.7" }
];

const buildUrlset = (entries) => {
  const urls = entries
    .map((entry) => {
      return [
        "  <url>",
        `    <loc>${entry.loc}</loc>`,
        `    <lastmod>${entry.lastmod || today}</lastmod>`,
        entry.changefreq ? `    <changefreq>${entry.changefreq}</changefreq>` : "",
        entry.priority ? `    <priority>${entry.priority}</priority>` : "",
        "  </url>"
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    "</urlset>"
  ].join("\n");
};

const slugify = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[-\s]+/g, "-");

const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const escapeJson = (value) => JSON.stringify(value).replace(/</g, "\\u003c");

const formatCurrency = (value) => {
  const amount = Number.parseInt(String(value || "").replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(amount) && amount > 0
    ? `Rp ${amount.toLocaleString("id-ID")}`
    : "Harga tersedia di katalog";
};

const parseJsonArray = (value) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
};

const getImageUrls = (value) => String(value || "")
  .split(",")
  .map((url) => url.trim())
  .filter((url) => /^https:\/\//i.test(url));

const toPrice = (value) => {
  const price = Number.parseInt(String(value || "").replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(price) && price > 0 ? price : null;
};

const renderProductPage = (product) => {
  const name = escapeHtml(product.nama);
  const description = escapeHtml(product.deskripsi || `Produk ${product.nama} dari Paket Sembako.`);
  const imageUrls = getImageUrls(product.gambar);
  const image = escapeHtml(imageUrls[0] || "https://placehold.co/800x600?text=Produk");
  const canonical = `${domain}/produk/${product.slug}/`;
  const price = toPrice(product.harga);
  const variations = parseJsonArray(product.variasi)
    .map((variation) => ({
      name: String(variation.nama || variation.name || "").trim(),
      sku: String(variation.sku || "").trim(),
      price: toPrice(variation.harga || variation.price),
      stock: Number.parseInt(variation.stok, 10) || 0
    }))
    .filter((variation) => variation.name && variation.price);
  const offers = (variations.length ? variations : [{
    name: product.nama,
    sku: product.id || product.slug,
    price,
    stock: Number.parseInt(product.stok, 10) || 0
  }]).filter((offer) => offer.price).map((offer) => ({
    "@type": "Offer",
    url: canonical,
    name: offer.name,
    sku: offer.sku || product.slug,
    priceCurrency: "IDR",
    price: String(offer.price),
    availability: offer.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    itemCondition: "https://schema.org/NewCondition"
  }));
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.nama,
    description: product.deskripsi || `Produk ${product.nama} dari Paket Sembako.`,
    image: imageUrls.length ? imageUrls : undefined,
    sku: product.id || product.slug,
    category: product.kategori || undefined,
    brand: { "@type": "Brand", name: "Paket Sembako" },
    offers: offers.length ? offers : undefined
  };
  const breadcrumbData = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Beranda", item: `${domain}/` },
      { "@type": "ListItem", position: 2, name: product.nama, item: canonical }
    ]
  };
  const variantMarkup = variations.length
    ? `<section class="variants" aria-labelledby="variants-title"><h2 id="variants-title">Pilihan ukuran</h2><ul>${variations.map((variation) => `<li><strong>${escapeHtml(variation.name)}</strong> — ${formatCurrency(variation.price)} — ${variation.stock > 0 ? "Stok tersedia" : "Stok habis"}</li>`).join("")}</ul></section>`
    : "";

  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${name} — Paket Sembako</title>
  <meta name="description" content="${description}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="product">
  <meta property="og:title" content="${name} — Paket Sembako">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${image}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${name} — Paket Sembako">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${image}">
  <script type="application/ld+json">${escapeJson(structuredData)}</script>
  <script type="application/ld+json">${escapeJson(breadcrumbData)}</script>
  <style>
    :root { color-scheme: light; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: #f8fafc; color: #172033; }
    main { max-width: 960px; margin: 0 auto; padding: 32px 20px 64px; }
    .crumbs { margin-bottom: 24px; font-size: 14px; }
    .crumbs a { color: #15803d; }
    .card { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 32px; padding: 24px; background: white; border-radius: 20px; box-shadow: 0 10px 30px rgb(15 23 42 / 8%); }
    img { width: 100%; aspect-ratio: 4 / 3; object-fit: contain; background: #f1f5f9; border-radius: 14px; }
    h1 { margin-top: 0; font-size: clamp(28px, 5vw, 44px); line-height: 1.1; }
    .price { color: #15803d; font-size: 28px; font-weight: 800; }
    .stock { color: #475569; }
    .variants { margin-top: 24px; padding-top: 18px; border-top: 1px solid #e2e8f0; }
    .variants h2 { margin: 0 0 8px; font-size: 17px; }
    .variants ul { margin: 0; padding-left: 20px; color: #475569; }
    .variants li + li { margin-top: 6px; }
    .cta { display: inline-block; margin-top: 20px; padding: 12px 18px; border-radius: 999px; background: #16a34a; color: white; text-decoration: none; font-weight: 700; }
    @media (max-width: 700px) { .card { grid-template-columns: 1fr; padding: 16px; } main { padding: 20px 14px 48px; } }
  </style>
</head>
<body>
  <main>
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Beranda</a> / <span>${name}</span></nav>
    <article class="card">
      <div><img src="${image}" alt="${name}" width="800" height="600"></div>
      <div>
        <h1>${name}</h1>
        <p class="price">${formatCurrency(product.harga)}</p>
        <p class="stock">${Number.parseInt(product.stok, 10) > 0 ? "Stok tersedia" : "Stok sedang habis"}</p>
        <p>${description.replace(/\n/g, "<br>")}</p>
        ${variantMarkup}
        <a class="cta" href="/#produk-${encodeURIComponent(product.slug)}">Lihat di katalog</a>
      </div>
    </article>
  </main>
</body>
</html>
`.replace(/^[ \t]+$/gm, "");
};

const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(current);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      current = "";
      continue;
    }
    current += char;
  }
  if (current.length || row.length) {
    row.push(current);
    if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  }
  return rows;
};

const parseLastmod = (row) => {
  const candidates = [
    row.updated_at,
    row.last_updated,
    row.lastmod,
    row.tanggal,
    row.updatedAt,
    row.updated
  ].filter(Boolean);
  for (const candidate of candidates) {
    const date = new Date(candidate);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
  }
  if (row.id && /^\d{11,}$/.test(String(row.id))) {
    const date = new Date(Number(row.id));
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
  }
  return today;
};

const products = [];
const usedSlugs = new Set();
const productsCsv = path.join(__dirname, "..", "Paket Sembako - products.csv");
if (fs.existsSync(productsCsv)) {
  const csvText = fs.readFileSync(productsCsv, "utf8");
  const rows = parseCsv(csvText);
  const header = rows.shift() || [];
  rows.forEach((cells) => {
    const row = {};
    header.forEach((key, idx) => {
      row[key] = cells[idx] || "";
    });
    if (!row.nama) return;
    const baseSlug = row.slug ? slugify(row.slug) : slugify(row.nama);
    if (!baseSlug) return;
    let slug = baseSlug;
    if (usedSlugs.has(slug)) {
      const suffix = slugify(row.id) || String(products.length + 1);
      slug = `${baseSlug}-${suffix}`;
    }
    usedSlugs.add(slug);
    products.push({
      slug,
      nama: row.nama,
      harga: row.harga,
      gambar: row.gambar,
      stok: row.stok,
      deskripsi: row.deskripsi,
      kategori: row.kategori,
      variasi: row.variasi,
      loc: `${domain}/produk/${slug}/`,
      changefreq: "weekly",
      priority: "0.5",
      lastmod: parseLastmod(row)
    });
  });
}

const pagesSitemap = buildUrlset(pages);
const productsSitemap = buildUrlset(products);

const root = path.resolve(__dirname, "..");
const productRoot = path.join(root, "produk");
fs.mkdirSync(productRoot, { recursive: true });
products.forEach((product) => {
  const productDir = path.join(productRoot, product.slug);
  fs.mkdirSync(productDir, { recursive: true });
  fs.writeFileSync(path.join(productDir, "index.html"), renderProductPage(product));
});
fs.writeFileSync(path.join(root, "sitemap-pages.xml"), pagesSitemap);
fs.writeFileSync(path.join(root, "sitemap-products.xml"), productsSitemap);

const sitemapIndex = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  "  <sitemap>",
  `    <loc>${domain}/sitemap-pages.xml</loc>`,
  `    <lastmod>${today}</lastmod>`,
  "  </sitemap>",
  "  <sitemap>",
  `    <loc>${domain}/sitemap-products.xml</loc>`,
  `    <lastmod>${today}</lastmod>`,
  "  </sitemap>",
  "</sitemapindex>"
].join("\n");

fs.writeFileSync(path.join(root, "sitemap.xml"), sitemapIndex);

console.log("Sitemap files generated.");
