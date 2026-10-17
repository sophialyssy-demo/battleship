import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIZE, FLEET, createBoard, canPlace, placeShip, randomFleet, receiveShot, allSunk } from '../src/game.js';

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

test('ships cannot hang off the right or bottom edge', () => {
  const b = createBoard();
  assert.equal(canPlace(b, 5, 0, 6, true), false);
  assert.equal(canPlace(b, 5, 0, 5, true), true);
  assert.equal(canPlace(b, 5, 6, 0, false), false);
  assert.equal(canPlace(b, 5, 5, 0, false), true);
});

test('ships cannot overlap', () => {
  const b = createBoard();
  assert.ok(placeShip(b, FLEET[0], 2, 2, true));
  assert.equal(placeShip(b, FLEET[1], 0, 4, false), false);
  assert.equal(b.ships.length, 1);
});

test('random fleets are always legal', () => {
  for (let seed = 1; seed <= 500; seed++) {
    const b = randomFleet(seeded(seed));
    assert.equal(b.ships.length, FLEET.length);
    const occupied = b.cells.flat().filter((c) => c.shipIndex !== null).length;
    assert.equal(occupied, FLEET.reduce((n, s) => n + s.length, 0));
    for (const ship of b.ships) {
      for (const [r, c] of ship.cells) assert.ok(r >= 0 && r < SIZE && c >= 0 && c < SIZE);
    }
  }
});

test('shots report miss, hit, sunk, and repeat', () => {
  const b = createBoard();
  placeShip(b, FLEET[4], 0, 0, true);
  assert.equal(receiveShot(b, 5, 5).result, 'miss');
  assert.equal(receiveShot(b, 0, 0).result, 'hit');
  assert.equal(receiveShot(b, 0, 0).result, 'repeat');
  assert.equal(b.ships[0].hits, 1, 'repeat shot must not add a hit');
  assert.equal(receiveShot(b, 0, 1).result, 'sunk');
});

test('game is over only when every ship is sunk', () => {
  const b = createBoard();
  placeShip(b, FLEET[4], 0, 0, true);
  placeShip(b, FLEET[3], 2, 0, true);
  receiveShot(b, 0, 0);
  receiveShot(b, 0, 1);
  assert.equal(allSunk(b), false);
  for (let c = 0; c < 3; c++) receiveShot(b, 2, c);
  assert.equal(allSunk(b), true);
});
