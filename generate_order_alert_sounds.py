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

def generate_bell_chime(output_path, duration=0.8):
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
    raw_en_full = os.path.join(AUDIO_DIR, "raw_en_full.mp3")
    raw_mr_full = os.path.join(AUDIO_DIR, "raw_mr_full.mp3")
    raw_en_short = os.path.join(AUDIO_DIR, "raw_en_short.mp3")
    raw_mr_short = os.path.join(AUDIO_DIR, "raw_mr_short.mp3")
    
    gTTS('Attention! New order received on Dropzyy. Please check kitchen ticket.', lang='en', tld='co.in', slow=False).save(raw_en_full)
    gTTS('लक्ष द्या! ड्रॉपझीवर नवीन ऑर्डर प्राप्त झाली आहे! कृपया किचन तिकीट तपासा.', lang='mr', slow=False).save(raw_mr_full)
    gTTS('New order on Dropzyy!', lang='en', tld='co.in', slow=False).save(raw_en_short)
    gTTS('ड्रॉपझीवर नवीन ऑर्डर आली आहे!', lang='mr', slow=False).save(raw_mr_short)
    
    # 1. Telegram Notification Tone (Under 5 seconds - strictly compatible with Telegram Custom Sound)
    tone_out = os.path.join(AUDIO_DIR, "dropzyy_order_tone_bilingual.mp3")
    subprocess.run([
        ffmpeg_exe, '-y',
        '-i', bell_path,
        '-i', raw_en_short,
        '-i', raw_mr_short,
        '-filter_complex', '[0:a][1:a][2:a]concat=n=3:v=0:a=1[cat];[cat]atempo=1.25,volume=1.5[out]',
        '-map', '[out]',
        '-b:a', '128k',
        tone_out
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    
    # 2. Full Bilingual Announcement (English + Marathi with Kitchen Bell)
    full_out = os.path.join(AUDIO_DIR, "dropzyy_order_alert_bilingual.mp3")
    subprocess.run([
        ffmpeg_exe, '-y',
        '-i', bell_path,
        '-i', raw_en_full,
        '-i', raw_mr_full,
        '-filter_complex', '[0:a][1:a][2:a]concat=n=3:v=0:a=1[cat];[cat]volume=1.4[out]',
        '-map', '[out]',
        '-b:a', '192k',
        full_out
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    
    # 3. Marathi Order Alert
    mr_out = os.path.join(AUDIO_DIR, "dropzyy_order_alert_marathi.mp3")
    subprocess.run([
        ffmpeg_exe, '-y',
        '-i', bell_path,
        '-i', raw_mr_full,
        '-filter_complex', '[0:a][1:a]concat=n=2:v=0:a=1[cat];[cat]volume=1.4[out]',
        '-map', '[out]',
        '-b:a', '192k',
        mr_out
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    
    # 4. English Order Alert
    en_out = os.path.join(AUDIO_DIR, "dropzyy_order_alert_english.mp3")
    subprocess.run([
        ffmpeg_exe, '-y',
        '-i', bell_path,
        '-i', raw_en_full,
        '-filter_complex', '[0:a][1:a]concat=n=2:v=0:a=1[cat];[cat]volume=1.4[out]',
        '-map', '[out]',
        '-b:a', '192k',
        en_out
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    
    # Clean up temp raws
    for r in [raw_en_full, raw_mr_full, raw_en_short, raw_mr_short]:
        if os.path.exists(r):
            os.remove(r)
            
    print("All Dropzyy order alert MP3 files successfully generated in 'audio/' folder!")
    for f in os.listdir(AUDIO_DIR):
        fp = os.path.join(AUDIO_DIR, f)
        print(f" - {f}: {os.path.getsize(fp):,} bytes")

if __name__ == "__main__":
    generate_all_sounds()
