if (require('node:worker_threads').isMainThread)
    return module.exports = {
        pluginOptions: [
            {
                type: "Text",
                label: "Com White List",
                key: "commanderWhiteList"
            }
        ]
    }

const { KingdomID } = require('../../protocols.js')
const { botConfig, events } = require('../../ggeBot.js')
const fortressHit = require('./sharedFortressAttackLogic.js')

const pluginOptions = botConfig.plugins[require('path').basename(__filename).slice(0, -3)] ?? {}
const kid = KingdomID.everWinterGlacier
const level = 20

events.on("load", () => 
    fortressHit(kid, level, pluginOptions))