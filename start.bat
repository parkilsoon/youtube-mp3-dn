@echo off
chcp 65001 >nul
echo === YouTube Free 시작 ===

:: ffmpeg 확인
where ffmpeg >nul 2>&1
if errorlevel 1 (
    echo ❌ ffmpeg가 설치되어 있지 않습니다.
    echo    https://ffmpeg.org/download.html 에서 다운로드하세요.
    echo    또는: winget install ffmpeg
    pause
    exit /b 1
)

:: Python venv 설정
cd /d "%~dp0backend"
if not exist "venv" (
    echo 📦 Python 가상환경 생성 중...
    python -m venv venv
)
call venv\Scripts\activate.bat
pip install -q -r requirements.txt

:: 프론트엔드 의존성
cd /d "%~dp0frontend"
if not exist "node_modules" (
    echo 📦 프론트엔드 의존성 설치 중...
    call npm install
)

:: 백엔드 실행 (새 창)
echo 🚀 백엔드 서버 시작 (포트 8000)...
cd /d "%~dp0backend"
start "YouTube Free - Backend" cmd /c "call venv\Scripts\activate.bat && python main.py"

:: 프론트엔드 실행 (새 창)
echo 🚀 프론트엔드 서버 시작 (포트 5173)...
cd /d "%~dp0frontend"
start "YouTube Free - Frontend" cmd /c "npm run dev"

echo.
echo ✅ http://localhost:5177 에서 사용 가능합니다
echo    서버 창을 닫으면 종료됩니다
echo.
pause
