const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');
const script = fs.readFileSync('assets/js/script.js', 'utf8');
const css = fs.readFileSync('assets/css/product-detail-enhancements.css', 'utf8');

function getDisclosureBlock(section) {
    const marker = `data-detail-disclosure="${section}"`;
    const start = html.indexOf(marker);
    assert.notEqual(start, -1, `${section} disclosure should exist`);

    const sectionStart = html.lastIndexOf('<section', start);
    const sectionEnd = html.indexOf('</section>', start);
    assert.ok(sectionStart >= 0 && sectionEnd > start, `${section} disclosure should be a complete section`);
    return html.slice(sectionStart, sectionEnd + '</section>'.length);
}

const specs = getDisclosureBlock('specs');
const contents = getDisclosureBlock('contents');

for (const [name, block, contentId] of [
    ['Spesifikasi Ringkas', specs, 'modal-meta-list'],
    ['Isi Produk', contents, 'modal-items-list']
]) {
    assert.match(block, /data-action="toggle-detail-section"/, `${name} should use a delegated toggle action`);
    assert.match(block, /aria-expanded="false"/, `${name} should be collapsed by default`);
    assert.match(block, new RegExp(`aria-controls="${contentId}"`), `${name} trigger should control its content`);
    assert.match(block, new RegExp(`id="${contentId}"[^>]*\\shidden(?:[ >])`), `${name} content should be hidden by default`);
    assert.match(block, /detail-modal-disclosure__toggle[^>]*>\+<\//, `${name} should show the collapsed plus indicator`);
}

assert.match(script, /function setDetailDisclosureState\(section, expanded\)/, 'disclosure state helper should exist');
assert.match(script, /trigger\.setAttribute\('aria-expanded', String\(expanded\)\)/, 'toggle should update aria-expanded');
assert.match(script, /content\.hidden = !expanded/, 'toggle should update the native hidden state');
assert.match(script, /sectionEl\.classList\.toggle\('is-open', expanded\)/, 'toggle should update the visual open state');
assert.match(script, /function resetDetailDisclosureSections\(\)/, 'disclosure sections should have a reset helper');
assert.match(script, /resetDetailDisclosureSections\(\);[\s\S]{0,240}if \(nameEl\)/, 'opening a product should reset disclosure sections before rendering');
assert.match(script, /if \(action === 'toggle-detail-section'\)[\s\S]{0,180}toggleDetailDisclosure\(actionEl\.getAttribute\('data-section'\)\)/, 'detail modal delegation should handle accordion toggles');

assert.match(css, /\.detail-modal-disclosure__content\[hidden\]\s*\{\s*display:\s*none/, 'hidden disclosure content should not occupy layout space');
assert.match(css, /\.detail-modal-disclosure\.is-open \.detail-modal-disclosure__toggle/, 'open disclosure should have a distinct toggle state');

console.log('product detail disclosure tests: PASS');
