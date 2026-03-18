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
  git pull origin main >NUL 2>&1
  
  git submodule deinit -f website >NUL 2 >&1
  git submodule init website >NUL 2 >&1
  git submodule deinit -f plugins-extra >NUL 2 >&1
  git submodule init plugins-extra >NUL 2 >&1

)

git config --local core.hooksPath .githooks/
cd website 
git config --local core.hooksPath .githooks/
cd ..

git pull --recurse-submodules
echo "Last commit message:"
git show --format=%s -s

if not exist "website\build\index.html" goto rebuild
if exist "website\needsRebuild" goto rebuild

:start

CD node_modules 2 >NUL && CD .. || goto update
if exist "update" goto update

start http://127.0.0.1:3001
node --no-warnings main.js
pause
exit
:rebuild
copy /b NUL "website\needsRebuild"
cd website
call npm install
call npm run build
if exist "website\needsRebuild" del /f /q "needsRebuild"
cd ..
goto start
:update
copy /b NUL "update"
call npm install
if exist "update" del /f /q "update"
goto start