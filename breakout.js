/* ══ Breakout — Deep Space Edition ════════════════════════════════════ */
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

  // Row theme from top to bottom
  const ROW_THEMES = [
    { name:'plasma',  color:'#ff22ff', glow:'#ff88ff', accent:'#ffccff', hp:2 },
    { name:'energy',  color:'#00ffcc', glow:'#00ffaa', accent:'#aaffee', hp:2 },
    { name:'crystal', color:'#a855f7', glow:'#c084fc', accent:'#e9d5ff', hp:1 },
    { name:'ice',     color:'#7dd3fc', glow:'#38bdf8', accent:'#f0f9ff', hp:1 },
    { name:'metal',   color:'#94a3b8', glow:'#e2e8f0', accent:'#f8fafc', hp:1 },
    { name:'lava',    color:'#f97316', glow:'#fb923c', accent:'#fed7aa', hp:1 },
  ];

  function mulberry32(seed) {
    return () => {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let z = Math.imul(seed ^ seed >>> 15, 1 | seed);
      z = z + Math.imul(z ^ z >>> 7, 61 | z) ^ z;
      return ((z ^ z >>> 14) >>> 0) / 4294967296;
    };
  }

  let raf, running = false, frame = 0;
  let bricks, ball, paddle;
  let score, lives, state;
  let particles, flashTimer;
  let stars, nebulaOff;

  /* ── background init ───────────────────────────────────────────────── */
  function initSpace() {
    const rng = mulberry32(77);
    stars = [];
    for (let i = 0; i < 130; i++) {
      const fast = rng() < 0.12;
      stars.push({
        x: rng() * W,
        y: rng() * H,
        r: fast ? rng() * 1.2 + 0.8 : rng() * 1.0 + 0.2,
        speed: fast ? rng() * 0.9 + 0.5 : rng() * 0.25 + 0.04,
        alpha: rng() * 0.6 + 0.25,
        hue: rng() < 0.25 ? 200 + rng() * 60 : -1,
        twinkle: rng() * Math.PI * 2,
      });
    }

    // Nebula on offscreen canvas (static, rendered once)
    nebulaOff = document.createElement('canvas');
    nebulaOff.width = W; nebulaOff.height = H;
    const nc = nebulaOff.getContext('2d');
    const clouds = [
      { x: W*0.28, y: H*0.18, r:110, h:285, s:80, l:25 },
      { x: W*0.72, y: H*0.12, r: 85, h:215, s:75, l:22 },
      { x: W*0.5,  y: H*0.38, r:130, h:245, s:78, l:20 },
      { x: W*0.15, y: H*0.55, r: 75, h:310, s:70, l:18 },
      { x: W*0.82, y: H*0.62, r: 95, h:195, s:82, l:21 },
      { x: W*0.45, y: H*0.72, r: 60, h:160, s:65, l:15 },
    ];
    for (const n of clouds) {
      const g = nc.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
      g.addColorStop(0,   `hsla(${n.h},${n.s}%,${n.l}%,0.28)`);
      g.addColorStop(0.45,`hsla(${n.h},${n.s}%,${n.l}%,0.09)`);
      g.addColorStop(1,   `hsla(${n.h},${n.s}%,${n.l}%,0)`);
      nc.fillStyle = g;
      nc.fillRect(n.x - n.r, n.y - n.r, n.r*2, n.r*2);
    }
  }

  /* ── game init ─────────────────────────────────────────────────────── */
  function init() {
    frame = 0;
    bricks = [];
    for (let r = 0; r < ROWS; r++) {
      const theme = ROW_THEMES[r];
      for (let c = 0; c < COLS; c++) {
        bricks.push({
          x: BRICK_OFFSET_X + c * (BRICK_W + BRICK_GAP),
          y: BRICK_OFFSET_Y + r * (BRICK_H + BRICK_GAP),
          theme,
          hp: theme.hp, maxHp: theme.hp,
          alive: true,
          shake: 0,
          pulse: Math.random() * Math.PI * 2,
        });
      }
    }
    paddle = { x: W / 2, y: H - 36, w: PADDLE_W, scanPhase: 0 };
    ball = resetBall();
    score = 0; lives = MAX_LIVES; state = 'ready';
    particles = []; flashTimer = 0;
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

  function updateLives() { livesEl.textContent = '❤️'.repeat(lives); }

  /* ── particles ─────────────────────────────────────────────────────── */
  function burst(x, y, theme, n = 14) {
    for (let i = 0; i < n; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd   = 1.5 + Math.random() * 5.5;
      particles.push({
        x, y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        life: 1,
        color: Math.random() < 0.55 ? theme.color : theme.accent,
        glow:  theme.glow,
        r: 1.5 + Math.random() * 3,
      });
    }
    // Central bright flash
    particles.push({ x, y, vx: 0, vy: 0, life: 1, color: '#ffffff', glow: theme.glow, r: 5 });
  }

  /* ── draw background ───────────────────────────────────────────────── */
  function drawBg() {
    ctx.fillStyle = '#00000a';
    ctx.fillRect(0, 0, W, H);

    // Static nebula
    ctx.drawImage(nebulaOff, 0, 0);

    // Scrolling stars
    for (const s of stars) {
      s.y += s.speed;
      if (s.y > H + 2) { s.y = -2; s.x = Math.random() * W; }
      s.twinkle += 0.035;
      const tw = 0.72 + 0.28 * Math.sin(s.twinkle);
      ctx.globalAlpha = s.alpha * tw;
      if (s.hue >= 0) {
        ctx.fillStyle = `hsl(${s.hue},65%,92%)`;
      } else {
        ctx.fillStyle = '#ffffff';
      }
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();

      // Speed streak for fast stars
      if (s.speed > 0.4) {
        ctx.globalAlpha = s.alpha * 0.18;
        ctx.strokeStyle = s.hue >= 0 ? `hsl(${s.hue},60%,88%)` : '#aac8ff';
        ctx.lineWidth = s.r * 0.7;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y - s.speed * 7);
        ctx.lineTo(s.x, s.y);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // White flash on brick break
    if (flashTimer > 0) {
      ctx.fillStyle = `rgba(255,255,255,${flashTimer / 18 * 0.2})`;
      ctx.fillRect(0, 0, W, H);
      flashTimer--;
    }
  }

  /* ── draw bricks ───────────────────────────────────────────────────── */
  function drawBricks() {
    for (const b of bricks) {
      if (!b.alive) continue;
      if (b.shake > 0) b.shake *= 0.68;
      b.pulse += 0.05;

      const sx = b.shake > 0.5 ? (Math.random() - 0.5) * b.shake : 0;
      const bx = b.x + sx;
      const { theme } = b;
      const damaged = b.hp < b.maxHp;
      const pulseA = 0.25 + 0.18 * Math.sin(b.pulse);

      // Outer glow
      ctx.shadowColor = theme.glow;
      ctx.shadowBlur  = damaged ? 22 : (theme.hp === 2 ? 10 : 6);

      // Body gradient
      const gr = ctx.createLinearGradient(bx, b.y, bx, b.y + BRICK_H);
      gr.addColorStop(0,   theme.accent);
      gr.addColorStop(0.38,theme.color);
      gr.addColorStop(1,   shadeColor(theme.color, -45));
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.roundRect(bx, b.y, BRICK_W, BRICK_H, 3);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Inner border glow (double-hp bricks only, un-damaged)
      if (b.maxHp >= 2 && !damaged) {
        ctx.strokeStyle = `rgba(255,255,255,${pulseA})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(bx + 1.5, b.y + 1.5, BRICK_W - 3, BRICK_H - 3, 2);
        ctx.stroke();
      }

      // Damage cracks
      if (damaged) {
        ctx.save();
        ctx.beginPath(); ctx.roundRect(bx, b.y, BRICK_W, BRICK_H, 3); ctx.clip();
        ctx.strokeStyle = 'rgba(0,0,0,0.65)';
        ctx.lineWidth = 1.5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(bx + BRICK_W*0.28, b.y+2); ctx.lineTo(bx + BRICK_W*0.52, b.y+BRICK_H-2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx + BRICK_W*0.58, b.y+3); ctx.lineTo(bx + BRICK_W*0.78, b.y+BRICK_H-3); ctx.stroke();
        // Energy leak
        ctx.fillStyle = `rgba(255,120,0,${0.35 + 0.25*Math.sin(b.pulse*2.2)})`;
        ctx.beginPath(); ctx.arc(bx + BRICK_W*0.4, b.y + BRICK_H/2, 2.5, 0, Math.PI*2); ctx.fill();
        ctx.restore();
      }

      // Specular highlight
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.beginPath();
      ctx.roundRect(bx + 3, b.y + 1.5, BRICK_W - 6, 3.5, 2);
      ctx.fill();

      // Row-specific detail
      if (theme.name === 'metal') {
        // Rivets
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath(); ctx.arc(bx + 6,  b.y + BRICK_H/2, 1.5, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(bx + BRICK_W - 6, b.y + BRICK_H/2, 1.5, 0, Math.PI*2); ctx.fill();
      } else if (theme.name === 'lava') {
        // Glowing veins
        ctx.strokeStyle = `rgba(255,200,0,${0.3 + 0.2*Math.sin(b.pulse)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(bx + 8, b.y + BRICK_H - 4);
        ctx.bezierCurveTo(bx + BRICK_W*0.4, b.y + 3, bx + BRICK_W*0.6, b.y + BRICK_H - 3, bx + BRICK_W - 8, b.y + 4);
        ctx.stroke();
      } else if (theme.name === 'ice') {
        // Ice facets
        ctx.strokeStyle = 'rgba(180,240,255,0.35)';
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(bx + BRICK_W*0.5, b.y); ctx.lineTo(bx + BRICK_W*0.35, b.y + BRICK_H); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx + BRICK_W*0.65, b.y); ctx.lineTo(bx + BRICK_W*0.8, b.y + BRICK_H); ctx.stroke();
      }
    }
  }

  /* ── draw paddle ───────────────────────────────────────────────────── */
  function drawPaddle() {
    frame++;
    paddle.scanPhase = (paddle.scanPhase + 0.055) % (Math.PI * 2);
    const px = paddle.x - paddle.w / 2;
    const py = paddle.y - PADDLE_H / 2;

    // Outer energy field glow
    ctx.shadowColor = '#00d8ff';
    ctx.shadowBlur = 26;

    const pg = ctx.createLinearGradient(px, py, px, py + PADDLE_H);
    pg.addColorStop(0,   '#aaf0ff');
    pg.addColorStop(0.3, '#00c8e8');
    pg.addColorStop(1,   '#004a90');
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.roundRect(px, py, paddle.w, PADDLE_H, 5);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Energy scan sweep
    const scanX = px + paddle.w * (0.5 + 0.5 * Math.sin(paddle.scanPhase));
    const scanG = ctx.createLinearGradient(scanX - 14, 0, scanX + 14, 0);
    scanG.addColorStop(0, 'rgba(255,255,255,0)');
    scanG.addColorStop(0.5, 'rgba(255,255,255,0.85)');
    scanG.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save();
    ctx.beginPath(); ctx.roundRect(px, py, paddle.w, PADDLE_H, 5); ctx.clip();
    ctx.fillStyle = scanG;
    ctx.fillRect(scanX - 14, py, 28, PADDLE_H);
    ctx.restore();

    // Edge nodes
    ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 10;
    ctx.fillStyle = '#aaffff';
    ctx.beginPath(); ctx.arc(px + 5, py + PADDLE_H/2, 2.5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(px + paddle.w - 5, py + PADDLE_H/2, 2.5, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;
  }

  /* ── draw ball ─────────────────────────────────────────────────────── */
  function drawBall() {
    ball.trail.push({ x: ball.x, y: ball.y });
    if (ball.trail.length > 16) ball.trail.shift();

    // Long plasma trail
    for (let i = 0; i < ball.trail.length; i++) {
      const t = (i + 1) / ball.trail.length;
      const pt = ball.trail[i];
      ctx.globalAlpha = t * t * 0.55;
      ctx.shadowColor = '#cc00ff';
      ctx.shadowBlur = 12 * t;
      const tg = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, BALL_R * t * 0.9);
      tg.addColorStop(0, '#ff88ff');
      tg.addColorStop(0.5, '#9900ff');
      tg.addColorStop(1, 'rgba(50,0,120,0)');
      ctx.fillStyle = tg;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, BALL_R * t * 0.9, 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;

    // Ball
    ctx.shadowColor = '#ff00ff';
    ctx.shadowBlur = 24;
    const bg = ctx.createRadialGradient(ball.x - 2.5, ball.y - 3, 0.5, ball.x, ball.y, BALL_R);
    bg.addColorStop(0, '#ffffff');
    bg.addColorStop(0.25, '#ffaaff');
    bg.addColorStop(0.6, '#cc00ff');
    bg.addColorStop(1, '#330055');
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;
  }

  /* ── draw particles ────────────────────────────────────────────────── */
  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = p.life;
      ctx.shadowColor = p.glow;
      ctx.shadowBlur = 10 * p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.5, p.r * p.life), 0, Math.PI*2);
      ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }

  /* ── overlays ──────────────────────────────────────────────────────── */
  function drawOverlay(title, sub, color) {
    // Scanlines
    for (let y = 0; y < H; y += 4) {
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(0, y, W, 1);
    }
    ctx.fillStyle = 'rgba(0,0,15,0.78)';
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.shadowColor = color; ctx.shadowBlur = 24;
    ctx.fillStyle = color;
    ctx.font = 'bold 34px monospace';
    ctx.fillText(title, W/2, H/2 - 28);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px monospace';
    ctx.fillText(sub, W/2, H/2 + 8);

    ctx.fillStyle = 'rgba(180,220,255,0.5)';
    ctx.font = '11px monospace';
    ctx.fillText('[ Tippe zum Neustart ]', W/2, H/2 + 38);
    ctx.textAlign = 'left';
  }

  function drawReadyText() {
    ctx.textAlign = 'center';
    ctx.shadowColor = '#00aaff'; ctx.shadowBlur = 10;
    ctx.fillStyle = 'rgba(160,220,255,0.9)';
    ctx.font = '12px monospace';
    ctx.fillText('[ Tippe / Klicke zum Start ]', W/2, H - 14);
    ctx.shadowBlur = 0; ctx.textAlign = 'left';
  }

  /* ── update ────────────────────────────────────────────────────────── */
  function update() {
    if (state !== 'playing') return;

    ball.x += ball.vx;
    ball.y += ball.vy;

    if (ball.x - BALL_R < 0)    { ball.x = BALL_R;     ball.vx =  Math.abs(ball.vx); }
    if (ball.x + BALL_R > W)    { ball.x = W - BALL_R; ball.vx = -Math.abs(ball.vx); }
    if (ball.y - BALL_R < 0)    { ball.y = BALL_R;     ball.vy =  Math.abs(ball.vy); }

    // Paddle
    const px = paddle.x - paddle.w / 2;
    const py = paddle.y - PADDLE_H / 2;
    if (
      ball.vy > 0 &&
      ball.y + BALL_R >= py &&
      ball.y - BALL_R <= py + PADDLE_H &&
      ball.x >= px - BALL_R &&
      ball.x <= px + paddle.w + BALL_R
    ) {
      const rel   = (ball.x - paddle.x) / (paddle.w / 2);
      const angle = rel * (Math.PI / 3);
      const spd   = Math.hypot(ball.vx, ball.vy);
      ball.vx = Math.sin(angle) * spd;
      ball.vy = -Math.abs(Math.cos(angle) * spd);
      ball.y  = py - BALL_R - 1;
    }

    // Bottom — lose life
    if (ball.y - BALL_R > H) {
      lives--; updateLives();
      if (lives <= 0) { state = 'gameover'; return; }
      ball = resetBall(); ball.x = paddle.x; state = 'ready'; return;
    }

    // Brick collision
    for (const b of bricks) {
      if (!b.alive) continue;
      if (
        ball.x + BALL_R > b.x && ball.x - BALL_R < b.x + BRICK_W &&
        ball.y + BALL_R > b.y && ball.y - BALL_R < b.y + BRICK_H
      ) {
        b.hp--; b.shake = 9;
        if (b.hp <= 0) {
          b.alive = false;
          burst(b.x + BRICK_W/2, b.y + BRICK_H/2, b.theme, 16);
          score += b.maxHp >= 2 ? 20 : 10;
          scoreEl.textContent = score;
          flashTimer = 12;
        }
        const overlapX = BRICK_W/2 + BALL_R - Math.abs(ball.x - (b.x + BRICK_W/2));
        const overlapY = BRICK_H/2 + BALL_R - Math.abs(ball.y - (b.y + BRICK_H/2));
        if (overlapX < overlapY) ball.vx *= -1; else ball.vy *= -1;
        break;
      }
    }

    // Speed limits
    const spd = Math.hypot(ball.vx, ball.vy);
    if (spd > 10) { ball.vx *= 10/spd; ball.vy *= 10/spd; }
    if (spd < 4)  { ball.vx *=  4/spd; ball.vy *=  4/spd; }

    if (bricks.every(b => !b.alive)) state = 'win';
  }

  /* ── helper ────────────────────────────────────────────────────────── */
  function shadeColor(hex, amt) {
    let r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    r = Math.max(0, Math.min(255, r+amt));
    g = Math.max(0, Math.min(255, g+amt));
    b = Math.max(0, Math.min(255, b+amt));
    return '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
  }

  /* ── main loop ─────────────────────────────────────────────────────── */
  function loop() {
    if (!running) return;
    raf = requestAnimationFrame(loop);

    for (const p of particles) { p.x+=p.vx; p.y+=p.vy; p.vx*=0.91; p.vy*=0.91; p.life-=0.024; }
    particles = particles.filter(p => p.life > 0);

    update();

    drawBg();
    drawBricks();
    drawParticles();
    drawPaddle();
    drawBall();

    if (state === 'ready')    drawReadyText();
    if (state === 'gameover') drawOverlay('GAME OVER', `Punkte: ${score}`, '#ff4444');
    if (state === 'win')      drawOverlay('VICTORY!',  `Punkte: ${score}`, '#00ffcc');
  }

  /* ── input ─────────────────────────────────────────────────────────── */
  function setPaddleFromClient(clientX) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (W / rect.width);
    paddle.x = Math.max(paddle.w/2, Math.min(W - paddle.w/2, x));
    if (state === 'ready') ball.x = paddle.x;
  }

  canvas.addEventListener('mousemove', e => setPaddleFromClient(e.clientX));
  canvas.addEventListener('touchmove', e => { e.preventDefault(); setPaddleFromClient(e.touches[0].clientX); }, { passive: false });

  canvas.addEventListener('click', () => {
    if (state === 'ready') { state = 'playing'; return; }
    if (state === 'gameover' || state === 'win') init();
  });
  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    if (state === 'ready') { state = 'playing'; return; }
    if (state === 'gameover' || state === 'win') init();
  }, { passive: false });

  function onKey(e) {
    if (e.key === ' ' || e.key === 'Enter') {
      if (state === 'ready') { state = 'playing'; return; }
      if (state === 'gameover' || state === 'win') init();
    }
    if (e.key === 'ArrowLeft')  paddle.x = Math.max(paddle.w/2, paddle.x - 20);
    if (e.key === 'ArrowRight') paddle.x = Math.min(W - paddle.w/2, paddle.x + 20);
    if (state === 'ready') ball.x = paddle.x;
  }

  /* ── public API ────────────────────────────────────────────────────── */
  window.startBreakout = function () {
    if (running) stopBreakout();
    running = true;
    initSpace();
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
