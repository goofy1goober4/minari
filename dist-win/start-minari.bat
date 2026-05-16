@echo off
chcp 65001 >nul
cd /d "%~dp0"
set MINARI_MODEL=gemma4:e2b
set MINARI_LANG=ko
set "MODEL=models\gemma-4-E2B-it-Q4_K_M.gguf"
set "MMPROJ=models\mmproj-F16.gguf"

echo.
echo   ============================================
echo     Minari - 로컬 AI 데스크탑 펫
echo   ============================================
echo.

rem --- 사전 점검: 모델 파일이 bat 옆 models 폴더에 있어야 함 ---
if not exist "%MODEL%"  goto nomodel
if not exist "%MMPROJ%" goto nomodel

echo   로컬 AI 모델을 불러오는 중입니다...
echo   (이 창과 최소화된 'Minari AI' 창을 닫지 마세요)
echo.

start "Minari AI - 닫지 마세요" /MIN llama\llama-server.exe -m "%MODEL%" --mmproj "%MMPROJ%" --host 127.0.0.1 --port 8080 -c 8192 --alias gemma4:e2b --jinja --reasoning off

rem --- curl 이 있으면 헬스 폴링, 없으면 고정 대기 ---
where curl >nul 2>nul
if errorlevel 1 (
  echo   curl 이 없어 로딩 감지를 건너뜁니다 - 60초 대기 후 앱을 엽니다.
  timeout /t 60 /nobreak >nul
  goto ready
)

set /a tries=0
:waitloop
timeout /t 2 /nobreak >nul
curl -s http://127.0.0.1:8080/health 2>nul | find "ok" >nul
if not errorlevel 1 goto ready
set /a tries+=1
if %tries% geq 60 goto failed
goto waitloop

:ready
echo   준비 완료. 미나리를 엽니다.
start "" "minari-app\Minari.exe"
exit /b 0

:nomodel
echo   [오류] 모델 파일을 찾을 수 없습니다.
echo.
echo   이 bat 파일과 같은 위치에 models 폴더가 있고, 그 안에
echo   아래 두 파일이 정확한 이름으로 있어야 합니다:
echo.
echo       %~dp0models\gemma-4-E2B-it-Q4_K_M.gguf
echo       %~dp0models\mmproj-F16.gguf
echo.
echo   --- 현재 models 폴더 실제 내용 ---
if exist models ( dir /b models ) else ( echo     (models 폴더 자체가 없습니다) )
echo   ----------------------------------
echo   * Windows 가 확장자를 숨기면 실제 이름이 ...gguf.gguf 일 수 있습니다.
echo   * 파일이 위 경로에 정확한 이름으로 오도록 옮기거나 이름을 고치세요.
echo.
pause
exit /b 1

:failed
echo.
echo   [오류] AI 서버가 응답하지 않습니다 (120초 초과).
echo   모델 파일은 확인됐으므로 llama-server.exe 실행 문제일 수 있습니다.
echo   진단: cmd 창에서 아래를 직접 실행해 오류 메시지를 확인하세요.
echo       llama\llama-server.exe -m "%MODEL%" --mmproj "%MMPROJ%"
echo.
pause
exit /b 1
