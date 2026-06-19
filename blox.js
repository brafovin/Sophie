(function () {
'use strict';

// ── Canvas ────────────────────────────────────────────────────────────────────
let canvas, ctx, W, H, running = false, raf = null;

// ── Isometric constants ───────────────────────────────────────────────────────
const TW = 48, TH = 24, BH = 22;

// ── Block palette ─────────────────────────────────────────────────────────────
const BLOCKS = {
  grass:   { top:'#56c95e', left:'#3d9442', right:'#2c7030', edge:'#1a4c1c' },
  dirt:    { top:'#a07850', left:'#7a5c38', right:'#604828', edge:'#3e2e18' },
  stone:   { top:'#8fa8b4', left:'#5f7e8a', right:'#4e6a74', edge:'#2e4550' },
  brick:   { top:'#f09080', left:'#e06050', right:'#c03830', edge:'#801020' },
  wood:    { top:'#ffd090', left:'#e89030', right:'#c06010', edge:'#903000' },
  gold:    { top:'#ffe870', left:'#ffc030', right:'#e08000', edge:'#c05000' },
  ice:     { top:'#c8f4ff', left:'#90d8f0', right:'#60c0e8', edge:'#1a80b8' },
  lava:    { top:'#ff7040', left:'#e03010', right:'#b01000', edge:'#800000' },
  end:     { top:'#e080ff', left:'#b040e0', right:'#8010c0', edge:'#500080' },
  metal:   { top:'#d8e8f0', left:'#88a8b8', right:'#607888', edge:'#204050' },
  crystal: { top:'#80ffee', left:'#40c8d8', right:'#2090b0', edge:'#006090' },
  rainbow: { top:'#ff8080', left:'#ff4040', right:'#c02020', edge:'#800000' }, // overridden at draw time
  mushroom:{ top:'#ff4444', left:'#cc2222', right:'#991111', edge:'#660000' },
  cloud:   { top:'#eef8ff', left:'#d0e8f8', right:'#b8d8f0', edge:'#80b0d0' },
  magic:   { top:'#7040c8', left:'#502090', right:'#301070', edge:'#180048' },
};

// ── World ─────────────────────────────────────────────────────────────────────
let world = {}, stars = [], endPos = null, totalStars = 0;

function wkey(x,y,z){ return `${x},${y},${z}`; }
function setBlock(x,y,z,t){ world[wkey(x,y,z)]=t; }
function getBlock(x,y,z){ return world[wkey(x,y,z)]||null; }

function buildLevel(){
  world={}; stars=[]; endPos=null;

  function plat(x0,z0,x1,z1,y,t){
    for(let x=x0;x<=x1;x++) for(let z=z0;z<=z1;z++) setBlock(x,y,z,t);
  }

  // ── 1. Grassy start island ──────────────────────────────────────────────────
  plat(0,0, 6,6, 0,'grass');
  plat(1,1, 5,5, 1,'dirt');
  // Mushroom decorations
  setBlock(0,2,0,'mushroom'); setBlock(6,2,0,'mushroom');
  setBlock(0,2,6,'mushroom'); setBlock(6,2,6,'mushroom');

  // ── 2. Rainbow bridge ───────────────────────────────────────────────────────
  for(let x=7;x<=11;x++){
    setBlock(x,0,2,'rainbow'); setBlock(x,0,3,'rainbow'); setBlock(x,0,4,'rainbow');
  }

  // ── 3. Crystal island ───────────────────────────────────────────────────────
  plat(12,0,19,8, 0,'stone');
  plat(12,0,19,8, 1,'stone');
  // Crystal spires
  for(let h=2;h<=6;h++) setBlock(12,h,0,'crystal');
  for(let h=2;h<=5;h++) setBlock(19,h,4,'crystal');
  for(let h=2;h<=4;h++) setBlock(15,h,8,'crystal');
  for(let h=2;h<=5;h++) setBlock(12,h,8,'crystal');

  // ── 4. Cloud steps (floating platforms) ────────────────────────────────────
  plat(20,2,22,4, 2,'cloud');
  plat(23,3,25,5, 3,'cloud');
  plat(26,2,28,4, 4,'cloud');

  // ── 5. Magic realm ──────────────────────────────────────────────────────────
  plat(29,0,37,8, 4,'magic');
  plat(29,0,37,8, 5,'magic');
  // Magic pillars
  for(let h=6;h<=9;h++){
    setBlock(29,h,0,'crystal'); setBlock(37,h,0,'crystal');
    setBlock(29,h,8,'crystal'); setBlock(37,h,8,'crystal');
  }

  // ── 6. Ice bridge ───────────────────────────────────────────────────────────
  for(let z=9;z<=15;z++){
    setBlock(32,5,z,'ice'); setBlock(33,5,z,'ice');
  }

  // ── 7. Golden palace ────────────────────────────────────────────────────────
  plat(29,16,39,26, 5,'gold');
  plat(29,16,39,26, 6,'gold');
  // Palace brick walls / towers
  for(let h=7;h<=11;h++){
    setBlock(29,h,16,'brick'); setBlock(39,h,16,'brick');
    setBlock(29,h,26,'brick'); setBlock(39,h,26,'brick');
  }
  // Battlements
  plat(29,16,39,16,11,'brick'); plat(29,26,39,26,11,'brick');
  // Inner floor details
  for(let x=31;x<=37;x+=2) for(let z=18;z<=24;z+=2) setBlock(x,7,z,'gold');

  // ── 8. Crystal staircase ─────────────────────────────────────────────────
  for(let i=0;i<8;i++){
    plat(31+i,27,33+i,28, 6+i,'crystal');
  }

  // ── 9. Sky fortress ──────────────────────────────────────────────────────
  plat(37,30,47,40,13,'magic');
  plat(37,30,47,40,14,'magic');
  // Crystal towers on fortress corners
  for(let h=15;h<=20;h++){
    setBlock(37,h,30,'crystal'); setBlock(47,h,30,'crystal');
    setBlock(37,h,40,'crystal'); setBlock(47,h,40,'crystal');
  }
  // End block
  setBlock(42,15,35,'end');
  endPos = {x:42, z:35};

  // ── Stars (guides the path) ───────────────────────────────────────────────
  stars = [
    {x:3,  y:2,  z:3,  collected:false},  // start island
    {x:9,  y:1,  z:3,  collected:false},  // rainbow bridge
    {x:15, y:2,  z:4,  collected:false},  // crystal island
    {x:17, y:2,  z:1,  collected:false},  // crystal island 2
    {x:21, y:3,  z:3,  collected:false},  // cloud step 1
    {x:27, y:5,  z:3,  collected:false},  // cloud step 3
    {x:31, y:6,  z:4,  collected:false},  // magic realm
    {x:35, y:6,  z:7,  collected:false},  // magic realm 2
    {x:32, y:6,  z:12, collected:false},  // ice bridge
    {x:33, y:7,  z:21, collected:false},  // palace
    {x:36, y:7,  z:18, collected:false},  // palace 2
    {x:38, y:8,  z:29, collected:false},  // crystal stairs
    {x:42, y:15, z:37, collected:false},  // fortress
    {x:44, y:15, z:32, collected:false},  // fortress 2
  ];
  totalStars = stars.length;
}

// ── Player ────────────────────────────────────────────────────────────────────
let px,py,pz, vx,vy,vz, onGround,wasOnGround, lives,score,walkPhase;
let playerTrail = [];

function resetPlayer(){
  px=3; py=2.5; pz=3;
  vx=0; vy=0; vz=0;
  onGround=false; wasOnGround=false; walkPhase=0;
  playerTrail=[];
}
function initPlayer(){ lives=3; score=0; resetPlayer(); updateHUD(); }
function updateHUD(){
  const s=document.getElementById('blox-score'); if(s) s.textContent=score;
  const l=document.getElementById('blox-lives'); if(l) l.textContent='❤️'.repeat(Math.max(0,lives));
}

// ── Camera ────────────────────────────────────────────────────────────────────
let camX=3, camZ=3;

// ── Input ─────────────────────────────────────────────────────────────────────
const keys={};
let jumpBtn=false, jumpConsumed=false;

function onKeyDown(e){
  keys[e.code]=true;
  if((e.code==='Space'||e.code==='ArrowUp') && !jumpConsumed) jumpBtn=true;
}
function onKeyUp(e){
  keys[e.code]=false;
  if(e.code==='Space'||e.code==='ArrowUp') jumpConsumed=false;
}

// ── Physics ───────────────────────────────────────────────────────────────────
const GRAVITY=0.022, JUMP_V=0.40, SPEED=0.10, FRICTION=0.80;

function getTopAt(wx,wz){
  let top=-99;
  for(const [ox,oz] of [[-0.28,-0.28],[-0.28,0.28],[0.28,-0.28],[0.28,0.28]]){
    const bx=Math.floor(wx+ox), bz=Math.floor(wz+oz);
    for(let y=25;y>=-2;y--){ if(getBlock(bx,y,bz)){top=Math.max(top,y+1);break;} }
  }
  return top;
}

function getBlockBelow(wx,wz,wyVal){
  const bx=Math.floor(wx), bz=Math.floor(wz), by=Math.floor(wyVal)-1;
  return getBlock(bx,by,bz);
}

function updatePhysics(){
  let mx=0,mz=0;
  if(keys['ArrowRight']||keys['KeyD']){ mx+=1; mz+=1; }
  if(keys['ArrowLeft'] ||keys['KeyA']){ mx-=1; mz-=1; }
  if(keys['ArrowDown'] ||keys['KeyS']){ mx+=1; mz-=1; }
  if(keys['KeyW']){ mx-=1; mz+=1; }

  const len=Math.sqrt(mx*mx+mz*mz);
  if(len>0){ mx/=len; mz/=len; }

  vx+=mx*SPEED; vz+=mz*SPEED;
  vx*=FRICTION;  vz*=FRICTION;

  if(jumpBtn && onGround){
    const below=getBlockBelow(px,pz,py);
    vy = below==='cloud' ? JUMP_V*1.55 : JUMP_V;
    onGround=false; jumpConsumed=true;
    spawnDust(px,py-0.1,pz,'#c8eeff',8);
  }
  jumpBtn=false;

  vy-=GRAVITY;
  px+=vx; pz+=vz;

  wasOnGround=onGround;
  const floor=getTopAt(px,pz);
  py+=vy;
  if(py<=floor){
    if(!wasOnGround && vy<-0.15) spawnDust(px,floor,pz,'#a09060',14);
    py=floor; vy=0; onGround=true;
  } else { onGround=false; }

  if(onGround&&(Math.abs(vx)+Math.abs(vz)>0.015)) walkPhase+=0.25;

  // Trail
  if(Math.sqrt(vx*vx+vz*vz)>0.04){
    playerTrail.push({x:px,y:py,z:pz,life:1,col:onGround?'#ffd740':'#90d8ff'});
    if(playerTrail.length>20) playerTrail.shift();
  }
  for(const t of playerTrail) t.life-=0.07;
  playerTrail=playerTrail.filter(t=>t.life>0);

  camX+=(px-camX)*0.09; camZ+=(pz-camZ)*0.09;

  // Collect stars
  for(const s of stars){
    if(s.collected) continue;
    if(Math.abs(px-s.x)<0.95&&Math.abs(pz-s.z)<0.95&&Math.abs(py-s.y)<1.5){
      s.collected=true; score+=10; updateHUD(); spawnStarBurst(px,py,pz);
    }
  }

  // Die
  if(py<-8){ lives--; if(lives<=0){lives=0;updateHUD();showEnd(false);return;} updateHUD(); resetPlayer(); }

  // Win
  if(endPos&&Math.abs(px-endPos.x)<1.4&&Math.abs(pz-endPos.z)<1.4&&py>=14) showEnd(true);
}

// ── Projection ────────────────────────────────────────────────────────────────
function iso(wx,wy,wz){
  const rx=wx-camX, rz=wz-camZ;
  return {
    sx: W/2 + (rx-rz)*(TW/2),
    sy: H*0.40 + (rx+rz)*(TH/2) - wy*BH
  };
}

// ── Block drawing ─────────────────────────────────────────────────────────────
function topPath(sx,sy){ ctx.beginPath(); ctx.moveTo(sx,sy-TH/2); ctx.lineTo(sx+TW/2,sy); ctx.lineTo(sx,sy+TH/2); ctx.lineTo(sx-TW/2,sy); ctx.closePath(); }
function leftPath(sx,sy){ ctx.beginPath(); ctx.moveTo(sx-TW/2,sy); ctx.lineTo(sx,sy+TH/2); ctx.lineTo(sx,sy+TH/2+BH); ctx.lineTo(sx-TW/2,sy+BH); ctx.closePath(); }
function rightPath(sx,sy){ ctx.beginPath(); ctx.moveTo(sx+TW/2,sy); ctx.lineTo(sx,sy+TH/2); ctx.lineTo(sx,sy+TH/2+BH); ctx.lineTo(sx+TW/2,sy+BH); ctx.closePath(); }

function rainbowB(wx,wz){
  const h=(frame*1.8+wx*20+wz*25)%360;
  return {top:`hsl(${h},100%,72%)`,left:`hsl(${(h+40)%360},100%,52%)`,right:`hsl(${(h+80)%360},100%,40%)`,edge:`hsl(${(h+120)%360},80%,22%)`};
}

function drawBlock(wx,wy,wz,type){
  const {sx,sy}=iso(wx+0.5,wy,wz+0.5);
  if(sx<-TW*2||sx>W+TW*2||sy<-BH*4||sy>H+BH*4) return;

  let b=BLOCKS[type]||BLOCKS.stone;
  if(type==='rainbow') b=rainbowB(wx,wz);

  // Glow effects
  ctx.shadowBlur=0;
  if(type==='lava')    { ctx.shadowColor='#ff4400'; ctx.shadowBlur=6+4*Math.sin(frame*0.1+wx+wz); }
  if(type==='crystal') { ctx.shadowColor='#40ffee'; ctx.shadowBlur=5+3*Math.sin(frame*0.07+wx*0.5+wz*0.7); }
  if(type==='magic')   { ctx.shadowColor='#8844ff'; ctx.shadowBlur=4+2*Math.sin(frame*0.06+wx+wz); }
  if(type==='rainbow') { ctx.shadowColor=`hsl(${(frame*2+wx*20)%360},100%,65%)`; ctx.shadowBlur=10; }
  if(type==='end')     { ctx.shadowColor='#e040fb'; ctx.shadowBlur=8+4*Math.sin(frame*0.08); }

  topPath(sx,sy);   ctx.fillStyle=b.top;   ctx.fill();
  leftPath(sx,sy);  ctx.fillStyle=b.left;  ctx.fill();
  rightPath(sx,sy); ctx.fillStyle=b.right; ctx.fill();
  ctx.shadowBlur=0;

  // Outlines
  ctx.strokeStyle=b.edge; ctx.lineWidth=0.8; ctx.globalAlpha=0.5;
  topPath(sx,sy);   ctx.stroke();
  leftPath(sx,sy);  ctx.stroke();
  rightPath(sx,sy); ctx.stroke();
  ctx.globalAlpha=1;

  // ── Per-type details ────────────────────────────────────────────────────────
  if(type==='grass'){
    ctx.globalAlpha=0.6; ctx.fillStyle='#78d47c';
    for(let i=0;i<6;i++){
      const rx=Math.sin(wx*7.3+wz*3.1+i*2.1)*8, ry=Math.cos(wx*5.7+wz*11.3+i*1.7)*3.5;
      ctx.beginPath(); ctx.arc(sx+rx,sy+ry,1.5,0,Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha=1;
  }

  if(type==='mushroom'){
    // White polka dots on cap
    ctx.fillStyle='#fff'; ctx.globalAlpha=0.85;
    for(let i=0;i<5;i++){
      const rx=Math.sin(wx*6+wz*4+i*1.6)*6, ry=Math.cos(wx*4+wz*8+i*1.3)*2.5;
      ctx.beginPath(); ctx.arc(sx+rx,sy+ry-1,2.2,0,Math.PI*2); ctx.fill();
    }
    // Stem highlight
    ctx.fillStyle='rgba(255,200,180,0.4)'; ctx.globalAlpha=0.5;
    leftPath(sx,sy); ctx.fill();
    ctx.globalAlpha=1;
  }

  if(type==='ice'){
    // Multiple shine facets
    ctx.fillStyle='rgba(255,255,255,0.45)';
    ctx.beginPath(); ctx.moveTo(sx-8,sy-TH/2+3); ctx.lineTo(sx,sy-TH/2+8); ctx.lineTo(sx-3,sy-TH/2+3); ctx.closePath(); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,0.25)';
    ctx.beginPath(); ctx.moveTo(sx+3,sy-TH/2+2); ctx.lineTo(sx+9,sy-TH/2+6); ctx.lineTo(sx+7,sy-TH/2+2); ctx.closePath(); ctx.fill();
    // Blue tint on sides
    ctx.fillStyle='rgba(100,200,255,0.15)'; leftPath(sx,sy); ctx.fill();
    rightPath(sx,sy); ctx.fill();
  }

  if(type==='gold'){
    const g=0.55+0.45*Math.sin(frame*0.08+wx*0.7+wz*0.9);
    ctx.fillStyle=`rgba(255,255,180,${g*0.38})`; topPath(sx,sy); ctx.fill();
    // Sparkle cross at peak glow
    if(Math.sin(frame*0.14+wx*2.1+wz*3.3)>0.85){
      ctx.strokeStyle='rgba(255,255,220,0.95)'; ctx.lineWidth=1.2;
      ctx.beginPath();
      ctx.moveTo(sx,sy-TH/2-3); ctx.lineTo(sx,sy-TH/2+3);
      ctx.moveTo(sx-3,sy-TH/2); ctx.lineTo(sx+3,sy-TH/2);
      ctx.stroke();
    }
  }

  if(type==='crystal'){
    const a=0.38+0.28*Math.sin(frame*0.06+wx+wz);
    ctx.fillStyle=`rgba(200,255,255,${a})`; topPath(sx,sy); ctx.fill();
    // Internal facet lines
    ctx.strokeStyle='rgba(100,255,240,0.55)'; ctx.lineWidth=1;
    ctx.beginPath();
    ctx.moveTo(sx-TW*0.3,sy); ctx.lineTo(sx,sy-TH*0.35);
    ctx.moveTo(sx+TW*0.2,sy-TH*0.1); ctx.lineTo(sx-TW*0.1,sy+TH*0.22);
    ctx.stroke();
  }

  if(type==='magic'){
    // Animated rune glyph
    const a=0.28+0.2*Math.sin(frame*0.09+wx*0.8+wz*1.1);
    const rh=(frame*1.2+wx*30+wz*25)%360;
    ctx.strokeStyle=`hsla(${rh},90%,70%,${a})`; ctx.lineWidth=1.3;
    ctx.beginPath(); ctx.moveTo(sx,sy-TH/2+2); ctx.lineTo(sx+7,sy+2); ctx.lineTo(sx-7,sy+2); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.arc(sx,sy-1,5,0,Math.PI*2); ctx.stroke();
    // Color wash
    ctx.fillStyle=`hsla(${rh},80%,50%,0.08)`; topPath(sx,sy); ctx.fill();
  }

  if(type==='cloud'){
    // Fluffy highlight overlay
    ctx.fillStyle='rgba(255,255,255,0.55)'; topPath(sx,sy); ctx.fill();
    ctx.fillStyle='rgba(200,230,255,0.2)'; leftPath(sx,sy); ctx.fill();
  }

  if(type==='lava'){
    // Lava bubble
    const bp=frame*0.05+wx*1.3+wz*0.9;
    if(Math.sin(bp)>0.65){
      const bx=sx+Math.sin(bp*2.1)*7, by=sy-2+Math.cos(bp*1.7)*2;
      ctx.fillStyle='#ff9944'; ctx.globalAlpha=0.85;
      ctx.beginPath(); ctx.arc(bx,by,3,0,Math.PI*2); ctx.fill();
      ctx.globalAlpha=1;
    }
    const lp=0.82+0.18*Math.sin(frame*0.12+wx*0.7+wz*0.5);
    ctx.fillStyle=`rgba(255,160,80,${(1-lp)*0.25})`; topPath(sx,sy); ctx.fill();
  }

  if(type==='brick'){
    ctx.strokeStyle='rgba(80,20,10,0.35)'; ctx.lineWidth=0.7; ctx.globalAlpha=0.7;
    ctx.beginPath();
    ctx.moveTo(sx-TW*0.35,sy-TH*0.04); ctx.lineTo(sx+TW*0.35,sy-TH*0.04);
    ctx.moveTo(sx,sy-TH*0.32); ctx.lineTo(sx+TW*0.45,sy+TH*0.12);
    ctx.stroke();
    ctx.globalAlpha=1;
  }

  if(type==='end'){
    const pa=0.25+0.2*Math.sin(frame*0.1+wx+wz);
    ctx.fillStyle=`rgba(240,160,255,${pa})`; topPath(sx,sy); ctx.fill();
  }
}

// ── Environment ───────────────────────────────────────────────────────────────
let skyStars=[], bgClouds=[], fireflies=[];

function initEnvironment(){
  skyStars=[];
  for(let i=0;i<95;i++) skyStars.push({
    x:Math.random()*W, y:Math.random()*H*0.6,
    r:Math.random()*1.4+0.2, phase:Math.random()*Math.PI*2,
    hue:[210,220,180,48,0,0][Math.floor(Math.random()*6)],
  });

  bgClouds=[];
  for(let i=0;i<9;i++) bgClouds.push({
    x:Math.random()*W*1.5, y:55+Math.random()*85,
    w:70+Math.random()*90, h:20+Math.random()*22,
    spd:0.1+Math.random()*0.2, alpha:0.14+Math.random()*0.18,
  });

  fireflies=[];
  for(let i=0;i<26;i++) fireflies.push({
    x:Math.random()*W, y:90+Math.random()*(H-120),
    vx:(Math.random()-0.5)*0.4, vy:(Math.random()-0.5)*0.3,
    phase:Math.random()*Math.PI*2, r:1.4+Math.random()*1.6,
    hue:[60,120,180,270,30,200][Math.floor(Math.random()*6)],
  });
}

function drawSky(){
  // Deep fantasy twilight gradient
  const sky=ctx.createLinearGradient(0,0,0,H);
  sky.addColorStop(0,'#080620');
  sky.addColorStop(0.30,'#180d55');
  sky.addColorStop(0.62,'#271570');
  sky.addColorStop(1,'#3d1840');
  ctx.fillStyle=sky; ctx.fillRect(0,0,W,H);

  // ── Aurora borealis ─────────────────────────────────────────────────────────
  const auroraDef=[[130,0.11],[170,0.08],[80,0.09],[220,0.07],[290,0.10],[50,0.06]];
  for(let ai=0;ai<auroraDef.length;ai++){
    const [hue,base]=auroraDef[ai], yBase=28+ai*16;
    ctx.save();
    for(let x=0;x<W;x+=3){
      const w1=Math.sin(x*0.014+frame*0.007+ai*1.3)*24;
      const w2=Math.sin(x*0.028+frame*0.005+ai*0.9)*14;
      const y=yBase+w1+w2;
      const a=base*(0.55+0.45*Math.sin(x*0.022+frame*0.006+ai));
      const bandH=26+Math.sin(x*0.035+frame*0.005)*12;
      const g=ctx.createLinearGradient(x,y,x,y+bandH);
      g.addColorStop(0,`hsla(${hue},90%,65%,0)`);
      g.addColorStop(0.4,`hsla(${hue},90%,65%,${a})`);
      g.addColorStop(1,`hsla(${hue},90%,65%,0)`);
      ctx.fillStyle=g; ctx.fillRect(x,y,3.5,bandH);
    }
    ctx.restore();
  }

  // ── Sky stars ───────────────────────────────────────────────────────────────
  for(const s of skyStars){
    const a=0.25+0.75*Math.abs(Math.sin(frame*0.04+s.phase));
    ctx.globalAlpha=a;
    ctx.fillStyle=s.hue===0?'#fff':`hsl(${s.hue},80%,88%)`;
    if(s.r>1.1){ ctx.shadowColor=s.hue===0?'#aaf':`hsl(${s.hue},100%,70%)`; ctx.shadowBlur=5; }
    ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha=1; ctx.shadowBlur=0;

  // ── Moving clouds ───────────────────────────────────────────────────────────
  for(const c of bgClouds){
    c.x-=c.spd; if(c.x<-c.w*1.5) c.x=W+c.w;
    ctx.globalAlpha=c.alpha;
    ctx.fillStyle='#b8c8e8';
    ctx.beginPath(); ctx.ellipse(c.x,c.y,c.w*.5,c.h*.4,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(c.x-c.w*.22,c.y+5,c.w*.32,c.h*.3,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(c.x+c.w*.2,c.y+4,c.w*.28,c.h*.28,0,0,Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha=1;

  // ── Far mountain silhouettes (two layers) ───────────────────────────────────
  ctx.fillStyle='#0c1428';
  ctx.beginPath(); ctx.moveTo(0,H);
  [[0,198],[35,160],[75,175],[115,145],[155,162],[198,133],[240,155],[282,130],[325,150],[367,136],[400,158],[400,H]].forEach(([mx,my])=>ctx.lineTo(mx,my));
  ctx.closePath(); ctx.fill();

  ctx.fillStyle='#161e3c';
  ctx.beginPath(); ctx.moveTo(0,H);
  [[0,218],[55,196],[95,210],[135,188],[175,200],[215,178],[255,194],[295,180],[335,198],[375,184],[400,200],[400,H]].forEach(([mx,my])=>ctx.lineTo(mx,my));
  ctx.closePath(); ctx.fill();
}

function drawFireflies(){
  for(const f of fireflies){
    f.x+=f.vx+Math.sin(frame*0.03+f.phase)*0.35;
    f.y+=f.vy+Math.cos(frame*0.025+f.phase)*0.28;
    if(f.x<0)f.x=W; if(f.x>W)f.x=0;
    if(f.y<90)f.y=90; if(f.y>H-25)f.y=H-25;
    const glow=0.3+0.7*Math.sin(frame*0.09+f.phase);
    ctx.globalAlpha=glow*0.85;
    ctx.shadowColor=`hsl(${f.hue},100%,70%)`; ctx.shadowBlur=10;
    ctx.fillStyle=`hsl(${f.hue},100%,78%)`;
    ctx.beginPath(); ctx.arc(f.x,f.y,f.r*(0.7+0.3*glow),0,Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha=1; ctx.shadowBlur=0;
}

// ── Collectible star ──────────────────────────────────────────────────────────
function drawStar(wx,wy,wz){
  const {sx,sy}=iso(wx+0.5,wy+0.65,wz+0.5);
  if(sx<-25||sx>W+25||sy<-25||sy>H+25) return;

  const bob=Math.sin(frame*0.09+wx+wz)*5;
  const rot=frame*0.06;
  const pulse=0.85+0.15*Math.sin(frame*0.13+wx);
  const r=11*pulse;

  ctx.save(); ctx.translate(sx,sy+bob);

  // Outer aura rings
  ctx.globalAlpha=0.12; ctx.fillStyle='#ffd740';
  ctx.beginPath(); ctx.arc(0,0,r*3.2,0,Math.PI*2); ctx.fill();
  ctx.globalAlpha=0.2; ctx.fillStyle='#fff8a0';
  ctx.beginPath(); ctx.arc(0,0,r*2.1,0,Math.PI*2); ctx.fill();
  ctx.globalAlpha=1;

  // Star glow
  ctx.shadowColor='#ffd740'; ctx.shadowBlur=16;
  ctx.fillStyle='#ffd740';
  ctx.beginPath();
  for(let i=0;i<5;i++){
    const a=rot+i*Math.PI*2/5-Math.PI/2, ai=a+Math.PI/5;
    if(i===0) ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r);
    else ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);
    ctx.lineTo(Math.cos(ai)*r*0.42,Math.sin(ai)*r*0.42);
  }
  ctx.closePath(); ctx.fill();

  // Inner bright highlight
  ctx.shadowBlur=0; ctx.globalAlpha=0.75; ctx.fillStyle='#fffde8';
  ctx.beginPath();
  for(let i=0;i<5;i++){
    const a=rot+i*Math.PI*2/5-Math.PI/2, ai=a+Math.PI/5;
    if(i===0) ctx.moveTo(Math.cos(a)*r*0.52,Math.sin(a)*r*0.52);
    else ctx.lineTo(Math.cos(a)*r*0.52,Math.sin(a)*r*0.52);
    ctx.lineTo(Math.cos(ai)*r*0.22,Math.sin(ai)*r*0.22);
  }
  ctx.closePath(); ctx.fill();

  ctx.globalAlpha=1; ctx.restore();
}

// ── End portal ────────────────────────────────────────────────────────────────
function drawEndPortal(){
  if(!endPos) return;
  const {sx,sy}=iso(endPos.x+0.5,16,endPos.z+0.5);
  if(sx<-60||sx>W+60||sy<-60||sy>H+60) return;

  ctx.save();

  // Pulsing halo layers
  for(let ring=4;ring>=0;ring--){
    const rs=1-ring*0.07, rh=(frame*2+ring*40)%360;
    ctx.globalAlpha=0.06+ring*0.04;
    ctx.strokeStyle=`hsl(${rh},100%,70%)`;
    ctx.lineWidth=5-ring*0.7;
    ctx.shadowColor=`hsl(${rh},100%,60%)`; ctx.shadowBlur=14-ring*2;
    ctx.beginPath(); ctx.ellipse(sx,sy,30*rs,15*rs,0,0,Math.PI*2); ctx.stroke();
  }

  // Spinning inner fill
  ctx.globalAlpha=0.38;
  const pg=ctx.createRadialGradient(sx,sy,0,sx,sy,26);
  pg.addColorStop(0,`hsla(${frame*2%360},100%,80%,0.9)`);
  pg.addColorStop(0.5,`hsla(${(frame*2+120)%360},100%,60%,0.4)`);
  pg.addColorStop(1,'hsla(0,0%,0%,0)');
  ctx.fillStyle=pg;
  ctx.beginPath(); ctx.ellipse(sx,sy,26,13,0,0,Math.PI*2); ctx.fill();

  // Orbiting gems
  for(let i=0;i<8;i++){
    const a=frame*0.05+i*Math.PI/4;
    const gx=sx+Math.cos(a)*34, gy=sy+Math.sin(a)*17-3;
    ctx.globalAlpha=0.9;
    ctx.fillStyle=`hsl(${(frame*3+i*45)%360},100%,75%)`;
    ctx.shadowColor=ctx.fillStyle; ctx.shadowBlur=10;
    ctx.beginPath(); ctx.arc(gx,gy,3,0,Math.PI*2); ctx.fill();
  }

  // "ZIEL" label
  ctx.shadowBlur=0; ctx.globalAlpha=0.65+0.35*Math.sin(frame*0.09);
  ctx.fillStyle='#fff'; ctx.font='bold 10px sans-serif'; ctx.textAlign='center';
  ctx.shadowColor='#e040fb'; ctx.shadowBlur=8;
  ctx.fillText('ZIEL',sx,sy-36);
  ctx.shadowBlur=0; ctx.globalAlpha=1; ctx.textAlign='left';
  ctx.restore();
}

// ── Particles ─────────────────────────────────────────────────────────────────
let particles=[];

function spawnStarBurst(x,y,z){
  for(let i=0;i<18;i++){
    const a=Math.random()*Math.PI*2, spd=0.04+Math.random()*0.1;
    particles.push({x,y:y+0.4,z,vx:Math.cos(a)*spd,vy:0.09+Math.random()*0.12,vz:Math.sin(a)*spd,life:1,col:Math.random()>0.4?'#ffd740':'#fffde0',size:4});
  }
}

function spawnDust(x,y,z,col,n){
  for(let i=0;i<n;i++){
    const a=Math.random()*Math.PI*2, spd=0.015+Math.random()*0.04;
    particles.push({x,y,z,vx:Math.cos(a)*spd,vy:0.01+Math.random()*0.03,vz:Math.sin(a)*spd,life:1,col,size:2+Math.random()*2.5});
  }
}

function updateParticles(){
  for(const p of particles){ p.x+=p.vx; p.y+=p.vy; p.z+=p.vz; p.vy-=0.006; p.life-=0.04; }
  particles=particles.filter(p=>p.life>0);
}

function drawParticles(){
  for(const p of particles){
    const {sx,sy}=iso(p.x,p.y,p.z);
    ctx.globalAlpha=p.life*0.92; ctx.fillStyle=p.col;
    ctx.shadowColor=p.col; ctx.shadowBlur=6;
    ctx.beginPath(); ctx.arc(sx,sy,p.size*p.life,0,Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha=1; ctx.shadowBlur=0;
}

// ── Player ────────────────────────────────────────────────────────────────────
function drawTrail(){
  for(const t of playerTrail){
    const {sx,sy}=iso(t.x,t.y,t.z);
    ctx.globalAlpha=t.life*0.38; ctx.fillStyle=t.col;
    ctx.shadowColor=t.col; ctx.shadowBlur=8;
    ctx.beginPath(); ctx.arc(sx,sy-8,6*t.life,0,Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha=1; ctx.shadowBlur=0;
}

function drawPlayer(){
  const {sx,sy}=iso(px,py,pz);
  ctx.save();

  const walk=onGround?Math.sin(walkPhase):0;
  const squishY=onGround?1:(vy>0.05?0.90:1.08);
  const speed=Math.sqrt(vx*vx+vz*vz);

  // Ground shadow (projects onto floor level)
  const floorY=getTopAt(px,pz);
  const {sx:fsx,sy:fsy}=iso(px,floorY,pz);
  const dist=Math.max(0,py-floorY);
  ctx.fillStyle='rgba(0,0,0,0.22)'; ctx.globalAlpha=Math.max(0,0.9-dist*0.08);
  ctx.beginPath(); ctx.ellipse(fsx,fsy+BH-4,13-dist*0.5,6-dist*0.25,0,0,Math.PI*2); ctx.fill();
  ctx.globalAlpha=1;

  ctx.translate(sx,sy);
  ctx.scale(1,squishY);

  // Shoes
  ctx.fillStyle='#0d47a1';
  ctx.fillRect(-8,8,7,4); ctx.fillRect(1,8,7,4);

  // Legs with walk swing
  ctx.fillStyle='#1565c0';
  ctx.save(); ctx.translate(-4,-1); ctx.rotate(walk*0.28); ctx.fillRect(-3,0,6,11); ctx.restore();
  ctx.save(); ctx.translate(4,-1); ctx.rotate(-walk*0.28); ctx.fillRect(-3,0,6,11); ctx.restore();

  // Belt
  ctx.fillStyle='#4a2800'; ctx.fillRect(-7,-2,14,3);
  ctx.fillStyle='#c8a000'; ctx.fillRect(-2,-2,4,3);

  // Body — with side shading
  ctx.fillStyle='#e53935'; ctx.fillRect(-7,-17,14,13);
  ctx.fillStyle='rgba(0,0,0,0.20)'; ctx.fillRect(-7,-17,4,13);
  ctx.fillStyle='rgba(255,255,255,0.18)'; ctx.fillRect(-7,-17,14,4);

  // Stripe on shirt
  ctx.fillStyle='rgba(255,255,255,0.25)'; ctx.fillRect(-7,-10,14,2);

  // Arms with counter-swing
  ctx.fillStyle='#ffccbc';
  ctx.save(); ctx.translate(-10,-15); ctx.rotate(-walk*0.28); ctx.fillRect(-3,0,5,11); ctx.restore();
  ctx.save(); ctx.translate(10,-15); ctx.rotate(walk*0.28); ctx.fillRect(-2,0,5,11); ctx.restore();

  // Head
  ctx.fillStyle='#ffccbc'; ctx.fillRect(-7,-30,14,13);
  ctx.fillStyle='rgba(0,0,0,0.1)'; ctx.fillRect(4,-30,3,13);
  ctx.fillStyle='rgba(255,200,170,0.5)'; ctx.fillRect(-7,-30,3,13);

  // Eyes — white + iris + shine
  ctx.fillStyle='#fff';
  ctx.fillRect(-5,-27,4,4); ctx.fillRect(1,-27,4,4);
  ctx.fillStyle='#1a237e';
  ctx.fillRect(-4,-26,2,2); ctx.fillRect(2,-26,2,2);
  ctx.fillStyle='#fff';
  ctx.fillRect(-3,-26,1,1); ctx.fillRect(3,-26,1,1);

  // Smile
  ctx.strokeStyle='#b06040'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.arc(0,-21,3.5,0.15,Math.PI-0.15); ctx.stroke();

  // Hat brim
  ctx.fillStyle='#e8a000'; ctx.fillRect(-9,-32,18,4);
  ctx.fillStyle='#ffd740'; ctx.fillRect(-6,-38,12,7);
  ctx.fillStyle='rgba(255,255,255,0.28)'; ctx.fillRect(-6,-38,7,2);
  // Hat band
  ctx.fillStyle='#ff6000'; ctx.fillRect(-6,-33,12,2);

  // Jump sparkle
  if(!onGround && vy>0.04){
    ctx.globalAlpha=0.75; ctx.fillStyle='#80d8ff';
    ctx.shadowColor='#80d8ff'; ctx.shadowBlur=10;
    ctx.beginPath(); ctx.arc(0,6,4,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0; ctx.globalAlpha=1;
  }

  // Speed blur (when running fast)
  if(speed>0.08 && onGround){
    ctx.globalAlpha=speed*3;
    ctx.fillStyle='rgba(255,255,200,0.3)';
    ctx.fillRect(-7,-30,14,42);
    ctx.globalAlpha=1;
  }

  ctx.restore();
}

// ── HUD ───────────────────────────────────────────────────────────────────────
function drawHUD(){
  const collected=stars.filter(s=>s.collected).length;

  // Star bar background
  ctx.fillStyle='rgba(0,0,0,0.55)';
  ctx.beginPath(); ctx.roundRect(6,H-24,118,15,6); ctx.fill();

  // Fill
  ctx.shadowColor='#ffd740'; ctx.shadowBlur=7;
  ctx.fillStyle='#ffd740';
  const fill=Math.max(0,(collected/totalStars)*112);
  if(fill>0){ ctx.beginPath(); ctx.roundRect(8,H-22,fill,11,4); ctx.fill(); }
  ctx.shadowBlur=0;

  // Border
  ctx.strokeStyle='rgba(255,220,0,0.45)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.roundRect(8,H-22,112,11,4); ctx.stroke();

  ctx.fillStyle='rgba(255,255,255,0.9)'; ctx.font='bold 9px monospace';
  ctx.fillText(`⭐ ${collected}/${totalStars}`,126,H-13);

  // Controls hint
  if(frame<290){
    const a=frame<240?1:1-(frame-240)/50;
    ctx.globalAlpha=a*0.85;
    ctx.fillStyle='rgba(10,6,30,0.8)';
    ctx.beginPath(); ctx.roundRect(W/2-115,7,230,26,6); ctx.fill();
    ctx.fillStyle='#c8e8ff'; ctx.font='9px monospace'; ctx.textAlign='center';
    ctx.fillText('WASD bewegen  •  Leertaste / ▲ springen',W/2,24);
    ctx.textAlign='left'; ctx.globalAlpha=1;
  }
}

// ── Render ────────────────────────────────────────────────────────────────────
let frame=0, gameOver=false;

function getVisible(){
  const res=[], viewR=28, cx=Math.round(camX), cz=Math.round(camZ);
  for(const key in world){
    const p=key.split(','); const x=+p[0],y=+p[1],z=+p[2];
    if(Math.abs(x-cx)>viewR||Math.abs(z-cz)>viewR) continue;
    res.push([x,y,z,world[key]]);
  }
  res.sort((a,b)=>(a[0]+a[2])-(b[0]+b[2])||a[1]-b[1]);
  return res;
}

function render(){
  ctx.clearRect(0,0,W,H);
  drawSky();
  drawFireflies();

  drawTrail();
  const blocks=getVisible();
  const pd=px+pz;
  let drew=false;

  for(const [x,y,z,t] of blocks){
    if(!drew && (x+z)>=pd){ drawPlayer(); drawParticles(); drew=true; }
    drawBlock(x,y,z,t);
  }
  if(!drew){ drawPlayer(); drawParticles(); }

  for(const s of stars) if(!s.collected) drawStar(s.x,s.y,s.z);
  drawEndPortal();
  drawHUD();
}

// ── End screen ────────────────────────────────────────────────────────────────
function showEnd(won){
  gameOver=true;
  const collected=stars.filter(s=>s.collected).length;

  ctx.fillStyle=won?'rgba(15,8,40,0.85)':'rgba(40,4,4,0.85)';
  ctx.fillRect(0,0,W,H);

  // Sparkles on win
  if(won){
    for(let i=0;i<22;i++){
      const x=Math.random()*W, y=Math.random()*H;
      const h=Math.random()*360;
      ctx.fillStyle=`hsl(${h},100%,75%)`;
      ctx.globalAlpha=Math.random()*0.8+0.2;
      ctx.beginPath(); ctx.arc(x,y,Math.random()*3+1,0,Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha=1;
  }

  ctx.textAlign='center';
  ctx.shadowColor=won?'#ffd740':'#ff4444'; ctx.shadowBlur=28;
  ctx.fillStyle=won?'#ffd740':'#ff6644';
  ctx.font='bold 30px sans-serif';
  ctx.fillText(won?'🏆 Ziel erreicht!':'💀 Game Over',W/2,H/2-30);
  ctx.shadowBlur=0;

  ctx.fillStyle='#d8ecff'; ctx.font='13px sans-serif';
  ctx.fillText(`Punkte: ${score}   ⭐ ${collected}/${totalStars}`,W/2,H/2+8);

  ctx.fillStyle='rgba(200,220,255,0.55)'; ctx.font='10px sans-serif';
  ctx.fillText('Tippe oder klicke zum Neustart',W/2,H/2+30);
  ctx.textAlign='left';
}

// ── Loop ──────────────────────────────────────────────────────────────────────
function loop(){
  if(!running) return;
  frame++;
  if(!gameOver){ updatePhysics(); updateParticles(); render(); }
  raf=requestAnimationFrame(loop);
}

function restart(){
  gameOver=false; particles=[]; playerTrail=[];
  buildLevel(); initPlayer(); camX=3; camZ=3; frame=0;
}

// ── Public API ────────────────────────────────────────────────────────────────
window.startBlox=function(){
  canvas=document.getElementById('blox-canvas');
  if(!canvas) return;
  ctx=canvas.getContext('2d');
  W=canvas.width=400; H=canvas.height=260;

  initEnvironment(); buildLevel(); initPlayer();
  camX=3; camZ=3; gameOver=false; particles=[]; playerTrail=[];
  frame=0; running=true;

  window.addEventListener('keydown',onKeyDown);
  window.addEventListener('keyup',onKeyUp);

  canvas.addEventListener('click',()=>{ if(gameOver) restart(); });
  canvas.addEventListener('touchstart',(e)=>{
    e.preventDefault(); if(gameOver) restart(); else jumpBtn=true;
  },{passive:false});

  function hookBtn(id,code,isJump){
    const el=document.getElementById(id); if(!el) return;
    const dn=()=>{ keys[code]=true; if(isJump&&onGround){ jumpBtn=true; } };
    const up=()=>{ keys[code]=false; if(isJump) jumpConsumed=false; };
    el.addEventListener('mousedown',dn); el.addEventListener('mouseup',up);
    el.addEventListener('touchstart',(e)=>{e.preventDefault();dn();},{passive:false});
    el.addEventListener('touchend',(e)=>{e.preventDefault();up();},{passive:false});
  }
  hookBtn('blox-up',   'KeyW', false);
  hookBtn('blox-down', 'KeyS', false);
  hookBtn('blox-left', 'KeyA', false);
  hookBtn('blox-right','KeyD', false);
  hookBtn('blox-jump', 'Space',true);

  loop();
};

window.stopBlox=function(){
  running=false;
  if(raf){cancelAnimationFrame(raf);raf=null;}
  window.removeEventListener('keydown',onKeyDown);
  window.removeEventListener('keyup',onKeyUp);
  for(const k in keys) keys[k]=false;
  jumpBtn=false; jumpConsumed=false;
};

})();
