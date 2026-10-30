/* Fieldwork map preview. Demo boundaries have geographic sources; jobs and moving sprayers are simulated, never GPS. */
(function (global) {
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const mix=(a,b,t)=>a+(b-a)*t;
  const ink=value=>/^#[0-9a-f]{6}$/i.test(String(value))?value:'#287b57';
  const labels={unavailable:'Unavailable',idle:'At the yard',travel:'Traveling',waiting:'Waiting for window',spraying:'Spraying',returning:'Returning to yard',complete:'Route finished'};
  const coordinate=value=>value!==null&&value!==undefined&&Number.isFinite(Number(value))?Number(value):50;
  const point=field=>({x:coordinate(field?.x),y:coordinate(field?.y)});
  const clock=value=>{const minutes=Math.round(Number(value)||0);return `${Math.floor(minutes/60)%12||12}:${String(minutes%60).padStart(2,'0')} ${minutes<720?'AM':'PM'}`;};
  const latLng=p=>Number.isFinite(p?.lat)&&Number.isFinite(p?.lng)?[p.lat,p.lng]:[40.42+(50-p.y)*.001,-86.89+(p.x-50)*.0014];
  const validCoordinate=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=90&&Math.abs(p[1])<=180;
  const geographicPasses=new WeakMap();
  function insideBoundary(point,boundary){
    let inside=false;
    for(let i=0,j=boundary.length-1;i<boundary.length;j=i++){
      const a=boundary[i],b=boundary[j];
      if((a[0]>point[0])!==(b[0]>point[0])&&point[1]<(b[1]-a[1])*(point[0]-a[0])/(b[0]-a[0])+a[1])inside=!inside;
    }
    return inside;
  }
  // An inset horizontal pass lies inside one continuous span of a simple polygon.
  // Recompute each pass from the actual boundary rather than a square around its centroid.
  function prepareGeographicPasses(ring){
    if(!Array.isArray(ring))return null;
    if(geographicPasses.has(ring))return geographicPasses.get(ring);
    if(ring.length<3||!ring.every(validCoordinate))return null;
    const low=Math.min(...ring.map(p=>p[0])),high=Math.max(...ring.map(p=>p[0])),origin=ring[0];
    let area=0;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++)area+=(ring[i][0]-origin[0])*(ring[j][1]-origin[1])-(ring[j][0]-origin[0])*(ring[i][1]-origin[1]);
    if(Math.abs(area)<1e-12){geographicPasses.set(ring,null);return null;}
    const passes=[];
    for(let lane=0;lane<6;lane++){
      const latitude=mix(low,high,(lane+1)/7),crossings=[];
      for(let i=0,j=ring.length-1;i<ring.length;j=i++){
        const a=ring[i],b=ring[j];
        if((a[0]>latitude)!==(b[0]>latitude))crossings.push(a[1]+(latitude-a[0])*(b[1]-a[1])/(b[0]-a[0]));
      }
      crossings.sort((a,b)=>a-b);
      let span=null;
      for(let i=0;i+1<crossings.length;i+=2){const candidate=[crossings[i],crossings[i+1]];if(!span||candidate[1]-candidate[0]>span[1]-span[0])span=candidate;}
      if(!span||span[1]<=span[0]||!insideBoundary([latitude,(span[0]+span[1])/2],ring)){geographicPasses.set(ring,null);return null;}
      passes.push({latitude,span});
    }
    geographicPasses.set(ring,passes);return passes;
  }
  function geographicSprayPoint(field,progress){
    const passes=prepareGeographicPasses(field.boundary);
    if(!passes)throw new Error('Field boundary cannot support a geographic spray preview.');
    const q=clamp(progress,0,.999999)*6,lane=Math.floor(q),phase=q-lane,{latitude,span}=passes[lane];
    return {lat:latitude,lng:mix(span[0],span[1],.06+.88*(lane%2?1-phase:phase))};
  }
  function geographyFor(metadata,source=global.FIELDWORK_DEMO_GEOGRAPHY){
    if(!metadata||metadata.input_source==='farmer_profile'||!source||!validCoordinate(source.depot)||!metadata.fields?.length)return null;
    for(const field of metadata.fields){const geo=source.fields?.[field.id];if(!geo||!validCoordinate(geo.center)||!Array.isArray(geo.boundary)||geo.boundary.length<3||!geo.boundary.every(validCoordinate))return null;
      if(!prepareGeographicPasses(geo.boundary))return null;
    }
    return source;
  }
  function geographicRigState(metadata,plan,conditions,rigId,time,geography){
    if(!geography)return null;
    const yard={lat:geography.depot[0],lng:geography.depot[1]},start=workday(metadata).start;
    const available=Math.max(start,metadata?.now??start,conditions?.rig_available_from?.[rigId]??start);
    const jobs=(plan?.schedule||[]).filter(j=>j.rig_id===rigId).slice().sort((a,b)=>a.start-b.start);
    if(time<available||!jobs.length)return yard;
    let origin=yard,previousEnd=available;
    for(const job of jobs){
      const field=geography.fields[job.field_id],target=geographicSprayPoint(field,0),travel=Number(job.travel_minutes)||0;
      if(time<previousEnd+travel){const t=clamp((time-previousEnd)/Math.max(1,travel),0,1);return {lat:mix(origin.lat,target.lat,t),lng:mix(origin.lng,target.lng,t)};}
      if(time<job.start)return target;
      if(time<job.end)return geographicSprayPoint(field,(time-job.start)/(job.end-job.start));
      origin=geographicSprayPoint(field,1);previousEnd=job.end;
    }
    const minutes=Number(plan?.return_trips?.find(r=>r.rig_id===rigId)?.minutes)||0;
    if(minutes&&time<previousEnd+minutes){const t=clamp((time-previousEnd)/minutes,0,1);return {lat:mix(origin.lat,yard.lat,t),lng:mix(origin.lng,yard.lng,t)};}
    return yard;
  }
  const workday=meta=>{const a=Number(meta?.workday?.start),b=Number(meta?.workday?.end);return Number.isFinite(a)&&Number.isFinite(b)&&b>a?{start:a,end:b}:{start:480,end:1080};};
  const fieldHalf=field=>clamp(Math.sqrt(Number(field?.acres)||40)*.28,1.2,3.5);
  function sprayPoint(field,progress){
    const p=point(field),half=fieldHalf(field),q=clamp(progress,0,.999999)*4,lane=Math.floor(q),phase=q-lane;
    return {x:p.x+(lane%2===0?mix(-.8,.8,phase):mix(.8,-.8,phase))*half,y:p.y+(-.72+lane*.48)*half};
  }
  function rigState(metadata,plan,conditions,rigId,time){
    const index=Math.max(0,(metadata?.rigs||[]).findIndex(r=>r.id===rigId)),parking={x:49.3+index*.5,y:50.5};
    const start=workday(metadata).start,available=Math.max(start,metadata?.now??start,conditions?.rig_available_from?.[rigId]??start);
    const jobs=(plan?.schedule||[]).filter(j=>j.rig_id===rigId).slice().sort((a,b)=>a.start-b.start);
    if(time<available)return {...parking,status:'unavailable',fieldId:null};
    if(!jobs.length)return {...parking,status:'idle',fieldId:null};
    let origin={x:50,y:50},previousEnd=available;
    for(const job of jobs){
      const field=metadata.fields.find(f=>f.id===job.field_id),target=sprayPoint(field,0),travel=Number(job.travel_minutes)||0;
      if(time<previousEnd+travel){const t=clamp((time-previousEnd)/Math.max(1,travel),0,1);return {x:mix(origin.x,target.x,t),y:mix(origin.y,target.y,t),status:'travel',fieldId:job.field_id};}
      if(time<job.start)return {...target,status:'waiting',fieldId:job.field_id};
      if(time<job.end)return {...sprayPoint(field,(time-job.start)/(job.end-job.start)),status:'spraying',fieldId:job.field_id};
      origin=sprayPoint(field,1);previousEnd=job.end;
    }
    const back=plan?.return_trips?.find(r=>r.rig_id===rigId),minutes=Number(back?.minutes)||0;
    if(minutes&&time<previousEnd+minutes){const t=clamp((time-previousEnd)/minutes,0,1);return {x:mix(origin.x,50,t),y:mix(origin.y,50,t),status:'returning',fieldId:null};}
    return {...parking,status:'complete',fieldId:null};
  }
  class FieldworkFleetMap {
    constructor(container,options={}){
      this.container=container;this.options=options;this.L=global.L;this.time=480;this.speed=15;this.playing=false;this.destroyed=false;this.metadata=null;this.geography=null;this.plan=null;this.conditions={};this.markers=new Map();this.fields=new Map();this.followRig=null;this.pendingFit=false;this.tilesStarted=false;this.tileFailures=0;this.lastTick=performance.now();
      container.classList.add('fieldwork-fleet-map');
      container.innerHTML='<div class="fleet-map-canvas" aria-label="Interactive map of illustrative fields and simulated sprayer positions"></div><div class="fleet-map-label"><strong>Fleet map</strong><span>Illustrative locations · Simulated positions</span></div><div class="fleet-map-tools"><label><span class="sr-only">Follow a sprayer on the map</span><select aria-label="Follow a sprayer on the map"><option value="">All sprayers</option></select></label><button type="button" aria-label="Fit all fields on the map">Fit fields</button></div><div class="fleet-map-status" role="status"></div><div class="fleet-map-legend"><span><i class="map-legend-working"></i>Spraying</span><span><i class="map-legend-finished"></i>Replayed</span><span><i class="map-legend-wet"></i>Unavailable field</span></div>';
      this.statusNode=container.querySelector('.fleet-map-status');this.canvas=container.querySelector('.fleet-map-canvas');
      if(!this.L){this.statusNode.textContent='The map could not load. The 3D and field layout views remain available.';return;}
      const L=this.L;
      this.map=L.map(this.canvas,{zoomControl:false,attributionControl:true,minZoom:10,maxZoom:17,zoomSnap:.25,zoomDelta:.5,scrollWheelZoom:false,preferCanvas:false}).setView(latLng({x:50,y:50}),12);
      this.map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
      L.control.zoom({position:'bottomright'}).addTo(this.map);
      this.map.doubleClickZoom.enable();
      const Schematic=L.GridLayer.extend({createTile(coords){const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d');ctx.fillStyle=(coords.x+coords.y)%2?'#e8eee2':'#edf1e8';ctx.fillRect(0,0,256,256);ctx.strokeStyle='#d3dfcd';ctx.lineWidth=1;for(let n=0;n<=256;n+=64){ctx.beginPath();ctx.moveTo(n,0);ctx.lineTo(n,256);ctx.moveTo(0,n);ctx.lineTo(256,n);ctx.stroke();}ctx.strokeStyle='#fff';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(0,128);ctx.lineTo(256,128);ctx.moveTo(128,0);ctx.lineTo(128,256);ctx.stroke();return canvas;}});
      this.schematic=new Schematic({tileSize:256,updateWhenIdle:true,keepBuffer:0}).addTo(this.map);
      this.shapeLayer=L.layerGroup().addTo(this.map);this.routeLayer=L.layerGroup().addTo(this.map);this.rigLayer=L.layerGroup().addTo(this.map);
      this.offline=!!global.FIELDWORK_REPLAY||global.location?.protocol==='file:';
      const query=global.location?new URLSearchParams(global.location.search):new URLSearchParams();
      this.tilesEnabled=!this.offline&&options.tiles!==false&&global.FIELDWORK_MAP_TILES!==false&&query.get('mapTiles')!=='off';
      // No external map request until a complete, georeferenced field set is supplied.
      this.allowTiles=false;
      this.statusNode.textContent='Loading field locations…';
      container.querySelector('.fleet-map-tools select').addEventListener('change',e=>this.setFollowRig(e.target.value||null));
      container.querySelector('.fleet-map-tools button').addEventListener('click',()=>this.resetView());
      this.map.on('dragstart',()=>{this.followRig=null;container.querySelector('.fleet-map-tools select').value='';});
      this._tick=this._tick.bind(this);this.frame=requestAnimationFrame(this._tick);
      this.observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(()=>this.resize()):null;this.observer?.observe(container);
    }
    _startTiles(){
      if(!this.geography||!this.allowTiles||this.tilesStarted||!this.map||!this._visible())return;
      this.tilesStarted=true;
      // Standard browser requests respect the provider's cache and Referer policies. No prefetch or offline capture.
      this.tiles=this.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:17,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>',updateWhenIdle:true,updateWhenZooming:false,keepBuffer:0});
      this.tiles.on('tileload',()=>{if(this.geography&&this.allowTiles&&!this.tileFailures)this.statusNode.textContent='Mapped farmland · Simulated activity and route links, not road navigation';});
      this.tiles.on('tileerror',()=>{this.tileFailures++;this.statusNode.textContent='Some street tiles are unavailable. Field and fleet previews still work.';});
      this.tiles.addTo(this.map);this.statusNode.textContent='Loading street map…';
    }
    _visible(){return this.container.offsetParent!==null&&this.container.clientWidth>0&&this.container.clientHeight>0;}
    _setGeography(metadata){
      this.geography=geographyFor(metadata);
      this.allowTiles=!!this.geography&&!!this.tilesEnabled;
      if(!this.allowTiles&&this.tiles){this.map.removeLayer(this.tiles);this.tiles=null;this.tilesStarted=false;this.tileFailures=0;}
      const sourceLabel=esc(this.geography?.attribution||this.geography?.source||'Public geographic data');
      const sourceUrl=/^https:\/\//.test(this.geography?.source_url||'')?this.geography.source_url:null;
      const attribution=this.geography?`Field geometry: ${sourceUrl?`<a href="${esc(sourceUrl)}" target="_blank" rel="noopener">${sourceLabel}</a>`:sourceLabel}`:null;
      if(attribution!==this.geometryAttribution){
        if(this.geometryAttribution)this.map.attributionControl.removeAttribution(this.geometryAttribution);
        if(attribution)this.map.attributionControl.addAttribution(attribution);
        this.geometryAttribution=attribution;
      }
      const label=this.container.querySelector('.fleet-map-label span');
      label.textContent=this.geography?'Mapped farmland · Simulated positions':'Schematic fields · Locations not supplied';
      this.canvas.setAttribute('aria-label',this.geography?'Map of sourced farmland boundaries and simulated sprayer positions':'Schematic field layout; real field coordinates have not been supplied');
      this.statusNode.textContent=!this.geography?'No field coordinates supplied · Schematic layout only':this.offline?'Mapped farmland · Offline background; no street tiles downloaded':this.allowTiles?(this.tilesStarted?'Mapped farmland · Simulated activity and route links, not road navigation':'Street map loads when this view is open.'):'Mapped farmland · Street tiles disabled';
    }
    setData(metadata,plan,conditions={}){
      this.metadata=metadata;this.plan=plan;this.conditions=conditions||{};this.playing=false;this.followRig=null;this.pendingFit=true;
      const {start,end}=workday(metadata);this.time=clamp(this.time,start,end);
      if(!this.map||!metadata)return this;
      this._setGeography(metadata);
      const L=this.L;this.shapeLayer.clearLayers();this.routeLayer.clearLayers();this.rigLayer.clearLayers();this.fields.clear();this.markers.clear();
      const scheduled=new Map((plan?.schedule||[]).map(j=>[j.field_id,j]));
      for(const field of metadata.fields){const p=point(field),h=fieldHalf(field),corners=[{x:p.x-h,y:p.y-h},{x:p.x+h,y:p.y-h},{x:p.x+h,y:p.y+h},{x:p.x-h,y:p.y+h}].map(latLng);
        const geographicField=this.geography?.fields[field.id];
        const polygon=L.polygon(geographicField?.boundary||corners,{color:'#6f9062',weight:1.6,fillColor:'#b3cc98',fillOpacity:.55}).addTo(this.shapeLayer);
        polygon.bindTooltip(esc(field.id),{permanent:true,direction:'center',className:'fleet-map-field-label'});
        const job=scheduled.get(field.id),route=job?(plan?.schedule||[]).filter(j=>j.rig_id===job.rig_id).slice().sort((a,b)=>a.start-b.start):[];
        const jobDetail=job?`${esc(job.rig_id)} · Stop ${route.findIndex(j=>j.field_id===field.id)+1}<br>${clock(job.start)}–${clock(job.end)}`:'Not in the selected plan';
        const geometryDetail=geographicField?`Approximate mapped farmland boundary${geographicField.source_id?' · '+esc(geographicField.source_id):''}`:'Schematic boundary · Location not supplied';
        const acreageDetail=metadata.input_source==='farmer_profile'?'reported acres':'planning acres · Demo assumption';
        polygon.bindPopup(`<div class="fleet-map-popup"><strong>${esc(field.name)}</strong><p>${esc(field.acres)} ${acreageDetail}</p><p>${jobDetail}</p><small>${geometryDetail}</small></div>`);
        polygon.on('click',()=>this.options.onFieldSelect?.(field.id));this.fields.set(field.id,{field,polygon,job});
      }
      for(const rig of metadata.rigs){const jobs=(plan?.schedule||[]).filter(j=>j.rig_id===rig.id).slice().sort((a,b)=>a.start-b.start);
        const yard=this.geography?.depot||latLng({x:50,y:50});
        if(jobs.length)L.polyline([yard,...jobs.map(j=>this.geography?latLng(geographicSprayPoint(this.geography.fields[j.field_id],0)):latLng(point(metadata.fields.find(f=>f.id===j.field_id)))),yard],{color:ink(rig.color),weight:3,opacity:.64,dashArray:'7 8',interactive:false}).addTo(this.routeLayer);
        const icon=L.divIcon({className:'fleet-map-rig',html:`<span style="--rig-color:${ink(rig.color)}"><svg viewBox="0 0 40 30" aria-hidden="true"><path d="M10 21V7h15v14M25 13h6l6 8H25M1 13h9M3 10v10M33 11h6M37 10v10"/><circle cx="14" cy="23" r="4"/><circle cx="30" cy="23" r="4"/></svg><b>${esc(rig.id)}</b><i></i></span>`,iconSize:[50,48],iconAnchor:[25,24]});
        const marker=L.marker(yard,{icon,keyboard:true,title:`${rig.name}: simulated sprayer`,zIndexOffset:200}).addTo(this.rigLayer);
        marker.bindPopup('');this.markers.set(rig.id,{rig,marker});
      }
      L.marker(this.geography?.depot||latLng({x:50,y:50}),{icon:L.divIcon({className:'fleet-map-yard',html:'<span aria-label="Illustrative co-op yard">⌂</span>',iconSize:[28,28],iconAnchor:[14,14]}),interactive:false}).addTo(this.shapeLayer);
      const select=this.container.querySelector('.fleet-map-tools select');select.innerHTML='<option value="">All sprayers</option>'+metadata.rigs.map(r=>`<option value="${esc(r.id)}">Follow ${esc(r.name)}</option>`).join('');
      this.setTime(this.time);this.resize();return this;
    }
    setTime(value){
      const {start,end}=workday(this.metadata);this.time=clamp(Number.isFinite(Number(value))?Number(value):start,start,end);
      if(this.map&&this.metadata){
        const wet=new Set(this.conditions.wet_fields||[]);
        for(const [id,item] of this.fields){const done=item.job&&this.time>=item.job.end,active=item.job&&this.time>=item.job.start&&this.time<item.job.end;
          item.polygon.setStyle({fillColor:wet.has(id)?'#91c2d1':done?'#678f76':active?'#78bb58':item.job?'#b3cc98':'#dddcca',fillOpacity:active?0.78:0.52,color:active?'#3e853b':wet.has(id)?'#4b8b9a':'#759065'});
        }
        this.states=[];
        for(const {rig,marker} of this.markers.values()){const current={...rigState(this.metadata,this.plan,this.conditions,rig.id,this.time),...geographicRigState(this.metadata,this.plan,this.conditions,rig.id,this.time,this.geography)};this.states.push({id:rig.id,...current});marker.setLatLng(latLng(current));const node=marker.getElement();if(node){node.dataset.status=current.status;const nearYard=this.geography?['unavailable','idle','complete'].includes(current.status):Math.hypot(current.x-50,current.y-50)<3,index=this.metadata.rigs.findIndex(r=>r.id===rig.id);node.style.setProperty('--park-x',nearYard?`${(index%2?1:-1)*29}px`:'0px');node.style.setProperty('--park-y',nearYard?`${(index<2?-1:1)*27}px`:'0px');node.setAttribute('aria-label',`${rig.name}: ${labels[current.status]}${current.fieldId?' at '+current.fieldId:''}. Simulated position.`);}
          marker.setPopupContent(`<div class="fleet-map-popup"><strong>${esc(rig.name)}</strong><p>${esc(labels[current.status])}${current.fieldId?' · '+esc(this.metadata.fields.find(f=>f.id===current.fieldId)?.name||current.fieldId):''}</p><small>${esc(rig.crew_name||'')} · Simulated position</small></div>`);
          if(this.followRig===rig.id&&this._visible())this.map.panTo(latLng(current),{animate:false});
        }
      }
      this.options.onTimeChange?.(this.time,this.getSnapshot());return this;
    }
    setPlaying(value){this.playing=!!value&&!!this.map;this.lastTick=performance.now();return this;}
    setSpeed(value){this.speed=clamp(Number(value)||15,1,240);return this;}
    setFollowRig(id){this.followRig=this.markers.has(id)?id:null;this.container.querySelector('.fleet-map-tools select').value=this.followRig||'';this.setTime(this.time);return this;}
    resetView(){this.followRig=null;this.container.querySelector('.fleet-map-tools select').value='';this.map?.closePopup();this.pendingFit=true;this.resize();return this;}
    getSnapshot(){return {time:this.time,playing:this.playing,rigs:(this.states||[]).map(r=>({...r})),completed:(this.plan?.schedule||[]).filter(j=>j.end<=this.time).length,scheduled:this.plan?.schedule?.length||0,illustrative:true,georeferenced:!!this.geography};}
    resize(){if(!this.map||this.destroyed||!this._visible())return;this.map.invalidateSize({pan:false});if(this.pendingFit&&this.metadata){const coords=this.geography?this.metadata.fields.flatMap(f=>this.geography.fields[f.id].boundary):this.metadata.fields.map(f=>latLng(point(f)));coords.push(this.geography?.depot||latLng({x:50,y:50}));this.map.fitBounds(this.L.latLngBounds(coords).pad(.03),{paddingTopLeft:[20,62],paddingBottomRight:[20,62],maxZoom:16,animate:false});this.pendingFit=false;}this._startTiles();}
    _tick(now){if(this.destroyed)return;const dt=Math.min(.1,(now-this.lastTick)/1000);this.lastTick=now;if(this.playing&&this._visible()&&!document.hidden){const {end}=workday(this.metadata);const next=Math.min(end,this.time+dt*this.speed);if(next>=end)this.playing=false;this.setTime(next);}this.frame=requestAnimationFrame(this._tick);}
    destroy(){this.destroyed=true;this.playing=false;cancelAnimationFrame(this.frame);this.observer?.disconnect();this.map?.remove();this.container.replaceChildren();}
  }
  FieldworkFleetMap.rigState=rigState;FieldworkFleetMap.latLng=latLng;
  FieldworkFleetMap.geographyFor=geographyFor;FieldworkFleetMap.geographicRigState=geographicRigState;FieldworkFleetMap.geographicSprayPoint=geographicSprayPoint;FieldworkFleetMap.insideBoundary=insideBoundary;
  global.FieldworkFleetMap=FieldworkFleetMap;
  if(typeof module!=='undefined'&&module.exports)module.exports=FieldworkFleetMap;
})(typeof window!=='undefined'?window:globalThis);
