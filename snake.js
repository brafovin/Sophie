/* ══ Snake ═══════════════════════════════════════════════════════════════ */
(function () {
  const canvas  = document.getElementById('snake-canvas');
  const ctx     = canvas.getContext('2d');
  const scoreEl = document.getElementById('snake-score');

  const COLS = 20, ROWS = 20;
  let CELL;
  let W, H;

  let raf, running = false;
  let snake, dir, nextDir, apple, score, speed, tickTimer;
  let dead, deadAlpha;
  let particles;
  let appleAnim;

  function resize() {
    const size = Math.min(300, window.innerWidth - 32);
    canvas.width  = size;
    canvas.height = size;
    W = H = size;
    CELL = size / COLS;
  }

  function init() {
    resize();
    const mid = Math.floor(COLS / 2);
    snake = [
      { x: mid,     y: mid },
      { x: mid - 1, y: mid },
      { x: mid - 2, y: mid },
    ];
    dir      = { x: 1, y: 0 };
    nextDir  = { x: 1, y: 0 };
    score    = 0;
    speed    = 150;
    tickTimer = 0;
    dead     = false;
    deadAlpha = 0;
    particles = [];
    appleAnim = 0;
    scoreEl.textContent = '0';
    placeApple();
  }

  function placeApple() {
    let pos;
    do {
      pos = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
    } while (snake.some(s => s.x === pos.x && s.y === pos.y));
    apple = pos;
  }

  function addParticles(gx, gy) {
    const cx = (gx + 0.5) * CELL, cy = (gy + 0.5) * CELL;
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd   = 2 + Math.random() * 3;
      particles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        life: 1,
        color: `hsl(${Math.random() < 0.5 ? 0 : 120},90%,60%)`
      });
    }
  }

  /* ── draw ─────────────────────────────────────────────────────────── */
  function drawBg() {
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0f172a');
    bg.addColorStop(1, '#1e1b4b');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // grid dots
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        ctx.beginPath();
        ctx.arc((c + 0.5) * CELL, (r + 0.5) * CELL, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawSnake() {
    snake.forEach((seg, i) => {
      const t = i / snake.length;
      const hue = 140 + t * 40;
      const px  = seg.x * CELL;
      const py  = seg.y * CELL;
      const pad = i === 0 ? 1 : 2;
      const sz  = CELL - pad * 2;

      const grad = ctx.createRadialGradient(
        px + pad + sz * 0.35, py + pad + sz * 0.3, sz * 0.05,
        px + pad + sz * 0.5,  py + pad + sz * 0.5, sz * 0.7
      );
      grad.addColorStop(0, `hsl(${hue},80%,70%)`);
      grad.addColorStop(1, `hsl(${hue},70%,30%)`);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(px + pad, py + pad, sz, sz, i === 0 ? sz * 0.4 : sz * 0.25);
      ctx.fill();

      // specular
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.ellipse(px + pad + sz * 0.32, py + pad + sz * 0.28, sz * 0.18, sz * 0.1, -0.5, 0, Math.PI * 2);
      ctx.fill();

      // eyes on head
      if (i === 0) {
        const ex = (dir.x === 1 ? 0.68 : dir.x === -1 ? 0.2 : 0.32);
        const ey = (dir.y === 1 ? 0.68 : dir.y === -1 ? 0.2 : 0.32);
        const ex2 = dir.x !== 0 ? ex : 0.68;
        const ey2 = dir.y !== 0 ? ey : 0.68;
        [{ fx: ex, fy: ey }, { fx: ex2, fy: ey2 }].forEach(e => {
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(px + pad + sz * e.fx, py + pad + sz * e.fy, sz * 0.14, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#111';
          ctx.beginPath();
          ctx.arc(px + pad + sz * e.fx + dir.x * sz * 0.03,
                  py + pad + sz * e.fy + dir.y * sz * 0.03,
                  sz * 0.07, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    });
  }

  function drawApple() {
    appleAnim += 0.08;
    const cx = (apple.x + 0.5) * CELL;
    const cy = (apple.y + 0.5) * CELL;
    const r  = CELL * 0.38 + Math.sin(appleAnim) * CELL * 0.04;

    // glow
    const glow = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r * 1.6);
    glow.addColorStop(0, 'rgba(239,68,68,0.35)');
    glow.addColorStop(1, 'rgba(239,68,68,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.6, 0, Math.PI * 2); ctx.fill();

    // apple body
    const ag = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.05, cx, cy, r);
    ag.addColorStop(0, '#fca5a5');
    ag.addColorStop(0.5, '#ef4444');
    ag.addColorStop(1, '#7f1d1d');
    ctx.fillStyle = ag;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();

    // shine
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.28, cy - r * 0.28, r * 0.22, r * 0.14, -0.6, 0, Math.PI * 2);
    ctx.fill();

    // stem
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.quadraticCurveTo(cx + r * 0.3, cy - r * 1.3, cx + r * 0.15, cy - r * 1.5);
    ctx.stroke();
  }

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

  function drawDead() {
    ctx.fillStyle = `rgba(0,0,0,${deadAlpha * 0.6})`;
    ctx.fillRect(0, 0, W, H);
    if (deadAlpha < 0.5) return;
    ctx.globalAlpha = Math.min(1, (deadAlpha - 0.5) * 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ef4444';
    ctx.font = `bold ${Math.round(CELL * 1.5)}px sans-serif`;
    ctx.fillText('💀 Game Over', W / 2, H / 2 - CELL * 0.8);
    ctx.fillStyle = '#fff';
    ctx.font = `${Math.round(CELL * 0.8)}px sans-serif`;
    ctx.fillText(`Punkte: ${score}`, W / 2, H / 2 + CELL * 0.3);
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = `${Math.round(CELL * 0.65)}px sans-serif`;
    ctx.fillText('Tippe zum Neustart', W / 2, H / 2 + CELL * 1.3);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  /* ── game tick ────────────────────────────────────────────────────── */
  let lastTime = 0;
  function loop(ts) {
    if (!running) return;
    raf = requestAnimationFrame(loop);

    const dt = ts - lastTime;
    lastTime = ts;

    if (dead) {
      deadAlpha = Math.min(1, deadAlpha + 0.035);
      particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vx *= 0.9; p.vy *= 0.9; p.life -= 0.04; });
      particles = particles.filter(p => p.life > 0);
      drawBg(); drawSnake(); drawApple(); drawParticles(); drawDead();
      return;
    }

    tickTimer += dt;
    if (tickTimer >= speed) {
      tickTimer -= speed;
      tick();
    }

    drawBg();
    drawApple();
    drawSnake();
    drawParticles();
  }

  function tick() {
    dir = { ...nextDir };
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    // wall wrap
    head.x = (head.x + COLS) % COLS;
    head.y = (head.y + ROWS) % ROWS;

    // self collision
    if (snake.some(s => s.x === head.x && s.y === head.y)) {
      addParticles(snake[0].x, snake[0].y);
      dead = true;
      return;
    }

    snake.unshift(head);

    if (head.x === apple.x && head.y === apple.y) {
      score += 10;
      scoreEl.textContent = score;
      addParticles(apple.x, apple.y);
      placeApple();
      speed = Math.max(60, speed - 3);
    } else {
      snake.pop();
    }
  }

  /* ── input ────────────────────────────────────────────────────────── */
  function setDir(dx, dy) {
    if (dead) { init(); return; }
    if (dx === -dir.x && dy === -dir.y) return; // no 180
    nextDir = { x: dx, y: dy };
  }

  document.getElementById('sn-up').addEventListener('click',    () => setDir(0, -1));
  document.getElementById('sn-down').addEventListener('click',  () => setDir(0,  1));
  document.getElementById('sn-left').addEventListener('click',  () => setDir(-1, 0));
  document.getElementById('sn-right').addEventListener('click', () => setDir(1,  0));

  function onKey(e) {
    const map = { ArrowUp:[0,-1], ArrowDown:[0,1], ArrowLeft:[-1,0], ArrowRight:[1,0],
                  w:[0,-1], s:[0,1], a:[-1,0], d:[1,0] };
    if (map[e.key]) { e.preventDefault(); setDir(...map[e.key]); }
  }

  let swipeX = 0, swipeY = 0;
  canvas.addEventListener('touchstart', e => {
    swipeX = e.touches[0].clientX; swipeY = e.touches[0].clientY;
  }, { passive: true });
  canvas.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - swipeX;
    const dy = e.changedTouches[0].clientY - swipeY;
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) { if (dead) init(); return; }
    if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? 1 : -1, 0);
    else setDir(0, dy > 0 ? 1 : -1);
  }, { passive: true });

  canvas.addEventListener('click', () => { if (dead) init(); });

  /* ── public API ───────────────────────────────────────────────────── */
  window.startSnake = function () {
    if (running) stopSnake();
    running = true;
    lastTime = 0;
    init();
    document.addEventListener('keydown', onKey);
    raf = requestAnimationFrame(loop);
  };

  window.stopSnake = function () {
    running = false;
    document.removeEventListener('keydown', onKey);
    cancelAnimationFrame(raf);
  };
})();
