const { isMainThread } = require('node:worker_threads')

const name = "Attack Barrons (Burning Sands)"
if (isMainThread)
    return module.exports = {
        name: name,
        description: "Hits Barrons",
        pluginOptions: [
            {
                type: "Checkbox",
                label: "Use Coin",
                key: "useCoin",
                default: false
            },
            {
                type: "Checkbox",
                label: "Use TimeSkips",
                key: "useTimeSkips",
            },
        ]
    }

const { events, botConfig } = require("../../ggebot.js")
const { KingdomID, AreaType } = require('../../protocols.js')
const commonAttack = require('./sharedBarronAttackLogic.js')
const pluginOptions = botConfig.plugins[require('path').basename(__filename).slice(0, -3)] ??= {}

events.on("load", () => commonAttack(name,AreaType.barron,KingdomID.burningSands, pluginOptions))