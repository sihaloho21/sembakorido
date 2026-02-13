const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const projectRoot = path.resolve(__dirname, "..");
const tailwindCli = path.join(projectRoot, "node_modules", "tailwindcss", "lib", "cli.js");
const inputCss = path.join(projectRoot, "assets", "css", "tailwind-input.css");
const configPath = path.join(projectRoot, "tailwind.config.js");
const outputCss = path.join(projectRoot, "assets", "css", "tailwind.min.css");

if (!fs.existsSync(outputCss)) {
  console.error("tailwind.min.css is missing. Run `npm run build:tailwind`.");
  process.exit(1);
}

const hashFile = (filePath) => {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
};

const beforeHash = hashFile(outputCss);

const result = spawnSync(
  process.execPath,
  [tailwindCli, "-c", configPath, "-i", inputCss, "-o", outputCss, "--minify"],
  { stdio: "inherit" }
);

if (result.status !== 0) {
  console.error("Failed to rebuild Tailwind CSS for manual-edit check.");
  process.exit(result.status || 1);
}

const afterHash = hashFile(outputCss);

if (beforeHash !== afterHash) {
  console.error("tailwind.min.css appears to be manually edited or out of date.");
  console.error("Run `npm run build:tailwind` and commit the generated file.");
  process.exit(1);
}

console.log("tailwind.min.css is generated and consistent.");
