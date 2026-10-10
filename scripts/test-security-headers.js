const assert = require("assert");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..");
const netlify = fs.readFileSync(path.join(root, "netlify.toml"), "utf8");
const port = 19000 + Math.floor(Math.random() * 1000);

const requiredHeaders = [
  "content-security-policy-report-only",
  "strict-transport-security",
  "permissions-policy",
  "x-content-type-options",
  "x-frame-options",
  "referrer-policy"
];

assert(netlify.includes("Content-Security-Policy-Report-Only"), "Netlify CSP Report-Only missing");
assert(netlify.includes("Strict-Transport-Security"), "Netlify HSTS missing");
assert(netlify.includes("Permissions-Policy"), "Netlify Permissions Policy missing");

const child = spawn(process.execPath, ["server.js"], {
  cwd: root,
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});

const fail = (message) => {
  child.kill();
  throw new Error(`[SEC-03] ${message}`);
};

const request = () => new Promise((resolve, reject) => {
  const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
    res.resume();
    res.on("end", () => resolve(res.headers));
  });
  req.setTimeout(5000, () => req.destroy(new Error("request timeout")));
  req.on("error", reject);
});

(async () => {
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("server startup timeout")), 5000);
      child.stdout.on("data", (data) => {
        if (String(data).includes("Static server running")) {
          clearTimeout(timer);
          resolve();
        }
      });
      child.once("error", reject);
      child.once("exit", (code) => code ? reject(new Error(`server exited ${code}`)) : undefined);
    });
    const headers = await request();
    for (const header of requiredHeaders) {
      if (!headers[header]) fail(`runtime header missing: ${header}`);
    }
    assert(headers["content-security-policy-report-only"].includes("object-src 'none'"), "CSP must disable object embeds");
    assert(headers["permissions-policy"].includes("camera=()"), "camera must be disabled");
    assert(headers["strict-transport-security"].startsWith("max-age=31536000"), "HSTS max-age is too short");
    console.log("SEC-03 security headers passed (runtime + Netlify config)");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    child.kill();
  }
})();
