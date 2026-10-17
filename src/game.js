export const SIZE = 10;

export const FLEET = [
  { name: 'Cattle Drive', length: 5 },
  { name: 'Freight Train', length: 4 },
  { name: 'Stagecoach', length: 3 },
  { name: 'Chuckwagon', length: 3 },
  { name: 'Pony Express', length: 2 },
];

export function createBoard() {
  const cells = [];
  for (let r = 0; r < SIZE; r++) {
    const row = [];
    for (let c = 0; c < SIZE; c++) row.push({ shipIndex: null, shot: false });
    cells.push(row);
  }
  return { cells, ships: [] };
}

export function inBounds(r, c) {
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}

export function shipCells(length, row, col, horizontal) {
  const out = [];
  for (let i = 0; i < length; i++) {
    out.push(horizontal ? [row, col + i] : [row + i, col]);
  }
  return out;
}

export function canPlace(board, length, row, col, horizontal) {
  return shipCells(length, row, col, horizontal).every(
    ([r, c]) => inBounds(r, c) && board.cells[r][c].shipIndex === null,
  );
}

export function placeShip(board, spec, row, col, horizontal) {
  if (!canPlace(board, spec.length, row, col, horizontal)) return false;
  const cells = shipCells(spec.length, row, col, horizontal);
  const index = board.ships.length;
  board.ships.push({ name: spec.name, length: spec.length, cells, hits: 0 });
  for (const [r, c] of cells) board.cells[r][c].shipIndex = index;
  return true;
}

export function randomFleet(rng = Math.random) {
  const board = createBoard();
  for (const spec of FLEET) {
    let placed = false;
    while (!placed) {
      const horizontal = rng() < 0.5;
      const row = Math.floor(rng() * SIZE);
      const col = Math.floor(rng() * SIZE);
      placed = placeShip(board, spec, row, col, horizontal);
    }
  }
  return board;
}

export function receiveShot(board, r, c) {
  const cell = board.cells[r][c];
  if (cell.shot) return { result: 'repeat' };
  cell.shot = true;
  if (cell.shipIndex === null) return { result: 'miss' };
  const ship = board.ships[cell.shipIndex];
  ship.hits++;
  if (ship.hits === ship.length) return { result: 'sunk', ship };
  return { result: 'hit', ship };
}

export function allSunk(board) {
  return board.ships.every((s) => s.hits === s.length);
}
