@echo off
@REM Prevent run as admin issues
cd /D "%~dp0"

if not exist ".git"\ (
  git init -b main >NUL 2>&1
  git remote add origin https://github.com/darrenthebozz/GGE-BOT.git >NUL 2>&1
  git add . >NUL 2>&1
  git fetch origin >NUL 2>&1
  git reset --hard >NUL 2>&1
  git clean -f -d >NUL 2>&1
  git config --local core.hooksPath .githooks/
  git config --unset credential.helper
  git pull origin main >NUL 2>&1
  
  git submodule deinit -f plugins-extra >NUL 2>&1
  git submodule init plugins-extra >NUL 2>&1
) else (
  git config --local core.hooksPath .githooks/
  git config --unset credential.helper
)

git config pull.rebase true

gh auth status >NUL 2>&1
if %ERRORLEVEL% EQU 0 (
  git pull origin main --recurse-submodules
) else (
  git pull origin main
)

cd website
if not exist "build"\ (
  call npm install
  call npm run build
  cd ..
  call npm install
) else (
  cd ..
)

start http://127.0.0.1:3001
node --no-warnings main.js
pause
