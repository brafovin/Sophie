/* ══ Planet Smash ════════════════════════════════════════════════════════ */
(function () {
  const canvas  = document.getElementById('planet-canvas');
  const ctx     = canvas.getContext('2d');
  const scoreEl = document.getElementById('planet-score');
  const resetBtn = document.getElementById('planet-reset');

  const SIZE = 300;
  canvas.width  = SIZE;
  canvas.height = SIZE;
  const CX = SIZE / 2, CY = SIZE / 2;
  const PLANET_R = 108;

  let running = false, raf;
  let weapon = 'missile';
  let craters, projectiles, particles, shakeTimer, shakeAmt;
  let hp, planetSeed;
  let planetOffscreen;
  let frame = 0;

  /* ── weapon select ────────────────────────────────────────────────── */
  document.querySelectorAll('.weapon-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.weapon-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      weapon = btn.dataset.weapon;
    });
  });

  resetBtn.addEventListener('click', () => { buildPlanet(); craters = []; hp = 100; updateScore(); });

  /* ── planet texture ───────────────────────────────────────────────── */
  function buildPlanet() {
    planetSeed = Math.random() * 9999 | 0;
    planetOffscreen = document.createElement('canvas');
    planetOffscreen.width  = SIZE;
    planetOffscreen.height = SIZE;
    const pc = planetOffscreen.getContext('2d');

    // base ocean
    const hue = Math.floor(Math.random() * 360);
    const ocean = pc.createRadialGradient(CX - 30, CY - 30, 10, CX, CY, PLANET_R);
    ocean.addColorStop(0,   `hsl(${hue},60%,55%)`);
    ocean.addColorStop(0.5, `hsl(${hue},55%,38%)`);
    ocean.addColorStop(1,   `hsl(${hue},50%,22%)`);
    pc.fillStyle = ocean;
    pc.beginPath(); pc.arc(CX, CY, PLANET_R, 0, Math.PI * 2); pc.fill();

    // continent blobs
    const rng = mulberry32(planetSeed);
    pc.fillStyle = `hsl(${(hue + 90) % 360},50%,42%)`;
    for (let i = 0; i < 8; i++) {
      const angle = rng() * Math.PI * 2;
      const dist  = rng() * PLANET_R * 0.7;
      const bx    = CX + Math.cos(angle) * dist;
      const by    = CY + Math.sin(angle) * dist;
      const br    = 18 + rng() * 32;
      pc.beginPath();
      pc.arc(bx, by, br, 0, Math.PI * 2);
      pc.fill();
    }

    // clip to circle
    pc.globalCompositeOperation = 'destination-in';
    pc.beginPath(); pc.arc(CX, CY, PLANET_R, 0, Math.PI * 2); pc.fill();
    pc.globalCompositeOperation = 'source-over';

    // ice caps
    pc.fillStyle = 'rgba(220,240,255,0.55)';
    pc.beginPath(); pc.arc(CX, CY - PLANET_R + 14, 26, 0, Math.PI * 2); pc.fill();
    pc.beginPath(); pc.arc(CX, CY + PLANET_R - 14, 20, 0, Math.PI * 2); pc.fill();

    // atmosphere rim
    const atm = pc.createRadialGradient(CX, CY, PLANET_R * 0.85, CX, CY, PLANET_R);
    atm.addColorStop(0, 'rgba(150,210,255,0)');
    atm.addColorStop(1, 'rgba(100,180,255,0.45)');
    pc.fillStyle = atm;
    pc.beginPath(); pc.arc(CX, CY, PLANET_R, 0, Math.PI * 2); pc.fill();

    // specular
    const spec = pc.createRadialGradient(CX - 38, CY - 38, 4, CX - 28, CY - 28, 65);
    spec.addColorStop(0, 'rgba(255,255,255,0.35)');
    spec.addColorStop(1, 'rgba(255,255,255,0)');
    pc.fillStyle = spec;
    pc.beginPath(); pc.arc(CX, CY, PLANET_R, 0, Math.PI * 2); pc.fill();
  }

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let z = Math.imul(seed ^ seed >>> 15, 1 | seed);
      z = z + Math.imul(z ^ z >>> 7, 61 | z) ^ z;
      return ((z ^ z >>> 14) >>> 0) / 4294967296;
    };
  }

  /* ── particle helpers ─────────────────────────────────────────────── */
  function burst(x, y, color, n, speed = 5) {
    for (let i = 0; i < n; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd   = 1 + Math.random() * speed;
      particles.push({
        x, y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        life: 1, r: 2 + Math.random() * 4, color
      });
    }
  }

  /* ── fire ─────────────────────────────────────────────────────────── */
  function fire(mx, my) {
    if (!running) return;
    const configs = {
      missile:  { emoji: '💣', speed: 6,  r: 0.22, dmg: 3,  pn: 12, color: '#f97316' },
      laser:    { emoji: null,  speed: 18, r: 0.12, dmg: 2,  pn: 6,  color: '#ef4444' },
      asteroid: { emoji: '☄️', speed: 4,  r: 0.32, dmg: 7,  pn: 20, color: '#78716c' },
      nuke:     { emoji: '💥', speed: 5,  r: 0.55, dmg: 18, pn: 40, color: '#fbbf24' },
    };
    const cfg = configs[weapon];
    const dx = CX - mx, dy = CY - my;
    const len = Math.hypot(dx, dy) || 1;
    projectiles.push({
      x: mx, y: my,
      vx: (dx / len) * cfg.speed,
      vy: (dy / len) * cfg.speed,
      weapon,
      cfg,
      trail: [],
      laser: weapon === 'laser',
    });
  }

  /* ── draw ─────────────────────────────────────────────────────────── */
  function drawSpace() {
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, SIZE, SIZE);
    // stars
    const rng = mulberry32(42);
    for (let i = 0; i < 60; i++) {
      const sx = rng() * SIZE, sy = rng() * SIZE;
      const sr = 0.5 + rng();
      const alpha = 0.4 + rng() * 0.6;
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawPlanet(shakeX, shakeY) {
    ctx.save();
    ctx.translate(shakeX, shakeY);

    // draw pre-rendered texture
    ctx.drawImage(planetOffscreen, 0, 0);

    // craters
    craters.forEach(c => {
      ctx.globalAlpha = c.alpha;
      // dark pit
      const cd = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r);
      cd.addColorStop(0,   'rgba(0,0,0,0.85)');
      cd.addColorStop(0.6, 'rgba(0,0,0,0.6)');
      cd.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = cd;
      ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2); ctx.fill();
      // rim highlight
      ctx.strokeStyle = `rgba(200,180,140,${c.alpha * 0.5})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(c.x, c.y, c.r * 0.9, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    });

    // HP overlay (darkens planet as hp drops)
    const dmg = 1 - hp / 100;
    ctx.fillStyle = `rgba(0,0,0,${dmg * 0.6})`;
    ctx.beginPath(); ctx.arc(CX, CY, PLANET_R, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
  }

  function drawProjectiles() {
    projectiles.forEach(p => {
      if (p.laser) {
        // laser beam from edge
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#f87171';
        ctx.shadowBlur = 10;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.moveTo(p.trailX ?? p.x, p.trailY ?? p.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      } else {
        // draw trail
        p.trail.forEach((pt, i) => {
          ctx.globalAlpha = (i / p.trail.length) * 0.4;
          ctx.fillStyle = p.cfg.color;
          ctx.beginPath(); ctx.arc(pt.x, pt.y, 4 * (i / p.trail.length), 0, Math.PI * 2); ctx.fill();
        });
        ctx.globalAlpha = 1;

        // emoji projectile
        ctx.font = `${p.weapon === 'nuke' ? 26 : p.weapon === 'asteroid' ? 22 : 18}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.save();
        const angle = Math.atan2(p.vy, p.vx);
        ctx.translate(p.x, p.y);
        ctx.rotate(angle);
        ctx.fillText(p.cfg.emoji, 0, 0);
        ctx.restore();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
      }
    });
  }

  function drawParticles() {
    particles.forEach(p => {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function drawHpBar() {
    const bw = 160, bh = 10, bx = CX - bw / 2, by = CY + PLANET_R + 14;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 5); ctx.fill();

    const pct = hp / 100;
    const hpGrad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    hpGrad.addColorStop(0, '#22c55e');
    hpGrad.addColorStop(0.5, '#eab308');
    hpGrad.addColorStop(1, '#ef4444');
    ctx.fillStyle = hpGrad;
    ctx.beginPath(); ctx.roundRect(bx, by, bw * pct, bh, 5); ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 5); ctx.stroke();
  }

  function drawDestroyed() {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('💥 Zerstört!', CX, CY - 20);
    ctx.fillStyle = '#fff';
    ctx.font = '14px sans-serif';
    ctx.fillText('Drücke "Neuer Planet"', CX, CY + 14);
    ctx.textAlign = 'left';
  }

  function updateScore() {
    scoreEl.textContent = `${100 - Math.round(hp)}%`;
  }

  /* ── update ───────────────────────────────────────────────────────── */
  function updateProjectiles() {
    const toRemove = [];
    projectiles.forEach((p, idx) => {
      if (p.laser) {
        p.trailX = p.x; p.trailY = p.y;
      } else {
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > 8) p.trail.shift();
      }
      p.x += p.vx; p.y += p.vy;

      const dist = Math.hypot(p.x - CX, p.y - CY);
      if (dist < PLANET_R + 4) {
        // impact
        const hitX = p.laser ? p.x : p.x;
        const hitY = p.laser ? p.y : p.y;

        craters.push({
          x: hitX, y: hitY,
          r: PLANET_R * p.cfg.r,
          alpha: 1
        });

        burst(hitX, hitY, p.cfg.color, p.cfg.pn, p.weapon === 'nuke' ? 10 : 5);

        if (p.weapon === 'nuke') {
          shakeTimer = 30; shakeAmt = 12;
          burst(hitX, hitY, '#fff', 20, 8);
        } else if (p.weapon === 'asteroid') {
          shakeTimer = 15; shakeAmt = 6;
        }

        hp = Math.max(0, hp - p.cfg.dmg);
        updateScore();
        toRemove.push(idx);
      } else if (p.x < -50 || p.x > SIZE + 50 || p.y < -50 || p.y > SIZE + 50) {
        toRemove.push(idx);
      }
    });
    for (let i = toRemove.length - 1; i >= 0; i--) projectiles.splice(toRemove[i], 1);
  }

  /* ── main loop ────────────────────────────────────────────────────── */
  function loop() {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    frame++;

    if (shakeTimer > 0) shakeTimer--;

    let sx = 0, sy = 0;
    if (shakeTimer > 0) {
      sx = (Math.random() - 0.5) * shakeAmt;
      sy = (Math.random() - 0.5) * shakeAmt;
    }

    updateProjectiles();

    particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vx *= 0.93; p.vy *= 0.93; p.life -= 0.03; });
    particles = particles.filter(p => p.life > 0);

    drawSpace();
    if (hp > 0) {
      drawPlanet(sx, sy);
    } else {
      drawParticles();
      drawDestroyed();
      return;
    }
    drawProjectiles();
    drawParticles();
    drawHpBar();
  }

  /* ── click/touch ──────────────────────────────────────────────────── */
  function getCanvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = SIZE / rect.width;
    const scaleY = SIZE / rect.height;
    if (e.touches) {
      return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  canvas.addEventListener('click', e => { const p = getCanvasPos(e); fire(p.x, p.y); });
  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    const p = getCanvasPos(e);
    fire(p.x, p.y);
  }, { passive: false });

  /* ── init ─────────────────────────────────────────────────────────── */
  function init() {
    craters     = [];
    projectiles = [];
    particles   = [];
    shakeTimer  = 0;
    shakeAmt    = 0;
    hp          = 100;
    frame       = 0;
    buildPlanet();
    updateScore();
  }

  /* ── public API ───────────────────────────────────────────────────── */
  window.startPlanet = function () {
    if (running) stopPlanet();
    running = true;
    init();
    raf = requestAnimationFrame(loop);
  };

  window.stopPlanet = function () {
    running = false;
    cancelAnimationFrame(raf);
  };
})();
