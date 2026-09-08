import sys
import json
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._api import YouTubeTranscriptApi as YTApi
import urllib.request

video_id = sys.argv[1]

try:
    # Fetch video title from oEmbed
    title = "Unknown"
    try:
        url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
        with urllib.request.urlopen(url) as resp:
            data = json.loads(resp.read())
            title = data.get("title", "Unknown")
    except:
        pass

    ytt_api = YouTubeTranscriptApi()

    transcript = None
    for lang in ['id', 'en']:
        try:
            transcript = ytt_api.fetch(video_id, languages=[lang])
            break
        except Exception:
            continue

    if transcript is None:
        try:
            transcript = ytt_api.fetch(video_id)
        except Exception:
            pass

    if transcript is None:
        raise Exception("Tidak ada transcript yang bisa diambil")

    segments = []
    for entry in transcript.snippets:
        segments.append({
            "text": entry.text,
            "offset": entry.start * 1000,
            "duration": entry.duration * 1000
        })
    print(json.dumps({"ok": True, "segments": segments, "count": len(segments), "title": title}))
except Exception as e:
    print(json.dumps({"ok": False, "error": str(e)}))
