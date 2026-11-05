const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const homepage = read('index.html');
const maintenanceCss = read('assets/css/maintenance-page.css');
const maintenanceJs = read('assets/js/maintenance-page.js');
const configJs = read('assets/js/config.js');
const productJs = read('assets/js/script.js');
const adminHtml = read('admin/index.html');
const adminJs = read('admin/js/admin-script.js');
const gasSource = read('docs/gas_v71_category_showcase_merged.gs');
const packageJson = JSON.parse(read('package.json'));

assert.match(homepage, /<main id="homepage-maintenance-screen"[^>]*hidden/s, 'homepage should contain a hidden full-page maintenance view');
assert.match(homepage, /Website Sedang Dalam Perbaikan/, 'maintenance screen should show the Indonesian maintenance message');
assert.match(homepage, /maintenance-page\.js\?v=/, 'homepage should load the maintenance page controller');
assert.match(homepage, /maintenance-page\.css\?v=/, 'homepage should load the maintenance page styling');
assert.match(maintenanceCss, /body\.homepage-maintenance-active > :not\(#homepage-maintenance-screen\)/, 'active maintenance mode should replace the homepage content');
assert.match(maintenanceJs, /homepage-maintenance-status-updated/, 'maintenance screen should react to refreshed backend configuration');
assert.match(maintenanceJs, /CONFIG\.isHomepageMaintenanceEnabled\(\)/, 'maintenance screen should use cached state for immediate display');
assert.match(configJs, /HOMEPAGE_MAINTENANCE:\s*'sembako_homepage_maintenance_enabled'/, 'configuration should cache maintenance state separately');
assert.match(configJs, /payload\.homepage_maintenance_enabled/, 'public store status response should update homepage maintenance state');
assert.match(configJs, /homepage-maintenance-status-updated/, 'configuration refresh should notify the page controller');
assert.ok(productJs.indexOf('const storeStatusPromise = CONFIG.refreshStoreStatus();') < productJs.indexOf("ApiService.get('?sheet=products'"), 'maintenance status should refresh in parallel with product loading');
assert.match(adminHtml, /id="homepage-maintenance-enabled"[^>]*role="switch"/, 'admin settings should provide an accessible on/off toggle');
assert.match(adminJs, /getLatestSettingValue\(rows, 'homepage_maintenance_enabled', 'false'\)/, 'admin should load the toggle from the settings sheet');
assert.match(adminJs, /\['homepage_maintenance_enabled', String\(Boolean\(document\.getElementById\('homepage-maintenance-enabled'\)/, 'admin should persist the toggle through settings upsert');

const publicStatusHandler = gasSource.match(/function handlePublicStoreStatus\(\) \{([\s\S]*?)\n\}/);
assert.ok(publicStatusHandler, 'GAS source should contain the public status handler');
assert.match(publicStatusHandler[1], /store_closed:/, 'existing store status must remain available');
assert.match(publicStatusHandler[1], /homepage_maintenance_enabled:/, 'GAS should expose the new public maintenance flag');
assert.doesNotMatch(publicStatusHandler[1], /return\s+settings\s*;/, 'GAS public handler must not expose all settings');
assert.match(packageJson.scripts.test, /tests\/homepage_maintenance_mode_test\.js/, 'maintenance regression should run under npm test');

console.log('homepage maintenance mode tests: PASS');
