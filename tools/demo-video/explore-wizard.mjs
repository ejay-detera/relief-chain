// Walks the real create-program wizard and screenshots each step.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { buildDemoData } from './demo-data.mjs';
import { initSessionScript, installMock } from './mock-backend.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.addInitScript(initSessionScript('lgu'));
const page = await ctx.newPage();
const log = [];
page.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 200)));
page.on('dialog', (d) => { console.log('DIALOG', d.message()); d.dismiss(); });
await installMock(page, buildDemoData('lgu'), log);
const shot = async (n) => { await page.waitForTimeout(1200); await page.screenshot({ path: path.join(ROOT, 'out', 'probe', `wiz-${n}.png`) }); console.log('shot', n, page.url()); };
await page.goto('http://localhost:8081/create-program', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
await page.getByPlaceholder(/Typhoon Kristine/).fill('Typhoon Relief (demo)');
await page.getByPlaceholder(/Describe the main/).fill('Emergency cash assistance for typhoon-affected households.');
const pick = async (label, option) => {
  await page.getByText(label, { exact: true }).click();
  await page.waitForTimeout(600);
  await page.getByText(option, { exact: true }).last().click();
  await page.waitForTimeout(600);
};
await pick('Select Disaster Type', 'Typhoon');
await pick('Select City', 'Sample City');
await pick('Select District', 'District 1').catch(async (e) => { console.log('district', e.message.slice(0, 120)); });
await shot('1a');
await page.getByText('Select Affected Barangays', { exact: true }).click();
await page.waitForTimeout(700);
await shot('1b-modal');
await page.getByText('Brgy Sample 1', { exact: true }).last().click();
await page.getByText('Brgy Sample 2', { exact: true }).last().click().catch(() => {});
await shot('1c-modal');
for (const t of ['Done', 'Confirm', 'Apply', 'Save']) {
  const b = page.getByText(t, { exact: true });
  if (await b.count()) { await b.last().click(); console.log('closed with', t); break; }
}
await page.waitForTimeout(500);
await pick('Select Implementing Agency', 'City Social Welfare Office (demo)').catch((e) => console.log('agency', e.message.slice(0, 100)));
await pick('Select Funding Source', 'Local Calamity Fund (demo)').catch((e) => console.log('fund', e.message.slice(0, 100)));
await shot('1d');
const next = async (n) => {
  await page.getByText('Next Step', { exact: true }).last().click();
  await shot(n);
};
await next('2');
await page.getByPlaceholder('e.g. 5000000').fill('2515500');
await page.getByPlaceholder('e.g. 5000', { exact: true }).fill('500');
await shot('2b');
await next('3');
const visibleInputs = async (tag) => console.log(tag, JSON.stringify(await page.locator('input:visible, textarea:visible').evaluateAll((els) => els.map((e) => e.placeholder || e.value))));
await visibleInputs('step3');
await page.getByText('Today', { exact: true }).first().click();
await page.getByText('In 1 Month', { exact: true }).first().click();
await page.mouse.wheel(0, 900);
await shot('3c');
await page.getByText('Today', { exact: true }).nth(1).click();
await page.getByText('In 2 Weeks', { exact: true }).first().click();
await next('4');
await page.getByText('Targeted List via CSV (Private)', { exact: true }).click();
await shot('4b');
await visibleInputs('step4');
const csv = [
  'full_name,mobile',
  'Juan Dela Cruz,0917-000-0001',
  'Maria Santos,0917-000-0002',
  'Ana Lim,0917-000-0003',
  'Jose Reyes,0917-000-0004',
  'Juan Dela Cruz,0917-000-0001',
  'Pedro Reyes,0917',
].join('\n');
const ta = page.locator('textarea:visible').last();
await ta.fill(csv);
await page.mouse.wheel(0, 700);
await shot('4c');
await next('5');
await page.mouse.wheel(0, 1500);
await shot('5b');
await next('6');
await next('7');
await page.mouse.wheel(0, 1500);
await shot('7b');
const btns = await page.locator('text=/^(Create|Publish|Submit|Launch|Save).*/').allInnerTexts();
console.log('final buttons', JSON.stringify(btns));
console.log('UNHANDLED', [...new Set(log.map((l) => l.split('?')[0]))].join(' | '));
await browser.close();
