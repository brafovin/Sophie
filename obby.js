/* ══ Obby Run ═════════════════════════════════════════════════════════════
   Side-scrolling platformer: jump through the obstacle course while lava
   rises from below. Collect gems, reach the finish flag!
══════════════════════════════════════════════════════════════════════════ */
(function () {
  const canvas   = document.getElementById('obby-canvas');
  const ctx      = canvas.getContext('2d');
  const scoreEl  = document.getElementById('obby-score');
  const livesEl  = document.getElementById('obby-lives');

  const W = 380, H = 240;
  canvas.width = W; canvas.height = H;

  // ── Physics constants ────────────────────────────────────────────────
  const GRAVITY      = 0.48;
  const JUMP_FORCE   = -10.8;
  const MOVE_SPEED   = 3.6;
  const MAX_FALL     = 11;
  const COYOTE_TIME  = 7;   // frames grace period after walking off edge
  const JUMP_BUFFER  = 8;   // frames to buffer jump input before landing

  // ── Dimensions ──────────────────────────────────────────────────────
  const PW = 18, PH = 26;     // player size
  const PF_H = 12;             // platform height

  // ── State ────────────────────────────────────────────────────────────
  let running = false, raf;
  let frame = 0;
  let player, platforms, gems, spikes, sawblades, checkpoints;
  let cameraX, lavaY, lavaSpeed;
  let score, lives, state; // 'playing' | 'dead' | 'win'
  let particles, bgStars;
  let deathTimer, winTimer;
  let checkpointX, checkpointGemCount;
  let keys = {};
  let jumpBufferTimer = 0, coyoteTimer = 0;
  let lastGrounded = false;
  let respawnFlash = 0;

  // ── RNG seeded ───────────────────────────────────────────────────────
  function mulberry32(seed) {
    return () => {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let z = Math.imul(seed ^ seed >>> 15, 1 | seed);
      z = z + Math.imul(z ^ z >>> 7, 61 | z) ^ z;
      return ((z ^ z >>> 14) >>> 0) / 4294967296;
    };
  }

  // ════════════════════════════════════════════════════════════════════
  // LEVEL GENERATION
  // ════════════════════════════════════════════════════════════════════
  const LEVEL_LEN = 70; // number of platform segments

  function generateLevel() {
    const rng = mulberry32(42);
    platforms = []; gems = []; spikes = []; sawblades = []; checkpoints = [];

    // Starting platform (long, safe)
    platforms.push({ x: -60, y: 190, w: 280, h: PF_H, moving: false });

    let curX = 220, curY = 190;

    for (let i = 0; i < LEVEL_LEN; i++) {
      const progress = i / LEVEL_LEN;
      const difficulty = Math.min(1, progress * 1.3);

      const gap   = 40  + rng() * (80 + difficulty * 60);
      const dY    = (rng() - 0.5) * 120 * difficulty;
      curY        = Math.max(55, Math.min(195, curY + dY));
      const pw    = 70 + rng() * (130 - difficulty * 50);
      const moving = rng() < (0.1 + difficulty * 0.35);
      const hasSpike = rng() < (difficulty * 0.30) && !moving;
      const hasSaw   = rng() < (difficulty * 0.18);

      const plat = {
        x: curX + gap, y: curY, w: Math.max(45, pw), h: PF_H,
        moving, dir: 1,
        ox: curX + gap, oy: curY,
        moveAxis: rng() < 0.5 ? 'y' : 'x',
        moveRange: 30 + rng() * 40,
        moveSpeed: 0.6 + rng() * 0.8,
        phase: rng() * Math.PI * 2,
      };
      platforms.push(plat);

      // Spikes on platform surface
      if (hasSpike) {
        const numSpikes = 1 + Math.floor(rng() * 3);
        const sx0 = plat.x + 8 + rng() * (plat.w - 24 - numSpikes * 12);
        for (let s = 0; s < numSpikes; s++) {
          spikes.push({ x: sx0 + s * 14, y: plat.y - 10, w: 12, h: 10, platIdx: platforms.length - 1 });
        }
      }

      // Sawblades in the air
      if (hasSaw) {
        sawblades.push({
          x: plat.x + plat.w / 2,
          y: plat.y - 30 - rng() * 30,
          r: 12,
          phase: rng() * Math.PI * 2,
          orbitR: 20 + rng() * 25,
          orbitSpeed: (0.02 + rng() * 0.03) * (rng() < 0.5 ? 1 : -1),
          ox: plat.x + plat.w / 2, oy: plat.y - 40,
          rot: 0,
        });
      }

      // Gems above platform
      const gemCount = Math.floor(rng() * 3) + 1;
      for (let g = 0; g < gemCount; g++) {
        gems.push({
          x: plat.x + 12 + (g * (plat.w - 24)) / (gemCount + 1),
          y: plat.y - 28 - rng() * 20,
          r: 7, collected: false, phase: rng() * Math.PI * 2,
        });
      }

      // Checkpoints every 15 platforms
      if (i > 0 && i % 15 === 0) {
        checkpoints.push({ x: plat.x + plat.w / 2, y: plat.y - 30, activated: false });
      }

      curX = plat.x + plat.w;
      curY  = plat.y;
    }

    // Finish flag
    checkpoints.push({ x: curX + 120, y: 170, activated: false, isFinal: true });
    platforms.push({ x: curX + 60, y: 185, w: 180, h: PF_H, moving: false });
  }

  // ════════════════════════════════════════════════════════════════════
  // INIT
  // ════════════════════════════════════════════════════════════════════
  function initBgStars() {
    bgStars = [];
    const rng = mulberry32(13);
    for (let i = 0; i < 60; i++) bgStars.push({ x: rng() * W * 4, y: rng() * H, r: 0.5 + rng(), alpha: 0.3 + rng() * 0.5 });
  }

  function spawnPlayer(wx, wy) {
    player = {
      x: wx, y: wy,
      vx: 0, vy: 0,
      grounded: false,
      facingRight: true,
      runFrame: 0,
      invincible: 0,  // frames of invincibility after respawn
    };
  }

  function init(fromCheckpoint = false) {
    frame = 0;
    generateLevel();
    initBgStars();
    spawnPlayer(60, 155);
    cameraX    = 0;
    lavaY      = H + 80;
    lavaSpeed  = 0.055;
    particles  = [];
    state      = 'playing';
    deathTimer = 0; winTimer = 0;
    jumpBufferTimer = 0; coyoteTimer = 0; lastGrounded = false;
    keys = {};
    respawnFlash = 0;
    if (!fromCheckpoint) {
      score = 0; lives = 3;
      checkpointX = 60; checkpointGemCount = 0;
    }
    scoreEl.textContent = score;
    updateLivesUI();
  }

  function respawn() {
    spawnPlayer(checkpointX, H * 0.65);
    player.invincible = 80;
    state = 'playing';
    deathTimer = 0;
    lavaY = H + 80;
    lavaSpeed = 0.055 + frame * 0.000003; // maintain difficulty
    respawnFlash = 20;
    particles = [];
  }

  function updateLivesUI() { livesEl.textContent = '❤️'.repeat(Math.max(0, lives)); }

  // ════════════════════════════════════════════════════════════════════
  // PARTICLES
  // ════════════════════════════════════════════════════════════════════
  function burst(wx, sy, color, n, spd = 5) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1 + Math.random() * spd;
      particles.push({ wx, y: sy, vx: Math.cos(a)*s, vy: Math.sin(a)*s, life: 1, color, r: 2+Math.random()*3 });
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // UPDATE
  // ════════════════════════════════════════════════════════════════════
  function update() {
    frame++;
    lavaSpeed += 0.000008;
    lavaY     -= lavaSpeed;

    // Moving platforms
    platforms.forEach((p, i) => {
      if (!p.moving) return;
      const t = frame * p.moveSpeed * 0.02 + p.phase;
      if (p.moveAxis === 'y') {
        p.y = p.oy + Math.sin(t) * p.moveRange;
      } else {
        p.x = p.ox + Math.sin(t) * p.moveRange;
      }
      // Sync spikes to their platform
      spikes.forEach(s => {
        if (s.platIdx === i) {
          s.y = p.y - 10;
          if (p.moveAxis === 'x') s.x = s.x + (p.x - p.ox + p.moveRange - Math.sin((frame-1)*p.moveSpeed*0.02+p.phase)*p.moveRange);
        }
      });
    });

    // Sawblades orbit
    sawblades.forEach(s => {
      s.phase += s.orbitSpeed;
      s.x = s.ox + Math.cos(s.phase) * s.orbitR;
      s.y = s.oy + Math.sin(s.phase) * s.orbitR * 0.5;
      s.rot += 0.06;
    });

    // ── Player movement ──────────────────────────────────────────────
    const moveLeft  = keys['ArrowLeft']  || keys['a'] || keys['_left'];
    const moveRight = keys['ArrowRight'] || keys['d'] || keys['_right'];
    const wantJump  = keys['ArrowUp']    || keys['w'] || keys[' '] || keys['_jump'];

    if (moveLeft)  { player.vx = -MOVE_SPEED; player.facingRight = false; }
    else if (moveRight) { player.vx = MOVE_SPEED; player.facingRight = true; }
    else player.vx = 0;

    // Jump buffer
    if (wantJump) jumpBufferTimer = JUMP_BUFFER;
    else if (jumpBufferTimer > 0) jumpBufferTimer--;

    // Coyote time
    if (player.grounded) { coyoteTimer = COYOTE_TIME; lastGrounded = true; }
    else if (coyoteTimer > 0) coyoteTimer--;

    // Execute jump
    if (jumpBufferTimer > 0 && coyoteTimer > 0 && player.vy >= -1) {
      player.vy = JUMP_FORCE;
      jumpBufferTimer = 0; coyoteTimer = 0;
      burst(player.x + PW/2, player.y + PH, '#a5b4fc', 6, 3);
    }

    // Gravity
    player.vy = Math.min(player.vy + GRAVITY, MAX_FALL);
    player.x += player.vx;
    player.y += player.vy;
    player.grounded = false;

    // Run animation
    if (player.grounded && (moveLeft || moveRight)) player.runFrame += 0.2;

    // ── Platform collision ───────────────────────────────────────────
    for (const p of platforms) {
      const overlapX = player.x + PW > p.x && player.x < p.x + p.w;
      if (!overlapX) continue;

      // Landing on top
      if (player.vy >= 0 && player.y + PH <= p.y + PF_H + 6 && player.y + PH >= p.y - 2) {
        player.y = p.y - PH;
        player.vy = 0;
        player.grounded = true;
      }
      // Hitting bottom
      else if (player.vy < 0 && player.y >= p.y + PF_H - 4 && player.y < p.y + PF_H + 8) {
        player.vy = 0.5;
        player.y = p.y + PF_H;
      }
      // Side push
      else if (player.y + PH > p.y + 4 && player.y < p.y + PF_H - 4) {
        if (player.x + PW / 2 < p.x + p.w / 2) player.x = p.x - PW;
        else player.x = p.x + p.w;
        player.vx = 0;
      }
    }

    // ── Camera ──────────────────────────────────────────────────────
    const targetCX = player.x - 110;
    cameraX += (targetCX - cameraX) * 0.12;

    // ── Gem collection ───────────────────────────────────────────────
    gems.forEach(g => {
      if (g.collected) return;
      const sx = g.x - cameraX;
      if (sx < player.x - cameraX + PW + 10 && sx + g.r > player.x - cameraX - 5 &&
          g.y < player.y + PH + 10 && g.y + g.r > player.y - 5) {
        g.collected = true;
        score++; scoreEl.textContent = score;
        burst(g.x, g.y, '#a5f3fc', 8, 4);
      }
    });

    // ── Checkpoint ──────────────────────────────────────────────────
    checkpoints.forEach(cp => {
      if (cp.activated) return;
      const sx = cp.x - cameraX;
      if (Math.abs(sx - (player.x - cameraX + PW/2)) < 28 && Math.abs(cp.y - player.y) < 50) {
        cp.activated = true;
        if (cp.isFinal) {
          state = 'win';
          burst(player.x + PW/2, player.y, '#fbbf24', 30, 8);
          burst(player.x + PW/2, player.y, '#22c55e', 20, 6);
        } else {
          checkpointX = cp.x - 20;
          checkpointGemCount = score;
          burst(cp.x, cp.y, '#22c55e', 15, 5);
        }
      }
    });

    // ── Spike collision ──────────────────────────────────────────────
    if (player.invincible <= 0) {
      for (const s of spikes) {
        if (player.x + PW > s.x + 2 && player.x < s.x + s.w - 2 &&
            player.y < s.y + s.h && player.y + PH > s.y) {
          die(); return;
        }
      }
      // Sawblade
      for (const s of sawblades) {
        const sx = player.x + PW/2, sy = player.y + PH/2;
        if (Math.hypot(sx - s.x, sy - s.y) < s.r + PW/2 - 3) { die(); return; }
      }
    }

    // ── Lava kill ───────────────────────────────────────────────────
    const lavaSY = lavaY; // lavaY is already in screen-space (Y=0 top)
    if (player.y + PH >= lavaSY && player.invincible <= 0) { die(); return; }

    // ── Fall off bottom ──────────────────────────────────────────────
    if (player.y > H + 20) { die(); return; }

    // Invincibility countdown
    if (player.invincible > 0) player.invincible--;

    // Particles
    particles.forEach(p => { p.wx += p.vx; p.y += p.vy; p.vy += 0.15; p.vx *= 0.92; p.life -= 0.04; });
    particles = particles.filter(p => p.life > 0);
  }

  function die() {
    burst(player.x + PW/2, player.y + PH/2, '#ef4444', 16, 6);
    burst(player.x + PW/2, player.y + PH/2, '#fbbf24', 8, 5);
    lives--;
    updateLivesUI();
    if (lives <= 0) { state = 'dead'; }
    else            { state = 'respawning'; deathTimer = 55; }
  }

  // ════════════════════════════════════════════════════════════════════
  // DRAW
  // ════════════════════════════════════════════════════════════════════
  function w2s(wx) { return wx - cameraX; } // world-x to screen-x

  function drawBg() {
    // Night sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#060618'); sky.addColorStop(1, '#0d0525');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    // Parallax stars
    bgStars.forEach(s => {
      const sx = ((s.x - cameraX * 0.15) % (W * 3) + W * 3) % (W * 3) / 3;
      ctx.globalAlpha = s.alpha;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(sx, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Distant mountain silhouette (parallax layer 2)
    ctx.fillStyle = '#0f0a2e';
    const mOff = (cameraX * 0.25) % W;
    for (let m = -1; m <= 2; m++) {
      const mx = m * W - mOff;
      ctx.beginPath(); ctx.moveTo(mx, H);
      ctx.lineTo(mx + 40,  H - 55); ctx.lineTo(mx + 80,  H - 30);
      ctx.lineTo(mx + 120, H - 75); ctx.lineTo(mx + 170, H - 40);
      ctx.lineTo(mx + 220, H - 85); ctx.lineTo(mx + 260, H - 45);
      ctx.lineTo(mx + 300, H - 60); ctx.lineTo(mx + W, H);
      ctx.closePath(); ctx.fill();
    }
  }

  function drawPlatform(p) {
    const sx = w2s(p.x);
    if (sx > W + 20 || sx + p.w < -20) return;

    // Body
    const grad = ctx.createLinearGradient(sx, p.y, sx, p.y + PF_H);
    if (p.moving) {
      grad.addColorStop(0, '#7c3aed'); grad.addColorStop(1, '#4c1d95');
    } else {
      grad.addColorStop(0, '#374151'); grad.addColorStop(1, '#1f2937');
    }
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.roundRect(sx, p.y, p.w, PF_H, 4); ctx.fill();

    // Grass/glow top strip
    ctx.fillStyle = p.moving ? 'rgba(167,139,250,0.8)' : '#4ade80';
    ctx.fillRect(sx + 2, p.y, p.w - 4, 3);

    // Edge shimmer
    ctx.strokeStyle = p.moving ? 'rgba(167,139,250,0.4)' : 'rgba(74,222,128,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(sx + 0.5, p.y + 0.5, p.w - 1, PF_H - 1, 4); ctx.stroke();

    // Moving platform glow aura
    if (p.moving) {
      ctx.shadowColor = '#7c3aed'; ctx.shadowBlur = 10;
      ctx.strokeStyle = 'rgba(167,139,250,0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(sx, p.y, p.w, PF_H, 4); ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  function drawSpike(s) {
    const sx = w2s(s.x);
    if (sx > W + 20 || sx < -20) return;
    ctx.fillStyle = '#f87171';
    ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(sx, s.y + s.h);
    ctx.lineTo(sx + s.w / 2, s.y);
    ctx.lineTo(sx + s.w, s.y + s.h);
    ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
  }

  function drawSawblade(s) {
    const sx = w2s(s.x);
    if (sx > W + 30 || sx < -30) return;
    ctx.save(); ctx.translate(sx, s.y); ctx.rotate(s.rot);
    // Teeth
    ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * s.r * 0.6, Math.sin(a) * s.r * 0.6);
      ctx.lineTo(Math.cos(a) * (s.r + 5), Math.sin(a) * (s.r + 5));
      ctx.stroke();
    }
    // Disc
    const dg = ctx.createRadialGradient(0, 0, 1, 0, 0, s.r);
    dg.addColorStop(0, '#64748b'); dg.addColorStop(1, '#1e293b');
    ctx.fillStyle = dg;
    ctx.beginPath(); ctx.arc(0, 0, s.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, s.r, 0, Math.PI * 2); ctx.stroke();
    // Center bolt
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
    // Glow
    ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 12;
    ctx.strokeStyle = 'rgba(239,68,68,0.35)';
    ctx.beginPath(); ctx.arc(0, 0, s.r + 3, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  function drawGem(g) {
    if (g.collected) return;
    const sx = w2s(g.x);
    if (sx > W + 20 || sx < -20) return;
    const bob = Math.sin(frame * 0.06 + g.phase) * 3;
    g.phase; // read to confirm used
    ctx.save(); ctx.translate(sx, g.y + bob);
    // Diamond shape
    const gg = ctx.createRadialGradient(0, -g.r * 0.3, 1, 0, 0, g.r);
    gg.addColorStop(0, '#a5f3fc'); gg.addColorStop(0.5, '#06b6d4'); gg.addColorStop(1, '#164e63');
    ctx.fillStyle = gg;
    ctx.shadowColor = '#06b6d4'; ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(0, -g.r); ctx.lineTo(g.r * 0.7, 0); ctx.lineTo(0, g.r);
    ctx.lineTo(-g.r * 0.7, 0); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    // Shine
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.ellipse(-g.r*0.2, -g.r*0.4, g.r*0.2, g.r*0.1, -0.5, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  function drawCheckpoint(cp) {
    const sx = w2s(cp.x);
    if (sx > W + 40 || sx < -40) return;
    const col = cp.activated ? '#22c55e' : '#94a3b8';

    if (cp.isFinal) {
      // Finish flag
      ctx.fillStyle = col;
      ctx.fillRect(sx - 1, cp.y - 35, 3, 40);
      ctx.fillStyle = cp.activated ? '#fbbf24' : '#e2e8f0';
      ctx.fillRect(sx + 2, cp.y - 35, 20, 14);
      // Flag stripes
      if (!cp.activated) {
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(sx + 2, cp.y - 35, 20, 4);
        ctx.fillRect(sx + 2, cp.y - 27, 20, 4);
      }
      // "ZIEL" label
      ctx.fillStyle = col;
      ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('ZIEL', sx + 10, cp.y + 12);
      ctx.textAlign = 'left';
    } else {
      // Checkpoint star/flag
      ctx.fillStyle = col;
      ctx.fillRect(sx - 1, cp.y - 24, 2, 28);
      ctx.font = '16px serif'; ctx.textAlign = 'center';
      ctx.fillText(cp.activated ? '✅' : '🏳️', sx + 6, cp.y - 8);
      ctx.textAlign = 'left';
    }

    // Glow when active
    if (cp.activated) {
      ctx.shadowColor = '#22c55e'; ctx.shadowBlur = 18;
      ctx.strokeStyle = 'rgba(34,197,94,0.4)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(sx, cp.y, 12, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  function drawPlayer() {
    const sx = w2s(player.x);
    const py = player.y;
    const inv = player.invincible > 0 && (frame % 6 < 3);
    if (inv) ctx.globalAlpha = 0.45;

    const fl = player.facingRight ? 1 : -1;
    ctx.save(); ctx.translate(sx + PW / 2, py);
    if (!player.facingRight) ctx.scale(-1, 1);

    // Shadow
    ctx.globalAlpha = (inv ? 0.2 : 0.3);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(0, PH + 2, 10, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = inv ? 0.45 : 1;

    // Legs (run cycle or jump pose)
    const phase = player.runFrame;
    ctx.strokeStyle = '#f97316'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    if (player.grounded && (keys['ArrowLeft'] || keys['a'] || keys['_left'] || keys['ArrowRight'] || keys['d'] || keys['_right'])) {
      ctx.beginPath(); ctx.moveTo(0, PH - 8); ctx.lineTo(-5 + Math.cos(phase)*6, PH + 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, PH - 8); ctx.lineTo( 5 + Math.cos(phase+Math.PI)*6, PH + 2); ctx.stroke();
    } else if (!player.grounded) {
      // Jump pose
      ctx.beginPath(); ctx.moveTo(0, PH - 8); ctx.lineTo(-7, PH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, PH - 8); ctx.lineTo(5, PH + 2); ctx.stroke();
    } else {
      // Idle
      ctx.beginPath(); ctx.moveTo(0, PH - 8); ctx.lineTo(-4, PH + 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, PH - 8); ctx.lineTo(4, PH + 2); ctx.stroke();
    }

    // Body
    const bodyG = ctx.createLinearGradient(-PW/2, 0, PW/2, PH - 10);
    bodyG.addColorStop(0, '#a855f7'); bodyG.addColorStop(1, '#6d28d9');
    ctx.fillStyle = bodyG;
    ctx.beginPath(); ctx.roundRect(-PW/2, 0, PW, PH - 10, 4); ctx.fill();
    // Jacket stripe
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(-PW/2 + 2, 3, 4, PH - 14);

    // Arms
    ctx.strokeStyle = '#7c3aed'; ctx.lineWidth = 4;
    const armSwing = player.grounded ? Math.cos(phase) * 0.3 : 0.4;
    ctx.beginPath(); ctx.moveTo(-PW/2, 5); ctx.lineTo(-PW/2 - 6, 14 + armSwing * 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(PW/2, 5); ctx.lineTo(PW/2 + 6, 14 - armSwing * 4); ctx.stroke();

    // Head
    const headG = ctx.createRadialGradient(-3, -4, 1, 0, -2, 11);
    headG.addColorStop(0, '#fde68a'); headG.addColorStop(1, '#d97706');
    ctx.fillStyle = headG;
    ctx.beginPath(); ctx.arc(0, -8, 11, 0, Math.PI * 2); ctx.fill();

    // Helmet
    ctx.fillStyle = '#4f46e5';
    ctx.beginPath(); ctx.arc(0, -8, 11, Math.PI, 0); ctx.fill();
    // Visor
    ctx.fillStyle = '#1e1b4b';
    ctx.beginPath(); ctx.roundRect(-7, -12, 14, 7, 3); ctx.fill();
    ctx.fillStyle = 'rgba(167,139,250,0.55)';
    ctx.fillRect(-6, -11, 12, 5);

    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawLava() {
    const ly = lavaY;
    const lavaH = H - ly + 20;
    if (lavaH <= 0) return;

    // Surface glow
    ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 20;

    // Animated surface bubbles / waves
    const lavaGrad = ctx.createLinearGradient(0, ly, 0, H);
    lavaGrad.addColorStop(0,   '#ff4500');
    lavaGrad.addColorStop(0.15,'#dc2626');
    lavaGrad.addColorStop(0.5, '#991b1b');
    lavaGrad.addColorStop(1,   '#450a0a');
    ctx.fillStyle = lavaGrad;

    ctx.beginPath(); ctx.moveTo(0, H);
    // Wavy surface
    for (let x = 0; x <= W; x += 8) {
      const wave = Math.sin((x + frame * 2) * 0.04) * 3 + Math.sin((x - frame) * 0.07) * 2;
      ctx.lineTo(x, ly + wave);
    }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;

    // Lava bubbles
    for (let b = 0; b < 5; b++) {
      const bx = ((b * 80 + frame * 0.8) % W);
      const by = ly + 6 + Math.sin(frame * 0.05 + b) * 3;
      ctx.fillStyle = 'rgba(255,150,50,0.5)';
      ctx.beginPath(); ctx.arc(bx, by, 4 + Math.sin(frame * 0.1 + b*2) * 2, 0, Math.PI * 2); ctx.fill();
    }

    // Danger warning when lava is close to player
    const danger = Math.max(0, 1 - (player.y + PH - ly) / 60);
    if (danger > 0) {
      const warnAlpha = danger * (0.5 + 0.3 * Math.sin(frame * 0.2));
      ctx.fillStyle = `rgba(239,68,68,${warnAlpha * 0.18})`;
      ctx.fillRect(0, 0, W, H);
      // Warning border
      ctx.strokeStyle = `rgba(239,68,68,${warnAlpha * 0.7})`;
      ctx.lineWidth = 3;
      ctx.strokeRect(1, 1, W - 2, H - 2);
    }
  }

  function drawParticles() {
    particles.forEach(p => {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(w2s(p.wx), p.y, Math.max(0.5, p.r * p.life), 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function drawHUD() {
    // Lava height gauge (right side)
    const gaugeH = 80, gx = W - 14, gy = 12;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.roundRect(gx, gy, 8, gaugeH, 4); ctx.fill();
    const lavaPct = Math.max(0, Math.min(1, 1 - (lavaY - H/2) / (H/2 + 80)));
    if (lavaPct > 0) {
      const lg = ctx.createLinearGradient(0, gy, 0, gy + gaugeH);
      lg.addColorStop(0, '#ef4444'); lg.addColorStop(1, '#ff6a00');
      ctx.fillStyle = lg;
      ctx.beginPath(); ctx.roundRect(gx, gy + gaugeH * (1 - lavaPct), 8, gaugeH * lavaPct, 4); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,100,50,0.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(gx, gy, 8, gaugeH, 4); ctx.stroke();
    ctx.fillStyle = 'rgba(255,100,50,0.8)'; ctx.font = '8px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('🌋', gx + 4, gy - 3);
    ctx.textAlign = 'left';
  }

  function drawOverlay(title, sub, col) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = col; ctx.font = 'bold 26px sans-serif';
    ctx.fillText(title, W/2, H/2 - 22);
    ctx.fillStyle = '#e2e8f0'; ctx.font = '13px sans-serif';
    ctx.fillText(sub, W/2, H/2 + 4);
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '11px sans-serif';
    ctx.fillText('Tippe zum Neustart', W/2, H/2 + 24);
    ctx.textAlign = 'left';
  }

  function drawRespawnFlash() {
    if (respawnFlash <= 0) return;
    ctx.fillStyle = `rgba(255,255,255,${respawnFlash / 20 * 0.4})`;
    ctx.fillRect(0, 0, W, H);
    respawnFlash--;
  }

  // ════════════════════════════════════════════════════════════════════
  // MAIN LOOP
  // ════════════════════════════════════════════════════════════════════
  function loop() {
    if (!running) return;
    raf = requestAnimationFrame(loop);

    if (state === 'playing') {
      update();
    } else if (state === 'respawning') {
      deathTimer--;
      if (deathTimer <= 0) respawn();
      particles.forEach(p => { p.wx += p.vx; p.y += p.vy; p.vy += 0.15; p.life -= 0.05; });
      particles = particles.filter(p => p.life > 0);
    } else if (state === 'win') {
      winTimer++;
    }

    // DRAW
    drawBg();
    platforms.forEach(drawPlatform);
    spikes.forEach(drawSpike);
    gems.forEach(drawGem);
    checkpoints.forEach(drawCheckpoint);
    sawblades.forEach(drawSawblade);
    drawLava();
    drawParticles();
    if (state !== 'dead' && state !== 'dead-out') drawPlayer();
    drawHUD();
    drawRespawnFlash();

    if (state === 'dead')        drawOverlay('💀 Game Over', `Edelsteine: ${score}`, '#ef4444');
    if (state === 'respawning')  {
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(0,0,W,H);
      ctx.textAlign = 'center'; ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 18px sans-serif'; ctx.fillText('💔 Checkpoint…', W/2, H/2);
      ctx.textAlign = 'left';
    }
    if (state === 'win')         drawOverlay('🎉 Geschafft!', `Edelsteine: ${score} | Zeit: ${Math.floor(frame/60)}s`, '#fbbf24');
  }

  // ════════════════════════════════════════════════════════════════════
  // INPUT
  // ════════════════════════════════════════════════════════════════════
  function onKey(e) {
    const down = e.type === 'keydown';
    keys[e.key] = down;
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
    if (down && (state === 'dead' || state === 'win')) { init(); }
  }

  // On-screen buttons
  const leftBtn  = document.getElementById('ob-left');
  const rightBtn = document.getElementById('ob-right');
  const jumpBtn  = document.getElementById('ob-jump');

  function btnDown(key) { keys[key] = true; }
  function btnUp(key)   { keys[key] = false; }

  leftBtn.addEventListener('pointerdown',  () => { btnDown('_left');  if (state === 'dead' || state === 'win') init(); });
  leftBtn.addEventListener('pointerup',    () => btnUp('_left'));
  leftBtn.addEventListener('pointerleave', () => btnUp('_left'));
  rightBtn.addEventListener('pointerdown', () => { btnDown('_right'); if (state === 'dead' || state === 'win') init(); });
  rightBtn.addEventListener('pointerup',   () => btnUp('_right'));
  rightBtn.addEventListener('pointerleave',() => btnUp('_right'));
  jumpBtn.addEventListener('pointerdown',  () => { btnDown('_jump');  if (state === 'dead' || state === 'win') init(); });
  jumpBtn.addEventListener('pointerup',    () => btnUp('_jump'));
  jumpBtn.addEventListener('pointerleave', () => btnUp('_jump'));

  canvas.addEventListener('click', () => { if (state === 'dead' || state === 'win') init(); });

  // Swipe support
  let swX = 0, swY = 0;
  canvas.addEventListener('touchstart', e => { e.preventDefault(); swX = e.touches[0].clientX; swY = e.touches[0].clientY; }, { passive: false });
  canvas.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - swX, dy = e.changedTouches[0].clientY - swY;
    if (Math.abs(dx) < 15 && Math.abs(dy) < 15) { btnDown('_jump'); setTimeout(() => btnUp('_jump'), 80); }
    else if (dy < -25) { btnDown('_jump'); setTimeout(() => btnUp('_jump'), 120); }
    if (state === 'dead' || state === 'win') init();
  }, { passive: false });

  // ════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ════════════════════════════════════════════════════════════════════
  window.startObby = function () {
    if (running) stopObby();
    running = true;
    init();
    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup',   onKey);
    raf = requestAnimationFrame(loop);
  };

  window.stopObby = function () {
    running = false;
    keys = {};
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('keyup',   onKey);
    cancelAnimationFrame(raf);
  };

  // Back button
  document.getElementById('obby-back').addEventListener('click', () => {
    if (typeof goHome === 'function') goHome();
  });
})();
