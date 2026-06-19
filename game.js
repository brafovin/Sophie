'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SHARED — Background, Navigation, Drawing Helpers, Popups
// ══════════════════════════════════════════════════════════════════════════════

const bgCanvas   = document.getElementById('bg-canvas');
const bgCtx      = bgCanvas.getContext('2d');
const popupLayer = document.getElementById('popup-layer');

// ── Animated background ───────────────────────────────────────────────────────

const blobs = [], stars = [];

function initBg() {
  bgCanvas.width  = window.innerWidth;
  bgCanvas.height = window.innerHeight;
  blobs.length = stars.length = 0;
  // full rainbow spread, high saturation, each blob slowly drifts its hue
  const defs = [
    [0,90,55],[38,95,55],[75,88,48],[150,85,42],[200,92,52],[260,88,50],[300,90,52],[330,92,55]
  ];
  for (const [h,s,l] of defs) {
    blobs.push({ x:Math.random()*bgCanvas.width, y:Math.random()*bgCanvas.height,
      r:160+Math.random()*200, vx:(Math.random()-0.5)*0.22, vy:(Math.random()-0.5)*0.22,
      h, hDrift:(Math.random()-0.5)*0.012, s, l, phase:Math.random()*Math.PI*2 });
  }
  for (let i=0;i<110;i++) stars.push({
    x:Math.random()*bgCanvas.width, y:Math.random()*bgCanvas.height,
    r:Math.random()*2.2+0.4, speed:Math.random()*0.28+0.05,
    opacity:Math.random()*0.8+0.2, hue:Math.random()*360,
  });
  initSeasonParticles(bgCanvas.width, bgCanvas.height);
}

function animateBg(t) {
  const w=bgCanvas.width, h=bgCanvas.height;
  bgCtx.clearRect(0,0,w,h);
  // Colorful base gradient that slowly shifts hue
  const hShift = t * 0.006;
  const bg = bgCtx.createLinearGradient(0,0,w,h);
  bg.addColorStop(0, `hsl(${280+hShift},60%,10%)`);
  bg.addColorStop(0.35,`hsl(${220+hShift},55%,8%)`);
  bg.addColorStop(0.65,`hsl(${160+hShift},50%,9%)`);
  bg.addColorStop(1,   `hsl(${340+hShift},58%,10%)`);
  bgCtx.fillStyle=bg; bgCtx.fillRect(0,0,w,h);
  for (const b of blobs) {
    b.h = (b.h + b.hDrift + 360) % 360;
    b.x+=b.vx; b.y+=b.vy;
    if (b.x<-b.r) b.x=w+b.r; if (b.x>w+b.r) b.x=-b.r;
    if (b.y<-b.r) b.y=h+b.r; if (b.y>h+b.r) b.y=-b.r;
    const pulse=0.82+0.18*Math.sin(t*0.0007+b.phase);
    const rad=bgCtx.createRadialGradient(b.x,b.y,0,b.x,b.y,b.r*pulse);
    rad.addColorStop(0,  `hsla(${b.h},${b.s}%,${b.l}%,0.52)`);
    rad.addColorStop(0.4,`hsla(${b.h},${b.s}%,${b.l}%,0.18)`);
    rad.addColorStop(1,  `hsla(${b.h},${b.s}%,${b.l}%,0)`);
    bgCtx.fillStyle=rad;
    bgCtx.fillRect(b.x-b.r*pulse,b.y-b.r*pulse,b.r*pulse*2,b.r*pulse*2);
  }
  for (const s of stars) {
    s.y-=s.speed; if (s.y<-4){s.y=h+4;s.x=Math.random()*w; s.hue=Math.random()*360;}
    bgCtx.beginPath(); bgCtx.arc(s.x,s.y,s.r,0,Math.PI*2);
    bgCtx.fillStyle=`hsla(${s.hue},90%,88%,${s.opacity})`; bgCtx.fill();
  }
  if (holidayKey) {
    const ptype = HOLIDAYS[holidayKey].particle;
    for (const p of seasonParticles) {
      p.x+=p.vx; p.y+=p.vy; p.rot+=p.rotV;
      if(p.vy>0&&p.y>h+24){p.y=-24;p.x=Math.random()*w;}
      if(p.vy<0&&p.y<-24){p.y=h+24;p.x=Math.random()*w;}
      if(p.x>w+24)p.x=-24; if(p.x<-24)p.x=w+24;
      drawSeasonParticle(bgCtx,p,ptype);
    }
  }
  requestAnimationFrame(animateBg);
}

window.addEventListener('resize',()=>{bgCanvas.width=window.innerWidth;bgCanvas.height=window.innerHeight;initBg();});

// ── Navigation ────────────────────────────────────────────────────────────────

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s=>s.classList.toggle('hidden',s.id!==id));
}

function updateHomeScores() {
  const entries = [
    ['hs-blockblast', 'bb_highscore'],
    ['hs-runner',     'runner_hs'],
    ['hs-snake',      'snake_hs'],
    ['hs-breakout',   'breakout_hs'],
    ['hs-obby',       'obby_hs'],
    ['hs-blox',       'blox_hs'],
  ];
  for (const [elId, key] of entries) {
    const el = document.getElementById(elId);
    if (!el) continue;
    const val = parseInt(localStorage.getItem(key) || '0');
    if (val > 0) { el.textContent = `BEST ${val}`; el.classList.add('visible'); }
    else           { el.classList.remove('visible'); }
  }
}

function goHome() {
  if (bbShimmerRaf) { cancelAnimationFrame(bbShimmerRaf); bbShimmerRaf = null; }
  if (typeof stopRunner    === 'function') stopRunner();
  if (typeof stopPlanet    === 'function') stopPlanet();
  if (typeof stopSnake     === 'function') stopSnake();
  if (typeof stopBreakout  === 'function') stopBreakout();
  if (typeof stopObby      === 'function') stopObby();
  if (typeof stopBlox      === 'function') stopBlox();
  updateHomeScores();
  showScreen('home-screen');
}

document.getElementById('card-blockblast').addEventListener('click',()=>{showScreen('blockblast-screen');startGame();});
document.getElementById('card-tictactoe') .addEventListener('click',()=>{showScreen('tictactoe-screen'); startTTT();});
document.getElementById('card-runner')    .addEventListener('click',()=>{showScreen('runner-screen');    startRunner();});
document.getElementById('card-planet')    .addEventListener('click',()=>{showScreen('planet-screen');    startPlanet();});
document.getElementById('card-snake')     .addEventListener('click',()=>{showScreen('snake-screen');     startSnake();});
document.getElementById('card-breakout')  .addEventListener('click',()=>{showScreen('breakout-screen'); startBreakout();});
document.getElementById('card-obby')      .addEventListener('click',()=>{showScreen('obby-screen');     startObby();});
document.getElementById('card-blox')      .addEventListener('click',()=>{showScreen('blox-screen');     startBlox();});

document.querySelectorAll('.back-btn').forEach(b=>b.addEventListener('click',goHome));
document.getElementById('bb-home-btn').addEventListener('click',goHome);

// ── Popup ─────────────────────────────────────────────────────────────────────

function spawnPopup(text, color, size='', anchor=null) {
  const el=document.createElement('div');
  el.className='score-popup'+(size?' '+size:'');
  el.textContent=text; el.style.color=color;
  if (anchor) {
    const r=anchor.getBoundingClientRect();
    el.style.left=(r.left+r.width*(0.25+Math.random()*0.5))+'px';
    el.style.top =(r.top +r.height*(0.3 +Math.random()*0.3))+'px';
  } else {
    el.style.left=(window.innerWidth*0.5)+'px';
    el.style.top =(window.innerHeight*0.45)+'px';
  }
  popupLayer.appendChild(el);
  setTimeout(()=>el.remove(),1100);
}

// ── Drawing helpers ───────────────────────────────────────────────────────────

function roundedRectPath(ctx,x,y,w,h,r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
  ctx.quadraticCurveTo(x+w,y,x+w,y+r); ctx.lineTo(x+w,y+h-r);
  ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h); ctx.lineTo(x+r,y+h);
  ctx.quadraticCurveTo(x,y+h,x,y+h-r); ctx.lineTo(x,y+r);
  ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
}

function fillRR(ctx,x,y,w,h,r,fill) {
  roundedRectPath(ctx,x,y,w,h,r); ctx.fillStyle=fill; ctx.fill();
}

function lighten(hex,amt) {
  const n=parseInt(hex.slice(1),16);
  return `rgb(${Math.min(255,(n>>16)+amt)},${Math.min(255,((n>>8)&0xff)+amt)},${Math.min(255,(n&0xff)+amt)})`;
}
function darken(hex,amt) {
  const n=parseInt(hex.slice(1),16);
  return `rgb(${Math.max(0,(n>>16)-amt)},${Math.max(0,((n>>8)&0xff)-amt)},${Math.max(0,(n&0xff)-amt)})`;
}

function drawCell(ctx,x,y,color,size,alpha=1,shimmerT=0) {
  ctx.save();
  const r=Math.max(3,size*0.18);
  ctx.globalAlpha=alpha*0.5; fillRR(ctx,x+2,y+5,size,size,r,'rgba(0,0,0,0.55)');
  ctx.globalAlpha=alpha*0.2;  fillRR(ctx,x+1,y+2,size,size,r,'rgba(0,0,0,0.4)');
  ctx.globalAlpha=alpha;
  const grad=ctx.createLinearGradient(x,y,x,y+size);
  grad.addColorStop(0,lighten(color,42)); grad.addColorStop(0.38,color); grad.addColorStop(1,darken(color,55));
  roundedRectPath(ctx,x,y,size,size,r); ctx.fillStyle=grad; ctx.fill();
  ctx.save();
  roundedRectPath(ctx,x,y,size,size,r); ctx.clip();
  const shine=ctx.createRadialGradient(x+size*0.28,y+size*0.2,0,x+size*0.28,y+size*0.2,size*0.6);
  shine.addColorStop(0,'rgba(255,255,255,0.82)'); shine.addColorStop(0.32,'rgba(255,255,255,0.22)'); shine.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=shine; ctx.fillRect(x,y,size,size);
  const bot=ctx.createLinearGradient(x,y+size*0.48,x,y+size);
  bot.addColorStop(0,'rgba(0,0,0,0)'); bot.addColorStop(1,'rgba(0,0,0,0.44)');
  ctx.fillStyle=bot; ctx.fillRect(x,y+size*0.48,size,size*0.52);
  ctx.globalAlpha=alpha*0.55; ctx.fillStyle='rgba(255,255,255,0.65)';
  ctx.fillRect(x+r*0.7,y+1.5,size-r*1.4,Math.max(1.5,size*0.04));
  if (shimmerT > 0) {
    const h0 = (x*0.68 + y*0.68 + shimmerT*0.032) % 360;
    const sg = ctx.createLinearGradient(x,y,x+size,y+size);
    sg.addColorStop(0,   `hsla(${h0},      100%,70%,0)`);
    sg.addColorStop(0.2, `hsla(${(h0+ 60)%360},100%,70%,0.42)`);
    sg.addColorStop(0.4, `hsla(${(h0+120)%360},100%,70%,0.42)`);
    sg.addColorStop(0.6, `hsla(${(h0+200)%360},100%,70%,0.42)`);
    sg.addColorStop(0.8, `hsla(${(h0+280)%360},100%,70%,0.42)`);
    sg.addColorStop(1,   `hsla(${(h0+360)%360},100%,70%,0)`);
    ctx.globalAlpha = alpha*0.48;
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = sg; ctx.fillRect(x,y,size,size);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore(); ctx.restore();
}

// ══════════════════════════════════════════════════════════════════════════════
// BLOCK BLAST
// ══════════════════════════════════════════════════════════════════════════════

const BB_COLORS=['#e94560','#f5a623','#f8e71c','#7ed321','#4a90e2','#9b59b6','#1abc9c','#e67e22'];
const PIECE_DEFS=[
  {cells:[[0,0],[0,1],[0,2],[0,3]]},{cells:[[0,0],[1,0],[2,0],[3,0]]},
  {cells:[[0,0],[0,1],[0,2]]},{cells:[[0,0],[1,0],[2,0]]},
  {cells:[[0,0],[0,1]]},{cells:[[0,0],[1,0]]},{cells:[[0,0]]},
  {cells:[[0,0],[0,1],[1,0],[1,1]]},
  {cells:[[0,0],[0,1],[0,2],[1,0],[1,1],[1,2],[2,0],[2,1],[2,2]]},
  {cells:[[0,0],[0,1],[1,0]]},{cells:[[0,0],[0,1],[1,1]]},
  {cells:[[0,0],[1,0],[1,1]]},{cells:[[0,1],[1,0],[1,1]]},
  {cells:[[0,0],[0,1],[0,2],[1,0],[2,0]]},{cells:[[0,0],[0,1],[0,2],[1,2],[2,2]]},
  {cells:[[0,1],[1,1],[2,0],[2,1]]},{cells:[[0,0],[1,0],[1,1],[2,1]]},
  {cells:[[0,0],[0,1],[1,1],[1,2]]},{cells:[[0,1],[1,0],[1,1],[2,0]]},
  {cells:[[0,0],[0,1],[0,2],[1,1]]},{cells:[[0,0],[1,0],[1,1],[2,0]]},
  {cells:[[0,1],[1,0],[1,1],[1,2]]},{cells:[[0,0],[0,1],[1,1],[2,1]]},
  {cells:[[0,0],[0,1],[0,2],[0,3],[0,4]]},{cells:[[0,0],[1,0],[2,0],[3,0],[4,0]]},
  {cells:[[0,0],[0,1],[1,0],[1,1],[2,0],[2,1]]},{cells:[[0,0],[0,1],[0,2],[1,0],[1,1],[1,2]]},
];

const COLS=8,ROWS=8;
const gridCanvas=document.getElementById('grid-canvas');
const ctx=gridCanvas.getContext('2d');
const dragCanvas=document.getElementById('drag-canvas');
const dragCtx=dragCanvas.getContext('2d');
const CELL=parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cell-size'))||44;
const GAP=parseInt(getComputedStyle(document.documentElement).getPropertyValue('--gap'))||3;
const BORDER=6,TRAY_CELL=26,TRAY_GAP=2,DRAG_CELL=Math.round(CELL*0.85),DRAG_GAP=GAP,DRAG_PAD=6;

let bbGrid=[],bbScore=0,bbHighscore=parseInt(localStorage.getItem('bb_highscore')||'0');
let bbPieces=[],bbUsed=[],bbDrag=null,bbGhost=null,bbGhostOk=false,bbFlash=null,bbLocked=false;
let bbGlowT=0, bbShimmerRaf;

function bbCellX(c){return BORDER+c*(CELL+GAP);}
function bbCellY(r){return BORDER+r*(CELL+GAP);}

function drawEmptyCell(ctx,x,y,size,hint=null) {
  const r=Math.max(3,size*0.18);
  fillRR(ctx,x,y,size,size,r,'#12192e');
  if(hint){ctx.globalAlpha=0.12;fillRR(ctx,x,y,size,size,r,hint);ctx.globalAlpha=1;}
  ctx.globalAlpha=0.05;fillRR(ctx,x,y,size,size,r,'#fff');ctx.globalAlpha=1;
}

function drawBBGrid() {
  bbGlowT = performance.now();
  ctx.clearRect(0,0,gridCanvas.width,gridCanvas.height);
  ctx.fillStyle='#0a1020'; ctx.fillRect(0,0,gridCanvas.width,gridCanvas.height);
  const ghostSet=bbGhost?new Set(bbGhost.map(c=>`${c.r},${c.c}`)):new Set();
  const ghostColor=bbDrag?bbPieces[bbDrag.idx].color:'#fff';
  const cellR=Math.max(3,CELL*0.18);
  const nearRows=new Set(),nearCols=new Set();
  for(let r=0;r<ROWS;r++){const f=bbGrid[r].filter(c=>c).length;if(f>=6&&f<COLS)nearRows.add(r);}
  for(let c=0;c<COLS;c++){const f=bbGrid.filter(row=>row[c]).length;if(f>=6&&f<ROWS)nearCols.add(c);}
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
    const x=bbCellX(c),y=bbCellY(r),color=bbGrid[r][c],key=`${r},${c}`;
    const hint=(nearRows.has(r)||nearCols.has(c))?'#f5a623':null;
    if(color){drawCell(ctx,x,y,color,CELL,1,bbGlowT);}
    else if(ghostSet.has(key)){
      drawCell(ctx,x,y,ghostColor,CELL,bbGhostOk?0.6:0.2,bbGlowT);
      if(bbGhostOk){ctx.save();ctx.globalAlpha=0.85;ctx.strokeStyle='rgba(255,255,255,0.8)';ctx.lineWidth=2;roundedRectPath(ctx,x+1,y+1,CELL-2,CELL-2,cellR);ctx.stroke();ctx.restore();}
    }else{drawEmptyCell(ctx,x,y,CELL,hint);}
  }
  if(bbFlash){
    const a=Math.sin(bbFlash.t*Math.PI);
    for(const key of bbFlash.cells){const[fr,fc]=key.split(',').map(Number);ctx.save();ctx.globalAlpha=a*0.92;fillRR(ctx,bbCellX(fc),bbCellY(fr),CELL,CELL,cellR,'#ffffff');ctx.restore();}
  }
}

function drawBBTray() {
  for(let i=0;i<3;i++){
    const canvas=document.getElementById(`piece-${i}`);if(!canvas)continue;
    const pctx=canvas.getContext('2d');
    if(bbUsed[i]||!bbPieces[i]){canvas.width=canvas.height=60;pctx.clearRect(0,0,60,60);canvas.classList.add('used');continue;}
    canvas.classList.remove('used');
    const p=bbPieces[i],mr=Math.max(...p.cells.map(c=>c[0])),mc=Math.max(...p.cells.map(c=>c[1]));
    canvas.width=(mc+1)*(TRAY_CELL+TRAY_GAP)-TRAY_GAP+8;canvas.height=(mr+1)*(TRAY_CELL+TRAY_GAP)-TRAY_GAP+8;
    pctx.clearRect(0,0,canvas.width,canvas.height);
    for(const[row,col]of p.cells)drawCell(pctx,4+col*(TRAY_CELL+TRAY_GAP),4+row*(TRAY_CELL+TRAY_GAP),p.color,TRAY_CELL,1,bbGlowT);
  }
}

function renderDragPiece(piece) {
  const mr=Math.max(...piece.cells.map(c=>c[0])),mc=Math.max(...piece.cells.map(c=>c[1]));
  dragCanvas.width=DRAG_PAD*2+(mc+1)*DRAG_CELL+mc*DRAG_GAP;
  dragCanvas.height=DRAG_PAD*2+(mr+1)*DRAG_CELL+mr*DRAG_GAP;
  dragCtx.clearRect(0,0,dragCanvas.width,dragCanvas.height);
  for(const[r,c]of piece.cells)drawCell(dragCtx,DRAG_PAD+c*(DRAG_CELL+DRAG_GAP),DRAG_PAD+r*(DRAG_CELL+DRAG_GAP),piece.color,DRAG_CELL,0.95,bbGlowT);
}

function moveDragCanvas(cx,cy){
  const yOff=bbDrag?.isTouch?-(dragCanvas.height*0.55)-12:-dragCanvas.height/2;
  dragCanvas.style.left=(cx-dragCanvas.width/2)+'px';dragCanvas.style.top=(cy+yOff)+'px';
}

function bbAnimateClear(cellSet,onDone){
  const start=performance.now();
  function tick(now){const t=Math.min((now-start)/340,1);bbFlash={cells:cellSet,t};drawBBGrid();if(t<1)requestAnimationFrame(tick);else{bbFlash=null;onDone();}}
  requestAnimationFrame(tick);
}

function bumpScore(){const el=document.getElementById('score');el.classList.remove('bump');void el.offsetWidth;el.classList.add('bump');setTimeout(()=>el.classList.remove('bump'),200);}

function addBBScore(pts){
  bbScore+=pts;document.getElementById('score').textContent=bbScore;
  if(bbScore>bbHighscore){bbHighscore=bbScore;localStorage.setItem('bb_highscore',bbHighscore);document.getElementById('highscore').textContent=bbHighscore;}
  bumpScore();
}

function bbCanPlace(piece,ar,ac){return piece.cells.every(([dr,dc])=>{const r=ar+dr,c=ac+dc;return r>=0&&r<ROWS&&c>=0&&c<COLS&&!bbGrid[r][c];});}
function bbPlace(piece,ar,ac){for(const[dr,dc]of piece.cells)bbGrid[ar+dr][ac+dc]=piece.color;}
function bbFindLines(){const fr=[],fc=[];for(let r=0;r<ROWS;r++)if(bbGrid[r].every(c=>c))fr.push(r);for(let c=0;c<COLS;c++)if(bbGrid.every(row=>row[c]))fc.push(c);return{fullRows:fr,fullCols:fc};}
function bbExecClears(fr,fc){for(const r of fr)bbGrid[r].fill(null);for(const c of fc)for(let r=0;r<ROWS;r++)bbGrid[r][c]=null;}
function bbHasMove(){return bbPieces.some((p,i)=>{if(bbUsed[i])return false;for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++)if(bbCanPlace(p,r,c))return true;return false;});}

function bbGetAnchor(cx,cy,piece){
  const rect=gridCanvas.getBoundingClientRect(),sx=gridCanvas.width/rect.width,sy=gridCanvas.height/rect.height;
  const canX=(cx-rect.left)*sx,canY=(cy-rect.top)*sy;
  const pr=Math.max(...piece.cells.map(c=>c[0]))+1,pc=Math.max(...piece.cells.map(c=>c[1]))+1;
  return{row:Math.round((canY-BORDER-CELL*pr/2)/(CELL+GAP)),col:Math.round((canX-BORDER-CELL*pc/2)/(CELL+GAP))};
}

function bbUpdateGhost(cx,cy,piece){
  const{row,col}=bbGetAnchor(cx,cy,piece);
  bbGhostOk=bbCanPlace(piece,row,col);
  bbGhost=piece.cells.map(([dr,dc])=>({r:row+dr,c:col+dc}));
  return{row,col,valid:bbGhostOk};
}

function onBBDown(e,idx){
  if(bbLocked||bbUsed[idx]||!bbPieces[idx])return;e.preventDefault();
  const isTouch=!!e.touches,cx=isTouch?e.touches[0].clientX:e.clientX,cy=isTouch?e.touches[0].clientY:e.clientY;
  bbDrag={idx,isTouch};renderDragPiece(bbPieces[idx]);dragCanvas.style.display='block';
  moveDragCanvas(cx,cy);bbUpdateGhost(cx,cy,bbPieces[idx]);drawBBGrid();drawBBTray();
}
function onBBMove(e){
  if(!bbDrag)return;e.preventDefault();
  const cx=e.touches?e.touches[0].clientX:e.clientX,cy=e.touches?e.touches[0].clientY:e.clientY;
  moveDragCanvas(cx,cy);bbUpdateGhost(cx,cy,bbPieces[bbDrag.idx]);drawBBGrid();
}
function onBBUp(e){
  if(!bbDrag)return;
  const cx=e.changedTouches?e.changedTouches[0].clientX:e.clientX,cy=e.changedTouches?e.changedTouches[0].clientY:e.clientY;
  const piece=bbPieces[bbDrag.idx];const{row,col,valid}=bbUpdateGhost(cx,cy,piece);
  dragCanvas.style.display='none';
  if(!valid){bbGhost=null;bbDrag=null;drawBBGrid();drawBBTray();return;}
  bbPlace(piece,row,col);bbUsed[bbDrag.idx]=true;bbGhost=null;bbDrag=null;
  const base=piece.cells.length*2;const{fullRows,fullCols}=bbFindLines();const cleared=fullRows.length+fullCols.length;
  drawBBGrid();drawBBTray();
  if(!cleared){addBBScore(base);spawnPopup(`+${base}`,piece.color,'small',gridCanvas);if(bbUsed.every(u=>u))bbRefill();drawBBTray();if(!bbHasMove())setTimeout(bbGameOver,300);return;}
  const cellSet=new Set();
  for(const r of fullRows)for(let c=0;c<COLS;c++)cellSet.add(`${r},${c}`);
  for(const c of fullCols)for(let r=0;r<ROWS;r++)cellSet.add(`${r},${c}`);
  bbLocked=true;
  bbAnimateClear(cellSet,()=>{
    bbExecClears(fullRows,fullCols);
    const bonus=cleared>=4?3:cleared>=2?2:1,total=base+cleared*10*bonus;
    addBBScore(total);spawnPopup(`+${total}`,'#f5a623','big',gridCanvas);
    if(cleared>=4)spawnPopup('MEGA CLEAR! 🔥','#e94560','big',gridCanvas);
    else if(cleared===3)spawnPopup('TRIPLE! ⚡','#f5a623','',gridCanvas);
    else if(cleared===2)spawnPopup('DOUBLE! ✨','#7ed321','',gridCanvas);
    else spawnPopup('NICE! 👊',piece.color,'small',gridCanvas);
    if(bbUsed.every(u=>u))bbRefill();bbLocked=false;drawBBGrid();drawBBTray();
    if(!bbHasMove())setTimeout(bbGameOver,300);
  });
}

function bbRefill(){bbPieces=[bbRand(),bbRand(),bbRand()];bbUsed=[false,false,false];}
function bbRand(){return{cells:PIECE_DEFS[Math.floor(Math.random()*PIECE_DEFS.length)].cells,color:BB_COLORS[Math.floor(Math.random()*BB_COLORS.length)]};}
function bbGameOver(){document.getElementById('final-score').textContent=bbScore;document.getElementById('overlay').classList.remove('hidden');}

function bbShimmerLoop() {
  if (!bbLocked) { drawBBGrid(); drawBBTray(); }
  bbShimmerRaf = requestAnimationFrame(bbShimmerLoop);
}

function startGame(){
  bbGrid=Array.from({length:ROWS},()=>Array(COLS).fill(null));
  bbScore=0;bbLocked=false;
  document.getElementById('score').textContent='0';document.getElementById('highscore').textContent=bbHighscore;
  document.getElementById('overlay').classList.add('hidden');dragCanvas.style.display='none';
  bbGhost=null;bbDrag=null;bbFlash=null;bbRefill();
  if (bbShimmerRaf) cancelAnimationFrame(bbShimmerRaf);
  bbShimmerLoop();
}

function initBBCanvas(){gridCanvas.width=BORDER*2+COLS*CELL+(COLS-1)*GAP;gridCanvas.height=BORDER*2+ROWS*CELL+(ROWS-1)*GAP;}

for(let i=0;i<3;i++){const c=document.getElementById(`piece-${i}`);c.addEventListener('mousedown',e=>onBBDown(e,i));c.addEventListener('touchstart',e=>onBBDown(e,i),{passive:false});}
window.addEventListener('mousemove',onBBMove);window.addEventListener('touchmove',onBBMove,{passive:false});
window.addEventListener('mouseup',onBBUp);window.addEventListener('touchend',onBBUp);
document.getElementById('restart-btn').addEventListener('click',startGame);

// ══════════════════════════════════════════════════════════════════════════════
// TIC TAC TOE
// ══════════════════════════════════════════════════════════════════════════════

const TTT_SIZE=300,TTT_CELL=100,TTT_PAD=18;
const WIN_LINES=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
const tttCanvas=document.getElementById('ttt-canvas');
const tttCtx=tttCanvas.getContext('2d');
tttCanvas.width=tttCanvas.height=TTT_SIZE;

let tttBoard=Array(9).fill(null),tttCurrent='X',tttVsAI=true,tttScores={X:0,O:0,D:0},tttDone=false,tttWinLine=null,tttAnims=[];

function tttCX(i){return(i%3)*TTT_CELL+TTT_CELL/2;}
function tttCY(i){return Math.floor(i/3)*TTT_CELL+TTT_CELL/2;}

function drawTTT(){
  const c=tttCtx;c.clearRect(0,0,TTT_SIZE,TTT_SIZE);
  c.fillStyle='rgba(10,16,32,0.75)';roundedRectPath(c,0,0,TTT_SIZE,TTT_SIZE,16);c.fill();
  c.strokeStyle='rgba(255,255,255,0.14)';c.lineWidth=3;c.lineCap='round';
  for(let i=1;i<3;i++){c.beginPath();c.moveTo(i*TTT_CELL,TTT_PAD);c.lineTo(i*TTT_CELL,TTT_SIZE-TTT_PAD);c.stroke();c.beginPath();c.moveTo(TTT_PAD,i*TTT_CELL);c.lineTo(TTT_SIZE-TTT_PAD,i*TTT_CELL);c.stroke();}
  const animCells=new Set(tttAnims.map(a=>a.cell));
  for(let i=0;i<9;i++)if(tttBoard[i]&&!animCells.has(i))drawTTTPiece(c,i,tttBoard[i],1);
  for(const a of tttAnims){if(a.type==='X'||a.type==='O')drawTTTPiece(c,a.cell,a.type,a.t);else if(a.type==='line')drawTTTLine(c,a.t);}
  if(tttWinLine&&tttAnims.length===0)drawTTTLine(c,1);
}

function drawTTTPiece(c,i,type,t){
  const cx=tttCX(i),cy=tttCY(i),s=TTT_CELL*0.32,lw=Math.max(6,TTT_CELL*0.1);
  c.save();c.lineCap='round';c.lineWidth=lw;
  if(type==='X'){c.strokeStyle='#e94560';const p1=Math.min(t*2,1),p2=Math.max(0,(t-0.5)*2);c.beginPath();c.moveTo(cx-s,cy-s);c.lineTo(cx-s+2*s*p1,cy-s+2*s*p1);c.stroke();if(p2>0){c.beginPath();c.moveTo(cx+s,cy-s);c.lineTo(cx+s-2*s*p2,cy-s+2*s*p2);c.stroke();}}
  else{c.strokeStyle='#4a90e2';c.beginPath();c.arc(cx,cy,TTT_CELL*0.3,-Math.PI/2,-Math.PI/2+2*Math.PI*t);c.stroke();}
  c.restore();
}

function drawTTTLine(c,t){
  if(!tttWinLine)return;const[a,,b]=tttWinLine;const x1=tttCX(a),y1=tttCY(a),x2=tttCX(b),y2=tttCY(b);
  c.save();c.strokeStyle='rgba(255,255,255,0.9)';c.lineWidth=6;c.lineCap='round';c.shadowColor='rgba(255,255,255,0.55)';c.shadowBlur=14;
  c.beginPath();c.moveTo(x1,y1);c.lineTo(x1+(x2-x1)*t,y1+(y2-y1)*t);c.stroke();c.restore();
}

function tttRunAnim(type,cell,dur,onDone){
  const anim={type,cell,t:0};tttAnims.push(anim);const start=performance.now();
  function tick(now){anim.t=Math.min((now-start)/dur,1);drawTTT();if(anim.t<1)requestAnimationFrame(tick);else{tttAnims=tttAnims.filter(a=>a!==anim);if(onDone)onDone();}}
  requestAnimationFrame(tick);
}

function tttCheckWin(board){for(const[a,b,c]of WIN_LINES)if(board[a]&&board[a]===board[b]&&board[b]===board[c])return[a,b,c];return null;}

function tttMakeMove(cell){
  if(tttDone||tttBoard[cell]||tttAnims.length>0)return;
  tttBoard[cell]=tttCurrent;
  tttRunAnim(tttCurrent,cell,tttCurrent==='X'?260:320,()=>{
    const line=tttCheckWin(tttBoard);
    if(line){tttDone=true;tttWinLine=line;const w=tttCurrent;tttScores[w]++;tttUpdateScores();const name=tttVsAI?(w==='X'?'Spieler X':'Computer'):`Spieler ${w}`;document.getElementById('ttt-status').textContent=`${name} gewinnt! 🎉`;tttRunAnim('line',null,420,()=>{spawnPopup(w==='X'?'🎉 Gewonnen!':'🤖 KI gewinnt!',w==='X'?'#7ed321':'#e94560','big',tttCanvas);setTimeout(tttNewRound,2000);});}
    else if(tttBoard.every(c=>c)){tttDone=true;tttScores.D++;tttUpdateScores();document.getElementById('ttt-status').textContent='Unentschieden! 🤝';spawnPopup('🤝 Remis!','#f5a623','big',tttCanvas);setTimeout(tttNewRound,1800);}
    else{tttCurrent=tttCurrent==='X'?'O':'X';const who=tttVsAI?(tttCurrent==='O'?'Computer':'Spieler X'):`Spieler ${tttCurrent}`;document.getElementById('ttt-status').textContent=`${who} ist dran`;if(tttVsAI&&tttCurrent==='O')setTimeout(tttAIMove,480);}
  });
}

function tttAIMove(){const m=tttBestMove(tttBoard);if(m!==-1)tttMakeMove(m);}
function tttBestMove(board){let best=-Infinity,bm=-1;for(let i=0;i<9;i++)if(!board[i]){board[i]='O';const v=tttMM(board,false,0);board[i]=null;if(v>best){best=v;bm=i;}}return bm;}
function tttMM(board,isMax,d){const l=tttCheckWin(board);if(l)return board[l[0]]==='O'?10-d:d-10;if(board.every(c=>c))return 0;if(isMax){let b=-Infinity;for(let i=0;i<9;i++)if(!board[i]){board[i]='O';b=Math.max(b,tttMM(board,false,d+1));board[i]=null;}return b;}else{let b=Infinity;for(let i=0;i<9;i++)if(!board[i]){board[i]='X';b=Math.min(b,tttMM(board,true,d+1));board[i]=null;}return b;}}
function tttUpdateScores(){document.getElementById('ttt-score-x').textContent=tttScores.X;document.getElementById('ttt-score-o').textContent=tttScores.O;document.getElementById('ttt-score-d').textContent=tttScores.D;}
function tttNewRound(){tttBoard=Array(9).fill(null);tttCurrent='X';tttDone=false;tttWinLine=null;tttAnims=[];document.getElementById('ttt-status').textContent='Spieler X ist dran';drawTTT();}
function startTTT(){tttScores={X:0,O:0,D:0};tttUpdateScores();tttNewRound();}
function tttSetMode(vsAI){tttVsAI=vsAI;document.getElementById('mode-ai').classList.toggle('active',vsAI);document.getElementById('mode-2p').classList.toggle('active',!vsAI);document.getElementById('ttt-o-label').textContent=vsAI?'Computer':'Spieler O';startTTT();}

function tttClick(e){
  const rect=tttCanvas.getBoundingClientRect(),sx=TTT_SIZE/rect.width,sy=TTT_SIZE/rect.height;
  const cx=e.touches?e.touches[0].clientX:e.clientX,cy=e.touches?e.touches[0].clientY:e.clientY;
  const col=Math.floor((cx-rect.left)*sx/TTT_CELL),row=Math.floor((cy-rect.top)*sy/TTT_CELL);
  if(col<0||col>2||row<0||row>2)return;
  tttMakeMove(row*3+col);
}
tttCanvas.addEventListener('click',tttClick);
tttCanvas.addEventListener('touchstart',e=>{e.preventDefault();tttClick(e);},{passive:false});
document.getElementById('mode-ai').addEventListener('click',()=>tttSetMode(true));
document.getElementById('mode-2p').addEventListener('click',()=>tttSetMode(false));
document.getElementById('ttt-restart').addEventListener('click',startTTT);

// ══════════════════════════════════════════════════════════════════════════════
// HOLIDAY & SEASON SYSTEM
// ══════════════════════════════════════════════════════════════════════════════

const HOLIDAYS = {
  christmas: { label:'🎄 Frohe Weihnachten!', c1:'#c41e3a', c2:'#22aa22', particle:'snow'   },
  newyear:   { label:'🎆 Frohes Neues Jahr!',  c1:'#ffd700', c2:'#e040fb', particle:'spark'  },
  valentine: { label:'💖 Happy Valentine\'s!', c1:'#ff4081', c2:'#f48fb1', particle:'heart'  },
  easter:    { label:'🐣 Frohe Ostern!',       c1:'#aed581', c2:'#ff80ab', particle:'egg'    },
  spring:    { label:'🌸 Schöner Frühling!',   c1:'#f48fb1', c2:'#a5d6a7', particle:'flower' },
  summer:    { label:'☀️ Schöner Sommer!',     c1:'#ffd740', c2:'#40c4ff', particle:'star'   },
  halloween: { label:'🎃 Happy Halloween!',    c1:'#ff6d00', c2:'#ab47bc', particle:'bat'    },
  advent:    { label:'🕯️ Schöne Adventszeit!', c1:'#ffd700', c2:'#ef5350', particle:'star'   },
};

let holidayKey = null, seasonParticles = [];

function getHoliday() {
  const d=new Date(), m=d.getMonth()+1, day=d.getDate();
  if((m===12&&day>=15)||(m===1&&day===1)) return 'christmas';
  if(m===1&&day<=7)                       return 'newyear';
  if(m===2&&day>=10&&day<=16)             return 'valentine';
  if((m===3&&day>=20)||(m===4&&day<=25)) return 'easter';
  if(m===5&&day<=15)                      return 'spring';
  if((m===6&&day>=15)||m===7||m===8)     return 'summer';
  if((m===10&&day>=20)||(m===11&&day===1))return 'halloween';
  if(m===12)                              return 'advent';
  return null;
}

function initSeasonParticles(w, h) {
  holidayKey = getHoliday();
  seasonParticles = [];
  if (!holidayKey) return;
  const {c1, c2, particle} = HOLIDAYS[holidayKey];
  const isFall = ['snow','flower','egg','star','spark'].includes(particle);
  const isRise = particle === 'heart';
  for (let i=0; i<48; i++) {
    seasonParticles.push({
      x: Math.random()*w, y: Math.random()*h,
      vx: (Math.random()-0.5)*(particle==='bat'?1.2:0.38),
      vy: isFall ? 0.28+Math.random()*0.7 : isRise ? -(0.28+Math.random()*0.6) : (Math.random()-0.5)*0.5,
      size: 5+Math.random()*9,
      alpha: 0.3+Math.random()*0.5,
      rot: Math.random()*Math.PI*2, rotV:(Math.random()-0.5)*0.022,
      color: Math.random()<0.55 ? c1 : c2,
    });
  }
}

function drawSeasonParticle(ctx, p, type) {
  ctx.save();
  ctx.globalAlpha = p.alpha;
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rot);
  const s = p.size;
  ctx.fillStyle = p.color;
  ctx.strokeStyle = p.color;
  switch (type) {
    case 'snow': {
      ctx.lineWidth = 1.3;
      for (let i=0; i<3; i++) {
        ctx.rotate(Math.PI/3);
        ctx.strokeStyle = `rgba(200,230,255,${p.alpha})`;
        ctx.beginPath();
        ctx.moveTo(-s,0); ctx.lineTo(s,0);
        ctx.moveTo(-s*0.4,-s*0.38); ctx.lineTo(0,0); ctx.lineTo(-s*0.4,s*0.38);
        ctx.moveTo( s*0.4,-s*0.38); ctx.lineTo(0,0); ctx.lineTo( s*0.4,s*0.38);
        ctx.stroke();
      }
      break;
    }
    case 'heart': {
      ctx.beginPath();
      ctx.moveTo(0, s*0.25);
      ctx.bezierCurveTo(-s*0.12,0, -s*0.5,0, -s*0.5,s*0.35);
      ctx.bezierCurveTo(-s*0.5,s*0.75, 0,s*1.1, 0,s*1.3);
      ctx.bezierCurveTo(0,s*1.1, s*0.5,s*0.75, s*0.5,s*0.35);
      ctx.bezierCurveTo(s*0.5,0, s*0.12,0, 0,s*0.25);
      ctx.fill();
      break;
    }
    case 'star': {
      ctx.beginPath();
      for (let i=0; i<8; i++) {
        const r=i%2===0?s:s*0.38, a=i*Math.PI/4;
        i===0 ? ctx.moveTo(Math.sin(a)*r,-Math.cos(a)*r)
              : ctx.lineTo(Math.sin(a)*r,-Math.cos(a)*r);
      }
      ctx.closePath(); ctx.fill();
      break;
    }
    case 'flower': {
      for (let i=0; i<5; i++) {
        ctx.save(); ctx.rotate(i*Math.PI*2/5);
        ctx.beginPath(); ctx.ellipse(0,-s*0.55,s*0.3,s*0.52,0,0,Math.PI*2);
        ctx.fill(); ctx.restore();
      }
      ctx.fillStyle='#fff9e6';
      ctx.beginPath(); ctx.arc(0,0,s*0.26,0,Math.PI*2); ctx.fill();
      break;
    }
    case 'egg': {
      ctx.beginPath(); ctx.ellipse(0,0,s*0.52,s*0.72,0,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,0.38)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(-s*0.28,-s*0.22); ctx.lineTo(-s*0.08,s*0.12); ctx.stroke();
      break;
    }
    case 'spark': {
      ctx.shadowColor=p.color; ctx.shadowBlur=10;
      ctx.beginPath();
      for (let i=0; i<8; i++) {
        const r=i%2===0?s:s*0.28, a=i*Math.PI/4;
        i===0 ? ctx.moveTo(Math.sin(a)*r,-Math.cos(a)*r)
              : ctx.lineTo(Math.sin(a)*r,-Math.cos(a)*r);
      }
      ctx.closePath(); ctx.fill();
      break;
    }
    case 'bat': {
      ctx.fillStyle=`rgba(80,0,120,${p.alpha})`;
      ctx.beginPath(); ctx.ellipse(0,0,s*0.18,s*0.28,0,0,Math.PI*2); ctx.fill();
      for (const dir of [-1,1]) {
        ctx.beginPath();
        ctx.moveTo(dir*s*0.18,0);
        ctx.bezierCurveTo(dir*s*0.55,-s*0.5, dir*s,-s*0.1, dir*s*0.55,s*0.35);
        ctx.bezierCurveTo(dir*s*0.3,s*0.2, dir*s*0.2,s*0.1, dir*s*0.05,0);
        ctx.fill();
      }
      break;
    }
  }
  ctx.restore();
}

function showHolidayBanner() {
  const el = document.getElementById('holiday-banner');
  if (!el) return;
  if (holidayKey && HOLIDAYS[holidayKey]) {
    const {label, c1, c2} = HOLIDAYS[holidayKey];
    el.textContent = label;
    el.style.setProperty('--hc1', c1);
    el.style.setProperty('--hc2', c2);
    el.classList.add('visible');
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// BOOT
// ══════════════════════════════════════════════════════════════════════════════

initBBCanvas();
initBg();
requestAnimationFrame(animateBg);
updateHomeScores();
showHolidayBanner();
showScreen('home-screen');
