#!/bin/bash
# macOS / Linux 실행 스크립트

echo "=== YouTube Free 시작 ==="

# ffmpeg 확인
if ! command -v ffmpeg &> /dev/null; then
    echo "❌ ffmpeg가 설치되어 있지 않습니다."
    echo "   brew install ffmpeg (macOS)"
    echo "   sudo apt install ffmpeg (Linux)"
    exit 1
fi

# Python venv 설정
cd "$(dirname "$0")/backend"
if [ ! -d "venv" ]; then
    echo "📦 Python 가상환경 생성 중..."
    python3 -m venv venv
fi
source venv/bin/activate
pip install -q -r requirements.txt

# 프론트엔드 의존성
cd ../frontend
if [ ! -d "node_modules" ]; then
    echo "📦 프론트엔드 의존성 설치 중..."
    npm install
fi

# 백엔드 실행 (백그라운드)
echo "🚀 백엔드 서버 시작 (포트 8000)..."
cd ../backend
source venv/bin/activate
python main.py &
BACKEND_PID=$!

# 프론트엔드 실행
echo "🚀 프론트엔드 서버 시작 (포트 5173)..."
cd ../frontend
npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ http://localhost:5177 에서 사용 가능합니다"
echo "   종료하려면 Ctrl+C"
echo ""

# Ctrl+C로 둘 다 종료
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
