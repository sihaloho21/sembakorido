const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const cssPath = path.join(__dirname, "..", "assets", "css", "tailwind.min.css");

if (!fs.existsSync(cssPath)) {
  console.error("tailwind.min.css not found. Run `npm run build:tailwind`.");
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

console.log("Tailwind CSS size report:");
console.log(`- Raw: ${raw}`);
console.log(`- Gzip: ${gzip}`);
console.log(`- Brotli: ${brotli}`);

const shouldWriteBadges = process.env.WRITE_CSS_BADGES === "1";
const readmePath = path.join(__dirname, "..", "README.md");
if (shouldWriteBadges && fs.existsSync(readmePath)) {
  const readme = fs.readFileSync(readmePath, "utf8");
  const start = "<!-- CSS_SIZE_BADGES_START -->";
  const end = "<!-- CSS_SIZE_BADGES_END -->";
  if (readme.includes(start) && readme.includes(end)) {
    const badgeBlock = [
      start,
      `![Tailwind Raw](https://img.shields.io/badge/Tailwind%20Raw-${raw.replace(" ", "")}-blue)`,
      `![Tailwind Gzip](https://img.shields.io/badge/Tailwind%20Gzip-${gzip.replace(" ", "")}-blue)`,
      `![Tailwind Brotli](https://img.shields.io/badge/Tailwind%20Brotli-${brotli.replace(" ", "")}-blue)`,
      end
    ].join("\n");
    const updated = readme.replace(
      new RegExp(`${start}[\\s\\S]*?${end}`),
      badgeBlock
    );
    fs.writeFileSync(readmePath, updated);
  }
}
