const { isMainThread, workerData, parentPort } = require('node:worker_threads');
const name = "Aquaisland"

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

    addToWhiteList(24)

    let maxListedAquaObjects = 64
    
    let aquaMapObjects = []
    
    let needSort = false

    let map = new Map()

    mapObjects[4][24].event.addListener("update", (/**@type {TargetType}*/mapObject) => {
        if (aquaMapObjects.find(e => mapObject == e) || ![3,6].includes(mapObject.ai[8 - 3])) 
            return
        
        if(mapObject.ai[9 - 3] < 60 * 10) 
            map.set(mapObject, true)

        aquaMapObjects.push(mapObject)
        needSort = true
    })

    xtHandler.on("lli", async (_,r) => r == 0 ? 
        setInterval(async () => {
            let currentDate = new Date().getTime()
            if (needSort) {
                aquaMapObjects.sort((a, b) => {
                    if (a.ai[4 - 3] < b.ai[4 - 3]) return -1;
                    if (a.ai[4 - 3] > b.ai[4 - 3]) return 1;
                    //time
                    let deltaTimeA = a.ai[9 - 3] - (currentDate - a.timeSinceRequest) / 1000
                    let deltaTimeB = b.ai[9 - 3] - (currentDate - b.timeSinceRequest) / 1000
                    if (deltaTimeA < deltaTimeB) return -1;
                    if (deltaTimeA > deltaTimeB) return 1;
                    //Island Type
                    if (a.ai[8 - 3] != 6 && b.ai[8 - 3] == 6)
                        return -1
                    if (a.ai[8 - 3] = 6 && b.ai[8 - 3] != 6)
                        return 1

                    return 0;
                })
                needSort = false
            }

            let msg = "Coords  Time\n"

            aquaMapObjects.every(async (/**@type {TargetType}*/mapObject, index) => {
                let deltaTime = mapObject.ai[9 - 3] - (currentDate - mapObject.timeSinceRequest) / 1000
                let playerId = mapObject.ai[4 - 3]
                let isSmallIsland = mapObject.ai[8 - 3] == 6

                if (index >= maxListedAquaObjects || playerId > 0)
                    return false

                let hour12 = new Date((deltaTime + 3600) * 1000 + currentDate).toLocaleTimeString()
                if (hour12.length <= 10)
                    hour12 += ' '

                msg += `${mapObject.x}\:${mapObject.y}   ${isSmallIsland ? "(Small)" : "(Big)  "} ${hour12} ${pretty(Math.round(1000000000 * Math.abs(Math.max(0, deltaTime))), 's')}\n`

                if(map.get(mapObject) != true && deltaTime < 60 * 10) {
                    map.set(mapObject, true)
    
                    let mention = "<@&1266227924592496670> "

                    let channelIDs = (await getUser()).map(user => user.state ? user.plugins?.aquaisland?.alertChannelID : undefined).filter(channelID => channelID)

                    channelIDs.forEach(async channelID => {
                        try {
                            const channel = await (await client).channels.fetch(channelID)

                            channel.send(
                                mention + 
                                `${mapObject.x}:${mapObject.y} ${isSmallIsland ? "(Small)" : "(Large)"}` + 
                                ` <t:${Math.round(new Date().getTime() / 1000 + deltaTime)}:R>`
                            )
                            return true
                        }
                        catch (e) {
                            console.warn(e)
                        }
                    });
                }
                if (deltaTime <= 0 && !mapObject.updateRealtime) {
                    mapObject.updateRealtime = true
                    mapObject.event.addListener("update", function func(/**@type {TargetType}*/mapObject) {
                        let time = mapObject.ai[7 - 3]

                        if (time <= 0 && !(aquaMapObjects.indexOf(mapObject) >= maxListedAquaObjects) && playerId == mapObject.ai[4 - 3])
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

            let channelIDs = (await getUser()).map(user => user.state ? user.plugins?.aquaisland?.channelID : undefined).filter(channelID => channelID)
        
            channelIDs.every(async channelID => {
                try {
                    const channel = await (await client).channels.fetch(channelID)
    
                    let message = ((await channel.messages.fetch({ limit: 1 })).first())
                    if (!message || message.author.id != (await client).user.id)
                        message = await channel.send({ content: "``` ```", flags: [4096] })
    
                    if (message.content == msg)
                        return false
                    message.edit(msg)
                    return true
                }
                catch(e) {
                    console.warn(e)
                    return true
                }
            });
        }, 6 * 1000).unref() : void 0)

