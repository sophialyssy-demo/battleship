import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIZE, FLEET, createBoard, placeShip, randomFleet, receiveShot, allSunk } from '../src/game.js';
import { createAI } from '../src/ai.js';

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function playOut(board, ai) {
  const seen = new Set();
  let shots = 0;
  while (!allSunk(board)) {
    const [r, c] = ai.nextMove();
    assert.ok(r >= 0 && r < SIZE && c >= 0 && c < SIZE, `move out of bounds: ${r},${c}`);
    const k = `${r},${c}`;
    assert.ok(!seen.has(k), `AI fired at ${k} twice`);
    seen.add(k);
    ai.report([r, c], receiveShot(board, r, c));
    shots++;
    assert.ok(shots <= SIZE * SIZE, 'AI took more than 100 shots');
  }
  return shots;
}

for (const difficulty of ['easy', 'hard']) {
  test(`${difficulty} AI never repeats a shot and always finishes`, () => {
    for (let seed = 1; seed <= 300; seed++) {
      playOut(randomFleet(seeded(seed)), createAI({ difficulty, rng: seeded(seed * 7) }));
    }
  });
}

test('hard AI beats easy AI on average', () => {
  let easy = 0;
  let hard = 0;
  for (let seed = 1; seed <= 300; seed++) {
    easy += playOut(randomFleet(seeded(seed)), createAI({ difficulty: 'easy', rng: seeded(seed * 3) }));
    hard += playOut(randomFleet(seeded(seed)), createAI({ difficulty: 'hard', rng: seeded(seed * 3) }));
  }
  assert.ok(hard / 300 < easy / 300 - 15, `hard avg ${hard / 300} vs easy avg ${easy / 300}`);
});

test('hard AI follows up a hit on an adjacent square', () => {
  const b = createBoard();
  placeShip(b, FLEET[0], 4, 2, true);
  const ai = createAI({ difficulty: 'hard', rng: seeded(1) });
  ai.report([4, 4], receiveShot(b, 4, 4));
  const [r, c] = ai.nextMove();
  assert.equal(Math.abs(r - 4) + Math.abs(c - 4), 1);
});

test('hard AI keeps hunting a second ship it hit while sinking the first', () => {
  const b = createBoard();
  placeShip(b, FLEET[4], 0, 0, true);
  placeShip(b, FLEET[3], 1, 0, true);
  const ai = createAI({ difficulty: 'hard', rng: seeded(2) });
  ai.report([0, 0], receiveShot(b, 0, 0));
  ai.report([1, 0], receiveShot(b, 1, 0));
  ai.report([0, 1], receiveShot(b, 0, 1));
  const [r, c] = ai.nextMove();
  assert.ok(
    (r === 1 && c === 1) || (r === 2 && c === 0),
    `expected a follow-up next to (1,0), got ${r},${c}`,
  );
});
