// Execute via gstack browse eval on /launch.html. Recording continues in-page.
await launchFilm.ready;
launchFilm.pause();
launchFilm.render(0);
if(window.__filmRecording && !window.__filmRecording.done) throw new Error('A recording is already running.');
const filmStream=launchFilm.canvas.captureStream(30);
const filmRecorder=new MediaRecorder(filmStream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:7000000});
const filmChunks=[];
window.__filmRecording={done:false,frames:0,elapsed:0,dataUrl:null,error:null};
filmRecorder.ondataavailable=e=>{if(e.data.size)filmChunks.push(e.data);};
filmRecorder.onerror=e=>{window.__filmRecording.error=String(e.error||e);};
filmRecorder.onstop=()=>{
  filmStream.getTracks().forEach(track=>track.stop());
  const blob=new Blob(filmChunks,{type:'video/webm'}),reader=new FileReader();
  reader.onload=()=>{window.__filmRecording.dataUrl=reader.result;window.__filmRecording.bytes=blob.size;window.__filmRecording.done=true;};
  reader.onerror=()=>{window.__filmRecording.error='Could not read captured video.';};
  reader.readAsDataURL(blob);
};
filmRecorder.start(1000);
const filmStart=performance.now();
function recordFrame(stamp){
  const t=(stamp-filmStart)/1000;
  launchFilm.render(Math.min(t,54.999));
  window.__filmRecording.frames++;
  window.__filmRecording.elapsed=t;
  if(t>=55){filmRecorder.stop();return;}
  requestAnimationFrame(recordFrame);
}
requestAnimationFrame(recordFrame);
return {status:'recording',seconds:55,width:launchFilm.canvas.width,height:launchFilm.canvas.height};
