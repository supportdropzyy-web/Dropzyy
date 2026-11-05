import math
import struct
import wave
import os
import subprocess
import imageio_ffmpeg
from gtts import gTTS

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
AUDIO_DIR = os.path.join(BASE_DIR, "audio")
os.makedirs(AUDIO_DIR, exist_ok=True)

ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()

def generate_bell_chime(output_path):
    """Synthesizes a pleasant dual-tone kitchen order bell chime (Ding-Dong)"""
    sample_rate = 44100
    samples = []
    
    # E5 (659.25 Hz) ding, then C5 (523.25 Hz) dong
    part1 = int(sample_rate * 0.35)
    part2 = int(sample_rate * 0.45)
    
    for i in range(part1):
        t = i / sample_rate
        decay = math.exp(-7.0 * (i / part1))
        val = 0.75 * math.sin(2 * math.pi * 659.25 * t) + 0.25 * math.sin(2 * math.pi * 1318.5 * t)
        samples.append(int(val * decay * 32767))
        
    for i in range(part2):
        t = i / sample_rate
        decay = math.exp(-5.5 * (i / part2))
        val = 0.75 * math.sin(2 * math.pi * 523.25 * t) + 0.25 * math.sin(2 * math.pi * 1046.5 * t)
        samples.append(int(val * decay * 32767))
        
    wav_path = os.path.join(AUDIO_DIR, "temp_bell.wav")
    with wave.open(wav_path, 'w') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(struct.pack(f'<{len(samples)}h', *samples))
        
    subprocess.run([
        ffmpeg_exe, '-y', '-i', wav_path, '-b:a', '192k', output_path
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if os.path.exists(wav_path):
        os.remove(wav_path)
    return output_path

def generate_all_sounds():
    bell_path = os.path.join(AUDIO_DIR, "bell.mp3")
    generate_bell_chime(bell_path)
    
    # Raw speech tracks
    raw_en_p1 = os.path.join(AUDIO_DIR, "temp_en_p1.mp3")
    raw_en_p2 = os.path.join(AUDIO_DIR, "temp_en_p2.mp3")
    raw_en_quick = os.path.join(AUDIO_DIR, "temp_en_quick.mp3")
    
    # Primary English speech
    gTTS('Attention! New order received on Dropzyy! Please check kitchen ticket immediately and start preparation.', lang='en', tld='co.in', slow=False).save(raw_en_p1)
    gTTS('New order on Dropzyy! Start order now.', lang='en', tld='co.in', slow=False).save(raw_en_p2)
    gTTS('New order on Dropzyy! Check kitchen ticket now!', lang='en', tld='co.in', slow=False).save(raw_en_quick)
    
    # 1. PRIMARY 10-SECOND ENGLISH ORDER ALERT (Bell + Urgent Speech + Bell + Reminder)
    en_10s_path = os.path.join(AUDIO_DIR, "dropzyy_order_alert_english_10s.mp3")
    subprocess.run([
        ffmpeg_exe, '-y',
        '-i', bell_path,
        '-i', raw_en_p1,
        '-i', bell_path,
        '-i', raw_en_p2,
        '-filter_complex', '[0:a][1:a][2:a][3:a]concat=n=4:v=0:a=1[cat];[cat]atempo=1.28,volume=1.5[out]',
        '-map', '[out]',
        '-b:a', '192k',
        en_10s_path
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    
    # Also save as default dropzyy_order_alert_english.mp3 and dropzyy_order_tone_bilingual.mp3 for backward compatibility
    import shutil
    shutil.copyfile(en_10s_path, os.path.join(AUDIO_DIR, "dropzyy_order_alert_english.mp3"))
    shutil.copyfile(en_10s_path, os.path.join(AUDIO_DIR, "dropzyy_order_tone_bilingual.mp3"))
    
    # 2. 5-SECOND FAST ENGLISH TONE (Under 5s Telegram Tone)
    en_5s_path = os.path.join(AUDIO_DIR, "dropzyy_order_tone_english_5s.mp3")
    subprocess.run([
        ffmpeg_exe, '-y',
        '-i', bell_path,
        '-i', raw_en_quick,
        '-filter_complex', '[0:a][1:a]concat=n=2:v=0:a=1[cat];[cat]atempo=1.2,volume=1.5[out]',
        '-map', '[out]',
        '-b:a', '128k',
        en_5s_path
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    
    # Clean up temp raws
    for r in [raw_en_p1, raw_en_p2, raw_en_quick]:
        if os.path.exists(r):
            os.remove(r)
            
    print("All English order alert MP3 files successfully generated in 'audio/' folder!")
    for f in sorted(os.listdir(AUDIO_DIR)):
        fp = os.path.join(AUDIO_DIR, f)
        if os.path.isfile(fp):
            chk = subprocess.run([ffmpeg_exe, '-i', fp], stderr=subprocess.PIPE, text=True)
            dur = 'unknown'
            for line in chk.stderr.splitlines():
                if 'Duration:' in line:
                    dur = line.split('Duration:')[1].split(',')[0].strip()
            print(f" - {f}: {os.path.getsize(fp):,} bytes | Duration: {dur}")

if __name__ == "__main__":
    generate_all_sounds()
