#!/usr/bin/env node

const upstreamBase = (process.env.UPSTREAM_URL || 'https://paket-sembako-online-943127658752.asia-southeast1.run.app').replace(/\/$/, '');
const proxyBase = (process.env.PROXY_URL || '').replace(/\/$/, '');
const timeoutMs = Number(process.env.TEST_TIMEOUT_MS || 10000);
const results = [];

function record(name, passed, detail) {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function request(base, path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${base}${path}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) { /* report below */ }
    return { response, text, json };
  } finally {
    clearTimeout(timer);
  }
}

async function testHealth() {
  const { response, json } = await request(upstreamBase, '/api/health');
  const ok = response.status === 200 && json?.success === true;
  record('upstream health', ok, `HTTP ${response.status}`);
  return ok;
}

async function testCatalogBase(base, label) {
  const { response, json } = await request(base, '/api/catalog/products?limit=2');
  const items = json?.data?.items;
  const ok = response.status === 200 && json?.success === true && Array.isArray(items) && items.length <= 2;
  record(`${label} catalog list`, ok, `HTTP ${response.status}, items=${Array.isArray(items) ? items.length : 'invalid'}`);
  if (!ok || items.length === 0) return null;

  const first = items[0];
  const { response: filteredResponse, json: filteredJson } = await request(base, `/api/catalog/products?q=${encodeURIComponent(first.name.split(' ')[0])}&limit=2`);
  const filteredItems = filteredJson?.data?.items;
  const filterOk = filteredResponse.status === 200 && filteredJson?.success === true && Array.isArray(filteredItems);
  record(`${label} catalog search`, filterOk, `HTTP ${filteredResponse.status}`);

  const { response: detailResponse, json: detailJson } = await request(base, `/api/catalog/products/${encodeURIComponent(first.id)}`);
  const detailOk = detailResponse.status === 200 && detailJson?.success === true && detailJson?.data?.id === first.id;
  record(`${label} product detail`, detailOk, `HTTP ${detailResponse.status}, id=${first.id}`);
  return first;
}

async function testProxy(base) {
  const { response, json } = await request(base, '/api/products?limit=2');
  const items = json?.data?.items;
  const corsHeader = response.headers.get('access-control-allow-origin');
  const ok = response.status === 200 && json?.success === true && Array.isArray(items) && !corsHeader;
  record('same-origin proxy catalog', ok, `HTTP ${response.status}, CORS header=${corsHeader || 'none'}`);
  return ok;
}

async function testLauncher() {
  const { response, text } = await request(proxyBase || upstreamBase, '/promo.html');
  const expected = `${upstreamBase}/?feature=promo-pop`;
  const ok = response.status === 200 && text.includes('?feature=promo-pop');
  record('Promo POP launcher link', ok, `HTTP ${response.status}, target=${expected}`);
}

async function main() {
  console.log(`Upstream: ${upstreamBase}`);
  if (proxyBase) console.log(`Proxy: ${proxyBase}`);

  try {
    await testHealth();
    const product = await testCatalogBase(upstreamBase, 'upstream');
    if (!product) record('upstream usable product', false, 'no product returned');

    if (proxyBase) {
      await testProxy(proxyBase);
      await testLauncher();
    } else {
      console.log('INFO proxy tests skipped; set PROXY_URL to test sembakorido.');
    }
  } catch (error) {
    record('test execution', false, error.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : error.message);
  }

  const failed = results.filter((item) => !item.passed);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exitCode = failed.length ? 1 : 0;
}

main();
