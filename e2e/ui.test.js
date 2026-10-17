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

async function openGame(options) {
  const page = await browser.newPage(options);
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
  const enemyShots = await page.locator('#log li[data-by="ai"]').count();
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
  await page.waitForFunction(() => document.querySelector('#banner.win:not([hidden])'));
  assert.equal(await page.locator('#restart').isVisible(), true);

  await page.waitForTimeout(800);
  const enemyShots = await page.locator('#log li[data-by="ai"]').count();
  assert.equal(enemyShots, targets.length - 1, 'AI must not fire after the player wins');

  await page.evaluate(() => { window.__soundLog = []; });
  await page.click('#restart');
  assert.deepEqual(await page.evaluate(() => window.__soundLog), ['giddyup']);
  assert.equal(await shotsOnEnemy(page), 0);
  assert.equal(await page.locator('#log li').count(), 0);
  assert.equal(await page.locator('#start').isVisible(), true);
  await page.close();
});

test('shots play sounds, and the mute toggle silences them and is remembered', async () => {
  const { page, errors } = await openGame();
  await page.evaluate(() => { window.__soundLog = []; });
  await startWithRandomFleet(page);
  await enemyCell(page, 0, 0).click();
  await page.waitForSelector('#enemy-board.active');
  const sounds = await page.evaluate(() => window.__soundLog);
  assert.deepEqual(sounds.slice(0, 2), ['giddyup', 'shot']);
  assert.ok(sounds.length >= 5, `expected player and AI shot sounds, got ${sounds}`);

  await page.click('#mute');
  assert.equal(await page.getAttribute('#mute', 'aria-pressed'), 'true');
  await page.evaluate(() => { window.__soundLog = []; });
  await enemyCell(page, 0, 1).click();
  await page.waitForSelector('#enemy-board.active');
  assert.deepEqual(await page.evaluate(() => window.__soundLog), []);

  await page.reload();
  assert.equal(await page.getAttribute('#mute', 'aria-pressed'), 'true');
  assert.deepEqual(errors, []);
  await page.close();
});

test('the rival ranch is colored and labeled by opponent', async () => {
  const { page } = await openGame();
  const look = () => page.evaluate(() => ({
    badge: document.querySelector('#foe-badge').textContent,
    color: getComputedStyle(document.querySelector('#enemy-panel h2')).color,
  }));
  const outlaw = await look();
  await page.selectOption('#difficulty', 'easy');
  const greenhorn = await look();
  assert.equal(outlaw.badge, 'The Outlaw');
  assert.equal(greenhorn.badge, 'The Greenhorn');
  assert.notEqual(outlaw.color, greenhorn.color);
  await page.close();
});

test('quitting mid-battle takes two clicks, then starts a fresh game, even during the AI turn', async () => {
  const { page, errors } = await openGame();
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
  const shotsOnPlayer = () =>
    page.evaluate(() => document.querySelectorAll('#player-board .cell.miss, #player-board .cell.hit, #player-board .cell.sunk').length);
  const armed = () => page.evaluate(() => 'armed' in document.querySelector('#quit').dataset);
  assert.match(await page.textContent('#status'), /Howdy/);
  assert.equal(await page.locator('#quit').isVisible(), false);
  await startWithRandomFleet(page);

  await page.click('#quit');
  assert.equal(await armed(), true);
  assert.equal(await page.locator('#random').isVisible(), false);

  await enemyCell(page, 0, 0).click();
  assert.equal(await armed(), false);

  await page.click('#quit');
  await page.click('#quit');
  await page.waitForTimeout(1000);
  assert.equal(await page.locator('#random').isVisible(), true);
  assert.equal(await page.locator('#quit').isVisible(), false);
  assert.equal(await shotsOnPlayer(), 0);
  assert.equal(await page.locator('#log li').count(), 0);
  assert.deepEqual(dialogs, []);
  assert.deepEqual(errors, []);
  await page.close();
});

test('the sound and quit buttons never cover the title or status sign', async () => {
  for (const width of [1280, 1024, 800, 701, 375]) {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    await page.goto(baseUrl);
    await startWithRandomFleet(page);
    const overlaps = await page.evaluate(() => {
      const box = (el) => el.getBoundingClientRect();
      const corner = box(document.querySelector('.corner'));
      const hit = (r) => r.width > 0 && corner.left < r.right && r.left < corner.right && corner.top < r.bottom && r.top < corner.bottom;
      const title = [...document.querySelectorAll('h1 .star')].map(box);
      const titleBox = { left: title[0].left, right: title[1].right, top: title[0].top, bottom: title[0].bottom, width: 1 };
      return { title: hit(titleBox), status: hit(box(document.querySelector('#status'))) };
    });
    assert.deepEqual(overlaps, { title: false, status: false }, `at ${width}px wide`);
    await page.close();
  }
});

const playerCell = (page, r, c) => page.locator('#player-board .cell').nth(r * 10 + c);
const corral = (page, name) => page.locator(`#player-fleet li[data-ship="${name}"]`);
const cellsOf = (page, kind) =>
  page.evaluate((k) => [...document.querySelectorAll('#player-board .cell')].flatMap((b, i) => (b.classList.contains(`k-${k}`) ? [i] : [])), kind);

async function center(locator) {
  const b = await locator.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

async function mouseDrag(page, from, to) {
  const a = await center(from);
  const b = await center(to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
}

test('outfits can be dragged from the corral, moved, turned, and snap back when they do not fit', async () => {
  const { page, errors } = await openGame({ viewport: { width: 1280, height: 1000 } });
  await mouseDrag(page, corral(page, 'Pony Express'), playerCell(page, 0, 0));
  assert.deepEqual(await cellsOf(page, 'pony-express'), [0, 1]);
  assert.match(await page.textContent('#player-fleet li.next'), /Cattle Drive/);

  await playerCell(page, 2, 2).click();
  assert.deepEqual(await cellsOf(page, 'cattle-drive'), [22, 23, 24, 25, 26]);

  await mouseDrag(page, playerCell(page, 0, 1), playerCell(page, 5, 6));
  assert.deepEqual(await cellsOf(page, 'pony-express'), [55, 56]);

  await mouseDrag(page, playerCell(page, 5, 5), playerCell(page, 2, 4));
  assert.deepEqual(await cellsOf(page, 'pony-express'), [55, 56]);
  assert.match(await page.textContent('#status'), /won't fit/);

  await playerCell(page, 5, 5).click();
  assert.deepEqual(await cellsOf(page, 'pony-express'), [55, 65]);
  assert.deepEqual(await cellsOf(page, 'cattle-drive'), [22, 23, 24, 25, 26]);

  await page.mouse.move(5, 5);
  for (const [name, r] of [['Freight Train', 7], ['Stagecoach', 8], ['Chuckwagon', 9]]) {
    await mouseDrag(page, corral(page, name), playerCell(page, r, 0));
  }
  assert.equal(await page.locator('#player-fleet li.draggable').count(), 0);
  assert.equal(await page.isDisabled('#start'), false);
  assert.deepEqual(errors, []);
  await page.close();
});

test('on a touch screen an outfit can be dragged onto the ranch without scrolling the page', async () => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(baseUrl);
  const cdp = await context.newCDPSession(page);
  const touch = (type, p) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p.x, y: p.y }] : [] });
  const a = await center(corral(page, 'Cattle Drive'));
  const b = await center(playerCell(page, 3, 0));
  await touch('touchStart', a);
  for (let i = 1; i <= 8; i++) await touch('touchMove', { x: a.x + ((b.x - a.x) * i) / 8, y: a.y + ((b.y - a.y) * i) / 8 });
  await touch('touchEnd');
  assert.deepEqual(await cellsOf(page, 'cattle-drive'), [30, 31, 32, 33, 34]);
  assert.equal(await page.evaluate(() => window.scrollY), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('on a phone-sized screen both boards and fleet lists fit without scrolling during battle', async () => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto(baseUrl);
  await startWithRandomFleet(page);
  const bottom = await page.evaluate(() => document.querySelector('#enemy-fleet').getBoundingClientRect().bottom);
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(bottom <= 812, `enemy fleet list bottom at ${bottom}px, below the 812px viewport`);
  assert.ok(scrollWidth <= 375, `page is ${scrollWidth}px wide`);
  await context.close();
});
