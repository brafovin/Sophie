'use strict';

// ── Constants ──────────────────────────────────────────────────────────────────

const COLS = 8;
const ROWS = 8;

const COLORS = [
  '#e94560',
  '#f5a623',
  '#f8e71c',
  '#7ed321',
  '#4a90e2',
  '#9b59b6',
  '#1abc9c',
  '#e67e22',
];

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

// ── State ──────────────────────────────────────────────────────────────────────

let grid = [];
let score = 0;
let highscore = parseInt(localStorage.getItem('bb_highscore') || '0', 10);
let pieces = [];
let usedPieces = [];
let dragState = null;
let ghostCells = null;
let ghostValid = false;

// ── Canvas Setup ───────────────────────────────────────────────────────────────

const gridCanvas  = document.getElementById('grid-canvas');
const ctx         = gridCanvas.getContext('2d');
const dragCanvas  = document.getElementById('drag-canvas');
const dragCtx     = dragCanvas.getContext('2d');

const CELL   = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cell-size')) || 44;
const GAP    = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--gap')) || 3;
const BORDER = 6;

const TRAY_CELL = 24;
const TRAY_GAP  = 2;
const DRAG_CELL = CELL - 6;
const DRAG_GAP  = GAP;
const DRAG_PAD  = 6;

function initGridCanvas() {
  const w = BORDER * 2 + COLS * CELL + (COLS - 1) * GAP;
  const h = BORDER * 2 + ROWS * CELL + (ROWS - 1) * GAP;
  gridCanvas.width  = w;
  gridCanvas.height = h;
}

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

function fillRoundedRect(ctx, x, y, w, h, r, fill) {
  roundedRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}

function lighten(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, (n >> 16) + amt);
  const g = Math.min(255, ((n >> 8) & 0xff) + amt);
  const b = Math.min(255, (n & 0xff) + amt);
  return `rgb(${r},${g},${b})`;
}

function darken(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, (n >> 16) - amt);
  const g = Math.max(0, ((n >> 8) & 0xff) - amt);
  const b = Math.max(0, (n & 0xff) - amt);
  return `rgb(${r},${g},${b})`;
}

// Draws a single glossy block with gradient + specular shine
function drawCell(ctx, x, y, color, size = CELL, alpha = 1) {
  ctx.save();
  const r = Math.max(3, size * 0.18);

  // Layered drop shadow
  ctx.globalAlpha = alpha * 0.5;
  fillRoundedRect(ctx, x + 2, y + 5, size, size, r, 'rgba(0,0,0,0.55)');
  ctx.globalAlpha = alpha * 0.22;
  fillRoundedRect(ctx, x + 1, y + 2, size, size, r, 'rgba(0,0,0,0.4)');

  // Base gradient (bright top → base → dark bottom)
  ctx.globalAlpha = alpha;
  const grad = ctx.createLinearGradient(x, y, x, y + size);
  grad.addColorStop(0,    lighten(color, 42));
  grad.addColorStop(0.40, color);
  grad.addColorStop(1,    darken(color, 55));
  roundedRectPath(ctx, x, y, size, size, r);
  ctx.fillStyle = grad;
  ctx.fill();

  // Clip everything below to the cell shape
  ctx.save();
  roundedRectPath(ctx, x, y, size, size, r);
  ctx.clip();

  // Specular radial shine — bright spot top-left
  const shine = ctx.createRadialGradient(
    x + size * 0.28, y + size * 0.2, 0,
    x + size * 0.28, y + size * 0.2, size * 0.60
  );
  shine.addColorStop(0,    'rgba(255,255,255,0.82)');
  shine.addColorStop(0.32, 'rgba(255,255,255,0.22)');
  shine.addColorStop(1,    'rgba(255,255,255,0)');
  ctx.fillStyle = shine;
  ctx.fillRect(x, y, size, size);

  // Bottom shadow overlay (gives rounded-3D feel)
  const bot = ctx.createLinearGradient(x, y + size * 0.48, x, y + size);
  bot.addColorStop(0, 'rgba(0,0,0,0)');
  bot.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = bot;
  ctx.fillRect(x, y + size * 0.48, size, size * 0.52);

  // Thin bright top-edge stripe
  ctx.globalAlpha = alpha * 0.55;
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.fillRect(x + r * 0.6, y + 1.5, size - r * 1.2, Math.max(1.5, size * 0.04));

  ctx.restore(); // remove clip
  ctx.restore(); // restore alpha & state
}

function drawEmptyCell(ctx, x, y, size = CELL) {
  const r = Math.max(3, size * 0.18);
  fillRoundedRect(ctx, x, y, size, size, r, '#16213e');
  ctx.globalAlpha = 0.055;
  fillRoundedRect(ctx, x, y, size, size, r, '#ffffff');
  ctx.globalAlpha = 1;
}

// ── Grid rendering ─────────────────────────────────────────────────────────────

function cellX(col) { return BORDER + col * (CELL + GAP); }
function cellY(row) { return BORDER + row * (CELL + GAP); }

function drawGrid() {
  ctx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);
  ctx.fillStyle = '#0d1b2a';
  ctx.fillRect(0, 0, gridCanvas.width, gridCanvas.height);

  const ghostSet = ghostCells
    ? new Set(ghostCells.map(c => `${c.row},${c.col}`))
    : new Set();

  const ghostColor = dragState ? pieces[dragState.pieceIdx].color : '#fff';
  const r = Math.max(3, CELL * 0.18);

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const x = cellX(col);
      const y = cellY(row);
      const color = grid[row][col];
      const key = `${row},${col}`;

      if (color) {
        drawCell(ctx, x, y, color);
      } else if (ghostSet.has(key)) {
        // Ghost: filled block at 60% opacity
        drawCell(ctx, x, y, ghostColor, CELL, ghostValid ? 0.62 : 0.25);
        // Glowing outline
        if (ghostValid) {
          ctx.save();
          ctx.globalAlpha = 0.9;
          ctx.strokeStyle = 'rgba(255,255,255,0.75)';
          ctx.lineWidth = 2;
          roundedRectPath(ctx, x + 1, y + 1, CELL - 2, CELL - 2, r);
          ctx.stroke();
          ctx.restore();
        }
      } else {
        drawEmptyCell(ctx, x, y);
      }
    }
  }
}

// ── Piece tray rendering ───────────────────────────────────────────────────────

function drawPieceTray() {
  for (let i = 0; i < 3; i++) {
    const canvas = document.getElementById(`piece-${i}`);
    if (!canvas) continue;
    const pctx = canvas.getContext('2d');

    if (usedPieces[i] || !pieces[i]) {
      canvas.width  = 80;
      canvas.height = 80;
      pctx.clearRect(0, 0, 80, 80);
      canvas.classList.add('used');
      continue;
    }

    canvas.classList.remove('used');
    const p = pieces[i];
    const maxRow = Math.max(...p.cells.map(c => c[0]));
    const maxCol = Math.max(...p.cells.map(c => c[1]));
    const pw = (maxCol + 1) * (TRAY_CELL + TRAY_GAP) - TRAY_GAP + 8;
    const ph = (maxRow + 1) * (TRAY_CELL + TRAY_GAP) - TRAY_GAP + 8;
    canvas.width  = pw;
    canvas.height = ph;
    pctx.clearRect(0, 0, pw, ph);

    for (const [row, col] of p.cells) {
      const x = 4 + col * (TRAY_CELL + TRAY_GAP);
      const y = 4 + row * (TRAY_CELL + TRAY_GAP);
      drawCell(pctx, x, y, p.color, TRAY_CELL);
    }
  }
}

// ── Floating drag canvas ───────────────────────────────────────────────────────

function renderDragPiece(piece) {
  const maxRow = Math.max(...piece.cells.map(c => c[0]));
  const maxCol = Math.max(...piece.cells.map(c => c[1]));
  const pw = DRAG_PAD * 2 + (maxCol + 1) * DRAG_CELL + maxCol * DRAG_GAP;
  const ph = DRAG_PAD * 2 + (maxRow + 1) * DRAG_CELL + maxRow * DRAG_GAP;
  dragCanvas.width  = pw;
  dragCanvas.height = ph;
  dragCtx.clearRect(0, 0, pw, ph);
  for (const [row, col] of piece.cells) {
    const x = DRAG_PAD + col * (DRAG_CELL + DRAG_GAP);
    const y = DRAG_PAD + row * (DRAG_CELL + DRAG_GAP);
    drawCell(dragCtx, x, y, piece.color, DRAG_CELL, 0.95);
  }
}

function moveDragCanvas(clientX, clientY) {
  // Offset upward on touch so the finger doesn't cover the piece
  const isTouchEvent = window.TouchEvent && dragState && dragState.isTouch;
  const yOff = isTouchEvent ? -(dragCanvas.height * 0.6) - 10 : -dragCanvas.height / 2;
  dragCanvas.style.left = (clientX - dragCanvas.width / 2) + 'px';
  dragCanvas.style.top  = (clientY + yOff) + 'px';
}

function showDragCanvas(piece, clientX, clientY, isTouch) {
  renderDragPiece(piece);
  dragCanvas.style.display = 'block';
  moveDragCanvas(clientX, clientY);
}

function hideDragCanvas() {
  dragCanvas.style.display = 'none';
}

// ── Game Logic ─────────────────────────────────────────────────────────────────

function newGrid() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function randomPiece() {
  const def   = PIECE_DEFS[Math.floor(Math.random() * PIECE_DEFS.length)];
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  return { cells: def.cells, color };
}

function refillTray() {
  pieces     = [randomPiece(), randomPiece(), randomPiece()];
  usedPieces = [false, false, false];
}

function canPlace(piece, anchorRow, anchorCol) {
  for (const [dr, dc] of piece.cells) {
    const r = anchorRow + dr;
    const c = anchorCol + dc;
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
    if (grid[r][c]) return false;
  }
  return true;
}

function placePiece(piece, anchorRow, anchorCol) {
  for (const [dr, dc] of piece.cells) {
    grid[anchorRow + dr][anchorCol + dc] = piece.color;
  }
}

function clearLines() {
  const fullRows = [];
  const fullCols = [];

  for (let r = 0; r < ROWS; r++) {
    if (grid[r].every(c => c !== null)) fullRows.push(r);
  }
  for (let c = 0; c < COLS; c++) {
    if (grid.every(row => row[c] !== null)) fullCols.push(c);
  }

  const cleared = fullRows.length + fullCols.length;
  if (!cleared) return 0;

  for (const r of fullRows) grid[r].fill(null);
  for (const c of fullCols) {
    for (let r = 0; r < ROWS; r++) grid[r][c] = null;
  }

  const bonus = cleared >= 4 ? 3 : cleared >= 2 ? 2 : 1;
  return cleared * 10 * bonus;
}

function addScore(pts) {
  score += pts;
  document.getElementById('score').textContent = score;
  if (score > highscore) {
    highscore = score;
    localStorage.setItem('bb_highscore', highscore);
    document.getElementById('highscore').textContent = highscore;
  }
}

function hasAnyMove() {
  for (let i = 0; i < 3; i++) {
    if (usedPieces[i]) continue;
    const p = pieces[i];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (canPlace(p, r, c)) return true;
      }
    }
  }
  return false;
}

function showGameOver() {
  document.getElementById('final-score').textContent = score;
  document.getElementById('overlay').classList.remove('hidden');
}

function startGame() {
  grid  = newGrid();
  score = 0;
  document.getElementById('score').textContent = '0';
  document.getElementById('highscore').textContent = highscore;
  document.getElementById('overlay').classList.add('hidden');
  hideDragCanvas();
  ghostCells = null;
  dragState  = null;
  refillTray();
  drawGrid();
  drawPieceTray();
}

// ── Drag & Drop ────────────────────────────────────────────────────────────────

function getGridAnchor(clientX, clientY, piece) {
  const rect   = gridCanvas.getBoundingClientRect();
  const scaleX = gridCanvas.width  / rect.width;
  const scaleY = gridCanvas.height / rect.height;
  const canvasX = (clientX - rect.left) * scaleX;
  const canvasY = (clientY - rect.top)  * scaleY;

  const pieceRows = Math.max(...piece.cells.map(c => c[0])) + 1;
  const pieceCols = Math.max(...piece.cells.map(c => c[1])) + 1;

  const col = Math.round((canvasX - BORDER - CELL * pieceCols / 2) / (CELL + GAP));
  const row = Math.round((canvasY - BORDER - CELL * pieceRows / 2) / (CELL + GAP));
  return { row, col };
}

function updateGhost(clientX, clientY, piece) {
  const { row, col } = getGridAnchor(clientX, clientY, piece);
  const valid = canPlace(piece, row, col);
  ghostValid = valid;
  ghostCells = piece.cells.map(([dr, dc]) => ({ row: row + dr, col: col + dc }));
  return { row, col, valid };
}

function onPointerDown(e, pieceIdx) {
  if (usedPieces[pieceIdx] || !pieces[pieceIdx]) return;
  e.preventDefault();
  const isTouch = !!e.touches;
  const clientX = isTouch ? e.touches[0].clientX : e.clientX;
  const clientY = isTouch ? e.touches[0].clientY : e.clientY;
  dragState = { pieceIdx, isTouch };
  showDragCanvas(pieces[pieceIdx], clientX, clientY, isTouch);
  updateGhost(clientX, clientY, pieces[pieceIdx]);
  drawGrid();
  drawPieceTray();
}

function onPointerMove(e) {
  if (!dragState) return;
  e.preventDefault();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  moveDragCanvas(clientX, clientY);
  updateGhost(clientX, clientY, pieces[dragState.pieceIdx]);
  drawGrid();
}

function onPointerUp(e) {
  if (!dragState) return;
  const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
  const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
  const piece = pieces[dragState.pieceIdx];
  const { row, col, valid } = updateGhost(clientX, clientY, piece);

  hideDragCanvas();

  if (valid) {
    placePiece(piece, row, col);
    const pts = piece.cells.length * 2 + clearLines();
    addScore(pts);
    usedPieces[dragState.pieceIdx] = true;

    if (usedPieces.every(u => u)) refillTray();

    ghostCells = null;
    dragState  = null;
    drawGrid();
    drawPieceTray();

    if (!hasAnyMove()) setTimeout(showGameOver, 300);
  } else {
    ghostCells = null;
    dragState  = null;
    drawGrid();
    drawPieceTray();
  }
}

// ── Event Wiring ───────────────────────────────────────────────────────────────

function wirePieceTray() {
  for (let i = 0; i < 3; i++) {
    const canvas = document.getElementById(`piece-${i}`);
    if (!canvas) continue;
    canvas.addEventListener('mousedown',  e => onPointerDown(e, i));
    canvas.addEventListener('touchstart', e => onPointerDown(e, i), { passive: false });
  }
}

window.addEventListener('mousemove',  onPointerMove);
window.addEventListener('touchmove',  onPointerMove, { passive: false });
window.addEventListener('mouseup',    onPointerUp);
window.addEventListener('touchend',   onPointerUp);

document.getElementById('restart-btn').addEventListener('click', startGame);

// ── Boot ───────────────────────────────────────────────────────────────────────

initGridCanvas();
wirePieceTray();
startGame();
