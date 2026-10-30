/* Silent, deterministic 28-second commercial. All plans are recorded demo fixtures. */
(() => {
  'use strict';
  const W=1920,H=1080,DURATION=28;
  const canvas=document.querySelector('#commercial-canvas');
  const ctx=canvas.getContext('2d',{alpha:false});
  const C={ink:'#09281d',forest:'#123d2b',lime:'#d6ff60',white:'#f7fff1',muted:'#bfd0c1',amber:'#ffd16a'};
  const scenes=[
    [0,2,'hook'],[2,3.2,'rain'],[3.2,4.4,'rig'],[4.4,5.6,'wet'],[5.6,6.8,'wind'],
    [6.8,8,'move'],[8,11.6,'options'],[11.6,14.2,'timeline'],[14.2,16.8,'update'],
    [16.8,19.4,'approve'],[19.4,22.6,'playback'],[22.6,25,'hardware'],[25,28,'outro']
  ];
  let fixtures,meta,sim,dataKey='',playing=false,raf=0,currentTime=0,startStamp=0,startOffset=0;
  const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
  const ease=n=>1-Math.pow(1-clamp(n),4);
  const smooth=n=>{n=clamp(n);return n*n*(3-2*n);};
  const pop=n=>{n=clamp(n)-1;return 1+2.70158*n*n*n+1.70158*n*n;};
  const num=n=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(n);
  const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
  const run=name=>fixtures.scenarios[name];
  const plan=(name='storm',i=0)=>run(name).plans[i];
  const round=(x,y,w,h,r=14)=>{ctx.beginPath();ctx.roundRect(x,y,w,h,r);};
  function box(x,y,w,h,fill,r=14,stroke){round(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke();}}
  function txt(s,x,y,size=32,fill=C.white,weight=700,align='left',spacing=0){ctx.font=`${weight} ${size}px Arial, Helvetica, sans-serif`;ctx.fillStyle=fill;ctx.textAlign=align;ctx.textBaseline='alphabetic';if('letterSpacing' in ctx)ctx.letterSpacing=`${spacing}px`;ctx.fillText(String(s),x,y);if('letterSpacing' in ctx)ctx.letterSpacing='0px';}
  function line(x1,y1,x2,y2,color=C.white,width=2){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}
  function pill(s,x,y,fill=C.lime,ink=C.ink,size=22){ctx.font=`700 ${size}px Arial`;const w=ctx.measureText(s).width+38;box(x,y,w,45,fill,5);txt(s,x+19,y+30,size,ink,700);return w;}
  function check(x,y,size=1,color=C.lime){ctx.save();ctx.strokeStyle=color;ctx.lineWidth=6*size;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+10*size,y+10*size);ctx.lineTo(x+31*size,y-14*size);ctx.stroke();ctx.restore();}
  function arrow(x,y,size=1,color=C.lime){line(x,y,x+46*size,y,color,5*size);line(x+46*size,y,x+30*size,y-16*size,color,5*size);line(x+46*size,y,x+30*size,y+16*size,color,5*size);}
  function shade(strength=.9,side='left'){
    const g=ctx.createLinearGradient(side==='left'?0:W,0,side==='left'?W:0,0);
    g.addColorStop(0,`rgba(4,29,19,${strength})`);g.addColorStop(.4,`rgba(4,29,19,${strength*.7})`);g.addColorStop(1,'rgba(4,29,19,0.03)');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    const floor=ctx.createLinearGradient(0,750,0,H);floor.addColorStop(0,'rgba(4,29,19,0)');floor.addColorStop(1,'rgba(4,29,19,.7)');ctx.fillStyle=floor;ctx.fillRect(0,750,W,330);
  }
  function world(name,time,{yaw=-.65,distance=155,elevation=.98,target={x:0,y:0,z:0},follow=null}={}){
    const r=run(name),p=plan(name),key=name+':'+p.id;
    if(dataKey!==key){sim.setData(meta,p,r.conditions);sim.setPlaying(false);dataKey=key;}
    sim.view='orbit';sim.cameraState.yaw=yaw;sim.cameraState.elevation=elevation;sim.cameraState.distance=distance;sim.cameraState.target={...target};
    if(follow){sim.renderFrame({time});const rig=sim.currentRigStates.find(s=>s.id===follow)||sim.currentRigStates[0];if(rig)sim.cameraState.target={x:rig.x,y:0,z:rig.z};}
    sim.renderFrame({time});ctx.drawImage(sim.canvas,0,0,sim.canvas.width,sim.canvas.height,0,0,W,H);
  }
  function streaks(t,color='rgba(214,255,96,.35)'){
    const alpha=(1-smooth(t/.38))*.6;if(alpha<=0)return;
    ctx.save();ctx.globalAlpha=alpha;for(let i=0;i<6;i++){let y=210+i*138;line(W-t*1500-i*130,y,W+450-t*1500-i*130,y,color,2);}ctx.restore();
  }
  function heading(lines,t,{x=94,y=350,size=144,gap=138,fill=C.white,accent=-1,enter=true}={}){
    lines.forEach((s,i)=>{const a=enter?ease((t+.12-i*.055)/.38):1;ctx.save();ctx.globalAlpha=a;txt(s,x+(1-a)*-75,y+i*gap,size,i===accent?C.lime:fill,900,'left',-5);ctx.restore();});
  }
  function chrome(index,t){
    txt('fieldwork',78,82,34,C.white,800,'left',-1.3);
    box(1547,40,298,46,'rgba(6,31,21,.78)',5);txt('Prototype · simulated data',1696,70,19,'#d9e7d6',500,'center');
    txt('INDIANA / SPRAY PLANNING',80,1025,16,'#d2decd',700,'left',2.2);
    txt(`${String(index+1).padStart(2,'0')} / 13`,1836,1025,18,'#d2decd',600,'right',2);
    ctx.fillStyle='rgba(236,255,216,.22)';ctx.fillRect(80,1053,1760,3);ctx.fillStyle=C.lime;ctx.fillRect(80,1053,1760*clamp(t/DURATION),3);
  }
  function hook(t){
    world('baseline',520+t*15,{yaw:-.92+t*.15,distance:64-t*6,elevation:1.13,follow:'R1'});shade(.78);
    pill('THE WEATHER WON’T WAIT.',94,203,C.lime,C.ink,24);
    heading(['THE DAY','CHANGED.'],t,{y:448,size:167,gap:162,enter:false});
    const a=ease((t-.42)/.35);ctx.save();ctx.globalAlpha=a;txt('Your plan can, too.',99,719,49,C.white,500);arrow(560+(1-a)*-30,704,.8);ctx.restore();
    pill('4 rigs',96,868,'rgba(7,35,22,.77)',C.white);pill('40 fields',216,868,'rgba(7,35,22,.77)',C.white);pill('One better next move',371,868,'rgba(7,35,22,.77)',C.white);
  }
  function disruption(t,kind){
    const config={rain:['storm','RAIN','MOVED UP.','2:00 PM RAIN',855,1.0,138,{x:-7,y:0,z:-5}],rig:['breakdown','RIG','WENT DOWN.','RIG 3 · UNTIL 2 PM',605,-.52,52,{x:0,y:0,z:0}],wet:['wet','GROUND','TOO WET.','6 FIELDS HELD',620,-.9,118,{x:-12,y:0,z:9}],wind:['wind','WIND','PICKED UP.','18 MPH · RESTRICTIONS',680,.3,120,{x:6,y:0,z:3}]}[kind];
    world(config[0],config[4]+t*5,{yaw:config[5]+t*.16,distance:config[6]-t*8,elevation:kind==='rig'?1.19:.9,target:config[7],follow:kind==='rig'?'R3':null});shade(.87);streaks(t);
    pill(config[3],96,255,C.amber,C.ink,25);heading([config[1],config[2]],t,{y:482,size:154,gap:154,accent:0});
    const tags={rain:'Protect the dry window.',rig:'Find the available capacity.',wet:'Hold inaccessible ground.',wind:'Respect the wind window.'};txt(tags[kind],102,775,36,C.white,500);
    if(kind==='rain'){for(let i=0;i<14;i++){const px=1110+i*59+(t*70)%59;line(px,150+(i%3)*110,px-80,370+(i%3)*110,'rgba(221,240,229,.22)',3);}}
    if(kind==='wind'){for(let i=0;i<4;i++){const yy=305+i*116;line(1170+(t*160)%120,yy,1640+(t*160)%120,yy,'rgba(214,255,96,.65)',5);}}
  }
  function move(t){
    world('storm',590+t*30,{yaw:-.95+t*.7,distance:173-t*38,elevation:.71});shade(.84);
    const a=pop(t/.5);ctx.save();ctx.translate(960,539);ctx.scale(.92+.08*a,.92+.08*a);txt('MOVE',0,-12,238,C.white,900,'center',-11);txt('THE PLAN.',0,193,208,C.lime,900,'center',-10);ctx.restore();
    txt('Real constraints. Three ways forward.',960,856,35,C.white,500,'center');
  }
  function metric(label,value,x,y,{fill=C.ink,size=53}={}){txt(value,x,y,size,fill,800,'left',-1.8);txt(label,x,y+36,22,fill,500);}
  function options(t){
    world('storm',590+t*14,{yaw:-.6+t*.04,distance:187,elevation:.63});ctx.fillStyle='rgba(5,34,23,.86)';ctx.fillRect(0,0,W,H);
    heading(['THREE WAYS FORWARD.'],t,{y:233,size:94,gap:100});txt('The math is on the table.',98,290,29,C.muted,500);
    const plans=run('storm').plans;
    plans.forEach((p,i)=>{
      const a=pop((t-i*.13)/.48),x=94+i*589,y=352+(1-a)*260,selected=i===0;
      ctx.save();ctx.globalAlpha=clamp(a);box(x,y,558,555,selected?C.lime:'#f1f6e9',11);
      pill(`0${i+1}`,x+30,y+28,selected?C.ink:'#dfe8d8',selected?C.lime:C.ink,23);
      txt(p.name,x+116,y+59,28,C.ink,800);if(selected){txt('TOP RANKED',x+31,y+112,17,C.ink,700,'left',2);}
      txt(money(p.estimated_cost),x+30,y+198,64,C.ink,900,'left',-3);txt('estimated operating cost',x+32,y+234,23,C.ink,500);
      line(x+30,y+268,x+527,y+268,selected?'#91ac46':'#c9d5c5',1);
      metric('acres scheduled',num(p.acres),x+30,y+337);metric('labor-hours',num(p.labor_hours),x+298,y+337);
      metric('travel minutes',num(p.travel_minutes),x+30,y+449);metric('min. rain buffer',`${p.min_rain_buffer_minutes} min`,x+298,y+449,{size:49});
      ctx.restore();
    });
    txt('Recorded OR-Tools results · Illustrative costs · Rain buffer is not a runoff forecast.',97,966,22,C.muted,500);
  }
  function timeline(t){
    world('storm',535+t*45,{yaw:-.73+t*.1,distance:139-t*4,elevation:.78});shade(.76);
    heading(['SEE EVERY MOVE.'],t,{y:270,size:105});txt('Routes. Crews. Windows.',99,328,32,C.white,500);
    const p=plan(),x=92,y=445,w=1734,h=440,start=480,end=840,left=210;
    const px=m=>x+left+(m-start)/(end-start)*(w-left-42),a=ease(t/.42);
    ctx.save();ctx.translate(0,(1-a)*100);ctx.globalAlpha=a;box(x,y,w,h,'rgba(6,34,23,.94)',13,'#557343');
    [480,540,600,660,720,780,840].forEach(m=>{const xx=px(m);txt(`${m/60>12?m/60-12:m/60}${m>=720?'pm':'am'}`,xx,y+47,19,C.muted,600,'center');line(xx,y+68,xx,y+h-30,'rgba(199,223,186,.14)',1);});
    meta.rigs.forEach((rig,i)=>{const yy=y+83+i*81;txt(rig.name,x+28,yy+25,25,C.white,800);txt(rig.crew_name.split(' ')[0],x+28,yy+49,17,C.muted,500);p.schedule.filter(j=>j.rig_id===rig.id).forEach(j=>{const ww=Math.max(3,px(j.end)-px(j.start));box(px(j.start),yy,ww,48,i===0?C.lime:['#a6d79c','#f2cb75','#9bc4ba'][i-1],5);if(ww>54)txt(j.field_id,px(j.start)+ww/2,yy+31,19,C.ink,800,'center');});});
    const cx=px(500+smooth(t/2.6)*255);line(cx,y+70,cx,y+h-19,C.white,3);box(cx-39,y+9,78,37,C.white,4);txt('PREVIEW',cx,y+34,12,C.ink,800,'center');ctx.restore();
    pill('Spray windows',95,924,'rgba(7,35,22,.89)',C.white,20);pill('Dry time',311,924,'rgba(7,35,22,.89)',C.white,20);pill('Wind limits',458,924,'rgba(7,35,22,.89)',C.white,20);pill('Crew eligibility',642,924,'rgba(7,35,22,.89)',C.white,20);pill('Travel + shifts',864,924,'rgba(7,35,22,.89)',C.white,20);
  }
  function update(t){
    world('breakdown',600+t*18,{yaw:-.56+t*.09,distance:75-t*3,elevation:1.14,follow:'R3'});shade(.87);
    heading(['MESSY UPDATE.','CLEAR CHANGE.'],t,{y:306,size:113,gap:118,accent:1});
    const a=ease(t/.36);ctx.save();ctx.globalAlpha=a;box(98,521,1080,132,C.white,13);txt('CREW UPDATE',128,559,17,'#507359',800,'left',2);const message='rig 3 hydraulic leak, down till 2pm';const count=Math.max(8,Math.ceil(message.length*clamp(t/.75)));txt(message.slice(0,count),128,615,39,C.ink,600,'left',-.7);ctx.restore();
    if(t>.52){const b=pop((t-.52)/.4);ctx.save();ctx.globalAlpha=clamp(b);box(98+(1-b)*80,683,1080,175,C.lime,13);txt('REVIEW THE INTERPRETATION',129,726,18,C.ink,800,'left',1.5);txt('Rig 3 unavailable until 2:00 pm.',129,786,43,C.ink,800,'left',-1);txt('Confirm the repair time before replanning.',130,825,23,C.ink,500);ctx.restore();}
    txt('Demo parser · Gemini integration planned',102,939,23,C.muted,500);
  }
  function approve(t){
    world('storm',520+t*28,{yaw:-.9+t*.13,distance:116-t*4,elevation:1.0});shade(.85);
    heading(['YOU MAKE','THE CALL.'],t,{y:316,size:130,gap:128,accent:1});
    const a=ease(t/.4),x=1078+(1-a)*210,y=259;ctx.save();ctx.globalAlpha=a;
    box(x,y,666,593,C.white,17);pill('01 · BUILD RAIN BUFFER',x+37,y+35,'#e5eddb',C.ink,21);
    txt(`${num(plan().acres)} acres`,x+38,y+164,66,C.ink,900,'left',-2);txt(`${num(plan().labor_hours)} labor-hours`,x+41,y+215,33,'#55714f',600);
    line(x+38,y+251,x+627,y+251,'#d3deca',1);
    const approved=t>=.98;box(x+38,y+286,589,87,approved?C.ink:C.lime,9);txt(approved?'APPROVED LOCALLY':'REVIEW & APPROVE',x+332,y+342,30,approved?C.lime:C.ink,800,'center');
    if(approved){check(x+71,y+324,.65,C.lime);txt('Your decision. Your crew.',x+40,y+422,28,C.ink,700);txt('No live dispatch from this prototype.',x+40,y+461,22,'#55714f',500);}
    if(t>1.46){const b=ease((t-1.46)/.32);ctx.save();ctx.globalAlpha=b;pill('CSV crew sheet',x+40,y+499,'#e4edd9',C.ink,21);pill('Plan JSON',x+265,y+499,'#e4edd9',C.ink,21);ctx.restore();}
    ctx.restore();
    txt('Review → approve → export',102,707,35,C.white,500);txt('SMS + ISOXML integration planned',102,766,23,C.muted,500);
    if(t>.35&&t<1.3){const q=smooth((t-.35)/.57),cx=1534-q*110,cy=912-q*335;ctx.save();ctx.translate(cx,cy);ctx.fillStyle=C.ink;ctx.strokeStyle=C.white;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(4,44);ctx.lineTo(15,33);ctx.lineTo(25,51);ctx.lineTo(35,45);ctx.lineTo(24,28);ctx.lineTo(41,24);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();}
  }
  function playback(t){
    const close=t<1.65,local=close?t:t-1.65;
    world('baseline',535+t*34,{yaw:close?-.7+local*.2:-1.36+local*.25,distance:close?66-local*10:122-local*13,elevation:close?1.14:.88,follow:close?'R2':null});shade(close?.66:.56);
    heading(['PLAY IT','THROUGH.'],t,{y:360,size:140,gap:134,accent:1});
    pill('3D PLAN REPLAY',102,737,C.lime,C.ink,23);txt('Preview the work before the work.',103,844,33,C.white,500);
    const now=535+t*34;const h=Math.floor(now/60),m=Math.floor(now%60);box(1513,840,303,99,'rgba(5,33,21,.87)',8);txt(`${h}:${String(m).padStart(2,'0')} AM`,1664,886,37,C.lime,800,'center');txt('SIMULATED TIME',1664,917,14,C.muted,700,'center',2);
  }
  function hardware(t){
    world('baseline',600+t*20,{yaw:-1.1+t*.12,distance:158+t*12,elevation:.81});ctx.fillStyle='rgba(7,39,24,.85)';ctx.fillRect(0,0,W,H);
    const a=pop(t/.48);ctx.save();ctx.translate(960,515);ctx.scale(.95+.05*a,.95+.05*a);txt('ZERO',0,-74,224,C.lime,900,'center',-10);txt('NEW HARDWARE.',0,75,145,C.white,900,'center',-5);ctx.restore();
    txt('Open your browser. Explore the plan.',960,731,44,C.white,500,'center',-1);pill('Browser demo',600,820,'#284d36',C.white,24);pill('Portable offline replay',820,820,'#284d36',C.white,24);
    txt('No farm sensors or equipment installation required for the demo.',960,951,23,C.muted,500,'center');
  }
  function outro(t){
    world('baseline',635+t*16,{yaw:-.8+t*.09,distance:179+t*4,elevation:.75});ctx.fillStyle='rgba(5,33,21,.88)';ctx.fillRect(0,0,W,H);
    const a=ease(t/.45);ctx.save();ctx.translate(960,450);ctx.scale(.94+.06*a,.94+.06*a);txt('fieldwork',0,0,239,C.lime,900,'center',-13);ctx.restore();
    txt('A better next move.',960,583,65,C.white,600,'center',-2);
    box(627,718,666,91,C.lime,6);txt('OPEN THE BROWSER DEMO',945,775,27,C.ink,800,'center',.5);arrow(1212,763,.56,C.ink);
    txt('4 rigs. 6 applicators. 40 fields. One changing day.',960,890,25,C.muted,500,'center');
  }
  function render(t=0){
    if(!sim||!fixtures)return canvas;
    t=clamp(Number(t)||0,0,DURATION);currentTime=t;
    const index=Math.max(0,scenes.findIndex(s=>t>=s[0]&&(t<s[1]||s[1]===DURATION)));
    const scene=scenes[index],local=t-scene[0];
    ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.fillStyle=C.ink;ctx.fillRect(0,0,W,H);
    switch(scene[2]){case'hook':hook(local);break;case'rain':case'rig':case'wet':case'wind':disruption(local,scene[2]);break;case'move':move(local);break;case'options':options(local);break;case'timeline':timeline(local);break;case'update':update(local);break;case'approve':approve(local);break;case'playback':playback(local);break;case'hardware':hardware(local);break;case'outro':outro(local);break;}
    chrome(index,t);document.querySelector('#commercial-seek').value=String(t);document.querySelector('#commercial-time').textContent=`0:${String(Math.floor(t)).padStart(2,'0')} / 0:28`;return canvas;
  }
  function pause(){playing=false;cancelAnimationFrame(raf);document.querySelector('#commercial-play').textContent='Play commercial';}
  function tick(stamp){if(!playing)return;const t=startOffset+(stamp-startStamp)/1000;render(Math.min(DURATION,t));if(t>=DURATION)pause();else raf=requestAnimationFrame(tick);}
  function play(){if(playing){pause();return;}startOffset=currentTime>=DURATION?0:currentTime;startStamp=performance.now();playing=true;document.querySelector('#commercial-play').textContent='Pause';raf=requestAnimationFrame(tick);}
  const ready=(async()=>{
    const res=await fetch('demo-fixtures.json');if(!res.ok)throw new Error('Unable to load recorded demo plans.');fixtures=await res.json();meta=fixtures.metadata;
    sim=new Fieldwork3D(document.querySelector('#commercial-world'));if(!sim.available)throw new Error('WebGL is required for this commercial.');sim.setPlaying(false);sim.renderer.setPixelRatio(1);sim.resize();
    render(0);document.querySelector('#commercial-status').textContent='28 seconds · No audio · Recorded solver plans · Local demo only';return true;
  })();
  ready.catch(error=>{document.querySelector('#commercial-status').textContent=error.message;console.error(error);});
  document.querySelector('#commercial-play').addEventListener('click',()=>ready.then(play));
  document.querySelector('#commercial-seek').addEventListener('input',event=>{pause();render(Number(event.target.value));});
  window.commercialFilm={ready,duration:DURATION,canvas,render,pause,play,scenes:scenes.map(([start,end,id])=>({start,end,id}))};
})();
