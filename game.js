'use strict';

// ── Constants ──────────────────────────────────────────────────────────────────

const COLS = 8;
const ROWS = 8;

const COLORS = [
  '#e94560', // red
  '#f5a623', // orange
  '#f8e71c', // yellow
  '#7ed321', // green
  '#4a90e2', // blue
  '#9b59b6', // purple
  '#1abc9c', // teal
  '#e67e22', // dark orange
];

// Each piece is an array of [row, col] offsets
const PIECE_DEFS = [
  { cells: [[0,0],[0,1],[0,2],[0,3]],        name: 'I-H' },
  { cells: [[0,0],[1,0],[2,0],[3,0]],        name: 'I-V' },
  { cells: [[0,0],[0,1],[0,2]],              name: 'L3-H' },
  { cells: [[0,0],[1,0],[2,0]],              name: 'L3-V' },
  { cells: [[0,0],[0,1]],                    name: '2-H' },
  { cells: [[0,0],[1,0]],                    name: '2-V' },
  { cells: [[0,0]],                          name: '1' },
  { cells: [[0,0],[0,1],[1,0],[1,1]],        name: '2x2' },
  { cells: [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2],[2,0],[2,1],[2,2]], name: '3x3' },
  { cells: [[0,0],[0,1],[1,0]],              name: 'L-TL' },
  { cells: [[0,0],[0,1],[1,1]],              name: 'L-TR' },
  { cells: [[0,0],[1,0],[1,1]],              name: 'L-BL' },
  { cells: [[0,1],[1,0],[1,1]],              name: 'L-BR' },
  { cells: [[0,0],[0,1],[0,2],[1,0],[2,0]],  name: 'L5-TL' },
  { cells: [[0,0],[0,1],[0,2],[1,2],[2,2]],  name: 'L5-TR' },
  { cells: [[0,1],[1,1],[2,0],[2,1]],        name: 'S-H' },
  { cells: [[0,0],[1,0],[1,1],[2,1]],        name: 'S-V' },
  { cells: [[0,0],[0,1],[1,1],[1,2]],        name: 'Z-H' },
  { cells: [[0,1],[1,0],[1,1],[2,0]],        name: 'Z-V' },
  { cells: [[0,0],[0,1],[0,2],[1,1]],        name: 'T-U' },
  { cells: [[0,0],[1,0],[1,1],[2,0]],        name: 'T-R' },
  { cells: [[0,1],[1,0],[1,1],[1,2]],        name: 'T-D' },
  { cells: [[0,0],[0,1],[1,1],[2,1]],        name: 'T-L' },
  { cells: [[0,0],[0,1],[0,2],[0,3],[0,4]],  name: 'I5-H' },
  { cells: [[0,0],[1,0],[2,0],[3,0],[4,0]],  name: 'I5-V' },
  { cells: [[0,0],[0,1],[1,0],[1,1],[2,0],[2,1]], name: '2x3' },
  { cells: [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2]], name: '3x2' },
];

// ── State ──────────────────────────────────────────────────────────────────────

let grid = [];          // ROWS x COLS, each cell = null or color string
let score = 0;
let highscore = parseInt(localStorage.getItem('bb_highscore') || '0', 10);
let pieces = [];        // current tray of 3 pieces
let usedPieces = [];    // boolean[3]
let dragState = null;   // { pieceIdx, offsetRow, offsetCol, x, y }
let ghostCells = null;  // [{row, col}] | null

// ── Canvas Setup ───────────────────────────────────────────────────────────────

const gridCanvas = document.getElementById('grid-canvas');
const ctx = gridCanvas.getContext('2d');

const CELL = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cell-size')) || 44;
const GAP  = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--gap')) || 3;
const BORDER = 6; // canvas padding

const TRAY_CELL = 20; // cell size in the tray canvases
const TRAY_GAP = 2;

function canvasSize(cols, rows, cell, gap, border) {
  return [border * 2 + cols * cell + (cols - 1) * gap,
          border * 2 + rows * cell + (rows - 1) * gap];
}

function initGridCanvas() {
  const [w, h] = canvasSize(COLS, ROWS, CELL, GAP, BORDER);
  gridCanvas.width = w;
  gridCanvas.height = h;
}

// ── Drawing ────────────────────────────────────────────────────────────────────

function cellX(col) { return BORDER + col * (CELL + GAP); }
function cellY(row) { return BORDER + row * (CELL + GAP); }

function drawRoundedRect(ctx, x, y, w, h, r, fill) {
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

function drawCell(ctx, x, y, color, size = CELL, alpha = 1) {
  ctx.globalAlpha = alpha;
  const r = Math.max(3, size * 0.18);
  // shadow / depth
  drawRoundedRect(ctx, x + 2, y + 2, size, size, r, 'rgba(0,0,0,0.35)');
  // base
  drawRoundedRect(ctx, x, y, size, size, r, color);
  // highlight
  ctx.globalAlpha = alpha * 0.4;
  drawRoundedRect(ctx, x + 2, y + 2, size - 4, size * 0.45, r * 0.6, lighten(color, 70));
  ctx.globalAlpha = 1;
}

function drawEmptyCell(ctx, x, y, size = CELL) {
  const r = Math.max(3, size * 0.18);
  drawRoundedRect(ctx, x, y, size, size, r, '#16213e');
  ctx.globalAlpha = 0.06;
  drawRoundedRect(ctx, x, y, size, size, r, '#ffffff');
  ctx.globalAlpha = 1;
}

function drawGrid() {
  ctx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);

  // Background
  ctx.fillStyle = '#0d1b2a';
  ctx.fillRect(0, 0, gridCanvas.width, gridCanvas.height);

  const ghostSet = ghostCells
    ? new Set(ghostCells.map(c => `${c.row},${c.col}`))
    : new Set();

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = cellX(c);
      const y = cellY(r);
      const color = grid[r][c];
      const key = `${r},${c}`;

      if (color) {
        drawCell(ctx, x, y, color);
      } else if (ghostSet.has(key)) {
        // ghost preview
        ctx.globalAlpha = 0.35;
        drawCell(ctx, x, y, dragState ? pieces[dragState.pieceIdx].color : '#fff');
        ctx.globalAlpha = 1;
      } else {
        drawEmptyCell(ctx, x, y);
      }
    }
  }
}

function drawPieceTray() {
  for (let i = 0; i < 3; i++) {
    const canvas = document.getElementById(`piece-${i}`);
    if (!canvas) continue;
    const pctx = canvas.getContext('2d');

    if (usedPieces[i] || !pieces[i]) {
      canvas.width = 80;
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
    canvas.width = pw;
    canvas.height = ph;
    pctx.clearRect(0, 0, pw, ph);
    pctx.fillStyle = 'transparent';

    for (const [row, col] of p.cells) {
      const x = 4 + col * (TRAY_CELL + TRAY_GAP);
      const y = 4 + row * (TRAY_CELL + TRAY_GAP);
      drawCell(pctx, x, y, p.color, TRAY_CELL);
    }
  }
}

// ── Game Logic ─────────────────────────────────────────────────────────────────

function newGrid() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function randomPiece() {
  const def = PIECE_DEFS[Math.floor(Math.random() * PIECE_DEFS.length)];
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  return { cells: def.cells, color, name: def.name };
}

function refillTray() {
  pieces = [randomPiece(), randomPiece(), randomPiece()];
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

  // Bonus for clearing multiple lines at once
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
  grid = newGrid();
  score = 0;
  document.getElementById('score').textContent = '0';
  document.getElementById('highscore').textContent = highscore;
  document.getElementById('overlay').classList.add('hidden');
  refillTray();
  drawGrid();
  drawPieceTray();
}

// ── Drag & Drop ────────────────────────────────────────────────────────────────

function getGridAnchor(clientX, clientY, piece) {
  const rect = gridCanvas.getBoundingClientRect();
  const scaleX = gridCanvas.width / rect.width;
  const scaleY = gridCanvas.height / rect.height;
  const canvasX = (clientX - rect.left) * scaleX;
  const canvasY = (clientY - rect.top) * scaleY;

  // Which grid cell is under the pointer? Use the piece center for snap.
  const pieceRows = Math.max(...piece.cells.map(c => c[0])) + 1;
  const pieceCols = Math.max(...piece.cells.map(c => c[1])) + 1;

  const col = Math.round((canvasX - BORDER - (CELL * pieceCols / 2)) / (CELL + GAP));
  const row = Math.round((canvasY - BORDER - (CELL * pieceRows / 2)) / (CELL + GAP));
  return { row, col };
}

function updateGhost(clientX, clientY, piece) {
  const { row, col } = getGridAnchor(clientX, clientY, piece);
  if (canPlace(piece, row, col)) {
    ghostCells = piece.cells.map(([dr, dc]) => ({ row: row + dr, col: col + dc }));
    return { row, col, valid: true };
  } else {
    ghostCells = null;
    return { row, col, valid: false };
  }
}

function onPointerDown(e, pieceIdx) {
  if (usedPieces[pieceIdx] || !pieces[pieceIdx]) return;
  e.preventDefault();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  dragState = { pieceIdx, x: clientX, y: clientY };
  ghostCells = null;
  drawGrid();
}

function onPointerMove(e) {
  if (!dragState) return;
  e.preventDefault();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  dragState.x = clientX;
  dragState.y = clientY;
  updateGhost(clientX, clientY, pieces[dragState.pieceIdx]);
  drawGrid();
}

function onPointerUp(e) {
  if (!dragState) return;
  const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
  const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
  const piece = pieces[dragState.pieceIdx];
  const { row, col, valid } = updateGhost(clientX, clientY, piece);

  if (valid) {
    placePiece(piece, row, col);
    const pts = piece.cells.length * 2 + clearLines();
    addScore(pts);
    usedPieces[dragState.pieceIdx] = true;

    // Refill tray when all 3 used
    if (usedPieces.every(u => u)) refillTray();

    ghostCells = null;
    dragState = null;
    drawGrid();
    drawPieceTray();

    if (!hasAnyMove()) {
      setTimeout(showGameOver, 300);
    }
  } else {
    ghostCells = null;
    dragState = null;
    drawGrid();
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

// ── Flash animation for cleared lines ─────────────────────────────────────────

const _originalClearLines = clearLines;
// (flash is integrated via the score animation in the DOM — keep it simple)

// ── Boot ───────────────────────────────────────────────────────────────────────

initGridCanvas();
wirePieceTray();
startGame();
