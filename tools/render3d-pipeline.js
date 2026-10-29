/* Full-pipeline check: boot the REAL game with an instrumented fake WebGL
   renderer, then inspect the scene the game actually submits each frame. */
const fs=require('fs'), path=require('path'), vm=require('vm');
const {createCanvas}=require('@napi-rs/canvas');
const R=path.join(__dirname,'..');
const VW=1280, VH=720;

const makeEl=(id)=>({ id, style:{}, textContent:'', innerHTML:'',
  classList:{_s:new Set(),add(c){this._s.add(c)},remove(c){this._s.delete(c)},
    toggle(c,f){if(f===undefined)f=!this._s.has(c); if(f)this._s.add(c); else this._s.delete(c); return f},
    contains(c){return this._s.has(c)}},
  addEventListener(){}, appendChild(){}, getAttribute:()=>null, setAttribute(){},
  getBoundingClientRect:()=>({left:0,top:0,width:VW,height:VH}) });

const els={};
const realCanvas=createCanvas(VW,VH);
const gameEl=Object.assign(makeEl('game'),{width:VW,height:VH,getContext:()=>realCanvas.getContext('2d')});
const glEl=Object.assign(makeEl('gl'),{width:VW,height:VH,getContext:(t)=> (t==='webgl2'||t==='webgl')?{}:null});
els['game']=gameEl; els['gl']=glEl;

const sb={ console, Math, JSON, Date, Object, Array, String, Number, Boolean, isNaN, parseInt, parseFloat,
  document:{ getElementById:(id)=>els[id]||(els[id]=makeEl(id)),
    createElement:(t)=> t==='canvas' ? Object.assign(createCanvas(1,1),{getContext:(tt)=> tt&&tt.indexOf('webgl')>=0 ? {} : createCanvas(1,1).getContext('2d')}) : makeEl('dyn'),
    addEventListener(){}, body:makeEl('body'),
    querySelectorAll:()=>[], querySelector:()=>makeEl('q') },
  localStorage:{_m:{},getItem(k){return this._m[k]===undefined?null:this._m[k]},setItem(k,v){this._m[k]=String(v)},removeItem(k){delete this._m[k]}},
  performance:{now:()=>Date.now()}, requestAnimationFrame:()=>0, cancelAnimationFrame(){},
  setTimeout, clearTimeout, setInterval:()=>0, clearInterval:()=>{},
  navigator:{userAgent:'node',maxTouchPoints:0}, innerWidth:VW, innerHeight:VH, devicePixelRatio:1,
  matchMedia:()=>({matches:false,addEventListener(){}}), addEventListener(){}, removeEventListener(){} };
sb.window=sb; sb.self=sb; sb.globalThis=sb;
vm.createContext(sb);
vm.runInContext(fs.readFileSync(R+'/vendor/three.min.js','utf8'), sb, {filename:'three.min.js'});
const THREE=sb.THREE;

/* instrumented renderer */
const calls={ renders:0, lastScene:null, lastCam:null };
class FakeRenderer {
  constructor(o){ this.domElement=(o&&o.canvas)||{}; this.shadowMap={enabled:false,type:0};
    this.info={render:{triangles:0,calls:0}};
    this.capabilities={getMaxAnisotropy:()=>4};
    this.toneMapping=0; this.toneMappingExposure=1; }
  setPixelRatio(){} setSize(){}
  getContext(){ return { isContextLost: () => false }; }
  render(scene,cam){ calls.renders++; calls.lastScene=scene; calls.lastCam=cam;

    /* Do exactly what three.js does before it counts a triangle: build the
       frustum from projectionMatrix * matrixWorldInverse, then cull. Without
       this the fake renderer happily "draws" geometry that the real one throws
       away, which is why a 0-triangle browser looked healthy in the harness. */
    /* three.js does this first in render(): */
    scene.updateMatrixWorld();
    cam.updateMatrixWorld();
    const pr = new THREE.Matrix4();
    pr.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const frustum = new THREE.Frustum();
    frustum.setFromProjectionMatrix(pr);

    let drawn = 0, culled = 0, skipped = 0;
    scene.traverse(o => {
      if (!o.isMesh) return;
      if (!o.visible) { skipped++; return; }
      if (o.frustumCulled === false || frustum.intersectsObject(o)) {
        drawn += (o.geometry && o.geometry.index) ? o.geometry.index.count / 3 : 1;
      } else { culled++; }
    });
    calls.culled = culled; calls.skipped = skipped;
    this.info.render.triangles = Math.round(drawn); }
}
THREE.WebGLRenderer = FakeRenderer;

['js/core.js','js/input.js','js/audio.js','js/fx.js','js/platform.js','js/achievements.js','js/render3d.js','js/game.js']
  .forEach(f=>vm.runInContext(fs.readFileSync(R+'/'+f,'utf8'), sb, {filename:f}));

vm.runInContext('Game.init()', sb);
vm.runInContext('wire3d()', sb);
const R3 = vm.runInContext('Render3D', sb);
console.log('active after wire3d :', R3.active());
console.log('#gl display         :', glEl.style.display);
console.log('#game background    :', JSON.stringify(gameEl.style.background));
console.log('body.has3d          :', sb.document.body.classList.contains('has3d'));

vm.runInContext('Game.startRun()', sb);
console.log('world group built   :', !!R3.world, R3.world ? R3.world.group.children.length+' arena meshes' : '');
for (let i=0;i<40;i++) vm.runInContext('Game.update(0.016); Game.render();', sb);

const sc=calls.lastScene, cam=calls.lastCam;
console.log('renders             :', calls.renders);
console.log('scene children      :', sc ? sc.children.length : 0);
console.log('camera pos          :', cam ? [cam.position.x.toFixed(0),cam.position.y.toFixed(0),cam.position.z.toFixed(0)].join(',') : 'none');
console.log('camera near/far     :', cam ? cam.near.toFixed(1)+'/'+cam.far.toFixed(0) : '');
let visibleCars=0, totalMeshes=0, visibleMeshes=0;
sc.traverse(o=>{ if(o.isMesh){ totalMeshes++; if(o.visible) visibleMeshes++; } if(o.isGroup && o.userData && o.children.length>=4) visibleCars++; });
console.log('meshes total/visible:', totalMeshes+'/'+visibleMeshes);
console.log('triangles submitted :', R3.renderer.info.render.triangles, '(culled:', calls.culled, 'hidden:', calls.skipped + ')');
console.log('projection NaN?     :', cam ? cam.projectionMatrix.elements.some(function(v){return !isFinite(v);}) : 'no cam');
console.log('camera matrixWorld  :', cam ? cam.matrixWorld.elements.map(function(v){return isFinite(v)?1:0;}).join('') : '');

/* project the player car through the camera */
const p = vm.runInContext('({x:Game.player.x,y:Game.player.y})', sb);
const v=new THREE.Vector3(p.x,8,p.y); v.project(cam);
console.log('player NDC          :', v.x.toFixed(3), v.y.toFixed(3), v.z.toFixed(3));
console.log('player on screen px :', ((v.x*.5+.5)*VW).toFixed(0), ((.5-v.y*.5)*VH).toFixed(0));
