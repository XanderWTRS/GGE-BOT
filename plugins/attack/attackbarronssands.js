const { isMainThread } = require('node:worker_threads')

const name = "Attack Barrons (Burning Sands)"
if (isMainThread)
    return module.exports = {
        name: name,
        description: "Hits Barrons",
        pluginOptions: [
            { type: "Label", label: "Horse Settings" },
            {
                type: "Checkbox",
                label: "Use Feather",
                key: "useFeather",
                default: false
            },
            {
                type: "Checkbox",
                label: "Use Coin",
                key: "useCoin",
                default: true
            },
            {
                type: "Checkbox",
                label: "Use Time Skips",
                key: "useTimeSkips",
                default: false
            },
            { type: "Label", label: "Attack Settings" },
            {
                type: "Checkbox",
                label: "Attack Left Flank",
                key: "attackLeft",
                default: false
            },
            {
                type: "Checkbox",
                label: "Attack Middle",
                key: "attackMiddle",
                default: false
            },
            {
                type: "Checkbox",
                label: "Attack Right Flank",
                key: "attackRight",
                default: false
            },
            {
                type: "Checkbox",
                label: "Attack Courtyard",
                key: "attackCourtyard",
                default: false
            },
            {
                type: "Text",
                label: "Com White List",
                key: "commanderWhiteList"
            },
            {
                type: "Text",
                label: "Max Waves",
                key: "attackWaves"
            }
        ]
    }

const { events, botConfig } = require("../../ggebot.js")
const { KingdomID, AreaType } = require('../../protocols.js')
const commonAttack = require('./sharedBarronAttackLogic.js')
const pluginOptions = botConfig.plugins[require('path').basename(__filename).slice(0, -3)] ?? {}

events.on("load", () => commonAttack(name,AreaType.barron,KingdomID.burningSands, pluginOptions))