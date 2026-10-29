const fs=require('fs'),path=require('path'),vm=require('vm');
const {createCanvas}=require('@napi-rs/canvas');
const ROOT='/home/user/my-first-game';
function boot(VW,VH,script){
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
   .forEach(f=>vm.runInContext(fs.readFileSync(ROOT+'/'+f,'utf8'),sb,{filename:f}));
  sb.__canvas=real;
  vm.runInContext(script,sb);
  return {real,els,sb};
}
module.exports={boot};
if (require.main===module){
  const W=1080,H=1920;
  const {real,sb}=boot(W,H,`
    store.set('nw.coachDone', true);
    Game.init(); Game.startRun();
    for (let i=0;i<90;i++){ Game.update(1/60); }
    Game.render();
  `);
  fs.writeFileSync('/tmp/shot-portrait.png', real.toBuffer('image/png'));
  console.log('portrait', real.width, real.height, '| score', sb.Game.score);
}
