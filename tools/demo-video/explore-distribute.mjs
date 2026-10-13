// Opens the LGU tabs to find the Distribute Aid screen and its wizard.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { buildDemoData, makeDistributionJob } from './demo-data.mjs';
import { initSessionScript, installMock } from './mock-backend.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.addInitScript(initSessionScript('lgu'));
const page = await ctx.newPage();
const log = [];
page.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 200)));
page.on('dialog', (d) => { console.log('DIALOG', d.message()); d.dismiss(); });
const data = buildDemoData('lgu');
const dj = makeDistributionJob();
Object.assign(data.functions, dj.functions);
Object.assign(data.tables, dj.tables);
await installMock(page, data, log);
const shot = async (n) => { await page.waitForTimeout(1500); await page.screenshot({ path: path.join(ROOT, 'out', 'probe', `dist-${n}.png`) }); console.log('shot', n, page.url()); };
await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
const tabs = page.locator('[role="tab"], a[href]').filter({ hasNot: page.locator('text=/Relief/') });
console.log('links', JSON.stringify(await page.locator('a[href]').evaluateAll((a) => a.map((x) => x.getAttribute('href')))));
await page.locator('a[href="/pay-scan"]').first().click().catch((e) => console.log('tab', e.message.slice(0, 100)));
await shot('1');
await page.getByText('Start a distribution', { exact: true }).click();
await shot('2');
await page.getByText('Typhoon Relief (demo)', { exact: true }).last().click();
await shot('3');
for (let i = 4; i < 12; i++) {
  const cands = page.locator('text=/^(Continue|Next|Authorize|Confirm|Approve|Distribute|Review|Proceed|Submit|Prepare|Sign|Load|Select All|Validate|Pre-validation|Run|Execute|Send|Release|Disburse)[^\\n]{0,40}$/').filter({ visible: true });
  const btns = await cands.allInnerTexts();
  console.log('buttons', i, JSON.stringify(btns));
  if (!btns.length) break;
  const target = btns[btns.length - 1];
  await cands.last().click();
  await shot(String(i));
  if (/Authorize|Confirm|Start|Distribute/i.test(target)) { await page.waitForTimeout(6000); await shot(`${i}-later`); }
}
console.log('UNHANDLED', [...new Set(log.map((l) => l.split('?')[0]))].join(' | '));
await browser.close();
