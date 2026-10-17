import { SIZE, inBounds } from './game.js';

const DIRS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

const key = (r, c) => `${r},${c}`;

export function createAI({ difficulty = 'hard', rng = Math.random } = {}) {
  const tried = new Set();
  let openHits = [];

  function untried(r, c) {
    return inBounds(r, c) && !tried.has(key(r, c));
  }

  function pick(list) {
    return list[Math.floor(rng() * list.length)];
  }

  function huntMove() {
    const all = [];
    const parity = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (!untried(r, c)) continue;
        all.push([r, c]);
        if ((r + c) % 2 === 0) parity.push([r, c]);
      }
    }
    if (difficulty === 'hard' && parity.length) return pick(parity);
    return pick(all);
  }

  function lineCandidates() {
    for (const [r, c] of openHits) {
      for (const [dr, dc] of DIRS) {
        if (!openHits.some(([hr, hc]) => hr === r + dr && hc === c + dc)) continue;
        const ends = [];
        let fr = r, fc = c;
        while (openHits.some(([hr, hc]) => hr === fr + dr && hc === fc + dc)) {
          fr += dr;
          fc += dc;
        }
        if (untried(fr + dr, fc + dc)) ends.push([fr + dr, fc + dc]);
        let br = r, bc = c;
        while (openHits.some(([hr, hc]) => hr === br - dr && hc === bc - dc)) {
          br -= dr;
          bc -= dc;
        }
        if (untried(br - dr, bc - dc)) ends.push([br - dr, bc - dc]);
        if (ends.length) return ends;
      }
    }
    return [];
  }

  function targetMove() {
    const line = lineCandidates();
    if (line.length) return pick(line);
    const neighbors = [];
    for (const [r, c] of openHits) {
      for (const [dr, dc] of DIRS) {
        if (untried(r + dr, c + dc)) neighbors.push([r + dr, c + dc]);
      }
    }
    return neighbors.length ? pick(neighbors) : null;
  }

  return {
    nextMove() {
      let move = null;
      if (difficulty === 'hard' && openHits.length) move = targetMove();
      if (!move) move = huntMove();
      tried.add(key(move[0], move[1]));
      return move;
    },
    report([r, c], outcome) {
      tried.add(key(r, c));
      if (outcome.result === 'hit') openHits.push([r, c]);
      if (outcome.result === 'sunk') {
        const sunk = new Set(outcome.ship.cells.map(([sr, sc]) => key(sr, sc)));
        openHits = openHits.filter(([hr, hc]) => !sunk.has(key(hr, hc)));
      }
    },
  };
}
