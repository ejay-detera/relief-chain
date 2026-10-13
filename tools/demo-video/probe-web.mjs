// Opens the running Expo web app in a phone-sized Edge window and saves a
// screenshot, plus any console errors. Used to confirm the real app renders
// before recording. Usage: node probe-web.mjs [path]   (default "/")
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const route = process.argv[2] ?? '/';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${String(e).slice(0, 300)}`));
await page.goto(`http://localhost:8081${route}`, { waitUntil: 'networkidle', timeout: 180000 });
await page.waitForTimeout(Number(process.argv[3] ?? 4000));
fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true });
const file = path.join(ROOT, 'out', `probe-${route.replace(/[^a-z0-9]+/gi, '_') || 'root'}.png`);
await page.screenshot({ path: file });
console.log(`URL: ${page.url()}`);
console.log(`Screenshot: ${file}`);
console.log(errors.slice(0, 15).join('\n') || 'No console errors.');
await browser.close();
