'use strict';

// ── Constants ──────────────────────────────────────────────────────────────────

const COLS = 8, ROWS = 8;

const COLORS = ['#e94560','#f5a623','#f8e71c','#7ed321','#4a90e2','#9b59b6','#1abc9c','#e67e22'];

const PIECE_DEFS = [
  { cells: [[0,0],[0,1],[0,2],[0,3]] },
  { cells: [[0,0],[1,0],[2,0],[3,0]] },
  { cells: [[0,0],[0,1],[0,2]] },
  { cells: [[0,0],[1,0],[2,0]] },
  { cells: [[0,0],[0,1]] },
  { cells: [[0,0],[1,0]] },
  { cells: [[0,0]] },
  { cells: [[0,0],[0,1],[1,0],[1,1]] },
  { cells: [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2],[2,0],[2,1],[2,2]] },
  { cells: [[0,0],[0,1],[1,0]] },
  { cells: [[0,0],[0,1],[1,1]] },
  { cells: [[0,0],[1,0],[1,1]] },
  { cells: [[0,1],[1,0],[1,1]] },
  { cells: [[0,0],[0,1],[0,2],[1,0],[2,0]] },
  { cells: [[0,0],[0,1],[0,2],[1,2],[2,2]] },
  { cells: [[0,1],[1,1],[2,0],[2,1]] },
  { cells: [[0,0],[1,0],[1,1],[2,1]] },
  { cells: [[0,0],[0,1],[1,1],[1,2]] },
  { cells: [[0,1],[1,0],[1,1],[2,0]] },
  { cells: [[0,0],[0,1],[0,2],[1,1]] },
  { cells: [[0,0],[1,0],[1,1],[2,0]] },
  { cells: [[0,1],[1,0],[1,1],[1,2]] },
  { cells: [[0,0],[0,1],[1,1],[2,1]] },
  { cells: [[0,0],[0,1],[0,2],[0,3],[0,4]] },
  { cells: [[0,0],[1,0],[2,0],[3,0],[4,0]] },
  { cells: [[0,0],[0,1],[1,0],[1,1],[2,0],[2,1]] },
  { cells: [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2]] },
];

// ── DOM refs ───────────────────────────────────────────────────────────────────

const bgCanvas   = document.getElementById('bg-canvas');
const bgCtx      = bgCanvas.getContext('2d');
const gridCanvas = document.getElementById('grid-canvas');
const ctx        = gridCanvas.getContext('2d');
const dragCanvas = document.getElementById('drag-canvas');
const dragCtx    = dragCanvas.getContext('2d');
const popupLayer = document.getElementById('popup-layer');

// ── Sizes ──────────────────────────────────────────────────────────────────────

const CELL      = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cell-size')) || 44;
const GAP       = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--gap'))       || 3;
const BORDER    = 6;
const TRAY_CELL = 26;
const TRAY_GAP  = 2;
const DRAG_CELL = Math.round(CELL * 0.85);
const DRAG_GAP  = GAP;
const DRAG_PAD  = 6;

// ── State ──────────────────────────────────────────────────────────────────────

let grid       = [];
let score      = 0;
let highscore  = parseInt(localStorage.getItem('bb_highscore') || '0', 10);
let pieces     = [];
let usedPieces = [];
let dragState  = null;
let ghostCells = null;
let ghostValid = false;
let flashState = null;   // { cells: Set, t: 0-1 }
let animLocked = false;  // true while line-clear animation runs

// ── Drawing helpers ────────────────────────────────────────────────────────────

function roundedRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function fillRR(ctx, x, y, w, h, r, fill) {
  roundedRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}

function lighten(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${Math.min(255,(n>>16)+amt)},${Math.min(255,((n>>8)&0xff)+amt)},${Math.min(255,(n&0xff)+amt)})`;
}

function darken(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${Math.max(0,(n>>16)-amt)},${Math.max(0,((n>>8)&0xff)-amt)},${Math.max(0,(n&0xff)-amt)})`;
}

// Glossy block with gradient + specular shine
function drawCell(ctx, x, y, color, size = CELL, alpha = 1) {
  ctx.save();
  const r = Math.max(3, size * 0.18);

  // Drop shadow (layered)
  ctx.globalAlpha = alpha * 0.5;
  fillRR(ctx, x + 2, y + 5, size, size, r, 'rgba(0,0,0,0.55)');
  ctx.globalAlpha = alpha * 0.2;
  fillRR(ctx, x + 1, y + 2, size, size, r, 'rgba(0,0,0,0.4)');

  // Base gradient
  ctx.globalAlpha = alpha;
  const grad = ctx.createLinearGradient(x, y, x, y + size);
  grad.addColorStop(0,    lighten(color, 42));
  grad.addColorStop(0.38, color);
  grad.addColorStop(1,    darken(color, 55));
  roundedRectPath(ctx, x, y, size, size, r);
  ctx.fillStyle = grad;
  ctx.fill();

  // Clip shine effects to cell
  ctx.save();
  roundedRectPath(ctx, x, y, size, size, r);
  ctx.clip();

  // Specular radial shine (top-left glossy spot)
  const shine = ctx.createRadialGradient(
    x + size * 0.28, y + size * 0.2, 0,
    x + size * 0.28, y + size * 0.2, size * 0.6
  );
  shine.addColorStop(0,    'rgba(255,255,255,0.82)');
  shine.addColorStop(0.32, 'rgba(255,255,255,0.22)');
  shine.addColorStop(1,    'rgba(255,255,255,0)');
  ctx.fillStyle = shine;
  ctx.fillRect(x, y, size, size);

  // Bottom shadow for 3-D curve
  const bot = ctx.createLinearGradient(x, y + size * 0.48, x, y + size);
  bot.addColorStop(0, 'rgba(0,0,0,0)');
  bot.addColorStop(1, 'rgba(0,0,0,0.44)');
  ctx.fillStyle = bot;
  ctx.fillRect(x, y + size * 0.48, size, size * 0.52);

  // Thin bright top-edge stripe
  ctx.globalAlpha = alpha * 0.55;
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.fillRect(x + r * 0.7, y + 1.5, size - r * 1.4, Math.max(1.5, size * 0.04));

  ctx.restore();
  ctx.restore();
}

function drawEmptyCell(ctx, x, y, size = CELL, tint = null) {
  const r = Math.max(3, size * 0.18);
  fillRR(ctx, x, y, size, size, r, '#12192e');
  if (tint) {
    ctx.globalAlpha = 0.12;
    fillRR(ctx, x, y, size, size, r, tint);
    ctx.globalAlpha = 1;
  }
  ctx.globalAlpha = 0.05;
  fillRR(ctx, x, y, size, size, r, '#ffffff');
  ctx.globalAlpha = 1;
}

// ── Grid rendering ─────────────────────────────────────────────────────────────

function cellX(col) { return BORDER + col * (CELL + GAP); }
function cellY(row) { return BORDER + row * (CELL + GAP); }

function drawGrid() {
  ctx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);
  ctx.fillStyle = '#0a1020';
  ctx.fillRect(0, 0, gridCanvas.width, gridCanvas.height);

  const ghostSet = ghostCells ? new Set(ghostCells.map(c => `${c.row},${c.col}`)) : new Set();
  const ghostColor = dragState ? pieces[dragState.pieceIdx].color : '#fff';
  const r = Math.max(3, CELL * 0.18);

  // Near-complete row/col hints
  const nearRows = new Set();
  const nearCols = new Set();
  for (let row = 0; row < ROWS; row++) {
    const filled = grid[row].filter(c => c).length;
    if (filled >= 6 && filled < COLS) nearRows.add(row);
  }
  for (let col = 0; col < COLS; col++) {
    const filled = grid.filter(row => row[col]).length;
    if (filled >= 6 && filled < ROWS) nearCols.add(col);
  }

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const x = cellX(col);
      const y = cellY(row);
      const color = grid[row][col];
      const key = `${row},${col}`;
      const hint = (nearRows.has(row) || nearCols.has(col)) ? '#f5a623' : null;

      if (color) {
        drawCell(ctx, x, y, color);
      } else if (ghostSet.has(key)) {
        drawCell(ctx, x, y, ghostColor, CELL, ghostValid ? 0.6 : 0.2);
        if (ghostValid) {
          ctx.save();
          ctx.globalAlpha = 0.85;
          ctx.strokeStyle = 'rgba(255,255,255,0.8)';
          ctx.lineWidth = 2;
          roundedRectPath(ctx, x + 1, y + 1, CELL - 2, CELL - 2, r);
          ctx.stroke();
          ctx.restore();
        }
      } else {
        drawEmptyCell(ctx, x, y, CELL, hint);
      }
    }
  }

  // Flash overlay during line-clear animation
  if (flashState) {
    const alpha = Math.sin(flashState.t * Math.PI);
    for (const key of flashState.cells) {
      const [fr, fc] = key.split(',').map(Number);
      const x = cellX(fc), y = cellY(fr);
      ctx.save();
      ctx.globalAlpha = alpha * 0.92;
      fillRR(ctx, x, y, CELL, CELL, r, '#ffffff');
      ctx.restore();
    }
  }
}

// ── Piece tray ─────────────────────────────────────────────────────────────────

function drawPieceTray() {
  for (let i = 0; i < 3; i++) {
    const canvas = document.getElementById(`piece-${i}`);
    if (!canvas) continue;
    const pctx = canvas.getContext('2d');

    if (usedPieces[i] || !pieces[i]) {
      canvas.width = 60; canvas.height = 60;
      pctx.clearRect(0, 0, 60, 60);
      canvas.classList.add('used');
      continue;
    }

    canvas.classList.remove('used');
    const p = pieces[i];
    const maxRow = Math.max(...p.cells.map(c => c[0]));
    const maxCol = Math.max(...p.cells.map(c => c[1]));
    const pw = (maxCol + 1) * (TRAY_CELL + TRAY_GAP) - TRAY_GAP + 8;
    const ph = (maxRow + 1) * (TRAY_CELL + TRAY_GAP) - TRAY_GAP + 8;
    canvas.width = pw; canvas.height = ph;
    pctx.clearRect(0, 0, pw, ph);

    for (const [row, col] of p.cells) {
      drawCell(pctx, 4 + col * (TRAY_CELL + TRAY_GAP), 4 + row * (TRAY_CELL + TRAY_GAP), p.color, TRAY_CELL);
    }
  }
}

// ── Drag canvas ────────────────────────────────────────────────────────────────

function renderDragPiece(piece) {
  const maxRow = Math.max(...piece.cells.map(c => c[0]));
  const maxCol = Math.max(...piece.cells.map(c => c[1]));
  const pw = DRAG_PAD * 2 + (maxCol + 1) * DRAG_CELL + maxCol * DRAG_GAP;
  const ph = DRAG_PAD * 2 + (maxRow + 1) * DRAG_CELL + maxRow * DRAG_GAP;
  dragCanvas.width = pw; dragCanvas.height = ph;
  dragCtx.clearRect(0, 0, pw, ph);
  for (const [row, col] of piece.cells) {
    drawCell(dragCtx, DRAG_PAD + col * (DRAG_CELL + DRAG_GAP), DRAG_PAD + row * (DRAG_CELL + DRAG_GAP), piece.color, DRAG_CELL, 0.95);
  }
}

function moveDragCanvas(clientX, clientY) {
  const yOff = dragState?.isTouch ? -(dragCanvas.height * 0.55) - 12 : -dragCanvas.height / 2;
  dragCanvas.style.left = (clientX - dragCanvas.width / 2) + 'px';
  dragCanvas.style.top  = (clientY + yOff) + 'px';
}

// ── Score popups ───────────────────────────────────────────────────────────────

function spawnPopup(text, color, size = '') {
  const rect = gridCanvas.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'score-popup' + (size ? ' ' + size : '');
  el.textContent = text;
  el.style.color = color;
  el.style.left = (rect.left + rect.width  * (0.3 + Math.random() * 0.4)) + 'px';
  el.style.top  = (rect.top  + rect.height * (0.3 + Math.random() * 0.3)) + 'px';
  popupLayer.appendChild(el);
  setTimeout(() => el.remove(), 1100);
}

function bumpScore() {
  const el = document.getElementById('score');
  el.classList.remove('bump');
  void el.offsetWidth; // reflow
  el.classList.add('bump');
  setTimeout(() => el.classList.remove('bump'), 200);
}

// ── Line clear animation ───────────────────────────────────────────────────────

function animateClear(cellSet, onDone) {
  const duration = 340;
  const start = performance.now();
  function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    flashState = { cells: cellSet, t };
    drawGrid();
    if (t < 1) {
      requestAnimationFrame(tick);
    } else {
      flashState = null;
      onDone();
    }
  }
  requestAnimationFrame(tick);
}

// ── Background animation ───────────────────────────────────────────────────────

const blobs = [];
const stars = [];

function initBg() {
  bgCanvas.width  = window.innerWidth;
  bgCanvas.height = window.innerHeight;

  blobs.length = stars.length = 0;

  const blobColors = [
    [180, 30, 80],   // rose
    [250, 100, 30],  // orange
    [60,  100, 200], // blue
    [140, 30, 180],  // purple
    [30,  160, 140], // teal
    [220, 60,  80],  // red
  ];

  for (let i = 0; i < 6; i++) {
    const [h, s, l] = blobColors[i];
    blobs.push({
      x: Math.random() * bgCanvas.width,
      y: Math.random() * bgCanvas.height,
      r: 160 + Math.random() * 160,
      vx: (Math.random() - 0.5) * 0.18,
      vy: (Math.random() - 0.5) * 0.18,
      h, s, l,
      phase: Math.random() * Math.PI * 2,
    });
  }

  for (let i = 0; i < 90; i++) {
    stars.push({
      x: Math.random() * bgCanvas.width,
      y: Math.random() * bgCanvas.height,
      r: Math.random() * 1.6 + 0.3,
      speed: Math.random() * 0.22 + 0.04,
      opacity: Math.random() * 0.55 + 0.1,
      hue: Math.random() * 80 + 190,
    });
  }
}

function animateBg(t) {
  const w = bgCanvas.width, h = bgCanvas.height;
  bgCtx.clearRect(0, 0, w, h);

  // Deep space base
  const bg = bgCtx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#03030e');
  bg.addColorStop(0.5, '#060618');
  bg.addColorStop(1, '#03030e');
  bgCtx.fillStyle = bg;
  bgCtx.fillRect(0, 0, w, h);

  // Nebula blobs
  for (const b of blobs) {
    b.x += b.vx;
    b.y += b.vy;
    if (b.x < -b.r)   b.x = w + b.r;
    if (b.x > w + b.r) b.x = -b.r;
    if (b.y < -b.r)   b.y = h + b.r;
    if (b.y > h + b.r) b.y = -b.r;
    const pulse = 0.85 + 0.15 * Math.sin(t * 0.0008 + b.phase);
    const rad = bgCtx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * pulse);
    rad.addColorStop(0,   `hsla(${b.h},${b.s}%,${b.l}%,0.18)`);
    rad.addColorStop(0.5, `hsla(${b.h},${b.s}%,${b.l}%,0.06)`);
    rad.addColorStop(1,   `hsla(${b.h},${b.s}%,${b.l}%,0)`);
    bgCtx.fillStyle = rad;
    bgCtx.fillRect(b.x - b.r * pulse, b.y - b.r * pulse, b.r * pulse * 2, b.r * pulse * 2);
  }

  // Stars
  for (const s of stars) {
    s.y -= s.speed;
    if (s.y < -4) { s.y = h + 4; s.x = Math.random() * w; }
    bgCtx.beginPath();
    bgCtx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    bgCtx.fillStyle = `hsla(${s.hue},70%,85%,${s.opacity})`;
    bgCtx.fill();
  }

  requestAnimationFrame(animateBg);
}

// ── Game logic ─────────────────────────────────────────────────────────────────

function newGrid()    { return Array.from({ length: ROWS }, () => Array(COLS).fill(null)); }
function randomPiece() {
  return {
    cells: PIECE_DEFS[Math.floor(Math.random() * PIECE_DEFS.length)].cells,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  };
}

function refillTray() {
  pieces     = [randomPiece(), randomPiece(), randomPiece()];
  usedPieces = [false, false, false];
}

function canPlace(piece, ar, ac) {
  return piece.cells.every(([dr, dc]) => {
    const r = ar + dr, c = ac + dc;
    return r >= 0 && r < ROWS && c >= 0 && c < COLS && !grid[r][c];
  });
}

function placePiece(piece, ar, ac) {
  for (const [dr, dc] of piece.cells) grid[ar + dr][ac + dc] = piece.color;
}

function findFullLines() {
  const fullRows = [], fullCols = [];
  for (let r = 0; r < ROWS; r++) if (grid[r].every(c => c)) fullRows.push(r);
  for (let c = 0; c < COLS; c++) if (grid.every(row => row[c])) fullCols.push(c);
  return { fullRows, fullCols };
}

function executeClears(fullRows, fullCols) {
  for (const r of fullRows) grid[r].fill(null);
  for (const c of fullCols) for (let r = 0; r < ROWS; r++) grid[r][c] = null;
}

function hasAnyMove() {
  return pieces.some((p, i) => {
    if (usedPieces[i]) return false;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (canPlace(p, r, c)) return true;
    return false;
  });
}

function addScore(pts) {
  score += pts;
  document.getElementById('score').textContent = score;
  if (score > highscore) {
    highscore = score;
    localStorage.setItem('bb_highscore', highscore);
    document.getElementById('highscore').textContent = highscore;
  }
  bumpScore();
}

function showGameOver() {
  document.getElementById('final-score').textContent = score;
  document.getElementById('overlay').classList.remove('hidden');
}

function startGame() {
  grid       = newGrid();
  score      = 0;
  animLocked = false;
  document.getElementById('score').textContent     = '0';
  document.getElementById('highscore').textContent = highscore;
  document.getElementById('overlay').classList.add('hidden');
  dragCanvas.style.display = 'none';
  ghostCells = null;
  dragState  = null;
  flashState = null;
  refillTray();
  drawGrid();
  drawPieceTray();
}

// ── Drag & drop ────────────────────────────────────────────────────────────────

function getGridAnchor(clientX, clientY, piece) {
  const rect = gridCanvas.getBoundingClientRect();
  const sx = gridCanvas.width  / rect.width;
  const sy = gridCanvas.height / rect.height;
  const cx = (clientX - rect.left) * sx;
  const cy = (clientY - rect.top)  * sy;
  const pRows = Math.max(...piece.cells.map(c => c[0])) + 1;
  const pCols = Math.max(...piece.cells.map(c => c[1])) + 1;
  return {
    row: Math.round((cy - BORDER - CELL * pRows / 2) / (CELL + GAP)),
    col: Math.round((cx - BORDER - CELL * pCols / 2) / (CELL + GAP)),
  };
}

function updateGhost(clientX, clientY, piece) {
  const { row, col } = getGridAnchor(clientX, clientY, piece);
  ghostValid = canPlace(piece, row, col);
  ghostCells = piece.cells.map(([dr, dc]) => ({ row: row + dr, col: col + dc }));
  return { row, col, valid: ghostValid };
}

function onPointerDown(e, idx) {
  if (animLocked || usedPieces[idx] || !pieces[idx]) return;
  e.preventDefault();
  const isTouch = !!e.touches;
  const cx = isTouch ? e.touches[0].clientX : e.clientX;
  const cy = isTouch ? e.touches[0].clientY : e.clientY;
  dragState = { pieceIdx: idx, isTouch };
  renderDragPiece(pieces[idx]);
  dragCanvas.style.display = 'block';
  moveDragCanvas(cx, cy);
  updateGhost(cx, cy, pieces[idx]);
  drawGrid();
  drawPieceTray();
}

function onPointerMove(e) {
  if (!dragState) return;
  e.preventDefault();
  const cx = e.touches ? e.touches[0].clientX : e.clientX;
  const cy = e.touches ? e.touches[0].clientY : e.clientY;
  moveDragCanvas(cx, cy);
  updateGhost(cx, cy, pieces[dragState.pieceIdx]);
  drawGrid();
}

function onPointerUp(e) {
  if (!dragState) return;
  const cx = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
  const cy = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
  const piece = pieces[dragState.pieceIdx];
  const { row, col, valid } = updateGhost(cx, cy, piece);

  dragCanvas.style.display = 'none';

  if (!valid) {
    ghostCells = null;
    dragState  = null;
    drawGrid();
    drawPieceTray();
    return;
  }

  // Place piece
  placePiece(piece, row, col);
  usedPieces[dragState.pieceIdx] = true;
  ghostCells = null;
  dragState  = null;

  const basePts = piece.cells.length * 2;
  const { fullRows, fullCols } = findFullLines();
  const cleared = fullRows.length + fullCols.length;

  drawGrid();
  drawPieceTray();

  if (cleared === 0) {
    addScore(basePts);
    spawnPopup(`+${basePts}`, piece.color, 'small');
    if (usedPieces.every(u => u)) refillTray();
    drawPieceTray();
    if (!hasAnyMove()) setTimeout(showGameOver, 300);
    return;
  }

  // Build flash cell set
  const cellSet = new Set();
  for (const r of fullRows) for (let c = 0; c < COLS; c++) cellSet.add(`${r},${c}`);
  for (const c of fullCols) for (let r = 0; r < ROWS; r++) cellSet.add(`${r},${c}`);

  animLocked = true;
  animateClear(cellSet, () => {
    executeClears(fullRows, fullCols);
    const bonus  = cleared >= 4 ? 3 : cleared >= 2 ? 2 : 1;
    const linePts = cleared * 10 * bonus;
    const total   = basePts + linePts;
    addScore(total);

    // Popup messages
    spawnPopup(`+${total}`, '#f5a623', 'big');
    if (cleared >= 4) spawnPopup('MEGA CLEAR! 🔥', '#e94560', 'big');
    else if (cleared === 3) spawnPopup('TRIPLE! ⚡', '#f5a623');
    else if (cleared === 2) spawnPopup('DOUBLE! ✨', '#7ed321');
    else spawnPopup('NICE! 👊', piece.color, 'small');

    if (usedPieces.every(u => u)) refillTray();
    animLocked = false;
    drawGrid();
    drawPieceTray();
    if (!hasAnyMove()) setTimeout(showGameOver, 300);
  });
}

// ── Event wiring ───────────────────────────────────────────────────────────────

function wirePieceTray() {
  for (let i = 0; i < 3; i++) {
    const c = document.getElementById(`piece-${i}`);
    if (!c) continue;
    c.addEventListener('mousedown',  e => onPointerDown(e, i));
    c.addEventListener('touchstart', e => onPointerDown(e, i), { passive: false });
  }
}

window.addEventListener('mousemove',  onPointerMove);
window.addEventListener('touchmove',  onPointerMove, { passive: false });
window.addEventListener('mouseup',    onPointerUp);
window.addEventListener('touchend',   onPointerUp);
window.addEventListener('resize', () => {
  bgCanvas.width  = window.innerWidth;
  bgCanvas.height = window.innerHeight;
  initBg();
});

document.getElementById('restart-btn').addEventListener('click', startGame);

// ── Boot ───────────────────────────────────────────────────────────────────────

function initGridCanvas() {
  gridCanvas.width  = BORDER * 2 + COLS * CELL + (COLS - 1) * GAP;
  gridCanvas.height = BORDER * 2 + ROWS * CELL + (ROWS - 1) * GAP;
}

initGridCanvas();
wirePieceTray();
initBg();
requestAnimationFrame(animateBg);
startGame();
