const checks=[];
const check=(value,label)=>{if(!value)throw new Error(label);checks.push(label);};
const waitFor=async(fn)=>{for(let i=0;i<240;i++){if(fn())return;await new Promise(r=>setTimeout(r,50));}throw new Error('UI timeout');};
await waitFor(()=>state.result&&!state.busy);
const prior=state.fleetStore.snapshot().active;
const doneBefore=state.fleetStore.completedIds().join(',');
check(document.querySelectorAll('[data-disruption-scenario]').length===5,'Four disruptions and a clear-day reset are available');
document.querySelector('[data-disruption-scenario="breakdown"]').click();
document.querySelector('[data-disruption-action="analyze"]').click();
check(state.disruptionPhase==='analyzing','Analysis shows its running state');
await waitFor(()=>state.disruptionPhase==='ready');
check(state.result.conditions.rig_available_from.R3===840,'Breakdown response obeys Rig 3 availability');
check(state.fleetStore.snapshot().active?.run_id===prior?.run_id,'Analysis leaves the approved fleet unchanged');
check(document.querySelectorAll('[data-disruption-plan]').length===state.result.plans.length,'Every returned option can be compared');
check(buildActionProposal().actions.length===4,'Proposed response accounts for all four rigs');
check(buildActionProposal().actions.every(a=>a.jobs.every(j=>!state.fleetStore.completedIds().includes(j.field_id))),'Proposal does not reassign completed work');
const other=state.result.plans[1];if(other){document.querySelector(`[data-disruption-plan="${other.id}"]`).click();check(state.selected===other.id,'Selecting another response changes the proposal');}
document.querySelector('[data-disruption-action="dismiss"]').click();
check(state.disruptionPhase==='dismissed'&&state.fleetStore.snapshot().active?.run_id===prior?.run_id,'Dismissing a proposal changes no fleet assignments');
document.querySelector('[data-disruption-action="analyze"]').click();await waitFor(()=>state.disruptionPhase==='ready');
if(prior){
  document.querySelector('[data-view="fleet"]').click();document.querySelector('[data-fleet-tab="R1"]').click();
  const start=document.querySelector('[data-fleet-status="in_progress"]:not(:disabled)');
  if(start){const field=start.dataset.fleetField;start.click();document.querySelector('[data-view="disruptions"]').click();check(document.querySelector('[data-disruption-action="approve"]').disabled,'An underway job blocks replacement approval');document.querySelector('[data-view="fleet"]').click();document.querySelector(`[data-fleet-field="${field}"][data-fleet-status="held"]`).click();document.querySelector('[data-view="disruptions"]').click();check(!document.querySelector('[data-disruption-action="approve"]').disabled,'Holding underway work enables review');}
}
document.querySelector('[data-disruption-action="approve"]').click();
check(document.querySelector('#approval-dialog').open,'Response opens human approval dialog');
check(document.querySelectorAll('.approval-action-list p').length===4,'Approval dialog enumerates the four rig actions');
document.querySelector('#approval-dialog button[value="cancel"]').click();
check(state.fleetStore.snapshot().active?.run_id===prior?.run_id,'Canceling approval does not update the fleet');
document.querySelector('[data-disruption-action="approve"]').click();document.querySelector('#confirm-approval').click();
await waitFor(()=>state.disruptionPhase==='approved');
check(state.fleetStore.snapshot().active.plan.id===state.selected,'Human approval activates exactly the chosen response');
check(state.fleetStore.completedIds().join(',')===doneBefore,'Approval retains completion history');
document.querySelector('.disruption-scenario-picker summary').click();document.querySelector('[data-disruption-scenario="wet"]').click();
check(state.disruptionPhase==='idle'&&!document.querySelector('[data-disruption-action="approve"]'),'New conditions invalidate the previous approval proposal');
window.__disruptionChecks=checks;
return {passed:checks.length,checks};
