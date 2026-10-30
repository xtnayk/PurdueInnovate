/* Fieldwork: local prototype interface. All data and approvals are simulated. */
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const state = {meta:null, result:null, selected:null, scenario:'baseline', priority:'balanced', dirty:false, busy:false, receipt:null, confirmedText:'', parsedText:'', view:'board', sequence:0, revision:0, parseSequence:0, sim:null, simPlan:null, mapMode:'3d', fleetStore:null, fleetDashboard:null, disruptionsDashboard:null, disruptionPhase:'idle', disruptionRun:null, disruptionError:'', lastPlanError:'',incidentStore:null,selectedIncidentId:null,responseIncidentId:null,approvalIncidentId:null};
Object.assign(state,{demoMeta:null,activeProfile:null,onboarding:null,profileBusy:false,profileError:'',feedbackPanel:null,planAgent:null,fleetMap:null,previewTime:480,mapMode:'map',
  feedback:{draft:'',review:null,reviewRun:null,reviewPlan:null,history:[],constraints:{excluded_fields:[],priority_fields:[],unavailable_rigs:[]},error:''}});
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = (value) => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value || 0);
const preciseMoney = (value) => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value || 0);
const number = (value) => new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(value || 0);
function clock(minutes, compact=false) {
  if (minutes == null) return '—';
  const h = Math.floor(minutes/60) % 24, m = Math.floor(minutes % 60);
  return `${h%12||12}${m || !compact ? ':'+String(m).padStart(2,'0') : ''}${compact ? '' : ' '}${h<12?'am':'pm'}`;
}
function duration(minutes) {if (minutes == null) return '—';return minutes >= 60 ? `${Math.floor(minutes/60)}h ${Math.round(minutes%60)}m` : `${Math.round(minutes)} min`;}
function selectedPlan() {return state.result?.plans.find((p)=>p.id===state.selected) || null;}
function fieldById(id) {return state.meta?.fields.find((f)=>f.id===id);}
function readSavedProfile() {
  try {const raw=localStorage.getItem('fieldwork:active-profile:v1');return raw?JSON.parse(raw):null;}
  catch(_error){state.profileError='The saved farm selection could not be read. The example farm is still available.';return null;}
}
function persistProfile(profile) {
  try {if(profile)localStorage.setItem('fieldwork:active-profile:v1',JSON.stringify(profile));else localStorage.removeItem('fieldwork:active-profile:v1');}
  catch(_error){state.profileError='This browser could not save the active farm. Export the profile to keep a copy.';}
}
function renderOnboarding() {
  state.onboarding?.render({offline:!!window.FIELDWORK_REPLAY,busy:state.busy||state.profileBusy,
    activeProfileId:state.activeProfile?.id||null,activeProfile:state.activeProfile,error:state.profileError});
  const banner=$('#farm-context-banner');if(!banner)return;
  banner.hidden=['farm','disruptions'].includes(state.view);banner.classList.toggle('is-custom',!!state.activeProfile);banner.classList.toggle('is-warning',!!state.profileError);
  $('#farm-context-name').textContent=state.activeProfile?.farm_name||'Explore the example farm';
  $('#farm-context-detail').textContent=state.profileError||(state.activeProfile?'Using your reviewed fields, fleet, crew and work hours. Map and weather remain illustrative.':'Tell the farm assistant about your fields, equipment, and crew.');
  $('#open-farm-chat').textContent=state.activeProfile?'Edit farm profile':'Set up my farm';
}
function feedbackKey(){return `fieldwork:feedback:v1:${state.meta?.profile_id||'demo'}:${state.meta?.date||'day'}`;}
function persistFeedback() {
  try {localStorage.setItem(feedbackKey(),JSON.stringify({history:state.feedback.history.slice(-50),constraints:state.feedback.constraints}));}
  catch(_error){state.feedback.error='Feedback remains in this tab, but could not be saved by this browser.';}
}
function loadFeedback() {
  state.feedback={draft:'',review:null,reviewRun:null,reviewPlan:null,history:[],constraints:{excluded_fields:[],priority_fields:[],unavailable_rigs:[]},error:''};
  try {
    const saved=JSON.parse(localStorage.getItem(feedbackKey())||'null');
    if(!saved)return;
    if(!Array.isArray(saved.history)||!saved.constraints)throw new Error('Invalid feedback');
    const fields=new Set(state.meta.fields.map(f=>f.id)),rigs=new Set(state.meta.rigs.map(r=>r.id));
    for(const key of ['excluded_fields','priority_fields','unavailable_rigs']) {
      const ids=saved.constraints[key];if(!Array.isArray(ids)||ids.some(id=>!(key==='unavailable_rigs'?rigs:fields).has(id)))throw new Error('Invalid feedback constraints');
    }
    state.feedback.constraints=saved.constraints;
    state.feedback.history=saved.history.filter(m=>['user','assistant'].includes(m.role)&&typeof m.text==='string').slice(-50);
  }catch(_error){state.feedback.error='Saved feedback could not be restored. Review new instructions before using them.';}
}
function feedbackMessage(role,text,status='recorded') {
  state.feedback.history.push({role,text,timestamp:new Date().toISOString(),status});persistFeedback();
}
function renderFeedback() {
  placeFeedback();
  state.feedbackPanel?.render({meta:state.meta,result:state.result,plan:selectedPlan(),phase:state.disruptionPhase,
    busy:state.busy,draft:state.feedback.draft,review:state.feedback.review,history:state.feedback.history,
    activeConstraints:state.feedback.constraints,offline:!!window.FIELDWORK_REPLAY,error:state.feedback.error});
  $('#plan-feedback-empty').hidden=!$('#proposal-feedback-content').hidden;
}
function placeFeedback() {
  const panel=$('#proposal-feedback-content');
  const slot=state.view==='disruptions'?$('#disruption-feedback-slot'):state.view==='board'?$('#plan-feedback-slot'):null;
  if(panel&&slot&&panel.parentElement!==slot)slot.append(panel);
}
function openFeedback() {
  if(state.view!=='board'&&state.view!=='disruptions')showView('board');
  if(state.view==='board')$('#plan-feedback-details').open=true;
  renderFeedback();
  const input=$('[data-feedback-draft]');
  const target=input&&!input.disabled?input:$('#proposal-feedback-content');
  target?.scrollIntoView({block:'center',behavior:'instant'});
  if(target===input)input.focus({preventScroll:true});
}
function renderPlanAgent() {
  const snapshot=state.fleetStore?.snapshot();
  state.planAgent?.render({meta:state.meta,result:state.result,plan:selectedPlan(),proposal:buildActionProposal(),
    busy:state.busy,dirty:state.dirty,approved:!!state.receipt&&state.receipt.plan_id===state.selected,
    underway:Object.values(snapshot?.records||{}).some(r=>r.status==='in_progress'),
    offline:!!window.FIELDWORK_REPLAY,error:state.lastPlanError});
}
function reviewFeedback(text) {
  if(state.busy||!selectedPlan())return;
  state.feedback.draft=text;state.feedback.error='';
  const review=window.FieldworkFeedback.parse(text,state.meta);
  const held=new Set([...(state.feedback.constraints.excluded_fields||[]),...(state.meta.fields||[]).filter(f=>f.excluded).map(f=>f.id)]);
  const priorities=new Set(state.feedback.constraints.priority_fields||[]);
  if((review.constraints?.priority_fields||[]).some(id=>held.has(id))||(review.constraints?.excluded_fields||[]).some(id=>priorities.has(id))){review.supported=false;review.summary='This conflicts with an existing hold or priority. Clear previous feedback first, or edit a hold in your farm profile, then review the change again.';}
  const constrained=Object.values(review.constraints||{}).some(ids=>ids.length);
  if(window.FIELDWORK_REPLAY&&constrained){review.supported=false;review.summary='This change needs the local solver. The offline edition can rerank recorded plans, but cannot apply new field or rig restrictions.';}
  state.feedback.review=review;state.feedback.reviewRun=state.result.run_id;state.feedback.reviewPlan=state.selected;
  feedbackMessage('user',text);
  feedbackMessage('assistant',review.summary+(review.warnings?.length?' '+review.warnings.join(' '):''),review.supported?'awaiting_confirmation':'needs_clarification');
  renderFeedback();
}
async function applyFeedback(review) {
  if(state.busy||!review?.supported)return;
  if(review!==state.feedback.review||state.feedback.reviewRun!==state.result?.run_id||state.feedback.reviewPlan!==state.selected){state.feedback.error='The plan changed. Review this feedback again against the current proposal.';renderFeedback();return;}
  if(window.FIELDWORK_REPLAY&&Object.values(review.constraints||{}).some(ids=>ids.length)){state.feedback.error='Custom restrictions require the local solver edition.';renderFeedback();return;}
  for(const key of ['excluded_fields','priority_fields','unavailable_rigs'])state.feedback.constraints[key]=[...new Set([...state.feedback.constraints[key],...(review.constraints?.[key]||[])])];
  if(review.priority){state.priority=review.priority;$('#priority').value=review.priority;}
  state.feedback.review=null;state.feedback.draft='';state.feedback.error='';persistFeedback();markDirty();
  await analyzeDisruption(state.view==='disruptions'?state.selectedIncidentId:null);
  feedbackMessage('assistant',state.disruptionPhase==='ready'?'A revised proposal is ready with your reviewed feedback. Your approved fleet plan is unchanged; review and approve the new proposal to use it.':'The revision could not be completed. Your approved fleet plan is unchanged. '+state.lastPlanError,state.disruptionPhase==='ready'?'revised':'failed');
  renderFeedback();
}
function clearFeedback() {
  if(state.busy)return;
  state.feedback.constraints={excluded_fields:[],priority_fields:[],unavailable_rigs:[]};state.feedback.review=null;
  state.priority=state.activeProfile?.preferences?.priority||'balanced';$('#priority').value=state.priority;
  feedbackMessage('assistant','Feedback restrictions cleared. Analyze again to build a proposal without them.');markDirty();renderFeedback();
}
async function applyFarmProfile(profile) {
  if(state.busy||state.profileBusy)return;
  if(window.FIELDWORK_REPLAY){state.profileError=profile?'Profile saved for review and export. Planning with a custom farm requires the local solver; this offline file continues to show the example farm.':'';renderOnboarding();if(!profile)showView('board');return;}
  if(Object.values(state.fleetStore?.snapshot().records||{}).some(r=>r.status==='in_progress')){state.profileError='Complete or hold underway jobs before switching farm setups. Existing work logs will be retained.';renderOnboarding();return;}
  state.profileBusy=true;state.profileError='';setBusy(true);let applied=false;
  try {
    const metadata=profile?await api('/api/profile/preview',{profile}):state.demoMeta;
    state.activeProfile=profile?JSON.parse(JSON.stringify(profile)):null;persistProfile(state.activeProfile);
    state.meta=metadata;state.result=null;state.selected=null;state.receipt=null;state.confirmedText='';state.parsedText='';state.revision++;
    state.disruptionPhase='idle';state.disruptionRun=null;state.disruptionError='';
    state.sim?.destroy();state.sim=null;state.simPlan=null;state.fleetMap?.destroy();state.fleetMap=null;
    state.priority=profile?.preferences?.priority||'balanced';$('#priority').value=state.priority;
    $('#crew-message').value='';$('#parsed-update').hidden=true;
    loadFeedback();initializeFleet();renderMetadata();renderMap();applied=true;
  }catch(error){state.profileError=error.message;}
  finally{state.profileBusy=false;setBusy(false);renderOnboarding();}
  if(applied){await replan();if(!profile)showView('board');notify(state.activeProfile?'Farm profile applied. The plan now uses your reviewed fields, sprayers and crew.':'Switched to the example farm. Your other work logs are retained.');}
}
function buildActionProposal() {
  if(!selectedPlan()||!window.FieldworkPlanActions)return null;
  const snapshot=state.fleetStore?.snapshot();
  return window.FieldworkPlanActions.build({meta:state.meta,result:state.result,plan:selectedPlan(),
    activeSnapshot:snapshot?.active||null,completedIds:state.fleetStore?.completedIds()||[],
    heldIds:Object.values(snapshot?.records||{}).filter(record=>record.status==='held').map(record=>record.field_id)});
}
function renderDisruptions() {
  if(!state.disruptionsDashboard)return;
  const incident=state.incidentStore?.get(state.selectedIncidentId)||null;
  const scoped=!!incident&&state.responseIncidentId===incident.id;
  const current=scoped&&state.disruptionRun===state.result?.run_id;
  state.disruptionsDashboard.render({meta:state.meta,scenario:state.scenario,busy:state.busy,dirty:state.dirty,
    incidents:state.incidentStore?.list()||[],selectedIncident:incident,persistenceWarning:state.incidentStore?.persistenceWarning||'',
    result:current?state.result:null,selectedPlan:current?selectedPlan():null,activeSnapshot:state.fleetStore?.snapshot(),
    error:scoped?state.disruptionError:'',phase:scoped?state.disruptionPhase:'idle',confirmedUpdate:state.confirmedText,
    proposal:current?buildActionProposal():null,offline:!!window.FIELDWORK_REPLAY});
  $('#disruption-feedback-slot').hidden=!incident||!current||incident.status==='resolved';
  renderPlanAgent();
  renderFeedback();
}
async function openIncident(id) {
  if(state.busy)return;
  const incident=state.incidentStore.get(id);if(!incident)return;
  state.selectedIncidentId=id;state.responseIncidentId=null;
  if(incident.status==='new')state.incidentStore.markReviewed(id);
  showView('disruptions');
  if(incident.status!=='resolved')await analyzeDisruption(id);
}
function backToIncidents(){state.selectedIncidentId=null;renderDisruptions();window.scrollTo({top:0,behavior:'instant'});}
function resolveIncident(id){
  if(state.busy)return;
  try{state.incidentStore.resolve(id);markDirty();notify('Issue marked resolved. Review a new plan before changing the fleet queues.');}
  catch(error){notify(error.message);}
  renderDisruptions();
}
function openIncidentReport(rigId=null){
  if(state.busy)return;
  $('#incident-report-error').hidden=true;$('#incident-type').value='breakdown';
  $('#incident-rig').innerHTML=state.meta.rigs.map(r=>`<option value="${escapeHtml(r.id)}">${escapeHtml(r.name)} · ${escapeHtml(r.crew_name)}</option>`).join('');
  $('#incident-field').innerHTML=state.meta.fields.map(f=>`<option value="${escapeHtml(f.id)}">${escapeHtml(f.name)}</option>`).join('');
  if(rigId)$('#incident-rig').value=rigId;
  $('#incident-message').value='';$('#incident-time').value='14:00';$('#incident-wind').value=18;
  updateIncidentReportFields();$('#incident-report-dialog').showModal();
}
function updateIncidentReportFields(){
  const type=$('#incident-type').value;
  $('#incident-field-label').hidden=type!=='wet';$('#incident-time-label').hidden=!['breakdown','storm'].includes(type);$('#incident-wind-label').hidden=type!=='wind';
  $('#incident-time').required=['breakdown','storm'].includes(type);$('#incident-time').disabled=!['breakdown','storm'].includes(type);
  $('#incident-wind').required=type==='wind';$('#incident-wind').disabled=type!=='wind';
  $('#incident-time-title').textContent=type==='storm'?'Expected rain arrival':'Unavailable until';
}
function submitIncidentReport(event){
  event.preventDefault();if(state.busy)return;
  try{
    const type=$('#incident-type').value,rig=state.meta.rigs.find(r=>r.id===$('#incident-rig').value);
    const time=$('#incident-time').value.split(':').map(Number),minutes=time.length===2?time[0]*60+time[1]:NaN;
    const input={type,source:`${rig.crew_name} · ${rig.name}`.slice(0,130)+' (manual demo report)'};
    if($('#incident-message').value.trim())input.message=$('#incident-message').value.trim();
    if(type==='breakdown')Object.assign(input,{rig_id:rig.id,available_from:minutes});
    if(type==='wet')input.field_id=$('#incident-field').value;
    if(type==='storm')input.rain_time=minutes;
    if(type==='wind')input.wind_mph=Number($('#incident-wind').value);
    state.incidentStore.report(input);state.selectedIncidentId=null;state.responseIncidentId=null;
    $('#incident-report-dialog').close();markDirty();showView('disruptions');notify('Fleet report added. Open the incident to review the agent’s response.');
  }catch(error){$('#incident-report-error').textContent=error.message;$('#incident-report-error').hidden=false;}
}
function replayScenarioForIncidents(incidents){
  if(!incidents.length)return state.scenario;
  const item=incidents[0];let recorded=null;
  if(incidents.length===1&&item.type==='breakdown'&&item.rig_id==='R3'&&item.available_from===840)recorded='breakdown';
  if(incidents.length===1&&item.type==='storm'&&item.rain_time===840)recorded='storm';
  if(recorded&&['baseline',recorded].includes(state.scenario))return recorded;
  throw new Error('These reports need the local solver to prepare a combined response. The offline edition can replay the example Rig 3 breakdown or 2 pm rain report only. No response has been approved.');
}
function selectScenario(scenario) {
  if(state.busy||state.scenario===scenario)return;
  state.scenario=scenario;
  $$('[data-scenario]').forEach(el=>{el.classList.toggle('active',el.dataset.scenario===scenario);el.setAttribute('aria-pressed',String(el.dataset.scenario===scenario));});
  markDirty();
}
function selectPlan(id) {
  if(state.busy||!state.result?.plans.some(p=>p.id===id))return;
  state.selected=id;
  state.feedback.review=null;
  if(state.disruptionRun===state.result.run_id&&state.disruptionPhase==='approved')state.disruptionPhase='ready';
  renderOptions();renderMap();renderSchedule();renderApproval();renderFleet();renderDisruptions();
}
async function analyzeDisruption(incidentId=null) {
  if(state.busy)return;
  state.responseIncidentId=incidentId;
  state.disruptionPhase='analyzing';state.disruptionError='';state.disruptionRun=null;renderDisruptions();
  const result=await replan();
  if(result&&!state.dirty){state.disruptionRun=result.run_id;state.disruptionPhase='ready';}
  else {state.disruptionPhase='error';state.disruptionError=state.lastPlanError||'Inputs changed while the plan was being built. Analyze the current conditions again.';}
  renderDisruptions();
}
function renderFleet() {
  if(!state.fleetDashboard || !state.fleetStore)return;
  renderOverviewStats();
  state.fleetDashboard.render({meta:state.meta,result:state.result,draftPlan:selectedPlan(),
    snapshot:state.fleetStore.snapshot(),persistenceWarning:state.fleetStore.persistenceWarning,
    dirty:state.dirty,busy:state.busy});
}
function renderOverviewStats() {
  const m=state.meta;if(!m)return;
  const done=new Set(state.fleetStore?.completedIds()||[]);
  const remaining=m.fields.filter(f=>!done.has(f.id));
  $('#overview-stats').innerHTML=`<div><span class="stat-value">${remaining.length}</span><span>fields left to finish</span></div><div><span class="stat-value" id="board-completed">${done.size}</span><span>fields marked done</span></div><div><span class="stat-value">${m.rigs.length}</span><span>self-propelled rigs</span></div><p>${number(remaining.reduce((n,f)=>n+f.acres,0))} acres remaining.<br>Manual job log · This browser only.</p>`;
}
function initializeFleet() {
  let storage;
  try {storage=window.localStorage;} catch(_error) { /* Store exposes its fallback warning. */ }
  state.fleetStore=new window.FieldworkFleetStore({metadata:state.meta,storage});
  state.incidentStore=new window.FieldworkIncidentStore({metadata:state.meta,storage});
  state.selectedIncidentId=null;state.responseIncidentId=null;
  if(!state.fleetDashboard)state.fleetDashboard=new window.FieldworkFleetDashboard($('#fleet-content'),{
    onTransition:changeJobStatus,onApprove:openApproval,onExport:exportFleetCsv,onReport:openIncidentReport,
    onInspect:id=>{showView('board');setMapMode('2d');inspectField(id);$('.map-panel').scrollIntoView({block:'center'});},
    onReturnBoard:()=>{showView('board');$('#options-title').scrollIntoView({block:'start'});}
  });
  if(!state.disruptionsDashboard)state.disruptionsDashboard=new window.FieldworkDisruptionsDashboard($('#disruptions-content'),{
    onOpenIncident:openIncident,onBackToFeed:backToIncidents,onReportIncident:openIncidentReport,onResolveIncident:resolveIncident,
    onAnalyze:()=>analyzeDisruption(state.selectedIncidentId),onChoosePlan:selectPlan,
    onReviewApproval:openApproval,onDismiss:()=>{state.disruptionPhase='dismissed';state.disruptionRun=null;renderDisruptions();notify('Proposal dismissed. The approved fleet queues are unchanged.');},
    onRequestFeedback:openFeedback,
    onInspectFleet:()=>showView('fleet')
  });
  if(!state.feedbackPanel)state.feedbackPanel=new window.FieldworkProposalFeedback($('#proposal-feedback-content'),{
    onDraft:text=>{state.feedback.draft=text;state.feedback.review=null;},
    onReview:reviewFeedback,onApply:applyFeedback,onClear:clearFeedback
  });
  if(!state.planAgent)state.planAgent=new window.FieldworkPlanAgent($('#plan-agent-content'),{
    onReplan:()=>analyzeDisruption(),onFeedback:openFeedback,onApprove:openApproval,
    onCompare:()=>$('#options-title').scrollIntoView({block:'start',behavior:'instant'})
  });
  renderFleet();
  renderDisruptions();
}
function changeJobStatus(fieldId,status) {
  try {
    const before=state.fleetStore.completedIds().join(',');
    state.fleetStore.transition(fieldId,status);
    if(before!==state.fleetStore.completedIds().join(',')){markDirty();renderMap();}
    const labels={in_progress:'started',done:'marked done',held:'put on hold',queued:'returned to the queue'};
    notify(`${fieldId} ${labels[status]||'updated'}. ${state.fleetStore.completedIds().length} of ${state.meta.fields.length} fields done.`);
  }catch(error){notify(error.message);}
  renderFleet();
  renderDisruptions();
}
function exportFleetCsv(rigId=null) {
  const snapshot=state.fleetStore?.snapshot(),p=snapshot?.active?.plan||selectedPlan();if(!p)return;
  const rows=[['FIELDWORK — MANUAL DEMO JOB LOG'],['Day',state.meta.date],['Plan',p.name],
    ['Plan status',snapshot.active?'Approved locally':'Draft — review only'],
    ['Storage','This browser only; no live equipment tracking'],[],
    ['Planned rig','Queue order','Field','Planned applicator','Scheduled start','Scheduled end','Acres','Job status','Recorded rig','Recorded applicator','Started at','Completed at']];
  state.meta.rigs.filter(r=>!rigId||r.id===rigId).forEach(rig=>{
    p.schedule.filter(j=>j.rig_id===rig.id).sort((a,b)=>a.start-b.start).forEach((j,i)=>{
      const record=snapshot.active?snapshot.records[j.field_id]:null;
      rows.push([rig.name,i+1,j.field_id,j.crew_name,clock(j.start),clock(j.end),j.acres,
        record?.status||'draft',record?.rig_name||record?.rig_id||'',record?.crew_name||'',record?.started_at||'',record?.completed_at||'']);
    });
  });
  rows.push([],['Completed field history — includes earlier approved plans'],['Rig','Field','Acres','Completed at']);
  Object.values(snapshot.records).filter(r=>r.status==='done'&&(!rigId||r.rig_id===rigId))
    .forEach(r=>rows.push([r.rig_id,r.field_id,r.acres,r.completed_at||'']));
  const cell=value=>`"${String(value??'').replace(/"/g,'""')}"`;
  download(`fieldwork-${rigId||'fleet'}-jobs.csv`,rows.map(row=>row.map(cell).join(',')).join('\r\n'),'text/csv;charset=utf-8');
  notify('Downloaded the prioritized queue and recorded job progress.');
}
async function api(path,body) {
  if(window.FIELDWORK_REPLAY)return window.FIELDWORK_REPLAY.request(path,body);
  const controller = new AbortController(), timeout = setTimeout(()=>controller.abort(),60000);
  try {
    const response = await fetch(path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:controller.signal});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || data.message || `Request failed (${response.status}).`);
    return data;
  } catch(error) {if(error.name==='AbortError') throw new Error('The planner took too long. Try replanning again.');throw error;}
  finally {clearTimeout(timeout);}
}
function showError(message) {$('#error-banner').textContent=message;$('#error-banner').hidden=false;}
function notify(message) {$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('#toast').hidden=true,5500);}
function setBusy(busy) {
  state.busy=busy;document.body.classList.toggle('busy',busy);
  $$('#replan-button, [data-scenario], #priority, #parse-message, #crew-message, #use-update, #remove-update').forEach((el)=>el.disabled=busy);
  $('#replan-button span').textContent=window.FIELDWORK_REPLAY?(busy?'Loading recorded plans…':'Load scenario'):(busy?'Finding feasible plans…':'Replan the day');
  $('#update-footnote').textContent=window.FIELDWORK_REPLAY?'Replays recorded plans; no fresh solving.':(busy?'Checking candidate routes and scheduling constraints.':'Uses only the simulated inputs shown here.');
  renderApproval();
  renderFleet();
  renderDisruptions();
  renderOnboarding();
}
function markDirty() {state.revision++;state.dirty=true;state.receipt=null;state.feedback.review=null;state.disruptionPhase='idle';state.disruptionRun=null;$('#stale-banner').hidden=!state.result;renderApproval();renderFleet();renderDisruptions();}
async function replan() {
  if(state.disruptionPhase!=='analyzing'){state.disruptionPhase='idle';state.disruptionRun=null;state.responseIncidentId=null;}
  state.lastPlanError='';
  state.feedback.review=null;
  const sequence=++state.sequence, revision=state.revision;setBusy(true);$('#error-banner').hidden=true;
  try {
    const incidents=state.incidentStore?.activeInputs()||[];
    const scenario=window.FIELDWORK_REPLAY?replayScenarioForIncidents(incidents):state.scenario;
    const result=await api('/api/replan',{scenario,priority:state.priority,update:state.confirmedText,
      ...(window.FIELDWORK_REPLAY?{}:{completed_fields:state.fleetStore?.completedIds()||[],profile:state.activeProfile,
        feedback_constraints:state.feedback.constraints,incidents})});
    if(window.FIELDWORK_REPLAY)result.incidents=incidents;
    if(sequence!==state.sequence) return;
    state.result=result;state.selected=result.plans[0]?.id||null;state.dirty=revision!==state.revision;state.receipt=null;
    $('#stale-banner').hidden=!state.dirty;renderResults();
    return result;
  } catch(error) {state.lastPlanError=error.message;showError(error.message);state.dirty=true;renderApproval();return null;}
  finally {if(sequence===state.sequence)setBusy(false);}
}
function renderResults() {
  renderOptions();renderMap();renderWeather();renderSchedule();renderApproval();renderFleet();renderDisruptions();
  const r=state.result;
  $('#results-subtitle').textContent=r.plans.length ? `${r.plans.length} feasible ${r.plans.length===1?'alternative':'alternatives'} from a bounded route search. Select a plan to inspect it.` : r.remaining_field_count===0?'All fields have been recorded as done.':'No feasible plan was found in this search.';
  const warnings=r.warnings||[];
  $('#result-notes').innerHTML=`<span>Estimates use illustrative rates. Rain buffer is time beyond the required dry period, not a runoff prediction. ${r.replay ? "Prerecorded OR-Tools results; this replay does not run a new solve." : Number(r.solve_seconds||0).toFixed(2)+"s measured planning time on this run."}</span>${r.ranking_explanation?`<div>${escapeHtml(r.ranking_explanation)}</div>`:''}${warnings.length?`<details><summary>Model notes (${warnings.length})</summary><ul>${warnings.map(w=>`<li>${escapeHtml(w)}</li>`).join('')}</ul></details>`:''}`;
}
function planSummary(p) {
  if(p.objective==='cost')return `Keeps ${number(p.priority_acres)} priority acres on the board, with ${number(p.acres)} total acres at the estimated cost below.`;
  if(p.objective==='buffer')return `Leaves at least ${duration(p.min_rain_buffer_minutes)} between the required dry period and modeled rain across ${number(p.acres)} acres.`;
  return `Schedules ${number(p.acres)} acres, including ${number(p.priority_acres)} priority acres. ${p.deferred_count} fields move to a later plan.`;
}
function renderOptions() {
  const plans=state.result?.plans||[];
  if(!plans.length&&state.result?.remaining_field_count===0){$('#options').innerHTML='<div class="empty-state"><h3>Every field is marked done.</h3><p>Your completed jobs remain in the fleet history. There is no remaining work to schedule for this demo day.</p></div>';return;}
  if(!plans.length) {$('#options').innerHTML='<div class="empty-state"><h3>Hold the spray work.</h3><p>The planner found no feasible work in the generated routes. Review the weather, field conditions and availability, then replan. No constraints have been relaxed.</p></div>';return;}
  $('#options').innerHTML=plans.map((p,i)=>`<article class="option-card ${p.id===state.selected?'selected':''}" aria-label="Option ${i+1}: ${escapeHtml(p.name)}"><div class="option-top"><h3 class="option-name"><span class="rank-number">${i+1}</span>${escapeHtml(p.name)}</h3>${i===0?'<span class="recommended">Top ranked</span>':''}</div><p class="option-summary">${escapeHtml(planSummary(p))}</p><div class="option-cost">${money(p.estimated_cost)} <small>estimated operating cost</small></div><div class="option-metrics"><div class="option-metric"><span>Acres scheduled</span><strong>${number(p.acres)} <em>ac · ${p.fields_completed} fields</em></strong></div><div class="option-metric"><span>Labor committed</span><strong>${number(p.labor_hours)} <em>hours</em></strong></div><div class="option-metric"><span>Travel time</span><strong>${duration(p.travel_minutes)}</strong></div><div class="option-metric"><span>Smallest rain buffer</span><strong>${duration(p.min_rain_buffer_minutes)}</strong></div></div><div class="option-bottom"><span>${p.deferred_count} fields deferred</span><button class="select-plan" data-plan="${escapeHtml(p.id)}" aria-pressed="${p.id===state.selected}">${p.id===state.selected?'Viewing schedule ✓':'View schedule'}</button></div></article>`).join('');
  $$('[data-plan]').forEach((button)=>button.addEventListener('click',()=>selectPlan(button.dataset.plan)));
}
function project(field) {return {x:50+field.x*7.45,y:24+field.y*3.85};}
function renderMap() {
  if(!state.meta)return;
  const p=selectedPlan(), scheduled=new Map((p?.schedule||[]).map((job)=>[job.field_id,job]));
  const wet=new Set(state.result?.conditions?.wet_fields||[]);
  const completed=new Set(state.fleetStore?.completedIds()||[]);
  const rigs=state.meta.rigs;
  let svg=`<defs><pattern id="crop" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(12)"><path d="M0 0V7" stroke="#7e9c70" stroke-width="1" opacity=".13"/></pattern><pattern id="wet" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="8" height="8" fill="#bed6db"/><path d="M0 0V8" stroke="#91bbc9" stroke-width="2"/></pattern></defs><rect width="850" height="420" fill="#e8eddf"/><path d="M0 28L160 0H335L263 74 128 63 44 112 0 107ZM603 420l82-72 85 13 80-26v85ZM0 350l46-33 58 16 18 53-31 34H0Z" fill="#d9e5cc"/><path d="M828 -20C748 70 879 94 787 175S713 259 797 320s60 81 32 120" fill="none" stroke="#c2d9d9" stroke-width="23"/><path d="M828 -20C748 70 879 94 787 175S713 259 797 320s60 81 32 120" fill="none" stroke="#d7e7e5" stroke-width="11"/>`;
  [82,151,220,289,358].forEach((y)=>svg+=`<path d="M0 ${y}H776" stroke="#f8f9f2" stroke-width="9"/><path d="M0 ${y}H776" stroke="#c8d0bd" stroke-width=".7"/>`);
  [82,247,410,575,740].forEach((x)=>svg+=`<path d="M${x} 0V420" stroke="#f8f9f2" stroke-width="8"/><path d="M${x} 0V420" stroke="#c8d0bd" stroke-width=".7"/>`);
  svg+=`<path d="M0 383C210 359 322 404 495 365S716 315 850 318" stroke="#d4d9cc" stroke-width="14" fill="none"/><path d="M0 383C210 359 322 404 495 365S716 315 850 318" stroke="#f5f5ec" stroke-width="10" fill="none"/>`;
  if(p) rigs.forEach((rig)=>{
    const jobs=p.schedule.filter(j=>j.rig_id===rig.id).sort((a,b)=>a.start-b.start);
    if(!jobs.length)return;
    const depot=project({x:50,y:50});const points=[depot,...jobs.map(j=>project(fieldById(j.field_id))),depot];
    svg+=`<polyline points="${points.map(v=>`${v.x},${v.y}`).join(' ')}" fill="none" stroke="${escapeHtml(rig.color)}" stroke-width="1.6" stroke-dasharray="4 4" opacity=".45"/>`;
  });
  state.meta.fields.forEach((f,index)=>{
    const pt=project(f),job=scheduled.get(f.id),isWet=wet.has(f.id),isDone=completed.has(f.id),w=43+(index%3)*3,h=28+(index%2)*5;
    const fill=isDone?'#90b2a3':isWet?'url(#wet)':job?'#c0d5ab':'#d9dfce',stroke=isDone?'#315e4b':isWet?'#83afbd':job?'#82a46a':'#b7c3a9';
    const status=isDone?'Marked done in the manual job log':isWet?'Wet, unavailable':job?`Scheduled at ${clock(job.start)}`:'Deferred';
    svg+=`<g class="field-group" tabindex="0" role="button" data-field="${f.id}" aria-label="${escapeHtml(f.name)}, ${f.acres} acres. ${status}"><title>${escapeHtml(f.name)} · ${f.acres} acres · ${status}</title><rect x="${pt.x-w/2}" y="${pt.y-h/2}" width="${w}" height="${h}" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/><rect x="${pt.x-w/2}" y="${pt.y-h/2}" width="${w}" height="${h}" rx="3" fill="url(#crop)"/><text x="${pt.x}" y="${pt.y+3.5}" text-anchor="middle" font-size="10" font-weight="${job?600:450}" fill="${job?'#365638':'#79856e'}">${escapeHtml(f.id)}</text>${f.priority?`<circle cx="${pt.x+w/2-3}" cy="${pt.y-h/2+3}" r="3" fill="#a98540" stroke="#f3efdf" stroke-width="1"/>`:''}</g>`;
  });
  const depot=project({x:50,y:50});
  svg+=`<g><rect x="${depot.x-16}" y="${depot.y-13}" width="32" height="28" rx="5" fill="#3a5843" stroke="#fff" stroke-width="2"/><path d="m${depot.x-8} ${depot.y-3} 8-6 8 6v11h-16Z" fill="#eff3e5"/><rect x="${depot.x-2}" y="${depot.y+1}" width="4" height="7" fill="#3a5843"/></g><text x="${depot.x}" y="${depot.y+29}" text-anchor="middle" font-size="9" font-weight="600" fill="#4d664d" stroke="#e8eddf" stroke-width="3" paint-order="stroke">Co-op yard</text><text x="29" y="30" font-size="9" letter-spacing="1" fill="#91a185">Illustrative field layout</text>`;
  $('#field-map').innerHTML=svg;
  $('#map-subtitle').textContent=p?`${number(p.acres)} acres scheduled · ${p.deferred_count} fields held for another plan`:'All fields shown. Select conditions to build a plan.';
  $$('[data-field]').forEach(el=>{el.addEventListener('click',()=>inspectField(el.dataset.field));el.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();inspectField(el.dataset.field);}});});
  $('#field-tooltip').hidden=true;
  syncSimulation();
}
function syncSimulation() {
  if(!state.meta || !window.Fieldwork3D)return;
  if(!state.sim) {
    state.sim=new window.Fieldwork3D($('#simulation-stage'),{onTimeChange:updatePreviewTime,onFieldSelect:id=>{setMapMode('2d');inspectField(id);}});
    state.sim.setSpeed(Number($('#simulation-speed').value));
  }
  if(!state.fleetMap&&window.FieldworkFleetMap){state.fleetMap=new window.FieldworkFleetMap($('#fleet-map-stage'),{onTimeChange:updatePreviewTime});state.fleetMap.setSpeed(Number($('#simulation-speed').value));}
  const key=(state.result?.run_id||'loading')+':'+state.selected;
  if(key!==state.simPlan) {
    state.simPlan=key;
    const conditions=state.result?.conditions||{rain_time:840,wind_mph:8,wet_fields:[]};
    for(const preview of [state.sim,state.fleetMap]){preview?.setPlaying(false);preview?.setData(state.meta,selectedPlan(),conditions);preview?.setTime(state.meta.now||480);}
  }
}
function activePreview(){return state.mapMode==='map'?state.fleetMap:state.sim;}
function updatePreviewTime(minutes){
  state.previewTime=minutes;$('#simulation-time').textContent=clock(minutes);$('#map-playback-time').textContent=clock(minutes);$('#simulation-scrub').value=minutes;
  const p=selectedPlan(),done=p?.schedule.filter(j=>j.end<=minutes).length||0;
  $('#simulation-progress').textContent=`${done} / ${p?.fields_completed||0} fields replayed`;
  updatePlaybackButton();
}
function updatePlaybackButton(){const playing=Boolean(activePreview()?.playing);$('#simulation-play').textContent=playing?'❚❚ Pause':'▶ Play';$('#simulation-play').setAttribute('aria-label',playing?'Pause simulation':'Play simulation');}
function setMapMode(mode) {
  const time=state.previewTime;state.sim?.setPlaying(false);state.fleetMap?.setPlaying(false);
  state.mapMode=mode;
  $('#flat-map').hidden=mode!=='2d';
  $('#fleet-map-panel').hidden=mode!=='map';
  $('#simulation-panel').hidden=mode!=='3d';
  $('#simulation-toolbar').hidden=mode==='2d';$('#simulation-toolbar').classList.toggle('is-map',mode==='map');
  $('#simulation-view').hidden=mode!=='3d';$('#map-playback-time').hidden=mode!=='map';
  $$('[data-map-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.mapMode===mode);b.setAttribute('aria-pressed',String(b.dataset.mapMode===mode));});
  if(mode!=='2d'){activePreview()?.setTime(time);requestAnimationFrame(()=>activePreview()?.resize());}updatePlaybackButton();
}
function inspectField(id) {
  const f=fieldById(id);if(!f)return;
  const p=selectedPlan(),job=p?.schedule.find(j=>j.field_id===id),deferred=p?.deferred.find(d=>d.field_id===id);
  const completed=state.fleetStore?.snapshot().records[id];
  $('#field-tooltip').innerHTML=`<button aria-label="Close field details">×</button><h3>${escapeHtml(f.name)}${f.priority?' · Priority':''}</h3><p>${f.acres} acres · ${clock(f.window_start,true)}–${clock(f.window_end,true)}</p><p>${f.rainfast_minutes} min required dry time</p>${completed?.status==='done'?'':job?`<p><strong>${escapeHtml(state.meta.rigs.find(r=>r.id===job.rig_id)?.name||job.rig_id)}</strong> · ${clock(job.start)}–${clock(job.end)}</p><p>${escapeHtml(job.crew_name)}</p>`:`<p>${escapeHtml(deferred?.reason||'Not scheduled in this plan.')}</p>`}`;
  $('#field-tooltip').hidden=false;$('#field-tooltip button').onclick=()=>$('#field-tooltip').hidden=true;
  if(completed?.status==='done'){
    const log=document.createElement('p');log.textContent=`Marked done on ${completed.rig_name||completed.rig_id} · Manual job log`;
    $('#field-tooltip').append(log);
  }
}
function renderWeather() {
  const c=state.result?.conditions;if(!c)return;
  $('#rain-label').textContent=`Rain arrives at ${clock(c.rain_time)}`;
  $('#wind-label').textContent=`Wind up to ${c.wind_mph} mph · simulated`;
  $('#weather-hours').innerHTML=[480,600,720,840,960,1080].map(t=>`<span class="weather-hour ${t>=c.rain_time?'rain':''}">${clock(t,true)}</span>`).join('');
}
function renderSchedule() {
  const p=selectedPlan();$('#schedule-section').hidden=!p;if(!p)return;
  $('#schedule-title').textContent=p.name+' · Rig schedule';
  $('#schedule-subtitle').textContent=`${p.fields_completed} fields across ${new Set(p.schedule.map(j=>j.rig_id)).size} rigs. Includes travel time between jobs.`;
  const start=state.meta.workday?.start||480,end=state.meta.workday?.end||1080,percent=(t)=>Math.max(0,Math.min(100,(t-start)/(end-start)*100));
  let html=`<div class="timeline-axis"><span></span><div class="axis-labels">${Array.from({length:6},(_,i)=>Math.round(start+(end-start)*i/5)).map(t=>`<span style="left:${percent(t)}%">${clock(t,true)}</span>`).join('')}</div></div>`;
  state.meta.rigs.forEach(rig=>{
    const jobs=p.schedule.filter(j=>j.rig_id===rig.id).sort((a,b)=>a.start-b.start);
    html+=`<div class="timeline-row"><div class="rig-label"><i class="rig-dot" style="background:${escapeHtml(rig.color)}"></i>${escapeHtml(rig.name)}<span>${escapeHtml(rig.crew_name)}</span></div><div class="timeline-track">`;
    if(!jobs.length) html+='<span class="empty-track">No work assigned</span>';
    jobs.forEach(job=>{
      const previous=jobs.indexOf(job)?jobs[jobs.indexOf(job)-1].end:Math.max(start,state.result.conditions.rig_available_from?.[rig.id]||start);
      const travelStart=previous, travelEnd=travelStart+job.travel_minutes;
      html+=`<span class="travel-block" style="left:${percent(travelStart)}%;width:${percent(travelEnd)-percent(travelStart)}%" title="${job.travel_minutes} minutes travel"></span><button class="job-block" data-job="${escapeHtml(job.field_id)}" style="left:${percent(job.start)}%;width:${percent(job.end)-percent(job.start)}%;border-color:${escapeHtml(rig.color)};background:${escapeHtml(rig.color)}20;color:${escapeHtml(rig.color)}" aria-label="${escapeHtml(job.field_id)}, ${clock(job.start)} to ${clock(job.end)}, ${job.acres} acres" title="${escapeHtml(job.field_id)} · ${clock(job.start)}–${clock(job.end)} · ${job.acres} ac">${escapeHtml(job.field_id)}</button>`;
    });
    html+=`<span class="rain-overlay" style="width:${100-percent(state.result.conditions.rain_time)}%"></span></div></div>`;
  });
  $('#timeline').innerHTML=html;
  $$('[data-job]').forEach(button=>button.onclick=()=>{$('.map-panel').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});setMapMode('2d');inspectField(button.dataset.job);});
  $('#deferred-summary').textContent=`${p.deferred_count} deferred fields · View reasons`;
  $('#deferred-list').innerHTML=p.deferred.map(d=>`<p><strong>${escapeHtml(d.field_id)}</strong> · ${escapeHtml(d.reason)}</p>`).join('')||'<p>All fields are scheduled.</p>';
  const cost=p.cost_breakdown||{};
  $('#cost-details').innerHTML=`<div class="cost-lines"><div>Application component<strong>${preciseMoney(cost.application)}</strong></div><div>Travel component<strong>${preciseMoney(cost.travel)}</strong></div><div>Labor component<strong>${preciseMoney(cost.labor)}</strong></div><div>Total estimate<strong>${preciseMoney(p.estimated_cost)}</strong></div></div><p>Illustrative, separate cost components; not a quoted commercial custom rate. Labor includes assigned route time and return travel. Read the model assumptions for exclusions. Solver status: ${escapeHtml(p.solver_status)} within the generated candidate routes.</p>`;
}
function renderApproval() {
  const p=selectedPlan();$('#approval-bar').hidden=!p||state.view!=='board';
  if(!p)return;
  const approved=state.receipt?.plan_id===p.id;
  $('#approval-state').textContent=approved?'Approved locally · No dispatch sent':state.dirty?'Plan needs refreshing':state.busy?'Planner is running':'Ready for your review';
  $('#approval-summary').textContent=`${p.name} · ${number(p.acres)} acres · ${money(p.estimated_cost)} estimated`;
  $('#approve-button').disabled=state.busy||state.dirty;
  $('#approve-button').innerHTML=approved?'Download approved plan ↓':'Review &amp; approve <span aria-hidden="true">↗</span>';
  $('#download-csv').disabled=state.busy||state.dirty;
}
function download(name,content,type) {const url=URL.createObjectURL(new Blob([content],{type}));const link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);}
function exportCsv() {
  const p=selectedPlan();if(!p||state.dirty||state.busy)return;
  const cell=value=>`"${String(value??'').replace(/"/g,'""')}"`;
  const rows=[['SIMULATED REVIEW FILE — NOT A MACHINE TASK FILE'],['Plan',p.name],['Run',state.result.run_id],['Status',state.receipt?.plan_id===p.id?'Approved locally':'Draft for review'],[],['Field','Rig','Applicator','Start','End','Acres','Travel minutes']];
  p.schedule.forEach(j=>rows.push([j.field_id,j.rig_id,j.crew_name,clock(j.start),clock(j.end),j.acres,j.travel_minutes]));
  download('fieldwork-crew-review.csv',rows.map(row=>row.map(cell).join(',')).join('\r\n'),'text/csv;charset=utf-8');
  notify('Downloaded a simulated crew sheet for review.');
}
function openApproval() {
  const p=selectedPlan();if(!p||state.dirty||state.busy)return;
  state.approvalIncidentId=state.responseIncidentId&&state.disruptionRun===state.result?.run_id?state.responseIncidentId:null;
  if(state.receipt?.plan_id===p.id){download('fieldwork-approved-plan.json',JSON.stringify(state.receipt,null,2),'application/json');return;}
  $('#dialog-summary').textContent=`${p.name}: ${p.fields_completed} fields, ${number(p.acres)} acres, ${number(p.labor_hours)} labor-hours and ${money(p.estimated_cost)} estimated operating cost.`;
  const proposal=buildActionProposal();
  $('#dialog-plan-actions').innerHTML=proposal?`<div class="approval-action-list"><strong>Actions you are approving</strong>${proposal.actions.map(action=>`<p><b>${escapeHtml(action.rig_name)}</b><span>${action.next_first?'First: '+escapeHtml(fieldById(action.next_first)?.name||action.next_first):action.jobs.length?'Assigned jobs remain on hold':'No remaining fields assigned'} · ${action.jobs.length} field${action.jobs.length===1?'':'s'}${action.held_fields?.length?' · '+action.held_fields.length+' on hold':''}</span></p>`).join('')}<small>Approves one coordinated fleet plan. Completed jobs stay in the log; existing holds stay in place.</small></div>`:'';
  $('#dialog-error').hidden=true;$('#approval-dialog').showModal();
}
async function confirmApproval() {
  const p=selectedPlan();if(!p||state.dirty||state.busy)return;
  const result=state.result, revision=state.revision,incidentId=state.approvalIncidentId;
  $('#confirm-approval').disabled=true;
  try {
    if(Object.values(state.fleetStore?.snapshot().records||{}).some(r=>r.status==='in_progress'))
      throw new Error('Complete or hold the job in progress before replacing the fleet plan.');
    const receipt=await api('/api/approve',{run_id:result.run_id,plan_id:p.id});
    if(state.result!==result||state.revision!==revision||state.selected!==p.id)throw new Error('The plan changed during approval. Review the current draft before updating the fleet queues.');
    state.fleetStore.activate(p,result);
    let reportWarning='';
    if(incidentId&&result.incidents?.some(i=>i.id===incidentId)){
      try{state.incidentStore.approveResponse(incidentId,{run_id:result.run_id,plan_id:p.id});}
      catch(error){reportWarning=` The plan was approved, but the report status needs review: ${error.message}`;}
    }
    if(state.disruptionRun===result.run_id)state.disruptionPhase='approved';
    state.receipt=receipt;$('#approval-dialog').close();renderApproval();renderFleet();
    renderDisruptions();
    notify(`Plan approved. ${state.meta.rigs.length} sprayer queues are ready in Fleet. No dispatch was sent.${reportWarning}`);
  }
  catch(error){$('#dialog-error').textContent=error.message;$('#dialog-error').hidden=false;markDirty();}
  finally{$('#confirm-approval').disabled=false;}
}
function describeUpdate(u) {
  if(u.type==='rig_unavailable')return `${u.rig_id.replace('R','Rig ')} unavailable until ${clock(u.available_from)}.`;
  if(u.type==='field_wet')return `${u.field_id.replace('F','Field ')} excluded as too wet.`;
  if(u.type==='rain_time')return `Rain arrives at ${clock(u.rain_time)}.`;
  if(u.type==='wind')return `Wind ${u.wind_mph} mph for the entire remaining day.`;
  return JSON.stringify(u);
}
async function parseMessage() {
  const text=$('#crew-message').value.trim(), parseSequence=++state.parseSequence;$('#parse-message').disabled=true;
  try {
    const result=await api('/api/parse',{text,...(state.activeProfile?{profile:state.activeProfile}:{})});
    if(parseSequence!==state.parseSequence||text!==$('#crew-message').value.trim())return;
    state.parsedText=text;
    const usable=result.updates?.length>0;
    $('#parsed-update').hidden=false;$('#parsed-update').classList.toggle('error',!usable);
    $('#parsed-update').innerHTML=`${usable?`<strong>Proposed update</strong><p>${result.updates.map(describeUpdate).map(escapeHtml).join(' ')}</p>`:'<strong>No update applied.</strong>'}<p>${(result.warnings||[]).map(escapeHtml).join(' ')}</p>${usable?'<button id="use-update" class="text-button">Use this interpretation</button>':''}`;
    if(usable)$('#use-update').onclick=()=>{if(state.busy)return;state.confirmedText=state.parsedText;markDirty();$('#parsed-update').innerHTML=`<strong>Included in next replan</strong><p>${result.updates.map(describeUpdate).map(escapeHtml).join(' ')}</p><button id="remove-update" class="text-button">Remove update</button>`;$('#remove-update').onclick=clearUpdate;};
  }catch(error){if(parseSequence===state.parseSequence)showError(error.message);}
  finally{$('#parse-message').disabled=state.busy;}
}
function clearUpdate(){if(state.busy)return;state.parseSequence++;const had=!!state.confirmedText;state.confirmedText='';state.parsedText='';$('#parsed-update').hidden=true;if(had)markDirty();}
function showView(view) {
  state.view=view;if(view!=='board'){state.sim?.setPlaying(false);state.fleetMap?.setPlaying(false);}updatePlaybackButton();$$('.view').forEach(el=>el.hidden=el.id!==`${view}-view`);
  if(view==='board')requestAnimationFrame(()=>activePreview()?.resize());
  $$('[data-view]').forEach(el=>{el.classList.toggle('active',el.dataset.view===view);el.setAttribute('aria-current',el.dataset.view===view?'page':'false');});
  $('.page-heading h1').textContent=view==='board'?'Today’s spray plan':view==='fleet'?'Your fleet. Every field.':view==='disruptions'?'Disruptions':view==='farm'?'Tell us about your farm':'A plan you can inspect';
  $('.intro').textContent=view==='board'?'When the day changes, find your next best move.':view==='fleet'?`${state.meta?.rigs.length||4} sprayers, clear priorities, and a running job log.`:view==='disruptions'?'Reports from the field. Open an issue to review the agent’s response.':view==='farm'?'Build a profile together, then review what the planner will use.':'Clear inputs, stated assumptions and a human decision.';
  renderApproval();if(view==='fleet')renderFleet();if(view==='disruptions'||view==='board')renderDisruptions();
  renderOnboarding();
  try {history.replaceState(null,'',view==='board'?'#plan':`#${view}`);}catch(_error){}
  window.scrollTo({top:0,behavior:'instant'});
  if(view==='board'&&state.meta&&!state.result&&!state.busy)void replan();
}
function renderMetadata() {
  const m=state.meta;
  $('#farm-location').textContent=m.location||'Tippecanoe County, Indiana';
  $('#runtime-note').textContent=window.FIELDWORK_REPLAY?'Offline edition: prerecorded OR-Tools plans. No live data or fresh solving.':state.activeProfile?'Reviewed farm profile · Schematic map and simulated conditions.':'Local solver mode · All field activity is simulated.';
  $('#field-picker').innerHTML='<option value="">Choose a field</option>'+m.fields.map(f=>`<option value="${escapeHtml(f.id)}">${escapeHtml(f.name)} · ${f.acres} ac</option>`).join('');
  $('#demo-date').textContent=`Synthetic day · ${m.date||'June 17'}`;
  $('#current-time').textContent=clock(m.now||480);
  $('#simulation-scrub').min=m.workday?.start||480;$('#simulation-scrub').max=m.workday?.end||1080;
  const downRig=m.rigs.find(r=>r.id==='R3')||m.rigs[0];
  $('[data-scenario="breakdown"] small').textContent=`${downRig.name} unavailable until 2 pm`;
  $('[data-scenario="wet"] small').textContent=`Hold ${Math.min(6,m.fields.length)} saturated fields`;
  $('[data-scenario="wind"] small').textContent='18 mph during the restricted period';
  renderOverviewStats();
  $('#crew-content').innerHTML=`<div class="fleet-grid">${m.rigs.map(r=>`<article class="fleet-card"><svg viewBox="0 0 40 30" aria-hidden="true"><path d="M8 21V8h16v13M24 13h6l6 8H24M0 14h8M3 12v8M31 12h9M37 12v7"/><circle cx="12" cy="23" r="5"/><circle cx="29" cy="23" r="4"/></svg><h3>${escapeHtml(r.name)}</h3><p>${escapeHtml(r.crew_name)}</p><p>${r.acres_per_hour||'—'} acres/hour assumed capacity</p></article>`).join('')}</div><div class="crew-table-wrap"><table class="crew-table"><thead><tr><th>Applicator</th><th>Demo certifications</th><th>Shift</th><th>Assignment</th></tr></thead><tbody>${m.crew.map(c=>`<tr><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.certification||c.certifications?.join(', '))}</td><td>${clock(c.shift_start)}–${clock(c.shift_end)}</td><td>${escapeHtml(m.rigs.find(r=>r.crew_name===c.name)?.name||'Reserve')}</td></tr>`).join('')}</tbody></table></div><p class="fleet-note">Fixed crew assignments in this prototype. Two reserves are listed but automatic reassignment is not modeled. Certification labels are fictional and do not represent real credentials.</p>`;
  $('#assumption-list').innerHTML=(m.assumptions||[]).map(a=>`<li>${escapeHtml(typeof a==='string'?a:JSON.stringify(a))}</li>`).join('');
  $('#crew-content .fleet-note').textContent=`Fixed operator assignments. ${Math.max(0,m.crew.length-m.rigs.length)} reserve applicators are listed; automatic reassignment is not modeled. ${state.activeProfile?'Qualifications are user-reported and must be verified before real operations.':'Qualification labels are fictional.'}`;
  $('#crew-content th:nth-child(2)').textContent=state.activeProfile?'Reported qualifications':'Demo certifications';
  renderOnboarding();
}
$$('[data-scenario]').forEach(button=>button.addEventListener('click',()=>selectScenario(button.dataset.scenario)));
$('#priority').addEventListener('change',()=>{state.priority=$('#priority').value;markDirty();});
$('#replan-button').addEventListener('click',replan);
$$('[data-map-mode]').forEach(b=>b.addEventListener('click',()=>setMapMode(b.dataset.mapMode)));
$('#simulation-play').addEventListener('click',()=>{const preview=activePreview();if(preview){preview.setPlaying(!preview.playing);updatePlaybackButton();}});
$('#simulation-scrub').addEventListener('input',()=>{activePreview()?.setPlaying(false);activePreview()?.setTime(Number($('#simulation-scrub').value));});
$('#simulation-speed').addEventListener('change',()=>{state.sim?.setSpeed(Number($('#simulation-speed').value));state.fleetMap?.setSpeed(Number($('#simulation-speed').value));});
$('#simulation-view').addEventListener('change',()=>state.sim?.setView($('#simulation-view').value));
$('#simulation-reset').addEventListener('click',()=>{activePreview()?.resetView();$('#simulation-view').value='orbit';});
$('#parse-message').addEventListener('click',parseMessage);
$('#crew-message').addEventListener('input',clearUpdate);
$('#download-csv').addEventListener('click',exportCsv);
$('#open-fleet').addEventListener('click',()=>{showView('fleet');window.scrollTo({top:0});});
$('#open-farm-chat').addEventListener('click',()=>showView('farm'));
$('#field-picker').addEventListener('change',()=>{if($('#field-picker').value){setMapMode('2d');inspectField($('#field-picker').value)};});
$('#approve-button').addEventListener('click',openApproval);
$('#confirm-approval').addEventListener('click',confirmApproval);
$$('[data-view]').forEach(button=>button.addEventListener('click',()=>{if(button.dataset.view==='disruptions')state.selectedIncidentId=null;showView(button.dataset.view);}));
$('#incident-type').addEventListener('change',updateIncidentReportFields);
$('#incident-report-form').addEventListener('submit',submitIncidentReport);
$('#close-incident-report').addEventListener('click',()=>$('#incident-report-dialog').close());
$('#cancel-incident-report').addEventListener('click',()=>$('#incident-report-dialog').close());
$$('.wordmark,.brand-mark').forEach(link=>link.addEventListener('click',e=>{e.preventDefault();showView('board');window.scrollTo({top:0});}));
$('#approval-dialog').addEventListener('click',event=>{if(event.target===$('#approval-dialog')){const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)event.target.close();}});
window.addEventListener('storage',event=>{
  if(state.incidentStore&&event.key===state.incidentStore.key){
    const previous=JSON.stringify(state.incidentStore.activeInputs());
    state.incidentStore=new window.FieldworkIncidentStore({metadata:state.meta,storage:event.storageArea});
    if(previous!==JSON.stringify(state.incidentStore.activeInputs()))markDirty();
    renderDisruptions();return;
  }
  if(!state.fleetStore||event.key!==state.fleetStore.key)return;
  const before=state.fleetStore.completedIds().join(',');
  const oldActive=state.fleetStore.snapshot().active;
  state.fleetStore=new window.FieldworkFleetStore({metadata:state.meta,storage:event.storageArea});
  const newActive=state.fleetStore.snapshot().active;
  const completionsChanged=before!==state.fleetStore.completedIds().join(',');
  if(completionsChanged||oldActive?.run_id!==newActive?.run_id||oldActive?.plan.id!==newActive?.plan.id)markDirty();
  if(completionsChanged)renderMap();
  renderFleet();
  renderDisruptions();
});
async function init(){try{
  state.demoMeta=await api('/api/demo');state.meta=state.demoMeta;
  state.onboarding=new window.FieldworkOnboarding($('#farm-content'),{onApply:applyFarmProfile,onUseDemo:()=>applyFarmProfile(null),onExport:profile=>download('fieldwork-farm-profile.json',JSON.stringify(profile,null,2),'application/json')});
  const saved=readSavedProfile();
  if(saved&&!window.FIELDWORK_REPLAY){try{state.meta=await api('/api/profile/preview',{profile:saved});state.activeProfile=saved;state.priority=saved.preferences?.priority||'balanced';$('#priority').value=state.priority;}catch(error){state.profileError=`Saved profile needs review: ${error.message}`;}}
  const view=location.hash.slice(1);
  if(['fleet','disruptions','assumptions','farm'].includes(view))state.view=view;else if(!state.activeProfile&&!view)state.view='farm';
  $$('.view').forEach(el=>el.hidden=el.id!==`${state.view}-view`);
  loadFeedback();renderMetadata();initializeFleet();renderMap();
  if(state.view!=='board')showView(state.view);
  if(state.view!=='disruptions')await replan();
}catch(error){showError(`Could not load the local demo. ${error.message}`);$('#options').innerHTML='<div class="empty-state"><h3>The local planner is unavailable.</h3><p>Start the Python server using the README, then reload this page.</p></div>';}}
init();
