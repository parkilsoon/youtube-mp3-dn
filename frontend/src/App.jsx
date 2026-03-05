import { useState, useRef, useEffect } from 'react'
import './App.css'

const API_BASE = window.location.port === '5177'
  ? 'http://localhost:8000/api'   // 개발 모드
  : '/api'                        // 빌드 모드 (같은 서버)

const AUDIO_FORMATS = [
  { value: 'original', label: '원본 (빠름)' },
  { value: 'mp3', label: 'MP3' },
  { value: 'aac', label: 'AAC' },
  { value: 'flac', label: 'FLAC' },
  { value: 'wav', label: 'WAV' },
  { value: 'ogg', label: 'OGG' },
]

const VIDEO_FORMATS = [
  { value: 'video_original', label: '영상 - 원본' },
  { value: 'video_1080p', label: '영상 - 1080p' },
  { value: 'video_720p', label: '영상 - 720p' },
]

const ALL_FORMATS = [...AUDIO_FORMATS, ...VIDEO_FORMATS]

const QUALITIES = [
  { value: '320', label: '320kbps' },
  { value: '192', label: '192kbps' },
  { value: '128', label: '128kbps' },
]

function formatDuration(seconds) {
  if (!seconds) return '--:--'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function SearchBar({ onSearch, loading }) {
  const [query, setQuery] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (query.trim()) onSearch(query.trim())
  }

  return (
    <form className="search-bar" onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="유튜브에서 검색..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={loading}
      />
      <button type="submit" disabled={loading || !query.trim()}>
        {loading ? '검색 중...' : '검색'}
      </button>
    </form>
  )
}

function ResultItem({ item, onPlay, isPlaying }) {
  const [format, setFormat] = useState('mp3')
  const [quality, setQuality] = useState('320')
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('')

  const isLossy = ['mp3', 'aac', 'ogg'].includes(format)

  const handleDownload = async () => {
    setDownloading(true)
    setProgress(0)
    setStatus('시작 중...')

    try {
      const res = await fetch(`${API_BASE}/download/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_id: item.id,
          format,
          quality: isLossy ? quality : '320',
        }),
      })
      const { task_id } = await res.json()

      const evtSource = new EventSource(`${API_BASE}/download/progress/${task_id}`)
      evtSource.addEventListener('progress', (e) => {
        const data = JSON.parse(e.data)
        setProgress(data.progress)

        if (data.status === 'downloading') setStatus('다운로드 중...')
        else if (data.status === 'converting') setStatus('변환 중...')
        else if (data.status === 'done') {
          setStatus('완료!')
          evtSource.close()
          const link = document.createElement('a')
          link.href = `${API_BASE}/download/file/${task_id}`
          link.download = ''
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          setTimeout(() => {
            setDownloading(false)
            setProgress(0)
            setStatus('')
          }, 2000)
        } else if (data.status === 'error') {
          setStatus(`오류: ${data.error || '알 수 없는 오류'}`)
          evtSource.close()
          setTimeout(() => {
            setDownloading(false)
            setProgress(0)
            setStatus('')
          }, 3000)
        }
      })

      evtSource.onerror = () => {
        evtSource.close()
        setStatus('연결 오류')
        setTimeout(() => {
          setDownloading(false)
          setProgress(0)
          setStatus('')
        }, 3000)
      }
    } catch {
      setStatus('요청 실패')
      setTimeout(() => {
        setDownloading(false)
        setProgress(0)
        setStatus('')
      }, 3000)
    }
  }

  return (
    <div className={`result-item ${isPlaying ? 'playing' : ''}`}>
      <img
        className="thumbnail"
        src={item.thumbnail}
        alt={item.title}
        onClick={() => onPlay(item)}
      />
      <div className="item-info">
        <div className="item-title" title={item.title}>{item.title}</div>
        <div className="item-meta">
          {item.channel} · {formatDuration(item.duration)}
        </div>
        <div className="item-controls">
          <button
            className="btn-play"
            onClick={() => onPlay(item)}
            title="듣기"
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <select value={format} onChange={(e) => setFormat(e.target.value)}>
            {ALL_FORMATS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
          {isLossy && (
            <select value={quality} onChange={(e) => setQuality(e.target.value)}>
              {QUALITIES.map((q) => (
                <option key={q.value} value={q.value}>{q.label}</option>
              ))}
            </select>
          )}
          <button
            className="btn-download"
            onClick={handleDownload}
            disabled={downloading}
            title="다운로드"
          >
            ⬇
          </button>
        </div>
        {downloading && (
          <div className="progress-container">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="progress-text">{progress}% {status}</span>
          </div>
        )}
      </div>
    </div>
  )
}

const VIDEO_QUALITIES = [
  { value: '1080', label: '1080p' },
  { value: '720', label: '720p' },
  { value: '480', label: '480p' },
  { value: '360', label: '360p' },
]

function Player({ current, streamUrl, isVideo, onToggleVideo, onClose, videoQuality, onQualityChange }) {
  const audioRef = useRef(null)
  const videoRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [loading, setLoading] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const playerRef = useRef(null)

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  useEffect(() => {
    if (!streamUrl) return
    setLoading(true)
    setPlaying(false)
    setCurrentTime(0)
  }, [streamUrl])

  const mediaRef = isVideo ? videoRef : audioRef

  const handleLoaded = () => {
    setLoading(false)
    setDuration(mediaRef.current?.duration || current?.duration || 0)
    mediaRef.current?.play()
    setPlaying(true)
  }

  const handleTimeUpdate = () => {
    setCurrentTime(mediaRef.current?.currentTime || 0)
  }

  const handlePlayPause = () => {
    if (!mediaRef.current) return
    if (playing) {
      mediaRef.current.pause()
    } else {
      mediaRef.current.play()
    }
    setPlaying(!playing)
  }

  const handleSeek = (e) => {
    if (!mediaRef.current || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const ratio = x / rect.width
    mediaRef.current.currentTime = ratio * duration
  }

  const handleFullscreen = () => {
    if (!isVideo || !playerRef.current) return
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      playerRef.current.requestFullscreen()
    }
  }

  if (!current) {
    return (
      <div className="player empty">
        <span>곡을 선택해주세요</span>
      </div>
    )
  }

  return (
    <div ref={playerRef} className={`player ${isVideo ? 'video-mode' : ''} ${isFullscreen ? 'fullscreen' : ''}`}>
      {isVideo && streamUrl && (
        <video
          ref={videoRef}
          src={streamUrl}
          onLoadedData={handleLoaded}
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => setPlaying(false)}
          className="video-player"
          onDoubleClick={handleFullscreen}
        />
      )}
      {!isVideo && streamUrl && (
        <audio
          ref={audioRef}
          src={streamUrl}
          onLoadedData={handleLoaded}
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => setPlaying(false)}
        />
      )}
      <div className="player-controls">
        <button className="btn-play-main" onClick={handlePlayPause} disabled={loading}>
          {loading ? '⏳' : playing ? '⏸' : '▶'}
        </button>
        <div className="player-info">
          <div className="player-title">{current.title}</div>
          <div className="player-seek" onClick={handleSeek}>
            <div
              className="seek-fill"
              style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
            />
          </div>
          <div className="player-time">
            {formatDuration(currentTime)} / {formatDuration(duration)}
          </div>
        </div>
        <button className="btn-toggle-video" onClick={onToggleVideo}>
          {isVideo ? '🎵 오디오' : '🎬 영상보기'}
        </button>
        {isVideo && (
          <select
            className="quality-select"
            value={videoQuality}
            onChange={(e) => onQualityChange(e.target.value)}
          >
            {VIDEO_QUALITIES.map((q) => (
              <option key={q.value} value={q.value}>{q.label}</option>
            ))}
          </select>
        )}
        {isVideo && (
          <button className="btn-fullscreen" onClick={handleFullscreen} title="전체화면">
            {isFullscreen ? '축소' : '전체'}
          </button>
        )}
        <button className="btn-close" onClick={onClose} title="닫기">
          ✕
        </button>
      </div>
    </div>
  )
}

function App() {
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [current, setCurrent] = useState(null)
  const [streamUrl, setStreamUrl] = useState('')
  const [isVideo, setIsVideo] = useState(false)
  const [videoQuality, setVideoQuality] = useState('1080')
  const [error, setError] = useState('')

  const handleClose = () => {
    setCurrent(null)
    setStreamUrl('')
  }

  const handleSearch = async (query) => {
    setSearching(true)
    setError('')
    setCurrent(null)
    setStreamUrl('')
    try {
      const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      setResults(data.results || [])
      if (!data.results?.length) setError('검색 결과가 없습니다')
    } catch {
      setError('서버에 연결할 수 없습니다. 백엔드가 실행 중인지 확인하세요.')
    }
    setSearching(false)
  }

  const handlePlay = async (item) => {
    if (current?.id === item.id && streamUrl) {
      setCurrent(null)
      setStreamUrl('')
      return
    }
    setCurrent(item)
    setStreamUrl('')
    const type = isVideo ? 'video' : 'audio'
    const q = isVideo ? `&quality=${videoQuality}` : ''
    setStreamUrl(`${API_BASE}/stream/proxy?video_id=${item.id}&type=${type}${q}`)
  }

  const handleToggleVideo = async () => {
    const newIsVideo = !isVideo
    setIsVideo(newIsVideo)
    if (current) {
      setStreamUrl('')
      const type = newIsVideo ? 'video' : 'audio'
      const q = newIsVideo ? `&quality=${videoQuality}` : ''
      setStreamUrl(`${API_BASE}/stream/proxy?video_id=${current.id}&type=${type}${q}`)
    }
  }

  const handleQualityChange = (q) => {
    setVideoQuality(q)
    if (current && isVideo) {
      setStreamUrl('')
      setStreamUrl(`${API_BASE}/stream/proxy?video_id=${current.id}&type=video&quality=${q}`)
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Suny's YouTube Free</h1>
        <p>돈내기 싫어...</p>
      </header>

      <SearchBar onSearch={handleSearch} loading={searching} />

      {error && <div className="error-msg">{error}</div>}

      <div className="results">
        {results.map((item) => (
          <ResultItem
            key={item.id}
            item={item}
            onPlay={handlePlay}
            isPlaying={current?.id === item.id}
          />
        ))}
      </div>

      <Player
        current={current}
        streamUrl={streamUrl}
        isVideo={isVideo}
        onToggleVideo={handleToggleVideo}
        onClose={handleClose}
        videoQuality={videoQuality}
        onQualityChange={handleQualityChange}
      />
    </div>
  )
}

export default App
