const fs = require("fs");
const path = require("path");

const caniusePath = path.join(
  __dirname,
  "..",
  "node_modules",
  "caniuse-lite",
  "data",
  "agents.js"
);

if (!fs.existsSync(caniusePath)) {
  console.warn("Browserslist warning: caniuse-lite not found.");
  process.exit(0);
}

const stats = fs.statSync(caniusePath);
const ageMs = Date.now() - stats.mtimeMs;
const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
const thresholdDays = 30;

if (ageDays >= thresholdDays) {
  console.warn(
    `Browserslist warning: caniuse-lite data is ${ageDays} days old. ` +
      "Consider running `npx update-browserslist-db@latest`."
  );
}
