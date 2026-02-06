const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const projectRoot = path.resolve(__dirname, "..");
const tailwindBin = path.join(projectRoot, "node_modules", ".bin", "tailwindcss");
const inputCss = path.join(projectRoot, "assets", "css", "tailwind-input.css");
const outputCss = path.join(projectRoot, "assets", "css", "tailwind.min.css");
const configPath = path.join(projectRoot, "tailwind.config.js");

if (!fs.existsSync(outputCss)) {
  console.error("tailwind.min.css is missing. Run `npm run build:tailwind`.");
  process.exit(1);
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tailwind-check-"));
const tempOutput = path.join(tempDir, "tailwind.min.css");

const result = spawnSync(
  tailwindBin,
  ["-c", configPath, "-i", inputCss, "-o", tempOutput, "--minify"],
  { stdio: "inherit" }
);

if (result.status !== 0) {
  console.error("Failed to build Tailwind CSS for comparison.");
  process.exit(result.status || 1);
}

const current = fs.readFileSync(outputCss, "utf8");
const rebuilt = fs.readFileSync(tempOutput, "utf8");

if (current !== rebuilt) {
  console.error("tailwind.min.css is out of date. Run `npm run build:tailwind`.");
  process.exit(1);
}

console.log("tailwind.min.css is up to date.");
