"""Mux recorded canvas, aligned narration/music and selectable captions to MP4."""
from pathlib import Path
import shutil
import subprocess
import imageio_ffmpeg

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output'
ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
result=OUT/'Fieldwork-launch.mp4'
subprocess.run([ffmpeg,'-y','-v','warning','-i',str(OUT/'launch-capture.webm'),
                '-i',str(OUT/'launch-audio.wav'),'-i',str(OUT/'Fieldwork-launch.srt'),
                '-map','0:v:0','-map','1:a:0','-map','2:0','-t','55',
                '-vf','fps=30,format=yuv420p','-c:v','libx264','-preset','medium','-crf','19',
                '-c:a','aac','-b:a','160k','-ar','48000','-af','loudnorm=I=-16:TP=-1.5:LRA=9',
                '-c:s','mov_text','-metadata:s:s:0','language=eng',
                '-metadata','title=Fieldwork — a clearer plan for a changing day',
                '-metadata','comment=Prototype with synthetic data. System-voice narration and original synthesized music. No live dispatch.',
                '-movflags','+faststart',str(result)],check=True)
subprocess.run([ffmpeg,'-v','error','-i',str(result),'-f','null','-'],check=True)
subprocess.run([ffmpeg,'-y','-v','error','-ss','3','-i',str(result),'-frames:v','1',str(OUT/'Fieldwork-launch-poster.jpg')],check=True)
served=ROOT/'web/downloads'
served.mkdir(exist_ok=True)
shutil.copy2(result,served/result.name)
shutil.copy2(OUT/'Fieldwork-launch-poster.jpg',served/'Fieldwork-launch-poster.jpg')
print(f'Created and fully decoded {result} ({result.stat().st_size:,} bytes)')
