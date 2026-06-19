(function () {
'use strict';

// ── Canvas & context ──────────────────────────────────────────────────────────
let canvas, ctx, W, H, running = false, raf = null;

// ── Isometric constants ───────────────────────────────────────────────────────
const TW = 48, TH = 24, BH = 22;

// ── Block palette ─────────────────────────────────────────────────────────────
const BLOCKS = {
  grass:  { top:'#4caf50', left:'#388e3c', right:'#2e7d32', edge:'#1b5e20' },
  dirt:   { top:'#8d6e63', left:'#6d4c41', right:'#5d4037', edge:'#3e2723' },
  stone:  { top:'#90a4ae', left:'#607d8b', right:'#546e7a', edge:'#37474f' },
  brick:  { top:'#ef9a9a', left:'#e57373', right:'#c62828', edge:'#b71c1c' },
  wood:   { top:'#ffcc80', left:'#ffa726', right:'#e65100', edge:'#bf360c' },
  gold:   { top:'#fff176', left:'#ffd740', right:'#ff8f00', edge:'#e65100' },
  ice:    { top:'#b3e5fc', left:'#81d4fa', right:'#4fc3f7', edge:'#0288d1' },
  lava:   { top:'#ff6e40', left:'#ff3d00', right:'#bf360c', edge:'#870000' },
  end:    { top:'#ce93d8', left:'#ab47bc', right:'#7b1fa2', edge:'#4a148c' },
  metal:  { top:'#cfd8dc', left:'#90a4ae', right:'#607d8b', edge:'#263238' },
};

// ── World / level ─────────────────────────────────────────────────────────────
let world = {};   // key = "x,y,z" → block type string
let stars = [];   // [{x,y,z, collected}]
let endPos = null; // {x,z} of end block (y=0)
let totalStars = 0;

function wkey(x, y, z) { return `${x},${y},${z}`; }
function setBlock(x, y, z, type) { world[wkey(x, y, z)] = type; }
function getBlock(x, y, z) { return world[wkey(x, y, z)] || null; }

function buildLevel() {
  world = {}; stars = []; endPos = null;

  // Helper to lay a flat platform
  function platform(x0, z0, x1, z1, y, type) {
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++)
        setBlock(x, y, z, type);
  }

  // Starting island
  platform(0, 0, 5, 5, 0, 'grass');
  platform(1, 1, 4, 4, 1, 'dirt');
  setBlock(2, 2, 2, 'gold');   // tutorial gold star position

  // Bridge 1
  for (let x = 6; x <= 9; x++) setBlock(x, 0, 2, 'wood');

  // Stone platform
  platform(10, 0, 14, 5, 0, 'stone');
  platform(10, 0, 14, 5, 1, 'stone');
  setBlock(12, 2, 2, 'gold');

  // Rising stairs
  for (let i = 0; i < 5; i++) {
    setBlock(15 + i, i, 2, 'brick');
    setBlock(15 + i, i, 3, 'brick');
  }

  // Elevated brick platform
  platform(20, 0, 25, 6, 4, 'brick');
  setBlock(22, 5, 3, 'gold');

  // Ice bridge (narrow, treacherous)
  for (let z = 7; z <= 12; z++) setBlock(22, 4, z, 'ice');

  // Metal platform
  platform(19, 13, 26, 18, 4, 'metal');
  setBlock(21, 5, 15, 'gold');
  setBlock(24, 5, 15, 'gold');

  // Lava pit crossing — stepping stones
  const lavaStones = [[19,19,4],[19,20,4],[20,21,4],[21,21,4],[21,22,3],[22,22,3],[22,23,3],[23,23,3]];
  for (const [x,z,y] of lavaStones) setBlock(x, y, z, 'wood');
  // Lava below
  platform(17, 18, 26, 25, 0, 'lava');
  platform(17, 18, 26, 25, 1, 'lava');
  platform(17, 18, 26, 25, 2, 'lava');

  // Gold platform tower
  platform(21, 24, 27, 30, 3, 'gold');
  platform(21, 24, 27, 30, 4, 'gold');
  setBlock(24, 5, 27, 'gold');

  // Staircase up
  for (let i = 0; i < 6; i++) {
    platform(21 + i, 31, 21 + i, 33, 4 + i, 'stone');
  }

  // Final platform with end block
  platform(27, 31, 33, 37, 9, 'stone');
  platform(27, 31, 33, 37, 10, 'stone');
  setBlock(30, 11, 34, 'end');
  endPos = { x: 30, z: 34 };

  // Scatter remaining stars
  const starPositions = [
    [3, 1, 1],    // starting area
    [11, 2, 1],   // stone platform
    [17, 1, 2],   // mid stair
    [22, 5, 8],   // ice bridge
    [20, 5, 14],  // metal platform
    [30, 11, 35], // near end
  ];
  for (const [x, z, y] of starPositions) {
    stars.push({ x, y, z, collected: false });
  }
  totalStars = stars.length;
}

// ── Player ────────────────────────────────────────────────────────────────────
const PLAYER_W = 0.6, PLAYER_D = 0.6, PLAYER_H = 1.8;
let px, py, pz, vx, vy, vz, onGround, lives, score, walkPhase;

function resetPlayer() {
  px = 2.5; py = 2.2; pz = 2.5;
  vx = 0;   vy = 0;   vz = 0;
  onGround = false; walkPhase = 0;
}

function initPlayer() {
  lives = 3; score = 0;
  resetPlayer();
  updateHUD();
}

function updateHUD() {
  const el = document.getElementById('blox-score');
  if (el) el.textContent = score;
  const lv = document.getElementById('blox-lives');
  if (lv) lv.textContent = '❤️'.repeat(Math.max(0, lives));
}

// ── Camera ────────────────────────────────────────────────────────────────────
let camX = 0, camZ = 0;

// ── Input ─────────────────────────────────────────────────────────────────────
const keys = {};
let jumpBtn = false, jumpConsumed = false;

function onKeyDown(e) {
  keys[e.code] = true;
  if ((e.code === 'Space' || e.code === 'ArrowUp') && !jumpConsumed) {
    jumpBtn = true;
  }
}
function onKeyUp(e) {
  keys[e.code] = false;
  if (e.code === 'Space' || e.code === 'ArrowUp') jumpConsumed = false;
}

// ── Physics ───────────────────────────────────────────────────────────────────
const GRAVITY = 0.022, JUMP_V = 0.38, SPEED = 0.10, FRICTION = 0.82;

function getTopAt(wx, wz) {
  let top = -99;
  const ix = Math.floor(wx), iz = Math.floor(wz);
  // check columns below player footprint corners
  const offsets = [[-0.3,-0.3],[-0.3,0.3],[0.3,-0.3],[0.3,0.3]];
  for (const [ox, oz] of offsets) {
    const bx = Math.floor(wx + ox), bz = Math.floor(wz + oz);
    for (let y = 20; y >= -2; y--) {
      if (getBlock(bx, y, bz)) { top = Math.max(top, y + 1); break; }
    }
  }
  return top;
}

function updatePhysics() {
  const dt = 1;

  // Movement input → world-space (isometric axes: right=+x-z, up=-x-z)
  let mx = 0, mz = 0;
  if (keys['ArrowRight'] || keys['KeyD']) { mx += 1; mz += 1; }
  if (keys['ArrowLeft']  || keys['KeyA']) { mx -= 1; mz -= 1; }
  if (keys['ArrowDown']  || keys['KeyS']) { mx += 1; mz -= 1; }
  if (keys['ArrowUp']    || keys['KeyW']) { mx -= 1; mz += 1; }

  const len = Math.sqrt(mx * mx + mz * mz);
  if (len > 0) { mx /= len; mz /= len; }

  vx += mx * SPEED; vz += mz * SPEED;
  vx *= FRICTION;   vz *= FRICTION;

  // Jump
  if (jumpBtn && onGround) {
    vy = JUMP_V; onGround = false; jumpConsumed = true;
  }
  jumpBtn = false;

  // Gravity
  vy -= GRAVITY;

  // Move + collide
  px += vx;
  pz += vz;

  const floor = getTopAt(px, pz);
  py += vy;
  if (py <= floor) {
    py = floor; vy = 0; onGround = true;
  } else {
    onGround = false;
  }

  // Walk animation
  if (onGround && (Math.abs(vx) + Math.abs(vz) > 0.01)) walkPhase += 0.22;

  // Death by falling
  if (py < -6) {
    lives--;
    if (lives <= 0) { lives = 0; showEndScreen(false); return; }
    updateHUD();
    resetPlayer();
  }

  // Camera smooth follow
  camX += (px - camX) * 0.09;
  camZ += (pz - camZ) * 0.09;

  // Star collection
  for (const s of stars) {
    if (s.collected) continue;
    if (Math.abs(px - s.x) < 0.9 && Math.abs(pz - s.z) < 0.9 && Math.abs(py - s.y) < 1.4) {
      s.collected = true;
      score += 10;
      updateHUD();
      spawnStarPop();
    }
  }

  // End block
  if (endPos && Math.abs(px - endPos.x) < 1 && Math.abs(pz - endPos.z) < 1 && py >= 10.5) {
    showEndScreen(true);
  }
}

// ── Iso projection ────────────────────────────────────────────────────────────
function isoProject(wx, wy, wz) {
  const ox = W / 2, oy = H * 0.42;
  const rx = wx - camX, rz = wz - camZ;
  const sx = (rx - rz) * (TW / 2);
  const sy = (rx + rz) * (TH / 2) - wy * BH;
  return { sx: ox + sx, sy: oy + sy };
}

// ── Draw helpers ──────────────────────────────────────────────────────────────
function drawTopFace(sx, sy, col) {
  ctx.beginPath();
  ctx.moveTo(sx,          sy - TH / 2);
  ctx.lineTo(sx + TW / 2, sy);
  ctx.lineTo(sx,          sy + TH / 2);
  ctx.lineTo(sx - TW / 2, sy);
  ctx.closePath();
  ctx.fillStyle = col;
  ctx.fill();
}

function drawLeftFace(sx, sy, col) {
  ctx.beginPath();
  ctx.moveTo(sx - TW / 2, sy);
  ctx.lineTo(sx,           sy + TH / 2);
  ctx.lineTo(sx,           sy + TH / 2 + BH);
  ctx.lineTo(sx - TW / 2, sy + BH);
  ctx.closePath();
  ctx.fillStyle = col;
  ctx.fill();
}

function drawRightFace(sx, sy, col) {
  ctx.beginPath();
  ctx.moveTo(sx + TW / 2, sy);
  ctx.lineTo(sx,           sy + TH / 2);
  ctx.lineTo(sx,           sy + TH / 2 + BH);
  ctx.lineTo(sx + TW / 2, sy + BH);
  ctx.closePath();
  ctx.fillStyle = col;
  ctx.fill();
}

function drawBlock(wx, wy, wz, type) {
  const { sx, sy } = isoProject(wx + 0.5, wy, wz + 0.5);
  // Cull off-screen
  if (sx < -TW || sx > W + TW || sy < -BH * 2 || sy > H + BH * 3) return;

  const b = BLOCKS[type] || BLOCKS.stone;

  // Lava shimmer
  let topCol = b.top;
  if (type === 'lava') {
    const pulse = 0.82 + 0.18 * Math.sin(frame * 0.12 + wx * 0.7 + wz * 0.5);
    ctx.globalAlpha = pulse;
  }

  drawTopFace(sx, sy, topCol);
  drawLeftFace(sx, sy, b.left);
  drawRightFace(sx, sy, b.right);

  // Edge outlines
  ctx.strokeStyle = b.edge;
  ctx.lineWidth = 0.7;
  ctx.globalAlpha = 0.5;

  // Top outline
  ctx.beginPath();
  ctx.moveTo(sx, sy - TH / 2);
  ctx.lineTo(sx + TW / 2, sy);
  ctx.lineTo(sx, sy + TH / 2);
  ctx.lineTo(sx - TW / 2, sy);
  ctx.closePath();
  ctx.stroke();

  ctx.globalAlpha = 1;

  // Grass texture dots
  if (type === 'grass') {
    ctx.fillStyle = '#66bb6a';
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 4; i++) {
      const rx = Math.sin(wx * 7 + wz * 3 + i * 2.1) * 6;
      const ry = Math.cos(wx * 5 + wz * 11 + i * 1.7) * 3;
      ctx.beginPath();
      ctx.arc(sx + rx, sy + ry, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Ice shine
  if (type === 'ice') {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.moveTo(sx - 4, sy - TH / 2 + 2);
    ctx.lineTo(sx + 2, sy - TH / 2 + 5);
    ctx.lineTo(sx,     sy - TH / 2 + 3);
    ctx.closePath();
    ctx.fill();
  }

  // Gold shimmer
  if (type === 'gold') {
    const g = 0.6 + 0.4 * Math.sin(frame * 0.09 + wx + wz);
    ctx.fillStyle = `rgba(255,255,200,${g * 0.3})`;
    drawTopFace(sx, sy, `rgba(255,255,200,${g * 0.3})`);
  }
}

// ── Sky background ────────────────────────────────────────────────────────────
let skyStars = [];
function initSkyStars() {
  skyStars = [];
  for (let i = 0; i < 80; i++) {
    skyStars.push({
      x: Math.random() * 400,
      y: Math.random() * 180,
      r: Math.random() * 1.2 + 0.3,
      phase: Math.random() * Math.PI * 2,
    });
  }
}

function drawSky() {
  // Sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#0d1b3e');
  sky.addColorStop(0.6, '#1a3a6e');
  sky.addColorStop(1, '#2d5016');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Twinkling stars
  for (const s of skyStars) {
    const a = 0.4 + 0.6 * Math.sin(frame * 0.04 + s.phase);
    ctx.globalAlpha = a;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Distant mountains silhouette
  ctx.fillStyle = '#1a3a28';
  ctx.beginPath();
  ctx.moveTo(0, H);
  const mpts = [[0,180],[40,140],[80,160],[120,125],[160,145],[200,118],[240,138],[280,122],[320,142],[360,130],[400,155],[400,H]];
  for (const [mx, my] of mpts) ctx.lineTo(mx, my);
  ctx.closePath();
  ctx.fill();
}

// ── Floating star collectible ─────────────────────────────────────────────────
function drawStar(wx, wy, wz) {
  const { sx, sy } = isoProject(wx + 0.5, wy + 0.5, wz + 0.5);
  if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) return;
  const bob = Math.sin(frame * 0.08 + wx + wz) * 3;
  const rot = frame * 0.05;
  const r = 9 + Math.sin(frame * 0.1 + wx) * 1.5;

  ctx.save();
  ctx.translate(sx, sy + bob);

  // Glow
  ctx.shadowColor = '#ffd740';
  ctx.shadowBlur = 12;

  ctx.fillStyle = '#ffd740';
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = rot + i * Math.PI * 2 / 5 - Math.PI / 2;
    const ai = a + Math.PI / 5;
    if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.lineTo(Math.cos(ai) * r * 0.4, Math.sin(ai) * r * 0.4);
  }
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.restore();
}

// ── Player character rendering ────────────────────────────────────────────────
function drawPlayer() {
  const { sx, sy } = isoProject(px, py, pz);

  ctx.save();
  const walk = Math.sin(walkPhase) * 3;
  const legSwing = onGround ? walk : 0;

  // Shadow
  const { sx: gsx, sy: gsy } = isoProject(px, py - (py - Math.floor(py + 0.01)), pz);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(sx, gsy + BH - 2, 10, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs
  ctx.fillStyle = '#1565c0';
  // Left leg
  ctx.save();
  ctx.translate(sx - 4, sy - 4);
  ctx.rotate(legSwing * 0.04);
  ctx.fillRect(-3, 0, 6, 10);
  ctx.restore();
  // Right leg
  ctx.save();
  ctx.translate(sx + 4, sy - 4);
  ctx.rotate(-legSwing * 0.04);
  ctx.fillRect(-3, 0, 6, 10);
  ctx.restore();

  // Body (red shirt)
  ctx.fillStyle = '#e53935';
  ctx.fillRect(sx - 7, sy - 18, 14, 12);

  // Arms
  ctx.fillStyle = '#ffccbc';
  // Left arm
  ctx.save();
  ctx.translate(sx - 9, sy - 16);
  ctx.rotate(-legSwing * 0.05);
  ctx.fillRect(-3, 0, 5, 10);
  ctx.restore();
  // Right arm
  ctx.save();
  ctx.translate(sx + 9, sy - 16);
  ctx.rotate(legSwing * 0.05);
  ctx.fillRect(-2, 0, 5, 10);
  ctx.restore();

  // Head
  ctx.fillStyle = '#ffccbc';
  ctx.fillRect(sx - 7, sy - 30, 14, 12);

  // Eyes
  ctx.fillStyle = '#fff';
  ctx.fillRect(sx - 5, sy - 28, 3, 3);
  ctx.fillRect(sx + 2, sy - 28, 3, 3);
  ctx.fillStyle = '#1a237e';
  ctx.fillRect(sx - 4, sy - 27, 2, 2);
  ctx.fillRect(sx + 3, sy - 27, 2, 2);

  // Hat (Roblox-style block hat)
  ctx.fillStyle = '#ffd740';
  ctx.fillRect(sx - 7, sy - 34, 14, 4);
  ctx.fillStyle = '#ff8f00';
  ctx.fillRect(sx - 5, sy - 38, 10, 4);

  ctx.restore();
}

// ── End flag / portal ─────────────────────────────────────────────────────────
function drawEndPortal() {
  if (!endPos) return;
  const { sx, sy } = isoProject(endPos.x + 0.5, 12, endPos.z + 0.5);
  if (sx < -30 || sx > W + 30 || sy < -30 || sy > H + 30) return;

  const pulse = 0.7 + 0.3 * Math.sin(frame * 0.07);
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.shadowColor = '#ce93d8';
  ctx.shadowBlur = 20;

  // Portal ring
  ctx.strokeStyle = '#e040fb';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(sx, sy, 18, 9, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = 'rgba(206,147,216,0.3)';
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.restore();
}

// ── Particles ─────────────────────────────────────────────────────────────────
let particles = [];
function spawnStarPop() {
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * Math.PI * 2;
    particles.push({
      x: px, y: py + 0.5, z: pz,
      vx: Math.cos(a) * 0.06, vy: 0.12 + Math.random() * 0.08, vz: Math.sin(a) * 0.06,
      life: 1, col: '#ffd740',
    });
  }
}

function updateParticles() {
  for (const p of particles) {
    p.x += p.vx; p.y += p.vy; p.z += p.vz;
    p.vy -= 0.005;
    p.life -= 0.035;
  }
  particles = particles.filter(p => p.life > 0);
}

function drawParticles() {
  for (const p of particles) {
    const { sx, sy } = isoProject(p.x, p.y, p.z);
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.col;
    ctx.shadowColor = p.col;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(sx, sy, 3 * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

// ── HUD overlay ───────────────────────────────────────────────────────────────
function drawHUDCanvas() {
  // Mini progress bar
  const collected = stars.filter(s => s.collected).length;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(8, H - 20, 100, 10);
  ctx.fillStyle = '#ffd740';
  ctx.fillRect(8, H - 20, (collected / totalStars) * 100, 10);
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(8, H - 20, 100, 10);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = '9px monospace';
  ctx.fillText(`⭐ ${collected}/${totalStars}`, 115, H - 12);

  // Controls hint (fades after 3s = 180 frames)
  if (frame < 200) {
    const a = frame < 160 ? 1 : 1 - (frame - 160) / 40;
    ctx.globalAlpha = a * 0.7;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(W / 2 - 85, 8, 170, 22);
    ctx.fillStyle = '#fff';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('WASD / Pfeiltasten  |  Leertaste = Sprung', W / 2, 23);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }
}

// ── Render ────────────────────────────────────────────────────────────────────
let frame = 0;

function getVisibleBlocks() {
  // Gather all blocks visible near camera
  const result = [];
  const viewR = 22;
  const cx = Math.round(camX), cz = Math.round(camZ);
  for (const key in world) {
    const [x, y, z] = key.split(',').map(Number);
    if (Math.abs(x - cx) > viewR || Math.abs(z - cz) > viewR) continue;
    result.push([x, y, z, world[key]]);
  }
  // Painter's algorithm: sort by x+z ascending (back to front)
  result.sort((a, b) => (a[0] + a[2]) - (b[0] + b[2]) || a[1] - b[1]);
  return result;
}

function render() {
  ctx.clearRect(0, 0, W, H);
  drawSky();

  const blocks = getVisibleBlocks();

  // Draw blocks then overlay player at correct depth
  const playerDepth = px + pz;

  let drewPlayer = false;
  for (const [x, y, z, type] of blocks) {
    if (!drewPlayer && (x + z) > playerDepth) {
      drawPlayer();
      drawParticles();
      drewPlayer = true;
    }
    drawBlock(x, y, z, type);
  }
  if (!drewPlayer) { drawPlayer(); drawParticles(); }

  // Stars
  for (const s of stars) {
    if (!s.collected) drawStar(s.x, s.y, s.z);
  }

  drawEndPortal();
  drawHUDCanvas();
}

// ── End screen ────────────────────────────────────────────────────────────────
let gameOver = false;
function showEndScreen(won) {
  gameOver = true;
  const collected = stars.filter(s => s.collected).length;
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.shadowColor = won ? '#ffd740' : '#e53935';
  ctx.shadowBlur = 20;
  ctx.fillStyle = won ? '#ffd740' : '#ef5350';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText(won ? '🏆 Ziel erreicht!' : '💀 Game Over', W / 2, H / 2 - 30);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff';
  ctx.font = '14px sans-serif';
  ctx.fillText(`Punkte: ${score}  |  Sterne: ${collected}/${totalStars}`, W / 2, H / 2 + 5);
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font = '11px sans-serif';
  ctx.fillText('Tippe / klicke zum Neustart', W / 2, H / 2 + 28);
  ctx.textAlign = 'left';
}

// ── Main loop ─────────────────────────────────────────────────────────────────
function loop() {
  if (!running) return;
  frame++;
  if (!gameOver) {
    updatePhysics();
    updateParticles();
    render();
  }
  raf = requestAnimationFrame(loop);
}

// ── Public API ────────────────────────────────────────────────────────────────
function restartGame() {
  gameOver = false;
  particles = [];
  buildLevel();
  initPlayer();
  camX = 2.5; camZ = 2.5;
  frame = 0;
}

window.startBlox = function () {
  canvas = document.getElementById('blox-canvas');
  if (!canvas) return;
  ctx = canvas.getContext('2d');
  W = canvas.width  = 400;
  H = canvas.height = 260;

  initSkyStars();
  buildLevel();
  initPlayer();
  camX = 2.5; camZ = 2.5;
  gameOver = false;
  particles = [];
  frame = 0;
  running = true;

  // Keyboard
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup',   onKeyUp);

  // Canvas click → restart on game over
  canvas.addEventListener('click', function onCanvasClick() {
    if (gameOver) restartGame();
  });
  canvas.addEventListener('touchstart', function(e) {
    e.preventDefault();
    if (gameOver) restartGame();
    else { jumpBtn = true; }
  }, { passive: false });

  // D-pad buttons
  function hookBtn(id, down, up) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('mousedown',  () => { keys[down] = true; });
    el.addEventListener('mouseup',    () => { keys[down] = false; if (up) { jumpBtn = true; } });
    el.addEventListener('touchstart', (e) => { e.preventDefault(); keys[down] = true; if (up) { jumpBtn = true; } }, { passive: false });
    el.addEventListener('touchend',   (e) => { e.preventDefault(); keys[down] = false; }, { passive: false });
  }
  hookBtn('blox-up',    'KeyW',  false);
  hookBtn('blox-down',  'KeyS',  false);
  hookBtn('blox-left',  'KeyA',  false);
  hookBtn('blox-right', 'KeyD',  false);
  hookBtn('blox-jump',  'Space', true);

  loop();
};

window.stopBlox = function () {
  running = false;
  if (raf) { cancelAnimationFrame(raf); raf = null; }
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup',   onKeyUp);
  // Reset key state
  for (const k in keys) keys[k] = false;
  jumpBtn = false; jumpConsumed = false;
};

})();
