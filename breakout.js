/* ══ Breakout ════════════════════════════════════════════════════════════ */
(function () {
  const canvas  = document.getElementById('breakout-canvas');
  const ctx     = canvas.getContext('2d');
  const scoreEl = document.getElementById('breakout-score');
  const livesEl = document.getElementById('breakout-lives');

  const W = 360, H = 480;
  canvas.width  = W;
  canvas.height = H;

  const ROWS = 6, COLS = 8;
  const BRICK_W = 38, BRICK_H = 16, BRICK_GAP = 3;
  const BRICK_OFFSET_X = 10, BRICK_OFFSET_Y = 52;

  const PADDLE_H = 12, PADDLE_W = 72;
  const BALL_R = 8;
  const MAX_LIVES = 3;

  const COLORS = [
    '#ef4444', '#f97316', '#eab308',
    '#22c55e', '#3b82f6', '#a855f7',
  ];

  let raf, running = false;
  let bricks, ball, paddle;
  let score, lives, state; // state: 'ready'|'playing'|'dead'|'win'|'gameover'
  let particles, flashTimer;

  /* ── init ─────────────────────────────────────────────────────────── */
  function init() {
    bricks = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        bricks.push({
          x: BRICK_OFFSET_X + c * (BRICK_W + BRICK_GAP),
          y: BRICK_OFFSET_Y + r * (BRICK_H + BRICK_GAP),
          color: COLORS[r],
          hp: r < 2 ? 2 : 1,
          alive: true,
          shake: 0,
        });
      }
    }
    paddle = { x: W / 2, y: H - 36, w: PADDLE_W };
    ball = resetBall();
    score = 0;
    lives = MAX_LIVES;
    state = 'ready';
    particles = [];
    flashTimer = 0;
    scoreEl.textContent = '0';
    updateLives();
  }

  function resetBall() {
    return {
      x: paddle.x,
      y: paddle.y - PADDLE_H / 2 - BALL_R - 2,
      vx: 3.5 * (Math.random() < 0.5 ? 1 : -1),
      vy: -4,
      trail: [],
    };
  }

  function updateLives() {
    livesEl.textContent = '❤️'.repeat(lives);
  }

  /* ── particles ────────────────────────────────────────────────────── */
  function burst(x, y, color, n = 10) {
    for (let i = 0; i < n; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd   = 2 + Math.random() * 4;
      particles.push({
        x, y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        life: 1, color,
        r: 2 + Math.random() * 3,
      });
    }
  }

  /* ── draw ─────────────────────────────────────────────────────────── */
  function drawBg() {
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0f0f1a');
    bg.addColorStop(1, '#1a0a2e');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // flash overlay on line clear
    if (flashTimer > 0) {
      ctx.fillStyle = `rgba(255,255,255,${flashTimer / 20 * 0.25})`;
      ctx.fillRect(0, 0, W, H);
      flashTimer--;
    }
  }

  function drawBricks() {
    bricks.forEach(b => {
      if (!b.alive) return;
      if (b.shake > 0) b.shake *= 0.7;

      const sx = b.shake > 0.5 ? (Math.random() - 0.5) * b.shake : 0;
      const bx = b.x + sx;

      const grad = ctx.createLinearGradient(bx, b.y, bx, b.y + BRICK_H);
      grad.addColorStop(0, lightenHex(b.color, 40));
      grad.addColorStop(1, b.color);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(bx, b.y, BRICK_W, BRICK_H, 4);
      ctx.fill();

      // hp indicator (thick brick = 2 hp)
      if (b.hp === 2) {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(bx + 2, b.y + 2, BRICK_W - 4, BRICK_H - 4, 3);
        ctx.stroke();
      }

      // specular
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.beginPath();
      ctx.roundRect(bx + 4, b.y + 2, BRICK_W - 8, 4, 2);
      ctx.fill();
    });
  }

  function drawPaddle() {
    const px = paddle.x - paddle.w / 2;
    const py = paddle.y - PADDLE_H / 2;

    ctx.shadowColor = '#818cf8';
    ctx.shadowBlur  = 14;
    const pg = ctx.createLinearGradient(px, py, px, py + PADDLE_H);
    pg.addColorStop(0, '#a5b4fc');
    pg.addColorStop(1, '#4f46e5');
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.roundRect(px, py, paddle.w, PADDLE_H, 6);
    ctx.fill();
    ctx.shadowBlur = 0;

    // gloss
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.roundRect(px + 6, py + 2, paddle.w - 12, 4, 2);
    ctx.fill();
  }

  function drawBall() {
    // trail
    ball.trail.forEach((pt, i) => {
      ctx.globalAlpha = (i / ball.trail.length) * 0.4;
      ctx.fillStyle = '#a5b4fc';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, BALL_R * 0.7 * (i / ball.trail.length), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    ctx.shadowColor = '#c4b5fd';
    ctx.shadowBlur  = 16;
    const bg = ctx.createRadialGradient(ball.x - 2, ball.y - 3, 1, ball.x, ball.y, BALL_R);
    bg.addColorStop(0, '#e9d5ff');
    bg.addColorStop(0.5, '#a855f7');
    bg.addColorStop(1, '#5b21b6');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function drawParticles() {
    particles.forEach(p => {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function drawOverlay(title, sub, color) {
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText(title, W / 2, H / 2 - 24);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '16px sans-serif';
    ctx.fillText(sub, W / 2, H / 2 + 12);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '13px sans-serif';
    ctx.fillText('Tippe zum Neustart', W / 2, H / 2 + 42);
    ctx.textAlign = 'left';
  }

  function drawReadyText() {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '14px sans-serif';
    ctx.fillText('Tippe / klicke zum Starten', W / 2, H - 14);
    ctx.textAlign = 'left';
  }

  /* ── update ───────────────────────────────────────────────────────── */
  function update() {
    if (state !== 'playing') return;

    // trail
    ball.trail.push({ x: ball.x, y: ball.y });
    if (ball.trail.length > 10) ball.trail.shift();

    ball.x += ball.vx;
    ball.y += ball.vy;

    // wall bounce
    if (ball.x - BALL_R < 0)     { ball.x = BALL_R;     ball.vx = Math.abs(ball.vx); }
    if (ball.x + BALL_R > W)     { ball.x = W - BALL_R; ball.vx = -Math.abs(ball.vx); }
    if (ball.y - BALL_R < 0)     { ball.y = BALL_R;     ball.vy = Math.abs(ball.vy); }

    // paddle hit
    const px = paddle.x - paddle.w / 2;
    const py = paddle.y - PADDLE_H / 2;
    if (
      ball.vy > 0 &&
      ball.y + BALL_R >= py &&
      ball.y - BALL_R <= py + PADDLE_H &&
      ball.x >= px - BALL_R &&
      ball.x <= px + paddle.w + BALL_R
    ) {
      const rel = (ball.x - paddle.x) / (paddle.w / 2); // -1 to 1
      const angle = rel * (Math.PI / 3);
      const spd = Math.hypot(ball.vx, ball.vy);
      ball.vx = Math.sin(angle) * spd;
      ball.vy = -Math.abs(Math.cos(angle) * spd);
      ball.y  = py - BALL_R - 1;
    }

    // bottom — lose life
    if (ball.y - BALL_R > H) {
      lives--;
      updateLives();
      if (lives <= 0) { state = 'gameover'; return; }
      ball = resetBall();
      ball.x = paddle.x;
      state = 'ready';
      return;
    }

    // brick collision
    let hit = false;
    for (const b of bricks) {
      if (!b.alive) continue;
      if (
        ball.x + BALL_R > b.x &&
        ball.x - BALL_R < b.x + BRICK_W &&
        ball.y + BALL_R > b.y &&
        ball.y - BALL_R < b.y + BRICK_H
      ) {
        b.hp--;
        b.shake = 6;
        if (b.hp <= 0) {
          b.alive = false;
          burst(b.x + BRICK_W / 2, b.y + BRICK_H / 2, b.color);
          score += 10;
          scoreEl.textContent = score;
          flashTimer = 8;
        }
        // reflect
        const ballCX = ball.x, ballCY = ball.y;
        const bCX = b.x + BRICK_W / 2, bCY = b.y + BRICK_H / 2;
        const overlapX = BRICK_W / 2 + BALL_R - Math.abs(ballCX - bCX);
        const overlapY = BRICK_H / 2 + BALL_R - Math.abs(ballCY - bCY);
        if (overlapX < overlapY) ball.vx *= -1; else ball.vy *= -1;
        hit = true;
        break;
      }
    }

    // speed cap
    const spd = Math.hypot(ball.vx, ball.vy);
    if (spd > 10) { ball.vx *= 10 / spd; ball.vy *= 10 / spd; }
    if (spd < 4)  { ball.vx *= 4 / spd;  ball.vy *= 4 / spd; }

    // win
    if (bricks.every(b => !b.alive)) state = 'win';
  }

  /* ── tiny helpers ────────────────────────────────────────────────── */
  function lightenHex(hex, amt) {
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);
    r = Math.min(255, r + amt); g = Math.min(255, g + amt); b = Math.min(255, b + amt);
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  }

  /* ── main loop ────────────────────────────────────────────────────── */
  function loop() {
    if (!running) return;
    raf = requestAnimationFrame(loop);

    particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vx *= 0.93; p.vy *= 0.93; p.life -= 0.03; });
    particles = particles.filter(p => p.life > 0);

    update();

    drawBg();
    drawBricks();
    drawParticles();
    drawPaddle();
    drawBall();

    if (state === 'ready')    drawReadyText();
    if (state === 'gameover') drawOverlay('💔 Game Over', `Punkte: ${score}`, '#ef4444');
    if (state === 'win')      drawOverlay('🎉 Gewonnen!', `Punkte: ${score}`, '#fbbf24');
  }

  /* ── input ────────────────────────────────────────────────────────── */
  function setPaddleFromClient(clientX) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = W / rect.width;
    const x = (clientX - rect.left) * scaleX;
    paddle.x = Math.max(paddle.w / 2, Math.min(W - paddle.w / 2, x));
    if (state === 'ready') { ball.x = paddle.x; }
  }

  canvas.addEventListener('mousemove', e => setPaddleFromClient(e.clientX));
  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    setPaddleFromClient(e.touches[0].clientX);
  }, { passive: false });

  canvas.addEventListener('click', () => {
    if (state === 'ready')    { state = 'playing'; return; }
    if (state === 'gameover' || state === 'win') init();
  });
  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    if (state === 'ready')    { state = 'playing'; return; }
    if (state === 'gameover' || state === 'win') init();
  }, { passive: false });

  function onKey(e) {
    if (e.key === ' ' || e.key === 'Enter') {
      if (state === 'ready')    { state = 'playing'; return; }
      if (state === 'gameover' || state === 'win') init();
    }
    const step = 20;
    if (e.key === 'ArrowLeft')  paddle.x = Math.max(paddle.w / 2, paddle.x - step);
    if (e.key === 'ArrowRight') paddle.x = Math.min(W - paddle.w / 2, paddle.x + step);
    if (state === 'ready') ball.x = paddle.x;
  }

  /* ── public API ───────────────────────────────────────────────────── */
  window.startBreakout = function () {
    if (running) stopBreakout();
    running = true;
    init();
    document.addEventListener('keydown', onKey);
    raf = requestAnimationFrame(loop);
  };

  window.stopBreakout = function () {
    running = false;
    document.removeEventListener('keydown', onKey);
    cancelAnimationFrame(raf);
  };
})();
