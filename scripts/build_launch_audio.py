"""Generate original low-key music, system-voice narration and captions locally.

Requires macOS `say`, numpy (already required by OR-Tools), and imageio-ffmpeg.
No accounts, external audio, or voice impersonation.
"""
from pathlib import Path
import math
import subprocess
import textwrap
import wave

import imageio_ffmpeg
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output'
AUDIO = OUT / 'audio'
RATE = 48000
DURATION = 55
STARTS = [0, 7, 14, 23, 31, 38, 46]
ENDS = STARTS[1:] + [DURATION]
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()


def stamp(seconds):
    ms = round(seconds * 1000)
    return f'{ms // 3600000:02}:{ms // 60000 % 60:02}:{ms // 1000 % 60:02},{ms % 1000:03}'


def main():
    AUDIO.mkdir(parents=True, exist_ok=True)
    paragraphs = [p.strip() for p in (ROOT / 'docs/launch-script.txt').read_text().split('\n\n') if p.strip()]
    assert len(paragraphs) == 7, 'One narration paragraph per scene is required.'
    speech = np.zeros(RATE * DURATION, dtype=np.float64)
    captions = []
    for i, (paragraph, start, end) in enumerate(zip(paragraphs, STARTS, ENDS)):
        aiff, wav = AUDIO / f'voice-{i+1}.aiff', AUDIO / f'voice-{i+1}.wav'
        subprocess.run(['say', '-v', 'Samantha', '-r', '151', '-o', str(aiff), paragraph], check=True)
        subprocess.run([FFMPEG, '-y', '-v', 'error', '-i', str(aiff), '-ar', str(RATE), '-ac', '1', str(wav)], check=True)
        with wave.open(str(wav)) as sound:
            samples = np.frombuffer(sound.readframes(sound.getnframes()), dtype='<i2').astype(np.float64) / 32768
        allowance = (end - start - .8) * RATE
        if len(samples) > allowance:
            speed = len(samples) / allowance
            subprocess.run([FFMPEG, '-y', '-v', 'error', '-i', str(aiff), '-af', f'atempo={speed:.6f}', '-ar', str(RATE), '-ac', '1', str(wav)], check=True)
            with wave.open(str(wav)) as sound:
                samples = np.frombuffer(sound.readframes(sound.getnframes()), dtype='<i2').astype(np.float64) / 32768
        peak = np.max(np.abs(samples))
        if peak: samples *= .73 / peak
        speech_start = start + .38
        offset = round(speech_start * RATE)
        speech[offset:offset + len(samples)] += samples
        spoken_end = speech_start + len(samples) / RATE
        captions.append(f'{i+1}\n{stamp(speech_start)} --> {stamp(spoken_end)}\n{textwrap.fill(paragraph, 62)}\n')
        print(f'Chapter {i+1}: {len(samples)/RATE:.2f}s narration in {end-start}s scene')

    # Original quiet chord texture. It sits below the narration, with no sampled music.
    bed = np.zeros(RATE * DURATION, dtype=np.float64)
    chords = [[146.832, 184.997, 220.000], [123.471, 146.832, 184.997],
              [97.999, 123.471, 146.832], [110.000, 138.591, 164.814]]
    for i, start in enumerate(range(0, DURATION, 7)):
        length = min(8, DURATION - start)
        t = np.arange(round(length * RATE)) / RATE
        envelope = np.minimum(1, t / 1.3) * np.minimum(1, (length - t) / 2)
        tone = np.zeros_like(t)
        for j, hz in enumerate(chords[i % 4]):
            tone += (.0055 * np.sin(2 * math.pi * hz * t + j*.6)
                     + .0014 * np.sin(2 * math.pi * hz * 2 * t))
        offset = start * RATE
        bed[offset:offset+len(t)] += tone * envelope
    mix = speech + bed
    fade = min(2 * RATE, len(mix))
    mix[-fade:] *= np.linspace(1, 0, fade)
    mix = np.clip(mix, -.99, .99)
    with wave.open(str(OUT / 'launch-audio.wav'), 'wb') as output:
        output.setparams((1, 2, RATE, len(mix), 'NONE', 'not compressed'))
        output.writeframes((mix * 32767).astype('<i2').tobytes())
    (OUT / 'Fieldwork-launch.srt').write_text('\n'.join(captions))
    print('Created 55-second narration and original music bed, plus captions.')


if __name__ == '__main__':
    main()
