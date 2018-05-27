@echo off

rem Run agendash in a standalone fashion

node ./bin/agendash-standalone.js --db=mongodb://127.0.0.1:27017/nodeetl --collection=jobs
