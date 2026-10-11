import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../../package.json', import.meta.url));
const { chromium } = require('@playwright/test');
// Same argument/file convention as the root capture helper:
// node ... <port> <directory-suffix> <optional-comma-separated-routes-or-empty> <light|dark>
const port = process.argv[2] || '3191';
const name = process.argv[3] || 'baseline';
const storageState = process.env.ADMIN_GUIDED_STORAGE_STATE;
if (!storageState) throw new Error('Set ADMIN_GUIDED_STORAGE_STATE to private local browser authentication state.');
const theme = process.argv[5] || 'light';
if (!/^\d{2,5}$/.test(port) || !['baseline', 'guided'].includes(name) || !['light', 'dark'].includes(theme)) throw new Error('Invalid local capture arguments.');
const allRoutes = ['', 'homepage', 'programs', 'tryouts', 'shop', 'about', 'sponsors', 'contact', 'seasons', 'roster', 'schedule', 'stats', 'season-stats', 'standings', 'registrations', 'analytics', 'branding', 'members', 'payments'];
const routes = process.argv[4] ? process.argv[4].split(',') : allRoutes;
if (routes.some(route => !allRoutes.includes(route))) throw new Error('Unknown protected route.');
const dir = fileURLToPath(new URL(`./evidence/${name}-${theme}/`, import.meta.url));
await fs.mkdir(dir, { recursive: true });
const frameMarkers = { homepage: '[data-homepage-piece]', programs: '[data-program-editor-preview]', tryouts: '[data-tryouts-preview]', shop: '[data-shop-editor-preview]', about: '[data-about-preview]', contact: '[data-contact-preview]' };
const report = [];
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ storageState, reducedMotion: 'reduce', colorScheme: theme });
  await context.addCookies([{ name: 'onzio-admin-theme', value: theme, domain: 'alpha.localhost', path: '/admin' }]);
  for (const size of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const page = await context.newPage();
    await page.setViewportSize(size);
    for (const route of routes) {
      const errors = [], readinessErrors = [];
      const listener = error => errors.push(error.message);
      page.on('pageerror', listener);
      let response, metrics, path;
      try {
        response = await page.goto(`http://alpha.localhost:${port}/admin${route ? '/' + route : ''}`, { timeout: 90_000, waitUntil: 'domcontentloaded' });
        await page.getByRole('main').waitFor({ state: 'visible', timeout: 30_000 });
        await page.getByRole('main').getByRole('heading', { level: 1 }).first().waitFor({ state: 'visible', timeout: 30_000 });
        await page.waitForFunction(() => {
          const main = document.querySelector('main');
          if (!main) return false;
          const visible = node => { const box = node.getBoundingClientRect(); return box.width > 0 && box.height > 0 && getComputedStyle(node).visibility !== 'hidden'; };
          return !Array.from(main.querySelectorAll('[data-slot="skeleton"], [role="status"][aria-label^="Loading"]')).some(visible) && !/^Loading(?:[.\s…]|$)/i.test(main.innerText.trim());
        }, undefined, { timeout: 30_000 });
        await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => readinessErrors.push('networkidle not reached; DOM readiness used'));
        await page.evaluate(() => document.fonts.ready);
        for (const frame of page.frames().filter(frame => frame !== page.mainFrame())) {
          const element = await frame.frameElement();
          if (!await element.isVisible()) continue;
          const marker = frameMarkers[route];
          if (!marker) throw new Error(`Unexpected visible preview iframe on ${route}`);
          await frame.locator(marker).first().waitFor({ state: 'visible', timeout: 30_000 });
          await frame.waitForFunction(selector => {
            const preview = document.querySelector(selector);
            const body = document.body;
            return preview && body && preview.getBoundingClientRect().height > 0 && body.children.length > 0 && !/^Loading(?:[.\s…]|$)/i.test(body.innerText.trim());
          }, marker, { timeout: 30_000 });
          await frame.evaluate(() => document.fonts.ready);
        }
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      } catch (error) { readinessErrors.push(error.message); }
      try {
        metrics = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, title: document.title, text: document.querySelector('main')?.innerText.slice(0, 1200), theme: document.querySelector('.admin-theme')?.getAttribute('data-admin-theme'), iframes: Array.from(document.querySelectorAll('iframe')).map(frame => ({ title: frame.title, src: frame.getAttribute('src') })) }));
        path = `${dir}/${route || 'dashboard'}-${size.width}-${theme}.png`;
        await page.screenshot({ path, fullPage: true, timeout: 30_000 });
      } catch (error) { readinessErrors.push(`capture: ${error.message}`); }
      report.push({ route: route || 'dashboard', size: size.width, status: response?.status(), url: page.url(), ...metrics, errors, readinessErrors, path });
      await fs.writeFile(`${dir}/report-${theme}.json`, JSON.stringify(report, null, 2));
      console.log(route || 'dashboard', size.width, response?.status(), metrics?.scrollWidth > size.width ? 'OVERFLOW' : 'fits', readinessErrors.length ? 'READINESS-ISSUE' : 'ready');
      page.off('pageerror', listener);
    }
    await page.close();
  }
  const incomplete = report.filter(row => row.readinessErrors.some(message => !message.startsWith('networkidle')) || row.errors.length || !row.path || row.status !== 200 || row.scrollWidth > row.width + 1 || row.theme !== theme);
  console.log(JSON.stringify({ captures: report.length, incomplete: incomplete.map(row => ({ route: row.route, size: row.size, errors: row.errors, readinessErrors: row.readinessErrors })) }));
  if (incomplete.length) process.exitCode = 1;
} finally { await browser.close(); }
