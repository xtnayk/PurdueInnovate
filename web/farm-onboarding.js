/* Guided local onboarding. Answers are parsed only in the formats shown; no LLM is connected. */
(function (global) {
  'use strict';
  const KEY='fieldwork:farm-onboarding:v1';
  const PROFILE_ID=/^[A-Za-z0-9_-]{1,80}$/;
  const clone=value=>JSON.parse(JSON.stringify(value));
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uid=()=>global.crypto?.randomUUID?.()||`farm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
  const priorities={balanced:'Balanced priorities',acres:'Complete more acreage',cost:'Lower estimated cost',buffer:'Leave more rain buffer'};
  const zones=new Set(['north','south','east','west','central']);
  const steps=[
    {id:'farm_name',title:'Farm name',question:'What do you call your farm or operation?',hint:'Use the name you want to see on your dashboard.',placeholder:'Wabash Valley Farms',rows:2},
    {id:'location',title:'Location',question:'Where is your operation based?',hint:'Tell me the town, county and state. This is context, not a surveyed address or weather connection.',placeholder:'West Lafayette, Tippecanoe County, Indiana',rows:2},
    {id:'fields',title:'Fields & layout',question:'Tell me about the fields you want to plan.',hint:'One field per line: name, acres, crop, zone. Zones: north, south, east, west or central. Add priority or hold when needed. The map will be schematic.',placeholder:'North 40, 40 acres, corn, north, priority\nCreek field, 62 acres, soybeans, east, hold',rows:6},
    {id:'rigs',title:'Sprayers',question:'Which sprayers do you have, and how much can each cover?',hint:'One sprayer per line: name, estimated acres/hour. Add 1–4 sprayers. These are planning capacities, not manufacturer specifications.',placeholder:'Rig 1, 80 acres/hour\nRig 2, 75 acres/hour',rows:4},
    {id:'crew',title:'Applicators',question:'Who is available to operate those sprayers?',hint:'One person per line: name, standard or standard+special. The first person operates the first sprayer, and so on; extra people are reserves. These are demo eligibility labels, not verified licenses.',placeholder:'Avery, standard+special\nMorgan, standard',rows:4},
    {id:'workday',title:'Working hours',question:'What hours can your crew work?',hint:'Use a start and end time such as 8am–6pm. This prototype plans inside an 8am–8pm day and uses one shared shift.',placeholder:'8am–6pm',rows:2},
    {id:'rules',title:'Planning assumptions',question:'Which dry-time and wind assumptions should the demo use?',hint:'Enter dry minutes and wind mph. These shared assumptions do not replace product labels or legal application requirements; review them before field use.',placeholder:'90 minutes dry, 15 mph',rows:2},
    {id:'notes',title:'Local knowledge',question:'What else should a planner know about access and the layout?',hint:'Describe gates, ditches, sensitive neighbors, refills or narrow roads. These notes are saved as context, not automatically enforced. Use hold on a field to exclude it. Enter none if there is nothing to add.',placeholder:'The creek field has one entrance from the east. Keep away from the orchard to the south.',rows:4},
    {id:'preferences',title:'Priorities',question:'What matters most when comparing feasible plans?',hint:'Choose a preference below. Hard constraints still apply to every option.',placeholder:'balanced',rows:2}
  ];
  function boundedText(value,label,max=160) {
    if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw new Error(`${label} must be 1–${max} characters.`);
    return value.trim();
  }
  function lines(value,label,max) {
    const text=boundedText(value,label,12000);
    const result=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    if(!result.length||result.length>max)throw new Error(`Enter between 1 and ${max} ${label.toLowerCase()}, one per line.`);
    return result;
  }
  function uniqueNames(items,label) {
    const names=items.map(x=>x.name.toLocaleLowerCase());
    if(new Set(names).size!==names.length)throw new Error(`${label} need distinct names so assignments are unambiguous.`);
    return items;
  }
  function parseFields(value) {
    return uniqueNames(lines(value,'Fields',40).map((line,index)=>{
      const parts=line.split(/[,|]/).map(s=>s.trim());
      if(parts.length<4||parts.length>6)throw new Error(`Field line ${index+1}: use name, acres, crop, zone, then optional priority or hold.`);
      const match=parts[1].match(/^(\d+)\s*(?:acres?|ac)?$/i);
      if(!match||+match[1]<1||+match[1]>500)throw new Error(`Field line ${index+1}: enter a whole acreage from 1 to 500.`);
      const zone=parts[3].toLowerCase();
      if(!zones.has(zone))throw new Error(`Field line ${index+1}: choose north, south, east, west or central.`);
      const flags=parts.slice(4).map(s=>s.toLowerCase());
      if(flags.some(flag=>!['priority','hold'].includes(flag))||new Set(flags).size!==flags.length)throw new Error(`Field line ${index+1}: only priority and hold are supported after the zone.`);
      return {id:`F${String(index+1).padStart(2,'0')}`,name:boundedText(parts[0],'Field name',80),acres:+match[1],crop:boundedText(parts[2],'Crop',80),zone,priority:flags.includes('priority'),excluded:flags.includes('hold')};
    }),'Fields');
  }
  function parseRigs(value) {
    return uniqueNames(lines(value,'Sprayers',4).map((line,index)=>{
      const parts=line.split(/[,|]/).map(s=>s.trim());
      if(parts.length!==2)throw new Error(`Sprayer line ${index+1}: use name, acres/hour.`);
      const match=parts[1].match(/^(\d+)\s*(?:(?:acres?|ac)\s*(?:\/|per)\s*(?:hours?|hr|h))?$/i);
      if(!match||+match[1]<1||+match[1]>500)throw new Error(`Sprayer line ${index+1}: enter a whole capacity from 1 to 500 acres/hour.`);
      return {id:`R${index+1}`,name:boundedText(parts[0],'Sprayer name',80),acres_per_hour:+match[1]};
    }),'Sprayers');
  }
  function parseCrew(value) {
    return uniqueNames(lines(value,'Applicators',12).map((line,index)=>{
      const parts=line.split(/[,|]/).map(s=>s.trim());
      if(parts.length!==2)throw new Error(`Applicator line ${index+1}: use name, standard or standard+special.`);
      const cert=parts[1].toLowerCase().replace(/\s+/g,'');
      if(!['standard','standard+special','special+standard'].includes(cert))throw new Error(`Applicator line ${index+1}: use standard or standard+special. Unknown credentials cannot be inferred.`);
      return {id:`C${index+1}`,name:boundedText(parts[0],'Applicator name',80),certifications:cert.includes('special')?['standard','special']:['standard']};
    }),'Applicators');
  }
  function parseTime(value) {
    const match=value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
    if(!match||+match[1]<1||+match[1]>12||+(match[2]||0)>59)throw new Error('Use explicit times such as 8am and 6pm.');
    return (+match[1]%12+(match[3].toLowerCase()==='pm'?12:0))*60+(+(match[2]||0));
  }
  function parseWorkday(value) {
    const parts=boundedText(value,'Working hours',80).split(/\s*(?:–|—|-|\bto\b)\s*/i);
    if(parts.length!==2)throw new Error('Use one start and end time, such as 8am–6pm.');
    const start=parseTime(parts[0]),end=parseTime(parts[1]);
    if(start<480||end>1200||end<=start)throw new Error('Choose a shift starting at or after 8am and ending later, no later than 8pm.');
    return {start,end};
  }
  function parseRules(value) {
    const match=boundedText(value,'Planning assumptions',120).match(/^(\d+)\s*(?:minutes?|mins?)\s*(?:dry)?\s*[,;]\s*(\d+)\s*mph$/i);
    if(!match||+match[1]<1||+match[1]>360||+match[2]<1||+match[2]>20)throw new Error('Use dry time from 1–360 minutes and wind from 1–20 mph, such as 90 minutes dry, 15 mph.');
    return {rainfast_minutes:+match[1],wind_limit_mph:+match[2]};
  }
  function parseAnswer(id,value) {
    if(id==='farm_name')return boundedText(value,'Farm name',120);
    if(id==='location')return boundedText(value,'Location',200);
    if(id==='fields')return parseFields(value);
    if(id==='rigs')return parseRigs(value);
    if(id==='crew')return parseCrew(value);
    if(id==='workday')return parseWorkday(value);
    if(id==='rules')return parseRules(value);
    if(id==='notes'){const text=boundedText(value,'Local knowledge',3000);return /^none$/i.test(text)?'':text;}
    if(id==='preferences'){
      const key=String(value).trim().toLowerCase();
      if(!Object.hasOwn(priorities,key))throw new Error('Choose balanced, acres, cost or buffer.');
      return {priority:key};
    }
    throw new Error('Unknown onboarding question.');
  }
  function validateProfile(profile) {
    if(!profile||profile.version!==1||typeof profile.id!=='string'||!PROFILE_ID.test(profile.id))throw new Error('The farm profile is incomplete.');
    boundedText(profile.farm_name,'Farm name',120);boundedText(profile.location,'Location',200);
    if(!Array.isArray(profile.fields)||!profile.fields.length||profile.fields.length>40)throw new Error('Add 1–40 fields.');
    if(profile.fields.some(f=>!f||typeof f.name!=='string'||typeof f.crop!=='string'||!Number.isInteger(f.acres)||!zones.has(f.zone)))throw new Error('Review field names, whole acreages, crops and zones.');
    parseFields(profile.fields.map(f=>`${f.name},${f.acres},${f.crop},${f.zone}${f.priority?',priority':''}${f.excluded?',hold':''}`).join('\n'));
    if(!Array.isArray(profile.rigs))throw new Error('Add the sprayer roster.');
    if(profile.rigs.some(r=>!r||typeof r.name!=='string'||!Number.isInteger(r.acres_per_hour)))throw new Error('Review sprayer names and whole hourly capacities.');
    parseRigs(profile.rigs.map(r=>`${r.name},${r.acres_per_hour}`).join('\n'));
    if(!Array.isArray(profile.crew))throw new Error('Add the applicator roster.');
    if(profile.crew.some(c=>!c||typeof c.name!=='string'||!Array.isArray(c.certifications)))throw new Error('Review applicator names and eligibility labels.');
    parseCrew(profile.crew.map(c=>`${c.name},${c.certifications.join('+')}`).join('\n'));
    if(profile.crew.length<profile.rigs.length)throw new Error('Add at least one named applicator for each sprayer. The roster order sets the fixed assignments.');
    if(profile.fields.some((f,i)=>f.id!==`F${String(i+1).padStart(2,'0')}`||typeof f.priority!=='boolean'||typeof f.excluded!=='boolean')||profile.rigs.some((r,i)=>r.id!==`R${i+1}`)||profile.crew.some((c,i)=>c.id!==`C${i+1}`))throw new Error('The roster IDs or flags are invalid. Review the farm profile.');
    if(!profile.workday||!Number.isInteger(profile.workday.start)||!Number.isInteger(profile.workday.end)||profile.workday.start<480||profile.workday.end>1200||profile.workday.end<=profile.workday.start)throw new Error('Review the shared working hours.');
    if(!profile.rules||!Number.isInteger(profile.rules.rainfast_minutes)||profile.rules.rainfast_minutes<1||profile.rules.rainfast_minutes>360||!Number.isInteger(profile.rules.wind_limit_mph)||profile.rules.wind_limit_mph<1||profile.rules.wind_limit_mph>20)throw new Error('Review the shared dry-time and wind assumptions.');
    if(typeof profile.notes!=='string'||profile.notes.length>3000||!Object.hasOwn(priorities,profile.preferences?.priority))throw new Error('Review local knowledge and planning preferences.');
    return clone(profile);
  }
  function emptyDraft(){return {id:uid(),answers:{},values:{},step:0,editing:false,review:false,composer:''};}
  function formatTime(minutes){const h=Math.floor(minutes/60);return `${h%12||12}:${String(minutes%60).padStart(2,'0')}${h<12?'am':'pm'}`;}
  function replyFor(id,value,values={}) {
    const count=(n,singular,plural=`${singular}s`)=>`${n} ${n===1?singular:plural}`;
    if(id==='farm_name')return `Got it. I’ll call your operation ${value}.`;
    if(id==='location')return `I’ve noted ${value}. Your field names and zones will describe the farm’s layout; this location text does not verify field boundaries.`;
    if(id==='fields'){
      const acres=value.reduce((total,field)=>total+field.acres,0),priority=value.filter(field=>field.priority).length,held=value.filter(field=>field.excluded).length;
      return `I’ve noted ${count(value.length,'field')} totaling ${acres.toLocaleString('en-US')} acres. ${priority?`${count(priority,'field')} ${priority===1?'is':'are'} marked priority.`:'No fields are marked priority yet.'} ${held?`${count(held,'field')} ${held===1?'is':'are'} on hold and will be excluded from planning.`:'None are on hold.'}`;
    }
    if(id==='rigs')return `You have ${count(value.length,'sprayer')} in this profile: ${value.map(rig=>`${rig.name} at ${rig.acres_per_hour} acres/hour`).join('; ')}. I’ll use those entered capacities when building a plan.`;
    if(id==='crew'){
      const rigs=values.rigs||[],reserve=Math.max(0,value.length-rigs.length),assignments=rigs.map((rig,index)=>`${value[index]?.name||'Missing operator'} on ${rig.name}`);
      return `I’ve listed ${count(value.length,'applicator')}.${assignments.length?` The fixed assignments are ${assignments.join('; ')}.`:''}${rigs.length?` ${reserve?`${count(reserve,'person','people')} will be listed as ${reserve===1?'a reserve':'reserves'}.`:'Everyone has an assigned sprayer.'}`:''} These are the eligibility labels you reported, not verified licenses.`;
    }
    if(id==='workday')return `I’ll plan one shared shift from ${formatTime(value.start)} to ${formatTime(value.end)} for this crew.`;
    if(id==='rules')return `I’ll use ${value.rainfast_minutes} minutes of required dry time and a ${value.wind_limit_mph} mph wind limit as shared demo assumptions. You’ll be able to check them in the profile review.`;
    if(id==='notes')return value?'I’ve saved your local knowledge for the profile review. Those notes do not change routes automatically. A field marked on hold will be excluded from planning.':'No extra access notes for now. You can add them later in the profile review.';
    if(id==='preferences')return `${{balanced:'I’ll balance acreage, estimated cost and rain buffer when ranking feasible plans.',acres:'I’ll rank feasible plans by total acreage, highest first.',cost:'I’ll rank feasible plans by estimated cost, lowest first.',buffer:'I’ll rank feasible plans by minimum rain buffer, largest first.'}[value.priority]} The hard constraints still apply. Your farm profile is ready to review.`;
    return '';
  }
  function clarificationFor(id,error) {
    const lead={farm_name:'What name should I use for the operation?',location:'Which town, county and state should I note?',fields:'I need a name, acreage, crop and zone for each field.',rigs:'I need each sprayer’s name and hourly acreage capacity.',crew:'I need the operator names and eligibility labels to make the assignments.',workday:'I need a start and finish time with am or pm.',rules:'I need the dry-time minutes and wind speed as numbers.',notes:'Tell me any local details, or enter “none.”',preferences:'Choose how you want feasible plans ranked.'};
    return `${lead[id]||'I need a little more detail.'} ${error} Your previous answers are still saved.`;
  }
  function answerFromProfile(profile,id) {
    if(id==='fields')return profile.fields.map(f=>`${f.name}, ${f.acres} acres, ${f.crop}, ${f.zone}${f.priority?', priority':''}${f.excluded?', hold':''}`).join('\n');
    if(id==='rigs')return profile.rigs.map(r=>`${r.name}, ${r.acres_per_hour} acres/hour`).join('\n');
    if(id==='crew')return profile.crew.map(c=>`${c.name}, ${c.certifications.join('+')}`).join('\n');
    if(id==='workday')return `${formatTime(profile.workday.start)}–${formatTime(profile.workday.end)}`;
    if(id==='rules')return `${profile.rules.rainfast_minutes} minutes dry, ${profile.rules.wind_limit_mph} mph`;
    if(id==='preferences')return profile.preferences.priority;
    if(id==='notes')return profile.notes||'none';
    return profile[id];
  }
  function exampleProfile(){return {id:uid(),version:1,farm_name:'Wabash Valley example farm',location:'Tippecanoe County, Indiana',fields:[
    {id:'F01',name:'North 40',acres:40,crop:'corn',zone:'north',priority:true,excluded:false},
    {id:'F02',name:'Creek field',acres:62,crop:'soybeans',zone:'east',priority:false,excluded:true},
    {id:'F03',name:'West 80',acres:80,crop:'corn',zone:'west',priority:true,excluded:false},
    {id:'F04',name:'South pasture',acres:35,crop:'soybeans',zone:'south',priority:false,excluded:false},
    {id:'F05',name:'Home field',acres:51,crop:'corn',zone:'central',priority:false,excluded:false},
    {id:'F06',name:'East 60',acres:60,crop:'soybeans',zone:'east',priority:true,excluded:false}],
    rigs:[1,2,3,4].map((n)=>({id:`R${n}`,name:`Rig ${n}`,acres_per_hour:[80,75,85,70][n-1]})),
    crew:['Avery','Morgan','Jordan','Casey','Taylor','Riley'].map((name,i)=>({id:`C${i+1}`,name,certifications:i%2?['standard']:['standard','special']})),
    workday:{start:480,end:1080},rules:{rainfast_minutes:90,wind_limit_mph:15},preferences:{priority:'balanced'},notes:'Example only. Creek field remains on hold. Zones describe a schematic layout; entrance locations and product rules need verification.'};}
  class OnboardingStore {
    constructor(storage) {
      this.warning=null;this.storage=null;this.state={version:1,profile:null,draft:emptyDraft()};
      try {
        this.storage=storage===undefined?global.localStorage:storage;
        if(!this.storage)throw new Error('Storage unavailable');
        const raw=this.storage.getItem(KEY);
        if(raw){
          const parsed=JSON.parse(raw),draft=parsed?.draft;
          if(parsed?.version!==1||!draft||!Number.isInteger(draft.step)||draft.step<0||draft.step>=steps.length||typeof draft.id!=='string'||!PROFILE_ID.test(draft.id)||!draft.answers||Array.isArray(draft.answers)||typeof draft.answers!=='object'||typeof draft.composer!=='string'||draft.composer.length>12000||typeof draft.editing!=='boolean'||typeof draft.review!=='boolean')throw new Error('Invalid saved onboarding');
          const values={};
          for(const [id,answer] of Object.entries(draft.answers)){if(typeof answer!=='string')throw new Error('Invalid saved answer');values[id]=parseAnswer(id,answer);}
          if((draft.review||draft.editing)&&Object.keys(values).length!==steps.length)throw new Error('Incomplete saved review');
          this.state={version:1,profile:parsed.profile?validateProfile(parsed.profile):null,draft:{id:draft.id,answers:clone(draft.answers),values,step:draft.step,editing:draft.editing,review:draft.review,composer:draft.composer}};
        }
      }catch(_error){this.storage=null;this.warning='The browser could not read a saved farm profile. This session can continue, but changes may not survive reload; existing saved data has not been overwritten.';}
    }
    save(){if(this.storage){try{this.storage.setItem(KEY,JSON.stringify(this.state));}catch(_error){this.storage=null;this.warning='The browser could not save this farm profile. Export a copy before closing this tab.';}}}
    snapshot(){return clone(this.state);}
    answer(value){const draft=this.state.draft,step=steps[draft.step],parsed=parseAnswer(step.id,value);if(step.id==='crew'&&parsed.length<(draft.values.rigs?.length||0))throw new Error('Add at least one named applicator for each sprayer; roster order sets the assignments.');draft.values[step.id]=parsed;draft.answers[step.id]=String(value).trim();draft.composer='';if(draft.editing){draft.editing=false;draft.review=true;}else if(draft.step===steps.length-1){draft.review=true;}else draft.step++;this.save();return this.snapshot();}
    edit(index){if(!Number.isInteger(index)||index<0||index>=steps.length)throw new Error('Choose a profile section.');this.state.draft.step=index;this.state.draft.editing=Object.keys(this.state.draft.values).length===steps.length;this.state.draft.review=false;this.state.draft.composer=this.state.draft.answers[steps[index].id]||'';this.save();}
    back(){if(this.state.draft.step>0)this.edit(this.state.draft.step-1);}
    candidate(){return validateProfile({id:this.state.draft.id,version:1,...clone(this.state.draft.values)});}
    confirm(){const profile=this.candidate();this.state.profile=profile;this.save();return clone(profile);}
    loadProfile(profile){const validated=validateProfile(profile);this.state.draft={id:validated.id,answers:{},values:{},step:steps.length-1,editing:false,review:true,composer:''};for(const step of steps){this.state.draft.answers[step.id]=answerFromProfile(validated,step.id);this.state.draft.values[step.id]=clone(validated[step.id]);}this.save();}
    reset(){this.state.draft=emptyDraft();this.save();}
  }
  class FieldworkOnboarding {
    constructor(root,callbacks={}) {
      this.root=root;this.callbacks=callbacks;this.store=new OnboardingStore();this.data={offline:false,busy:false,activeProfileId:null,activeProfile:null,error:''};this.error='';this.notice='';this.lastReply=null;this.applying=false;
      root.addEventListener('click',event=>this.click(event));
      root.addEventListener('submit',event=>{if(event.target.matches('.farm-chat-composer')){event.preventDefault();this.submit();}});
      root.addEventListener('input',event=>{if(event.target.id==='farm-chat-answer'){this.store.state.draft.composer=event.target.value;clearTimeout(this.saveTimer);this.saveTimer=setTimeout(()=>this.store.save(),300);}});
      root.addEventListener('keydown',event=>{if(event.target.id==='farm-chat-answer'&&(event.metaKey||event.ctrlKey)&&event.key==='Enter'){event.preventDefault();this.submit();}});
      this.render();
    }
    getProfile(){return clone(this.store.state.profile);}
    getState(){return this.store.snapshot();}
    recoverableProfile(){
      const draft=this.store.state.draft;
      if(this.store.state.profile||Object.keys(draft.answers).length||Object.keys(draft.values).length||draft.composer.trim())return null;
      try{return this.data.activeProfile?validateProfile(this.data.activeProfile):null;}catch(_error){return null;}
    }
    render(data={}) {
      this.data={...this.data,...data};const d=this.store.state.draft,step=steps[d.step],profile=this.store.state.profile;
      const active=document.activeElement,focused=this.root.contains(active)&&active?.id==='farm-chat-answer';
      const selection=focused?[active.selectionStart,active.selectionEnd]:null;
      const focusButton=this.root.contains(active)&&active?.tagName==='BUTTON'?['farmAction','farmStep','farmChoice'].map(key=>[key,active.dataset[key]]).find(([,value])=>value!==undefined):null;
      const filled=Object.keys(d.values).length;const blocked=this.data.busy||this.applying;
      const warning=this.store.warning?`<p class="farm-chat-warning" role="status">${esc(this.store.warning)}</p>`:'';
      this.root.innerHTML=`<section class="farm-onboarding" aria-label="Farm profile onboarding" aria-busy="${blocked}"><div class="farm-onboarding-header"><div><h2>Your farm, in your words.</h2><p>Build a profile together, then check every detail before planning.</p></div><span class="farm-local-label">Guided local chat</span></div>${warning}${profile?`<div class="farm-saved-profile"><div><strong>Saved: ${esc(profile.farm_name)}</strong><span>${profile.fields.length} fields · ${profile.rigs.length} sprayers · ${profile.crew.length} applicators</span></div><button type="button" data-farm-action="saved" ${blocked?'disabled':''}>Review saved profile</button></div>`:''}
      <div class="farm-onboarding-layout"><div class="farm-chat-main"><div class="farm-chat-progress"><span>${d.review?'Review your farm profile':`Question ${d.step+1} of ${steps.length} · ${esc(step.title)}`}</span><progress value="${filled}" max="${steps.length}" aria-label="Answered onboarding sections">${filled}/${steps.length}</progress></div>
      ${d.review?this.review():`<div class="farm-chat-thread" role="log" aria-label="Farm onboarding conversation" aria-live="polite" aria-relevant="additions text">${this.conversation()}<div class="farm-chat-message is-assistant is-current"><span class="farm-chat-speaker">Fieldwork guide</span><h3 id="farm-chat-question">${esc(step.question)}</h3><p id="farm-chat-hint">${esc(step.hint)}</p></div>${this.error?`<div class="farm-chat-message is-assistant is-clarification"><span class="farm-chat-speaker">Fieldwork guide</span><p id="farm-chat-error" role="alert">${esc(clarificationFor(step.id,this.error))}</p></div>`:''}</div><form class="farm-chat-composer"><label id="farm-chat-label" for="farm-chat-answer">Your answer</label>${step.id==='preferences'?`<div class="farm-preference-choices">${Object.entries(priorities).map(([key,label])=>`<button type="button" data-farm-choice="${key}" ${blocked?'disabled':''}>${label}</button>`).join('')}</div>`:''}<textarea id="farm-chat-answer" aria-labelledby="farm-chat-question farm-chat-label" aria-describedby="farm-chat-hint${this.error?' farm-chat-error':''}" aria-invalid="${!!this.error}" rows="${step.rows}" maxlength="12000" placeholder="${esc(step.placeholder)}" ${blocked?'disabled':''}>${esc(d.composer||'')}</textarea><div class="farm-composer-actions"><button type="button" class="farm-secondary" data-farm-action="back" ${!d.step||blocked?'disabled':''}>Back</button><span>Enter one answer at a time</span><button class="primary-button" type="submit" ${blocked?'disabled':''}>${d.editing?'Save correction':'Send answer'}</button></div></form>`}
      ${(d.review&&this.error)||this.data.error?`<p ${d.review?'id="farm-chat-error"':''} class="farm-chat-error" role="alert">${esc((d.review&&this.error)||this.data.error)}</p>`:''}${this.notice?`<p class="farm-chat-notice" role="status">${esc(this.notice)}</p>`:''}</div>
      <aside class="farm-chat-sidebar"><h3>What we’ll capture</h3><ol>${steps.map((item,index)=>`<li class="${d.values[item.id]!==undefined?'is-complete':''}"><button type="button" data-farm-step="${index}" ${d.values[item.id]===undefined||blocked?'disabled':''}><span aria-hidden="true">${d.values[item.id]!==undefined?'✓':index+1}</span>${esc(item.title)}</button></li>`).join('')}</ol><p><strong>You stay in control.</strong> The guide recognizes the formats shown. It asks for clarification when an answer is unclear instead of guessing.</p><p>Zones create a schematic map. Notes are saved for review; gates, buffers, real roads and product rules still need verification.</p><div class="farm-sidebar-actions">${this.recoverableProfile()?`<button type="button" data-farm-action="active" ${blocked?'disabled':''}>Review active farm</button>`:''}<button type="button" data-farm-action="example" ${blocked?'disabled':''}>Try an example farm</button><button type="button" data-farm-action="restart" ${blocked?'disabled':''}>Start a new draft</button><button type="button" data-farm-action="demo" ${blocked?'disabled':''}>Return to demo farm</button></div></aside></div></section>`;
      if(focused){const input=this.root.querySelector('#farm-chat-answer');input?.focus({preventScroll:true});if(input&&selection)input.setSelectionRange(...selection);}
      else if(focusButton){const [key,value]=focusButton;const attr=key.replace(/[A-Z]/g,letter=>'-'+letter.toLowerCase());this.root.querySelector(`[data-${attr}="${value}"]`)?.focus({preventScroll:true});}
    }
    conversation(){const d=this.store.state.draft,answered=steps.slice(0,d.step).filter(step=>d.answers[step.id]!==undefined).slice(-2);return answered.map((step,index)=>`<div class="farm-chat-message is-user"><span class="farm-chat-speaker">You · ${esc(step.title)}</span><p>${esc(d.answers[step.id])}</p></div><div class="farm-chat-message is-assistant is-reply" ${index===answered.length-1?'data-farm-latest-reply':''}><span class="farm-chat-speaker">Fieldwork guide</span><p>${esc(replyFor(step.id,d.values[step.id],d.values))}</p></div>`).join('');}
    review(){
      const d=this.store.state.draft,p={...d.values};const blocked=this.data.busy||this.applying;let invalid='';try{this.store.candidate();}catch(error){invalid=error.message;}
      const edit=(index)=>`<button type="button" class="farm-review-edit" data-farm-step="${index}" aria-label="Edit ${esc(steps[index].title.toLowerCase())}" ${blocked?'disabled':''}>Edit</button>`;
      return `<div class="farm-profile-review" tabindex="-1" aria-label="Review farm profile">${this.lastReply?`<div class="farm-chat-message is-assistant is-reply farm-review-reply" data-farm-latest-reply role="status"><span class="farm-chat-speaker">Fieldwork guide</span><p>${esc(this.lastReply.text)}</p></div>`:''}<div class="farm-chat-message is-assistant"><span class="farm-chat-speaker">Fieldwork guide</span><h3>Does this describe your operation?</h3><p>Check the assignments and assumptions. Nothing changes on the planning board until you choose to use this profile.</p></div>
      <div class="farm-review-section"><header><h3>${esc(p.farm_name||'Farm name')}</h3>${edit(0)}</header><p>${esc(p.location||'Add a location')} ${edit(1)}</p></div>
      <div class="farm-review-section"><header><h3>Fields & schematic layout</h3>${edit(2)}</header><ul class="farm-field-review">${(p.fields||[]).map(f=>`<li><strong>${esc(f.name)}</strong><span>${f.acres} acres · ${esc(f.crop)} · ${esc(f.zone)}</span><small>${f.priority?'Priority ':''}${f.excluded?'On hold · excluded from planning':''}</small></li>`).join('')}</ul></div>
      <div class="farm-review-section"><header><h3>Sprayers & fixed operators</h3>${edit(3)}</header><ul class="farm-roster-review">${(p.rigs||[]).map((r,i)=>`<li><strong>${esc(r.name)}</strong><span>${r.acres_per_hour} acres/hour · ${esc(p.crew?.[i]?.name||'Missing operator')}</span></li>`).join('')}</ul><header><h4>Applicator eligibility</h4>${edit(4)}</header><p>${(p.crew||[]).map((c,i)=>`${esc(c.name)}: ${esc(c.certifications.join(' + '))}${i>=(p.rigs?.length||0)?' (reserve)':''}`).join('; ')}</p></div>
      <div class="farm-review-section"><header><h3>Working hours</h3>${edit(5)}</header><p>${p.workday?`${formatTime(p.workday.start)}–${formatTime(p.workday.end)}`:'Add working hours'} · shared shift</p><header><h4>Shared planning assumptions</h4>${edit(6)}</header><p>${p.rules?`${p.rules.rainfast_minutes} minutes required dry time · ${p.rules.wind_limit_mph} mph wind limit`:'Add assumptions'}</p><small>Demo assumptions only. Confirm product-specific requirements separately.</small></div>
      <div class="farm-review-section"><header><h3>Local knowledge</h3>${edit(7)}</header><p class="farm-notes">${esc(p.notes||'No additional notes.')}</p><small>Saved context only; these notes do not automatically change route or application constraints.</small></div>
      <div class="farm-review-section"><header><h3>Comparison preference</h3>${edit(8)}</header><p>${esc(priorities[p.preferences?.priority]||'Choose a preference')}</p></div>
      ${invalid?`<p class="farm-chat-error" role="alert">${esc(invalid)}</p>`:''}<div class="farm-review-confirm"><p>A changed farm setup starts a separate planning session; existing work logs are retained.</p><p>${this.data.offline?'This offline file can save your profile for export. It continues to show recorded demo plans; use the local solver edition to plan your farm.':'Your field roster, capacities, shared hours, priority flags and explicit holds will be used by the local planner. Weather and map travel remain illustrative.'}</p><div><button type="button" class="primary-button" data-farm-action="apply" ${invalid||blocked?'disabled':''}>${this.applying?'Applying profile…':this.data.offline?'Confirm & save profile':'Confirm & use this farm'}</button><button type="button" class="farm-secondary" data-farm-action="export" ${invalid||blocked?'disabled':''}>Export profile</button></div></div></div>`;
    }
    submit(){if(this.data.busy||this.applying)return;const id=steps[this.store.state.draft.step].id;try{this.store.answer(this.root.querySelector('#farm-chat-answer')?.value||'');this.lastReply={id,text:replyFor(id,this.store.state.draft.values[id],this.store.state.draft.values)};this.error='';this.notice='';}catch(error){this.error=error.message;this.lastReply=null;}this.render();if(!this.store.state.draft.review){this.root.querySelector('#farm-chat-answer')?.focus({preventScroll:true});this.root.querySelector(this.error?'#farm-chat-error':'[data-farm-latest-reply]')?.scrollIntoView({block:'start',behavior:'instant'});}else this.root.querySelector('.farm-profile-review')?.scrollIntoView({block:'start',behavior:'instant'});}
    async apply(){if(this.data.busy||this.applying)return;this.error='';this.notice='';try{const profile=this.store.confirm();this.applying=true;this.render();await this.callbacks.onApply?.(profile);this.notice=this.data.offline?'Farm profile saved for export. Recorded demo plans are unchanged.':this.data.error?'Your profile remains saved and editable. Resolve the issue above, then confirm again.':'Farm profile saved. Review the planning board for the current proposal.';}catch(error){this.error=error.message||String(error);this.notice='Your profile remains saved and editable. Resolve the issue above, then confirm again.';}finally{this.applying=false;this.render();}}
    click(event){const button=event.target.closest('button');if(!button||!this.root.contains(button)||button.disabled)return;const action=button.dataset.farmAction;if(!action&&button.dataset.farmChoice===undefined&&button.dataset.farmStep===undefined)return;try{
      this.error='';this.notice='';this.lastReply=null;
      if(button.dataset.farmChoice){this.store.answer(button.dataset.farmChoice);this.lastReply={id:'preferences',text:replyFor('preferences',this.store.state.draft.values.preferences,this.store.state.draft.values)};this.render();this.root.querySelector('.farm-profile-review')?.focus();return;}
      if(button.dataset.farmStep!==undefined){this.store.edit(+button.dataset.farmStep);this.render();this.root.querySelector('#farm-chat-answer')?.focus();return;}
      if(action==='apply'){void this.apply();return;}
      if(action==='back')this.store.back();
      else if(action==='example'){this.store.loadProfile(exampleProfile());this.notice='Example values are for demonstration. Edit them before using them as your own farm.';}
      else if(action==='restart'){this.store.reset();this.notice='New draft started. Your previously confirmed farm profile is still saved.';}
      else if(action==='saved'&&this.store.state.profile)this.store.loadProfile(this.store.state.profile);
      else if(action==='active'){const profile=this.recoverableProfile();if(profile){this.store.loadProfile(profile);this.notice='The active farm is ready to review. Confirm the profile to save these details here.';}}
      else if(action==='export'){const profile=this.store.candidate();if(this.callbacks.onExport)this.callbacks.onExport(profile);else{const blob=new Blob([JSON.stringify(profile,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='fieldwork-farm-profile.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}this.notice='Profile exported for review and backup.';}
      else if(action==='demo'){const result=this.callbacks.onUseDemo?.();if(result?.catch)result.catch(error=>{this.error=error.message||String(error);this.render();});}
      this.render();
      if(action==='saved'||action==='example'||action==='active')this.root.querySelector('.farm-profile-review')?.focus();
      if(action==='restart'||action==='back')this.root.querySelector('#farm-chat-answer')?.focus();
    }catch(error){this.error=error.message||String(error);this.render();}}
  }
  FieldworkOnboarding.Store=OnboardingStore;
  FieldworkOnboarding.parseAnswer=parseAnswer;
  FieldworkOnboarding.replyFor=replyFor;
  FieldworkOnboarding.validateProfile=validateProfile;
  FieldworkOnboarding.exampleProfile=exampleProfile;
  FieldworkOnboarding.steps=steps.map(step=>({...step}));
  global.FieldworkOnboarding=FieldworkOnboarding;
  if(typeof module!=='undefined'&&module.exports)module.exports=FieldworkOnboarding;
})(typeof window!=='undefined'?window:globalThis);
