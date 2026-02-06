const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const cssPath = path.join(__dirname, "..", "assets", "css", "tailwind.min.css");
const readmePath = path.join(__dirname, "..", "README.md");

if (!fs.existsSync(cssPath)) {
  console.error("tailwind.min.css not found. Run `npm run build:tailwind`.");
  process.exit(1);
}

if (!fs.existsSync(readmePath)) {
  console.error("README.md not found.");
  process.exit(1);
}

const cssBuffer = fs.readFileSync(cssPath);
const gzipBuffer = zlib.gzipSync(cssBuffer);
const brotliBuffer = zlib.brotliCompressSync(cssBuffer);

const format = (bytes) => {
  const kb = bytes / 1024;
  return `${kb.toFixed(2)} KB`;
};

const raw = format(cssBuffer.length);
const gzip = format(gzipBuffer.length);
const brotli = format(brotliBuffer.length);

const readme = fs.readFileSync(readmePath, "utf8");
const start = "<!-- CSS_SIZE_BADGES_START -->";
const end = "<!-- CSS_SIZE_BADGES_END -->";

if (!readme.includes(start) || !readme.includes(end)) {
  console.error("CSS size badge block not found in README.md.");
  process.exit(1);
}

const expected = [
  start,
  `![Tailwind Raw](https://img.shields.io/badge/Tailwind%20Raw-${raw.replace(" ", "")}-blue)`,
  `![Tailwind Gzip](https://img.shields.io/badge/Tailwind%20Gzip-${gzip.replace(" ", "")}-blue)`,
  `![Tailwind Brotli](https://img.shields.io/badge/Tailwind%20Brotli-${brotli.replace(" ", "")}-blue)`,
  end
].join("\n");

const actual = readme.match(new RegExp(`${start}[\\s\\S]*?${end}`));

if (!actual || actual[0] !== expected) {
  console.error("CSS size badges are out of date in README.md.");
  console.error("Run `WRITE_CSS_BADGES=1 node scripts/report-css-size.js` to update.");
  process.exit(1);
}

console.log("CSS size badges are up to date.");
