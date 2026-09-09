"""
Aura Music - Direct Audio Stream Resolver Module
Multi-tiered engine: Piped API -> Invidious API -> Local yt-dlp Core
"""

import sys
import io
import time
import json
import urllib.request
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
import yt_dlp

if sys.stdout.encoding.lower() != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

# Active public Piped & Invidious instances
PIPED_INSTANCES = [
    'https://pipedapi.kavin.rocks',
    'https://api.piped.privacydev.net',
    'https://pipedapi.tokhmi.xyz',
    'https://pipedapi.moomoo.me',
    'https://piped.mha.fi',
    'https://piped-api.lunar.icu',
    'https://api.piped.projectsegfau.lt'
]

INVIDIOUS_INSTANCES = [
    'https://invidious.nerdvpn.de',
    'https://inv.nadeko.net',
    'https://invidious.f5.si',
    'https://yt.chocolatemoo53.com',
    'https://invidious.tiekoetter.com',
    'https://yewtu.be'
]

# In-memory LRU-style cache with expiration
_STREAM_CACHE = {}

class AudioStreamResolver:
    def __init__(self):
        self.ydl_opts = {
            'format': 'bestaudio[ext=m4a]/bestaudio/best',
            'quiet': True,
            'no_warnings': True,
            'skip_download': True,
            'extract_flat': False,
            'socket_timeout': 8,
        }

    def resolve(self, video_id: str, force_refresh: bool = False) -> dict:
        video_id = video_id.strip()
        if not video_id:
            raise ValueError("video_id cannot be empty")

        if force_refresh:
            _STREAM_CACHE.pop(video_id, None)
            print(f"[StreamResolver] Force refresh stream for {video_id}", flush=True)

        now = time.time()
        # 1. Check in-memory cache
        if not force_refresh and video_id in _STREAM_CACHE:
            cached = _STREAM_CACHE[video_id]
            if cached['expiresAt'] > now:
                print(f"[StreamResolver] Cache HIT for {video_id} (source: {cached['source']})", flush=True)
                return cached

        # 2. Try Public Piped API instances concurrently
        piped_result = self._try_piped(video_id)
        if piped_result:
            _STREAM_CACHE[video_id] = piped_result
            return piped_result

        # 3. Try Public Invidious API instances concurrently
        invidious_result = self._try_invidious(video_id)
        if invidious_result:
            _STREAM_CACHE[video_id] = invidious_result
            return invidious_result

        # 4. Fallback: Local yt-dlp native extraction (Ultra reliable)
        ytdlp_result = self._try_ytdlp(video_id)
        if ytdlp_result:
            _STREAM_CACHE[video_id] = ytdlp_result
            return ytdlp_result

        raise RuntimeError(f"All stream resolution tiers failed for video {video_id}")

    def _check_piped_instance(self, inst: str, video_id: str):
        try:
            url = f"{inst}/streams/{video_id}"
            req = urllib.request.Request(
                url,
                headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
            )
            with urllib.request.urlopen(req, timeout=2.0) as response:
                data = json.loads(response.read().decode('utf-8'))
                audio_streams = data.get('audioStreams', [])
                if audio_streams:
                    audio_streams.sort(key=lambda s: s.get('bitrate', 0), reverse=True)
                    top_audio = audio_streams[0]
                    stream_url = top_audio.get('url')
                    if stream_url:
                        return {
                            'videoId': video_id,
                            'streamUrl': stream_url,
                            'source': 'piped',
                            'instance': inst,
                            'format': top_audio.get('format', 'm4a'),
                            'mimeType': top_audio.get('mimeType', 'audio/mp4'),
                            'bitrate': top_audio.get('bitrate', 128000),
                            'duration': data.get('duration', 0),
                            'expiresAt': time.time() + 2700 # 45 minutes fresh cache
                        }
        except Exception:
            pass
        return None

    def _try_piped(self, video_id: str):
        try:
            with ThreadPoolExecutor(max_workers=len(PIPED_INSTANCES)) as executor:
                futures = [executor.submit(self._check_piped_instance, inst, video_id) for inst in PIPED_INSTANCES]
                for future in as_completed(futures, timeout=3.0):
                    res = future.result()
                    if res:
                        print(f"[StreamResolver] Resolved via Piped [{res.get('instance')}]", flush=True)
                        return res
        except Exception:
            pass
        return None

    def _check_invidious_instance(self, inst: str, video_id: str):
        try:
            url = f"{inst}/api/v1/videos/{video_id}"
            req = urllib.request.Request(
                url,
                headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
            )
            with urllib.request.urlopen(req, timeout=2.0) as response:
                data = json.loads(response.read().decode('utf-8'))
                audio_formats = [f for f in data.get('adaptiveFormats', []) if f.get('type', '').startswith('audio/')]
                if audio_formats:
                    audio_formats.sort(key=lambda f: int(f.get('bitrate') or 0), reverse=True)
                    top_audio = audio_formats[0]
                    stream_url = top_audio.get('url')
                    if stream_url:
                        return {
                            'videoId': video_id,
                            'streamUrl': stream_url,
                            'source': 'invidious',
                            'instance': inst,
                            'format': top_audio.get('container', 'webm'),
                            'mimeType': top_audio.get('type', 'audio/webm'),
                            'bitrate': int(top_audio.get('bitrate') or 128000),
                            'duration': data.get('lengthSeconds', 0),
                            'expiresAt': time.time() + 2700 # 45 minutes fresh cache
                        }
        except Exception:
            pass
        return None

    def _try_invidious(self, video_id: str):
        try:
            with ThreadPoolExecutor(max_workers=len(INVIDIOUS_INSTANCES)) as executor:
                futures = [executor.submit(self._check_invidious_instance, inst, video_id) for inst in INVIDIOUS_INSTANCES]
                for future in as_completed(futures, timeout=3.0):
                    res = future.result()
                    if res:
                        print(f"[StreamResolver] Resolved via Invidious [{res.get('instance')}]", flush=True)
                        return res
        except Exception:
            pass
        return None

    def _try_ytdlp(self, video_id: str):
        try:
            yt_url = f"https://www.youtube.com/watch?v={video_id}"
            with yt_dlp.YoutubeDL(self.ydl_opts) as ydl:
                info = ydl.extract_info(yt_url, download=False)
                stream_url = info.get('url', '')
                duration = info.get('duration', 0)
                ext = info.get('ext', 'm4a')
                bitrate = info.get('abr', 128)
                print(f"[StreamResolver] Resolved via Local yt-dlp Native Engine", flush=True)
                return {
                    'videoId': video_id,
                    'streamUrl': stream_url,
                    'source': 'yt-dlp',
                    'format': ext,
                    'mimeType': f'audio/{ext}',
                    'bitrate': bitrate * 1000 if isinstance(bitrate, (int, float)) else 128000,
                    'duration': duration,
                    'expiresAt': time.time() + 2700 # 45 minutes fresh cache
                }
        except Exception as e:
            print(f"[StreamResolver] yt-dlp error: {e}", file=sys.stderr, flush=True)
            return None

# Singleton instance
stream_resolver = AudioStreamResolver()

if __name__ == '__main__':
    # CLI test mode
    vid = sys.argv[1] if len(sys.argv) > 1 else '4ujBQOzs6Lw'
    print(f"Testing stream resolution for Video ID: {vid}")
    res = stream_resolver.resolve(vid)
    print("RESULT:")
    print(json.dumps({
        'videoId': res['videoId'],
        'source': res['source'],
        'format': res['format'],
        'duration': res['duration'],
        'streamUrl': res['streamUrl'][:80] + '...'
    }, indent=2))
