import { SIZE, FLEET, createBoard, canPlace, placeShip, randomFleet, receiveShot, allSunk, shipCells, isHorizontal, withoutShip } from './game.js';
import { createAI } from './ai.js';
import { play, isMuted, setMuted } from './sound.js';

const AI_DELAY_MS = 600;
const DRAG_THRESHOLD_PX = 5;
const COLS = 'ABCDEFGHIJ';
const OPPONENT = { hard: 'The Outlaw', easy: 'The Greenhorn' };

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
  foeBadge: $('foe-badge'),
  placementControls: $('placement-controls'),
  playerPanel: $('player-panel'),
  enemyPanel: $('enemy-panel'),
  banner: $('banner'),
  mute: $('mute'),
  quit: $('quit'),
};

let state;
let quitTimer;
let suppressClick = false;

function newGame() {
  state = {
    phase: 'placing',
    horizontal: true,
    player: createBoard(),
    enemy: randomFleet(),
    ai: null,
    turn: 'player',
    hover: null,
    drag: null,
    lastShot: { player: null, enemy: null },
  };
  disarmQuit();
  els.log.innerHTML = '';
  els.placementControls.hidden = false;
  els.restart.hidden = true;
  els.banner.hidden = true;
  setStatus(`Howdy, partner! Drag your ${FLEET[0].name} (${FLEET[0].length}) onto your ranch, or click a square. R turns it.`);
  render();
}

// Runs fn after a delay, unless a new game has started in the meantime.
function later(fn, ms) {
  const game = state;
  setTimeout(() => {
    if (state === game) fn();
  }, ms);
}

function opponent() {
  return OPPONENT[els.difficulty.value];
}

function renderOpponent() {
  const outlaw = els.difficulty.value === 'hard';
  document.body.dataset.opponent = outlaw ? 'outlaw' : 'greenhorn';
  els.foeBadge.textContent = outlaw ? 'The Outlaw' : 'The Greenhorn';
}

function coord(r, c) {
  return `${COLS[c]}${r + 1}`;
}

function setStatus(text) {
  els.status.textContent = text;
}

function log(text, kind, by) {
  const li = document.createElement('li');
  li.textContent = text;
  if (kind) li.className = kind;
  if (by) li.dataset.by = by;
  els.log.prepend(li);
}

function popup(board, r, c, text, kind) {
  const cell = board.children[r * SIZE + c];
  const el = document.createElement('div');
  el.className = `pop ${kind}`;
  el.setAttribute('aria-hidden', 'true');
  el.textContent = text;
  board.parentElement.appendChild(el);
  const half = el.offsetWidth / 2;
  const min = board.offsetLeft + half;
  const max = board.offsetLeft + board.offsetWidth - half;
  const x = cell.offsetLeft + cell.offsetWidth / 2;
  el.style.left = `${Math.max(min, Math.min(max, x))}px`;
  el.style.top = `${cell.offsetTop + cell.offsetHeight / 2}px`;
  setTimeout(() => el.remove(), 1300);
}

function announceHit(board, r, c, outcome, side) {
  if (outcome.result === 'miss') return;
  const sunk = outcome.result === 'sunk';
  popup(board, r, c, sunk ? `${outcome.ship.name} down!` : 'HIT!', sunk ? `sunk ${side}` : side);
  flash(els.status, 'hit-flash');
}

function flash(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

function addLabels(frame) {
  const cols = document.createElement('div');
  cols.className = 'labels cols';
  const rows = document.createElement('div');
  rows.className = 'labels rows';
  for (let i = 0; i < SIZE; i++) {
    cols.appendChild(Object.assign(document.createElement('span'), { textContent: COLS[i] }));
    rows.appendChild(Object.assign(document.createElement('span'), { textContent: i + 1 }));
  }
  cols.setAttribute('aria-hidden', 'true');
  rows.setAttribute('aria-hidden', 'true');
  frame.prepend(cols, rows);
}

function nextShipSpec() {
  return FLEET.find((spec) => !state.player.ships.some((s) => s.name === spec.name)) ?? null;
}

function placementStatus() {
  const next = nextShipSpec();
  return next
    ? `Place your ${next.name} (${next.length}): drag it from the corral or click your ranch.`
    : 'Outfit\'s ready. Hit Draw! to start the showdown.';
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
  addLabels(container.parentElement);
}

function segmentClasses(ship, r, c) {
  const i = ship.cells.findIndex(([sr, sc]) => sr === r && sc === c);
  const vertical = ship.cells[0][1] === ship.cells[1][1];
  const part = i === 0 ? 'bow' : i === ship.length - 1 ? 'stern' : 'mid';
  const kind = `k-${ship.name.toLowerCase().replace(/\s+/g, '-')}`;
  return vertical ? [part, kind, 'v'] : [part, kind];
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
      if (ship && (revealShips || sunk)) btn.classList.add('ship', ...segmentClasses(ship, r, c));
      if (cell.shot && ship) btn.classList.add(sunk ? 'sunk' : 'hit');
      if (cell.shot && !ship) btn.classList.add('miss');
      const status = cell.shot ? (ship ? (sunk ? `sunk ${ship.name}` : 'hit') : 'miss') : ship && revealShips ? ship.name : '';
      btn.setAttribute('aria-label', status ? `${coord(r, c)}, ${status}` : coord(r, c));
    }
  }
}

function paintPreview() {
  if (state.phase !== 'placing') return;
  const drag = state.drag?.moved ? state.drag : null;
  const spec = drag ? drag.spec : nextShipSpec();
  const at = drag ? drag.anchor : state.hover;
  const horizontal = drag ? drag.horizontal : state.horizontal;
  if (!spec || !at) return;
  if (!drag && state.player.cells[at[0]][at[1]].shipIndex !== null) return;
  const [r, c] = at;
  const valid = canPlace(state.player, spec.length, r, c, horizontal);
  const cells = shipCells(spec.length, r, c, horizontal);
  cells.forEach(([pr, pc], i) => {
    if (pr < 0 || pc < 0 || pr >= SIZE || pc >= SIZE) return;
    const btn = els.playerBoard.children[pr * SIZE + pc];
    const part = i === 0 ? 'bow' : i === cells.length - 1 ? 'stern' : 'mid';
    btn.classList.add('preview', part, `k-${spec.name.toLowerCase().replace(/\s+/g, '-')}`);
    if (!horizontal) btn.classList.add('v');
    if (!valid) btn.classList.add('invalid');
  });
}

function paintLastShots() {
  const { player, enemy } = state.lastShot;
  if (player) els.enemyBoard.children[player[0] * SIZE + player[1]].classList.add('last');
  if (enemy) els.playerBoard.children[enemy[0] * SIZE + enemy[1]].classList.add('last');
}

function renderFleet(list, board, { highlightNext, showDamage, draggable = false }) {
  list.innerHTML = '';
  const next = highlightNext ? nextShipSpec() : null;
  FLEET.forEach((spec) => {
    const li = document.createElement('li');
    const ship = board.ships.find((s) => s.name === spec.name);
    li.dataset.ship = spec.name;
    const sunk = ship && ship.hits === ship.length;
    li.setAttribute('aria-label', `${spec.name}, ${spec.length} squares${sunk ? ', sunk' : ''}`);
    li.append(spec.name);
    const pips = document.createElement('span');
    pips.className = 'pips';
    pips.setAttribute('aria-hidden', 'true');
    for (let p = 0; p < spec.length; p++) {
      const pip = document.createElement('i');
      const damaged = showDamage && ship && board.cells[ship.cells[p][0]][ship.cells[p][1]].shot;
      if (sunk || damaged) pip.className = 'hit';
      pips.appendChild(pip);
    }
    li.appendChild(pips);
    if (sunk) li.classList.add('sunk');
    if (spec === next) li.classList.add('next');
    if (draggable && !ship && !state.drag?.moved) li.classList.add('draggable');
    if (draggable && state.drag?.moved && state.drag.spec.name === spec.name) li.classList.add('dragging');
    list.appendChild(li);
  });
}

function render() {
  paintBoard(els.playerBoard, state.player, { revealShips: true });
  paintBoard(els.enemyBoard, state.enemy, { revealShips: state.phase === 'over' });
  paintPreview();
  paintLastShots();
  renderFleet(els.playerFleet, state.player, { highlightNext: state.phase === 'placing', showDamage: true, draggable: state.phase === 'placing' });
  renderFleet(els.enemyFleet, state.enemy, { highlightNext: false, showDamage: false });
  els.start.disabled = state.player.ships.length !== FLEET.length;
  const playerTurn = state.phase === 'playing' && state.turn === 'player';
  els.quit.hidden = state.phase !== 'playing';
  els.playerPanel.classList.toggle('placing', state.phase === 'placing');
  els.enemyBoard.classList.toggle('active', playerTurn);
  els.enemyPanel.classList.toggle('active', playerTurn);
  els.enemyPanel.classList.toggle('scanning', state.phase === 'playing');
  els.playerPanel.classList.toggle('incoming', state.phase === 'playing' && state.turn === 'ai');
}

function onPlayerBoardClick(r, c) {
  if (state.phase !== 'placing' || suppressClick) return;
  const index = state.player.cells[r][c].shipIndex;
  if (index !== null) {
    turnShip(state.player.ships[index]);
    return;
  }
  const spec = nextShipSpec();
  if (!spec) return;
  if (!placeShip(state.player, spec, r, c, state.horizontal)) {
    play('invalid');
    setStatus(`Your ${spec.name} won't fit there, partner.`);
    return;
  }
  play('place');
  setStatus(placementStatus());
  render();
}

function turnShip(ship) {
  const board = withoutShip(state.player, ship.name);
  if (!placeShip(board, ship, ship.cells[0][0], ship.cells[0][1], !isHorizontal(ship))) {
    play('invalid');
    setStatus(`No room to turn your ${ship.name} there, partner.`);
    return;
  }
  state.player = board;
  play('place');
  setStatus(placementStatus());
  render();
}

// Drag and drop (pointer events, so mouse and touch both work). A press that
// doesn't move is left to the click handler: place the next outfit, or turn one.
function startDrag(e, spec, horizontal, offset, origin) {
  if (state.phase !== 'placing' || e.button !== 0) return;
  if (e.target.hasPointerCapture?.(e.pointerId)) e.target.releasePointerCapture(e.pointerId);
  state.drag = { spec, horizontal, offset, origin, x: e.clientX, y: e.clientY, moved: false, anchor: null };
}

function anchorAt(drag) {
  const cell = document.elementFromPoint(drag.x, drag.y)?.closest('#player-board .cell');
  if (!cell) return null;
  const along = drag.offset;
  return [Number(cell.dataset.r) - (drag.horizontal ? 0 : along), Number(cell.dataset.c) - (drag.horizontal ? along : 0)];
}

function onDragMove(e) {
  const drag = state.drag;
  if (!drag) return;
  if (!drag.moved) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < DRAG_THRESHOLD_PX) return;
    drag.moved = true;
    if (drag.origin) state.player = withoutShip(state.player, drag.spec.name);
    document.body.classList.add('dragging');
  }
  e.preventDefault();
  drag.x = e.clientX;
  drag.y = e.clientY;
  drag.anchor = anchorAt(drag);
  render();
}

function onDragEnd(e) {
  const drag = state.drag;
  if (!drag) return;
  state.drag = null;
  if (!drag.moved) return;
  document.body.classList.remove('dragging');
  suppressClick = true;
  setTimeout(() => { suppressClick = false; }, 0);
  const target = e.type === 'pointercancel' ? null : drag.anchor;
  const placed = target && placeShip(state.player, drag.spec, target[0], target[1], drag.horizontal);
  if (placed) {
    play('place');
    setStatus(placementStatus());
  } else {
    if (drag.origin) placeShip(state.player, drag.spec, drag.origin.r, drag.origin.c, drag.origin.horizontal);
    if (target) {
      play('invalid');
      setStatus(`Your ${drag.spec.name} won't fit there, partner.`);
    }
  }
  render();
}

function onPlayerBoardHover(r, c) {
  state.hover = r === null ? null : [r, c];
  render();
}

function onEnemyBoardClick(r, c) {
  if (state.phase !== 'playing' || state.turn !== 'player') return;
  disarmQuit();
  const outcome = receiveShot(state.enemy, r, c);
  if (outcome.result === 'repeat') {
    setStatus(`You already shot at ${coord(r, c)}. Pick fresh ground.`);
    return;
  }
  state.lastShot.player = [r, c];
  playShot(outcome, false);
  describeShot('You', r, c, outcome);
  if (allSunk(state.enemy)) {
    endGame('player');
    announceHit(els.enemyBoard, r, c, outcome, 'mine');
    return;
  }
  state.turn = 'ai';
  setStatus(outcome.result === 'miss' ? `${opponent()} is takin' aim...` : `Hit! ${opponent()} is takin' aim...`);
  render();
  announceHit(els.enemyBoard, r, c, outcome, 'mine');
  later(aiTurn, AI_DELAY_MS);
}

function aiTurn() {
  const [r, c] = state.ai.nextMove();
  const outcome = receiveShot(state.player, r, c);
  state.ai.report([r, c], outcome);
  state.lastShot.enemy = [r, c];
  playShot(outcome, true);
  describeShot('Enemy', r, c, outcome);
  if (outcome.result !== 'miss') flash(els.playerPanel, 'shake');
  if (allSunk(state.player)) {
    endGame('ai');
    announceHit(els.playerBoard, r, c, outcome, 'theirs');
    return;
  }
  state.turn = 'player';
  setStatus('Your shot. Fire on the rival ranch.');
  render();
  announceHit(els.playerBoard, r, c, outcome, 'theirs');
}

function describeShot(who, r, c, outcome) {
  const where = coord(r, c);
  const mine = who === 'You';
  const name = mine ? 'You' : opponent();
  const side = mine ? 'mine' : 'theirs';
  const by = mine ? 'player' : 'ai';
  if (outcome.result === 'miss') log(`${name} fired at ${where}. Nothin' but dust.`, `miss ${side}`, by);
  if (outcome.result === 'hit') log(`${name} fired at ${where}. Hit!`, `hit ${side}`, by);
  if (outcome.result === 'sunk') {
    const owner = mine ? 'their' : 'your';
    log(`${name} fired at ${where} and took down ${owner} ${outcome.ship.name}!`, `sunk ${side}`, by);
  }
}

function playShot(outcome, distant) {
  play('shot', { distant });
  play(outcome.result);
}

function plateLine(cls, text) {
  const span = document.createElement('span');
  span.className = cls;
  span.textContent = text;
  return span;
}

function endGame(winner) {
  later(() => play(winner === 'player' ? 'win' : 'lose'), 700);
  state.phase = 'over';
  setStatus(winner === 'player' ? 'Yee-haw! You ran the whole rival outfit out of Texas.' : `Hogtied. ${opponent()} took down your whole outfit.`);
  els.restart.hidden = false;
  els.banner.replaceChildren(
    plateLine('plate-top', 'Texas \u2605 1936'),
    plateLine('plate-main', winner === 'player' ? 'Yee-haw!' : 'Hogtied'),
    plateLine('plate-bottom', winner === 'player' ? 'Rival ranch cleared' : 'Your outfit is down'),
  );
  els.banner.className = winner === 'player' ? 'win' : 'loss';
  els.banner.hidden = false;
  render();
}

function renderMute() {
  const muted = isMuted();
  els.mute.setAttribute('aria-pressed', String(muted));
  els.mute.textContent = muted ? 'Sound: off (M)' : 'Sound: on (M)';
}

function toggleMute() {
  setMuted(!isMuted());
  renderMute();
}

els.mute.addEventListener('click', toggleMute);
renderMute();

els.playerBoard.addEventListener('pointerdown', (e) => {
  const cell = e.target.closest('.cell');
  if (!cell || state.phase !== 'placing') return;
  const r = Number(cell.dataset.r);
  const c = Number(cell.dataset.c);
  const index = state.player.cells[r][c].shipIndex;
  if (index === null) return;
  const ship = state.player.ships[index];
  const horizontal = isHorizontal(ship);
  const offset = ship.cells.findIndex(([sr, sc]) => sr === r && sc === c);
  startDrag(e, ship, horizontal, offset, { r: ship.cells[0][0], c: ship.cells[0][1], horizontal });
});

els.playerFleet.addEventListener('pointerdown', (e) => {
  const li = e.target.closest('li.draggable');
  if (!li) return;
  startDrag(e, FLEET.find((spec) => spec.name === li.dataset.ship), state.horizontal, 0, null);
});

window.addEventListener('pointermove', onDragMove);
window.addEventListener('pointerup', onDragEnd);
window.addEventListener('pointercancel', onDragEnd);

els.rotate.addEventListener('click', () => {
  state.horizontal = !state.horizontal;
  render();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'm' || e.key === 'M') toggleMute();
  if (e.key === 'r' || e.key === 'R') {
    if (state.drag?.moved) {
      state.drag.horizontal = !state.drag.horizontal;
      state.drag.anchor = anchorAt(state.drag);
    } else {
      state.horizontal = !state.horizontal;
    }
    render();
  }
});

els.random.addEventListener('click', () => {
  if (state.phase !== 'placing') return;
  state.player = randomFleet();
  state.drag = null;
  setStatus('Outfit\'s ready. Hit Draw! to start the showdown.');
  render();
});

els.clear.addEventListener('click', () => {
  if (state.phase !== 'placing') return;
  state.player = createBoard();
  state.drag = null;
  setStatus(placementStatus());
  render();
});

els.start.addEventListener('click', () => {
  if (state.phase !== 'placing' || state.player.ships.length !== FLEET.length) return;
  state.phase = 'playing';
  state.ai = createAI({ difficulty: els.difficulty.value });
  play('giddyup');
  els.placementControls.hidden = true;
  setStatus('Your shot. Fire on the rival ranch.');
  log(`Showdown started against ${opponent()}.`);
  render();
});

// Quitting takes two clicks. The first arms the button for a few seconds.
// (A native confirm() is silently ignored when the game runs in a sandboxed iframe.)
function disarmQuit() {
  clearTimeout(quitTimer);
  delete els.quit.dataset.armed;
  els.quit.textContent = 'Hightail it (quit)';
}

els.quit.addEventListener('click', () => {
  if (state.phase !== 'playing') return;
  if (!els.quit.dataset.armed) {
    els.quit.dataset.armed = 'true';
    els.quit.textContent = 'Sure? Click to quit';
    quitTimer = setTimeout(disarmQuit, 4000);
    return;
  }
  play('giddyup');
  newGame();
});

els.restart.addEventListener('click', () => {
  play('giddyup');
  newGame();
});

buildGrid(els.playerBoard, onPlayerBoardClick, onPlayerBoardHover);
buildGrid(els.enemyBoard, onEnemyBoardClick);
els.difficulty.addEventListener('change', renderOpponent);
renderOpponent();
newGame();
