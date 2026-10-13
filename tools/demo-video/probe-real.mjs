// Opens the REAL app as a given role against the mock backend, screenshots a
// route, and lists unhandled API requests so demo-data.mjs can be filled in.
// Usage: node probe-real.mjs <lgu|beneficiary|merchant> <route> [waitMs]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initSessionScript, installMock } from './mock-backend.mjs';
import { buildDemoData } from './demo-data.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const [role = 'lgu', route = '/', wait = '6000'] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const log = [];
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
await page.addInitScript(initSessionScript(role));
await installMock(page, buildDemoData(role), log);
await page.goto(`http://localhost:8081${route}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
await page.waitForTimeout(Number(wait));
fs.mkdirSync(path.join(ROOT, 'out', 'probe'), { recursive: true });
const file = path.join(ROOT, 'out', 'probe', `${role}${route.replace(/[^a-z0-9]+/gi, '_')}.png`);
await page.screenshot({ path: file });
console.log(`URL ${page.url()}\nPNG ${file}`);
console.log('UNHANDLED:\n' + ([...new Set(log)].join('\n') || '(none)'));
console.log('ERRORS:\n' + ([...new Set(errors)].slice(0, 12).join('\n') || '(none)'));
await browser.close();
