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

assert.match(script, /function setDetailDisclosureState\(section, expanded, options = \{\}\)/, 'disclosure state helper should exist');
assert.match(script, /trigger\.setAttribute\('aria-expanded', String\(expanded\)\)/, 'toggle should update aria-expanded');
assert.match(script, /content\.hidden = !expanded/, 'toggle should update the native hidden state');
assert.match(script, /sectionEl\.classList\.toggle\('is-open', expanded\)/, 'toggle should update the visual open state');
assert.match(script, /function resetDetailDisclosureSections\(\)/, 'disclosure sections should have a reset helper');
assert.match(script, /resetDetailDisclosureSections\(\);[\s\S]{0,240}if \(nameEl\)/, 'opening a product should reset disclosure sections before rendering');
assert.match(script, /if \(action === 'toggle-detail-section'\)[\s\S]{0,180}toggleDetailDisclosure\(actionEl\.getAttribute\('data-section'\)\)/, 'detail modal delegation should handle accordion toggles');
assert.match(script, /requestAnimationFrame\(\(\) => sectionEl\.classList\.add\('is-open'\)\)/, 'opening a disclosure should start the slide-down state after rendering');
assert.match(script, /content\.addEventListener\('transitionend', finishCollapse\)/, 'closing a disclosure should wait for the slide-up transition');
assert.match(script, /setTimeout\(finishCollapse, 380\)/, 'closing a disclosure should have a fallback completion timer');

assert.match(css, /#modal-meta-list\[hidden\][\s\S]*#modal-items-list\[hidden\][\s\S]*display:\s*none\s*!important/, 'both disclosure containers should override legacy display rules when hidden');
assert.match(css, /\.detail-modal-disclosure\.is-open \.detail-modal-disclosure__toggle/, 'open disclosure should have a distinct toggle state');
assert.match(css, /\.detail-modal-disclosure__content\s*\{[\s\S]*max-height:\s*0[\s\S]*transition:/, 'collapsed disclosure content should define a slide transition');
assert.match(css, /\.detail-modal-disclosure\.is-open \.detail-modal-disclosure__content\s*\{[\s\S]*max-height:\s*1000px/, 'open disclosure content should expand to its slide-down height');
assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.detail-modal-disclosure__content[\s\S]*transition:\s*none/, 'disclosure transition should respect reduced motion');

console.log('product detail disclosure tests: PASS');
