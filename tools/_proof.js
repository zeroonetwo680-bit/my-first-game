// Composite proof: a real rendered game frame with the coaching card laid out
// using the exact numbers from css/style.css (#coach / #coach-card).
const fs=require('fs'),path=require('path'),vm=require('vm');
const {createCanvas}=require('@napi-rs/canvas');
const R=path.join(__dirname,'..');
const VW=1280,VH=720;
const makeEl=(id)=>({id,style:{},textContent:'',
  classList:{_s:new Set(),add(c){this._s.add(c)},remove(c){this._s.delete(c)},toggle(c,f){if(f===undefined)f=!this._s.has(c);if(f)this._s.add(c);else this._s.delete(c);return f},contains(c){return this._s.has(c)}},
  addEventListener(){},appendChild(){},getAttribute:()=>null,setAttribute(){},getBoundingClientRect:()=>({left:0,top:0,width:VW,height:VH})});
const els={}; const real=createCanvas(VW,VH);
els['game']=Object.assign(makeEl('game'),{width:VW,height:VH,getContext:()=>real.getContext('2d')});
const sb={console,Math,JSON,Date,Object,Array,String,Number,Boolean,isNaN,parseInt,parseFloat,
 document:{getElementById:(id)=>els[id]||(els[id]=makeEl(id)),createElement:(t)=>t==='canvas'?createCanvas(1,1):makeEl('dyn'),
  addEventListener(){},body:makeEl('body'),querySelectorAll:()=>[],querySelector:()=>makeEl('q')},
 localStorage:{_m:{},getItem(k){return this._m[k]===undefined?null:this._m[k]},setItem(k,v){this._m[k]=String(v)},removeItem(k){delete this._m[k]}},
 performance:{now:()=>Date.now()},requestAnimationFrame:()=>0,cancelAnimationFrame(){},setTimeout,clearTimeout,setInterval:()=>0,clearInterval:()=>{},
 navigator:{userAgent:'node',maxTouchPoints:1},innerWidth:VW,innerHeight:VH,devicePixelRatio:1,
 matchMedia:()=>({matches:false}),addEventListener(){},removeEventListener(){}};
sb.window=sb; sb.self=sb; sb.globalThis=sb;
vm.createContext(sb);
['js/core.js','js/input.js','js/audio.js','js/fx.js','js/platform.js','js/achievements.js','js/game.js']
 .forEach(f=>vm.runInContext(fs.readFileSync(R+'/'+f,'utf8'),sb,{filename:f}));
vm.runInContext(`
Game.init(); Game.startRun();
Coach.touchOverride = true; Coach.stop(false); store.set('nw.coachDone', false);
Coach.start({ force: true });
for (let i=0;i<40;i++) Game.update(0.016);
Game.render();
`,sb);

const S=2, out=createCanvas(VW*S,VH*S), g=out.getContext('2d');
g.scale(S,S); g.drawImage(real,0,0,VW,VH);

// --- card: numbers straight from style.css -------------------------------
const W=560, PADT=12, PADB=13, PADX=16, R=14;
const keysH=11, keysMB=7, titleH=Math.round(17*1.2), titleMB=5, bodyLh=Math.round(13*1.45);
const bodyText=els['coach-body'].textContent;
const skipH=5*2+10, skipMT=9;
const bodyLines=2;                                  // wraps at 560-32 px
const H=PADT+keysH+keysMB+titleH+titleMB+bodyLh*bodyLines+skipMT+skipH+PADB;
const x=(VW-W)/2, y=VH-VH*0.18-H;                   // bottom:18%

g.save();
g.shadowColor='rgba(0,0,0,0.6)'; g.shadowBlur=40*S/2; g.shadowOffsetY=14;
const bg=g.createLinearGradient(0,y,0,y+H);
bg.addColorStop(0,'rgba(10,18,32,0.92)'); bg.addColorStop(1,'rgba(5,9,18,0.94)');
g.beginPath();
g.moveTo(x+R,y); g.arcTo(x+W,y,x+W,y+H,R); g.arcTo(x+W,y+H,x,y+H,R);
g.arcTo(x,y+H,x,y,R); g.arcTo(x,y,x+W,y,R); g.closePath();
g.fillStyle=bg; g.fill(); g.restore();
g.strokeStyle='rgba(53,240,255,0.35)'; g.lineWidth=1; g.stroke();

let cy=y+PADT;
g.textAlign='center';
// keys
g.fillStyle='#35f0ff'; g.font='700 11px monospace';
g.shadowColor='rgba(53,240,255,0.6)'; g.shadowBlur=10;
g.fillText(els['coach-keys'].textContent.split('').join(' '), VW/2, cy+keysH); g.shadowBlur=0;
cy+=keysH+keysMB;
// title
g.fillStyle='#fff'; g.font='900 17px sans-serif';
g.fillText(els['coach-title'].textContent, VW/2, cy+titleH-4);
cy+=titleH+titleMB;
// body (wrap)
g.fillStyle='rgba(200,220,240,0.85)'; g.font='600 13px sans-serif';
const words=bodyText.split(' '), lines=[]; let line='';
for (const w of words){ const t=line?line+' '+w:w; if (g.measureText(t).width>W-PADX*2 && line){ lines.push(line); line=w; } else line=t; }
if (line) lines.push(line);
lines.slice(0,bodyLines).forEach((l,i)=>g.fillText(l,VW/2,cy+bodyLh*(i+1)-4));
cy+=bodyLh*bodyLines+skipMT;
// skip pill
const sw=76;
g.beginPath(); g.roundRect ? g.roundRect(VW/2-sw/2,cy,sw,skipH,999) : g.rect(VW/2-sw/2,cy,sw,skipH);
g.fillStyle='rgba(255,255,255,0.06)'; g.fill();
g.strokeStyle='rgba(255,255,255,0.16)'; g.stroke();
g.fillStyle='rgba(180,210,230,0.8)'; g.font='700 10px monospace';
g.fillText('S K I P',VW/2,cy+skipH/2+3.5);
// step counter (from #coach::after)
g.textAlign='right'; g.fillStyle='rgba(120,170,200,0.55)'; g.font='700 9px monospace';
g.fillText('1/3',x+W-14,y+H-8);

fs.writeFileSync('/tmp/coach-proof.png', out.encodeSync('png'));
console.log('card box', Math.round(x), Math.round(y), W, Math.round(H), '| body lines', lines.length);
console.log('keys/title:', els['coach-keys'].textContent, '/', els['coach-title'].textContent);
