@echo off

if not exist ".git"\ (
  git init -b main >NUL 2>&1
  git remote add origin https://github.com/darrenthebozz/GGE-BOT.git >NUL 2>&1
  git add . >NUL 2>&1
  git fetch origin >NUL 2>&1
  git reset --hard >NUL 2>&1
  git clean -f -d >NUL 2>&1
  git pull origin main >NUL 2>&1
  
  git config --unset credential.helper

  git submodule deinit -f plugins-extra >NUL 2>&1
  git submodule init plugins-extra >NUL 2>&1
) else (
  git config --unset credential.helper
)

set GCM_INTERACTIVE="never"
set GIT_TERMINAL_PROMPT=0
gh auth status >NUL 2>&1
if %ERRORLEVEL% EQU 0 (
  git pull origin main --recurse-submodules
) else (
  git pull origin main
)
call npm i
start http://127.0.0.1:3001
node --no-warnings main.js
pause
