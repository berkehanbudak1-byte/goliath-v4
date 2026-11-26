@echo off
chcp 65001 >nul
title GOLIATH v4.0 ^& ER-QPM v1.0 (Einstein-Rosen Quantum Plasma Model)
color 0A

echo ============================================================================
echo   GOLIATH v4.0 ^& ER-QPM v1.0 — Einstein-Rosen Kuantum Plazma Laboratuvari
echo ============================================================================
echo.

set "WORKDIR=%USERPROFILE%\Desktop\goliath-v4"

where git >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    if exist "%WORKDIR%\.git" (
        echo [1/3] Mevcut klasor guncelleniyor: %WORKDIR%
        cd /d "%WORKDIR%"
        git pull origin main
    ) else (
        echo [1/3] GitHub'dan masaustune indiriliyor: %WORKDIR%
        git clone https://github.com/berkehanbudak1-byte/goliath-v4.git "%WORKDIR%"
        cd /d "%WORKDIR%"
    )
) else (
    echo [1/3] Git bulunamadi, PowerShell ile ZIP indiriliyor...
    if not exist "%WORKDIR%" mkdir "%WORKDIR%"
    powershell -Command "Invoke-WebRequest -Uri 'https://github.com/berkehanbudak1-byte/goliath-v4/archive/refs/heads/main.zip' -OutFile '%TEMP%\goliath-v4.zip'; Expand-Archive -Path '%TEMP%\goliath-v4.zip' -DestinationPath '%TEMP%\goliath-extract' -Force; Copy-Item -Path '%TEMP%\goliath-extract\goliath-v4-main\*' -Destination '%WORKDIR%' -Recurse -Force"
    cd /d "%WORKDIR%"
)

echo.
echo [2/3] 3B Einstein-Rosen Koprusu (Yesil Kuantum Kupu) ve GOLIATH v4.0 aciliyor...
if exist "%WORKDIR%\goliath-wormhole-3d.html" (
    start "" "%WORKDIR%\goliath-wormhole-3d.html"
)
if exist "%WORKDIR%\goliath-v4.0.html" (
    start "" "%WORKDIR%\goliath-v4.0.html"
)

echo.
where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [3/3] Node.js bulundu! ER-QPM v1.0 Modeli ve 22/22 Dogrulama Testi calistiriliyor...
    echo ----------------------------------------------------------------------------
    node er_quantum_plasma_model.js
    echo.
    node validate.js
) else (
    echo [3/3] (Bilgi: Bilgisayarinizda Node.js kurulu degilse bile tarayicida acilan HTML dosyalari tam kapasite calisir.)
)

echo.
echo ============================================================================
echo   Tamamlandi! Dosyalar Masaustunde: %WORKDIR%
echo ============================================================================
pause
