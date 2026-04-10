#!/usr/bin/env bash
URL="http://127.0.0.1:3001"
cd "$(dirname "$0")"
if [ ! -d ".git" ]; then
  git init -b main 
  git remote add origin https://github.com/darrenthebozz/GGE-BOT.git
  git add .
  git fetch origin
  git reset --hard 
  git clean -f -d
  git pull origin main
fi

git config --local core.hooksPath .githooks/

git pull origin main

if gh auth status >/dev/null 2>&1; then
  if [ ! -f "plugins-extra" ]; then
    git clone https://github.com/darrenthebozz/GGE-BOT-Extra-Plugins.git plugins-extra
  fi
  if [ -f "plugins-extra" ]; then
    cd plugins-extra
    git pull origin main
    cd ..
  fi
  
fi

if [ ! -f "website" ]; then
  git clone https://github.com/darrenthebozz/GGE-BOT-Website.git website
fi
if [ -f "plugins-extra" ]; then
  cd "website"
  git config --local core.hooksPath .githooks/
  git pull origin main
  cd ..
fi
  

echo "Last commit message:"
git show --format=%s -s

if [ ! -f website/build/index.html ] || [ -f website/needsRebuild ]; then
  cd website
  npm install
  npm run build
  rm -f needsRebuild
  cd ..
fi

if test -f update || [ ! -d "node_modules" ]; then
  npm i
  rm -f update
fi
 
if which xdg-open > /dev/null
then
  xdg-open $URL &
elif which gnome-open > /dev/null
then
  gnome-open $URL &
fi

node --optimize-for-size --no-warnings main.js