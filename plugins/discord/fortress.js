if (require('node:worker_threads').isMainThread)
    return module.exports = {
        pluginOptions: [
            {
                type: "Channel",
                label: "Channel ID",
                key: "channelID",
            }
        ]
    }

const { events, botConfig } = require("../../ggeBot.js")
const { clientReady } = require('./discord')
const pretty = require('pretty-time')
const { TargetType, mapObjects, addToWhiteList } = require("../getRegions.js")

const pluginOptions = botConfig.plugins[require('path').basename(__filename).slice(0, -3)] ?? {}
addToWhiteList(11)
let towers = []
let needSort = false

let updateTower = (/**@type {TargetType}*/targetType) => {
    if (towers.find(e => targetType == e))
        return
    towers.push(targetType)
    needSort = true
}

mapObjects[1][11].event.addListener("update", updateTower)
mapObjects[2][11].event.addListener("update", updateTower)
mapObjects[3][11].event.addListener("update", updateTower)

const maxMapObjects = 36
events.once("load", () => {
    if(!pluginOptions.channelID)
        return console.warn("missingChannel")
    setInterval(async () => {
        let currentDate = Date.now()

        if (needSort) {
            towers.sort((a, b) => {
                let deltaTimeA = Math.max(0, a.ai[5 - 3] - (currentDate - a.timeSinceRequest) / 1000)
                let deltaTimeB = Math.max(0, b.ai[5 - 3] - (currentDate - b.timeSinceRequest) / 1000)
                if (deltaTimeA < deltaTimeB) return -1
                if (deltaTimeA > deltaTimeB) return 1

                KIDPOW = [, 1, 0, 3]
                if (KIDPOW[a.ai[7 - 3]] > KIDPOW[b.ai[7 - 3]])
                    return -1
                if (KIDPOW[a.ai[7 - 3]] < KIDPOW[b.ai[7 - 3]])
                    return 1

                return 0
            })
            needSort = false
        }

        let msg = "Location           Coords  Time\n"
        let everwinterGlacier = 0

        towers.every((/**@type {TargetType}*/mapObject, index) => {
            let kid = mapObject.kid
            let x = mapObject.x
            let y = mapObject.y
            let deltaTime = mapObject.ai[5 - 3] - (currentDate - mapObject.timeSinceRequest) / 1000

            let KIDNames = [
                undefined,
                "\u001b[2;33mBurning Sands\u001b[0m     ",
                "\u001b[2;34mEverwinter Glacier\u001b[0m",
                "\u001b[2;31mFire peaks\u001b[0m        "
            ]

            if (kid == 2 && everwinterGlacier++ >= 15)
                return true

            if ((index - Math.max(0, everwinterGlacier - 14)) >= maxMapObjects)
                return false

            msg += `${KIDNames[kid]} ${x}\:${y} ${pretty(Math.round(1000000000 * Math.abs(Math.max(0, deltaTime))), 's')}\n`

            if (deltaTime <= 0 && !mapObject.updateRealtime) {
                mapObject.updateRealtime = true
                mapObject.event.addListener("update", function func(/**@type {TargetType}*/mapObject) {
                    let time = mapObject.ai[7 - 3]

                    if (time <= 0 && !(towers.indexOf(mapObject) >= maxMapObjects))
                        return

                    mapObject.updateRealtime = false
                    needSort = true
                    mapObject.event.removeListener("update", func)
                })
                needSort = true
            }

            return true
        })

        msg = "```ansi\n" + msg

        while (msg.length >= 2000 - 3)
            msg = msg.replace(/\n.*$/, '')

        msg += "```"

            try {
                const channel = await (await clientReady).channels.fetch(pluginOptions.channelID)

                let message = ((await channel.messages.fetch({ limit: 1 })).first())
                if (!message || !message.editable || message.system || message.author.id != (await clientReady).user.id)
                    message = await channel.send({ content: "```Loading...```", flags: [4096] })

                if (message.content == msg)
                    return false
                message.edit(msg)
                return true
            }
            catch(e) {
                console.warn(e)
                return true
            }

    }, 6 * 1000).unref()
})