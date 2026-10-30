// Run on the served prototype via gstack browse eval. Local demo changes only.
return await (async () => {
  const checks = [];
  const el = (s) => document.querySelector(s);
  const assert = (condition, message) => {if (!condition) throw new Error(message);checks.push(message);};
  const wait = async (predicate, label) => {const started=Date.now();while(!predicate()){if(Date.now()-started>20000)throw new Error('Timed out: '+label);await new Promise(resolve=>setTimeout(resolve,30));}};
  const ready = () => !document.body.classList.contains('busy');
  const text = (value) => {el('#crew-message').value=value;el('#crew-message').dispatchEvent(new Event('input',{bubbles:true}));};
  await wait(ready,'initial planning');
  assert(document.querySelectorAll('.option-card').length===3,'Initial storm returns three plan cards');
  el('[data-scenario="breakdown"]').click();
  assert(el('#approve-button').disabled,'Changing a scenario disables approval');
  el('#replan-button').click();await wait(ready,'breakdown');
  assert(!el('#approve-button').disabled,'A current result enables review');
  document.querySelectorAll('[data-plan]')[1].click();
  assert(document.querySelectorAll('.option-card.selected').length===1,'Exactly one plan is selected');
  el('#approve-button').click();assert(el('#approval-dialog').open,'Approval requires explicit review');
  el('#confirm-approval').click();await wait(()=>!el('#approval-dialog').open,'local approval');
  assert(el('#approval-state').textContent.includes('No dispatch sent'),'Approval is explicitly local');
  el('[data-view="fleet"]').click();assert(!el('#fleet-view').hidden&&el('#board-view').hidden,'Fleet navigation works');
  assert(document.querySelectorAll('.crew-table tbody tr').length===6,'Six synthetic applicators are shown');
  el('[data-view="assumptions"]').click();assert(!el('#assumptions-view').hidden,'Assumptions navigation works');
  el('[data-view="board"]').click();
  el('.message-input').open=true;
  text('unknown repair details');el('#parse-message').click();await wait(()=>!el('#parse-message').disabled,'unsupported parsing');
  assert(!el('#use-update'),'Unsupported messages are not applicable');
  text('rig 3 down till 2pm');el('#parse-message').click();await wait(()=>!el('#parse-message').disabled&&!el('#parsed-update').hidden&&!!el('#use-update'),'recognized parsing');
  // Delay a real replan so the staged-update race is deterministic.
  const fetchOriginal=window.fetch;let release;
  window.fetch=async (...args)=>{if(args[0]==='/api/replan')await new Promise(resolve=>{release=resolve;});return fetchOriginal(...args);};
  try {
    el('#replan-button').click();await wait(()=>!!release,'delayed replan');
    assert(el('#use-update').disabled,'Staged update cannot change an in-flight replan');
    el('#use-update').click();release();await wait(ready,'delayed planning completion');
    assert(el('#parsed-update').textContent.includes('Proposed update'),'Disabled update did not become an applied input');
  } finally {window.fetch=fetchOriginal;}
  // Delay parsing and edit the message before its response arrives.
  let releaseParse;
  window.fetch=async (...args)=>{if(args[0]==='/api/parse')await new Promise(resolve=>{releaseParse=resolve;});return fetchOriginal(...args);};
  try {
    text('field 14 too wet');el('#parse-message').click();await wait(()=>!!releaseParse,'delayed parse');
    text('field 22 too wet');releaseParse();await wait(()=>!el('#parse-message').disabled,'old parse completion');
    assert(el('#parsed-update').hidden,'A stale parse result cannot replace edited text');
  } finally {window.fetch=fetchOriginal;}
  text('rain moved from 2pm to 10am');el('#parse-message').click();await wait(()=>!el('#parse-message').disabled,'ambiguous time parsing');
  assert(!el('#use-update')&&!el('#parsed-update').hidden,'Multiple-time updates are rejected for clarification');
  text('wind 30 mph');el('#parse-message').click();await wait(()=>!el('#parse-message').disabled&&!el('#parsed-update').hidden&&!!el('#use-update'),'all-day wind parse');
  el('#use-update').click();assert(el('#approve-button').disabled,'A confirmed text update invalidates prior approval');
  el('#replan-button').click();await wait(ready,'no-work planning');
  assert(document.querySelectorAll('.option-card').length===0,'All-day excessive wind yields no spray plans');
  assert(el('#approval-bar').hidden,'No-plan result has no approval action');
  assert(el('#options').textContent.includes('Hold the spray work'),'No-plan result explains the hold');
  el('#remove-update').click();text('');el('[data-scenario="storm"]').click();
  el('#replan-button').click();await wait(ready,'restored storm');
  el('.message-input').open=false;
  assert(document.querySelectorAll('.option-card').length===3,'Demo restores a fresh storm scenario');
  assert(el('#error-banner').hidden,'No UI errors after the complete flow');
  el('#field-picker').value='F14';el('#field-picker').dispatchEvent(new Event('change',{bubbles:true}));
  assert(!el('#field-tooltip').hidden&&el('#field-tooltip').textContent.includes('Field 14'),'Field picker opens readable field details');
  el('#field-tooltip button').click();
  assert(document.documentElement.scrollWidth<=innerWidth,'Page has no horizontal overflow at this viewport');
  return {passed:checks.length,checks};
})()
