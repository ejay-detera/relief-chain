// Screenshots many real routes per role against the mock backend and prints
// every unhandled API request, deduplicated by table/function.
// Usage: node probe-all.mjs <role> <route1> <route2> ...
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initSessionScript, installMock } from './mock-backend.mjs';
import { buildDemoData } from './demo-data.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const [role, ...routes] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.addInitScript(initSessionScript(role));
const dir = path.join(ROOT, 'out', 'probe');
fs.mkdirSync(dir, { recursive: true });
for (const route of routes) {
  const page = await ctx.newPage();
  const log = [];
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  await installMock(page, buildDemoData(role), log);
  await page.goto(`http://localhost:8081${route}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForTimeout(7000);
  const file = path.join(dir, `${role}${route.replace(/[^a-z0-9]+/gi, '_')}.png`);
  await page.screenshot({ path: file });
  const uniq = [...new Set(log.map((l) => l.split('?')[0].slice(0, 120)))];
  console.log(`\n== ${route} -> ${page.url().replace('http://localhost:8081', '')}\n   PNG ${path.basename(file)}`);
  if (uniq.length) console.log('   unhandled: ' + uniq.join(' | '));
  if (errors.length) console.log('   errors: ' + [...new Set(errors)].slice(0, 4).join(' | '));
  await page.close();
}
await browser.close();
