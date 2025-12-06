@echo off
git pull
call npm i
start node main.js
start http://127.0.0.1:3001
