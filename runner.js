/* ══ Endless Runner ══════════════════════════════════════════════════════ */
(function () {
  const canvas = document.getElementById('runner-canvas');
  const ctx    = canvas.getContext('2d');
  const scoreEl = document.getElementById('runner-score');

  const W = 380, H = 240;
  const LANES = [60, 120, 180];
  const CHAR_X = 75;
  const GROUND_Y = 200;

  let raf, running = false;
  let lane, charY, jumpV, jumping;
  let obstacles, coins;
  let score, speed, frame, spawnTimer;
  let bgOffset;
  let deadTimer;
  let particles;

  /* ── init ─────────────────────────────────────────────────────────── */
  function init() {
    canvas.width  = W;
    canvas.height = H;
    lane      = 1;
    charY     = LANES[lane];
    jumpV     = 0;
    jumping   = false;
    obstacles = [];
    coins     = [];
    particles = [];
    score     = 0;
    speed     = 3;
    frame     = 0;
    spawnTimer = 0;
    bgOffset  = 0;
    deadTimer = -1;
    scoreEl.textContent = '0';
  }

  /* ── helpers ──────────────────────────────────────────────────────── */
  function laneY(l) { return LANES[l]; }

  function spawnObstacle() {
    const l = Math.floor(Math.random() * 3);
    const type = Math.random() < 0.3 ? 'tall' : 'normal';
    obstacles.push({ x: W + 20, lane: l, type });
  }

  function spawnCoin() {
    const l = Math.floor(Math.random() * 3);
    coins.push({ x: W + 10, lane: l, collected: false });
  }

  function addParticles(x, y, color, n = 8) {
    for (let i = 0; i < n; i++) {
      const angle = (Math.PI * 2 * i) / n + Math.random() * 0.4;
      particles.push({
        x, y,
        vx: Math.cos(angle) * (2 + Math.random() * 3),
        vy: Math.sin(angle) * (2 + Math.random() * 3),
        life: 1, color
      });
    }
  }

  /* ── background ───────────────────────────────────────────────────── */
  function drawBg() {
    // sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#1a0533');
    sky.addColorStop(1, '#0d1b4b');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // scrolling city silhouette
    ctx.fillStyle = '#0a0a1a';
    for (let i = 0; i < 8; i++) {
      const bx = ((i * 55 - bgOffset * 0.4) % (W + 55) + W + 55) % (W + 55) - 55;
      const bh = 40 + (i * 31) % 50;
      ctx.fillRect(bx, GROUND_Y - bh, 45, bh);
      // windows
      ctx.fillStyle = 'rgba(255,220,100,0.35)';
      for (let wy = GROUND_Y - bh + 5; wy < GROUND_Y - 5; wy += 10) {
        for (let wx = bx + 5; wx < bx + 40; wx += 10) {
          if ((i + wy + wx) % 3 !== 0) ctx.fillRect(wx, wy, 5, 5);
        }
      }
      ctx.fillStyle = '#0a0a1a';
    }

    // road
    const road = ctx.createLinearGradient(0, GROUND_Y, 0, H);
    road.addColorStop(0, '#1c1c2e');
    road.addColorStop(1, '#111118');
    ctx.fillStyle = road;
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);

    // lane dividers
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 2;
    ctx.setLineDash([18, 14]);
    ctx.lineDashOffset = -(bgOffset % 32);
    [LANES[0] + 30, LANES[1] + 30].forEach(ly => {
      ctx.beginPath(); ctx.moveTo(0, ly + 12); ctx.lineTo(W, ly + 12); ctx.stroke();
    });
    ctx.setLineDash([]);
  }

  /* ── character ────────────────────────────────────────────────────── */
  function drawChar(x, y, dead) {
    const alpha = dead ? 0.5 : 1;
    ctx.globalAlpha = alpha;

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, laneY(lane) + 22, 14, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // legs (animated run)
    const legPhase = (frame * 0.25) % (Math.PI * 2);
    ctx.strokeStyle = '#ff6b35';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    if (!jumping) {
      ctx.beginPath();
      ctx.moveTo(x, y + 8);
      ctx.lineTo(x - 6 + Math.cos(legPhase) * 6, y + 20);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y + 8);
      ctx.lineTo(x - 6 + Math.cos(legPhase + Math.PI) * 6, y + 20);
      ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(x, y + 8); ctx.lineTo(x - 8, y + 18); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y + 8); ctx.lineTo(x + 4, y + 18); ctx.stroke();
    }

    // body
    const bodyGrad = ctx.createLinearGradient(x - 10, y - 14, x + 10, y + 8);
    bodyGrad.addColorStop(0, '#a855f7');
    bodyGrad.addColorStop(1, '#6d28d9');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.roundRect(x - 10, y - 14, 20, 22, 5);
    ctx.fill();

    // head
    const headGrad = ctx.createRadialGradient(x - 3, y - 22, 2, x, y - 18, 11);
    headGrad.addColorStop(0, '#fbbf24');
    headGrad.addColorStop(1, '#d97706');
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.arc(x, y - 18, 11, 0, Math.PI * 2);
    ctx.fill();

    // visor
    ctx.fillStyle = '#1e1b4b';
    ctx.beginPath();
    ctx.roundRect(x - 7, y - 24, 14, 7, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(167,139,250,0.6)';
    ctx.fillRect(x - 6, y - 23, 12, 5);

    ctx.globalAlpha = 1;
  }

  /* ── obstacles ────────────────────────────────────────────────────── */
  function drawObstacle(ob) {
    const y = laneY(ob.lane);
    const h = ob.type === 'tall' ? 44 : 28;
    const grad = ctx.createLinearGradient(ob.x - 14, y - h, ob.x + 14, y + 10);
    grad.addColorStop(0, '#ef4444');
    grad.addColorStop(1, '#7f1d1d');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(ob.x - 14, y - h, 28, h + 10, 4);
    ctx.fill();
    // warning stripes
    ctx.fillStyle = 'rgba(255,200,0,0.4)';
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(ob.x - 14 + i * 10, y - h, 5, h + 10);
    }
    // top light
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(ob.x, y - h, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ── coins ────────────────────────────────────────────────────────── */
  function drawCoin(c) {
    if (c.collected) return;
    const y = laneY(c.lane);
    const pulse = 1 + Math.sin(frame * 0.12) * 0.1;
    ctx.save();
    ctx.translate(c.x, y - 12);
    ctx.scale(pulse, pulse);
    const cg = ctx.createRadialGradient(-3, -3, 1, 0, 0, 9);
    cg.addColorStop(0, '#fde68a');
    cg.addColorStop(0.6, '#f59e0b');
    cg.addColorStop(1, '#92400e');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.ellipse(-3, -3, 4, 2, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* ── particles ────────────────────────────────────────────────────── */
  function drawParticles() {
    particles.forEach(p => {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4 * p.life, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  /* ── HUD ──────────────────────────────────────────────────────────── */
  function drawHud() {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(`Punkte: ${score}`, 8, 20);

    // speed bar
    const barW = 80, barH = 6;
    const bx = W - barW - 8, by = 12;
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath(); ctx.roundRect(bx, by, barW, barH, 3); ctx.fill();
    const spFill = Math.min((speed - 3) / 7, 1);
    const spGrad = ctx.createLinearGradient(bx, 0, bx + barW, 0);
    spGrad.addColorStop(0, '#34d399'); spGrad.addColorStop(1, '#ef4444');
    ctx.fillStyle = spGrad;
    ctx.beginPath(); ctx.roundRect(bx, by, barW * spFill, barH, 3); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '10px sans-serif';
    ctx.fillText('SPEED', bx, by - 2);
  }

  /* ── game over overlay ────────────────────────────────────────────── */
  function drawDead() {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 32px sans-serif';
    ctx.fillText('💥 Game Over', W / 2, H / 2 - 20);
    ctx.fillStyle = '#fff';
    ctx.font = '16px sans-serif';
    ctx.fillText(`Punkte: ${score}`, W / 2, H / 2 + 10);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '13px sans-serif';
    ctx.fillText('Tippe zum Neustart', W / 2, H / 2 + 35);
    ctx.textAlign = 'left';
  }

  /* ── collision ────────────────────────────────────────────────────── */
  function hitTest(obj, cx, cy, hw, hh) {
    const oy = laneY(obj.lane);
    return Math.abs(cx - obj.x) < hw && Math.abs(cy - oy) < hh;
  }

  /* ── main loop ────────────────────────────────────────────────────── */
  function loop() {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    frame++;

    if (deadTimer >= 0) {
      deadTimer++;
      drawBg();
      obstacles.forEach(drawObstacle);
      drawChar(CHAR_X, charY, true);
      drawDead();
      return;
    }

    bgOffset += speed;

    // jump physics
    if (jumping) {
      charY += jumpV;
      jumpV += 0.7;
      const groundY = laneY(lane);
      if (charY >= groundY) { charY = groundY; jumping = false; jumpV = 0; }
    }

    // speed ramp
    if (frame % 300 === 0) speed = Math.min(speed + 0.5, 10);

    // spawn
    spawnTimer++;
    const spawnInterval = Math.max(55, 110 - speed * 5);
    if (spawnTimer >= spawnInterval) {
      spawnTimer = 0;
      spawnObstacle();
      if (Math.random() < 0.5) spawnCoin();
    }

    // move obstacles
    obstacles.forEach(ob => { ob.x -= speed; });
    obstacles = obstacles.filter(ob => ob.x > -40);

    // move coins
    coins.forEach(c => { c.x -= speed; });
    coins = coins.filter(c => c.x > -20 && !c.collected);

    // update particles
    particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vx *= 0.92; p.vy *= 0.92; p.life -= 0.04; });
    particles = particles.filter(p => p.life > 0);

    // coin collect
    coins.forEach(c => {
      if (!c.collected && hitTest(c, CHAR_X, charY - 12, 18, 20)) {
        c.collected = true;
        score += 10;
        scoreEl.textContent = score;
        addParticles(c.x, laneY(c.lane) - 12, '#fbbf24', 6);
      }
    });

    // obstacle collision
    for (const ob of obstacles) {
      const h = ob.type === 'tall' ? 44 : 28;
      const oy = laneY(ob.lane);
      if (
        Math.abs(CHAR_X - ob.x) < 22 &&
        charY - 14 < oy + 10 &&
        charY + 10 > oy - h
      ) {
        addParticles(CHAR_X, charY, '#a855f7', 12);
        deadTimer = 0;
        return;
      }
    }

    // score per frame
    if (frame % 6 === 0) {
      score++;
      scoreEl.textContent = score;
    }

    // draw
    drawBg();
    coins.forEach(drawCoin);
    obstacles.forEach(drawObstacle);
    drawParticles();
    drawChar(CHAR_X, charY, false);
    drawHud();
  }

  /* ── input ────────────────────────────────────────────────────────── */
  function moveUp() {
    if (deadTimer >= 0) { restart(); return; }
    if (lane > 0) { lane--; charY = laneY(lane); }
  }
  function moveDown() {
    if (deadTimer >= 0) { restart(); return; }
    if (lane < 2) { lane++; charY = laneY(lane); }
  }
  function jump() {
    if (deadTimer >= 0) { restart(); return; }
    if (!jumping) { jumping = true; jumpV = -9; }
  }
  function restart() {
    init();
  }

  const upBtn   = document.getElementById('runner-up');
  const downBtn = document.getElementById('runner-down');
  upBtn.addEventListener('click',   moveUp);
  downBtn.addEventListener('click', moveDown);

  function onKey(e) {
    if (e.key === 'ArrowUp'   || e.key === 'w') { e.preventDefault(); moveUp(); }
    if (e.key === 'ArrowDown' || e.key === 's') { e.preventDefault(); moveDown(); }
    if (e.key === ' ')                            { e.preventDefault(); jump(); }
  }

  // swipe
  let touchStartY = 0, touchStartX = 0;
  canvas.addEventListener('touchstart', e => {
    touchStartY = e.touches[0].clientY;
    touchStartX = e.touches[0].clientX;
  }, { passive: true });
  canvas.addEventListener('touchend', e => {
    const dy = e.changedTouches[0].clientY - touchStartY;
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dy) < 10 && Math.abs(dx) < 10) { jump(); return; }
    if (Math.abs(dy) > Math.abs(dx)) {
      if (dy < -20) moveUp(); else moveDown();
    }
  }, { passive: true });

  canvas.addEventListener('click', () => {
    if (deadTimer >= 0) restart();
  });

  /* ── public API ───────────────────────────────────────────────────── */
  window.startRunner = function () {
    if (running) stopRunner();
    running = true;
    init();
    document.addEventListener('keydown', onKey);
    raf = requestAnimationFrame(loop);
  };

  window.stopRunner = function () {
    running = false;
    document.removeEventListener('keydown', onKey);
    cancelAnimationFrame(raf);
  };
})();
