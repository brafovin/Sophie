/* ══ Endless Runner — Cyberpunk Neon City ════════════════════════════════ */
(function () {
  const canvas  = document.getElementById('runner-canvas');
  const ctx     = canvas.getContext('2d');
  const scoreEl = document.getElementById('runner-score');

  const W = 380, H = 240;
  const LANES    = [60, 120, 180];
  const CHAR_X   = 75;
  const GROUND_Y = 198;

  let raf, running = false;
  let lane, charY, jumpV, jumping;
  let obstacles, coins, rain, splashes, particles;
  let score, speed, frame, spawnTimer, bgOffset;
  let deadTimer;
  let lives, invincible, invincTimer, newBest;
  let highScore = parseInt(localStorage.getItem('runner_hs') || '0');

  /* ── Neon sign palette ────────────────────────────────────────────── */
  const SIGNS = [
    { text: 'NEON',  color: '#ff2d78', glow: '#ff006a' },
    { text: '24H',   color: '#00f5ff', glow: '#00d4ff' },
    { text: 'RAMEN', color: '#ff7700', glow: '#ff5500' },
    { text: 'BAR',   color: '#bf5fff', glow: '#9900ff' },
    { text: 'HOTEL', color: '#00ff88', glow: '#00cc66' },
    { text: 'CYBER', color: '#3af',    glow: '#0af'    },
  ];

  /* ── Seeded building layouts (stable each play) ───────────────────── */
  function mulberry(seed) {
    return () => { seed=seed+0x6D2B79F5|0; let z=Math.imul(seed^seed>>>15,1|seed); z=z+Math.imul(z^z>>>7,61|z)^z; return((z^z>>>14)>>>0)/4294967296; };
  }
  const rng1 = mulberry(11), rng2 = mulberry(22), rng3 = mulberry(33);

  const FAR_BLDGS = Array.from({length: 14}, (_, i) => ({
    xFrac: i / 14, w: 28 + rng1() * 36, h: 30 + rng1() * 55,
    col: `hsl(${220 + rng1()*30},30%,${8 + rng1()*6}%)`,
  }));
  const MID_BLDGS = Array.from({length: 10}, (_, i) => ({
    xFrac: i / 10, w: 38 + rng2() * 42, h: 45 + rng2() * 70,
    col: `hsl(${240 + rng2()*30},25%,${10 + rng2()*7}%)`,
    windows: Array.from({length: 12}, () => ({ ox: rng2()*0.8, oy: rng2()*0.85, lit: rng2() > 0.35 })),
    sign: rng2() < 0.55 ? SIGNS[Math.floor(rng2() * SIGNS.length)] : null,
    signY: 0.15 + rng2() * 0.4,
  }));
  const NEAR_BLDGS = Array.from({length: 7}, (_, i) => ({
    xFrac: i / 7, w: 50 + rng3() * 55, h: 50 + rng3() * 40,
  }));

  /* ── Init ─────────────────────────────────────────────────────────── */
  function init() {
    canvas.width = W; canvas.height = H;
    lane = 1; charY = LANES[1]; jumpV = 0; jumping = false;
    obstacles = []; coins = []; particles = []; splashes = [];
    score = 0; speed = 3; frame = 0; spawnTimer = 0; bgOffset = 0; deadTimer = -1;
    lives = 3; invincible = false; invincTimer = 0; newBest = false;
    scoreEl.textContent = '0';
    rain = Array.from({length: 80}, () => ({
      x: Math.random() * W, y: Math.random() * H,
      len: 9 + Math.random() * 14, spd: 7 + Math.random() * 5,
      op: 0.12 + Math.random() * 0.25,
    }));
  }

  function laneY(l) { return LANES[l]; }

  /* ══ DRAW BACKGROUND ════════════════════════════════════════════════ */
  function drawBg() {
    /* sky */
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    sky.addColorStop(0,   '#06020f');
    sky.addColorStop(0.5, '#0d0525');
    sky.addColorStop(1,   '#1a0535');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

    // Moon
    ctx.save();
    const moonGlow = ctx.createRadialGradient(310, 28, 2, 310, 28, 22);
    moonGlow.addColorStop(0, 'rgba(220,210,180,0.9)');
    moonGlow.addColorStop(0.4, 'rgba(180,170,140,0.5)');
    moonGlow.addColorStop(1, 'rgba(100,80,120,0)');
    ctx.fillStyle = moonGlow; ctx.beginPath(); ctx.arc(310, 28, 22, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#e8dfc8'; ctx.beginPath(); ctx.arc(310, 28, 10, 0, Math.PI*2); ctx.fill();
    ctx.restore();

    /* ── FAR buildings ────────────────────────────────────────────── */
    const far = bgOffset * 0.12;
    FAR_BLDGS.forEach(b => {
      const bx = ((b.xFrac * W * 2 - far % (W * 2)) % (W * 2) + W * 2) % (W * 2) - 40;
      const by = GROUND_Y - b.h;
      ctx.fillStyle = b.col;
      ctx.fillRect(bx, by, b.w, b.h);
    });

    /* ── MID buildings with neon signs ───────────────────────────── */
    const mid = bgOffset * 0.30;
    MID_BLDGS.forEach(b => {
      const bx = ((b.xFrac * W * 2.5 - mid % (W * 2.5)) % (W * 2.5) + W * 2.5) % (W * 2.5) - 60;
      const by = GROUND_Y - b.h;
      ctx.fillStyle = b.col;
      ctx.fillRect(bx, by, b.w, b.h);

      // Windows
      const wCols = 4, wRows = Math.floor(b.h / 16);
      const wcell = (b.w - 8) / wCols;
      b.windows.forEach((win, wi) => {
        const col = wi % wCols, row = Math.floor(wi / wCols) % wRows;
        const wx = bx + 4 + col * wcell + 2;
        const wy = by + 6 + row * 14;
        if (wy < GROUND_Y - 2) {
          const flicker = win.lit && frame % 120 < 115 && !(frame % 80 === 0 && wi === 3);
          ctx.fillStyle = flicker ? `rgba(255,220,140,0.65)` : 'rgba(40,40,60,0.8)';
          ctx.fillRect(wx, wy, wcell - 4, 7);
        }
      });

      // Neon sign
      if (b.sign) {
        const sx = bx + b.w * 0.15, sy = by + b.h * b.signY;
        ctx.save();
        ctx.shadowColor = b.sign.glow; ctx.shadowBlur = 12;
        ctx.fillStyle = b.sign.color;
        ctx.fillRect(sx, sy, b.w * 0.7, 10);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff';
        ctx.font = `bold 7px monospace`;
        ctx.textAlign = 'center';
        const pulse = frame % 40 < 35 ? 1 : 0.3;
        ctx.globalAlpha = pulse;
        ctx.fillText(b.sign.text, sx + b.w * 0.35, sy + 8);
        ctx.globalAlpha = 1;
        ctx.textAlign = 'left';
        ctx.restore();
      }
    });

    /* ── Street lights ────────────────────────────────────────────── */
    const lightSpacing = 140;
    const lightOff = bgOffset * 0.72;
    for (let li = -1; li < 4; li++) {
      const lx = ((li * lightSpacing - lightOff % (lightSpacing * 4)) % (lightSpacing * 4) + lightSpacing * 4) % (lightSpacing * 4) - 20;
      // Pole
      ctx.fillStyle = '#2a2a3a';
      ctx.fillRect(lx - 1, GROUND_Y - 65, 3, 65);
      // Arm
      ctx.fillRect(lx - 1, GROUND_Y - 65, 16, 3);
      // Lamp housing
      ctx.fillStyle = '#444460';
      ctx.fillRect(lx + 10, GROUND_Y - 70, 14, 8);
      // Light cone
      ctx.save();
      const cone = ctx.createRadialGradient(lx + 17, GROUND_Y - 62, 2, lx + 17, GROUND_Y - 62, 55);
      cone.addColorStop(0,   'rgba(255,200,100,0.22)');
      cone.addColorStop(0.5, 'rgba(255,180,80,0.08)');
      cone.addColorStop(1,   'rgba(255,160,60,0)');
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.moveTo(lx + 17, GROUND_Y - 62);
      ctx.lineTo(lx - 18, GROUND_Y + 8);
      ctx.lineTo(lx + 52, GROUND_Y + 8);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      // Bulb glow
      ctx.shadowColor = '#ffc864'; ctx.shadowBlur = 10;
      ctx.fillStyle = '#ffe0a0';
      ctx.beginPath(); ctx.arc(lx + 17, GROUND_Y - 64, 3, 0, Math.PI*2); ctx.fill();
      ctx.shadowBlur = 0;
    }

    /* ── NEAR buildings (dark silhouette) ─────────────────────────── */
    const near = bgOffset * 0.62;
    NEAR_BLDGS.forEach(b => {
      const bx = ((b.xFrac * W * 1.8 - near % (W * 1.8)) % (W * 1.8) + W * 1.8) % (W * 1.8) - 55;
      ctx.fillStyle = '#050508';
      ctx.fillRect(bx, GROUND_Y - b.h, b.w, b.h);
      // rooftop details (antenna, water tower)
      ctx.fillStyle = '#0c0c18';
      ctx.fillRect(bx + b.w * 0.6, GROUND_Y - b.h - 12, 3, 12);
      ctx.beginPath(); ctx.arc(bx + b.w * 0.6 + 1.5, GROUND_Y - b.h - 12, 3, 0, Math.PI*2); ctx.fill();
    });

    /* ── Road ─────────────────────────────────────────────────────── */
    const road = ctx.createLinearGradient(0, GROUND_Y, 0, H);
    road.addColorStop(0,   '#1a1828');
    road.addColorStop(0.4, '#131120');
    road.addColorStop(1,   '#0a0810');
    ctx.fillStyle = road; ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);

    // Road centerline
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(0, GROUND_Y); ctx.lineTo(W, GROUND_Y); ctx.stroke();

    // Lane dividers (dashed)
    ctx.strokeStyle = 'rgba(255,230,80,0.18)';
    ctx.lineWidth = 1.5; ctx.setLineDash([18, 14]);
    ctx.lineDashOffset = -(bgOffset % 32);
    [LANES[0] + 30, LANES[1] + 30].forEach(ly => {
      ctx.beginPath(); ctx.moveTo(0, ly + 12); ctx.lineTo(W, ly + 12); ctx.stroke();
    });
    ctx.setLineDash([]);

    // Puddle reflections
    for (let p = 0; p < 4; p++) {
      const px = ((p * 95 + bgOffset * 0.8) % W + W) % W;
      const py = GROUND_Y + 6 + (p % 2) * 8;
      ctx.save();
      const puddleG = ctx.createRadialGradient(px, py, 0, px, py, 20);
      puddleG.addColorStop(0, 'rgba(100,80,180,0.2)');
      puddleG.addColorStop(1, 'rgba(100,80,180,0)');
      ctx.fillStyle = puddleG;
      ctx.beginPath(); ctx.ellipse(px, py, 18, 5, 0, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }

    /* ── Rain ─────────────────────────────────────────────────────── */
    ctx.strokeStyle = 'rgba(150,200,255,1)';
    ctx.lineWidth = 1;
    rain.forEach(r => {
      r.y += r.spd;
      r.x += r.spd * 0.15;
      if (r.y > GROUND_Y) {
        splashes.push({ x: r.x, y: GROUND_Y, life: 1, spd: 1.2 + Math.random() });
        r.y = -r.len; r.x = Math.random() * W;
      }
      ctx.globalAlpha = r.op;
      ctx.beginPath();
      ctx.moveTo(r.x, r.y);
      ctx.lineTo(r.x + r.spd * 0.15 * 0.5, r.y + r.len);
      ctx.stroke();
    });
    // Splash arcs
    splashes.forEach(s => {
      ctx.globalAlpha = s.life * 0.4;
      ctx.strokeStyle = 'rgba(150,200,255,1)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(s.x, s.y, (1 - s.life) * 6, Math.PI, 0);
      ctx.stroke();
      s.life -= 0.12;
    });
    splashes = splashes.filter(s => s.life > 0);
    ctx.globalAlpha = 1;

    /* ── Speed streaks at high speed ──────────────────────────────── */
    if (speed > 6) {
      const intensity = (speed - 6) / 4;
      for (let i = 0; i < 8; i++) {
        const sy = 20 + i * 28;
        const len = 15 + i * 6;
        ctx.globalAlpha = intensity * 0.12 * (Math.random() + 0.5);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(W * 0.6 + Math.random() * W * 0.4, sy);
        ctx.lineTo(W * 0.6 + Math.random() * W * 0.4 + len, sy);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  /* ══ DRAW CHARACTER ═════════════════════════════════════════════════ */
  function drawChar(x, y, dead) {
    ctx.globalAlpha = dead ? 0.5 : 1;

    // Ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(x, laneY(lane) + 22, 16, 4, 0, 0, Math.PI*2); ctx.fill();

    // Speed trail (purple glow)
    if (!dead && speed > 4) {
      for (let t = 1; t <= 3; t++) {
        ctx.globalAlpha = (0.15 - t * 0.04) * ((speed - 4) / 6);
        ctx.fillStyle = '#7c3aed';
        ctx.beginPath(); ctx.roundRect(x - 12 - t * 6, y - 15, 22, 28, 5); ctx.fill();
      }
      ctx.globalAlpha = dead ? 0.5 : 1;
    }

    const legPhase = (frame * 0.25) % (Math.PI * 2);
    ctx.strokeStyle = '#ff6b35'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    if (!jumping) {
      ctx.beginPath(); ctx.moveTo(x, y + 8); ctx.lineTo(x - 6 + Math.cos(legPhase)*6, y + 20); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y + 8); ctx.lineTo(x - 6 + Math.cos(legPhase+Math.PI)*6, y + 20); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(x, y+8); ctx.lineTo(x-9, y+18); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y+8); ctx.lineTo(x+5, y+18); ctx.stroke();
    }

    // Body
    const bodyG = ctx.createLinearGradient(x-11, y-15, x+11, y+8);
    bodyG.addColorStop(0, '#a855f7'); bodyG.addColorStop(1, '#5b21b6');
    ctx.fillStyle = bodyG;
    ctx.beginPath(); ctx.roundRect(x-11, y-15, 22, 24, 5); ctx.fill();
    // Jacket detail
    ctx.strokeStyle = 'rgba(200,150,255,0.3)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(x-11, y-15, 22, 24, 5); ctx.stroke();

    // Head
    const headG = ctx.createRadialGradient(x-3, y-22, 2, x, y-18, 11);
    headG.addColorStop(0, '#fde68a'); headG.addColorStop(1, '#b45309');
    ctx.fillStyle = headG; ctx.shadowColor='#f59e0b'; ctx.shadowBlur=6;
    ctx.beginPath(); ctx.arc(x, y-18, 11, 0, Math.PI*2); ctx.fill(); ctx.shadowBlur=0;

    // Helmet
    ctx.fillStyle = '#3730a3';
    ctx.beginPath(); ctx.arc(x, y-18, 11, Math.PI, 0); ctx.fill();
    // Visor
    ctx.fillStyle = '#1e1b4b';
    ctx.beginPath(); ctx.roundRect(x-8, y-25, 16, 8, 3); ctx.fill();
    ctx.shadowColor='#60a5fa'; ctx.shadowBlur=8;
    ctx.fillStyle = 'rgba(96,165,250,0.7)';
    ctx.fillRect(x-7, y-24, 14, 6);
    ctx.shadowBlur=0;

    ctx.globalAlpha = 1;
  }

  /* ══ DRAW OBSTACLES ═════════════════════════════════════════════════ */
  function drawObstacle(ob) {
    const y = laneY(ob.lane);
    if (ob.type === 'barrier' || ob.type === 'normal') {
      const h = 30;
      // Concrete barrier
      const g = ctx.createLinearGradient(ob.x-15, y-h, ob.x+15, y+10);
      g.addColorStop(0, '#6b7280'); g.addColorStop(1, '#374151');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.roundRect(ob.x-15, y-h, 30, h+10, 3); ctx.fill();
      // Red/white stripes
      ctx.save(); ctx.clip(); // wrong approach, let me use globalCompositeOperation
      ctx.restore();
      for (let si = 0; si < 4; si++) {
        ctx.fillStyle = si%2===0 ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.4)';
        ctx.fillRect(ob.x-15 + si*8, y-h, 7, h+10);
      }
      // Warning light
      const wl = frame % 40 < 20;
      ctx.shadowColor = wl ? '#ef4444' : '#000'; ctx.shadowBlur = wl ? 10 : 0;
      ctx.fillStyle = wl ? '#ef4444' : '#7f1d1d';
      ctx.beginPath(); ctx.arc(ob.x, y-h-2, 5, 0, Math.PI*2); ctx.fill();
      ctx.shadowBlur = 0;

    } else if (ob.type === 'tall') {
      const h = 46;
      // Electric fence post
      const g = ctx.createLinearGradient(ob.x-8, y-h, ob.x+8, y+10);
      g.addColorStop(0, '#fbbf24'); g.addColorStop(0.5, '#d97706'); g.addColorStop(1, '#92400e');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.roundRect(ob.x-8, y-h, 16, h+10, 3); ctx.fill();
      // Zig-zag lightning symbol
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('⚡', ob.x, y - h/2);
      ctx.textAlign='left'; ctx.textBaseline='alphabetic';
      // Top glow
      ctx.shadowColor='#fbbf24'; ctx.shadowBlur=16;
      ctx.strokeStyle='#fde68a'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(ob.x, y-h, 7, 0, Math.PI*2); ctx.stroke();
      ctx.shadowBlur=0;

    } else if (ob.type === 'car') {
      // Taxi/car obstacle
      const h = 22, w = 44;
      // Body
      const cg = ctx.createLinearGradient(ob.x-w/2, y-h, ob.x+w/2, y+8);
      cg.addColorStop(0, '#dc2626'); cg.addColorStop(1, '#7f1d1d');
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.roundRect(ob.x-w/2, y-h, w, h+8, 5); ctx.fill();
      // Windows
      ctx.fillStyle = 'rgba(150,220,255,0.5)';
      ctx.fillRect(ob.x-14, y-h+3, 10, 8);
      ctx.fillRect(ob.x+4, y-h+3, 10, 8);
      // Headlights
      ctx.shadowColor='#fde68a'; ctx.shadowBlur=12;
      ctx.fillStyle='#fde68a';
      ctx.beginPath(); ctx.arc(ob.x-w/2+4, y, 4, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(ob.x+w/2-4, y, 4, 0, Math.PI*2); ctx.fill();
      ctx.shadowBlur=0;
      // Wheels
      ctx.fillStyle='#111';
      [ob.x-w/2+8, ob.x+w/2-8].forEach(wx => {
        ctx.beginPath(); ctx.arc(wx, y+8, 5, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle='#555'; ctx.beginPath(); ctx.arc(wx, y+8, 2, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle='#111';
      });
    }
  }

  /* ══ DRAW COINS ═════════════════════════════════════════════════════ */
  function drawCoin(c) {
    if (c.collected) return;
    const y  = laneY(c.lane);
    const bob = Math.sin(frame * 0.1 + c.x * 0.05) * 3;
    ctx.save(); ctx.translate(c.x, y - 14 + bob);
    ctx.shadowColor = '#f59e0b'; ctx.shadowBlur = 14;
    const cg = ctx.createRadialGradient(-2,-2,1,0,0,9);
    cg.addColorStop(0,'#fef08a'); cg.addColorStop(0.5,'#f59e0b'); cg.addColorStop(1,'#78350f');
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.arc(0,0,9,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0;
    ctx.fillStyle='rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.ellipse(-3,-3,4,2,-0.5,0,Math.PI*2); ctx.fill();
    // $ symbol
    ctx.fillStyle='rgba(120,60,0,0.7)';
    ctx.font='bold 9px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('$',0,0);
    ctx.restore();
  }

  /* ══ PARTICLES ══════════════════════════════════════════════════════ */
  function addParticles(x, y, color, n=8) {
    for (let i=0;i<n;i++) {
      const a=(Math.PI*2*i)/n+Math.random()*0.5;
      particles.push({x,y,vx:Math.cos(a)*(2+Math.random()*4),vy:Math.sin(a)*(2+Math.random()*4),life:1,color});
    }
  }

  function drawParticles() {
    particles.forEach(p=>{
      ctx.globalAlpha=p.life;
      ctx.fillStyle=p.color;
      ctx.beginPath(); ctx.arc(p.x,p.y,4*p.life,0,Math.PI*2); ctx.fill();
    });
    ctx.globalAlpha=1;
  }

  /* ══ HUD ════════════════════════════════════════════════════════════ */
  function drawHud() {
    ctx.save();
    // Score + lives panel
    ctx.fillStyle='rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.roundRect(4,4,120,36,6); ctx.fill();
    ctx.fillStyle='#fff'; ctx.font='bold 13px monospace';
    ctx.fillText(`${score} PTS`, 10, 19);
    // Lives
    ctx.font='12px sans-serif';
    for(let i=0;i<3;i++){
      ctx.fillStyle = i < lives ? '#ef4444' : 'rgba(255,255,255,0.18)';
      ctx.shadowColor = i < lives ? '#ff4444' : 'transparent';
      ctx.shadowBlur = i < lives ? 6 : 0;
      ctx.fillText('♥', 10 + i*18, 34);
    }
    ctx.shadowBlur=0;
    // High score
    if(highScore>0){
      ctx.fillStyle='rgba(255,220,80,0.65)'; ctx.font='8px monospace';
      ctx.fillText(`BEST:${highScore}`, 65, 34);
    }
    // Speed bar
    const bw=80,bh=5,bx=W-bw-8,by=6;
    ctx.fillStyle='rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.roundRect(bx-4,2,bw+8,14,5); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.roundRect(bx,by,bw,bh,2); ctx.fill();
    const pct=Math.min((speed-3)/7,1);
    const sg=ctx.createLinearGradient(bx,0,bx+bw,0);
    sg.addColorStop(0,'#00f5ff'); sg.addColorStop(0.6,'#bf5fff'); sg.addColorStop(1,'#ff2d78');
    ctx.shadowColor=sg; ctx.shadowBlur=6;
    ctx.fillStyle=sg; ctx.beginPath(); ctx.roundRect(bx,by,bw*pct,bh,2); ctx.fill();
    ctx.shadowBlur=0;
    ctx.fillStyle='rgba(255,255,255,0.5)'; ctx.font='9px monospace';
    ctx.fillText('SPD', bx, by-1);
    ctx.restore();
  }

  /* ══ DEAD OVERLAY ═══════════════════════════════════════════════════ */
  function drawDead() {
    ctx.fillStyle='rgba(0,0,0,0.65)'; ctx.fillRect(0,0,W,H);
    for(let i=0;i<5;i++){
      ctx.fillStyle=`rgba(255,0,80,0.14)`;
      ctx.fillRect(0, 40+i*40+Math.sin(deadTimer*0.3+i)*8, W, 6);
    }
    ctx.textAlign='center';
    if(newBest){
      ctx.shadowColor='#ffd740'; ctx.shadowBlur=18;
      ctx.fillStyle='#ffd740'; ctx.font='bold 13px monospace';
      ctx.fillText('✨ NEUER REKORD!', W/2, H/2-48);
      ctx.shadowBlur=0;
    }
    ctx.shadowColor='#ff2d78'; ctx.shadowBlur=20;
    ctx.fillStyle='#ff2d78'; ctx.font='bold 28px monospace';
    ctx.fillText('GAME OVER', W/2, H/2-22);
    ctx.shadowBlur=0;
    ctx.fillStyle='rgba(255,255,255,0.9)'; ctx.font='14px monospace';
    ctx.fillText(`SCORE: ${score}`, W/2, H/2+8);
    if(highScore>0&&!newBest){
      ctx.fillStyle='rgba(255,220,80,0.7)'; ctx.font='11px monospace';
      ctx.fillText(`BEST: ${highScore}`, W/2, H/2+26);
    }
    ctx.fillStyle='rgba(200,200,200,0.55)'; ctx.font='11px monospace';
    ctx.fillText('TAP TO RESTART', W/2, H/2+(newBest||highScore>0?46:32));
    ctx.textAlign='left';
  }

  /* ══ COLLISION ══════════════════════════════════════════════════════ */
  function hitTest(obj, cx, cy, hw, hh) {
    return Math.abs(cx-obj.x)<hw && Math.abs(cy-laneY(obj.lane))<hh;
  }

  /* ══ SPAWN ══════════════════════════════════════════════════════════ */
  function spawnObstacle() {
    const l = Math.floor(Math.random()*3);
    const types = ['barrier','tall','normal','car'];
    const weights= [0.35, 0.25, 0.2, 0.2];
    let r=Math.random(), type='barrier';
    let cum=0;
    for(let i=0;i<types.length;i++){cum+=weights[i];if(r<cum){type=types[i];break;}}
    obstacles.push({x:W+30, lane:l, type});
  }
  function spawnCoin() {
    obstacles.push; // unused
    const l=Math.floor(Math.random()*3);
    coins.push({x:W+10,lane:l,collected:false});
  }

  function moveUp()   { if(deadTimer>=0){restart();return;} if(lane>0){lane--;charY=laneY(lane);} }
  function moveDown() { if(deadTimer>=0){restart();return;} if(lane<2){lane++;charY=laneY(lane);} }
  function jump()     { if(deadTimer>=0){restart();return;} if(!jumping){jumping=true;jumpV=-9;} }
  function restart()  { init(); }

  /* ══ MAIN LOOP ══════════════════════════════════════════════════════ */
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

    if (jumping) {
      charY += jumpV; jumpV += 0.7;
      if (charY >= laneY(lane)) { charY = laneY(lane); jumping=false; jumpV=0; }
    }

    if (frame%300===0) speed=Math.min(speed+0.4,10);

    spawnTimer++;
    const interval = Math.max(50,110-speed*5);
    if (spawnTimer >= interval) {
      spawnTimer=0; spawnObstacle();
      if (Math.random()<0.55) spawnCoin();
    }

    obstacles.forEach(ob=>{ ob.x-=speed; });
    obstacles = obstacles.filter(ob=>ob.x>-60);
    coins.forEach(c=>{ c.x-=speed; });
    coins = coins.filter(c=>c.x>-20&&!c.collected);
    particles.forEach(p=>{ p.x+=p.vx;p.y+=p.vy;p.vx*=0.91;p.vy*=0.91;p.life-=0.04; });
    particles = particles.filter(p=>p.life>0);

    // Coin collect
    coins.forEach(c=>{
      if (!c.collected && hitTest(c,CHAR_X,charY-12,18,20)){
        c.collected=true; score+=10; scoreEl.textContent=score;
        addParticles(c.x,laneY(c.lane)-12,'#f59e0b',6);
      }
    });

    // Invincibility countdown
    if(invincible){ invincTimer--; if(invincTimer<=0) invincible=false; }

    // Obstacle collision
    if(!invincible){
      for (const ob of obstacles) {
        const h = ob.type==='tall'?44:ob.type==='car'?22:30;
        const oy = laneY(ob.lane);
        const hw = ob.type==='car'?22:15;
        if (Math.abs(CHAR_X-ob.x)<hw+6 && charY-14<oy+10 && charY+10>oy-h){
          addParticles(CHAR_X,charY,'#ff2d78',10);
          lives--;
          if(lives<=0){
            addParticles(CHAR_X,charY,'#fbbf24',8);
            newBest = score>highScore;
            if(newBest){highScore=score;localStorage.setItem('runner_hs',highScore);}
            deadTimer=0; return;
          }
          invincible=true; invincTimer=120; break;
        }
      }
    }

    if (frame%6===0){ score++; scoreEl.textContent=score; }

    drawBg();
    coins.forEach(drawCoin);
    obstacles.forEach(drawObstacle);
    drawParticles();
    if(!invincible || Math.floor(invincTimer/8)%2===0) drawChar(CHAR_X,charY,false);
    drawHud();
  }

  /* ══ INPUT ══════════════════════════════════════════════════════════ */
  document.getElementById('runner-up')  .addEventListener('click', moveUp);
  document.getElementById('runner-down').addEventListener('click', moveDown);

  function onKey(e) {
    if (e.key==='ArrowUp'   ||e.key==='w'){e.preventDefault();moveUp();}
    if (e.key==='ArrowDown' ||e.key==='s'){e.preventDefault();moveDown();}
    if (e.key===' ')                       {e.preventDefault();jump();}
  }

  let tSY=0,tSX=0;
  canvas.addEventListener('touchstart',e=>{tSY=e.touches[0].clientY;tSX=e.touches[0].clientX;},{passive:true});
  canvas.addEventListener('touchend',e=>{
    const dy=e.changedTouches[0].clientY-tSY, dx=e.changedTouches[0].clientX-tSX;
    if(Math.abs(dy)<10&&Math.abs(dx)<10){jump();return;}
    if(Math.abs(dy)>Math.abs(dx)){if(dy<-20)moveUp();else moveDown();}
  },{passive:true});
  canvas.addEventListener('click',()=>{if(deadTimer>=0)restart();});

  /* ══ PUBLIC API ═════════════════════════════════════════════════════ */
  window.startRunner = function () {
    if (running) stopRunner();
    running = true; init();
    document.addEventListener('keydown', onKey);
    raf = requestAnimationFrame(loop);
  };
  window.stopRunner = function () {
    running = false;
    document.removeEventListener('keydown', onKey);
    cancelAnimationFrame(raf);
  };
})();
