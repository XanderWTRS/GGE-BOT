const { isMainThread } = require('node:worker_threads')

const name = "Attack Fortress (Burning Sands)"

if (isMainThread)
    return module.exports = {
        name: name,
        description: "Hits fortresses",
        pluginOptions: [
            {
                type: "Text",
                label: "Com White List",
                key: "commanderWhiteList"
            }
        ]
    }

const { AreaType, KingdomID } = require('../../protocols')
const { botConfig, events } = require('../../ggebot.js')
const fortressHit = require('./sharedFortressAttackLogic.js')

const pluginOptions = botConfig.plugins[require('path').basename(__filename).slice(0, -3)] ?? {}
const kid = KingdomID.burningSands
const level = 44

events.on("load", () => 
    fortressHit(name, kid, level, pluginOptions))