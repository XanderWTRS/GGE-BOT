#!/usr/bin/env bash
URL="http://127.0.0.1:3001"

if [ ! -d ".git" ]; then
  git init -b main 
  git remote add origin https://github.com/darrenthebozz/GGE-BOT.git
  git add .
  git fetch origin
  git reset --hard 
  git clean -f -d
  git pull origin main
  git submodule deinit -f plugins-extra
  git submodule init plugins-extra
fi

git pull origin main --recurse-submodules
npm i
 
if which xdg-open > /dev/null
then
  xdg-open $URL &
elif which gnome-open > /dev/null
then
  gnome-open $URL &
fi

node --no-warnings main.js
