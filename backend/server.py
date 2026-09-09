"""
Mucis Backend Microservice
Powered by ytmusicapi & yt-dlp
"""

import sys
import io
import json
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import urllib.request
from ytmusicapi import YTMusic
import os
import socket

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(__file__))
from stream_resolver import stream_resolver
from auth_service import auth_service, ai_recommender

if sys.stdout.encoding.lower() != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

yt = None

def get_yt():
    global yt
    if yt is None:
        yt = YTMusic()
    return yt

ydl_audio_opts = {
    'format': 'bestaudio/best',
    'quiet': True,
    'no_warnings': True,
    'skip_download': True,
    'extract_flat': False,
}

def python_invidious_search(query, filter_type='songs'):
    instances = [
        'https://invidious.nerdvpn.de',
        'https://yewtu.be',
        'https://invidious.flokinet.to'
    ]
    t = 'channel' if filter_type == 'artists' else 'video'
    for inst in instances:
        try:
            url = f"{inst}/api/v1/search?q={urllib.parse.quote(query)}&type={t}"
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
            with urllib.request.urlopen(req, timeout=3.5) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                results = []
                if filter_type == 'artists':
                    for c in data[:15]:
                        thumbs = c.get('authorThumbnails', [])
                        thumb = thumbs[-1]['url'] if thumbs else ''
                        results.append({
                            'id': c.get('authorId', ''),
                            'name': c.get('author', query),
                            'thumbnail': thumb,
                            'subscribers': f"{c.get('subCount', '')} subs" if c.get('subCount') else ''
                        })
                else:
                    for v in data[:25]:
                        v_thumbs = v.get('videoThumbnails', [])
                        thumb = v_thumbs[0]['url'] if v_thumbs else f"https://i.ytimg.com/vi/{v.get('videoId')}/hqdefault.jpg"
                        results.append({
                            'id': v.get('videoId', ''),
                            'title': v.get('title', ''),
                            'artist': v.get('author', ''),
                            'artistId': v.get('authorId', ''),
                            'album': '',
                            'duration': v.get('lengthSeconds', 0),
                            'thumbnail': thumb
                        })
                return results
        except Exception:
            continue
    return []

class AuraHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _send_json(self, data, status=200):
        try:
            response_bytes = json.dumps(data, ensure_ascii=False).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(response_bytes)))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type, Range, Authorization, bypass-tunnel-reminder')
            self.send_header('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length, Content-Type')
            self.end_headers()
            self.wfile.write(response_bytes)
        except (ConnectionResetError, BrokenPipeError, socket.error):
            pass # Client disconnected early (e.g. seeking, skipping song, page reload)
        except Exception as e:
            print(f"[Aura Backend] _send_json error: {e}", flush=True)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Range, Authorization, bypass-tunnel-reminder')
        self.send_header('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length, Content-Type')
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)

        try:
            if path == '/api/health':
                self._send_json({'status': 'ok', 'engine': 'ytmusicapi + yt-dlp'})
                return

            if path == '/api/search/suggestions':
                query = qs.get('q', [''])[0].strip()
                if not query:
                    self._send_json([])
                    return
                try:
                    yt_inst = get_yt()
                    suggestions = yt_inst.get_search_suggestions(query)
                    self._send_json(suggestions)
                    return
                except Exception:
                    try:
                        g_url = f"https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q={urllib.parse.quote(query)}"
                        req = urllib.request.Request(g_url, headers={'User-Agent': 'Mozilla/5.0'})
                        with urllib.request.urlopen(req, timeout=2.5) as g_resp:
                            g_data = json.loads(g_resp.read().decode('utf-8'))
                            if len(g_data) > 1 and isinstance(g_data[1], list):
                                self._send_json(g_data[1][:8])
                                return
                    except Exception:
                        pass
                    self._send_json([])
                    return

            if path == '/api/search':
                query = qs.get('q', [''])[0].strip()
                filter_type = qs.get('filter', ['songs'])[0] # songs, artists
                if not query:
                    self._send_json([])
                    return

                try:
                    yt_inst = get_yt()
                    raw_results = yt_inst.search(query, filter=filter_type)
                    results = []

                    for item in raw_results:
                        if filter_type == 'artists':
                            thumbs = item.get('thumbnails', [])
                            thumb = thumbs[-1]['url'] if thumbs else ''
                            results.append({
                                'id': item.get('browseId', ''),
                                'name': item.get('artist', query),
                                'thumbnail': thumb,
                                'subscribers': item.get('subscribers', '')
                            })
                        else: # songs
                            thumbs = item.get('thumbnails', [])
                            thumb = thumbs[-1]['url'] if thumbs else ''
                            artists_list = item.get('artists', [])
                            artist_name = artists_list[0]['name'] if artists_list else 'Unknown Artist'
                            artist_id = artists_list[0].get('id', '') if artists_list else ''
                            album_info = item.get('album')
                            album_name = album_info.get('name', '') if album_info else ''
                            duration_sec = item.get('duration_seconds') or 0

                            results.append({
                                'id': item.get('videoId', ''),
                                'title': item.get('title', ''),
                                'artist': artist_name,
                                'artistId': artist_id,
                                'album': album_name,
                                'duration': duration_sec,
                                'thumbnail': thumb
                            })

                    if not results:
                        results = python_invidious_search(query, filter_type)

                    self._send_json(results)
                    return
                except Exception as search_err:
                    print(f"[Aura Backend] ytmusicapi search error, falling back to Invidious: {search_err}", flush=True)
                    results = python_invidious_search(query, filter_type)
                    self._send_json(results)
                    return

            if path == '/api/artist':
                artist_id = qs.get('id', [''])[0].strip()
                if not artist_id:
                    self._send_json({'error': 'Missing artist id'}, 400)
                    return

                yt_inst = get_yt()
                data = yt_inst.get_artist(artist_id)
                thumbs = data.get('thumbnails', [])
                thumb = thumbs[-1]['url'] if thumbs else ''

                top_songs = []
                seen_ids = set()

                # 1. Try to load full songs playlist if browseId exists (gives 50-100+ songs)
                songs_section = data.get('songs', {})
                songs_browse_id = songs_section.get('browseId')
                if songs_browse_id:
                    try:
                        pl = yt_inst.get_playlist(songs_browse_id, limit=100)
                        for t in pl.get('tracks', []):
                            vid = t.get('videoId')
                            if vid and vid not in seen_ids:
                                seen_ids.add(vid)
                                t_thumbs = t.get('thumbnails', [])
                                t_thumb = t_thumbs[-1]['url'] if t_thumbs else thumb
                                alb_info = t.get('album')
                                alb_name = alb_info.get('name', '') if isinstance(alb_info, dict) else ''
                                top_songs.append({
                                    'id': vid,
                                    'title': t.get('title', ''),
                                    'artist': data.get('name', ''),
                                    'artistId': artist_id,
                                    'album': alb_name,
                                    'duration': t.get('duration_seconds') or 0,
                                    'thumbnail': t_thumb
                                })
                    except Exception as pl_err:
                        print(f"[Aura Backend] Could not fetch artist songs playlist: {pl_err}", flush=True)

                # 2. If playlist was not found or empty, use immediate results
                if not top_songs:
                    for s in songs_section.get('results', []):
                        vid = s.get('videoId', '')
                        if vid and vid not in seen_ids:
                            seen_ids.add(vid)
                            s_thumbs = s.get('thumbnails', [])
                            s_thumb = s_thumbs[-1]['url'] if s_thumbs else thumb
                            top_songs.append({
                                'id': vid,
                                'title': s.get('title', ''),
                                'artist': data.get('name', ''),
                                'artistId': artist_id,
                                'album': s.get('album', {}).get('name', '') if isinstance(s.get('album'), dict) else '',
                                'duration': s.get('duration_seconds') or 0,
                                'thumbnail': s_thumb
                            })

                # 3. If still under 20 songs, supplement by searching songs of this artist
                if len(top_songs) < 20 and data.get('name'):
                    try:
                        extra_search = yt_inst.search(data.get('name'), filter='songs')
                        for item in extra_search[:25]:
                            vid = item.get('videoId')
                            if vid and vid not in seen_ids:
                                seen_ids.add(vid)
                                item_thumbs = item.get('thumbnails', [])
                                top_songs.append({
                                    'id': vid,
                                    'title': item.get('title', ''),
                                    'artist': data.get('name', ''),
                                    'artistId': artist_id,
                                    'album': item.get('album', {}).get('name', '') if isinstance(item.get('album'), dict) else '',
                                    'duration': item.get('duration_seconds') or 0,
                                    'thumbnail': item_thumbs[-1]['url'] if item_thumbs else thumb
                                })
                    except Exception:
                        pass

                singles = []
                for sg in data.get('singles', {}).get('results', []):
                    sg_thumbs = sg.get('thumbnails', [])
                    singles.append({
                        'id': sg.get('browseId', ''),
                        'title': sg.get('title', ''),
                        'year': sg.get('year', ''),
                        'thumbnail': sg_thumbs[-1]['url'] if sg_thumbs else thumb
                    })

                albums = []
                for alb in data.get('albums', {}).get('results', []):
                    alb_thumbs = alb.get('thumbnails', [])
                    albums.append({
                        'id': alb.get('browseId', ''),
                        'title': alb.get('title', ''),
                        'year': alb.get('year', ''),
                        'thumbnail': alb_thumbs[-1]['url'] if alb_thumbs else thumb
                    })

                self._send_json({
                    'id': artist_id,
                    'name': data.get('name', ''),
                    'description': data.get('description', ''),
                    'subscribers': data.get('subscribers', ''),
                    'monthlyListeners': data.get('monthlyListeners', ''),
                    'thumbnail': thumb,
                    'topSongs': top_songs,
                    'singles': singles,
                    'albums': albums
                })
                return

            if path == '/api/artist/lookup':
                query = qs.get('q', [''])[0].strip()
                if not query:
                    self._send_json({'error': 'Missing query'}, 400)
                    return

                yt_inst = get_yt()
                import re

                # 1. Parse URL for channel ID or handle
                match_channel = re.search(r'channel/(UC[\w-]+)', query)
                if match_channel:
                    query = match_channel.group(1)

                match_handle = re.search(r'(@[\w.-]+)', query)
                if match_handle:
                    query = match_handle.group(1)

                # 2. If it is already a channel ID or browse ID
                if query.startswith('UC') or query.startswith('MPREb_'):
                    try:
                        art = yt_inst.get_artist(query)
                        thumbs = art.get('thumbnails', [])
                        self._send_json({
                            'id': query,
                            'name': art.get('name', query),
                            'thumbnail': thumbs[-1]['url'] if thumbs else '',
                            'subscribers': art.get('subscribers', '')
                        })
                        return
                    except Exception:
                        pass

                # 3. Search artists by name or handle
                results = yt_inst.search(query, filter='artists')
                if results:
                    top = results[0]
                    thumbs = top.get('thumbnails', [])
                    self._send_json({
                        'id': top.get('browseId', ''),
                        'name': top.get('artist', query),
                        'thumbnail': thumbs[-1]['url'] if thumbs else '',
                        'subscribers': top.get('subscribers', '')
                    })
                    return

                self._send_json({'error': 'Artist not found'}, 404)
                return

            if path == '/api/artist/releases':
                artist_id = qs.get('id', [''])[0].strip()
                if not artist_id:
                    self._send_json([], 400)
                    return

                yt_inst = get_yt()
                data = yt_inst.get_artist(artist_id)
                releases = []
                artist_name = data.get('name', '')
                thumbs = data.get('thumbnails', [])
                artist_thumb = thumbs[-1]['url'] if thumbs else ''

                # 1. Collect top songs
                for s in data.get('songs', {}).get('results', []):
                    s_thumbs = s.get('thumbnails', [])
                    s_thumb = s_thumbs[-1]['url'] if s_thumbs else artist_thumb
                    releases.append({
                        'id': s.get('videoId', ''),
                        'title': s.get('title', ''),
                        'artist': artist_name,
                        'artistId': artist_id,
                        'album': s.get('album', {}).get('name', '') if isinstance(s.get('album'), dict) else '',
                        'type': 'song',
                        'thumbnail': s_thumb,
                        'isNewRelease': True
                    })

                # 2. Resolve singles albums
                singles = data.get('singles', {}).get('results', [])[:6]
                def resolve_single_album(sg):
                    browse_id = sg.get('browseId')
                    sg_thumb = sg.get('thumbnails', [{}])[-1].get('url', artist_thumb)
                    if not browse_id:
                        return None
                    try:
                        alb = yt_inst.get_album(browse_id)
                        tracks = alb.get('tracks', [])
                        if tracks:
                            t = tracks[0]
                            return {
                                'id': t.get('videoId', ''),
                                'title': t.get('title', sg.get('title', '')),
                                'artist': artist_name,
                                'artistId': artist_id,
                                'album': alb.get('title', sg.get('title', '')),
                                'year': alb.get('year', sg.get('year', '')),
                                'type': 'single',
                                'thumbnail': sg_thumb,
                                'isNewRelease': True
                            }
                    except Exception:
                        pass
                    return None

                from concurrent.futures import ThreadPoolExecutor
                with ThreadPoolExecutor(max_workers=5) as executor:
                    single_results = list(executor.map(resolve_single_album, singles))
                    for sr in single_results:
                        if sr and sr.get('id'):
                            # Avoid duplicates
                            if not any(r['id'] == sr['id'] for r in releases):
                                releases.insert(0, sr)

                self._send_json(releases)
                return

            if path == '/api/stream':
                video_id = qs.get('id', [''])[0].strip()
                force_refresh = qs.get('refresh', ['0'])[0] in ('1', 'true', 'yes')
                if not video_id:
                    self._send_json({'error': 'Missing video id'}, 400)
                    return

                stream_info = stream_resolver.resolve(video_id, force_refresh=force_refresh)
                # Attach direct streamUrl and local proxyUrl for maximum playback reliability
                stream_info['proxyUrl'] = f"http://127.0.0.1:47823/api/stream_proxy?id={video_id}"
                self._send_json(stream_info)
                return

            if path == '/api/stream_proxy':
                video_id = qs.get('id', [''])[0].strip()
                direct_url = qs.get('url', [''])[0].strip()

                if direct_url:
                    stream_url = direct_url
                elif video_id:
                    try:
                        stream_info = stream_resolver.resolve(video_id)
                        stream_url = stream_info.get('streamUrl', '')
                    except Exception as e:
                        self._send_json({'error': f'Stream resolution failed: {str(e)}'}, 502)
                        return
                else:
                    self._send_json({'error': 'Missing video id or url'}, 400)
                    return

                if not stream_url:
                    self._send_json({'error': 'Stream URL not found'}, 404)
                    return

                range_header = self.headers.get('Range')
                req = urllib.request.Request(stream_url)
                req.add_header('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
                if range_header:
                    req.add_header('Range', range_header)

                upstream = None
                try:
                    upstream = urllib.request.urlopen(req, timeout=15)
                    status_code = getattr(upstream, 'status', 200)
                    if range_header and status_code == 200:
                        status_code = 206

                    self.send_response(status_code)
                    content_type = upstream.headers.get('Content-Type', 'audio/webm')
                    content_range = upstream.headers.get('Content-Range')
                    content_length = upstream.headers.get('Content-Length')

                    self.send_header('Content-Type', content_type)
                    self.send_header('Accept-Ranges', 'bytes')
                    if content_range:
                        self.send_header('Content-Range', content_range)
                    if content_length:
                        self.send_header('Content-Length', content_length)

                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.send_header('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length, Content-Type')
                    self.send_header('Cache-Control', 'no-cache')
                    self.send_header('bypass-tunnel-reminder', 'true')
                    self.end_headers()

                    while True:
                        chunk = upstream.read(64 * 1024)
                        if not chunk:
                            break
                        self.wfile.write(chunk)
                except (ConnectionResetError, BrokenPipeError, socket.error):
                    # Graceful abort: client disconnected (e.g. seeking, skipping track)
                    pass
                except Exception as e:
                    pass
                finally:
                    if upstream:
                        try:
                            upstream.close()
                        except Exception:
                            pass
                return

            if path == '/api/auth/status':
                status = auth_service.get_auth_status()
                self._send_json(status)
                return

            if path == '/api/user/history':
                limit = int(qs.get('limit', ['30'])[0])
                try:
                    history = auth_service.get_user_history(limit)
                    self._send_json(history)
                except Exception as ex:
                    self._send_json({'error': str(ex)}, 400)
                return

            if path == '/api/settings/gemini_keys':
                keys = ai_recommender.get_api_keys()
                self._send_json({'keys': keys})
                return

            self._send_json({'error': 'Not Found'}, 404)

        except (ConnectionResetError, BrokenPipeError):
            pass # Client aborted or closed socket early
        except Exception as e:
            print(f"Error handling {path}: {e}", file=sys.stderr)
            try:
                self._send_json({'error': str(e)}, 500)
            except Exception:
                pass

    def _read_json_body(self):
        content_len = int(self.headers.get('Content-Length', 0))
        if content_len > 0:
            post_body = self.rfile.read(content_len)
            return json.loads(post_body.decode('utf-8'))
        return {}

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        try:
            body = self._read_json_body()

            if path == '/api/auth/device_code':
                client_id = body.get('clientId', '').strip()
                client_secret = body.get('clientSecret', '').strip()
                code_info = auth_service.get_device_code(client_id, client_secret)
                self._send_json(code_info)
                return

            if path == '/api/auth/poll_token':
                device_code = body.get('deviceCode')
                res = auth_service.poll_token(device_code)
                self._send_json(res)
                return

            if path == '/api/auth/save_cookie':
                cookie = body.get('cookie', '')
                account_name = body.get('accountName', '')
                res = auth_service.save_cookie_auth(cookie, account_name)
                self._send_json(res)
                return

            if path == '/api/auth/manual_token':
                token = body.get('token')
                ok = auth_service.save_manual_token(token)
                self._send_json({'success': ok})
                return

            if path == '/api/auth/logout':
                ok = auth_service.logout()
                self._send_json({'success': ok})
                return

            if path in ('/api/settings/gemini_key', '/api/settings/gemini_keys'):
                keys = body.get('geminiApiKeys') or body.get('geminiApiKey', '')
                ok = ai_recommender.save_api_keys(keys)
                self._send_json({'success': ok, 'keys': ai_recommender.get_api_keys()})
                return

            if path == '/api/ai/recommend':
                api_keys = body.get('geminiApiKeys') or body.get('geminiApiKey')
                tracks = body.get('historyTracks', [])
                guest_artists = body.get('guestArtists', [])
                guest_genres = body.get('guestGenres', [])

                if not tracks and not guest_artists and not guest_genres:
                    # attempt to get from logged in ytmusic
                    try:
                        tracks = auth_service.get_user_history(30)
                    except Exception:
                        tracks = []

                result = ai_recommender.analyze_and_recommend(
                    history_tracks=tracks,
                    guest_artists=guest_artists,
                    guest_genres=guest_genres,
                    api_key=api_keys
                )
                self._send_json(result)
                return

            self._send_json({'error': 'Not Found'}, 404)
        except (ConnectionResetError, BrokenPipeError):
            pass
        except Exception as e:
            print(f"Error handling POST {path}: {e}", file=sys.stderr)
            try:
                self._send_json({'error': str(e)}, 500)
            except Exception:
                pass

    def log_message(self, format, *args):
        # suppress noisy access logs
        pass

def run(port=47823):
    server = ThreadingHTTPServer(('127.0.0.1', port), AuraHandler)
    print(f"Mucis Python service listening on http://127.0.0.1:{port}", flush=True)
    server.serve_forever()

if __name__ == '__main__':
    port = 47823
    if len(sys.argv) > 1:
        port = int(sys.argv[1])
    run(port)
