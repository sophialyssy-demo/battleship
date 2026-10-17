import { SIZE, FLEET, createBoard, canPlace, placeShip, randomFleet, receiveShot, allSunk, shipCells } from './game.js';
import { createAI } from './ai.js';
import { play, isMuted, setMuted } from './sound.js';

const AI_DELAY_MS = 600;
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
  els.banner.hidden = true;
  setStatus(`Place your ${FLEET[0].name} (${FLEET[0].length}). Press R or Turn to turn it.`);
  render();
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
  const spec = nextShipSpec();
  if (state.phase !== 'placing' || !spec || !state.hover) return;
  const [r, c] = state.hover;
  const valid = canPlace(state.player, spec.length, r, c, state.horizontal);
  const cells = shipCells(spec.length, r, c, state.horizontal);
  cells.forEach(([pr, pc], i) => {
    if (pr >= SIZE || pc >= SIZE) return;
    const btn = els.playerBoard.children[pr * SIZE + pc];
    const part = i === 0 ? 'bow' : i === cells.length - 1 ? 'stern' : 'mid';
    btn.classList.add('preview', part, `k-${spec.name.toLowerCase().replace(/\s+/g, '-')}`);
    if (!state.horizontal) btn.classList.add('v');
    if (!valid) btn.classList.add('invalid');
  });
}

function paintLastShots() {
  const { player, enemy } = state.lastShot;
  if (player) els.enemyBoard.children[player[0] * SIZE + player[1]].classList.add('last');
  if (enemy) els.playerBoard.children[enemy[0] * SIZE + enemy[1]].classList.add('last');
}

function renderFleet(list, board, { highlightNext, showDamage }) {
  list.innerHTML = '';
  FLEET.forEach((spec, i) => {
    const li = document.createElement('li');
    const ship = board.ships[i];
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
    if (highlightNext && i === board.ships.length) li.classList.add('next');
    list.appendChild(li);
  });
}

function render() {
  paintBoard(els.playerBoard, state.player, { revealShips: true });
  paintBoard(els.enemyBoard, state.enemy, { revealShips: state.phase === 'over' });
  paintPreview();
  paintLastShots();
  renderFleet(els.playerFleet, state.player, { highlightNext: state.phase === 'placing', showDamage: true });
  renderFleet(els.enemyFleet, state.enemy, { highlightNext: false, showDamage: false });
  els.start.disabled = state.player.ships.length !== FLEET.length;
  const playerTurn = state.phase === 'playing' && state.turn === 'player';
  els.enemyBoard.classList.toggle('active', playerTurn);
  els.enemyPanel.classList.toggle('active', playerTurn);
  els.enemyPanel.classList.toggle('scanning', state.phase === 'playing');
  els.playerPanel.classList.toggle('incoming', state.phase === 'playing' && state.turn === 'ai');
}

function onPlayerBoardClick(r, c) {
  if (state.phase !== 'placing') return;
  const spec = nextShipSpec();
  if (!spec) return;
  if (!placeShip(state.player, spec, r, c, state.horizontal)) {
    play('invalid');
    setStatus(`Your ${spec.name} won't fit there, partner.`);
    return;
  }
  play('place');
  const next = nextShipSpec();
  setStatus(next ? `Place your ${next.name} (${next.length}).` : 'Outfit\'s ready. Hit Draw! to start the showdown.');
  render();
}

function onPlayerBoardHover(r, c) {
  state.hover = r === null ? null : [r, c];
  render();
}

function onEnemyBoardClick(r, c) {
  if (state.phase !== 'playing' || state.turn !== 'player') return;
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
  setTimeout(aiTurn, AI_DELAY_MS);
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
  setTimeout(() => play(winner === 'player' ? 'win' : 'lose'), 700);
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

els.rotate.addEventListener('click', () => {
  state.horizontal = !state.horizontal;
  render();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'm' || e.key === 'M') toggleMute();
  if (e.key === 'r' || e.key === 'R') {
    state.horizontal = !state.horizontal;
    render();
  }
});

els.random.addEventListener('click', () => {
  if (state.phase !== 'placing') return;
  state.player = randomFleet();
  setStatus('Outfit\'s ready. Hit Draw! to start the showdown.');
  render();
});

els.clear.addEventListener('click', () => {
  if (state.phase !== 'placing') return;
  state.player = createBoard();
  setStatus(`Place your ${FLEET[0].name} (${FLEET[0].length}).`);
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

els.restart.addEventListener('click', () => {
  play('giddyup');
  newGame();
});

buildGrid(els.playerBoard, onPlayerBoardClick, onPlayerBoardHover);
buildGrid(els.enemyBoard, onEnemyBoardClick);
els.difficulty.addEventListener('change', renderOpponent);
renderOpponent();
newGame();
