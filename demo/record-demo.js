import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

await mkdir('demo-video', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: 'demo-video', size: { width: 1440, height: 900 } }
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));

try {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      await page.goto('http://127.0.0.1:4173', { waitUntil: 'domcontentloaded', timeout: 5000 });
      await page.waitForFunction(() => document.querySelector('#release-name')?.textContent === 'Checkout v2', null, { timeout: 5000 });
      break;
    } catch (error) {
      if (attempt === 29) throw error;
      await page.waitForTimeout(1000);
    }
  }

  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'demo-video/01-dashboard.png', fullPage: true });

  await page.locator('#investigate-btn').click();
  await page.waitForFunction(() => document.querySelector('#verdict-panel .verdict-badge')?.textContent === 'HOLD');
  await page.waitForTimeout(2200);
  await page.screenshot({ path: 'demo-video/02-hold-evidence.png', fullPage: true });

  await page.locator('[data-tab="graph"]').click();
  await page.waitForTimeout(1800);
  await page.screenshot({ path: 'demo-video/03-dependency-graph.png', fullPage: true });

  await page.locator('[data-tab="memory"]').click();
  await page.waitForTimeout(1200);
  await page.locator('[data-memory]').first().click();
  await page.waitForFunction(() => document.querySelector('#memory-detail .verdict-badge')?.textContent === 'HOLD');
  await page.waitForTimeout(1700);
  await page.screenshot({ path: 'demo-video/04-agent-memory.png', fullPage: true });

  await page.locator('[data-tab="overview"]').click();
  await page.locator('[data-incident="INC-1042"]').click();
  await page.waitForFunction(() => document.querySelector('[data-incident="INC-1042"]')?.dataset.action === 'reopen');
  await page.locator('[data-incident="INC-1048"]').click();
  await page.waitForFunction(() => document.querySelector('[data-incident="INC-1048"]')?.dataset.action === 'reopen');
  await page.locator('#investigate-btn').click();
  await page.waitForFunction(() => document.querySelector('#verdict-panel .verdict-badge')?.textContent === 'READY');
  await page.waitForTimeout(2200);
  await page.screenshot({ path: 'demo-video/05-ready-verdict.png', fullPage: true });

  await page.locator('[data-tab="memory"]').click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'demo-video/06-decision-history.png', fullPage: true });

  if (errors.length) throw new Error('Browser errors: ' + errors.join(' | '));
  console.log('Recorded dashboard, HOLD evidence, graph, memory, and READY verdict.');
} finally {
  await context.close();
  await browser.close();
}
