const { isMainThread } = require('node:worker_threads')

const name = "Attack Nomad Camps"
if (isMainThread)
    return module.exports = {
        name: name,
        pluginOptions: [
            {
                type: "Checkbox",
                label: "Use TimeSkips",
                key: "useTimeSkips",
                default: true,
            },
            {
                type: "Checkbox",
                label: "Use 5 TimeSkips",
                key: "5minuteSkips",
            },
            {
                type: "Checkbox",
                label: "No chests",
                key: "noChests",
                default: false
            },
            {
                type: "Checkbox",
                label: "Lowest value chests first",
                key: "lowValueChests",
                default: false
            },
            {
                type: "Checkbox",
                label: "Uses only tools",
                key: "toolsOnly",
                default: false
            }
        ]
    }

const { events, botConfig } = require("../../ggebot.js")
const { KingdomID, AreaType } = require('../../protocols.js')
const commonAttack = require('./sharedBarronAttackLogic.js')
const pluginOptions = botConfig.plugins[require('path').basename(__filename).slice(0, -3)] ??= {}

events.on("load", () => commonAttack(name, AreaType.nomadCamp, KingdomID.greatEmpire, pluginOptions))