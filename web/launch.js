/* Deterministic 55-second launch-film compositor. Uses prerecorded solver data. */
(() => {
  'use strict';
  const W=1920,H=1080,DURATION=55;
  const canvas=document.querySelector('#launch-canvas');
  const ctx=canvas.getContext('2d',{alpha:false});
  const color={paper:'#f5f7f1',white:'#ffffff',ink:'#203a35',muted:'#708076',green:'#2a7453',light:'#e8efdf',line:'#d7e2d2',gold:'#a77d35',blue:'#5b97ae',dark:'#18372c'};
  const scenes=[{start:0,end:7,id:'intro'},{start:7,end:14,id:'disruptions'},{start:14,end:23,id:'options'},{start:23,end:31,id:'rules'},{start:31,end:38,id:'message'},{start:38,end:46,id:'approval'},{start:46,end:55,id:'outro'}];
  let fixtures,meta,sim,currentData='',playing=false,startStamp=0,startOffset=0,raf=0,currentTime=0;
  const num=n=>new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(n||0);
  const dollars=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n||0);
  const ease=t=>1-Math.pow(1-Math.min(1,Math.max(0,t)),3);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const round=(x,y,w,h,r=18)=>{ctx.beginPath();ctx.roundRect(x,y,w,h,r);};
  function box(x,y,w,h,fill=color.white,r=18,stroke=null){round(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke();}}
  function text(value,x,y,size=32,fill=color.ink,weight=400,align='left'){ctx.font=`${weight} ${size}px system-ui, -apple-system, sans-serif`;ctx.fillStyle=fill;ctx.textAlign=align;ctx.textBaseline='alphabetic';ctx.fillText(String(value),x,y);}
  function wrap(value,x,y,maxWidth,size=30,fill=color.muted,weight=400,lineHeight=size*1.38){
    ctx.font=`${weight} ${size}px system-ui, sans-serif`;const words=String(value).split(' ');let line='',cy=y;
    for(const word of words){const next=line?line+' '+word:word;if(ctx.measureText(next).width>maxWidth&&line){text(line,x,cy,size,fill,weight);line=word;cy+=lineHeight;}else line=next;}
    if(line)text(line,x,cy,size,fill,weight);return cy+lineHeight;
  }
  function pill(value,x,y,fill=color.light,ink=color.green,size=20){ctx.font=`550 ${size}px system-ui,sans-serif`;const w=ctx.measureText(value).width+30;box(x,y,w,36,fill,6);text(value,x+15,y+25,size,ink,550);return w;}
  function check(x,y,scale=1,fill=color.green){ctx.strokeStyle=fill;ctx.lineWidth=4*scale;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+8*scale,y+8*scale);ctx.lineTo(x+24*scale,y-11*scale);ctx.stroke();}
  function clock(min){const h=Math.floor(min/60),m=Math.round(min%60);return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'pm':'am'}`;}
  function brand(dark=false){text('fieldwork',74,89,43,dark?'#eff5e7':color.ink,760);ctx.fillStyle=dark?'#476657':color.line;ctx.fillRect(296,52,1,36);text('A clearer plan for a changing day',326,81,20,dark?'#b5cabc':color.muted,450);pill('Prototype · simulated data',1512,49,dark?'#304e3e':'#e8efdf',dark?'#d5e5c9':'#627b58',19);}
  function footer(index,dark=false){const y=1031;ctx.strokeStyle=dark?'#365744':color.line;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(74,y-26);ctx.lineTo(1846,y-26);ctx.stroke();text('Indiana spray planning',74,y+8,18,dark?'#a0b7a6':color.muted,450);text('No live dispatch',1846,y+8,18,dark?'#a0b7a6':color.muted,450,'right');const widths=[7,7,9,8,7,8,9],total=330;let x=794;for(let i=0;i<widths.length;i++){box(x,y-1,widths[i]/55*total,4,i<=index?(dark?'#b0cf97':color.green):(dark?'#43614f':'#dce6d5'),2);x+=widths[i]/55*total+7;}}
  function introHeading(kicker,title,subtitle,x=80,y=218,max=600){text(kicker,x,y,22,color.green,600);const end=wrap(title,x,y+91,max,69,color.ink,650,77);if(subtitle)wrap(subtitle,x,end+22,max,29,color.muted,400,41);}
  function getRun(name){return fixtures.scenarios?.[name]||fixtures.runs?.[name]||fixtures[name];}
  function plan(name='storm'){return getRun(name)?.plans?.[0];}
  function world(name,time,orbit,x,y,w,h,alpha=1){
    const run=getRun(name),p=run?.plans?.[0];
    if(!sim||!run||!p)return;
    const key=name+':'+p.id;
    if(currentData!==key){sim.setData(meta,p,run.conditions);sim.setPlaying(false);currentData=key;}
    sim.renderFrame({time,orbit});
    const sw=sim.canvas.width,sh=sim.canvas.height,sourceAspect=sw/sh,targetAspect=w/h;
    const cropW=sourceAspect>targetAspect?sh*targetAspect:sw,cropH=sourceAspect>targetAspect?sh:sw/targetAspect;
    ctx.save();round(x,y,w,h,24);ctx.clip();ctx.globalAlpha=alpha;ctx.drawImage(sim.canvas,(sw-cropW)/2,(sh-cropH)/2,cropW,cropH,x,y,w,h);ctx.restore();
  }
  function metric(label,value,x,y,size=38){text(label,x,y,20,color.muted,450);text(value,x,y+48,size,color.ink,620);}
  function drawIntro(t){
    const p=ease(t/1.2);ctx.save();ctx.globalAlpha=p;
    world('baseline',500+t*22,-0.73+t*.022,680,163,1170,760);
    introHeading('The day never stays on schedule.','See your next best move.','A 3D preview of the work ahead. Every field. Every rig. Every decision.',80,250,600);
    pill('4 rigs',82,719);pill('6 applicators',183,719);pill('40 fields',354,719);
    text('Play through a plan before the day plays out.',82,878,23,color.muted,450);
    ctx.restore();
  }
  function drawDisruptions(t){
    const stage=Math.min(3,Math.floor(t/1.75));const names=['storm','breakdown','wet','wind'];
    world(names[stage],stage===0?810:stage===1?600:stage===2?610:680,-.57+t*.016,60,164,1210,765);
    box(1300,167,550,761,color.white,22,color.line);
    text('When something changes…',1337,235,29,color.ink,650);
    const entries=[['Rain moves up','Protect the dry window'],['A rig breaks down','Reassign the available capacity'],['Fields turn wet','Hold inaccessible ground'],['Wind picks up','Pause during restricted hours']];
    entries.forEach((v,i)=>{const yy=285+i*143;box(1330,yy,490,117,i===stage?'#e5efde':'#f6f8f3',12,i===stage?'#82a473':null);text(['Rain','Rig 3','Wet','Wind'][i],1353,yy+40,21,i===stage?color.green:color.muted,600);text(v[0],1450,yy+42,25,color.ink,600);wrap(v[1],1450,yy+78,335,20,color.muted,400,27);});
    text('Change the scenario. Explore the response.',86,974,24,color.muted,450);
  }
  function drawOptions(t){
    const run=getRun('storm'),plans=run.plans.slice(0,3);text('Three ways forward.',80,218,62,color.ink,650);text('Rank by total acreage, estimated cost or rain buffer.',82,267,27,color.muted,400);
    plans.forEach((p,i)=>{
      const enter=ease((t-i*.16)/.75),x=80+i*592,y=330+(1-enter)*45;ctx.save();ctx.globalAlpha=enter;
      box(x,y,562,589,color.white,20,i===0?'#80a56f':color.line);
      pill(String(i+1),x+29,y+29,i===0?color.green:color.light,i===0?'#fff':color.green,21);
      text(p.name,x+89,y+57,27,color.ink,650);if(i===0)pill('Top ranked',x+367,y+31,color.light,color.green,17);
      text(dollars(p.estimated_cost),x+32,y+162,64,color.ink,650);text('Estimated operating cost',x+33,y+199,22,color.muted,400);
      metric('Acres scheduled',num(p.acres),x+34,y+260,38);metric('Labor-hours',num(p.labor_hours),x+293,y+260,38);
      metric('Travel',`${num(p.travel_minutes)} min`,x+34,y+377,35);metric('Rain buffer',`${num(p.min_rain_buffer_minutes)} min`,x+293,y+377,35);
      ctx.strokeStyle=color.line;ctx.beginPath();ctx.moveTo(x+30,y+486);ctx.lineTo(x+532,y+486);ctx.stroke();
      text(`${p.deferred_count} fields deferred`,x+34,y+533,22,color.muted,450);text(i===0?'Selected for preview':'View schedule',x+530,y+533,21,i===0?color.green:color.muted,550,'right');ctx.restore();
    });
    text('Computed from solver schedules. Illustrative costs; rain buffer is not a runoff prediction.',82,974,22,color.muted,400);
  }
  function drawTimeline(x,y,w,h,p,time){
    const left=184,top=54,row=78,start=480,end=1080,px=m=>x+left+(m-start)/(end-start)*(w-left-24);
    box(x,y,w,h,color.white,20,color.line);text('Rig schedule',x+25,y+34,23,color.ink,620);
    [480,600,720,840,960,1080].forEach(m=>{text(clock(m).replace(':00',''),px(m),y+top+15,17,color.muted,400,'center');ctx.strokeStyle='#edf1e8';ctx.beginPath();ctx.moveTo(px(m),y+top+29);ctx.lineTo(px(m),y+h-22);ctx.stroke();});
    meta.rigs.forEach((rig,i)=>{const yy=y+top+45+i*row;text(rig.name,x+25,yy+21,22,color.ink,600);text(rig.crew_name.split(' ')[0],x+25,yy+48,18,color.muted,400);p.schedule.filter(j=>j.rig_id===rig.id).forEach(j=>{const width=Math.max(3,px(j.end)-px(j.start));box(px(j.start),yy,width,43,rig.color+'24',5,rig.color);if(width>40)text(j.field_id,px(j.start)+width/2,yy+28,17,rig.color,600,'center');});});
    ctx.strokeStyle=color.green;ctx.lineWidth=2;ctx.setLineDash([5,5]);ctx.beginPath();ctx.moveTo(px(time),y+top+24);ctx.lineTo(px(time),y+h-22);ctx.stroke();ctx.setLineDash([]);
  }
  function drawRules(t){
    text('The rules travel with the plan.',80,218,58,color.ink,650);text('Trace every assignment back to time, capacity and conditions.',82,267,27,color.muted,400);
    const p=plan(),labels=['Spray windows','Required dry time','Wind restrictions','Crew eligibility','Travel & shifts'];
    labels.forEach((s,i)=>{const x=82+i*355;box(x,321,333,80,i<Math.floor(t*1.4)+1?'#e4eedb':'#eef2e9',12);check(x+28,363,.75);text(s,x+71,370,24,color.ink,550);});
    drawTimeline(80,442,1766,452,p,500+t*32);
    text('Deferred fields keep a reason. Infeasible work stays off the board.',82,969,25,color.muted,450);
  }
  function drawMessage(t){
    world('breakdown',600+t*22,-.68+t*.016,790,178,1060,743);
    introHeading('From a messy update…','A change you can review.','A crew message becomes a proposed change. You confirm the interpretation.',80,211,638);
    box(82,527,695,137,color.white,15,color.line);text('Crew update',107,564,18,color.muted,550);
    const message='rig 3 hydraulic leak, down till 2pm';
    const chars=Math.floor(message.length*clamp(t/1.7,0,1));text(message.slice(0,chars),107,618,28,color.ink,500);
    if(t>1.7){ctx.save();ctx.globalAlpha=ease((t-1.7)/.6);box(82,692,695,180,'#e4eedb',15);text('Proposed interpretation',108,737,21,color.green,650);text('Rig 3 unavailable until 2:00 pm.',108,790,31,color.ink,550);text('Repair time is an assumption to confirm.',108,833,20,color.muted,450);ctx.restore();}
    text('Demo: restricted pattern parser. Gemini integration is planned.',82,970,22,color.muted,450);
  }
  function drawApproval(t){
    const p=plan();world('storm',510+t*28,-.66+t*.014,80,180,1030,720);
    box(1170,178,675,728,color.white,22,color.line);
    const approved=t>=3.0;box(1210,221,66,66,approved?'#dfeccc':'#ecf2e5',33);if(approved)check(1228,254,1.2);else text('1',1243,264,31,color.green,600,'center');
    text(approved?'Approved locally.':'You choose the plan.',1212,350,42,color.ink,650);
    wrap(`${p.name}: ${num(p.acres)} acres, ${num(p.labor_hours)} labor-hours.`,1212,412,578,29,color.muted,400,43);
    box(1212,523,590,124,'#f0f5eb',12);text('A human decision, every time.',1236,569,26,color.ink,600);text('No live texts or equipment tasks are sent.',1236,611,22,color.muted,400);
    box(1212,695,590,72,approved?'#e5efdd':color.green,9);text(approved?'✓  Approved in this demo':'Review & approve',1507,743,27,approved?color.green:'#fff',600,'center');
    if(t>4.2){ctx.save();ctx.globalAlpha=ease((t-4.2)/.7);pill('Crew sheet CSV',1214,807,color.light,color.green,21);pill('Plan JSON',1456,807,color.light,color.green,21);ctx.restore();}
    text('Inspect the schedule. Approve explicitly. Export a review copy.',82,970,25,color.muted,450);
  }
  function drawOutro(t){
    ctx.fillStyle=color.dark;ctx.fillRect(0,0,W,H);
    world('baseline',540+t*25,-.64+t*.018,923,202,930,646,.94);
    ctx.fillStyle='#18372c';ctx.fillRect(0,147,880,804);
    text('No new farm hardware.',80,293,66,'#f0f5e8',650);text('Just a clearer view.',80,378,66,'#f0f5e8',650);
    wrap('Open the browser replay. Preview the plan. Keep the decision with your team.',82,459,720,32,'#b3c9b7',400,47);
    const labels=['No sensors to install','No gateways to fit','No machinery connection needed'];
    labels.forEach((s,i)=>{check(87,660+i*65,.8,'#b5d59f');text(s,127,668+i*65,28,'#dcebd5',450);});
    text('fieldwork',82,908,54,'#f0f5e8',760);text('Pilot: one co-op. One season.',415,902,27,'#b3c9b7',450);
    text('Next: live data, Gemini, messaging and tested equipment exports.',82,969,24,'#a9c1ad',450);
  }
  const drawFns={intro:drawIntro,disruptions:drawDisruptions,options:drawOptions,rules:drawRules,message:drawMessage,approval:drawApproval,outro:drawOutro};
  function render(t){
    if(!fixtures)return;currentTime=clamp(t,0,DURATION-.0001);
    const index=scenes.findIndex(s=>currentTime>=s.start&&currentTime<s.end),scene=scenes[Math.max(0,index)],local=currentTime-scene.start;
    ctx.globalAlpha=1;ctx.fillStyle=color.paper;ctx.fillRect(0,0,W,H);drawFns[scene.id](local);brand(scene.id==='outro');footer(index,scene.id==='outro');
    // A brief opaque fade makes chapter transitions readable without relying on previous frames.
    if(scene.start>0&&local<.23){ctx.globalAlpha=1-ease(local/.23);ctx.fillStyle=scene.id==='outro'?color.dark:color.paper;ctx.fillRect(0,0,W,H);ctx.globalAlpha=1;}
    document.querySelector('#film-seek').value=String(t);document.querySelector('#film-time').textContent=`0:${String(Math.floor(t)).padStart(2,'0')} / 0:55`;
  }
  function pause(){playing=false;cancelAnimationFrame(raf);document.querySelector('#film-play').textContent='Play film';}
  function tick(stamp){if(!playing)return;const t=startOffset+(stamp-startStamp)/1000;if(t>=DURATION){render(DURATION-.001);pause();return;}render(t);raf=requestAnimationFrame(tick);}
  function play(){if(playing)return;playing=true;startOffset=currentTime>DURATION-.1?0:currentTime;startStamp=performance.now();document.querySelector('#film-play').textContent='Pause';raf=requestAnimationFrame(tick);}
  const ready=(async()=>{
    fixtures=await fetch('demo-fixtures.json').then(r=>{if(!r.ok)throw new Error('Could not load recorded solver plans.');return r.json();});
    meta=fixtures.metadata||fixtures.meta||fixtures.demo;
    if(!meta||!getRun('storm')?.plans?.length)throw new Error('Unexpected recorded-plan format.');
    if(typeof window.Fieldwork3D!=='function')throw new Error('The 3D simulation is still loading.');
    sim=new window.Fieldwork3D(document.querySelector('#film-world'));
    if(!sim.available||!sim.canvas)throw new Error('3D graphics are unavailable in this browser. Open the launch preview in a WebGL-enabled browser.');
    sim.renderer.setPixelRatio(1);sim.resize();
    sim.setPlaying(false);render(0);
    document.querySelector('#film-status').textContent='55-second silent preview. Final video adds narration. All plans and activity are simulated.';
    return true;
  })();
  ready.catch(error=>{document.querySelector('#film-status').textContent=error.message;ctx.fillStyle=color.paper;ctx.fillRect(0,0,W,H);text('Preparing Fieldwork',80,260,64,color.ink,600);wrap(error.message,80,340,1500,32);});
  document.querySelector('#film-play').onclick=()=>ready.then(()=>playing?pause():play());
  document.querySelector('#film-seek').oninput=event=>{pause();render(Number(event.target.value));};
  window.launchFilm={ready,duration:DURATION,canvas,render,play,pause,get time(){return currentTime;},get simulation(){return sim;}};
})();
