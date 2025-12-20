const { isMainThread } = require('node:worker_threads')

const name = "Attack Fortress (Everwinter Glacier)"

if (isMainThread)
    return module.exports = {
        name: name,
        description: "Hits fortresses"
    }

const { AreaType, KingdomID } = require('../../protocols')
const { botConfig, events } = require('../../ggebot.js')
const fortressHit = require('./sharedFortressAttackLogic.js')

const pluginOptions = botConfig.plugins[require('path').basename(__filename).slice(0, -3)] ?? {}
const kid = KingdomID.everWinterGlacier
const type = AreaType.fortress
const level = 20

events.on("load", () => 
    fortressHit(name, kid, type, level, pluginOptions))