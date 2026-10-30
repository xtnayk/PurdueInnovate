"""Export the 28-second silent commercial, verify decoding, and save QA frames."""
from pathlib import Path
import json
import re
import shutil
import subprocess
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output'
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
result = OUT / 'Fieldwork-commercial.mp4'
subprocess.run([
    FFMPEG, '-y', '-v', 'warning', '-i', str(OUT / 'commercial-capture.ivf'),
    '-map', '0:v:0', '-an', '-sn', '-t', '28',
    '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
    '-metadata', 'title=Fieldwork | A better next move',
    '-metadata', 'comment=Silent commercial. Prototype with synthetic data. Local approval demonstration.',
    '-movflags', '+faststart', str(result)
], check=True)
decode = subprocess.run([FFMPEG, '-v', 'error', '-i', str(result), '-progress', 'pipe:1',
                         '-nostats', '-f', 'null', '-'], capture_output=True, text=True, check=True)
frame_count = int(re.findall(r'^frame=(\d+)$', decode.stdout, re.MULTILINE)[-1])
if frame_count != 840:
    raise RuntimeError(f'Expected 840 decoded frames; got {frame_count}.')
probe = subprocess.run([FFMPEG, '-hide_banner', '-i', str(result)], capture_output=True, text=True)
info = probe.stderr
if re.search(r'Stream #.*Audio:', info):
    raise RuntimeError('The commercial must not contain an audio stream.')
if len(re.findall(r'Stream #.*Video:', info)) != 1:
    raise RuntimeError('Expected exactly one video stream.')
reader = imageio_ffmpeg.read_frames(str(result))
meta = next(reader)
reader.close()
if meta['size'] != (1920, 1080) or abs(meta['duration'] - 28) > .1 or meta['fps'] != 30:
    raise RuntimeError(f'Unexpected commercial metadata: {meta}')
frames = OUT / 'commercial-qa'
frames.mkdir(exist_ok=True)
for seconds in [0, 1, 2.6, 3.8, 5, 6.2, 7.5, 9.5, 12.8, 15.3, 18.1, 21, 23.5, 26.5, 27.9]:
    subprocess.run([FFMPEG, '-y', '-v', 'error', '-ss', str(seconds), '-i', str(result),
                    '-frames:v', '1', str(frames / f'frame-{seconds:04.1f}.jpg')], check=True)
poster = OUT / 'Fieldwork-commercial-poster.jpg'
shutil.copy2(frames / 'frame-26.5.jpg', poster)
served = ROOT / 'web' / 'downloads'
served.mkdir(exist_ok=True)
shutil.copy2(result, served / result.name)
shutil.copy2(poster, served / poster.name)
report = {'duration_seconds': meta['duration'], 'width': 1920, 'height': 1080,
          'fps': meta['fps'], 'decoded_frames': frame_count, 'audio_streams': 0, 'fully_decoded': True,
          'file_bytes': result.stat().st_size}
(OUT / 'commercial-verification.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
print(result)
