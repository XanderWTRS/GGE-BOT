#!/usr/bin/env bash
URL="http://127.0.0.1:3001"
export GCM_INTERACTIVE=never
export GIT_TERMINAL_PROMPT=0

if [ ! -d ".git" ]; then
  git init -b main 
  git remote add origin https://github.com/darrenthebozz/GGE-BOT.git
  git add .
  git fetch origin
  git reset --hard 
  git clean -f -d
  git config --local core.hooksPath .githooks/
  git config --unset credential.helper
  git pull origin main
  git submodule deinit -f plugins-extra
  git submodule init plugins-extra
else
  git config --local core.hooksPath .githooks/
  git config --unset credential.helper
fi

git config pull.rebase true

if ! command -v gh >/dev/null 2>&1; then
  git pull origin main 
elif gh auth status >/dev/null 2>&1; then
  git pull origin main --recurse-submodules
fi

cd website
if [ ! -d "build" ]; then
  npm i
  npm run build
  cd ..
  npm i
else 
  cd ..
fi
 
if which xdg-open > /dev/null
then
  xdg-open $URL &
elif which gnome-open > /dev/null
then
  gnome-open $URL &
fi

node --no-warnings main.js
