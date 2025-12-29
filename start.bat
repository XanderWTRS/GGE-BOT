@echo off

if not exist ".git"\ (
  git init -b main
  git remote add origin https://github.com/darrenthebozz/GGE-BOT.git
  git add .
  git pull origin main
)

git pull --recurse-submodules
call npm i
start node main.js
start http://127.0.0.1:3001
pause
