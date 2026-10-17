import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

let server;
let browser;
let baseUrl;

before(async () => {
  server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
    const file = join(ROOT, path === '/' ? 'index.html' : path);
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${server.address().port}/`;
  browser = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' },
  );
});

after(async () => {
  await browser?.close();
  server?.close();
});

const SEED_SCRIPT = `
  window.__seeded = (seed) => {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
  };
  Math.random = window.__seeded(42);
`;

async function openGame() {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.addInitScript(SEED_SCRIPT);
  await page.goto(baseUrl);
  return { page, errors };
}

const enemyCell = (page, r, c) => page.locator('#enemy-board .cell').nth(r * 10 + c);
const shotsOnEnemy = (page) =>
  page.evaluate(() => document.querySelectorAll('#enemy-board .cell.miss, #enemy-board .cell.hit, #enemy-board .cell.sunk').length);

async function startWithRandomFleet(page) {
  await page.click('#random');
  await page.click('#start');
}

test('page loads without console errors', async () => {
  const { page, errors } = await openGame();
  await page.waitForLoadState('networkidle');
  assert.deepEqual(errors, []);
  await page.close();
});

test('clicking quickly during the AI turn only fires one shot', async () => {
  const { page } = await openGame();
  await startWithRandomFleet(page);
  await enemyCell(page, 0, 0).click();
  await enemyCell(page, 0, 1).click();
  await enemyCell(page, 0, 2).click();
  assert.equal(await shotsOnEnemy(page), 1);
  await page.waitForTimeout(1200);
  const enemyShots = await page.locator('#log li', { hasText: 'Enemy fired' }).count();
  assert.equal(enemyShots, 1);
  await page.close();
});

test('placement controls are hidden once the battle starts', async () => {
  const { page } = await openGame();
  await startWithRandomFleet(page);
  assert.equal(await page.locator('#start').isVisible(), false);
  assert.equal(await page.locator('#random').isVisible(), false);
  await page.close();
});

test('player can sink every enemy ship, win, and start a fresh game', async () => {
  const { page } = await openGame();
  const targets = await page.evaluate(async () => {
    const { randomFleet } = await import('./src/game.js');
    return randomFleet(window.__seeded(42)).ships.flatMap((s) => s.cells);
  });
  await startWithRandomFleet(page);
  for (const [r, c] of targets) {
    await page.waitForSelector('#enemy-board.active');
    await enemyCell(page, r, c).click();
  }
  await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Victory'));
  assert.equal(await page.locator('#restart').isVisible(), true);

  await page.waitForTimeout(800);
  const enemyShots = await page.locator('#log li', { hasText: 'Enemy fired' }).count();
  assert.equal(enemyShots, targets.length - 1, 'AI must not fire after the player wins');

  await page.click('#restart');
  assert.equal(await shotsOnEnemy(page), 0);
  assert.equal(await page.locator('#log li').count(), 0);
  assert.equal(await page.locator('#start').isVisible(), true);
  await page.close();
});

test('on a phone-sized screen both boards fit without scrolling during battle', async () => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto(baseUrl);
  await startWithRandomFleet(page);
  const bottom = await page.evaluate(() => document.querySelector('#enemy-board').getBoundingClientRect().bottom);
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(bottom <= 812, `enemy board bottom at ${bottom}px, below the 812px viewport`);
  assert.ok(scrollWidth <= 375, `page is ${scrollWidth}px wide`);
  await context.close();
});
