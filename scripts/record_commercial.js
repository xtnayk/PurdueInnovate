// Run with gstack browse eval on /commercial.html. Deterministic export continues in-page.
// WebCodecs assigns exact timestamps, so a slow 3D renderer never drops animation frames.
await commercialFilm.ready;
commercialFilm.pause();
if (window.__commercialExport && !window.__commercialExport.done) {
  throw new Error('A commercial export is already running.');
}
if (window.__commercialRecording && !window.__commercialRecording.done) {
  throw new Error('Wait for the earlier live capture to finish before exporting.');
}
const exportFps = 30;
const exportFrames = Math.round(commercialFilm.duration * exportFps);
const exportConfig = {codec: 'vp09.00.41.08', width: 1920, height: 1080,
  bitrate: 10000000, framerate: exportFps, latencyMode: 'quality'};
const codecSupport = await VideoEncoder.isConfigSupported(exportConfig);
if (!codecSupport.supported) throw new Error('This browser cannot encode the commercial with VP9.');
window.__commercialExport = {done: false, frames: 0, total: exportFrames, dataUrl: null, error: null};
void (async () => {
  const chunks = [];
  let encoderError;
  const encoder = new VideoEncoder({
    output(chunk) {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      chunks.push({timestamp: chunk.timestamp, data});
    },
    error(error) { encoderError = error; }
  });
  encoder.configure(exportConfig);
  for (let index = 0; index < exportFrames; index++) {
    if (encoderError) throw encoderError;
    commercialFilm.render(index / exportFps);
    const frame = new VideoFrame(commercialFilm.canvas, {
      timestamp: Math.round(index * 1000000 / exportFps),
      duration: Math.round(1000000 / exportFps)
    });
    encoder.encode(frame, {keyFrame: index % 60 === 0});
    frame.close();
    window.__commercialExport.frames = index + 1;
    if (encoder.encodeQueueSize > 6) await encoder.flush();
    if (index % 3 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  await encoder.flush();
  encoder.close();
  if (encoderError) throw encoderError;
  if (chunks.length !== exportFrames) throw new Error(`Expected ${exportFrames} frames; got ${chunks.length}.`);
  chunks.sort((a, b) => a.timestamp - b.timestamp);
  // IVF stores the VP9 bitstream with a 30/1 timebase and exact frame indices.
  const header = new Uint8Array(32);
  header.set(new TextEncoder().encode('DKIF'), 0);
  header.set(new TextEncoder().encode('VP90'), 8);
  const dv = new DataView(header.buffer);
  dv.setUint16(4, 0, true); dv.setUint16(6, 32, true);
  dv.setUint16(12, 1920, true); dv.setUint16(14, 1080, true);
  dv.setUint32(16, exportFps, true); dv.setUint32(20, 1, true);
  dv.setUint32(24, chunks.length, true);
  const parts = [header];
  chunks.forEach((chunk, index) => {
    const frameHeader = new Uint8Array(12);
    const view = new DataView(frameHeader.buffer);
    view.setUint32(0, chunk.data.byteLength, true);
    view.setBigUint64(4, BigInt(index), true);
    parts.push(frameHeader, chunk.data);
  });
  const blob = new Blob(parts, {type: 'video/x-ivf'});
  const reader = new FileReader();
  reader.onload = () => Object.assign(window.__commercialExport,
    {dataUrl: reader.result, bytes: blob.size, encodedFrames: chunks.length, done: true});
  reader.onerror = () => { window.__commercialExport.error = 'Could not read encoded video.'; };
  reader.readAsDataURL(blob);
})().catch(error => { window.__commercialExport.error = String(error); });
return {status: 'exporting exact frames', seconds: commercialFilm.duration,
  frames: exportFrames, fps: exportFps, audioTracks: 0, width: 1920, height: 1080};
