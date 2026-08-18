@echo off
cd /d "D:\voxiva.ai\Voxiva Space"
echo START %DATE% %TIME% > "D:\voxiva.ai\Voxiva Space\space-build.log"
call npm run tauri:build >> "D:\voxiva.ai\Voxiva Space\space-build.log" 2>&1
echo EXITCODE=%ERRORLEVEL% >> "D:\voxiva.ai\Voxiva Space\space-build.log"
