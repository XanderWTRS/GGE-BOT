#!/usr/bin/env bash
URL="http://127.0.0.1:3001"

git pull --recurse-submodules
npm i
 
if which xdg-open > /dev/null
then
  xdg-open $URL &
elif which gnome-open > /dev/null
then
  gnome-open $URL &
fi

node main.js