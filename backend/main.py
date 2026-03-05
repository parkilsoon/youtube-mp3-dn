import asyncio
import os
import tempfile
import uuid
from pathlib import Path

import yt_dlp
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sse_starlette.sse import EventSourceResponse
from pydantic import BaseModel

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DOWNLOAD_DIR = Path(tempfile.gettempdir()) / "youtube-free-downloads"
DOWNLOAD_DIR.mkdir(exist_ok=True)

# 다운로드 진행률 추적
download_progress: dict[str, dict] = {}


@app.get("/api/search")
async def search(q: str = Query(..., min_length=1), max_results: int = Query(10, ge=1, le=20)):
    """유튜브 검색"""
    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": True,
        "default_search": "ytsearch",
    }

    def _search():
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            result = ydl.extract_info(f"ytsearch{max_results}:{q}", download=False)
            entries = result.get("entries", [])
            return [
                {
                    "id": entry.get("id"),
                    "title": entry.get("title"),
                    "channel": entry.get("channel") or entry.get("uploader"),
                    "duration": entry.get("duration"),
                    "thumbnail": entry.get("thumbnails", [{}])[-1].get("url") if entry.get("thumbnails") else f"https://i.ytimg.com/vi/{entry.get('id')}/hqdefault.jpg",
                    "url": entry.get("url") or f"https://www.youtube.com/watch?v={entry.get('id')}",
                }
                for entry in entries
                if entry.get("id")
            ]

    results = await asyncio.to_thread(_search)
    return {"results": results}


@app.get("/api/stream")
async def get_stream_url(video_id: str, type: str = Query("audio", regex="^(audio|video)$")):
    """오디오/비디오 스트림 URL 추출"""
    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
    }

    if type == "audio":
        ydl_opts["format"] = "bestaudio/best"
    else:
        ydl_opts["format"] = "best[height<=1080]"

    def _extract():
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
            return {
                "url": info.get("url"),
                "title": info.get("title"),
                "duration": info.get("duration"),
                "ext": info.get("ext"),
            }

    try:
        result = await asyncio.to_thread(_extract)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class DownloadRequest(BaseModel):
    video_id: str
    format: str = "original"  # original, mp3, aac, flac, wav, ogg, video_720p, video_1080p, video_original
    quality: str = "320"  # 128, 192, 320 (비트레이트, 손실 압축 시)


@app.post("/api/download/start")
async def start_download(req: DownloadRequest):
    """다운로드 시작"""
    task_id = str(uuid.uuid4())
    download_progress[task_id] = {"status": "starting", "progress": 0, "filename": ""}

    asyncio.create_task(_download_task(task_id, req))
    return {"task_id": task_id}


async def _download_task(task_id: str, req: DownloadRequest):
    """백그라운드 다운로드 작업"""
    is_video = req.format.startswith("video_")

    def progress_hook(d):
        if d["status"] == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            downloaded = d.get("downloaded_bytes", 0)
            if total > 0:
                download_progress[task_id]["progress"] = int(downloaded / total * 80)
            download_progress[task_id]["status"] = "downloading"
        elif d["status"] == "finished":
            download_progress[task_id]["progress"] = 80
            download_progress[task_id]["status"] = "converting"

    output_template = str(DOWNLOAD_DIR / f"{task_id}_%(title)s.%(ext)s")

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "outtmpl": output_template,
        "progress_hooks": [progress_hook],
    }

    if is_video:
        resolution = req.format.replace("video_", "")
        if resolution == "720p":
            ydl_opts["format"] = "bestvideo[height<=720]+bestaudio/best[height<=720]"
        elif resolution == "1080p":
            ydl_opts["format"] = "bestvideo[height<=1080]+bestaudio/best[height<=1080]"
        else:
            ydl_opts["format"] = "bestvideo+bestaudio/best"
        ydl_opts["merge_output_format"] = "mp4"
    elif req.format == "original":
        ydl_opts["format"] = "bestaudio/best"
    else:
        ydl_opts["format"] = "bestaudio/best"
        audio_format = req.format
        postprocessor = {
            "key": "FFmpegExtractAudio",
            "preferredcodec": audio_format,
        }
        if audio_format in ("mp3", "aac", "ogg"):
            postprocessor["preferredquality"] = req.quality
        ydl_opts["postprocessors"] = [postprocessor]

    # ffmpeg 멀티스레드
    ydl_opts["postprocessor_args"] = {"FFmpegExtractAudio": ["-threads", str(os.cpu_count() or 4)]}

    def _download():
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={req.video_id}", download=True)
            return info.get("title", "audio")

    try:
        title = await asyncio.to_thread(_download)
        # 다운로드된 파일 찾기
        files = list(DOWNLOAD_DIR.glob(f"{task_id}_*"))
        if files:
            filepath = files[0]
            download_progress[task_id]["status"] = "done"
            download_progress[task_id]["progress"] = 100
            download_progress[task_id]["filename"] = filepath.name
            download_progress[task_id]["filepath"] = str(filepath)
            download_progress[task_id]["title"] = title
        else:
            download_progress[task_id]["status"] = "error"
            download_progress[task_id]["error"] = "파일을 찾을 수 없습니다"
    except Exception as e:
        download_progress[task_id]["status"] = "error"
        download_progress[task_id]["error"] = str(e)


@app.get("/api/download/progress/{task_id}")
async def download_progress_sse(task_id: str):
    """다운로드 진행률 SSE 스트림"""
    async def event_generator():
        while True:
            if task_id in download_progress:
                data = download_progress[task_id]
                yield {"event": "progress", "data": str(data).replace("'", '"')}
                if data["status"] in ("done", "error"):
                    break
            await asyncio.sleep(0.5)

    return EventSourceResponse(event_generator())


@app.get("/api/download/file/{task_id}")
async def download_file(task_id: str):
    """완료된 파일 다운로드"""
    if task_id not in download_progress:
        raise HTTPException(status_code=404, detail="태스크를 찾을 수 없습니다")

    info = download_progress[task_id]
    if info["status"] != "done":
        raise HTTPException(status_code=400, detail="다운로드가 아직 완료되지 않았습니다")

    filepath = info.get("filepath")
    if not filepath or not Path(filepath).exists():
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")

    # 파일명에서 task_id prefix 제거
    clean_name = Path(filepath).name
    prefix = f"{task_id}_"
    if clean_name.startswith(prefix):
        clean_name = clean_name[len(prefix):]

    return FileResponse(
        path=filepath,
        filename=clean_name,
        media_type="application/octet-stream",
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
