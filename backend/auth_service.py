"""
Aura Music - YouTube Music OAuth & AI Recommendation Service
Handles OAuth Device Code flow, history extraction (get_history)
and Gemini AI Music DNA & Recommendation engine.
"""

import os
import sys
import json
import time
import urllib.request
import urllib.parse
import urllib.error
from pathlib import Path
from ytmusicapi import YTMusic
from ytmusicapi.auth.oauth.credentials import OAuthCredentials

OAUTH_FILE = Path(__file__).parent / "oauth.json"
SETTINGS_FILE = Path(__file__).parent / "settings.json"

class AuthService:
    def __init__(self):
        self.active_auth_session = None # stores credentials and device_code
        self.cached_yt = None

    def get_device_code(self, client_id: str, client_secret: str) -> dict:
        """Starts OAuth Device Code flow via Google Device Flow endpoint"""
        client_id = client_id.strip()
        client_secret = client_secret.strip()
        if not client_id or not client_secret:
            raise ValueError("Cần cung cấp Google Client ID và Client Secret cho Device Flow.")

        credentials = OAuthCredentials(client_id, client_secret)
        code_data = credentials.get_code()
        self.active_auth_session = {
            'credentials': credentials,
            'code_data': code_data,
            'client_id': client_id,
            'client_secret': client_secret,
            'started_at': time.time()
        }

        return {
            'userCode': code_data.get('user_code'),
            'deviceCode': code_data.get('device_code'),
            'verificationUrl': code_data.get('verification_url') or 'https://www.google.com/device',
            'expiresIn': code_data.get('expires_in', 1800),
            'interval': code_data.get('interval', 5)
        }

    def poll_token(self, device_code: str = None) -> dict:
        """Polls Google OAuth endpoint for token authorization from user"""
        if not self.active_auth_session:
            raise RuntimeError("Chưa có phiên Device Flow nào đang hoạt động.")

        credentials = self.active_auth_session['credentials']
        dev_code = device_code or self.active_auth_session['code_data']['device_code']

        try:
            token = credentials.token_from_code(dev_code)
            if 'error' in token:
                err = token.get('error')
                if err in ('authorization_pending', 'slow_down'):
                    return {'status': 'pending', 'message': 'Đang chờ người dùng nhập mã tại Google...'}
                return {'status': 'error', 'message': token.get('error_description', err)}

            # Successfully authenticated! Save token to oauth.json
            with open(OAUTH_FILE, 'w', encoding='utf-8') as f:
                json.dump(token, f, indent=2)

            self.cached_yt = None
            return {'status': 'success', 'token': token}
        except Exception as e:
            return {'status': 'pending', 'message': str(e)}

    def save_manual_token(self, token_data: dict) -> bool:
        """Allows direct token or cookie save"""
        try:
            with open(OAUTH_FILE, 'w', encoding='utf-8') as f:
                json.dump(token_data, f, indent=2)
            self.cached_yt = None
            return True
        except Exception as e:
            print(f"Failed to save manual token: {e}", file=sys.stderr)
            return False

    def save_cookie_auth(self, cookie_str: str, account_name: str = '') -> dict:
        """Saves browser session cookies (Cookie / SAPISID / SSID) for ytmusicapi"""
        try:
            cookie_clean = cookie_str.strip()
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "Accept": "*/*",
                "Accept-Language": "en-US,en;q=0.9",
                "Content-Type": "application/json",
                "X-Goog-AuthUser": "0",
                "x-origin": "https://music.youtube.com",
                "Cookie": cookie_clean,
                "accountName": account_name or 'YouTube Music User'
            }
            with open(OAUTH_FILE, 'w', encoding='utf-8') as f:
                json.dump(headers, f, indent=2)
            self.cached_yt = None

            detected_name = account_name
            try:
                self.cached_yt = YTMusic(str(OAUTH_FILE))
                if hasattr(self.cached_yt, 'get_account_info'):
                    acc = self.cached_yt.get_account_info()
                    if acc and isinstance(acc, dict):
                        detected_name = acc.get('accountName') or acc.get('name') or detected_name
            except Exception:
                pass

            return {'success': True, 'accountName': detected_name or 'YouTube Music User'}
        except Exception as e:
            print(f"Failed to save cookie auth: {e}", file=sys.stderr)
            return {'success': False, 'error': str(e)}

    def get_auth_status(self) -> dict:
        """Checks if logged in and returns account info"""
        if not OAUTH_FILE.exists():
            return {'authenticated': False}

        try:
            account_name = ''
            if OAUTH_FILE.exists():
                try:
                    with open(OAUTH_FILE, 'r', encoding='utf-8') as f:
                        file_data = json.load(f)
                        account_name = file_data.get('accountName', '')
                except Exception:
                    pass

            if not self.cached_yt:
                self.cached_yt = YTMusic(str(OAUTH_FILE))
            # Test getting account info
            account = self.cached_yt.get_account_info() if hasattr(self.cached_yt, 'get_account_info') else {}
            if account and isinstance(account, dict):
                account_name = account.get('accountName') or account.get('name') or account_name

            return {
                'authenticated': True,
                'account': account,
                'accountName': account_name or 'YouTube Music User'
            }
        except Exception as e:
            return {'authenticated': False, 'error': str(e)}

    def get_user_history(self, limit: int = 30) -> list:
        """Fetches recent listening history from YouTube Music"""
        if not OAUTH_FILE.exists():
            raise RuntimeError("Chưa liên kết tài khoản YouTube Music.")

        if not self.cached_yt:
            self.cached_yt = YTMusic(str(OAUTH_FILE))

        history = self.cached_yt.get_history()
        results = []
        for item in history[:limit]:
            thumbs = item.get('thumbnails', [])
            thumb = thumbs[-1]['url'] if thumbs else ''
            artists = item.get('artists', [])
            artist_name = artists[0]['name'] if artists else 'Unknown Artist'
            album_info = item.get('album')
            album_name = album_info.get('name', '') if isinstance(album_info, dict) else ''

            results.append({
                'id': item.get('videoId', ''),
                'title': item.get('title', ''),
                'artist': artist_name,
                'album': album_name,
                'duration': item.get('duration_seconds') or 0,
                'thumbnail': thumb,
                'playedDate': item.get('played', '')
            })

        return results

    def logout(self) -> bool:
        """Clears oauth token"""
        try:
            if OAUTH_FILE.exists():
                OAUTH_FILE.unlink()
            self.cached_yt = None
            self.active_auth_session = None
            return True
        except Exception:
            return False


class AIRecommender:
    def __init__(self):
        pass

    def get_api_keys(self, provided_keys=None) -> list:
        """Retrieves and deduplicates Gemini API keys from multiple sources"""
        keys = []
        if provided_keys:
            if isinstance(provided_keys, list):
                keys.extend([k.strip() for k in provided_keys if isinstance(k, str) and k.strip()])
            elif isinstance(provided_keys, str):
                for k in provided_keys.replace('\n', ',').replace(';', ',').split(','):
                    if k.strip():
                        keys.append(k.strip())

        # Environment
        env_keys = os.environ.get('GEMINI_API_KEYS') or os.environ.get('GEMINI_API_KEY') or os.environ.get('GOOGLE_API_KEY')
        if env_keys:
            for k in env_keys.replace(';', ',').split(','):
                if k.strip():
                    keys.append(k.strip())

        # Settings file
        if SETTINGS_FILE.exists():
            try:
                with open(SETTINGS_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    stored = data.get('geminiApiKeys') or data.get('geminiApiKey')
                    if isinstance(stored, list):
                        keys.extend([k.strip() for k in stored if isinstance(k, str) and k.strip()])
                    elif isinstance(stored, str):
                        for k in stored.replace('\n', ',').replace(';', ',').split(','):
                            if k.strip():
                                keys.append(k.strip())
            except Exception:
                pass

        # Deduplicate while preserving order
        seen = set()
        deduped = []
        for k in keys:
            if k not in seen:
                seen.add(k)
                deduped.append(k)
        return deduped

    def save_api_keys(self, keys) -> bool:
        """Persists multiple Gemini API keys to settings.json"""
        try:
            cleaned = []
            if isinstance(keys, list):
                cleaned = [k.strip() for k in keys if isinstance(k, str) and k.strip()]
            elif isinstance(keys, str):
                for k in keys.replace('\n', ',').replace(';', ',').split(','):
                    if k.strip():
                        cleaned.append(k.strip())

            data = {}
            if SETTINGS_FILE.exists():
                try:
                    with open(SETTINGS_FILE, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                except Exception:
                    data = {}
            data['geminiApiKeys'] = cleaned
            with open(SETTINGS_FILE, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)
            return True
        except Exception as e:
            print(f"Failed to save Gemini API keys: {e}", file=sys.stderr)
            return False

    def analyze_and_recommend(self, history_tracks: list = None, guest_artists: list = None, guest_genres: list = None, api_key = None) -> dict:
        keys = self.get_api_keys(api_key)
        history_tracks = history_tracks or []
        guest_artists = guest_artists or []
        guest_genres = guest_genres or []

        if not keys:
            print("[AIRecommender] No Gemini API keys found, falling back to smart heuristic.", file=sys.stderr)
            return self._heuristic_fallback(history_tracks, guest_artists, guest_genres)

        if guest_artists or guest_genres:
            prompt_context = f"""
Người dùng đang ở chế độ Trải nghiệm ngay (Guest Mode) và đã chọn gu âm nhạc:
- Nghệ sĩ yêu thích: {', '.join(guest_artists) if guest_artists else 'Nghệ sĩ Indie/V-Pop đương đại'}
- Thể loại yêu thích: {', '.join(guest_genres) if guest_genres else 'V-Pop, Indie Acoustic, R&B'}
"""
        else:
            songs_summary = []
            for i, t in enumerate(history_tracks[:30], 1):
                songs_summary.append(f"{i}. \"{t.get('title')}\" - {t.get('artist')} ({t.get('album', '')})")
            songs_text = "\n".join(songs_summary) if songs_summary else "V-Pop Hits 2026"
            prompt_context = f"""
Dưới đây là danh sách bài hát gần nhất trong lịch sử nghe nhạc của người dùng từ YouTube Music:
{songs_text}
"""

        prompt = f"""
Bạn là chuyên gia thẩm định âm nhạc AI của ứng dụng Aura Music.
{prompt_context}

Nhiệm vụ của bạn:
1. Phân tích "User Music DNA":
   - Thể loại chủ đạo (genres: mảng 3-4 thể loại)
   - Tâm trạng / Mood (mood: ví dụ "Hoài niệm, Thư giãn, Tràn đầy năng lượng")
   - Vibe / Gu thẩm mỹ (vibe: mô tả ngắn 1-2 câu về gu nghe nhạc của người này)
2. Đề xuất chính xác 5 bài hát MỚI cực kỳ phù hợp với gu âm nhạc này.
   Mỗi bài gồm: title, artist, reason (lý do đề xuất vì sao hợp gu).

YÊU CẦU ĐẶC BIỆT: CHỈ TRẢ VỀ DUY NHẤT MỘT ĐỐI TƯỢNG JSON HỢP LỆ THEO SCHEMA SAU, KHÔNG KÈM TEXT NÀO KHÁC:
{{
  "musicDna": {{
    "genres": ["V-Pop", "R&B", "Lofi"],
    "mood": "...",
    "vibe": "..."
  }},
  "recommendations": [
    {{
      "title": "Tên bài hát",
      "artist": "Tên nghệ sĩ",
      "reason": "Lý do gợi ý"
    }}
  ]
}}
"""

        # Multi-Key Rotation Loop with 429/quota retry
        for attempt, key in enumerate(keys, 1):
            gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={key}"
            payload = {
                "contents": [{
                    "parts": [{"text": prompt}]
                }],
                "generationConfig": {
                    "responseMimeType": "application/json"
                }
            }

            req = urllib.request.Request(
                gemini_url,
                data=json.dumps(payload).encode('utf-8'),
                headers={'Content-Type': 'application/json'}
            )

            try:
                masked_key = f"...{key[-4:]}" if len(key) >= 4 else "***"
                print(f"[Gemini Multi-Key] Querying Gemini with Key #{attempt}/{len(keys)} ({masked_key})...", flush=True)

                with urllib.request.urlopen(req, timeout=15) as resp:
                    resp_data = json.loads(resp.read().decode('utf-8'))
                    candidates = resp_data.get('candidates', [])
                    if candidates:
                        content_text = candidates[0]['content']['parts'][0]['text']
                        result_json = json.loads(content_text)
                        result = self._enrich_recommendations(result_json)
                        result['activeKeyIndex'] = attempt
                        result['totalKeys'] = len(keys)
                        return result
            except urllib.error.HTTPError as he:
                print(f"[Gemini Multi-Key] Key #{attempt} failed with HTTP {he.code}: {he.reason}", file=sys.stderr)
                if he.code in (429, 403, 400):
                    # Rate limit or quota exhausted or invalid key -> Rotate to next key!
                    print(f"[Gemini Multi-Key] Rate limit (HTTP {he.code}) hit on Key #{attempt}. Rotating to backup key...", file=sys.stderr)
                    continue
                else:
                    continue
            except Exception as e:
                print(f"[Gemini Multi-Key] Key #{attempt} failed with exception: {e}", file=sys.stderr)
                continue

        print("[Gemini Multi-Key] All configured keys failed or exhausted quota, using heuristic fallback.", file=sys.stderr)
        fallback = self._heuristic_fallback(history_tracks, guest_artists, guest_genres)
        fallback['note'] = f"Đã thử {len(keys)} Gemini API Key (hết quota / lỗi 429), chuyển sang bộ suy luận cục bộ."
        return fallback

    def _enrich_recommendations(self, data: dict) -> dict:
        """Resolves real playable YouTube Music video IDs for recommended songs"""
        yt = YTMusic()
        recommendations = data.get('recommendations', [])

        for item in recommendations:
            title = item.get('title', '')
            artist = item.get('artist', '')
            query = f"{title} {artist}"
            try:
                search_results = yt.search(query, filter='songs')
                if search_results:
                    top_match = search_results[0]
                    item['id'] = top_match.get('videoId', '')
                    thumbs = top_match.get('thumbnails', [])
                    item['thumbnail'] = thumbs[-1]['url'] if thumbs else ''
                    item['duration'] = top_match.get('duration_seconds') or 0
                else:
                    item['id'] = ''
            except Exception:
                item['id'] = ''

        return data

    def _heuristic_fallback(self, history_tracks: list = None, guest_artists: list = None, guest_genres: list = None) -> dict:
        """Smart local analysis when Gemini API key is not configured or all keys failed"""
        history_tracks = history_tracks or []
        guest_artists = guest_artists or []
        guest_genres = guest_genres or []

        if guest_artists or guest_genres:
            top_artists = guest_artists[:3] if guest_artists else ['Vũ.', 'Hoàng Dũng', 'Đen Vâu']
            genres = guest_genres if guest_genres else ['Indie Acoustic', 'V-Pop', 'R&B']
            mood = 'Chill, Thư thái & Tinh tế'
            vibe = f"Yêu thích phong cách âm nhạc sâu lắng, giàu cảm xúc của {', '.join(top_artists)}."
        else:
            artist_counts = {}
            for t in history_tracks:
                art = t.get('artist', 'Unknown')
                artist_counts[art] = artist_counts.get(art, 0) + 1

            top_artists = sorted(artist_counts.keys(), key=lambda a: artist_counts[a], reverse=True)[:3]
            genres = ['V-Pop', 'Indie Acoustic', 'Modern R&B']
            mood = 'Chill, Thư thái & Tinh tế'
            vibe = f"Yêu thích các ca khúc truyền cảm hứng và phong cách của {', '.join(top_artists) if top_artists else 'nghệ sĩ đương đại'}."

        fallback_dna = {
            'genres': genres,
            'mood': mood,
            'vibe': vibe
        }

        # Query YouTube Music for trending tracks related to top artists
        yt = YTMusic()
        query_base = top_artists[0] if top_artists else "V-Pop Hits 2026"
        recs = []
        try:
            results = yt.search(f"{query_base} bài hát hay", filter='songs')
            for item in results[:5]:
                thumbs = item.get('thumbnails', [])
                artists = item.get('artists', [])
                recs.append({
                    'id': item.get('videoId', ''),
                    'title': item.get('title', ''),
                    'artist': artists[0]['name'] if artists else query_base,
                    'thumbnail': thumbs[-1]['url'] if thumbs else '',
                    'duration': item.get('duration_seconds') or 0,
                    'reason': f"Dựa trên gu âm nhạc yêu thích {query_base}"
                })
        except Exception:
            pass

        return {
            'musicDna': fallback_dna,
            'recommendations': recs,
            'note': 'Gợi ý thông minh cục bộ (nhập Gemini API Key để kích hoạt AI Reasoning sâu sắc hơn)'
        }

auth_service = AuthService()
ai_recommender = AIRecommender()

