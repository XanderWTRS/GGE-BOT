if (require('node:worker_threads').isMainThread)
    return module.exports = {
        pluginOptions: [
            {
                type: "Channel",
                key: "channelID"
            }
        ]
    }

const pretty = require('pretty-time')
const { events, botConfig } = require("../../ggeBot.js")
const { ClientCommands: { preSpyInfo }, spiralCoordinates } = require("../../protocols")
const getAreaCached = require('../../getMap.js')
const { client } = require("./discord.js")

const pluginOptions = botConfig.plugins[require('path').basename(__filename).slice(0, -3)] ?? {}
const type = 11

events.once("load", async () => {
    /** @type {Array<import('../../protocols.js').Types.GAAAreaInfo>} */
    const areas = []

    for (let kingdomID = 1; kingdomID < 4; kingdomID++) {
        const getFirstFortress = async () => {
            while (true) {
                try {
                    return (await getAreaCached(kingdomID,
                        (1300 / 2) - 50, (1300 / 2) - 50,
                        (1300 / 2) + 50, (1300 / 2) + 50))
                        .areaInfo.filter(e => e.type == type).sort((a, b) =>
                            Math.sqrt(Math.pow((1300 / 2) - a.x, 2) + Math.pow((1300 / 2) - a.y, 2)) -
                            Math.sqrt(Math.pow((1300 / 2) - b.x, 2) + Math.pow((1300 / 2) - b.y, 2))
                        )[0]
                } catch (e) {
                    console.warn(e)
                }
            }
        }

        areas.push(await getFirstFortress())
        
        fortressLoop:
        for (let j = 1; ; j++) {
            const { x: rX, y: rY } = spiralCoordinates(j)

            while(true) {
                try {
                    let { areaInfo, result } = await preSpyInfo(
                        areas[0].x + rX * 39, 
                        areas[0].y + rY * 39, 
                        kingdomID)()

                    if (result != 0)
                        break fortressLoop

                    areas.push(areaInfo)
                    break
                } catch (e) {
                    console.warn(e)
                }
            }
        }
    }

    const sortData = () => {
        const KIDPOW = [, 1, 0, 3]

        areas.sort((a, b) => KIDPOW[a.extraData[4]] - KIDPOW[b.extraData[4]]).sort((a, b) => 
            a.extraData[2] - b.extraData[2])
    }

    sortData()

    const KIDNames = [,
        "\u001b[2;33mBurning Sands\u001b[0m     ",
        "\u001b[2;34mEverwinter Glacier\u001b[0m",
        "\u001b[2;31mFire peaks\u001b[0m        "
    ]

    setInterval(async () => {
        const date = Date.now()
        let msg = "```ansi\nLocation           Coords  Time\n"
        let everwinterGlacier = 0

        areas.every(area => {
            const kingdomID = area.extraData[4]
            const deltaTime = area.extraData[2] - (date - area.timeSinceRequest) / 1000

            if (kingdomID == 2 && everwinterGlacier++ >= 15)
                return true

            if (deltaTime <= 0)
                preSpyInfo(area.x, area.y, kingdomID)().then(({ areaInfo: area }) =>
                    area.extraData[2] > 0 && sortData())
            
            msg += `${KIDNames[kingdomID]} ${area.x}\:${area.y} ${pretty(Math.max(0, Math.round(1000000000 * deltaTime)), 's')}\n`

            if (msg.length > 2000 - 3)
                return (msg = msg.replace(/\n.*\n$/, ''), false)

            return true
        })

        msg += "```"

        const channel = await client.channels.fetch(pluginOptions.channelID)

        let message = (await channel.messages.fetch({ limit: 1 })).first()
        if (!message?.editable || message.author.id != client.user.id)
            message = await channel.send({ content: "```Loading...```", flags: [4096] })

        if (message.content == msg)
            return
        
        message.edit(msg)
    }, 6 * 1000).unref()
})