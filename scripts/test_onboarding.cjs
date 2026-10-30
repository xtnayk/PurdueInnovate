const assert = require('node:assert/strict');
const Onboarding = require('../web/farm-onboarding.js');
const parse = Onboarding.parseAnswer;
let checks=0;
function test(name,fn){fn();checks++;console.log(`✓ ${name}`);}
function memory(){const data=new Map();return {data,getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};}
const key='fieldwork:farm-onboarding:v1';

test('fields preserve order, exact acreage, priority and explicit holds',()=>{
  const fields=parse('fields','North 40, 40 acres, corn, north, priority\nCreek, 62 ac, soybeans, east, hold');
  assert.deepEqual(fields[0],{id:'F01',name:'North 40',acres:40,crop:'corn',zone:'north',priority:true,excluded:false});
  assert.equal(fields[1].excluded,true);assert.equal(fields[1].id,'F02');
});
test('field parser refuses ambiguous data instead of inferring constraints',()=>{
  for(const input of ['the north field is 40 acres','North, forty, corn, north','North, 40.5, corn, north','North, 501, corn, north','North, 40, corn, northeast','North, 40, corn, north, avoid orchard','North, 40, corn, north, priority, priority','N, 40, corn, north\nn, 30, corn, east'])assert.throws(()=>parse('fields',input));
  assert.throws(()=>parse('fields',Array.from({length:41},(_,i)=>`F${i},1,corn,north`).join('\n')));
});
test('sprayer capacity has defined units and a four-rig limit',()=>{
  assert.equal(parse('rigs','Rig 1, 80 acres/hour')[0].acres_per_hour,80);
  for(const value of ['Rig 1, 80 mph','Rig 1, 0 acres/hour','Rig 1, 80.2 acres/hour',Array.from({length:5},(_,i)=>`Rig ${i},80`).join('\n')])assert.throws(()=>parse('rigs',value));
});
test('crew credentials must be known demo labels',()=>{
  assert.deepEqual(parse('crew','Avery, special+standard')[0].certifications,['standard','special']);
  for(const value of ['Avery, certified','Avery, special','Avery, standard+special+special'])assert.throws(()=>parse('crew',value));
});
test('workday supports explicit AM/PM only within the modeled day',()=>{
  assert.deepEqual(parse('workday','8:30am to 6pm'),{start:510,end:1080});
  for(const value of ['8-6','7am-6pm','8am-9pm','6pm-8am','8:61am-6pm'])assert.throws(()=>parse('workday',value));
});
test('rainfast and wind assumptions enforce bounds',()=>{
  assert.deepEqual(parse('rules','90 minutes dry, 15 mph'),{rainfast_minutes:90,wind_limit_mph:15});
  for(const value of ['two hours dry','90 minutes dry, 30 mph','0 min dry, 15 mph','361 min dry, 1 mph'])assert.throws(()=>parse('rules',value));
});
test('local notes are retained as text and unknown preferences are rejected',()=>{
  assert.equal(parse('notes','Do not use the south gate.'),'Do not use the south gate.');assert.equal(parse('notes','none'),'');
  assert.deepEqual(parse('preferences','buffer'),{priority:'buffer'});assert.throws(()=>parse('preferences','do whatever'));
});
test('location and profile IDs match the backend boundaries',()=>{
  assert.equal(parse('location','L'.repeat(200)).length,200);assert.throws(()=>parse('location','L'.repeat(201)));
  const p=Onboarding.exampleProfile();p.id='A_b-9'.repeat(16);assert.equal(Onboarding.validateProfile(p).id.length,80);
  for(const id of ['A'.repeat(81),'farm id','farm/one','farm.id','']){p.id=id;assert.throws(()=>Onboarding.validateProfile(p));}
  p.id='valid_farm-1';p.location='L'.repeat(201);assert.throws(()=>Onboarding.validateProfile(p));
});
test('example profile is valid, with four rigs, six crew and an explicit held field',()=>{
  const p=Onboarding.validateProfile(Onboarding.exampleProfile());assert.equal(p.rigs.length,4);assert.equal(p.crew.length,6);assert.equal(p.fields.filter(f=>f.excluded).length,1);
});
test('loading example data does not confirm or activate a profile',()=>{
  const store=new Onboarding.Store(memory());store.loadProfile(Onboarding.exampleProfile());assert.equal(store.state.profile,null);assert.equal(store.state.draft.review,true);assert.equal(Object.keys(store.state.draft.values).length,9);
});
test('review edits, resets and reloads preserve the last confirmed profile',()=>{
  const storage=memory(),store=new Onboarding.Store(storage);store.loadProfile(Onboarding.exampleProfile());const confirmed=store.confirm();store.edit(0);store.answer('Changed farm');
  assert.equal(store.state.profile.farm_name,confirmed.farm_name);assert.equal(store.candidate().farm_name,'Changed farm');assert.equal(store.candidate().id,confirmed.id);
  const resumed=new Onboarding.Store(storage);assert.equal(resumed.candidate().farm_name,'Changed farm');assert.equal(resumed.state.profile.farm_name,confirmed.farm_name);
  resumed.reset();assert.equal(resumed.state.profile.id,confirmed.id);assert.notEqual(resumed.state.draft.id,confirmed.id);assert.deepEqual(resumed.state.draft.values,{});
});
test('complete conversational flow creates typed values and validates crew count early',()=>{
  const store=new Onboarding.Store(memory());store.answer('My farm');store.answer('Indiana');store.answer('A, 10, corn, north');store.answer('Rig 1, 80\nRig 2, 75');
  assert.throws(()=>store.answer('Avery, standard'));assert.equal(store.state.draft.step,4);
  store.answer('Avery, standard\nMorgan, standard');store.answer('8am-6pm');store.answer('90 minutes dry, 15 mph');store.answer('none');store.answer('balanced');assert.equal(store.state.draft.review,true);assert.equal(store.confirm().fields[0].acres,10);
});
test('profile validator rejects numeric strings and missing credentials',()=>{
  const p=Onboarding.exampleProfile();p.fields[0].acres='40';assert.throws(()=>Onboarding.validateProfile(p));p.fields[0].acres=40;delete p.crew[0].certifications;assert.throws(()=>Onboarding.validateProfile(p));
});
test('storage denial keeps a functional draft and exposes a warning',()=>{
  const store=new Onboarding.Store({getItem(){throw new Error('denied');}});store.answer('Farm');assert.match(store.warning,/could not read/);assert.equal(store.state.draft.values.farm_name,'Farm');
});
test('storage quota failure preserves in-memory profile and asks for export',()=>{
  const store=new Onboarding.Store({getItem(){return null;},setItem(){throw new Error('quota');}});store.loadProfile(Onboarding.exampleProfile());const p=store.confirm();assert.equal(p.rigs.length,4);assert.match(store.warning,/Export a copy/);
});
test('corrupt saved state is not overwritten',()=>{
  const storage=memory();storage.setItem(key,'{"version":1,"draft":{"step":0,"answers":null}}');const original=storage.getItem(key),store=new Onboarding.Store(storage);store.answer('New farm');assert.ok(store.warning);assert.equal(storage.getItem(key),original);
});
test('restoration rebuilds typed answers rather than trusting cached values',()=>{
  const storage=memory(),store=new Onboarding.Store(storage);store.answer('Real farm');const raw=JSON.parse(storage.getItem(key));raw.draft.values.farm_name='<fake>';storage.setItem(key,JSON.stringify(raw));assert.equal(new Onboarding.Store(storage).state.draft.values.farm_name,'Real farm');
});
test('assistant replies summarize confirmed values for all nine sections',()=>{
  const p=Onboarding.exampleProfile(),reply=Onboarding.replyFor;
  assert.match(reply('farm_name','Orchard Creek'),/Orchard Creek/);
  assert.match(reply('location','West Lafayette'),/West Lafayette/);
  const fields=reply('fields',p.fields,p);assert.match(fields,/6 fields totaling 328 acres/);assert.match(fields,/3 fields are marked priority/);assert.match(fields,/1 field is on hold/);
  const rigs=reply('rigs',p.rigs,p);assert.match(rigs,/4 sprayers/);assert.match(rigs,/Rig 2 at 75 acres\/hour/);
  const crew=reply('crew',p.crew,p);assert.match(crew,/6 applicators/);assert.match(crew,/Avery on Rig 1/);assert.match(crew,/2 people will be listed as reserves/);assert.match(crew,/not verified licenses/);
  assert.match(reply('workday',p.workday,p),/8:00am to 6:00pm/);
  assert.match(reply('rules',p.rules,p),/90 minutes.*15 mph/);
  assert.match(reply('notes',p.notes,p),/do not change routes automatically/);
  assert.match(reply('notes','',p),/No extra access notes/);
  for(const priority of ['balanced','acres','cost','buffer'])assert.doesNotMatch(reply('preferences',{priority},p),/undefined/);
  assert.match(reply('preferences',{priority:'cost'},p),/lowest first.*ready to review/);
});

// Minimal DOM surface: exercise rendered contracts and asynchronous integration state.
function renderFixture(callbacks={},storage=memory()){
  global.localStorage=storage;
  const root={innerHTML:'',addEventListener(){},contains(){return false;},querySelector(){return null;}};
  return {root,ui:new Onboarding(root,callbacks)};
}
(async()=>{
  const originalDocument=global.document,originalStorage=Object.getOwnPropertyDescriptor(global,'localStorage');
  global.document={activeElement:null};Object.defineProperty(global,'localStorage',{value:memory(),writable:true,configurable:true});
  try {
    test('active profile recovery is explicit and does not mutate on render',()=>{
      const {root,ui}=renderFixture(),profile=Onboarding.exampleProfile(),before=ui.getState();ui.render({activeProfile:profile,activeProfileId:profile.id});
      assert.match(root.innerHTML,/Review active farm/);assert.deepEqual(ui.getState(),before);assert.equal(ui.getProfile(),null);
      const button={dataset:{farmAction:'active'},disabled:false};root.contains=node=>node===button;ui.click({target:{closest:()=>button}});
      assert.equal(ui.getState().draft.review,true);assert.equal(ui.store.candidate().id,profile.id);assert.equal(ui.getProfile(),null);assert.doesNotMatch(root.innerHTML,/Review active farm/);
    });
    test('active recovery never replaces a saved profile or started draft',()=>{
      const profile=Onboarding.exampleProfile();
      for(const setup of [ui=>ui.store.answer('My draft'),ui=>{ui.store.state.draft.composer='Unsaved idea';},ui=>{ui.store.loadProfile(Onboarding.exampleProfile());ui.store.confirm();ui.store.reset();}]){
        const {root,ui}=renderFixture();setup(ui);const before=ui.getState();ui.render({activeProfile:profile});assert.doesNotMatch(root.innerHTML,/Review active farm/);assert.deepEqual(ui.getState(),before);
        const button={dataset:{farmAction:'active'},disabled:false};root.contains=node=>node===button;ui.click({target:{closest:()=>button}});assert.deepEqual(ui.getState(),before);
      }
    });
    test('explicit active recovery leaves corrupt saved bytes untouched',()=>{
      const storage=memory();storage.setItem(key,'broken json');const {root,ui}=renderFixture({},storage),profile=Onboarding.exampleProfile();ui.render({activeProfile:profile});assert.match(root.innerHTML,/Review active farm/);assert.equal(storage.getItem(key),'broken json');
      const button={dataset:{farmAction:'active'},disabled:false};root.contains=node=>node===button;ui.click({target:{closest:()=>button}});assert.equal(ui.store.candidate().id,profile.id);assert.equal(storage.getItem(key),'broken json');assert.equal(ui.getProfile(),null);
    });
    test('native submit and unrelated button clicks do not rerender before submission',()=>{
      const {root,ui}=renderFixture();const before=ui.getState(),markup=root.innerHTML;ui.error='Keep validation until submit';let renders=0;const render=ui.render;ui.render=()=>{renders++;};
      for(const type of ['submit','button']){const button={type,dataset:{},disabled:false};root.contains=node=>node===button;ui.click({target:{closest:()=>button}});}
      assert.equal(renders,0);assert.equal(root.innerHTML,markup);assert.deepEqual(ui.getState(),before);assert.equal(ui.error,'Keep validation until submit');ui.render=render;
    });
    test('render gives the input a question, hint and validation error description',()=>{
      const {root,ui}=renderFixture();ui.error='Please enter a farm name.';ui.render();
      assert.match(root.innerHTML,/aria-labelledby="farm-chat-question farm-chat-label"/);
      assert.match(root.innerHTML,/aria-describedby="farm-chat-hint farm-chat-error"/);
      assert.match(root.innerHTML,/aria-invalid="true"/);
    });
    test('conversation answers the farmer before asking the next question',()=>{
      const {root,ui}=renderFixture();ui.store.answer('Orchard Creek');ui.render();
      assert.match(root.innerHTML,/I’ll call your operation Orchard Creek/);
      assert.match(root.innerHTML,/Where is your operation based/);
      assert.ok(root.innerHTML.indexOf('I’ll call your operation Orchard Creek')<root.innerHTML.indexOf('Where is your operation based'));
      assert.match(root.innerHTML,/data-farm-latest-reply/);assert.doesNotMatch(root.innerHTML,/Captured for your review/);
    });
    test('invalid answers receive a clarification without losing prior answers or input',()=>{
      const {root,ui}=renderFixture();ui.store.answer('Orchard Creek');ui.store.answer('Indiana');ui.store.state.draft.composer='North field is huge';
      const input={value:'North field is huge',focus(){}};root.querySelector=selector=>selector==='#farm-chat-answer'?input:null;
      ui.submit();assert.equal(ui.getState().draft.step,2);assert.equal(ui.getState().draft.values.farm_name,'Orchard Creek');assert.equal(ui.getState().draft.composer,input.value);
      assert.match(root.innerHTML,/is-clarification/);assert.match(root.innerHTML,/I need a name, acreage, crop and zone/);assert.match(root.innerHTML,/Your previous answers are still saved/);
      assert.equal((root.innerHTML.match(/id="farm-chat-error"/g)||[]).length,1);
    });
    test('assistant replies escape farmer supplied names',()=>{
      const {root,ui}=renderFixture();ui.store.answer('<img src=x onerror=alert(1)>');ui.render();
      assert.doesNotMatch(root.innerHTML,/<img/);assert.match(root.innerHTML,/I’ll call your operation &lt;img/);
    });
    test('final preference and corrections get a reply in profile review',()=>{
      const {root,ui}=renderFixture();ui.store.loadProfile(Onboarding.exampleProfile());ui.store.edit(8);
      const button={dataset:{farmChoice:'cost'},disabled:false};root.contains=node=>node===button;ui.click({target:{closest:()=>button}});
      assert.match(root.innerHTML,/rank feasible plans by estimated cost, lowest first/);assert.match(root.innerHTML,/Does this describe your operation/);
      ui.store.edit(0);ui.store.state.draft.composer='Corrected name';const input={value:'Corrected name',focus(){}};root.querySelector=selector=>selector==='#farm-chat-answer'?input:null;
      ui.submit();assert.match(root.innerHTML,/I’ll call your operation Corrected name/);assert.equal(ui.getProfile(),null);
    });
    test('same-id edits remain reviewable and do not claim they are already active',()=>{
      const {root,ui}=renderFixture();const profile=Onboarding.exampleProfile();ui.store.loadProfile(profile);ui.store.confirm();ui.store.edit(0);ui.store.answer('Revised operation');
      ui.render({activeProfileId:profile.id});assert.match(root.innerHTML,/Revised operation/);assert.doesNotMatch(root.innerHTML,/already active|currently active/i);
      assert.match(root.innerHTML,/aria-label="Edit farm name"/);assert.match(root.innerHTML,/data-farm-action="apply" >Confirm &amp; use this farm|data-farm-action="apply" >Confirm & use this farm/);
    });
    test('review escapes user content instead of injecting it as HTML',()=>{
      const {root,ui}=renderFixture();const profile=Onboarding.exampleProfile();profile.farm_name='<img src=x onerror=alert(1)>';profile.notes='<script>alert(1)</script>';ui.store.loadProfile(profile);ui.render();assert.doesNotMatch(root.innerHTML,/<img src=x|<script>/);assert.match(root.innerHTML,/&lt;script&gt;/);
    });
    {
      const {root,ui}=renderFixture({onApply:async()=>{ui.render({error:'The local solver is unavailable.',busy:false});}});ui.store.loadProfile(Onboarding.exampleProfile());await ui.apply();
      assert.equal(ui.applying,false);assert.ok(ui.getProfile());assert.match(root.innerHTML,/local solver is unavailable/);assert.match(root.innerHTML,/remains saved and editable/);assert.doesNotMatch(root.innerHTML,/planning board can now use/);
      ui.store.edit(0);ui.store.answer('Retry-ready farm');assert.equal(ui.store.candidate().farm_name,'Retry-ready farm');checks++;console.log('✓ resolved backend failure keeps the profile editable without a success claim');
    }
    {
      const {root,ui}=renderFixture({onApply:async()=>{throw new Error('Server rejected profile');}});ui.store.loadProfile(Onboarding.exampleProfile());await ui.apply();assert.ok(ui.getProfile());assert.equal(ui.applying,false);assert.match(root.innerHTML,/Server rejected profile/);assert.match(root.innerHTML,/remains saved and editable/);checks++;console.log('✓ rejected backend callback preserves the saved profile and releases controls');
    }
    {
      const {root,ui}=renderFixture();ui.store.loadProfile(Onboarding.exampleProfile());ui.render({offline:true});await ui.apply();assert.match(root.innerHTML,/Recorded demo plans are unchanged/);assert.match(root.innerHTML,/Confirm & save profile/);checks++;console.log('✓ offline confirmation makes no custom-planning claim');
    }
  } finally {if(originalDocument===undefined)delete global.document;else global.document=originalDocument;if(originalStorage===undefined)delete global.localStorage;else Object.defineProperty(global,'localStorage',originalStorage);}
  console.log(`${checks} onboarding checks passed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
