/* Browser-local incident reports. Reporting and reviewing never dispatch equipment. */
(function (root) {
  'use strict';
  const VERSION=1;
  const TYPES=new Set(['breakdown','wet','storm','wind']);
  const STATUSES=new Set(['new','reviewing','response_approved','resolved']);
  const clone=value=>JSON.parse(JSON.stringify(value));
  const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  const timestamp=()=>new Date().toISOString();
  const isTimestamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
  const uid=()=>root.crypto?.randomUUID?.()||`incident-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,12)}`;
  function text(value,label,max,optional=false){
    if(optional&&value===undefined)return undefined;
    if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw new Error(`${label} must be 1–${max} characters.`);
    return value.trim();
  }
  function integer(value,label,min,max){
    if(!Number.isInteger(value)||value<min||value>max)throw new Error(`${label} must be a whole number from ${min} to ${max}.`);
    return value;
  }
  const time=value=>`${Math.floor(value/60)%12||12}:${String(value%60).padStart(2,'0')} ${value<720?'am':'pm'}`;

  class FieldworkIncidentStore {
    constructor({metadata,storage}={}){
      if(!object(metadata)||typeof metadata.date!=='string'||!metadata.date||!Array.isArray(metadata.fields)||!Array.isArray(metadata.rigs)||!metadata.rigs.length)throw new Error('A dated field and fleet roster is required for incident reports.');
      this.metadata=clone(metadata);
      this.fields=new Map(metadata.fields.map(field=>[field.id,clone(field)]));
      this.rigs=new Map(metadata.rigs.map(rig=>[rig.id,clone(rig)]));
      this.key=`fieldwork:incidents:v${VERSION}:${encodeURIComponent(metadata.date)}:${encodeURIComponent(metadata.profile_id||'demo')}`;
      this.persistenceWarning=null;this._raw=null;this._state=this._empty();
      let fresh=false;
      try{
        this.storage=storage===undefined?root.localStorage:storage;
        if(!this.storage||typeof this.storage.getItem!=='function'||typeof this.storage.setItem!=='function')throw new Error('Storage unavailable');
        this._raw=this.storage.getItem(this.key);
        if(this._raw===null)fresh=true;
        else this._state=this._read(this._raw);
      }catch(_error){
        this.storage=null;
        this.persistenceWarning='Saved incident reports are unavailable or unreadable. Changes stay in this tab; existing saved reports have not been overwritten.';
      }
      if(fresh){
        const rig=this.rigs.get('R3')||this.rigs.values().next().value;
        const incident=this._make({type:'breakdown',rig_id:rig.id,available_from:840,
          message:`Hydraulic leak reported on ${rig.name||rig.id}. Estimated return: 2:00 pm.`,
          source:`${rig.crew_name||rig.name||rig.id} (demo)`},'demo-initial-breakdown');
        this._commit({...this._empty(),incidents:[incident]});
      }
    }
    _empty(){return {version:VERSION,day:this.metadata.date,profile_id:this.metadata.profile_id||null,revision:0,incidents:[]};}
    _input(input){
      if(!object(input)||!TYPES.has(input.type))throw new Error('Choose a supported incident type.');
      const allowed=new Set(['type','title','message','source','rig_id','field_id','available_from','rain_time','wind_mph']);
      if(Object.keys(input).some(key=>!allowed.has(key)))throw new Error('Incident report contains unsupported fields.');
      const result={type:input.type};
      if(input.rig_id!==undefined){if(!this.rigs.has(input.rig_id))throw new Error('Choose a known sprayer.');result.rig_id=input.rig_id;}
      if(input.field_id!==undefined){if(!this.fields.has(input.field_id))throw new Error('Choose a known field.');result.field_id=input.field_id;}
      if(input.type==='breakdown'){
        if(!result.rig_id)throw new Error('A breakdown must identify its sprayer.');
        result.available_from=integer(input.available_from,'Estimated return time',480,1200);
      }else if(input.type==='wet'){
        if(!result.field_id)throw new Error('A wet-field report must identify its field.');
      }else if(input.type==='storm')result.rain_time=integer(input.rain_time,'Rain arrival time',480,1200);
      else result.wind_mph=integer(input.wind_mph,'Wind speed',1,60);
      for(const key of ['available_from','rain_time','wind_mph'])if(input[key]!==undefined&&result[key]===undefined)throw new Error('The reported condition does not match its incident type.');
      const rig=result.rig_id?this.rigs.get(result.rig_id):null,field=result.field_id?this.fields.get(result.field_id):null;
      const defaults={
        breakdown:{title:`${rig?.name||result.rig_id} is unavailable`,message:`Estimated return: ${time(result.available_from||840)}.`,source:rig?.crew_name||rig?.name||'Fleet report'},
        wet:{title:`${field?.name||result.field_id} is too wet`,message:'The field is reported inaccessible for spraying.',source:rig?.crew_name||rig?.name||'Field report'},
        storm:{title:'Rain is moving in',message:`Rain arrival reported at ${time(result.rain_time||840)}.`,source:'Weather report'},
        wind:{title:'Wind exceeds the planned conditions',message:`Reported wind: ${result.wind_mph||0} mph for the remaining day.`,source:'Field report'}
      }[input.type];
      result.title=text(input.title,'Incident title',180,true)||defaults.title;
      result.message=text(input.message,'Report details',2000,true)||defaults.message;
      result.source=text(input.source,'Report source',160,true)||defaults.source;
      return result;
    }
    _make(input,id=uid()){return {id,...this._input(input),reported_at:timestamp(),status:'new',simulated:true};}
    _read(raw){
      const saved=JSON.parse(raw);
      if(!object(saved)||Object.keys(saved).some(key=>!['version','day','profile_id','revision','incidents'].includes(key))||saved.version!==VERSION||saved.day!==this.metadata.date||saved.profile_id!==(this.metadata.profile_id||null)||!Number.isSafeInteger(saved.revision)||saved.revision<0||!Array.isArray(saved.incidents)||saved.incidents.length>500)throw new Error('Invalid incident log.');
      const seen=new Set();
      for(const report of saved.incidents){
        if(!object(report)||typeof report.id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(report.id)||seen.has(report.id)||!STATUSES.has(report.status)||report.simulated!==true||!isTimestamp(report.reported_at))throw new Error('Invalid incident record.');
        const allowed=new Set(['id','type','title','message','source','rig_id','field_id','available_from','rain_time','wind_mph','reported_at','status','simulated','response','reviewed_at','resolved_at']);
        if(Object.keys(report).some(key=>!allowed.has(key)))throw new Error('Unknown incident record fields.');
        const input={};for(const key of ['type','title','message','source','rig_id','field_id','available_from','rain_time','wind_mph'])if(report[key]!==undefined)input[key]=report[key];
        text(report.title,'Incident title',180);text(report.message,'Report details',2000);text(report.source,'Report source',160);
        this._input(input);
        if(report.reviewed_at!==undefined&&!isTimestamp(report.reviewed_at))throw new Error('Invalid review timestamp.');
        if(report.status==='reviewing'&&!isTimestamp(report.reviewed_at))throw new Error('Missing review timestamp.');
        if(report.response!==undefined){
          if(!object(report.response)||Object.keys(report.response).some(key=>!['run_id','plan_id','approved_at'].includes(key)))throw new Error('Invalid incident response.');
          text(report.response.run_id,'Run ID',160);text(report.response.plan_id,'Plan ID',160);
          if(!isTimestamp(report.response.approved_at))throw new Error('Invalid response timestamp.');
        }
        if(report.status==='response_approved'&&!report.response)throw new Error('Missing incident response.');
        if(report.resolved_at!==undefined&&!isTimestamp(report.resolved_at))throw new Error('Invalid resolution timestamp.');
        if(report.status==='resolved'&&!report.resolved_at)throw new Error('Missing resolution timestamp.');
        seen.add(report.id);
      }
      if(saved.incidents.filter(report=>report.status!=='resolved').length>50)throw new Error('Too many active reports.');
      return saved;
    }
    _fresh(){
      if(!this.storage)return;
      let current;
      try{current=this.storage.getItem(this.key);}catch(_error){this.storage=null;this.persistenceWarning='The browser cannot access saved reports. Changes stay in this tab only.';return;}
      if(current===this._raw)return;
      try{this._state=current===null?this._empty():this._read(current);this._raw=current;}
      catch(_error){this.storage=null;this.persistenceWarning='Another tab changed the report log to unreadable data. Existing saved reports have not been overwritten.';}
      throw new Error('Incident reports changed in another tab. Review the refreshed feed and try again.');
    }
    _commit(next){
      next.revision=this._state.revision+1;
      const raw=JSON.stringify(next);
      if(this.storage){try{this.storage.setItem(this.key,raw);this._raw=raw;}catch(_error){this.storage=null;this.persistenceWarning='The browser could not save incident reports. Changes stay in this tab and may be lost on reload.';}}
      this._state=next;
    }
    snapshot(){return clone(this._state);}
    list(){return clone(this._state.incidents).sort((a,b)=>b.reported_at.localeCompare(a.reported_at)||this._state.incidents.findIndex(r=>r.id===b.id)-this._state.incidents.findIndex(r=>r.id===a.id));}
    get(id){const found=this._state.incidents.find(report=>report.id===id);return found?clone(found):null;}
    report(input){
      this._fresh();
      if(this._state.incidents.filter(report=>report.status!=='resolved').length>=50)throw new Error('Resolve existing reports before adding more than 50 active incidents.');
      if(this._state.incidents.length>=500)throw new Error('This local incident log is full. Export or retain its records before starting another workday.');
      const incident=this._make(input),next=this.snapshot();next.incidents.push(incident);this._commit(next);return clone(incident);
    }
    _change(id,fn){
      this._fresh();const next=this.snapshot(),report=next.incidents.find(item=>item.id===id);
      if(!report)throw new Error('This incident is not in the report feed.');
      if(fn(report)!==false)this._commit(next);
      return clone(report);
    }
    markReviewed(id){return this._change(id,report=>{if(report.status!=='new')return false;report.status='reviewing';report.reviewed_at=timestamp();});}
    approveResponse(id,response){
      if(!object(response)||Object.keys(response).some(key=>!['run_id','plan_id'].includes(key)))throw new Error('A reviewed planning run and plan are required.');
      const run_id=text(response.run_id,'Run ID',160),plan_id=text(response.plan_id,'Plan ID',160);
      return this._change(id,report=>{
        if(report.status==='resolved')throw new Error('The incident is already resolved.');
        if(report.status==='response_approved'&&report.response?.run_id===run_id&&report.response?.plan_id===plan_id)return false;
        report.status='response_approved';report.response={run_id,plan_id,approved_at:timestamp()};
      });
    }
    resolve(id){return this._change(id,report=>{if(report.status==='resolved')return false;report.status='resolved';report.resolved_at=timestamp();});}
    activeInputs(){return this.list().filter(report=>report.status!=='resolved').map(report=>{
      const result={id:report.id,type:report.type};
      const keys={breakdown:['rig_id','available_from'],wet:['field_id'],storm:['rain_time'],wind:['wind_mph']}[report.type];
      for(const key of keys)result[key]=report[key];
      return result;
    });}
  }
  root.FieldworkIncidentStore=FieldworkIncidentStore;
  if(typeof module!=='undefined'&&module.exports)module.exports=FieldworkIncidentStore;
})(typeof window!=='undefined'?window:globalThis);
