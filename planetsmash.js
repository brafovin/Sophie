/* ══ Planet Smash ════════════════════════════════════════════════════════ */
(function () {
  const canvas   = document.getElementById('planet-canvas');
  const ctx      = canvas.getContext('2d');
  const scoreEl  = document.getElementById('planet-score');
  const resetBtn = document.getElementById('planet-reset');

  const SIZE = 320;
  canvas.width = canvas.height = SIZE;
  const CX = SIZE / 2, CY = SIZE / 2, PR = 122; // planet radius

  let running = false, raf, frame = 0;
  let currentPlanetType = 'earth';
  let weapon = 'missile';
  let craters, projectiles, particles, effects;
  let hp, rotOffset, shakeTimer, shakeAmt;
  let planetOff;  // offscreen canvas for planet texture (width = SIZE*2 for wrap)
  let destroyed = false;
  let destroyTimer = 0;
  let chunks = [];
  let spaceBg = null, starField = [];

  // Per-planet atmosphere halo colours [R,G,B]
  const ATM_COLS = {
    earth: [80,165,255], mars: [220,100,55], gas: [200,168,110],
    ice: [155,210,245], lava: [255,75,0], moon: null,
    ocean: [40,135,225], alien: [130,50,235],
  };

  function initSpace() {
    const rng = mulberry32(77);
    starField = [];
    for (let i = 0; i < 120; i++) {
      const t = rng();
      starField.push({
        x: rng() * SIZE, y: rng() * SIZE,
        r: t < 0.06 ? 1.6 + rng() * 0.8 : (t < 0.22 ? 0.9 + rng() * 0.5 : 0.25 + rng() * 0.45),
        alpha: 0.35 + rng() * 0.65,
        phase: rng() * Math.PI * 2,
        twSpd: 0.016 + rng() * 0.036,
        hue: t < 0.08 ? 210 : (t < 0.18 ? 220 : (t < 0.58 ? -1 : (t < 0.78 ? 48 : (t < 0.92 ? 22 : 0)))),
        sat: t < 0.08 ? 80  : (t < 0.18 ? 55  : (t < 0.58 ?  0 : (t < 0.78 ? 50 : (t < 0.92 ? 65 : 70)))),
        bright: t < 0.07,
      });
    }
    spaceBg = document.createElement('canvas');
    spaceBg.width = spaceBg.height = SIZE;
    const nc = spaceBg.getContext('2d');
    // Milky-way band
    const mw = nc.createLinearGradient(0, 0, SIZE, SIZE);
    mw.addColorStop(0,   'rgba(200,200,255,0)');
    mw.addColorStop(0.4, 'rgba(210,215,255,0.05)');
    mw.addColorStop(0.6, 'rgba(210,215,255,0.05)');
    mw.addColorStop(1,   'rgba(200,200,255,0)');
    nc.fillStyle = mw; nc.fillRect(0, 0, SIZE, SIZE);
    // Nebula clouds
    const neb = [
      { x:SIZE*0.24, y:SIZE*0.22, r:72,  h:285, s:70, l:25, a:0.14 },
      { x:SIZE*0.76, y:SIZE*0.18, r:55,  h:210, s:65, l:20, a:0.12 },
      { x:SIZE*0.55, y:SIZE*0.70, r:80,  h:330, s:72, l:27, a:0.10 },
      { x:SIZE*0.12, y:SIZE*0.62, r:50,  h:258, s:60, l:20, a:0.09 },
      { x:SIZE*0.84, y:SIZE*0.55, r:62,  h:185, s:68, l:22, a:0.11 },
    ];
    for (const n of neb) {
      const g = nc.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
      g.addColorStop(0,   `hsla(${n.h},${n.s}%,${n.l}%,${n.a})`);
      g.addColorStop(0.4, `hsla(${n.h},${n.s}%,${n.l}%,${n.a*0.5})`);
      g.addColorStop(1,   `hsla(${n.h},${n.s}%,${n.l}%,0)`);
      nc.fillStyle = g;
      nc.fillRect(n.x - n.r, n.y - n.r, n.r * 2, n.r * 2);
    }
  }

  /* ── RNG ──────────────────────────────────────────────────────────── */
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let z = Math.imul(seed ^ seed >>> 15, 1 | seed);
      z = z + Math.imul(z ^ z >>> 7, 61 | z) ^ z;
      return ((z ^ z >>> 14) >>> 0) / 4294967296;
    };
  }

  /* ══ PLANET BUILDERS ═════════════════════════════════════════════════ */
  // Each builder draws onto a (SIZE*2 × SIZE) canvas so we can scroll it for rotation.

  function buildEarth(pc, rng, W) {
    // Deep ocean base
    const ocean = pc.createRadialGradient(W * 0.4, CY - 20, 10, W * 0.5, CY, PR * 1.1);
    ocean.addColorStop(0,   '#2a7fc0');
    ocean.addColorStop(0.5, '#1a5ea8');
    ocean.addColorStop(1,   '#0d3660');
    pc.fillStyle = ocean;
    fillCircle(pc, W / 2, CY, PR + 2);

    // Continents – green/brown irregular blobs
    const contColors = ['#2d7a2d','#3a8c2d','#5d4e37','#4a7c3a','#6b5233'];
    for (let i = 0; i < 14; i++) {
      const angle = rng() * Math.PI * 2;
      const dist  = rng() * PR * 0.75;
      const bx    = W / 2 + Math.cos(angle) * dist;
      const by    = CY + Math.sin(angle) * dist;
      const br    = 14 + rng() * 28;
      pc.fillStyle = contColors[i % contColors.length];
      pc.beginPath(); pc.arc(bx, by, br, 0, Math.PI * 2); pc.fill();
      // sub-blob for shape variation
      pc.fillStyle = contColors[(i + 2) % contColors.length];
      pc.beginPath(); pc.arc(bx + rng() * 14 - 7, by + rng() * 14 - 7, br * 0.6, 0, Math.PI * 2); pc.fill();
    }

    // Mountain ridges (darker thin strokes on some continents)
    pc.strokeStyle = 'rgba(60,35,10,0.35)';
    pc.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const mx = W / 2 + (rng() - 0.5) * PR * 1.2;
      const my = CY + (rng() - 0.5) * PR * 1.2;
      pc.beginPath(); pc.moveTo(mx, my); pc.lineTo(mx + (rng()-0.5)*20, my + (rng()-0.5)*20); pc.stroke();
    }

    // Polar ice caps
    pc.fillStyle = 'rgba(230,245,255,0.85)';
    pc.beginPath(); pc.arc(W / 2, CY - PR + 10, 28, 0, Math.PI * 2); pc.fill();
    pc.beginPath(); pc.arc(W / 2, CY + PR - 10, 18, 0, Math.PI * 2); pc.fill();
    // Ice cap edge softening
    const iceFade = pc.createRadialGradient(W / 2, CY - PR + 10, 12, W / 2, CY - PR + 10, 32);
    iceFade.addColorStop(0, 'rgba(220,240,255,0.6)');
    iceFade.addColorStop(1, 'rgba(220,240,255,0)');
    pc.fillStyle = iceFade; fillCircle(pc, W / 2, CY - PR + 10, 38);

    // Cloud wisps
    pc.fillStyle = 'rgba(255,255,255,0.28)';
    for (let i = 0; i < 8; i++) {
      const cx2 = W / 2 + (rng() - 0.5) * PR * 1.4;
      const cy2 = CY + (rng() - 0.5) * PR * 1.2;
      pc.beginPath(); pc.ellipse(cx2, cy2, 30 + rng() * 22, 8 + rng() * 6, rng() * Math.PI, 0, Math.PI * 2); pc.fill();
    }

    // Blue atmosphere glow at rim
    const atm = pc.createRadialGradient(W / 2, CY, PR * 0.82, W / 2, CY, PR);
    atm.addColorStop(0, 'rgba(80,160,255,0)');
    atm.addColorStop(1, 'rgba(80,160,255,0.55)');
    pc.fillStyle = atm; fillCircle(pc, W / 2, CY, PR);
  }

  function buildMars(pc, rng, W) {
    const base = pc.createRadialGradient(W * 0.38, CY - 25, 8, W / 2, CY, PR);
    base.addColorStop(0,   '#d45f2a');
    base.addColorStop(0.5, '#a83510');
    base.addColorStop(1,   '#6b1e08');
    pc.fillStyle = base; fillCircle(pc, W / 2, CY, PR + 2);

    // Surface variation – lighter/darker patches
    for (let i = 0; i < 12; i++) {
      const angle = rng() * Math.PI * 2;
      const dist  = rng() * PR * 0.8;
      const bx    = W / 2 + Math.cos(angle) * dist;
      const by    = CY + Math.sin(angle) * dist;
      const br    = 12 + rng() * 30;
      pc.fillStyle = rng() > 0.5 ? 'rgba(200,100,40,0.35)' : 'rgba(80,20,5,0.4)';
      pc.beginPath(); pc.arc(bx, by, br, 0, Math.PI * 2); pc.fill();
    }

    // Natural craters (pre-baked)
    for (let i = 0; i < 7; i++) {
      const angle = rng() * Math.PI * 2;
      const dist  = rng() * PR * 0.7;
      const bx    = W / 2 + Math.cos(angle) * dist;
      const by    = CY + Math.sin(angle) * dist;
      const br    = 6 + rng() * 14;
      const cg    = pc.createRadialGradient(bx, by, 0, bx, by, br);
      cg.addColorStop(0, 'rgba(30,8,2,0.9)'); cg.addColorStop(0.7, 'rgba(80,20,5,0.5)'); cg.addColorStop(1, 'rgba(0,0,0,0)');
      pc.fillStyle = cg; pc.beginPath(); pc.arc(bx, by, br, 0, Math.PI * 2); pc.fill();
    }

    // Dust storm swirl
    pc.strokeStyle = 'rgba(220,150,80,0.22)';
    pc.lineWidth = 8;
    pc.beginPath();
    pc.arc(W / 2 + 20, CY - 10, 40, 0.2, 2.8);
    pc.stroke();

    // Thin north polar cap
    pc.fillStyle = 'rgba(230,240,255,0.65)';
    pc.beginPath(); pc.arc(W / 2, CY - PR + 8, 16, 0, Math.PI * 2); pc.fill();

    // Thin pink-orange atmosphere
    const atm = pc.createRadialGradient(W / 2, CY, PR * 0.88, W / 2, CY, PR);
    atm.addColorStop(0, 'rgba(220,100,40,0)');
    atm.addColorStop(1, 'rgba(220,100,40,0.38)');
    pc.fillStyle = atm; fillCircle(pc, W / 2, CY, PR);
  }

  function buildGas(pc, rng, W) {
    // Base cream
    pc.fillStyle = '#dbc89a'; fillCircle(pc, W / 2, CY, PR + 2);

    // Horizontal bands
    const bands = [
      { y: -1.0, h: 0.20, color: 'rgba(180,130,70,0.7)' },
      { y: -0.75, h: 0.15, color: 'rgba(220,190,140,0.5)' },
      { y: -0.55, h: 0.25, color: 'rgba(160,100,50,0.65)' },
      { y: -0.28, h: 0.18, color: 'rgba(200,160,100,0.45)' },
      { y: -0.08, h: 0.22, color: 'rgba(140,80,40,0.55)' },
      { y:  0.16, h: 0.28, color: 'rgba(210,175,120,0.5)' },
      { y:  0.46, h: 0.20, color: 'rgba(155,95,45,0.6)' },
      { y:  0.68, h: 0.18, color: 'rgba(225,195,150,0.4)' },
      { y:  0.88, h: 0.20, color: 'rgba(170,110,55,0.55)' },
    ];
    pc.save();
    pc.beginPath(); pc.arc(W / 2, CY, PR, 0, Math.PI * 2); pc.clip();
    bands.forEach(b => {
      const by = CY + b.y * PR;
      const bh = b.h * PR * 2;
      pc.fillStyle = b.color;
      // wavy band using bezier
      pc.beginPath();
      pc.moveTo(W / 2 - PR - 10, by);
      const wave = 4;
      pc.bezierCurveTo(W / 2 - PR / 2, by - wave, W / 2 + PR / 2, by + wave, W / 2 + PR + 10, by);
      pc.lineTo(W / 2 + PR + 10, by + bh);
      pc.bezierCurveTo(W / 2 + PR / 2, by + bh + wave, W / 2 - PR / 2, by + bh - wave, W / 2 - PR - 10, by + bh);
      pc.closePath(); pc.fill();
    });

    // Great Red Spot
    const spotX = W / 2 + 18, spotY = CY + 22;
    const spotG = pc.createRadialGradient(spotX, spotY, 2, spotX, spotY, 20);
    spotG.addColorStop(0, 'rgba(180,50,30,0.85)');
    spotG.addColorStop(0.5, 'rgba(160,60,40,0.6)');
    spotG.addColorStop(1, 'rgba(140,70,40,0)');
    pc.fillStyle = spotG;
    pc.beginPath(); pc.ellipse(spotX, spotY, 22, 13, -0.2, 0, Math.PI * 2); pc.fill();
    pc.restore();

    // Atmosphere – subtle brown-orange glow
    const atm = pc.createRadialGradient(W / 2, CY, PR * 0.87, W / 2, CY, PR);
    atm.addColorStop(0, 'rgba(200,160,80,0)');
    atm.addColorStop(1, 'rgba(200,160,80,0.4)');
    pc.fillStyle = atm; fillCircle(pc, W / 2, CY, PR);
  }

  function buildIce(pc, rng, W) {
    const base = pc.createRadialGradient(W * 0.38, CY - 30, 5, W / 2, CY, PR);
    base.addColorStop(0,   '#eef7ff');
    base.addColorStop(0.5, '#c5dff0');
    base.addColorStop(1,   '#7bafc8');
    pc.fillStyle = base; fillCircle(pc, W / 2, CY, PR + 2);

    // Ice patches
    for (let i = 0; i < 10; i++) {
      const angle = rng() * Math.PI * 2;
      const dist  = rng() * PR * 0.8;
      pc.fillStyle = `rgba(200,230,255,${0.2 + rng() * 0.3})`;
      pc.beginPath(); pc.arc(W / 2 + Math.cos(angle) * dist, CY + Math.sin(angle) * dist, 15 + rng() * 25, 0, Math.PI * 2); pc.fill();
    }

    // Ice rifts (cracks)
    pc.strokeStyle = 'rgba(120,185,220,0.65)';
    pc.lineWidth = 1.5;
    for (let i = 0; i < 10; i++) {
      const sx = W / 2 + (rng() - 0.5) * PR * 1.2;
      const sy = CY + (rng() - 0.5) * PR * 1.2;
      pc.beginPath(); pc.moveTo(sx, sy);
      for (let j = 0; j < 3; j++) pc.lineTo(sx + (rng()-0.5)*40, sy + (rng()-0.5)*40);
      pc.stroke();
    }

    // Thick pale atmosphere
    const atm = pc.createRadialGradient(W / 2, CY, PR * 0.80, W / 2, CY, PR);
    atm.addColorStop(0, 'rgba(180,230,255,0)');
    atm.addColorStop(1, 'rgba(180,230,255,0.65)');
    pc.fillStyle = atm; fillCircle(pc, W / 2, CY, PR);
  }

  function buildLava(pc, rng, W) {
    // Dark base
    pc.fillStyle = '#0e0804'; fillCircle(pc, W / 2, CY, PR + 2);

    // Lava rivers network
    pc.save();
    pc.beginPath(); pc.arc(W / 2, CY, PR, 0, Math.PI * 2); pc.clip();
    for (let i = 0; i < 18; i++) {
      const sx = W / 2 + (rng() - 0.5) * PR * 2;
      const sy = CY + (rng() - 0.5) * PR * 2;
      const ex = W / 2 + (rng() - 0.5) * PR * 2;
      const ey = CY + (rng() - 0.5) * PR * 2;
      const heat = rng();
      const lavaCols = ['#ff6a00','#ff4500','#ff8c00','#ffd700'];
      pc.strokeStyle = lavaCols[Math.floor(rng() * lavaCols.length)];
      pc.globalAlpha = 0.5 + heat * 0.4;
      pc.lineWidth = 1 + rng() * 3;
      pc.beginPath(); pc.moveTo(sx, sy);
      pc.quadraticCurveTo(W / 2 + (rng()-0.5)*60, CY + (rng()-0.5)*60, ex, ey);
      pc.stroke();
    }
    pc.globalAlpha = 1;

    // Lava pools (bright spots)
    for (let i = 0; i < 5; i++) {
      const angle = rng() * Math.PI * 2;
      const dist  = rng() * PR * 0.7;
      const bx    = W / 2 + Math.cos(angle) * dist;
      const by    = CY + Math.sin(angle) * dist;
      const poolG = pc.createRadialGradient(bx, by, 0, bx, by, 12 + rng() * 10);
      poolG.addColorStop(0, '#fff700'); poolG.addColorStop(0.4, '#ff6a00'); poolG.addColorStop(1, 'rgba(255,50,0,0)');
      pc.fillStyle = poolG; pc.beginPath(); pc.arc(bx, by, 22, 0, Math.PI * 2); pc.fill();
    }
    pc.restore();

    // Orange atmosphere glow
    const atm = pc.createRadialGradient(W / 2, CY, PR * 0.85, W / 2, CY, PR);
    atm.addColorStop(0, 'rgba(255,80,0,0)');
    atm.addColorStop(1, 'rgba(255,80,0,0.55)');
    pc.fillStyle = atm; fillCircle(pc, W / 2, CY, PR);
  }

  function buildMoon(pc, rng, W) {
    const base = pc.createRadialGradient(W * 0.38, CY - 25, 5, W / 2, CY, PR);
    base.addColorStop(0,   '#c8c8c8');
    base.addColorStop(0.5, '#909090');
    base.addColorStop(1,   '#505050');
    pc.fillStyle = base; fillCircle(pc, W / 2, CY, PR + 2);

    // Many pre-baked craters
    for (let i = 0; i < 18; i++) {
      const angle = rng() * Math.PI * 2;
      const dist  = rng() * PR * 0.82;
      const bx    = W / 2 + Math.cos(angle) * dist;
      const by    = CY + Math.sin(angle) * dist;
      const br    = 4 + rng() * 18;
      const cg    = pc.createRadialGradient(bx, by, 0, bx, by, br);
      cg.addColorStop(0, 'rgba(30,30,30,0.95)'); cg.addColorStop(0.55, 'rgba(70,70,70,0.7)'); cg.addColorStop(0.85, 'rgba(180,180,180,0.3)'); cg.addColorStop(1, 'rgba(0,0,0,0)');
      pc.fillStyle = cg; pc.beginPath(); pc.arc(bx, by, br, 0, Math.PI * 2); pc.fill();
    }

    // Terminator shadow (hard shadow one side)
    const shadow = pc.createLinearGradient(W / 2 - PR, CY, W / 2 + PR * 0.3, CY);
    shadow.addColorStop(0, 'rgba(0,0,0,0.0)');
    shadow.addColorStop(0.65, 'rgba(0,0,0,0.0)');
    shadow.addColorStop(1,   'rgba(0,0,0,0.55)');
    pc.fillStyle = shadow; fillCircle(pc, W / 2, CY, PR);

    // No atmosphere (edges stay dark – done by clip)
  }

  function buildOcean(pc, rng, W) {
    const base = pc.createRadialGradient(W * 0.4, CY - 20, 5, W / 2, CY, PR);
    base.addColorStop(0,   '#1a6e9c');
    base.addColorStop(0.5, '#0d4b75');
    base.addColorStop(1,   '#062b4a');
    pc.fillStyle = base; fillCircle(pc, W / 2, CY, PR + 2);

    // Wave swirls
    pc.save();
    pc.beginPath(); pc.arc(W / 2, CY, PR, 0, Math.PI * 2); pc.clip();
    pc.strokeStyle = 'rgba(80,180,220,0.2)';
    pc.lineWidth = 3;
    for (let i = 0; i < 10; i++) {
      const cx2 = W / 2 + (rng() - 0.5) * PR * 1.5;
      const cy2 = CY + (rng() - 0.5) * PR * 1.5;
      const r2  = 20 + rng() * 40;
      pc.beginPath(); pc.arc(cx2, cy2, r2, 0, Math.PI * 2); pc.stroke();
    }
    pc.restore();

    // Reflection highlight
    const refl = pc.createRadialGradient(W / 2 - 30, CY - 30, 2, W / 2 - 20, CY - 20, 50);
    refl.addColorStop(0, 'rgba(180,230,255,0.35)');
    refl.addColorStop(1, 'rgba(180,230,255,0)');
    pc.fillStyle = refl; fillCircle(pc, W / 2 - 20, CY - 20, 55);

    // Thick blue atmosphere
    const atm = pc.createRadialGradient(W / 2, CY, PR * 0.80, W / 2, CY, PR);
    atm.addColorStop(0, 'rgba(40,140,220,0)');
    atm.addColorStop(1, 'rgba(40,140,220,0.65)');
    pc.fillStyle = atm; fillCircle(pc, W / 2, CY, PR);
  }

  function buildAlien(pc, rng, W) {
    const base = pc.createRadialGradient(W * 0.4, CY - 20, 5, W / 2, CY, PR);
    base.addColorStop(0,   '#4a1f7c');
    base.addColorStop(0.5, '#2d1050');
    base.addColorStop(1,   '#160830');
    pc.fillStyle = base; fillCircle(pc, W / 2, CY, PR + 2);

    // Alien crystal formations – teal/cyan blobs
    for (let i = 0; i < 10; i++) {
      const angle = rng() * Math.PI * 2;
      const dist  = rng() * PR * 0.75;
      const bx    = W / 2 + Math.cos(angle) * dist;
      const by    = CY + Math.sin(angle) * dist;
      const br    = 10 + rng() * 22;
      pc.fillStyle = rng() > 0.5 ? `rgba(0,200,180,0.4)` : `rgba(100,50,200,0.4)`;
      pc.beginPath(); pc.arc(bx, by, br, 0, Math.PI * 2); pc.fill();
    }

    // Bioluminescent spots
    for (let i = 0; i < 8; i++) {
      const angle = rng() * Math.PI * 2;
      const dist  = rng() * PR * 0.7;
      const bx    = W / 2 + Math.cos(angle) * dist;
      const by    = CY + Math.sin(angle) * dist;
      const glow  = pc.createRadialGradient(bx, by, 0, bx, by, 12);
      glow.addColorStop(0, 'rgba(0,255,180,0.8)');
      glow.addColorStop(1, 'rgba(0,255,180,0)');
      pc.fillStyle = glow; pc.beginPath(); pc.arc(bx, by, 12, 0, Math.PI * 2); pc.fill();
    }

    // Purple-green atmosphere
    const atm = pc.createRadialGradient(W / 2, CY, PR * 0.83, W / 2, CY, PR);
    atm.addColorStop(0, 'rgba(100,0,200,0)');
    atm.addColorStop(0.5, 'rgba(80,200,100,0.2)');
    atm.addColorStop(1,   'rgba(120,0,255,0.55)');
    pc.fillStyle = atm; fillCircle(pc, W / 2, CY, PR);
  }

  function fillCircle(pc2, x, y, r) {
    pc2.beginPath(); pc2.arc(x, y, r, 0, Math.PI * 2); pc2.fill();
  }

  const BUILDERS = { earth: buildEarth, mars: buildMars, gas: buildGas, ice: buildIce, lava: buildLava, moon: buildMoon, ocean: buildOcean, alien: buildAlien };

  function buildPlanet() {
    const W = SIZE * 2; // wide for horizontal scroll
    planetOff = document.createElement('canvas');
    planetOff.width = W; planetOff.height = SIZE;
    const pc  = planetOff.getContext('2d');
    const rng = mulberry32(Math.random() * 99999 | 0);

    // Draw the texture mirrored twice so wrapping is seamless
    for (const ox of [0, SIZE]) {
      pc.save(); pc.translate(ox, 0);
      const builder = BUILDERS[currentPlanetType] || buildEarth;
      builder(pc, rng, SIZE);
      pc.restore();
    }

    // Clip each half to a circle
    const clip = document.createElement('canvas');
    clip.width = SIZE; clip.height = SIZE;
    const cc = clip.getContext('2d');
    for (let half = 0; half < 2; half++) {
      cc.clearRect(0, 0, SIZE, SIZE);
      cc.save();
      cc.beginPath(); cc.arc(CX, CY, PR, 0, Math.PI * 2); cc.clip();
      cc.drawImage(planetOff, -half * SIZE, 0);
      cc.restore();
      // copy clipped half back
      const pc2 = planetOff.getContext('2d');
      pc2.clearRect(half * SIZE, 0, SIZE, SIZE);
      pc2.drawImage(clip, half * SIZE, 0);
    }

    // Add specular shine on top of both halves
    const spc = planetOff.getContext('2d');
    for (const ox of [0, SIZE]) {
      const spec = spc.createRadialGradient(ox + CX - 40, CY - 40, 3, ox + CX - 28, CY - 28, 60);
      spec.addColorStop(0, 'rgba(255,255,255,0.10)');
      spec.addColorStop(1, 'rgba(255,255,255,0)');
      spc.save();
      spc.beginPath(); spc.arc(ox + CX, CY, PR, 0, Math.PI * 2); spc.clip();
      spc.fillStyle = spec; spc.fillRect(ox, 0, SIZE, SIZE);
      spc.restore();
    }
  }

  /* ══ PARTICLE / EFFECT HELPERS ═══════════════════════════════════════ */
  function burst(x, y, color, n, spd = 5, lifeDecay = 0.025) {
    for (let i = 0; i < n; i++) {
      const angle = Math.random() * Math.PI * 2;
      const s     = 0.5 + Math.random() * spd;
      particles.push({ x, y, vx: Math.cos(angle)*s, vy: Math.sin(angle)*s, life: 1, r: 2 + Math.random()*4, color, decay: lifeDecay });
    }
  }

  function addChunks(x, y) {
    const colors = { earth:'#2d7a2d', mars:'#a83510', gas:'#c09050', ice:'#c5dff0', lava:'#1a0800', moon:'#909090', ocean:'#0d4b75', alien:'#4a1f7c' };
    const col = colors[currentPlanetType] || '#808080';
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd   = 3 + Math.random() * 6;
      chunks.push({ x, y, vx: Math.cos(angle)*spd, vy: Math.sin(angle)*spd - 2, r: 4 + Math.random()*10, rot: Math.random()*Math.PI*2, rotV: (Math.random()-0.5)*0.2, life: 1, color: col, decay: 0.015 });
    }
  }

  /* ══ WEAPON DEFINITIONS ══════════════════════════════════════════════ */
  const WEAPON_CFG = {
    missile:   { spd: 6,  craterR: 0.22, dmg: 5,  pn: 14, pSpd: 5,  shake: [8, 12],  col: '#f97316', emoji: '💣', size: 18 },
    laser:     { spd: 22, craterR: 0.10, dmg: 3,  pn: 5,  pSpd: 3,  shake: [0, 0],   col: '#ef4444', emoji: null, size: 0 },
    asteroid:  { spd: 3.5,craterR: 0.35, dmg: 9,  pn: 24, pSpd: 6,  shake: [18, 20], col: '#78716c', emoji: '☄️', size: 22 },
    nuke:      { spd: 4,  craterR: 0.60, dmg: 22, pn: 50, pSpd: 10, shake: [35, 30], col: '#fbbf24', emoji: '💥', size: 28 },
    blackhole: { spd: 0,  craterR: 0.70, dmg: 30, pn: 0,  pSpd: 0,  shake: [20, 60], col: '#7c3aed', emoji: '🕳️', size: 30 },
    ioncannon: { spd: 30, craterR: 0.08, dmg: 4,  pn: 4,  pSpd: 4,  shake: [3, 5],   col: '#22d3ee', emoji: null, size: 0 },
    meteors:   { spd: 5,  craterR: 0.12, dmg: 2,  pn: 6,  pSpd: 4,  shake: [4, 8],   col: '#a78bfa', emoji: '🌠', size: 14 },
    solarflare:{ spd: 0,  craterR: 0.18, dmg: 15, pn: 30, pSpd: 8,  shake: [12, 25], col: '#fde68a', emoji: null, size: 0 },
  };

  /* ══ FIRE ════════════════════════════════════════════════════════════ */
  function fire(mx, my) {
    if (!running || destroyed) return;
    const cfg = WEAPON_CFG[weapon];

    if (weapon === 'blackhole') {
      fireBlackhole(mx, my);
    } else if (weapon === 'meteors') {
      fireMeteors();
    } else if (weapon === 'solarflare') {
      fireSolarFlare();
    } else {
      const dx  = CX - mx, dy = CY - my;
      const len = Math.hypot(dx, dy) || 1;
      projectiles.push({
        x: mx, y: my,
        vx: (dx / len) * cfg.spd,
        vy: (dy / len) * cfg.spd,
        weapon, cfg, trail: [],
        isBeam: weapon === 'laser' || weapon === 'ioncannon',
        trailX: mx, trailY: my,
      });
    }
  }

  function fireBlackhole(mx, my) {
    // Clamp position near planet edge
    const angle = Math.atan2(my - CY, mx - CX);
    const dist  = PR + 20;
    effects.push({
      type: 'blackhole',
      x: CX + Math.cos(angle) * dist,
      y: CY + Math.sin(angle) * dist,
      life: 1, timer: 90, phase: 0,
      angle,
    });
  }

  function fireMeteors() {
    for (let i = 0; i < 15; i++) {
      setTimeout(() => {
        if (!running || destroyed) return;
        const tx   = CX + (Math.random() - 0.5) * PR * 1.4;
        const startX = CX + (Math.random() - 0.5) * SIZE * 0.8;
        const dx = tx - startX, dy = SIZE;
        const len = Math.hypot(dx, dy) || 1;
        projectiles.push({
          x: startX, y: -10,
          vx: (dx / len) * 5.5, vy: (dy / len) * 5.5,
          weapon: 'meteors', cfg: WEAPON_CFG.meteors,
          trail: [], isBeam: false, trailX: startX, trailY: -10,
        });
      }, i * 120 + Math.random() * 60);
    }
  }

  function fireSolarFlare() {
    effects.push({ type: 'solarflare', timer: 45, life: 1 });
    // Apply many craters along a band after a short delay
    setTimeout(() => {
      if (!running || destroyed) return;
      const cfg = WEAPON_CFG.solarflare;
      for (let i = 0; i < 8; i++) {
        const angle = (Math.random() - 0.5) * Math.PI * 0.7 + Math.PI; // left side
        const dist  = PR * (0.3 + Math.random() * 0.65);
        const hitX  = CX + Math.cos(angle) * dist;
        const hitY  = CY + Math.sin(angle) * dist;
        impactPlanet(hitX, hitY, cfg, 'solarflare');
      }
      // Light damage
      hp = Math.max(0, hp - cfg.dmg);
      shakeTimer = 25; shakeAmt = 12;
      updateScore();
    }, 400);
  }

  function impactPlanet(hitX, hitY, cfg, wType) {
    craters.push({ x: hitX, y: hitY, r: PR * cfg.craterR, alpha: 1, type: currentPlanetType });
    burst(hitX, hitY, cfg.col, cfg.pn, cfg.pSpd);
    if (cfg.shake[0] > 0) { shakeTimer = cfg.shake[0]; shakeAmt = cfg.shake[1] * 0.1; }
    if (wType === 'nuke') {
      burst(hitX, hitY, '#fff', 25, 12);
      burst(hitX, hitY, '#fbbf24', 20, 8);
    }
    addChunks(hitX, hitY);
  }

  /* ══ DRAW ════════════════════════════════════════════════════════════ */
  function drawSpace() {
    ctx.fillStyle = '#020208';
    ctx.fillRect(0, 0, SIZE, SIZE);
    if (spaceBg) ctx.drawImage(spaceBg, 0, 0);

    for (const s of starField) {
      const tw = 0.65 + 0.35 * Math.sin(frame * s.twSpd + s.phase);
      const a  = s.alpha * tw;
      if (s.bright) {
        ctx.shadowColor = s.hue >= 0 ? `hsl(${s.hue},${s.sat}%,92%)` : '#ffffff';
        ctx.shadowBlur  = 5;
      }
      ctx.fillStyle = s.hue >= 0
        ? `hsla(${s.hue},${s.sat}%,93%,${a})`
        : `rgba(255,255,255,${a})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      if (s.bright) {
        ctx.shadowBlur = 0;
        if (s.r > 1.4) {
          const spk = s.r * 5;
          ctx.strokeStyle = `rgba(255,255,255,${a * 0.32})`;
          ctx.lineWidth = 0.6;
          ctx.beginPath(); ctx.moveTo(s.x - spk, s.y); ctx.lineTo(s.x + spk, s.y); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(s.x, s.y - spk); ctx.lineTo(s.x, s.y + spk); ctx.stroke();
        }
      }
    }
    ctx.shadowBlur = 0;
  }

  function drawPlanet(sx, sy) {
    ctx.save(); ctx.translate(sx, sy);

    // Clip to circle
    ctx.save();
    ctx.beginPath(); ctx.arc(CX, CY, PR, 0, Math.PI * 2); ctx.clip();

    // Scrolling planet texture
    const off = Math.floor(rotOffset) % SIZE;
    ctx.drawImage(planetOff, -off, 0, SIZE, SIZE, 0, 0, SIZE, SIZE);
    ctx.drawImage(planetOff, SIZE - off, 0, SIZE, SIZE, 0, 0, SIZE, SIZE);

    // Damage darkness
    const dmg = 1 - hp / 100;
    if (dmg > 0) {
      ctx.fillStyle = `rgba(0,0,0,${dmg * 0.65})`;
      ctx.fillRect(0, 0, SIZE, SIZE);
    }

    // Craters
    craters.forEach(c => {
      ctx.globalAlpha = c.alpha;
      const cd = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r);
      const lavaGlow = c.type === 'lava';
      cd.addColorStop(0,   lavaGlow ? 'rgba(255,100,0,0.6)'  : 'rgba(0,0,0,0.92)');
      cd.addColorStop(0.5, lavaGlow ? 'rgba(180,40,0,0.5)'   : 'rgba(0,0,0,0.65)');
      cd.addColorStop(0.85,'rgba(0,0,0,0.25)');
      cd.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = cd;
      ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2); ctx.fill();
      // Ejecta rim
      ctx.globalAlpha = c.alpha * 0.45;
      ctx.strokeStyle = c.type === 'lava' ? 'rgba(255,160,0,0.7)' : 'rgba(210,195,160,0.7)';
      ctx.lineWidth = Math.max(1, c.r * 0.12);
      ctx.beginPath(); ctx.arc(c.x, c.y, c.r * 0.88, 0, Math.PI * 2); ctx.stroke();
      // Ejecta rays for larger craters
      if (c.r > 14) {
        ctx.globalAlpha = c.alpha * 0.18;
        ctx.strokeStyle = c.type === 'lava' ? '#ff8c00' : '#e8dfc0';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 8; i++) {
          const a = (Math.PI * 2 * i) / 8;
          ctx.beginPath();
          ctx.moveTo(c.x + Math.cos(a) * c.r * 0.7, c.y + Math.sin(a) * c.r * 0.7);
          ctx.lineTo(c.x + Math.cos(a) * (c.r * 1.8), c.y + Math.sin(a) * (c.r * 1.8));
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    });

    // ── Directional terminator shadow (light from upper-left) ──────────
    const terminator = ctx.createRadialGradient(
      CX - PR * 0.38, CY - PR * 0.30, PR * 0.05,   // bright focal point
      CX + PR * 0.40, CY + PR * 0.32, PR * 1.30    // shadow spreads here
    );
    terminator.addColorStop(0,    'rgba(0,0,0,0)');
    terminator.addColorStop(0.42, 'rgba(0,0,0,0)');
    terminator.addColorStop(0.60, 'rgba(0,0,0,0.18)');
    terminator.addColorStop(0.76, 'rgba(0,0,0,0.52)');
    terminator.addColorStop(0.88, 'rgba(0,0,0,0.76)');
    terminator.addColorStop(1.0,  'rgba(0,0,0,0.90)');
    ctx.fillStyle = terminator;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // ── Sharp specular highlight (focused on lit side) ──────────────────
    const spec = ctx.createRadialGradient(
      CX - PR * 0.36, CY - PR * 0.28, 0,
      CX - PR * 0.30, CY - PR * 0.22, PR * 0.44
    );
    spec.addColorStop(0,    'rgba(255,255,255,0.42)');
    spec.addColorStop(0.22, 'rgba(255,255,255,0.14)');
    spec.addColorStop(0.55, 'rgba(255,255,255,0.04)');
    spec.addColorStop(1,    'rgba(255,255,255,0)');
    ctx.fillStyle = spec;
    ctx.fillRect(0, 0, SIZE, SIZE);

    ctx.restore(); // end planet clip

    // ── Atmosphere halo (outside clip, around limb) ─────────────────────
    const ac = ATM_COLS[currentPlanetType];
    if (ac) {
      const halo = ctx.createRadialGradient(CX, CY, PR * 0.90, CX, CY, PR * 1.24);
      halo.addColorStop(0,    `rgba(${ac[0]},${ac[1]},${ac[2]},0)`);
      halo.addColorStop(0.32, `rgba(${ac[0]},${ac[1]},${ac[2]},0.22)`);
      halo.addColorStop(0.62, `rgba(${ac[0]},${ac[1]},${ac[2]},0.12)`);
      halo.addColorStop(1,    `rgba(${ac[0]},${ac[1]},${ac[2]},0)`);
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(CX, CY, PR * 1.24, 0, Math.PI * 2); ctx.fill();
    }

    // Thin limb edge
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(CX, CY, PR, 0, Math.PI * 2); ctx.stroke();

    ctx.restore(); // end shake translate
  }

  /* ── Saturn-style rings for the gas planet ──────────────────────────── */
  function drawRingsPart(sx, sy, front) {
    if (currentPlanetType !== 'gas') return;
    ctx.save();
    ctx.translate(sx + CX, sy + CY);

    const rings = [
      { r: PR * 1.28, w: 9,  a: 0.38 },
      { r: PR * 1.48, w: 16, a: 0.48 },
      { r: PR * 1.70, w: 11, a: 0.32 },
      { r: PR * 1.93, w: 13, a: 0.40 },
      { r: PR * 2.16, w:  6, a: 0.22 },
    ];

    // Clip to upper (front) or lower (back) half
    ctx.save();
    ctx.beginPath();
    if (front) ctx.rect(-SIZE, -SIZE, SIZE * 2, SIZE);  // upper half
    else       ctx.rect(-SIZE,     0, SIZE * 2, SIZE);  // lower half
    ctx.clip();

    const tilt = 0.27; // vertical squash (perspective)
    for (let i = rings.length - 1; i >= 0; i--) {
      const ring = rings[i];
      const rg = ctx.createLinearGradient(-ring.r, 0, ring.r, 0);
      rg.addColorStop(0,    `rgba(135,112,78,${ring.a * 0.2})`);
      rg.addColorStop(0.14, `rgba(198,170,118,${ring.a * 0.9})`);
      rg.addColorStop(0.33, `rgba(218,188,132,${ring.a})`);
      rg.addColorStop(0.50, `rgba(195,162,110,${ring.a * 0.75})`);
      rg.addColorStop(0.67, `rgba(212,182,128,${ring.a * 0.95})`);
      rg.addColorStop(0.86, `rgba(198,168,116,${ring.a * 0.85})`);
      rg.addColorStop(1,    `rgba(135,112,78,${ring.a * 0.2})`);
      ctx.strokeStyle = rg;
      ctx.lineWidth = ring.w;
      ctx.beginPath();
      ctx.ellipse(0, 0, ring.r, ring.r * tilt, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    ctx.restore();
  }

  function drawEffects() {
    effects.forEach(ef => {
      if (ef.type === 'blackhole') {
        ef.phase += 0.08;
        // Accretion disc
        ctx.save();
        ctx.translate(ef.x, ef.y);
        ctx.rotate(ef.phase);
        for (let ring = 0; ring < 3; ring++) {
          const r = 18 + ring * 8;
          const alpha = (1 - ring / 3) * ef.life * 0.7;
          const grad  = ctx.createConicalGradient ? null : null;
          ctx.strokeStyle = `rgba(${ring===0?'180,80,255':ring===1?'100,40,200':'60,20,140'},${alpha})`;
          ctx.lineWidth = 4 - ring;
          ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
        }
        // Dark core
        const core = ctx.createRadialGradient(0, 0, 0, 0, 0, 14);
        core.addColorStop(0, `rgba(0,0,0,${ef.life})`);
        core.addColorStop(0.6, `rgba(30,0,60,${ef.life * 0.8})`);
        core.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = core;
        ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill();
        // Lensing distortion hint
        ctx.strokeStyle = `rgba(180,100,255,${ef.life * 0.5})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(0, 0, 26, 10, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();

      } else if (ef.type === 'solarflare') {
        const alpha = ef.life * 0.75;
        const flareGrad = ctx.createConicalGradient
          ? null
          : ctx.createRadialGradient(-30, CY, 0, -30, CY, SIZE * 0.9);
        if (flareGrad) {
          flareGrad.addColorStop(0, `rgba(255,220,50,${alpha})`);
          flareGrad.addColorStop(0.3, `rgba(255,140,20,${alpha * 0.6})`);
          flareGrad.addColorStop(1,   'rgba(255,100,0,0)');
          ctx.fillStyle = flareGrad;
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(-30, CY);
          ctx.lineTo(SIZE * 0.6, CY - PR * 0.7);
          ctx.lineTo(SIZE * 0.6, CY + PR * 0.7);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }
    });
  }

  function drawProjectiles() {
    projectiles.forEach(p => {
      const w = p.weapon;
      if (p.isBeam) {
        const col   = w === 'laser' ? '#ef4444' : '#22d3ee';
        const glow  = w === 'laser' ? '#f87171' : '#67e8f9';
        const thick = w === 'laser' ? 3 : 1.5;
        ctx.save();
        ctx.shadowColor = glow; ctx.shadowBlur = 14;
        ctx.strokeStyle = col; ctx.lineWidth = thick; ctx.globalAlpha = 0.92;
        ctx.beginPath(); ctx.moveTo(p.trailX, p.trailY); ctx.lineTo(p.x, p.y); ctx.stroke();
        if (w === 'ioncannon') {
          ctx.lineWidth = 4; ctx.globalAlpha = 0.3;
          ctx.beginPath(); ctx.moveTo(p.trailX, p.trailY); ctx.lineTo(p.x, p.y); ctx.stroke();
        }
        ctx.restore();
      } else {
        // Trail
        p.trail.forEach((pt, i) => {
          ctx.globalAlpha = (i / p.trail.length) * 0.45;
          ctx.fillStyle = p.cfg.col;
          ctx.beginPath(); ctx.arc(pt.x, pt.y, 5 * (i / p.trail.length), 0, Math.PI * 2); ctx.fill();
        });
        ctx.globalAlpha = 1;
        // Emoji
        const sz = p.cfg.size;
        ctx.save();
        ctx.font = `${sz}px serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const angle = Math.atan2(p.vy, p.vx);
        ctx.translate(p.x, p.y); ctx.rotate(angle);
        ctx.fillText(p.cfg.emoji, 0, 0);
        ctx.restore();
      }
    });
  }

  function drawParticles() {
    particles.forEach(p => {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.5, p.r * p.life), 0, Math.PI * 2); ctx.fill();
    });
    chunks.forEach(c => {
      ctx.globalAlpha = c.life;
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.rot);
      ctx.fillStyle = c.color;
      ctx.beginPath(); ctx.roundRect(-c.r, -c.r * 0.6, c.r * 2, c.r * 1.2, 3); ctx.fill();
      ctx.restore();
    });
    ctx.globalAlpha = 1;
  }

  function drawHpBar() {
    const bw = 180, bh = 10;
    const bx = CX - bw / 2, by = CY + PR + 16;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 5); ctx.fill();
    const pct = Math.max(0, hp / 100);
    if (pct > 0) {
      const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      g.addColorStop(0, '#22c55e'); g.addColorStop(0.5, '#eab308'); g.addColorStop(1, '#ef4444');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.roundRect(bx, by, bw * pct, bh, 5); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 5); ctx.stroke();
    // label
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`INTEGRITÄT ${Math.ceil(hp)}%`, CX, by + bh + 11);
    ctx.textAlign = 'left';
  }

  function drawDestroyed() {
    ctx.fillStyle = `rgba(0,0,0,${Math.min(0.75, destroyTimer / 60)})`;
    ctx.fillRect(0, 0, SIZE, SIZE);
    if (destroyTimer < 20) return;
    const alpha = Math.min(1, (destroyTimer - 20) / 30);
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('💥 Zerstört!', CX, CY - 18);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '13px sans-serif';
    ctx.fillText('Drücke "Neuer Planet"', CX, CY + 14);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  function updateScore() {
    scoreEl.textContent = `${100 - Math.round(hp)}%`;
  }

  /* ══ UPDATE ══════════════════════════════════════════════════════════ */
  function updateProjectiles() {
    const keep = [];
    for (const p of projectiles) {
      if (p.isBeam) { p.trailX = p.x; p.trailY = p.y; }
      else          { p.trail.push({ x: p.x, y: p.y }); if (p.trail.length > 9) p.trail.shift(); }
      p.x += p.vx; p.y += p.vy;

      const dist = Math.hypot(p.x - CX, p.y - CY);
      if (dist < PR + 6) {
        impactPlanet(p.x, p.y, p.cfg, p.weapon);
        hp = Math.max(0, hp - p.cfg.dmg);
        updateScore();
      } else if (p.x > -60 && p.x < SIZE + 60 && p.y > -60 && p.y < SIZE + 60) {
        keep.push(p);
      }
    }
    projectiles = keep;
  }

  function updateEffects() {
    const keep = [];
    for (const ef of effects) {
      ef.timer--;
      ef.life = Math.max(0, ef.timer / (ef.type === 'blackhole' ? 90 : 45));

      if (ef.type === 'blackhole') {
        // Suck in particles toward black hole each frame
        if (ef.timer % 6 === 0 && ef.timer > 10) {
          burst(CX, CY, '#7c3aed', 2, 1.5);
        }
        if (ef.timer === 10) {
          // Final implosion
          const cfg = WEAPON_CFG.blackhole;
          impactPlanet(ef.x, ef.y, cfg, 'blackhole');
          hp = Math.max(0, hp - cfg.dmg);
          shakeTimer = 40; shakeAmt = 2.0;
          burst(ef.x, ef.y, '#7c3aed', 40, 12);
          burst(ef.x, ef.y, '#fff', 20, 10);
          updateScore();
        }
      }

      if (ef.timer > 0) keep.push(ef);
    }
    effects = keep;
  }

  /* ══ MAIN LOOP ═══════════════════════════════════════════════════════ */
  function loop() {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    frame++;

    if (shakeTimer > 0) shakeTimer--;
    rotOffset += 0.18;

    let sx = 0, sy = 0;
    if (shakeTimer > 0) {
      const amt = shakeAmt * (shakeTimer / 35);
      sx = (Math.random() - 0.5) * amt * 2;
      sy = (Math.random() - 0.5) * amt * 2;
    }

    // Update
    if (!destroyed) {
      updateProjectiles();
      updateEffects();
      if (hp <= 0 && !destroyed) {
        destroyed = true;
        addChunks(CX, CY); addChunks(CX, CY); addChunks(CX, CY);
        burst(CX, CY, '#fbbf24', 60, 14);
        burst(CX, CY, '#ef4444', 40, 10);
        burst(CX, CY, '#fff', 20, 16);
        shakeTimer = 60; shakeAmt = 3;
      }
    } else {
      destroyTimer++;
    }

    particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vx *= 0.93; p.vy *= 0.93; p.life -= (p.decay || 0.025); });
    particles = particles.filter(p => p.life > 0);
    chunks.forEach(c => { c.x += c.vx; c.y += c.vy; c.vy += 0.06; c.vx *= 0.99; c.rot += c.rotV; c.life -= c.decay; });
    chunks = chunks.filter(c => c.life > 0);

    // Draw
    drawSpace();
    drawRingsPart(sx, sy, false);   // rings behind planet
    if (!destroyed) {
      drawPlanet(sx, sy);
      drawRingsPart(sx, sy, true);  // rings in front of planet
      drawEffects();
      drawProjectiles();
      drawParticles();
      drawHpBar();
    } else {
      drawPlanet(sx, sy);
      drawRingsPart(sx, sy, true);
      drawParticles();
      drawDestroyed();
    }
  }

  /* ══ INPUT ═══════════════════════════════════════════════════════════ */
  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const scX  = SIZE / rect.width, scY = SIZE / rect.height;
    const src  = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - rect.left) * scX, y: (src.clientY - rect.top) * scY };
  }
  canvas.addEventListener('click',      e => { const p = getPos(e); fire(p.x, p.y); });
  canvas.addEventListener('touchstart', e => { e.preventDefault(); const p = getPos(e); fire(p.x, p.y); }, { passive: false });

  /* ── Weapon buttons ───────────────────────────────────────────────── */
  document.querySelectorAll('.weapon-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.weapon-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      weapon = btn.dataset.weapon;
    });
  });

  /* ── Planet picker ────────────────────────────────────────────────── */
  document.querySelectorAll('.planet-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.planet-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentPlanetType = btn.dataset.planet;
      initState();
    });
  });

  /* ── Reset button ─────────────────────────────────────────────────── */
  resetBtn.addEventListener('click', initState);

  /* ══ INIT ════════════════════════════════════════════════════════════ */
  function initState() {
    craters     = [];
    projectiles = [];
    particles   = [];
    effects     = [];
    chunks      = [];
    shakeTimer  = 0;
    shakeAmt    = 0;
    hp          = 100;
    rotOffset   = 0;
    destroyed   = false;
    destroyTimer = 0;
    buildPlanet();
    updateScore();
  }

  /* ══ PUBLIC API ══════════════════════════════════════════════════════ */
  window.startPlanet = function () {
    if (running) stopPlanet();
    running = true;
    frame   = 0;
    initSpace();
    initState();
    raf = requestAnimationFrame(loop);
  };

  window.stopPlanet = function () {
    running = false;
    cancelAnimationFrame(raf);
  };
})();
