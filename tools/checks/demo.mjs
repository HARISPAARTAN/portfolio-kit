// Playwright check of demo/index.html in dark and light at 1440 and 390 px. Usage: node tools/checks/demo.mjs
// Env: PLAYWRIGHT_FROM (a package.json whose node_modules holds playwright), OUT (screenshot folder), BASE (check a deployed copy), PORT.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(fileURLToPath(new URL('../../', import.meta.url)));
const OUT = process.env.OUT || join(tmpdir(), 'portfolio-kit-shots');
const REPO = 'https://github.com/HARISPAARTAN/portfolio-kit';
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2', '.png': 'image/png', '.md': 'text/plain; charset=utf-8' };
const { chromium } = createRequire(process.env.PLAYWRIGHT_FROM || import.meta.url)('playwright');

function serve(port) {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (!path.startsWith('/portfolio-kit/')) return res.writeHead(404).end();
    let file = normalize(join(ROOT, path.slice('/portfolio-kit/'.length)));
    if (!file.startsWith(ROOT)) return res.writeHead(403).end();
    if (path.endsWith('/')) file = join(file, 'index.html');
    try {
      const body = await readFile(file);
      return res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body);
    } catch {
      return res.writeHead(404).end();
    }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

const results = [];
function check(name, pass, detail = '') {
  results.push(Boolean(pass));
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
}

const server = process.env.BASE ? null : await serve(Number(process.env.PORT || 8097));
const BASE = process.env.BASE || `http://127.0.0.1:${server.address().port}/portfolio-kit/`;
const ORIGIN = new URL(BASE).origin;
await mkdir(OUT, { recursive: true });
const shoot = (page, name, fullPage = false) => page.screenshot({ path: join(OUT, name), fullPage });
const browser = await chromium.launch({ channel: 'chrome', headless: true });

function watch(page) {
  const problems = [];
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith('data:') && !u.startsWith('blob:') && new URL(u).origin !== ORIGIN) problems.push(`external request ${u}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url()}`);
  });
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console error: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  return problems;
}

const settle = (page) => page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));
const flowState = (page, id) => page.evaluate((sel) => ({
  ok: document.querySelectorAll(`${sel} .pf-flow__node[data-status="ok"]`).length,
  moved: document.querySelectorAll(`${sel} .pf-flow__node:not([data-status="idle"])`).length,
  live: document.querySelector(`${sel} [aria-live]`)?.textContent ?? '',
  dot: document.querySelector(`${sel} .pf-flow__dot`)?.getAttribute('visibility') ?? '',
}), id);

async function run(theme, width) {
  const tag = `${width} ${theme}`;
  const ctx = await browser.newContext({ viewport: { width, height: width < 700 ? 844 : 900 }, colorScheme: theme, acceptDownloads: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(5000);
  const problems = watch(page);
  await page.goto(`${BASE}demo/`);
  await settle(page);

  check(`${tag}: data-theme is ${theme}`, (await page.getAttribute('html', 'data-theme')) === theme);
  const banner = await page.evaluate(() => {
    const b = document.body.firstElementChild;
    return { first: Boolean(b?.classList.contains('pf-banner')), href: b?.querySelector('a')?.href ?? '', padded: document.body.classList.contains('pf-has-banner') };
  });
  check(`${tag}: banner is the first element of body and links the repository`, banner.first && banner.padded && banner.href === REPO, banner.href);
  const fonts = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replaceAll('"', '')));
  check(`${tag}: Inter, Space Grotesk and JetBrains Mono are loaded`, ['Inter', 'Space Grotesk', 'JetBrains Mono'].every((f) => fonts.includes(f)), fonts.join(', '));
  const [scrollWidth, innerWidth] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  check(`${tag}: no horizontal page scroll`, scrollWidth <= innerWidth, `${scrollWidth} <= ${innerWidth}`);
  check(`${tag}: four KPI tiles`, (await page.locator('#kpis .pf-kpi').count()) === 4);
  const footer = (await page.locator('.pf-footer p').first().textContent()).trim();
  check(`${tag}: the footer says this is a component gallery with invented values`, footer === 'Component gallery of portfolio-kit. Every value on this page is invented.', footer);
  const orphans = await page.$$eval('a[href^="#"]', (links) => links.filter((a) => !document.getElementById(decodeURIComponent(a.hash.slice(1)))).map((a) => a.getAttribute('href')));
  check(`${tag}: every in-page link has a target`, orphans.length === 0, orphans.join(' '));
  const weight = await page.evaluate(() => [...performance.getEntriesByType('navigation'), ...performance.getEntriesByType('resource')].reduce((s, e) => s + e.decodedBodySize, 0));
  check(`${tag}: page weight is at most 3 MB`, weight > 0 && weight <= 3 * 1024 * 1024, `${Math.round(weight / 1024)} KB`);

  const total = await page.evaluate(() => {
    const all = [...document.querySelectorAll('a[href], button, select, input, [tabindex]')];
    const reachable = all.filter((el) => !el.disabled && el.tabIndex >= 0 && el.checkVisibility());
    reachable.forEach((el, i) => el.setAttribute('data-kbd', String(i)));
    document.activeElement?.blur();
    return reachable.length;
  });
  const seen = new Set();
  for (let i = 0; i < total + 10; i += 1) {
    await page.keyboard.press('Tab');
    const k = await page.evaluate(() => document.activeElement?.getAttribute('data-kbd'));
    if (k !== null && k !== undefined) seen.add(k);
  }
  check(`${tag}: Tab reaches every visible control`, total > 40 && seen.size === total, `${seen.size} of ${total}`);

  const advanced = await page.waitForFunction(() => document.querySelectorAll('#flow-auto .pf-flow__node[data-status="ok"]').length >= 2).then(() => true, () => false);
  check(`${tag}: auto-play advances the flow`, advanced);
  await page.locator('#flow-auto').getByRole('button', { name: 'Skip animation' }).click();
  const auto = await flowState(page, '#flow-auto');
  check(`${tag}: Skip animation finishes all nine steps`, auto.ok === 9 && auto.live === 'Step 9 of 9: Report (done)' && auto.dot === 'hidden', auto.live);
  const cut = await page.$$eval('.pf-flow__node .pf-flow__name', (els) => els.filter((e) => e.textContent.endsWith('…')).map((e) => e.textContent));
  check(`${tag}: flow labels fit their boxes`, cut.length === 0, cut.join(', '));

  await page.evaluate(() => window.scrollTo(0, 0));
  await settle(page);
  await shoot(page, `demo-${width}-${theme}.png`);
  await shoot(page, `demo-${width}-${theme}-full.png`, true);

  const info = () => page.locator('#orders .pf-pager__info').textContent();
  const sortButton = page.locator('#orders th[data-key="revenue"] button');
  const revenue = () => page.$$eval('#orders tbody tr', (rows) => rows.map((r) => Number(r.children[5].textContent.replace(/[^0-9.]/g, ''))));
  const sorted = (list, dir) => list.every((v, i) => i === 0 || (dir === 'asc' ? list[i - 1] <= v : list[i - 1] >= v));
  check(`${tag}: pager shows 1–8 of 40`, (await info()) === '1–8 of 40', await info());
  await sortButton.click();
  const asc = await revenue();
  check(`${tag}: Revenue sorts ascending`, (await page.getAttribute('#orders th[data-key="revenue"]', 'aria-sort')) === 'ascending' && asc.length === 8 && sorted(asc, 'asc'), asc.join(' '));
  await sortButton.click();
  const desc = await revenue();
  check(`${tag}: a second click sorts descending`, (await page.getAttribute('#orders th[data-key="revenue"]', 'aria-sort')) === 'descending' && sorted(desc, 'desc'), desc.join(' '));
  await page.locator('#orders').getByRole('button', { name: 'Next' }).click();
  check(`${tag}: Next shows 9–16 of 40`, (await info()) === '9–16 of 40', await info());

  await page.locator('#region-chips [data-region="North"]').click();
  const regions = await page.$$eval('#orders tbody tr', (rows) => rows.map((r) => r.children[2].textContent));
  const saved = await page.evaluate(() => localStorage.getItem('pf.portfolio-kit-demo.v1'));
  check(`${tag}: the North chip filters the table and is saved`, regions.length > 0 && regions.every((r) => r === 'North') && (await info()) === '1–8 of 9' && saved === '{"region":["North"]}', `${await info()}, saved ${saved}`);
  await page.locator('#reset-demo').click();
  const reset = await page.evaluate(() => ({
    info: document.querySelector('#orders .pf-pager__info').textContent,
    pressed: document.querySelector('#region-chips [data-region="North"]').getAttribute('aria-pressed'),
    sorted: document.querySelectorAll('#orders th[aria-sort]').length,
    saved: localStorage.getItem('pf.portfolio-kit-demo.v1'),
  }));
  check(`${tag}: Reset demo clears the filter, the sort and the saved state`, reset.info === '1–8 of 40' && reset.pressed === 'false' && reset.sorted === 0 && reset.saved === null, JSON.stringify(reset));

  const [file] = await Promise.all([page.waitForEvent('download'), page.locator('#csv').click()]);
  const csv = await readFile(await file.path());
  const lines = csv.toString('utf8').slice(1).split('\r\n');
  check(`${tag}: CSV download has a BOM, the header and 40 rows`, file.suggestedFilename() === 'orders.csv' && csv[0] === 0xef && csv[1] === 0xbb && csv[2] === 0xbf && lines[0] === 'Order,Date,Region,Product,Units,Revenue,Status' && lines[1] === 'SO-1001,2025-09-02,West,Widget A,15,360,Delivered' && lines.length === 42 && lines[41] === '', `${lines.length - 2} rows`);

  await page.locator('#tab-1').focus();
  await page.keyboard.press('ArrowRight');
  const tabs = await page.evaluate(() => ({
    selected: document.querySelector('#demo-tabs [aria-selected="true"]').id,
    focused: document.activeElement.id,
    panel1: document.getElementById('panel-1').hidden,
    panel2: document.getElementById('panel-2').hidden,
  }));
  check(`${tag}: ArrowRight selects the second tab and shows its panel`, tabs.selected === 'tab-2' && tabs.focused === 'tab-2' && tabs.panel1 && !tabs.panel2);

  await page.locator('#flow-manual-controls [data-action="fail"]').click();
  const manual = await flowState(page, '#flow-manual');
  const book = await page.getAttribute('#flow-manual .pf-flow__node[data-id="book"]', 'data-status');
  check(`${tag}: programmatic fail marks Book as failed`, book === 'failed' && manual.live === 'Step 5 of 7: Book (failed)', manual.live);

  const frames = await page.evaluate(() => ['phone', 'tablet'].map((id) => {
    const frame = document.getElementById(id);
    const slot = frame.parentElement.getBoundingClientRect();
    const box = frame.getBoundingClientRect();
    return { id, scale: Number(getComputedStyle(frame).getPropertyValue('--scale')), fits: box.left >= slot.left - 0.5 && box.right <= slot.right + 0.5 };
  }));
  const [phone, tablet] = frames;
  check(`${tag}: device frames fit their column`, frames.every((f) => f.fits && f.scale > 0 && f.scale <= 1) && (width < 700 ? phone.scale < 1 : phone.scale === 1) && tablet.scale < 1, `phone ${phone.scale}, tablet ${tablet.scale}`);

  const other = theme === 'dark' ? 'light' : 'dark';
  const named = (t) => `Theme: ${t === 'light' ? 'Light' : 'Dark'}`;
  const namedBefore = await page.getByRole('button', { name: named(theme), exact: true }).count();
  await page.locator('.pf-theme-toggle').click();
  const toggled = await page.evaluate(() => {
    const b = document.querySelector('.pf-theme-toggle');
    return { theme: document.documentElement.getAttribute('data-theme'), stored: localStorage.getItem('hh-theme'), label: b.textContent, pressed: b.hasAttribute('aria-pressed') };
  });
  const namedAfter = await page.getByRole('button', { name: named(other), exact: true }).count();
  check(`${tag}: the theme toggle switches to ${other}, stores hh-theme and is named "${named(other)}" without aria-pressed`, toggled.theme === other && toggled.stored === other && toggled.label.endsWith(other === 'light' ? 'Light' : 'Dark') && !toggled.pressed && namedBefore === 1 && namedAfter === 1, `${toggled.label}; named ${namedBefore}/${namedAfter}`);

  check(`${tag}: no external request, HTTP error, console error or page error`, problems.length === 0, problems.slice(0, 3).join('; '));
  await ctx.close();
}

async function reducedMotion() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(5000);
  const problems = watch(page);
  await page.goto(`${BASE}demo/`);
  await page.waitForTimeout(2500);
  const still = await flowState(page, '#flow-auto');
  check('reduced motion: the auto-play flow stays still', still.moved === 0 && still.dot === 'hidden', `${still.moved} steps changed`);
  await page.locator('#flow-auto').getByRole('button', { name: 'Play' }).click();
  const end = await flowState(page, '#flow-auto');
  check('reduced motion: Play applies every step at once', end.ok === 9 && end.live === 'Step 9 of 9: Report (done)', end.live);
  check('reduced motion: no external request, HTTP error, console error or page error', problems.length === 0, problems.slice(0, 3).join('; '));
  await ctx.close();
}

async function redirect() {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.waitForURL((u) => u.pathname.endsWith('/demo/')).catch(() => {});
  check('the root index.html redirects to demo/', page.url() === `${BASE}demo/`, page.url());
  await ctx.close();
}

async function guard(name, fn) {
  try {
    await fn();
  } catch (e) {
    check(`${name}: run finished`, false, e.message.split('\n')[0]);
  }
}

try {
  for (const theme of ['dark', 'light']) {
    for (const width of [1440, 390]) await guard(`${width} ${theme}`, () => run(theme, width));
  }
  await guard('reduced motion', reducedMotion);
  await guard('redirect', redirect);
} finally {
  await browser.close();
  server?.close();
}
const failed = results.filter((ok) => !ok).length;
console.log(`${results.length} checks, ${failed} failed; screenshots in ${OUT}`);
process.exit(failed ? 1 : 0);
