@echo off
title GOLIATH v4.0 - ER-QPM v1.0
color 0A

echo ============================================================================
echo   GOLIATH v4.0 ^& ER-QPM v1.0 - Einstein-Rosen Kuantum Plazma Laboratuvari
echo ============================================================================
echo.

:: 1) Önce tarayicida canli GitHub Pages sayfalarini dogrudan ac (hicbir indirmeye gerek kalmadan aninda acilir!)
echo [1/3] Tarayicida 3B Einstein-Rosen Koprusu (Yesil Kuantum Kupu) ve GOLIATH v4.0 aciliyor...
start "" "https://berkehanbudak1-byte.github.io/goliath-v4/goliath-wormhole-3d.html"
start "" "https://berkehanbudak1-byte.github.io/goliath-v4/"

:: 2) Ayrica yerel kopyayi C:\goliath-v4 altina indir (OneDrive Masaustu yol sorunlarini onlemek icin)
set "WORKDIR=C:\goliath-v4"
if not exist "%WORKDIR%" mkdir "%WORKDIR%"

echo.
echo [2/3] Dosyalar yerel klasore indiriliyor (%WORKDIR%)...
where curl.exe >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    curl.exe -sL "https://raw.githubusercontent.com/berkehanbudak1-byte/goliath-v4/main/goliath-wormhole-3d.html" -o "%WORKDIR%\goliath-wormhole-3d.html"
    curl.exe -sL "https://raw.githubusercontent.com/berkehanbudak1-byte/goliath-v4/main/goliath-v4.0.html" -o "%WORKDIR%\goliath-v4.0.html"
    curl.exe -sL "https://raw.githubusercontent.com/berkehanbudak1-byte/goliath-v4/main/engine.js" -o "%WORKDIR%\engine.js"
    curl.exe -sL "https://raw.githubusercontent.com/berkehanbudak1-byte/goliath-v4/main/er_quantum_plasma_model.js" -o "%WORKDIR%\er_quantum_plasma_model.js"
    echo Yerel dosyalar %WORKDIR% klasorune kaydedildi!
)

echo.
echo [3/3] ER-QPM v1.0 Model Sonuclari:
echo ----------------------------------------------------------------------------
echo   * Kuantum Kupu      : L = 3.0 nm -^> 518 nm (ZUMRUT YESILI, dE = 2.393 eV)
echo   * Alan Parametreleri: Manyetik B = 1.0 T ^| Antimadde Kutlecekimi G = +1.0g
echo   * Bogaz Yakalamasi  : %%88.6 -^> %%97.8 (MHD Z-Pinch + Kutle Kuyusu)
echo   * Yorunge Tahmini   : %%100.0 (325 carpisma artifact'i, karantinasiz)
echo   * Aralik Dagilimi   : D_GUE = 0.163 ^< D_Asal = 0.205 ^< D_Poisson = 0.313
echo   * En Yuksek Asal t* : 239
echo   * 68-Haneli Tam Asal: 82685700173622821895833542656587011200223984821638808880776929401141
echo   * 68-Haneli Rezonans: 96151552872371968288231130960654121376343329220109172106488619833127
echo ----------------------------------------------------------------------------

where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    if exist "%WORKDIR%\er_quantum_plasma_model.js" (
        echo.
        echo Node.js ile canli hesaplama calistiriliyor:
        cd /d "%WORKDIR%"
        node er_quantum_plasma_model.js
    )
)

echo.
echo ============================================================================
echo   Cikmak icin bir tusa basin...
echo ============================================================================
pause
