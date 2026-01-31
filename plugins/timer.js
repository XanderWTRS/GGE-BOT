const { isMainThread, parentPort } = require('node:worker_threads')
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
    return
}

const ActionType = require("../actions.json")
const { botConfig, events } = require("../ggebot")
const pluginOptions = botConfig.plugins[require('path').basename(__filename).slice(0, -3)] ?? {}

if (isNaN(Number(pluginOptions.hours)))
    return console.log(`hours is not a number!`)

events.once("load", () => {
    setTimeout(() => 
        parentPort.postMessage([ActionType.KillBot]),
        Number(pluginOptions.hours) * 1000 * 60 * 60)
})