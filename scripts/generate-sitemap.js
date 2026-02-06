const fs = require("fs");
const path = require("path");

const domain = "https://paketsembako.com";
const today = new Date().toISOString().slice(0, 10);

const pages = [
  { loc: `${domain}/`, changefreq: "weekly", priority: "1.0" },
  { loc: `${domain}/akun.html`, changefreq: "monthly", priority: "0.6" },
  { loc: `${domain}/promo.html`, changefreq: "weekly", priority: "0.8" },
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
    const slug = row.slug ? slugify(row.slug) : slugify(row.nama);
    if (!slug) return;
    products.push({
      loc: `${domain}/#produk-${slug}`,
      changefreq: "weekly",
      priority: "0.5",
      lastmod: parseLastmod(row)
    });
  });
}

const pagesSitemap = buildUrlset(pages);
const productsSitemap = buildUrlset(products);

const root = path.resolve(__dirname, "..");
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
