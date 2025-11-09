const { isMainThread, parentPort, threadId } = require('node:worker_threads');
const { botConfig } = require("../ggebot")
const name = "Timer"

if (isMainThread) {
    module.exports = {
        name: name,
        description: "Shuts down after specific time",
        pluginOptions: [
            {
                type: "Text",
                label: "Hours",
                key: "hours",
                default: 2
            },
        ]
    };
    // const {loggedInUsers} = require("../main")
    return
}

const pluginOptions = botConfig.plugins[require('path').basename(__filename).slice(0, -3)] ??= {}

//Check time here and kill if ahead

const sqlite3 = require("sqlite3")
const {webSocket} = require("../ggebot")

let userDatabase = new sqlite3.Database("./user.db", sqlite3.OPEN_READWRITE)
if(isNaN(Number(pluginOptions.hours)))
    return console.log(`[${name}] hours is not a number!`)
setTimeout(() => {
    userDatabase.run(`UPDATE SubUsers SET state = ? WHERE id = ?`, [0, botConfig.id], _ => {
        userDatabase.close()
        setImmediate(() => webSocket.close())
    })
}, Number(pluginOptions.hours) * 1000 * 60 * 60)