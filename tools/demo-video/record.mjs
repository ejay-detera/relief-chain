// Records the REAL Relief Chain app (Expo web build on localhost:8081) with
// Playwright. Each clip is a fresh browser context with a video recorder; the
// backend is the in-browser mock (mock-backend.mjs + demo-data.mjs).
//
// Output: build/clips/<id>.webm  and build/clips/clips.json
//   clips.json: { [id]: { file, startOffset, duration, taps: [seconds] } }
// startOffset trims the splash/loading frames before the screen is ready.
//
// Usage: node record.mjs [clipId ...]   (no args = all clips)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { buildDemoData, makeDistributionJob } from './demo-data.mjs';
import { initSessionScript, installMock } from './mock-backend.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(ROOT, 'build', 'clips');
fs.mkdirSync(DIR, { recursive: true });
const APP = 'http://localhost:8081';
const VIEW = { width: 430, height: 932 };

const CSV = [
  'full_name,mobile',
  'Juan Dela Cruz,0917-000-0001',
  'Maria Santos,0917-000-0002',
  'Ana Lim,0917-000-0003',
  'Jose Reyes,0917-000-0004',
  'Liza Garcia,0917-000-0005',
  'Pedro Reyes,0917',
  'Mark Bautista,0917-000-0007',
].join('\n');

// Smooth, human-paced scroll inside whatever is scrollable under the cursor.
const scroll = async (page, dy, ms = 1600) => {
  const steps = Math.max(8, Math.round(ms / 40));
  await page.mouse.move(VIEW.width / 2, VIEW.height / 2);
  for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, dy / steps); await page.waitForTimeout(ms / steps); }
};

const typeSlow = async (locator, text, delay = 45) => {
  await locator.click();
  await locator.pressSequentially(text, { delay });
};

const CLIPS = {
  // 1. LGU dashboard
  dashboard: { role: 'lgu', route: '/', run: async ({ page, ready, tap }) => {
    await ready();
    await page.waitForTimeout(1800);
    await scroll(page, 900, 2600);
    await page.waitForTimeout(900);
    await scroll(page, -900, 1500);
    await page.waitForTimeout(800);
    await tap(page.locator('a[href="/programs"]').first());
    await page.waitForTimeout(2500);
  } },

  // 2. Create program: steps 1-3
  wizardBasics: { role: 'lgu', route: '/create-program', run: async ({ page, ready, tap }) => {
    await ready();
    await page.waitForTimeout(700);
    await typeSlow(page.getByPlaceholder(/Typhoon Kristine/), 'Typhoon Relief (demo)');
    await typeSlow(page.getByPlaceholder(/Describe the main/), 'Emergency cash assistance for typhoon-affected households.', 18);
    const pick = async (label, option) => {
      await tap(page.getByText(label, { exact: true }));
      await page.waitForTimeout(500);
      await tap(page.getByText(option, { exact: true }).last());
      await page.waitForTimeout(400);
    };
    await pick('Select Disaster Type', 'Typhoon');
    await pick('Select City', 'Sample City');
    await pick('Select District', 'District 1');
    await tap(page.getByText('Select Affected Barangays', { exact: true }));
    await page.waitForTimeout(500);
    await tap(page.getByText('Brgy Sample 1', { exact: true }).last());
    await tap(page.getByText('Brgy Sample 2', { exact: true }).last());
    await tap(page.getByText('Done', { exact: true }).last());
    await scroll(page, 500, 700);
    await pick('Select Implementing Agency', 'City Social Welfare Office (demo)');
    await pick('Select Funding Source', 'Local Calamity Fund (demo)');
    await page.waitForTimeout(500);
    await tap(page.getByText('Next Step', { exact: true }).last());
    await page.waitForTimeout(1000);
    await typeSlow(page.getByPlaceholder('e.g. 5000000'), '2515500', 70);
    await typeSlow(page.getByPlaceholder('e.g. 5000', { exact: true }), '500', 90);
    await page.waitForTimeout(1200);
    await tap(page.getByText('Next Step', { exact: true }).last());
    await page.waitForTimeout(1000);
    await tap(page.getByText('Today', { exact: true }).first());
    await tap(page.getByText('In 1 Month', { exact: true }).first());
    await scroll(page, 900, 1000);
    await tap(page.getByText('Today', { exact: true }).nth(1));
    await tap(page.getByText('In 2 Weeks', { exact: true }).first());
    await page.waitForTimeout(700);
    await tap(page.getByText('Next Step', { exact: true }).last());
    await page.waitForTimeout(1500);
  } },

  // 3. CSV import + parsing (step 4)
  wizardCsv: { role: 'lgu', route: '/create-program', prep: 'wizardToEligibility', run: async ({ page, ready, tap }) => {
    await ready();
    await page.waitForTimeout(1200);
    await tap(page.getByText('Targeted List via CSV (Private)', { exact: true }));
    await page.waitForTimeout(1200);
    await scroll(page, 450, 900);
    const ta = page.locator('textarea:visible').last();
    await ta.click();
    await ta.fill('');
    // Paste the masterlist as a whole (what a user does with a copied CSV).
    await ta.fill(CSV);
    await page.waitForTimeout(900);
    await scroll(page, 650, 1600);
    await page.waitForTimeout(3500);
    await tap(page.getByText('Next Step', { exact: true }).last());
    await page.waitForTimeout(1500);
  } },

  // 4. Steps 5-7 and publish
  wizardPublish: { role: 'lgu', route: '/create-program', prep: 'wizardToVoucher', run: async ({ page, ready, tap }) => {
    await ready();
    await page.waitForTimeout(1500);
    await scroll(page, 700, 1400);
    await page.waitForTimeout(700);
    await tap(page.getByText('Next Step', { exact: true }).last());
    await page.waitForTimeout(1300);
    await tap(page.getByText('Next Step', { exact: true }).last());
    await page.waitForTimeout(1200);
    await scroll(page, 900, 2400);
    await page.waitForTimeout(900);
    await tap(page.getByText('Publish', { exact: true }).last());
    await page.waitForTimeout(3000);
  } },

  // 5. Distribute: select program -> summary -> 5,031 beneficiaries -> pre-validation
  distributeSelect: { role: 'lgu', route: '/', distribution: true, run: async ({ page, ready, tap }) => {
    await ready();
    await tap(page.locator('a[href="/pay-scan"]').first());
    await page.waitForTimeout(1500);
    await tap(page.getByText('Start a distribution', { exact: true }));
    await page.waitForTimeout(1300);
    await tap(page.getByText('Typhoon Relief (demo)', { exact: true }).last());
    await page.waitForTimeout(800);
    await tap(page.getByText('Continue to Summary', { exact: true }));
    await page.waitForTimeout(1500);
    await scroll(page, 500, 1000);
    await tap(page.getByText('Load Beneficiaries', { exact: true }));
    await page.waitForTimeout(1800);
    await scroll(page, 1200, 2000);
    await page.waitForTimeout(800);
    await tap(page.getByText('Pre-validation', { exact: true }));
    await page.waitForTimeout(4500);
  }, keepContext: true },

  // 6. Review -> Sign & Distribute -> Authorize -> confirmations climb
  distributeRun: { continues: 'distributeSelect', run: async ({ page, tap }) => {
    await tap(page.getByText('Review Distribution', { exact: true }).last());
    await page.waitForTimeout(2200);
    await tap(page.getByText('Sign & Distribute', { exact: true }).last());
    await page.waitForTimeout(1800);
    await tap(page.getByText('Authorize & Start', { exact: true }).last());
    for (let i = 0; i < 5; i++) {
      await page.waitForTimeout(3000);
      await tap(page.getByText('Check distribution status', { exact: true }).last());
    }
    await page.waitForTimeout(2500);
    await scroll(page, 700, 1500);
    await page.waitForTimeout(1500);
  } },

  // 7. Beneficiary receives aid
  beneficiary: { role: 'beneficiary', route: '/', run: async ({ page, ready, tap }) => {
    await ready();
    await page.waitForTimeout(2500);
    await scroll(page, 500, 1300);
    await page.waitForTimeout(1200);
    await scroll(page, -500, 900);
    await tap(page.locator('a[href="/my-assistance"]').first());
    await page.waitForTimeout(3000);
  } },

  // 8. Merchant goes offline (real network drop via the browser)
  merchantOffline: { role: 'merchant', route: '/', run: async ({ page, ready, tap, ctx, mark }) => {
    await ready();
    await page.waitForTimeout(2500);
    mark('offline');
    await ctx.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await page.waitForTimeout(3000);
    await scroll(page, 300, 1200);
    await page.waitForTimeout(1500);
    await scroll(page, -300, 900);
    await page.waitForTimeout(2500);
    mark('online');
    await ctx.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForTimeout(3500);
  } },

  // 9. Merchant history
  merchantHistory: { role: 'merchant', route: '/history', run: async ({ page, ready }) => {
    await ready();
    await page.waitForTimeout(2500);
    await scroll(page, 600, 1500);
    await page.waitForTimeout(2000);
  } },

  // 10. Audit & compliance report
  audit: { role: 'lgu', route: '/audit-report', run: async ({ page, ready, tap }) => {
    await ready();
    await page.waitForTimeout(2500);
    await scroll(page, 800, 2200);
    await page.waitForTimeout(1200);
    await scroll(page, -800, 1200);
    await tap(page.getByText('Audit Trail', { exact: true }).first());
    await page.waitForTimeout(3000);
  } },
};

// Pre-steps that put the wizard on a given step OFF-camera (separate context).
const PREPS = {
  wizardToEligibility: async (page) => {
    await page.getByPlaceholder(/Typhoon Kristine/).fill('Typhoon Relief (demo)');
    await page.getByPlaceholder(/Describe the main/).fill('Emergency cash assistance for typhoon-affected households.');
    const pick = async (label, option) => { await page.getByText(label, { exact: true }).click(); await page.waitForTimeout(300); await page.getByText(option, { exact: true }).last().click(); await page.waitForTimeout(300); };
    await pick('Select Disaster Type', 'Typhoon'); await pick('Select City', 'Sample City'); await pick('Select District', 'District 1');
    await page.getByText('Select Affected Barangays', { exact: true }).click(); await page.waitForTimeout(300);
    await page.getByText('Brgy Sample 1', { exact: true }).last().click(); await page.getByText('Done', { exact: true }).last().click();
    await pick('Select Implementing Agency', 'City Social Welfare Office (demo)'); await pick('Select Funding Source', 'Local Calamity Fund (demo)');
    await page.getByText('Next Step', { exact: true }).last().click(); await page.waitForTimeout(800);
    await page.getByPlaceholder('e.g. 5000000').fill('2515500'); await page.getByPlaceholder('e.g. 5000', { exact: true }).fill('500');
    await page.getByText('Next Step', { exact: true }).last().click(); await page.waitForTimeout(800);
    await page.getByText('Today', { exact: true }).first().click(); await page.getByText('In 1 Month', { exact: true }).first().click();
    await page.getByText('Today', { exact: true }).nth(1).click(); await page.getByText('In 2 Weeks', { exact: true }).first().click();
    await page.getByText('Next Step', { exact: true }).last().click(); await page.waitForTimeout(1000);
  },
  wizardToVoucher: async (page) => {
    await PREPS.wizardToEligibility(page);
    await page.getByText('Targeted List via CSV (Private)', { exact: true }).click();
    await page.locator('textarea:visible').last().fill(CSV);
    await page.getByText('Next Step', { exact: true }).last().click(); await page.waitForTimeout(1000);
  },
};

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const wanted = process.argv.slice(2);
const manifestPath = path.join(DIR, 'clips.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
const open = {};

const recordClip = async (id, spec) => {
  console.log(`Recording ${id}...`);
  let ctx, page, t0, startOffset = 0;
  const taps = [];
  const marks = {};
  const pageErrors = spec.continues ? open[spec.continues].pageErrors : [];
  const since = () => (Date.now() - t0) / 1000;

  if (spec.continues) {
    ({ ctx, page, t0 } = open[spec.continues]);
    startOffset = since();
  } else {
    const data = buildDemoData(spec.role);
    if (spec.distribution) { const dj = makeDistributionJob(); Object.assign(data.functions, dj.functions); Object.assign(data.tables, dj.tables); }
    // Off-camera prep: reach the starting wizard step in a throwaway context,
    // then carry its sessionStorage-free state by replaying in the recorded one.
    ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2, isMobile: true, hasTouch: true, recordVideo: { dir: DIR, size: VIEW } });
    await ctx.addInitScript(initSessionScript(spec.role));
    page = await ctx.newPage();
    t0 = Date.now();
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)));
    await installMock(page, data, []);
    await page.goto(`${APP}${spec.route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6500);
    if (spec.prep) await PREPS[spec.prep](page);
  }

  const ready = async () => { startOffset = since(); };
  const tap = async (locator) => {
    await locator.scrollIntoViewIfNeeded().catch(() => {});
    const box = await locator.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
      // Visual touch indicator so taps read on video.
      await page.evaluate(({ x, y }) => {
        const d = document.createElement('div');
        d.style.cssText = `position:fixed;left:${x - 22}px;top:${y - 22}px;width:44px;height:44px;border-radius:50%;background:rgba(111,202,75,.45);border:3px solid rgba(17,46,88,.55);z-index:999999;pointer-events:none;transition:transform .45s ease-out,opacity .45s ease-out;`;
        document.body.appendChild(d);
        requestAnimationFrame(() => { d.style.transform = 'scale(1.6)'; d.style.opacity = '0'; });
        setTimeout(() => d.remove(), 600);
      }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    }
    taps.push(since());
    await locator.click();
  };
  const mark = (name) => { marks[name] = since(); };

  try {
    await spec.run({ page, ctx, ready, tap, mark });
    // Fail the clip if the Expo error overlay or an uncaught error appeared.
    const overlay = await page.getByText(/^(Uncaught Error|Server Error|Render Error|Console Error)$/).count();
    if (overlay > 0 || pageErrors.length) throw new Error(`App error during clip: ${pageErrors[0] ?? 'error overlay visible'}`);
  } catch (err) {
    await page.screenshot({ path: path.join(ROOT, 'out', `fail-${id}.png`) }).catch(() => {});
    await ctx.close().catch(() => {});
    throw err;
  }
  const end = since();

  if (spec.keepContext) {
    open[id] = { ctx, page, t0, pageErrors };
    manifest[id] = { pending: true, startOffset, end, taps, marks };
    return;
  }
  const video = page.video();
  await ctx.close();
  const file = await video.path();
  const finalFile = path.join(DIR, `${spec.continues ?? id}.webm`);
  if (file !== finalFile) fs.renameSync(file, finalFile);
  // A continued clip shares its parent's video file.
  const parent = spec.continues;
  if (parent) {
    const p = manifest[parent];
    manifest[parent] = { file: path.basename(finalFile), startOffset: p.startOffset, duration: p.end - p.startOffset, taps: p.taps, marks: p.marks };
    delete open[parent];
  }
  manifest[id] = { file: path.basename(finalFile), startOffset, duration: end - startOffset, taps, marks };
  console.log(`  ${id}: ${(end - startOffset).toFixed(1)}s (from ${startOffset.toFixed(1)}s)`);
};

for (const [id, spec] of Object.entries(CLIPS)) {
  if (wanted.length && !wanted.includes(id) && !wanted.includes(spec.continues ?? '')) continue;
  try {
    await recordClip(id, spec);
  } catch (err) {
    console.error(`  ${id} FAILED: ${String(err.message ?? err).split('\n').slice(0, 3).join(' / ')}`);
    for (const o of Object.values(open)) await o.page.screenshot({ path: path.join(ROOT, 'out', `fail-${id}.png`) }).catch(() => {});
  }
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
await browser.close();
console.log(`Manifest: ${manifestPath}`);
