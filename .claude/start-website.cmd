@echo off
set PATH=C:\Program Files\nodejs;%PATH%
cd /d "%~dp0.."
npx serve website --no-clipboard -l %PORT%
