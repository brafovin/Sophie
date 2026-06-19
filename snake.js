/* ══ Snake — Neon Jungle ═════════════════════════════════════════════════ */
(function () {
  const canvas  = document.getElementById('snake-canvas');
  const ctx     = canvas.getContext('2d');
  const scoreEl = document.getElementById('snake-score');

  const COLS = 20, ROWS = 20;
  let CELL, W, H;

  let raf, running = false;
  let snake, dir, nextDir, foods, score, speed, tickTimer;
  let dead, deadAlpha;
  let particles, fireflies, glowPulse;
  let tonguePhase;
  let combo, comboTimer;
  let frame = 0;

  /* ── Resize ───────────────────────────────────────────────────────── */
  function resize() {
    const size = Math.min(300, window.innerWidth - 32);
    canvas.width = canvas.height = size;
    W = H = size; CELL = size / COLS;
  }

  /* ── Food types ───────────────────────────────────────────────────── */
  const FOOD_TYPES = [
    { type:'apple',   pts:10, color:'#ef4444', glow:'#ff6060', chance:0.60, phase:0 },
    { type:'gold',    pts:30, color:'#f59e0b', glow:'#fde68a', chance:0.22, phase:0 },
    { type:'crystal', pts:20, color:'#06b6d4', glow:'#67e8f9', chance:0.18, phase:0 },
  ];

  function pickFoodType() {
    const r = Math.random();
    let cum = 0;
    for (const t of FOOD_TYPES) { cum += t.chance; if (r < cum) return { ...t, phase: Math.random()*Math.PI*2 }; }
    return { ...FOOD_TYPES[0], phase: 0 };
  }

  /* ── Init ─────────────────────────────────────────────────────────── */
  function init() {
    resize();
    const mid = Math.floor(COLS / 2);
    snake     = [{ x:mid,y:mid},{x:mid-1,y:mid},{x:mid-2,y:mid}];
    dir       = {x:1,y:0}; nextDir = {x:1,y:0};
    score     = 0; speed = 150; tickTimer = 0;
    dead      = false; deadAlpha = 0;
    particles = []; fireflies = []; glowPulse = 0;
    tonguePhase = 0; combo = 0; comboTimer = 0; frame = 0;
    scoreEl.textContent = '0';
    // Init fireflies
    for (let i=0;i<18;i++) fireflies.push({
      x: Math.random()*W, y: Math.random()*H,
      vx:(Math.random()-0.5)*0.4, vy:(Math.random()-0.5)*0.4,
      phase: Math.random()*Math.PI*2, r:1+Math.random()*1.5,
      hue: 80+Math.random()*80,
    });
    foods = []; placeFood();
  }

  function placeFood() {
    if (foods.length >= 2) return;
    let pos;
    do { pos={x:Math.floor(Math.random()*COLS),y:Math.floor(Math.random()*ROWS)}; }
    while (snake.some(s=>s.x===pos.x&&s.y===pos.y) || foods.some(f=>f.x===pos.x&&f.y===pos.y));
    foods.push({...pos, ...pickFoodType()});
    if (Math.random()<0.3 && foods.length<2) {
      let pos2;
      do{pos2={x:Math.floor(Math.random()*COLS),y:Math.floor(Math.random()*ROWS)};}
      while(snake.some(s=>s.x===pos2.x&&s.y===pos2.y)||foods.some(f=>f.x===pos2.x&&f.y===pos2.y));
      foods.push({...pos2,...pickFoodType()});
    }
  }

  /* ── Particles ────────────────────────────────────────────────────── */
  function burst(gx, gy, color, n=10) {
    const cx=(gx+0.5)*CELL, cy=(gy+0.5)*CELL;
    for(let i=0;i<n;i++){
      const a=Math.random()*Math.PI*2, s=2+Math.random()*4;
      particles.push({x:cx,y:cy,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:1,color,r:2+Math.random()*3});
    }
  }

  /* ══ DRAW BACKGROUND ════════════════════════════════════════════════ */
  function drawBg() {
    // Dark jungle base
    const bg = ctx.createLinearGradient(0,0,W,H);
    bg.addColorStop(0,'#030a03'); bg.addColorStop(0.5,'#050f05'); bg.addColorStop(1,'#030a03');
    ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);

    // Far background foliage silhouettes
    ctx.fillStyle='rgba(5,18,5,0.9)';
    const leaf1 = [[0,H],[0.08*W,H*0.55],[0.15*W,H*0.65],[0.22*W,H*0.5],[0.3*W,H*0.6],[0.38*W,H*0.48],[0.46*W,H*0.62],[0.54*W,H*0.44],[0.62*W,H*0.58],[0.7*W,H*0.46],[0.78*W,H*0.6],[0.86*W,H*0.52],[0.95*W,H*0.64],[W,H*0.55],[W,H]];
    ctx.beginPath(); leaf1.forEach(([x,y],i)=>i===0?ctx.moveTo(x,y):ctx.lineTo(x,y)); ctx.closePath(); ctx.fill();

    ctx.fillStyle='rgba(4,14,4,0.85)';
    const leaf2 = [[0,H],[0,H*0.7],[0.12*W,H*0.58],[0.25*W,H*0.72],[0.35*W,H*0.6],[0.48*W,H*0.74],[0.6*W,H*0.62],[0.72*W,H*0.76],[0.85*W,H*0.65],[W,H*0.72],[W,H]];
    ctx.beginPath(); leaf2.forEach(([x,y],i)=>i===0?ctx.moveTo(x,y):ctx.lineTo(x,y)); ctx.closePath(); ctx.fill();

    // Ground moss layer
    const ground = ctx.createLinearGradient(0,H*0.88,0,H);
    ground.addColorStop(0,'rgba(12,28,8,0)'); ground.addColorStop(1,'rgba(8,20,5,0.6)');
    ctx.fillStyle=ground; ctx.fillRect(0,H*0.88,W,H*0.12);

    // Ambient green fog
    const fog = ctx.createRadialGradient(W/2,H/2,H*0.1,W/2,H/2,H*0.7);
    fog.addColorStop(0,'rgba(0,60,10,0.08)'); fog.addColorStop(1,'rgba(0,40,5,0)');
    ctx.fillStyle=fog; ctx.fillRect(0,0,W,H);

    // Grid floor (subtle cell lines)
    ctx.strokeStyle='rgba(0,80,20,0.08)';
    ctx.lineWidth=0.5;
    for(let r=0;r<ROWS;r++){
      ctx.beginPath();ctx.moveTo(0,r*CELL);ctx.lineTo(W,r*CELL);ctx.stroke();
    }
    for(let c=0;c<COLS;c++){
      ctx.beginPath();ctx.moveTo(c*CELL,0);ctx.lineTo(c*CELL,H);ctx.stroke();
    }

    // Cell corner dots (mossy feel)
    ctx.fillStyle='rgba(0,100,30,0.06)';
    for(let r=0;r<=ROWS;r++) for(let c=0;c<=COLS;c++){
      ctx.beginPath(); ctx.arc(c*CELL,r*CELL,1,0,Math.PI*2); ctx.fill();
    }

    // Fireflies
    frame++;
    fireflies.forEach(ff=>{
      ff.x+=ff.vx; ff.y+=ff.vy;
      if(ff.x<0)ff.x=W; if(ff.x>W)ff.x=0;
      if(ff.y<0)ff.y=H; if(ff.y>H)ff.y=0;
      ff.phase+=0.04;
      const alpha = (0.4+Math.sin(ff.phase)*0.4)*(dead?0.2:1);
      ctx.shadowColor=`hsl(${ff.hue},90%,60%)`; ctx.shadowBlur=8;
      ctx.fillStyle=`hsla(${ff.hue},90%,65%,${alpha})`;
      ctx.beginPath(); ctx.arc(ff.x,ff.y,ff.r,0,Math.PI*2); ctx.fill();
      ctx.shadowBlur=0;
    });
  }

  /* ══ DRAW SNAKE ═════════════════════════════════════════════════════ */
  function drawSnake() {
    tonguePhase+=0.15;
    // Draw body back to front (tail first)
    for(let i=snake.length-1;i>=0;i--){
      const seg=snake[i];
      const t=i/snake.length;
      const px=seg.x*CELL, py=seg.y*CELL;
      const isHead=(i===0);
      const pad=isHead?0.5:1.5;
      const sz=CELL-pad*2;
      const hue=120-t*30;
      const light=isHead?62:50-t*12;

      // Scale pattern on body segments
      if(!isHead){
        ctx.fillStyle=`hsl(${hue},70%,${light}%)`;
        ctx.beginPath(); ctx.roundRect(px+pad,py+pad,sz,sz,sz*0.22); ctx.fill();
        // Scale markings
        ctx.fillStyle=`hsla(${hue},60%,${light+10}%,0.4)`;
        ctx.beginPath(); ctx.ellipse(px+CELL/2,py+CELL/2-1,sz*0.32,sz*0.18,-0.3,0,Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(px+CELL/2+1,py+CELL/2+sz*0.18,sz*0.22,sz*0.13,0.3,0,Math.PI*2); ctx.fill();
      } else {
        // HEAD — more detailed
        ctx.shadowColor=`hsl(${hue},80%,55%)`; ctx.shadowBlur=12;
        const hg=ctx.createRadialGradient(px+CELL/2-1,py+CELL/2-1,1,px+CELL/2,py+CELL/2,CELL*0.6);
        hg.addColorStop(0,`hsl(${hue},75%,70%)`);
        hg.addColorStop(1,`hsl(${hue},70%,35%)`);
        ctx.fillStyle=hg;
        ctx.beginPath(); ctx.roundRect(px+pad,py+pad,sz,sz,sz*0.35); ctx.fill();
        ctx.shadowBlur=0;

        // Nostrils
        ctx.fillStyle=`hsl(${hue},50%,22%)`;
        const nx1=px+CELL/2+dir.x*sz*0.3+(dir.y!==0?sz*0.15:0);
        const ny1=py+CELL/2+dir.y*sz*0.3+(dir.x!==0?sz*0.15:0);
        const nx2=px+CELL/2+dir.x*sz*0.3-(dir.y!==0?sz*0.15:0);
        const ny2=py+CELL/2+dir.y*sz*0.3-(dir.x!==0?sz*0.15:0);
        ctx.beginPath(); ctx.arc(nx1,ny1,sz*0.07,0,Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(nx2,ny2,sz*0.07,0,Math.PI*2); ctx.fill();

        // Eyes
        const eyeOff=sz*0.22;
        const ePerpX=dir.y, ePerpY=-dir.x;
        [[1],[-1]].forEach(([side])=>{
          const ex=px+CELL/2+dir.x*sz*0.1+ePerpX*eyeOff*side;
          const ey=py+CELL/2+dir.y*sz*0.1+ePerpY*eyeOff*side;
          // White sclera
          ctx.fillStyle='#e2fce2';
          ctx.beginPath(); ctx.arc(ex,ey,sz*0.16,0,Math.PI*2); ctx.fill();
          // Vertical slit pupil
          ctx.fillStyle='#111';
          ctx.save(); ctx.translate(ex,ey);
          const pupilAngle=Math.atan2(dir.y,dir.x);
          ctx.rotate(pupilAngle+Math.PI/2);
          ctx.beginPath(); ctx.ellipse(0,0,sz*0.055,sz*0.13,0,0,Math.PI*2); ctx.fill();
          ctx.restore();
          // Eye shine
          ctx.fillStyle='rgba(255,255,255,0.6)';
          ctx.beginPath(); ctx.arc(ex-sz*0.05,ey-sz*0.05,sz*0.04,0,Math.PI*2); ctx.fill();
        });

        // Forked tongue
        const ts = Math.sin(tonguePhase);
        if (ts > 0) {
          const tlen=CELL*0.55*ts;
          const tx=px+CELL/2+dir.x*(sz*0.5+tlen);
          const ty=py+CELL/2+dir.y*(sz*0.5+tlen);
          ctx.strokeStyle='#f87171'; ctx.lineWidth=1.5; ctx.lineCap='round';
          ctx.beginPath();
          ctx.moveTo(px+CELL/2+dir.x*sz*0.45,py+CELL/2+dir.y*sz*0.45);
          ctx.lineTo(tx,ty); ctx.stroke();
          // Fork tips
          const perpX=dir.y*CELL*0.18, perpY=-dir.x*CELL*0.18;
          ctx.beginPath(); ctx.moveTo(tx,ty); ctx.lineTo(tx+dir.x*CELL*0.18+perpX,ty+dir.y*CELL*0.18+perpY); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(tx,ty); ctx.lineTo(tx+dir.x*CELL*0.18-perpX,ty+dir.y*CELL*0.18-perpY); ctx.stroke();
        }
      }

      // Specular
      ctx.fillStyle=`rgba(255,255,255,${isHead?0.22:0.12})`;
      ctx.beginPath(); ctx.ellipse(px+pad+sz*0.3,py+pad+sz*0.25,sz*0.15,sz*0.08,-0.5,0,Math.PI*2); ctx.fill();
    }
  }

  /* ══ DRAW FOOD ══════════════════════════════════════════════════════ */
  function drawFoods() {
    foods.forEach(food=>{
      food.phase+=0.07;
      const cx=(food.x+0.5)*CELL, cy=(food.y+0.5)*CELL;
      const r=CELL*0.36+Math.sin(food.phase)*CELL*0.04;

      // Outer glow
      ctx.shadowColor=food.glow; ctx.shadowBlur=18;
      const glow=ctx.createRadialGradient(cx,cy,r*0.1,cx,cy,r*2);
      glow.addColorStop(0,`${food.glow}50`); glow.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=glow; ctx.beginPath(); ctx.arc(cx,cy,r*2,0,Math.PI*2); ctx.fill();
      ctx.shadowBlur=0;

      if(food.type==='apple'){
        const ag=ctx.createRadialGradient(cx-r*0.3,cy-r*0.3,r*0.05,cx,cy,r);
        ag.addColorStop(0,'#fca5a5'); ag.addColorStop(0.5,'#ef4444'); ag.addColorStop(1,'#7f1d1d');
        ctx.fillStyle=ag; ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle='rgba(0,0,0,0.25)'; ctx.lineWidth=0.5;
        ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke();
        // Stem & leaf
        ctx.strokeStyle='#78350f'; ctx.lineWidth=1.5; ctx.lineCap='round';
        ctx.beginPath(); ctx.moveTo(cx,cy-r); ctx.quadraticCurveTo(cx+r*0.3,cy-r*1.3,cx+r*0.15,cy-r*1.5); ctx.stroke();
        ctx.fillStyle='rgba(0,180,60,0.7)';
        ctx.beginPath(); ctx.ellipse(cx+r*0.2,cy-r*1.3,r*0.2,r*0.1,0.8,0,Math.PI*2); ctx.fill();

      } else if(food.type==='gold'){
        // Star/crystal gem shape
        ctx.save(); ctx.translate(cx,cy); ctx.rotate(food.phase*0.5);
        const gg=ctx.createRadialGradient(0,-r*0.2,1,0,0,r);
        gg.addColorStop(0,'#fef9c3'); gg.addColorStop(0.4,'#f59e0b'); gg.addColorStop(1,'#78350f');
        ctx.fillStyle=gg;
        ctx.beginPath();
        for(let i=0;i<8;i++){
          const a=i*Math.PI/4-Math.PI/8;
          const rr=i%2===0?r:r*0.55;
          i===0?ctx.moveTo(Math.cos(a)*rr,Math.sin(a)*rr):ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);
        }
        ctx.closePath(); ctx.fill();
        ctx.fillStyle='rgba(255,255,255,0.4)';
        ctx.beginPath(); ctx.ellipse(-r*0.2,-r*0.25,r*0.22,r*0.1,-0.4,0,Math.PI*2); ctx.fill();
        // "+30" hint
        ctx.fillStyle='rgba(255,255,255,0.7)'; ctx.font=`bold ${Math.round(CELL*0.45)}px monospace`;
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText('+30',0,0);
        ctx.restore();

      } else if(food.type==='crystal'){
        // Diamond shape
        ctx.save(); ctx.translate(cx,cy);
        const cg=ctx.createRadialGradient(0,-r*0.3,1,0,0,r);
        cg.addColorStop(0,'#a5f3fc'); cg.addColorStop(0.5,'#06b6d4'); cg.addColorStop(1,'#164e63');
        ctx.fillStyle=cg;
        ctx.beginPath();
        ctx.moveTo(0,-r); ctx.lineTo(r*0.75,-r*0.2); ctx.lineTo(r*0.55,r*0.8);
        ctx.lineTo(0,r); ctx.lineTo(-r*0.55,r*0.8); ctx.lineTo(-r*0.75,-r*0.2);
        ctx.closePath(); ctx.fill();
        // Facets
        ctx.strokeStyle='rgba(255,255,255,0.3)'; ctx.lineWidth=0.8;
        ctx.beginPath(); ctx.moveTo(0,-r); ctx.lineTo(0,r*0.2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-r*0.75,-r*0.2); ctx.lineTo(r*0.75,-r*0.2); ctx.stroke();
        ctx.fillStyle='rgba(255,255,255,0.45)';
        ctx.beginPath(); ctx.ellipse(-r*0.2,-r*0.5,r*0.18,r*0.08,-0.5,0,Math.PI*2); ctx.fill();
        ctx.restore();
      }

      // Shine
      if(food.type==='apple'){
        ctx.fillStyle='rgba(255,255,255,0.4)';
        ctx.beginPath(); ctx.ellipse(cx-r*0.28,cy-r*0.28,r*0.2,r*0.12,-0.6,0,Math.PI*2); ctx.fill();
      }
    });
  }

  /* ══ PARTICLES ══════════════════════════════════════════════════════ */
  function drawParticles() {
    particles.forEach(p=>{
      ctx.shadowColor=p.color; ctx.shadowBlur=6;
      ctx.globalAlpha=p.life;
      ctx.fillStyle=p.color;
      ctx.beginPath(); ctx.arc(p.x,p.y,Math.max(0.5,p.r*p.life),0,Math.PI*2); ctx.fill();
    });
    ctx.globalAlpha=1; ctx.shadowBlur=0;
  }

  /* ══ DEAD OVERLAY ═══════════════════════════════════════════════════ */
  function drawDead() {
    // Red tint fade
    ctx.fillStyle=`rgba(100,0,0,${deadAlpha*0.5})`;
    ctx.fillRect(0,0,W,H);
    // Dark overlay
    ctx.fillStyle=`rgba(0,0,0,${deadAlpha*0.65})`;
    ctx.fillRect(0,0,W,H);
    if(deadAlpha<0.5)return;
    ctx.globalAlpha=Math.min(1,(deadAlpha-0.5)*2);
    ctx.textAlign='center';
    ctx.shadowColor='#ef4444'; ctx.shadowBlur=20;
    ctx.fillStyle='#ef4444'; ctx.font=`bold ${Math.round(CELL*1.6)}px monospace`;
    ctx.fillText('💀 TOT', W/2, H/2-CELL);
    ctx.shadowBlur=0;
    ctx.fillStyle='#fff'; ctx.font=`${Math.round(CELL*0.85)}px sans-serif`;
    ctx.fillText(`Punkte: ${score}`, W/2, H/2+CELL*0.2);
    ctx.fillStyle='rgba(200,255,200,0.7)'; ctx.font=`${Math.round(CELL*0.68)}px sans-serif`;
    ctx.fillText('Tippe zum Neustart', W/2, H/2+CELL*1.4);
    ctx.textAlign='left'; ctx.globalAlpha=1;
  }

  /* ══ COMBO HUD ══════════════════════════════════════════════════════ */
  function drawCombo() {
    if(combo<=1||comboTimer<=0)return;
    const alpha=Math.min(1,comboTimer/30);
    ctx.save(); ctx.globalAlpha=alpha;
    ctx.fillStyle='#fbbf24'; ctx.font=`bold ${Math.round(CELL*1.1)}px monospace`;
    ctx.textAlign='center';
    ctx.shadowColor='#f59e0b'; ctx.shadowBlur=12;
    ctx.fillText(`×${combo} COMBO!`,W/2,CELL*2.5);
    ctx.restore(); ctx.shadowBlur=0;
  }

  /* ══ TICK ═══════════════════════════════════════════════════════════ */
  let lastTime=0;
  function loop(ts) {
    if(!running)return;
    raf=requestAnimationFrame(loop);
    const dt=ts-lastTime; lastTime=ts;

    if(dead){
      deadAlpha=Math.min(1,deadAlpha+0.03);
      particles.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.vx*=0.88;p.vy*=0.88;p.life-=0.035;});
      particles=particles.filter(p=>p.life>0);
      drawBg(); drawSnake(); drawFoods(); drawParticles(); drawDead();
      return;
    }

    if(comboTimer>0)comboTimer--;
    tickTimer+=dt;
    if(tickTimer>=speed){tickTimer-=speed;tick();}

    drawBg(); drawFoods(); drawSnake(); drawParticles(); drawCombo();
  }

  function tick() {
    dir={...nextDir};
    const head={x:snake[0].x+dir.x,y:snake[0].y+dir.y};
    head.x=(head.x+COLS)%COLS; head.y=(head.y+ROWS)%ROWS;

    if(snake.some(s=>s.x===head.x&&s.y===head.y)){
      // Death explosion
      for(let i=0;i<snake.length;i+=2) burst(snake[i].x,snake[i].y,'#ef4444',4);
      burst(snake[0].x,snake[0].y,'#22c55e',12);
      dead=true; return;
    }

    snake.unshift(head);

    const eaten=foods.findIndex(f=>f.x===head.x&&f.y===head.y);
    if(eaten>=0){
      const f=foods.splice(eaten,1)[0];
      score+=f.pts; scoreEl.textContent=score;
      combo++; comboTimer=60;
      burst(f.x,f.y,f.glow,14);
      placeFood();
      speed=Math.max(55,speed-3);
    } else {
      snake.pop();
      if(Math.random()<0.01) comboTimer=0; // combo resets on miss
    }
  }

  /* ══ INPUT ══════════════════════════════════════════════════════════ */
  function setDir(dx,dy){
    if(dead){init();return;}
    if(dx===-dir.x&&dy===-dir.y)return;
    nextDir={x:dx,y:dy};
  }
  document.getElementById('sn-up')   .addEventListener('click',()=>setDir(0,-1));
  document.getElementById('sn-down') .addEventListener('click',()=>setDir(0,1));
  document.getElementById('sn-left') .addEventListener('click',()=>setDir(-1,0));
  document.getElementById('sn-right').addEventListener('click',()=>setDir(1,0));

  function onKey(e){
    const map={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0],w:[0,-1],s:[0,1],a:[-1,0],d:[1,0]};
    if(map[e.key]){e.preventDefault();setDir(...map[e.key]);}
  }
  let sx=0,sy=0;
  canvas.addEventListener('touchstart',e=>{sx=e.touches[0].clientX;sy=e.touches[0].clientY;},{passive:true});
  canvas.addEventListener('touchend',e=>{
    const dx=e.changedTouches[0].clientX-sx,dy=e.changedTouches[0].clientY-sy;
    if(Math.abs(dx)<10&&Math.abs(dy)<10){if(dead)init();return;}
    if(Math.abs(dx)>Math.abs(dy))setDir(dx>0?1:-1,0);else setDir(0,dy>0?1:-1);
  },{passive:true});
  canvas.addEventListener('click',()=>{if(dead)init();});

  /* ══ PUBLIC API ═════════════════════════════════════════════════════ */
  window.startSnake=function(){
    if(running)stopSnake(); running=true; lastTime=0; init();
    document.addEventListener('keydown',onKey); raf=requestAnimationFrame(loop);
  };
  window.stopSnake=function(){
    running=false; document.removeEventListener('keydown',onKey); cancelAnimationFrame(raf);
  };
})();
