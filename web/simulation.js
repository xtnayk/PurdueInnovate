/* Fieldwork 3D: a deterministic visual replay of a selected, synthetic schedule.
 * Requires the locally bundled Three.js global. No sensors or external services.
 */
(function (global) {
  'use strict';
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const mix = (a, b, t) => a + (b - a) * t;
  const seed = (n) => {const a = Math.sin(n * 127.1 + 311.7) * 43758.5453123;return a - Math.floor(a);};
  const point = (field) => ({x:(field.x - 50) * 1.4, z:(field.y - 50) * 1.1});

  class Fieldwork3D {
    constructor(container, options = {}) {
      this.container = container;
      this.options = options;
      this.time = 480;
      this.speed = 40;
      this.playing = false;
      this.view = 'orbit';
      this.available = false;
      this.destroyed = false;
      this.followRig = null;
      this.fields = new Map();
      this.rigs = new Map();
      this.cameraState = {yaw:-0.56, elevation:0.90, distance:196, target:{x:-1,y:0,z:0}};
      this.baseColors = {sky:0xe2ebe3, storm:0xaebec1};
      container.classList.add('fw3d-root');
      if (!global.THREE) {this._fallback('The 3D viewer could not load. The 2D field map and planning tools are still available.');return;}
      this.T = global.THREE;
      try {this._init();} catch (error) {
        if (this.renderer) this.renderer.dispose();
        this._fallback('3D graphics are unavailable in this browser. Use the 2D map to explore the same plan.');
        this.error = error;
      }
    }

    _fallback(message) {
      this.available = false;
      const fallback = document.createElement('div');
      fallback.className = 'fw3d-fallback';
      fallback.textContent = message;
      this.container.replaceChildren(fallback);
    }

    _material(color, extra = {}) {
      // r128 does not automatically convert CSS/hex colors to the linear
      // working space. Convert once before sRGB output encoding.
      const material=new this.T.MeshLambertMaterial({color,...extra});
      material.color.convertSRGBToLinear();
      return material;
    }
    _mesh(geometry, material, parent=this.scene, position=null) {
      const mesh = new this.T.Mesh(geometry,material);
      mesh.castShadow=true;mesh.receiveShadow=true;
      if(position)mesh.position.set(...position);
      parent.add(mesh);return mesh;
    }
    _box(w,h,d,material,parent=this.scene,position=[0,0,0]) {return this._mesh(new this.T.BoxGeometry(w,h,d),material,parent,position);}

    _init() {
      const T=this.T;
      this.renderer=new T.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
      this.renderer.setPixelRatio(Math.min(global.devicePixelRatio||1,1.75));
      this.renderer.shadowMap.enabled=true;
      this.renderer.shadowMap.type=T.PCFSoftShadowMap;
      this.renderer.outputEncoding=T.sRGBEncoding;
      this.canvas=this.renderer.domElement;
      this.canvas.className='fw3d-canvas';
      this.canvas.tabIndex=0;
      this.canvas.setAttribute('aria-label','Interactive 3D replay of synthetic fields and sprayers. Drag to rotate, scroll to zoom. Arrow keys rotate; plus and minus zoom.');
      this.container.replaceChildren(this.canvas);
      this.scene=new T.Scene();this.scene.background=new T.Color(this.baseColors.sky);
      this.scene.fog=new T.Fog(this.baseColors.sky,260,440);
      this.camera=new T.PerspectiveCamera(39,1,0.3,650);
      this.scene.add(new T.HemisphereLight(0xf3f5eb,0x728166,0.60));
      this.sun=new T.DirectionalLight(0xfff4de,0.65);this.sun.position.set(-70,115,60);this.sun.castShadow=true;
      this.sun.shadow.mapSize.set(1024,1024);
      Object.assign(this.sun.shadow.camera,{left:-100,right:100,top:90,bottom:-90,near:20,far:250});
      this.sun.shadow.bias=-0.0007;
      this.scene.add(this.sun);
      this.dynamic=new T.Group();this.scene.add(this.dynamic);
      this._landscape();this._weather();this._events();
      this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(this.container);
      this.available=true;this.resize();this.renderFrame({time:this.time});
      this.previousFrame=performance.now();
      this._tick=this._tick.bind(this);this.animationFrame=requestAnimationFrame(this._tick);
    }

    _landscape() {
      const T=this.T;
      const soil=this._material(0x8e805f),grass=this._material(0xb3c096),road=this._material(0xd6cfb8);
      this._box(161,2.2,126,soil,this.scene,[0,-1.35,0]);
      this._box(161,0.28,126,grass,this.scene,[0,-0.13,0]);
      // Road lines are a schematic backdrop, not a road-routing calculation.
      [-47,-29,-11,7,25,46].forEach(z=>this._box(154,0.07,1.75,road,this.scene,[-2,0.04,z]));
      [-66,-35,-4,28,61].forEach(x=>this._box(1.6,0.07,116,road,this.scene,[x,0.04,0]));
      const river=(width,color,y)=>{
        const coords=[],idx=[];
        for(let i=0;i<=36;i++){const z=-63+i*3.5,x=73+Math.sin(z*.075)*3;coords.push(x-width/2,y,z,x+width/2,y,z);if(i<36){const n=i*2;idx.push(n,n+1,n+2,n+1,n+3,n+2);}}
        const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(coords,3));g.setIndex(idx);g.computeVertexNormals();
        this._mesh(g,this._material(color,{side:T.DoubleSide}));
      };
      river(5.4,0xb3c6b1,0.08);river(3.2,0x8fbcc1,0.11);
      this._yard();
      const trunks=new T.InstancedMesh(new T.CylinderGeometry(.25,.38,2.6,5),this._material(0x8a8262),42);
      const crowns=new T.InstancedMesh(new T.IcosahedronGeometry(1,0),this._material(0x738c58),84);
      const dummy=new T.Object3D();
      for(let i=0;i<42;i++) {
        const side=i%4;
        const x=side===0?-76:side===1?66:(seed(i+1)-.5)*139;
        const z=side===2?-57:side===3?57:(seed(i+5)-.5)*110;
        const h=2.5+seed(i+90)*2.7;
        dummy.position.set(x,1.3,z);dummy.scale.set(1,1,1);dummy.rotation.set(0,0,0);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);
        dummy.position.set(x,h,z);dummy.scale.set(1.7+seed(i)*.9,h*.7,1.8);dummy.rotation.y=seed(i+10)*4;dummy.updateMatrix();crowns.setMatrixAt(i*2,dummy.matrix);
        dummy.position.set(x+.5,h+1.2,z-.25);dummy.scale.multiplyScalar(.74);dummy.updateMatrix();crowns.setMatrixAt(i*2+1,dummy.matrix);
      }
      trunks.castShadow=true;crowns.castShadow=true;this.scene.add(trunks,crowns);this.treeCrowns=crowns;
    }

    _yard() {
      const T=this.T,wall=this._material(0xf0ebdc),roof=this._material(0x536659),steel=this._material(0xc7cfca),dark=this._material(0x46594d);
      this._box(13,.10,9,this._material(0xd7d1bd),this.scene,[-1,.07,4]);
      this._box(6,3.5,4.2,wall,this.scene,[-4,1.8,4.8]);
      const roofMesh=this._mesh(new T.CylinderGeometry(3.4,3.4,6.4,3,1),roof,this.scene,[-4,4.2,4.8]);roofMesh.rotation.z=Math.PI/2;roofMesh.rotation.y=Math.PI/2;
      this._box(1.7,2.2,.08,dark,this.scene,[-4,1.2,6.95]);
      this._box(1.05,.8,.1,this._material(0xa5c5c5),this.scene,[-5.8,2.2,6.95]);
      [1.2,4.3].forEach((x)=>{this._mesh(new T.CylinderGeometry(1.28,1.28,5.3,14),steel,this.scene,[x,2.72,5]);this._mesh(new T.ConeGeometry(1.36,1.4,14),roof,this.scene,[x,6.04,5]);for(let y=1;y<5;y+=1.2){const ring=this._mesh(new T.TorusGeometry(1.29,.035,3,14),dark,this.scene,[x,y,5]);ring.rotation.x=Math.PI/2;}});
      const sign=this._label('Co-op yard','#365145','#f5f6ec',8.2,1.7);sign.position.set(-1,7.5,5);this.scene.add(sign);
    }

    _label(text,color='#354e36',background='rgba(250,251,241,.9)',width=4,height=1.6) {
      const T=this.T,canvas=document.createElement('canvas');canvas.width=256;canvas.height=64;
      const ctx=canvas.getContext('2d');ctx.fillStyle=background;ctx.fillRect(0,0,256,64);ctx.fillStyle=color;ctx.font='600 33px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,128,34);
      const texture=new T.CanvasTexture(canvas);texture.encoding=T.sRGBEncoding;
      const material=new T.SpriteMaterial({map:texture,depthWrite:false,transparent:true});
      const sprite=new T.Sprite(material);sprite.scale.set(width,height,1);return sprite;
    }

    _rig(rig,index) {
      const T=this.T,group=new T.Group(),paint=this._material(rig.color||0x287b57),dark=this._material(0x344239),tire=this._material(0x2d342d),rim=this._material(0xc4ceba),glass=this._material(0x91b5b8),tank=this._material(0xeae7d8);
      this._box(2.9,.4,1.35,paint,group,[0,1.45,0]);
      this._box(.22,1.3,1.25,dark,group,[-.95,.85,0]);this._box(.22,1.3,1.25,dark,group,[.95,.85,0]);
      const tankBody=this._mesh(new T.CylinderGeometry(.65,.65,1.65,12),tank,group,[-.35,2.0,0]);tankBody.rotation.z=Math.PI/2;
      this._box(.95,1.12,1.15,glass,group,[1.1,2.18,0]);this._box(1.16,.15,1.35,paint,group,[1.1,2.82,0]);
      this._box(.15,.94,1.18,paint,group,[.6,2.22,0]);this._box(.95,.12,1.18,paint,group,[1.1,1.76,0]);
      const wheels=[];
      for(const x of[-1.0,1.0])for(const z of[-.98,.98]){const wheel=this._mesh(new T.CylinderGeometry(.75,.75,.37,12),tire,group,[x,.78,z]);wheel.rotation.x=Math.PI/2;wheels.push(wheel);const hub=this._mesh(new T.CylinderGeometry(.33,.33,.39,10),rim,group,[x,.78,z]);hub.rotation.x=Math.PI/2;}
      const boom=new T.Group();boom.position.set(-1.55,1.17,0);group.add(boom);
      this._box(.13,.14,7.5,paint,boom);this._box(.1,.1,7.5,dark,boom,[0,.5,0]);
      for(let i=-3;i<=3;i++){const diagonal=this._box(.06,.56,.06,paint,boom,[0,.25,i]);diagonal.rotation.x=i%2===0?.75:-.75;}
      const droplets=new Float32Array(60*3),geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(droplets,3));
      const spray=new T.Points(geometry,new T.PointsMaterial({color:0xc5edf0,size:.16,transparent:true,opacity:.75,depthWrite:false}));spray.position.set(-1.55,0,0);group.add(spray);spray.visible=false;
      const beacon=this._mesh(new T.SphereGeometry(.13,7,5),this._material(0xe7b55a),group,[1.1,3.03,0]);
      const label=this._label(rig.name||rig.id,rig.color||'#365145','rgba(253,254,248,.93)',4.3,1.05);label.position.set(0,4.1,0);group.add(label);
      group.scale.setScalar(1.3);
      group.userData={boom,spray,beacon,wheels,label,index,status:'idle',rig};this.dynamic.add(group);return group;
    }

    _weather() {
      const T=this.T;
      this.cloudGroup=new T.Group();this.scene.add(this.cloudGroup);
      this.cloudMaterial=this._material(0xdce4df,{transparent:true,opacity:.85,depthWrite:false});
      for(let i=0;i<23;i++) {const cloud=this._mesh(new T.IcosahedronGeometry(1,1),this.cloudMaterial,this.cloudGroup,[(seed(i+220)-.5)*134,25+seed(i+67)*9,(seed(i+77)-.5)*94]);cloud.scale.set(4+seed(i+33)*5,1.6+seed(i+1)*1.8,3+seed(i+8)*4);cloud.castShadow=false;}
      const array=new Float32Array(500*6);this.rainGeometry=new T.BufferGeometry();this.rainGeometry.setAttribute('position',new T.BufferAttribute(array,3));
      this.rain=new T.LineSegments(this.rainGeometry,new T.LineBasicMaterial({color:0x9bb8c1,transparent:true,opacity:.6,depthWrite:false}));this.scene.add(this.rain);
      this.windGroup=new T.Group();this.scene.add(this.windGroup);
      for(let i=0;i<7;i++) {const geometry=new T.BufferGeometry().setFromPoints([new T.Vector3(-4,0,0),new T.Vector3(-1,.3,0),new T.Vector3(2,0,0),new T.Vector3(6,0,0)]);const line=new T.Line(geometry,new T.LineBasicMaterial({color:0xf7faf4,transparent:true,opacity:.7}));line.position.set(-55+i*17,7+seed(i)*6,-32+seed(i+3)*58);this.windGroup.add(line);}
    }

    _clearDynamic() {
      const resources=new Set();
      this.dynamic.traverse(obj=>{if(obj.geometry)resources.add(obj.geometry);if(obj.material){const materials=Array.isArray(obj.material)?obj.material:[obj.material];materials.forEach(m=>{if(m.map)resources.add(m.map);resources.add(m);});}});
      while(this.dynamic.children.length)this.dynamic.remove(this.dynamic.children[0]);resources.forEach(r=>r.dispose());
      this.fields.clear();this.rigs.clear();
    }

    setData(metadata, plan, conditions={}) {
      this.metadata=metadata;this.plan=plan;this.conditions=conditions||{};
      const {start,end}=this._workday();this.time=clamp(Number.isFinite(this.time)?this.time:start,start,end);
      if(!this.available||!metadata)return;
      const T=this.T;this._clearDynamic();
      const scheduled=new Set((plan?.schedule||[]).map(job=>job.field_id)),wet=new Set(this.conditions.wet_fields||[]);
      const rows=[];
      for(const [index,field] of metadata.fields.entries()) {
        const p=point(field),w=9.3+(field.acres%6)*.12,d=10.2+(field.acres%5)*.22,isWet=wet.has(field.id)||field.wet;
        const color=isWet?0x729ba2:scheduled.has(field.id)?0x627b42:0x8d9b6c;
        const material=this._material(color),base=this._box(w,.22,d,material,this.dynamic,[p.x,.2,p.z]);base.userData.fieldId=field.id;
        const soil=this._box(w+.5,.12,d+.5,this._material(isWet?0xa7bfbd:0xb2b99a),this.dynamic,[p.x,.08,p.z]);soil.userData.fieldId=field.id;
        const progress=this._box(w,.035,1,this._material(0x90c9aa,{transparent:true,opacity:.64,depthWrite:false}),this.dynamic,[p.x,.55,p.z]);progress.visible=false;progress.castShadow=false;progress.userData.fieldId=field.id;
        const label=this._label(field.id,isWet?'#476c72':scheduled.has(field.id)?'#344e2e':'#647052','rgba(247,250,236,.8)',3.45,.88);label.position.set(p.x,1.2,p.z+d/2-.8);this.dynamic.add(label);
        if(field.priority){const marker=this._mesh(new T.ConeGeometry(.36,1.1,4),this._material(0xc49a43),this.dynamic,[p.x+w/2-.6,1.0,p.z-d/2+.5]);marker.rotation.z=Math.PI;}
        if(isWet){for(let j=0;j<3;j++){const puddle=this._mesh(new T.CircleGeometry(.8+seed(index+j)*1.2,14),this._material(0x8cb6c2,{transparent:true,opacity:.7,side:T.DoubleSide}),this.dynamic,[p.x+(seed(index+j+6)-.5)*6,.48,p.z+(seed(index+j+3)-.5)*7]);puddle.rotation.x=-Math.PI/2;puddle.castShadow=false;}}
        for(let j=0;j<Math.floor(d/.7);j++)rows.push({x:p.x,y:.39,z:p.z-d/2+.35+j*.7,w:w-.35,color:isWet?0x8babad:scheduled.has(field.id)?0x839f56:0xa5b37e});
        this.fields.set(field.id,{field,p,w,d,base,progress,label,isWet});
      }
      const cropRows=new T.InstancedMesh(new T.BoxGeometry(1,1,1),this._material(0xffffff),rows.length),dummy=new T.Object3D();
      rows.forEach((row,i)=>{dummy.position.set(row.x,row.y,row.z);dummy.scale.set(row.w,.15,.22);dummy.updateMatrix();cropRows.setMatrixAt(i,dummy.matrix);cropRows.setColorAt(i,new T.Color(row.color).convertSRGBToLinear());});cropRows.receiveShadow=true;this.dynamic.add(cropRows);
      metadata.rigs.forEach((rig,i)=>this.rigs.set(rig.id,this._rig(rig,i)));
      this._routes();this.renderFrame({time:this.time});
    }

    _routes() {
      if(!this.plan)return;
      const T=this.T;
      for(const rig of this.metadata.rigs){const jobs=this.plan.schedule.filter(j=>j.rig_id===rig.id).sort((a,b)=>a.start-b.start);if(!jobs.length)continue;
        const vertices=[new T.Vector3(0,.65,0),...jobs.map(j=>{const p=this.fields.get(j.field_id)?.p;return new T.Vector3(p?.x||0,.65,p?.z||0);}),new T.Vector3(0,.65,0)];
        const route=new T.Line(new T.BufferGeometry().setFromPoints(vertices),new T.LineDashedMaterial({color:rig.color,dashSize:1.1,gapSize:.8,transparent:true,opacity:.32,depthWrite:false}));route.computeLineDistances();this.dynamic.add(route);
      }
    }

    _sprayPoint(fieldId,progress) {
      const f=this.fields.get(fieldId);if(!f)return {x:0,z:0,heading:0};
      const q=clamp(progress,0,.999999)*4,lane=Math.floor(q),phase=q-lane;
      return {x:f.p.x+(lane%2===0?mix(-.40,.40,phase):mix(.40,-.40,phase))*f.w,z:f.p.z+(-.36+lane*.24)*f.d,heading:lane%2===0?0:Math.PI};
    }

    _workday() {
      const start=Number(this.metadata?.workday?.start),end=Number(this.metadata?.workday?.end);
      return Number.isFinite(start)&&Number.isFinite(end)&&start>=0&&end>start ? {start,end} : {start:480,end:1080};
    }

    _rigState(rigId,time) {
      const rig=this.rigs.get(rigId),index=rig?.userData.index||0;
      const parking={x:-1.8+index*1.4,z:-1.8,heading:0};
      const jobs=(this.plan?.schedule||[]).filter(j=>j.rig_id===rigId).sort((a,b)=>a.start-b.start);
      const start=this._workday().start;
      const available=Math.max(this.metadata?.now??start,this.conditions.rig_available_from?.[rigId]??start,start);
      if(time<available)return {...parking,status:'unavailable',fieldId:null};
      if(!jobs.length)return {...parking,status:'idle',fieldId:null};
      let origin={x:0,z:0,heading:0},previousEnd=available;
      for(const job of jobs){const target=this._sprayPoint(job.field_id,0),arrival=previousEnd+job.travel_minutes;
        if(time<arrival){const a=clamp((time-previousEnd)/Math.max(1,job.travel_minutes),0,1);return {x:mix(origin.x,target.x,a),z:mix(origin.z,target.z,a),heading:Math.atan2(target.z-origin.z,target.x-origin.x),status:'travel',fieldId:job.field_id};}
        if(time<job.start)return {...target,status:'waiting',fieldId:job.field_id};
        if(time<job.end)return {...this._sprayPoint(job.field_id,(time-job.start)/(job.end-job.start)),status:'spraying',fieldId:job.field_id};
        origin=this._sprayPoint(job.field_id,1);previousEnd=job.end;
      }
      const back=this.plan.return_trips?.find(r=>r.rig_id===rigId),returnMinutes=back?.minutes||0;
      if(returnMinutes&&time<previousEnd+returnMinutes){const a=clamp((time-previousEnd)/returnMinutes,0,1);return {x:mix(origin.x,0,a),z:mix(origin.z,0,a),heading:Math.atan2(-origin.z,-origin.x),status:'returning',fieldId:null};}
      return {...parking,status:'complete',fieldId:null};
    }

    _update(time) {
      if(!this.metadata)return;
      const jobs=this.plan?.schedule||[];
      for(const [id,f] of this.fields){const job=jobs.find(j=>j.field_id===id),progress=job?clamp((time-job.start)/(job.end-job.start),0,1):0;
        f.progress.visible=progress>0;f.progress.scale.z=Math.max(.001,f.d*progress);f.progress.position.z=f.p.z-f.d/2+f.d*progress/2;
        f.label.material.opacity=(job && time>=job.end) ? .75 : 1;
      }
      this.currentRigStates=[];
      for(const [id,rig] of this.rigs){const current=this._rigState(id,time);this.currentRigStates.push({id,...current});rig.position.set(current.x,.08,current.z);rig.rotation.y=-current.heading;
        const active=current.status==='spraying';rig.userData.status=current.status;rig.userData.boom.scale.z=active?1:.30;rig.userData.spray.visible=active;
        rig.userData.beacon.material.color.setHex(current.status==='unavailable'?0xe39a53:0xe7bd61).convertSRGBToLinear();
        if(active){const array=rig.userData.spray.geometry.attributes.position.array;for(let i=0;i<60;i++){array[i*3]=seed(i)*.22;array[i*3+1]=1.2-((time*.9+i*.071)%1)*1.12;array[i*3+2]=(seed(i+50)-.5)*7.1;}rig.userData.spray.geometry.attributes.position.needsUpdate=true;}
      }
      const rainTime=this.conditions.rain_time??1440,stormApproach=clamp((time-(rainTime-90))/110,0,1),raining=time>=rainTime;
      this.scene.background.setHex(this.baseColors.sky).lerp(new this.T.Color(this.baseColors.storm),stormApproach*.62);this.scene.fog.color.copy(this.scene.background);this.sun.intensity=.65-stormApproach*.26;
      this.cloudGroup.visible=stormApproach>.02;this.cloudGroup.position.x=(1-stormApproach)*-90;this.cloudMaterial.opacity=.35+stormApproach*.35;
      this.rain.visible=raining;
      const windInterval=(this.conditions.wind_intervals||[]).find(i=>time>=i.start&&time<i.end),wind=windInterval?.mph??this.conditions.wind_mph??8;
      this.currentWind=wind;this.raining=raining;
      this.windGroup.visible=wind>10;this.windGroup.position.x=((time*.7)%24)-12;
      if(raining){const array=this.rainGeometry.attributes.position.array;for(let i=0;i<500;i++){const x=(seed(i+300)-.5)*150,z=(seed(i+900)-.5)*115,y=1+((seed(i+200)*29-time*.8)%29+29)%29;array.set([x,y,z,x+wind*.035,y-2.4,z+.25],i*6);}this.rainGeometry.attributes.position.needsUpdate=true;}
    }

    _camera() {
      const c=this.cameraState;
      if(this.view==='follow'&&this.currentRigStates?.length){const r=this.currentRigStates.find(r=>r.id===this.followRig)||this.currentRigStates.find(r=>r.status==='spraying')||this.currentRigStates[0];this.camera.position.set(r.x-19,22,r.z+25);this.camera.lookAt(r.x,0,r.z);return;}
      if(this.view==='top'){this.camera.position.set(c.target.x,183,c.target.z+.01);this.camera.lookAt(c.target.x,0,c.target.z);return;}
      const p=Math.sin(c.elevation);this.camera.position.set(c.target.x+c.distance*p*Math.sin(c.yaw),c.distance*Math.cos(c.elevation),c.target.z+c.distance*p*Math.cos(c.yaw));this.camera.lookAt(c.target.x,c.target.y,c.target.z);
    }

    renderFrame({time=this.time,orbit}={}) {
      if(this.destroyed)return null;
      const {start,end}=this._workday(),requested=Number(time);
      this.time=clamp(Number.isFinite(requested)?requested:start,start,end);
      if(!this.available)return null;
      if(Number.isFinite(orbit)){this.cameraState.yaw=orbit;this.view='orbit';}
      this._update(this.time);this._camera();this.renderer.render(this.scene,this.camera);return this.canvas;
    }
    setTime(minutes) {this.renderFrame({time:minutes});this.options.onTimeChange?.(this.time,this.getSnapshot());return this;}
    setPlaying(value) {this.playing=Boolean(value)&&this.available;this.previousFrame=performance.now();return this;}
    setSpeed(multiplier) {this.speed=clamp(Number(multiplier)||40,1,240);return this;}
    setView(view) {if(['orbit','top','follow'].includes(view))this.view=view;this.renderFrame();return this;}
    setFollowRig(rigId) {this.followRig=rigId;this.setView('follow');return this;}
    resetView() {this.cameraState={yaw:-.56,elevation:.90,distance:196,target:{x:-1,y:0,z:0}};this.view='orbit';this.renderFrame();return this;}
    getSnapshot() {return {time:this.time,playing:this.playing,wind_mph:this.currentWind||0,raining:Boolean(this.raining),rigs:(this.currentRigStates||[]).map(r=>({...r})),completed:(this.plan?.schedule||[]).filter(j=>j.end<=this.time).length,scheduled:this.plan?.schedule?.length||0};}
    resize() {if(!this.renderer||this.destroyed)return;const width=this.container.clientWidth||800,height=this.container.clientHeight||440;if(width<2||height<2)return;this.renderer.setSize(width,height,false);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();if(this.available)this.renderFrame();}

    _tick(now) {
      if(this.destroyed)return;
      const dt=Math.min(.1,(now-this.previousFrame)/1000);this.previousFrame=now;
      if(this.playing&&this.container.offsetParent!==null&&!document.hidden){const {start,end}=this._workday();this.time=clamp(this.time+dt*this.speed,start,end);if(this.time>=end)this.playing=false;this.renderFrame();this.options.onTimeChange?.(this.time,this.getSnapshot());if(this.time>=end)this.options.onPlaybackEnd?.();}
      this.animationFrame=requestAnimationFrame(this._tick);
    }

    _events() {
      this.pointer=null;
      this.onPointerDown=e=>{this.pointer={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY};this.canvas.setPointerCapture(e.pointerId);};
      this.onPointerMove=e=>{if(!this.pointer||this.pointer.id!==e.pointerId)return;const dx=e.clientX-this.pointer.x,dy=e.clientY-this.pointer.y;this.cameraState.yaw-=dx*.007;this.cameraState.elevation=clamp(this.cameraState.elevation+dy*.004,.22,1.3);this.view='orbit';this.pointer.x=e.clientX;this.pointer.y=e.clientY;this.renderFrame();};
      this.onPointerUp=e=>{if(!this.pointer)return;const moved=Math.hypot(e.clientX-this.pointer.startX,e.clientY-this.pointer.startY);this.pointer=null;if(this.canvas.hasPointerCapture(e.pointerId))this.canvas.releasePointerCapture(e.pointerId);if(moved<6){const bounds=this.canvas.getBoundingClientRect(),mouse=new this.T.Vector2((e.clientX-bounds.left)/bounds.width*2-1,-(e.clientY-bounds.top)/bounds.height*2+1),ray=new this.T.Raycaster();ray.setFromCamera(mouse,this.camera);const hit=ray.intersectObjects([...this.fields.values()].map(f=>f.base))[0];if(hit)this.options.onFieldSelect?.(hit.object.userData.fieldId);}};
      this.onWheel=e=>{e.preventDefault();this.cameraState.distance=clamp(this.cameraState.distance*(1+e.deltaY*.001),75,270);this.view='orbit';this.renderFrame();};
      this.onKey=e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','0'].includes(e.key))return;e.preventDefault();if(e.key==='0'){this.resetView();return;}if(e.key==='ArrowLeft')this.cameraState.yaw-=.12;if(e.key==='ArrowRight')this.cameraState.yaw+=.12;if(e.key==='ArrowUp')this.cameraState.elevation=clamp(this.cameraState.elevation-.07,.22,1.3);if(e.key==='ArrowDown')this.cameraState.elevation=clamp(this.cameraState.elevation+.07,.22,1.3);if(e.key==='+'||e.key==='=')this.cameraState.distance=clamp(this.cameraState.distance-10,75,270);if(e.key==='-')this.cameraState.distance=clamp(this.cameraState.distance+10,75,270);this.view='orbit';this.renderFrame();};
      this.canvas.addEventListener('pointerdown',this.onPointerDown);this.canvas.addEventListener('pointermove',this.onPointerMove);this.canvas.addEventListener('pointerup',this.onPointerUp);this.canvas.addEventListener('pointercancel',this.onPointerUp);this.canvas.addEventListener('wheel',this.onWheel,{passive:false});this.canvas.addEventListener('keydown',this.onKey);
      this.canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.playing=false;this.options.onError?.('The 3D graphics context was interrupted. Refresh or use the 2D map.');});
    }

    destroy() {
      this.destroyed=true;this.playing=false;cancelAnimationFrame(this.animationFrame);this.resizeObserver?.disconnect();
      if(this.canvas){this.canvas.removeEventListener('pointerdown',this.onPointerDown);this.canvas.removeEventListener('pointermove',this.onPointerMove);this.canvas.removeEventListener('pointerup',this.onPointerUp);this.canvas.removeEventListener('pointercancel',this.onPointerUp);this.canvas.removeEventListener('wheel',this.onWheel);this.canvas.removeEventListener('keydown',this.onKey);}
      const resources=new Set();this.scene?.traverse(obj=>{if(obj.geometry)resources.add(obj.geometry);if(obj.material){(Array.isArray(obj.material)?obj.material:[obj.material]).forEach(m=>{if(m.map)resources.add(m.map);resources.add(m);});}});resources.forEach(r=>r.dispose());this.renderer?.dispose();this.canvas?.remove();
    }
  }
  global.Fieldwork3D=Fieldwork3D;
})(window);
