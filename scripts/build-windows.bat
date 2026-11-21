@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title Agendamea - Windows 11 Kurulum Derleyici (Vellium)
cd /d "%~dp0.."

echo.
echo  =========================================================
echo   Agendamea v1.0.0 - Windows 11 Kurulum (.exe) Derleyici
echo   Yayinci: Vellium (vellium.dev)
echo  =========================================================
echo.

:: 1. Node.js ve npm kontrolu
where node >nul 2>&1
if errorlevel 1 (
  echo  [HATA] Node.js bulunamadi.
  echo  Lutfen https://nodejs.org adresinden Node.js 22 LTS kurun.
  echo.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo  [HATA] npm bulunamadi. Lutfen Node.js kurulumunu kontrol edin.
  echo.
  pause
  exit /b 1
)

:: 2. Acik Agendamea penceresi varsa dosya kilidini onlemek icin kapat
tasklist /FI "IMAGENAME eq Agendamea.exe" 2>nul | find /I "Agendamea.exe" >nul
if not errorlevel 1 (
  echo  [1/5] Calisan Agendamea uygulamasi kapatiliyor...
  taskkill /F /IM Agendamea.exe >nul 2>&1
  timeout /t 1 /nobreak >nul
)

:: 3. Eski build dosyalari varsa temizle, yoksa temiz derlemeye basla
set "HAD_OLD_BUILD=0"
if exist "dist" set "HAD_OLD_BUILD=1"
if exist "dist-server" set "HAD_OLD_BUILD=1"
if exist "release" set "HAD_OLD_BUILD=1"
if exist "server.js" set "HAD_OLD_BUILD=1"

if "!HAD_OLD_BUILD!"=="1" (
  echo  [2/5] Eski build dosyalari tespit edildi, temizleniyor...
  if exist "dist" rmdir /s /q "dist"
  if exist "dist-server" rmdir /s /q "dist-server"
  if exist "release" rmdir /s /q "release"
  if exist "server.js" del /f /q "server.js"

  if exist "release" (
    echo  [HATA] Eski release klasoru silinemedi. Acik klasor/uygulamalari kapatip tekrar deneyin.
    echo.
    pause
    exit /b 1
  )
  echo        Eski build temizlendi.
) else (
  echo  [2/5] Eski build bulunamadi, sifirdan temiz build baslatiliyor...
)

:: 4. Bagimlilik kontrolu (node_modules veya electron-builder eksikse kur)
if not exist "node_modules\.bin\electron-builder.cmd" (
  echo  [3/5] Gerekli paketler kuruluyor ^(ilk seferde biraz surebilir^)...
  call npm install
  if errorlevel 1 (
    echo.
    echo  [HATA] npm install basarisiz oldu. Yukaridaki hata mesajini inceleyin.
    echo.
    pause
    exit /b 1
  )
) else (
  echo  [3/5] Paketler hazir.
)

:: 5. Kurulum gorselleri eksikse otomatik uret
if not exist "electron-resources\installerSidebar.bmp" (
  echo  [4/5] Ozel kurulum gorselleri olusturuluyor...
  call npm run icons:installer
  if errorlevel 1 (
    echo.
    echo  [HATA] Kurulum gorselleri olusturulamadi.
    echo.
    pause
    exit /b 1
  )
) else (
  echo  [4/5] Kurulum ve kaldirma gorselleri hazir.
)

:: 6. Tam Windows 11 NSIS Setup (.exe) derlemesi
echo  [5/5] Agendamea Windows 11 kurulum paketi derleniyor...
echo.
call npm run dist:win
if errorlevel 1 (
  echo.
  echo  [HATA] Derleme basarisiz oldu. Yukaridaki hata mesajini inceleyin.
  echo.
  pause
  exit /b 1
)

echo.
echo  =========================================================
echo   BASARILI! Yeni Windows 11 kurulum dosyasi hazir:
echo.
for %%F in ("release\Agendamea-Setup-*.exe" "release\Agendamea-Portable-*.exe") do (
  echo   ^> %%~fF
)
echo  =========================================================
echo.

if exist "release" (
  start "" explorer.exe "%~dp0..\release"
)

pause
exit /b 0
