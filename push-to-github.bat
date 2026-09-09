@echo off
cd /d "%~dp0"
echo ===================================================
echo   Pushing Mucis source code to GitHub...
echo ===================================================

"C:\Program Files\Git\mingw64\libexec\git-core\git.exe" push -u origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo [SUCCESS] Pushed to GitHub successfully!
) else (
    echo.
    echo [NOTICE] Please make sure you created repository 'mucis-app' on GitHub.
)

echo.
pause
