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
  git submodule deinit -f plugins-extra
  git submodule init plugins-extra
  git submodule deinit -f website
  git submodule init website
  git submodule update --init -f website
fi

git config --local core.hooksPath .githooks/
cd website 
git config --local core.hooksPath .githooks/
cd ..

git pull origin main --no-recurse-submodules
git submodule update --init -f website

if gh auth status >/dev/null 2>&1; then
  git submodule update --init -f plugins-extra
fi
echo "Last commit message:"
git show --format=%s -s

if [ ! -f website/build/index.html ] || [ -f website/.needsRebuild ]; then
  cd website
  npm install
  npm run build
  rm -f .needsRebuild
  cd ..
fi

if test -f .update || [ ! -d "node_modules" ]; then
  npm i
  rm -f .update
fi
 
if which xdg-open > /dev/null
then
  xdg-open $URL &
elif which gnome-open > /dev/null
then
  gnome-open $URL &
fi

node --no-warnings main.js