# -*- mode: python ; coding: utf-8 -*-

import os
import sys
import glob
import yt_dlp

yt_dlp_dir = os.path.dirname(yt_dlp.__file__)

# ffmpeg 바이너리 포함
ffmpeg_binaries = []
ffmpeg_dir = os.path.join(os.path.dirname(os.path.abspath(SPEC)), 'ffmpeg_bin')
if os.path.exists(ffmpeg_dir):
    for f in glob.glob(os.path.join(ffmpeg_dir, '*')):
        ffmpeg_binaries.append((f, '.'))

a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=ffmpeg_binaries,
    datas=[
        ('static', 'static'),
        (yt_dlp_dir, 'yt_dlp'),
    ],
    hiddenimports=[
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'uvicorn.lifespan.off',
        'httpx',
        'httpcore',
        'h11',
        'anyio',
        'anyio._backends',
        'anyio._backends._asyncio',
        'sniffio',
        'sse_starlette',
        'multipart',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='YouTube-Free',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='YouTube-Free',
)
