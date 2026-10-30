const checks=[];
const check=(value,label)=>{if(!value)throw new Error(label);checks.push(label);};
for(let n=0;n<300&&(!state.result||state.busy||!state.fleetMap?.geography);n++)await new Promise(r=>setTimeout(r,50));
const preview=state.fleetMap, geography=preview?.geography, plan=selectedPlan();
check(!!geography&&preview.getSnapshot().georeferenced,'The demo uses sourced geographic field boundaries');
check(preview.fields.size===40&&preview.markers.size===4,'The map retains all 40 fields and four sprayers');
check(!preview.allowTiles&&!preview.tilesStarted,'Automated geometry checks do not download street tiles');
const original=JSON.stringify({metadata:state.meta,plan,log:state.fleetStore.snapshot()});
for(const [id,item] of preview.fields){
  const source=geography.fields[id],rendered=item.polygon.getLatLngs()[0];
  const ring=source.boundary.slice();
  if(ring.length>3&&ring[0][0]===ring.at(-1)[0]&&ring[0][1]===ring.at(-1)[1])ring.pop();
  check(!!source.source_id&&rendered.length===ring.length&&rendered.every((p,i)=>Math.abs(p.lat-ring[i][0])<1e-10&&Math.abs(p.lng-ring[i][1])<1e-10),`${id} uses the sourced boundary without schematic projection`);
}
let samples=0;
for(const job of plan.schedule){
  for(const progress of [.01,.25,.5,.75,.99]){
    preview.setTime(job.start+(job.end-job.start)*progress);
    const rig=preview.getSnapshot().rigs.find(r=>r.id===job.rig_id);
    check(rig.status==='spraying'&&FieldworkFleetMap.insideBoundary([rig.lat,rig.lng],geography.fields[job.field_id].boundary),`${job.rig_id} sprays inside ${job.field_id} at ${progress}`);
    const point=preview.markers.get(job.rig_id).marker.getLatLng();
    if(Math.abs(point.lat-rig.lat)>1e-10||Math.abs(point.lng-rig.lng)>1e-10)throw new Error('Rendered marker differs from geographic replay');
    samples++;
  }
}
preview.setTime(state.meta.now||480);preview.resetView();
check(JSON.stringify({metadata:state.meta,plan,log:state.fleetStore.snapshot()})===original,'Geographic playback leaves the solver inputs and manual job log unchanged');
check(document.querySelector('.leaflet-control-attribution').textContent.includes('Field geometry'),'Field geometry attribution remains visible without online tiles');
check(!performance.getEntriesByType('resource').some(r=>r.name.includes('tile.openstreetmap.org')),'No automated street-tile requests were made');
return {passed:checks.length,samples,fields:preview.fields.size,center:preview.map.getCenter(),source:geography.source,offline:!!window.FIELDWORK_REPLAY};
