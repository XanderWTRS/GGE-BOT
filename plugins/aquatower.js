const { isMainThread, workerData, parentPort, threadId } = require('node:worker_threads');
const name = "Aqua Tower"

if (isMainThread)
    return module.exports = {
        name: name,
        force: true,
        pluginOptions: [
            {
                type: "Text",
                label: "Channel ID",
                key: "channelID",
            },

            {
                type: "Text",
                label: "Alert Channel ID",
                key: "alertChannelID",
            }
        ]
    };

if (!workerData.internalWorker)
    return

const { xtHandler, sendXT, waitForResult } = require("../ggebot")
const { client } = require('./discord')
const pretty = require('pretty-time');
const { TargetType, mapObjects, addToWhiteList } = require("./getregions.js");
const getUser = require('./getUser.js');

addToWhiteList(25)
let aquaMapObjects = []
let needSort = false

let map = new Map()
let aquaFortsAlert = []

mapObjects[4][25].event.addListener("update", async (/**@type {TargetType}*/mapObject) => {
    let type = mapObject.ai[5 - 3]
    let deltaTime = mapObject.ai[8 - 3] - (new Date().getTime() - mapObject.timeSinceRequest) / 1000

    if (aquaMapObjects.find(e => mapObject == e)) {
        let hitsLeft = 10 - mapObject.ai[7 - 3]
        if ([9, 14].includes(type) && deltaTime <= 0 && map.get(mapObject) == undefined && hitsLeft == 10) {
            map.set(mapObject, true)

            let mention = "<@&1266227556529606676> "
            let channelIDs = (await getUser()).map(user => user.state ? user.plugins?.aquatower?.alertChannelID : undefined).filter(channelID => channelID)

            channelIDs.forEach(async channelID => {
                try {
                    const channel = await (await client).channels.fetch(channelID)
                    channel.send(mention + `${mapObject.x}:${mapObject.y} ${type == 9 ? "(Easy)" : "(Hard)"}`)
                    return true
                }
                catch (e) {
                    console.warn(e)
                }
            });
        }

        return
    }
    if (mapObject.ai[8 - 3] < 60 * 10) //mapObject.ai[8 - 3] == time in seconds
        map.set(mapObject, true)

    aquaMapObjects.push(mapObject)
    needSort = true
})
let maxAquaTowers = 60

xtHandler.on("lli", async (_, r) => {
    if (r != 0)
        return
    setInterval(async () => {
        let currentDate = new Date().getTime()
        if (needSort) {
            aquaMapObjects.sort((a, b) => {
                //time
                let deltaTimeA = Math.max(0, a.ai[8 - 3] - (currentDate - a.timeSinceRequest) / 1000)
                let deltaTimeB = Math.max(0, b.ai[8 - 3] - (currentDate - b.timeSinceRequest) / 1000)
                if (deltaTimeA < deltaTimeB) return -1;
                if (deltaTimeA > deltaTimeB) return 1;
                //level
                if ((a.ai[5 - 3] % 10) > (b.ai[5 - 3] % 10)) return -1;
                if ((a.ai[5 - 3] % 10) < (b.ai[5 - 3] % 10)) return 1;
                //hits left
                if (a.ai[7 - 3] < b.ai[7 - 3]) return -1
                if (a.ai[7 - 3] > b.ai[7 - 3]) return 1

                return 0;
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

        let channelIDs = (await getUser()).map(user => user.state ? user.plugins?.aquatower?.channelID : undefined).filter(channelID => channelID)

        channelIDs.every(async channelID => {
            try {
                const channel = await (await client).channels.fetch(channelID)

                let message = ((await channel.messages.fetch({ limit: 1 })).first())
                if (!message || message.author.id != (await client).user.id) {
                    message = await channel.send({ content: "``` ```", flags: [4096] })
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
        });
    }, 6 * 1000).unref()
})
