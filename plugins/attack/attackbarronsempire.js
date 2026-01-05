const { isMainThread } = require('node:worker_threads')

const name = "Attack Barrons (Great Empire)"
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
            {
                type: "Text",
                label: "Com White List",
                key: "commanderWhiteList"
            }
        ]
    }
const { botConfig, events } = require("../../ggebot")
const { KingdomID, AreaType } = require('../../protocols.js')
const commonAttack = require('./sharedBarronAttackLogic.js')

const pluginOptions = botConfig.plugins[require('path').basename(__filename).slice(0, -3)] ??= {}

events.on("load", () => commonAttack(name,AreaType.barron,KingdomID.greatEmpire, pluginOptions))