require('node:worker_threads').isMainThread ? 
    module.exports = { hidden: true } : 
    module.exports = new Promise(r => require("../ggebot").xtHandler.once("gpi", o =>r(Number(o.PID))))