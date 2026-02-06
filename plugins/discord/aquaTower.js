if (require('node:worker_threads').isMainThread)
    return module.exports = {
        pluginOptions: [
            {
                type: "Channel",
                key: "channelID",
            },

            {
                type: "Channel",
                key: "alertChannelID",
            }
        ]
    }

const { events, botConfig } = require("../../ggeBot.js")
const { clientReady } = require('./discord.js')
const { TargetType, mapObjects, addToWhiteList } = require("../getRegions.js")
const { getKingdomInfoList, KingdomID } = require('../../protocols.js')

const pluginOptions = botConfig.plugins[require('path').basename(__filename).slice(0, -3)] ?? {}
addToWhiteList(25)
let aquaMapObjects = []
let needSort = false

let map = new Map()
let aquaFortsAlert = []

mapObjects[4][25].event.addListener("update", async (/**@type {TargetType}*/mapObject) => {
    let type = mapObject.ai[5 - 3]
    let deltaTime = mapObject.ai[8 - 3] - (Date.now() - mapObject.timeSinceRequest) / 1000

    if (aquaMapObjects.find(e => mapObject == e)) {
        let hitsLeft = 10 - mapObject.ai[7 - 3]
        if ([9, 14].includes(type) && deltaTime <= 0 && map.get(mapObject) == undefined && hitsLeft == 10) {
            map.set(mapObject, true)

            let mention = "<@&1266227556529606676> "

            if(pluginOptions.alertChannelID) {
                try {
                    const channel = channelID = await (await clientReady).channels.fetch(pluginOptions.alertChannelID)
                    channel.send(mention + `${mapObject.x}:${mapObject.y} ${type == 9 ? "(Easy)" : "(Hard)"}`)
                    return true
                }
                catch (e) {
                    console.warn(e)
                }
            }
        }

        return
    }
    if (mapObject.ai[8 - 3] < 60 * 10) //mapObject.ai[8 - 3] == time in seconds
        map.set(mapObject, true)

    aquaMapObjects.push(mapObject)
    needSort = true
})
let maxAquaTowers = 60

events.once("load", async (_, r) => {
        let kingdomInfoList = await getKingdomInfoList()
    
        if (!kingdomInfoList.unlockInfo.find(e => e.kingdomID == KingdomID.stormIslands)?.isUnlocked)
            return console.warn("wontRunWithoutStormUnlocked")

    setInterval(async () => {
        let currentDate = Date.now()
        if (needSort) {
            aquaMapObjects.sort((a, b) => {
                //time
                let deltaTimeA = Math.max(0, a.ai[8 - 3] - (currentDate - a.timeSinceRequest) / 1000)
                let deltaTimeB = Math.max(0, b.ai[8 - 3] - (currentDate - b.timeSinceRequest) / 1000)
                if (deltaTimeA < deltaTimeB) return -1
                if (deltaTimeA > deltaTimeB) return 1
                //level
                if ((a.ai[5 - 3] % 10) > (b.ai[5 - 3] % 10)) return -1
                if ((a.ai[5 - 3] % 10) < (b.ai[5 - 3] % 10)) return 1
                //hits left
                if (a.ai[7 - 3] < b.ai[7 - 3]) return -1
                if (a.ai[7 - 3] > b.ai[7 - 3]) return 1

                return 0
            })
            needSort = false
        }

        let msg = "Coords  Level        Hits Left\n"

        aquaMapObjects.every((/**@type {TargetType}*/mapObject, index) => {
            let type = mapObject.ai[5 - 3]
            let deltaTime = mapObject.ai[8 - 3] - (currentDate - mapObject.timeSinceRequest) / 1000
            let hitsLeft = 10 - mapObject.ai[7 - 3]

            if (index >= maxAquaTowers || deltaTime > 0)
                return false

            let toLevel = {
                7: 60,
                8: 70,
                9: 80,
                10: 40,
                11: 50,
                12: 60,
                13: 70,
                14: 80,
            }

            msg += `${mapObject.x}\:${mapObject.y} lv ${toLevel[type]} (${[7, 8, 9].includes(type) ? "Easy" : "Hard"}) ${hitsLeft}\n`

            if (deltaTime <= 0 && !mapObject.updateRealtime) {
                mapObject.updateRealtime = true
                mapObject.event.addListener("update", function func(/**@type {TargetType}*/mapObject) {
                    let time = mapObject.ai[8 - 3]

                    if (hitsLeft != 10 - mapObject.ai[7 - 3])
                        needSort = true

                    if (time <= 0 && !(aquaMapObjects.indexOf(mapObject) >= maxAquaTowers))
                        return

                    map.set(mapObject, undefined)

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
                if (!message || message.author.id != (await clientReady).user.id) {
                    message = await channel.send({ content: "```Loading...```", flags: [4096] })
                    return true
                }

                if (message.content == msg)
                    return false
                message.edit(msg)
                return true
            }
            catch (e) {
                console.warn(e)
                return true
            }
    }, 6 * 1000).unref()
})
