@echo off

if not exist ".git"\ (
  git init -b main 
  git remote add origin https://github.com/darrenthebozz/GGE-BOT.git
  git add .
  git fetch origin
  git reset --hard 
  git clean -f -d
  git pull origin main
  git submodule deinit -f plugins-extra
  git submodule init plugins-extra
)

git pull origin main --recurse-submodules
call npm i
start node main.js
start http://127.0.0.1:3001
pause
