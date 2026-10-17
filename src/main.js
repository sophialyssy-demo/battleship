import { SIZE, FLEET, createBoard, canPlace, placeShip, randomFleet, receiveShot, allSunk, shipCells } from './game.js';
import { createAI } from './ai.js';

const AI_DELAY_MS = 600;
const COLS = 'ABCDEFGHIJ';

const $ = (id) => document.getElementById(id);
const els = {
  status: $('status'),
  playerBoard: $('player-board'),
  enemyBoard: $('enemy-board'),
  playerFleet: $('player-fleet'),
  enemyFleet: $('enemy-fleet'),
  log: $('log'),
  rotate: $('rotate'),
  random: $('random'),
  clear: $('clear'),
  start: $('start'),
  restart: $('restart'),
  difficulty: $('difficulty'),
  placementControls: $('placement-controls'),
};

let state;

function newGame() {
  state = {
    phase: 'placing',
    horizontal: true,
    player: createBoard(),
    enemy: randomFleet(),
    ai: null,
    turn: 'player',
    hover: null,
    lastShot: { player: null, enemy: null },
  };
  els.log.innerHTML = '';
  els.placementControls.hidden = false;
  els.restart.hidden = true;
  setStatus(`Place your ${FLEET[0].name} (${FLEET[0].length}). Press R or Rotate to turn it.`);
  render();
}

function coord(r, c) {
  return `${COLS[c]}${r + 1}`;
}

function setStatus(text) {
  els.status.textContent = text;
}

function log(text) {
  const li = document.createElement('li');
  li.textContent = text;
  els.log.prepend(li);
}

function nextShipSpec() {
  return FLEET[state.player.ships.length] ?? null;
}

function buildGrid(container, onClick, onHover) {
  container.innerHTML = '';
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cell';
      btn.dataset.r = r;
      btn.dataset.c = c;
      btn.setAttribute('aria-label', coord(r, c));
      btn.addEventListener('click', () => onClick(r, c));
      if (onHover) {
        btn.addEventListener('mouseenter', () => onHover(r, c));
      }
      container.appendChild(btn);
    }
  }
  if (onHover) container.addEventListener('mouseleave', () => onHover(null));
}

function paintBoard(container, board, { revealShips }) {
  const buttons = container.children;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const cell = board.cells[r][c];
      const btn = buttons[r * SIZE + c];
      const ship = cell.shipIndex !== null ? board.ships[cell.shipIndex] : null;
      const sunk = ship && ship.hits === ship.length;
      btn.className = 'cell';
      if (ship && (revealShips || sunk)) btn.classList.add('ship');
      if (cell.shot && ship) btn.classList.add(sunk ? 'sunk' : 'hit');
      if (cell.shot && !ship) btn.classList.add('miss');
    }
  }
}

function paintPreview() {
  const spec = nextShipSpec();
  if (state.phase !== 'placing' || !spec || !state.hover) return;
  const [r, c] = state.hover;
  const valid = canPlace(state.player, spec.length, r, c, state.horizontal);
  for (const [pr, pc] of shipCells(spec.length, r, c, state.horizontal)) {
    if (pr >= SIZE || pc >= SIZE) continue;
    const btn = els.playerBoard.children[pr * SIZE + pc];
    btn.classList.add('preview');
    if (!valid) btn.classList.add('invalid');
  }
}

function paintLastShots() {
  const { player, enemy } = state.lastShot;
  if (player) els.enemyBoard.children[player[0] * SIZE + player[1]].classList.add('last');
  if (enemy) els.playerBoard.children[enemy[0] * SIZE + enemy[1]].classList.add('last');
}

function renderFleet(list, board, highlightNext) {
  list.innerHTML = '';
  FLEET.forEach((spec, i) => {
    const li = document.createElement('li');
    const ship = board.ships[i];
    li.textContent = `${spec.name} (${spec.length})`;
    if (ship && ship.hits === ship.length) li.classList.add('sunk');
    if (highlightNext && i === board.ships.length) li.classList.add('next');
    list.appendChild(li);
  });
}

function render() {
  paintBoard(els.playerBoard, state.player, { revealShips: true });
  paintBoard(els.enemyBoard, state.enemy, { revealShips: state.phase === 'over' });
  paintPreview();
  paintLastShots();
  renderFleet(els.playerFleet, state.player, state.phase === 'placing');
  renderFleet(els.enemyFleet, state.enemy, false);
  els.start.disabled = state.player.ships.length !== FLEET.length;
  els.enemyBoard.classList.toggle('active', state.phase === 'playing' && state.turn === 'player');
}

function onPlayerBoardClick(r, c) {
  if (state.phase !== 'placing') return;
  const spec = nextShipSpec();
  if (!spec) return;
  if (!placeShip(state.player, spec, r, c, state.horizontal)) {
    setStatus(`${spec.name} doesn't fit there.`);
    return;
  }
  const next = nextShipSpec();
  setStatus(next ? `Place your ${next.name} (${next.length}).` : 'Fleet ready. Press Start game.');
  render();
}

function onPlayerBoardHover(r, c) {
  state.hover = r === null ? null : [r, c];
  render();
}

function onEnemyBoardClick(r, c) {
  if (state.phase !== 'playing') return;
  const outcome = receiveShot(state.enemy, r, c);
  if (outcome.result === 'repeat') {
    setStatus(`You already fired at ${coord(r, c)}. Pick another square.`);
    return;
  }
  state.lastShot.player = [r, c];
  describeShot('You', r, c, outcome);
  if (allSunk(state.enemy)) return endGame('player');
  state.turn = 'ai';
  setStatus('Enemy is aiming...');
  render();
  setTimeout(aiTurn, AI_DELAY_MS);
}

function aiTurn() {
  const [r, c] = state.ai.nextMove();
  const outcome = receiveShot(state.player, r, c);
  state.ai.report([r, c], outcome);
  state.lastShot.enemy = [r, c];
  describeShot('Enemy', r, c, outcome);
  if (allSunk(state.player)) return endGame('ai');
  state.turn = 'player';
  setStatus('Your turn. Fire on the enemy board.');
  render();
}

function describeShot(who, r, c, outcome) {
  const where = coord(r, c);
  if (outcome.result === 'miss') log(`${who} fired at ${where}: miss.`);
  if (outcome.result === 'hit') log(`${who} fired at ${where}: hit!`);
  if (outcome.result === 'sunk') {
    const owner = who === 'You' ? "the enemy's" : 'your';
    log(`${who} fired at ${where}: sunk ${owner} ${outcome.ship.name}!`);
  }
}

function endGame(winner) {
  state.phase = 'over';
  setStatus(winner === 'player' ? 'Victory! You sank the whole enemy fleet.' : 'Defeat. The enemy sank your fleet.');
  els.restart.hidden = false;
  render();
}

els.rotate.addEventListener('click', () => {
  state.horizontal = !state.horizontal;
  render();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') {
    state.horizontal = !state.horizontal;
    render();
  }
});

els.random.addEventListener('click', () => {
  if (state.phase !== 'placing') return;
  state.player = randomFleet();
  setStatus('Fleet ready. Press Start game.');
  render();
});

els.clear.addEventListener('click', () => {
  if (state.phase !== 'placing') return;
  state.player = createBoard();
  setStatus(`Place your ${FLEET[0].name} (${FLEET[0].length}).`);
  render();
});

els.start.addEventListener('click', () => {
  if (state.player.ships.length !== FLEET.length) return;
  state.phase = 'playing';
  state.ai = createAI({ difficulty: els.difficulty.value });
  els.placementControls.hidden = true;
  setStatus('Your turn. Fire on the enemy board.');
  log(`Battle started (AI: ${els.difficulty.value}).`);
  render();
});

els.restart.addEventListener('click', newGame);

buildGrid(els.playerBoard, onPlayerBoardClick, onPlayerBoardHover);
buildGrid(els.enemyBoard, onEnemyBoardClick);
newGame();
