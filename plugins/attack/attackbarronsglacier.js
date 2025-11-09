const { isMainThread } = require('node:worker_threads')

const name = "Attack Barrons (Glacier)"
if (isMainThread)
    return module.exports = {
        name: name,
        description: "Hits Barrons",
        pluginOptions: [
            {
                type: "Checkbox",
                label: "Single Target",
                key: "singleTarget",
            },
            {
                type: "Checkbox",
                label: "Use TimeSkips",
                key: "useTimeSkips",
            },
            {
                type: "Checkbox",
                label: "Use 5 TimeSkips",
                key: "5minuteSkips",
            },
            {
                type: "Checkbox",
                label: "oneFlank",
                key: "oneFlank",
                default: false
            },
        ]
    }

const { botConfig, events } = require("../../ggebot")

const { KingdomID, AreaType } = require('../../protocols.js')
const commonAttack = require('./sharedBarronAttackLogic.js')
const pluginOptions = botConfig.plugins[require('path').basename(__filename).slice(0, -3)] ??= {}

events.on("load", () => commonAttack(name,AreaType.barron,KingdomID.everWinterGlacier, pluginOptions))