if (require('node:worker_threads').isMainThread)
    return module.exports = {
        pluginOptions: [
            {
                type: "Channel",
                key: "channelID",
            }
        ]
    }

const { events, botConfig } = require("../../ggeBot.js")
const { ClientCommands: { preSpyInfo } } = require("../../protocols")
const getAreaCached = require('../../getMap.js')
const { client } = require("./discord.js")
const pretty = require('pretty-time')

const pluginOptions = botConfig.plugins[require('path').basename(__filename).slice(0, -3)] ?? {}

const type = 11


function spiralCoordinates(n) {
    if (n === 0) return { x: 0, y: 0 }

    const k = Math.ceil((Math.sqrt(n + 1) - 1) / 2)
    const layerStart = (2 * (k - 1) + 1) ** 2
    const offset = n - layerStart
    const sideLength = 2 * k
    const side = Math.floor(offset / sideLength)
    const posInSide = offset % sideLength

    let x, y

    switch (side) {
        case 0:
            x = k
            y = -k + 1 + posInSide
            break
        case 1:
            x = k - 1 - posInSide
            y = k
            break
        case 2:
            x = -k
            y = k - 1 - posInSide
            break
        case 3:
            x = -k + 1 + posInSide
            y = -k
            break
    }

    return { x, y }
}

events.once("load", async () => {
    /** @type {Array<import('../../protocols.js').Types.GAAAreaInfo>} */
    const areas = []

    for (let kingdomID = 1; kingdomID < 4; kingdomID++) {
        const getFirstFortress = async () => {
            let error = false
            let gaa
            do {
                try {
                    gaa = await getAreaCached(kingdomID,
                        (1300 / 2) - 50, (1300 / 2) - 50,
                        (1300 / 2) + 50, (1300 / 2) + 50)
                    error = false
                } catch (e) {
                    console.warn(e)
                    error = true
                }
            } while (error);

            return gaa.areaInfo.filter(e => e.type == type).sort((a, b) => {
                let d1 = Math.sqrt(Math.pow((1300 / 2) - a.x, 2) + Math.pow((1300 / 2) - a.y, 2))
                let d2 = Math.sqrt(Math.pow((1300 / 2) - b.x, 2) + Math.pow((1300 / 2) - b.y, 2))
                if (d1 < d2)
                    return -1
                if (d1 > d2)
                    return 1
            })[0]
        }
        const firstFortress = await getFirstFortress()

        areas.push(firstFortress)

        const startingX = firstFortress.x
        const startingY = firstFortress.y
        for (let j = 1; ; j++) {
            const { x: rX, y: rY } = spiralCoordinates(j)
            const x = startingX + rX * 39
            const y = startingY + rY * 39

            let error = false
            do {
                try {
                    var { areaInfo: nextFortress, result } = await preSpyInfo(x, y, kingdomID)()
                    error = false
                } catch (e) {
                    console.warn(e)
                    error = true
                }
            } while (error);

            if (result != 0)
                break

            areas.push(nextFortress)
        }
    }

    const sortData = () => {
        const time = Date.now()
        
        areas.sort((a, b) => {
            const deltaTimeA =
                Math.max(0, a.extraData[2] - (time - a.timeSinceRequest) / 1000)
            const deltaTimeB =
                Math.max(0, b.extraData[2] - (time - b.timeSinceRequest) / 1000)

            if (deltaTimeA < deltaTimeB) return -1
            if (deltaTimeA > deltaTimeB) return 1

            const KIDPOW = [, 1, 0, 3]
            if (KIDPOW[a.extraData[4]] > KIDPOW[b.extraData[4]])
                return -1
            if (KIDPOW[a.extraData[4]] < KIDPOW[b.extraData[4]])
                return 1

            return 0
        })
    }
    
    sortData()

    const KIDNames = [,
        "\u001b[2;33mBurning Sands\u001b[0m     ",
        "\u001b[2;34mEverwinter Glacier\u001b[0m",
        "\u001b[2;31mFire peaks\u001b[0m        "
    ]
    setInterval(async () => {
        const date = Date.now()
        let msg = "Location           Coords  Time\n"
        let everwinterGlacier = 0

        areas.every((area, index) => {
            const kingdomID = area.extraData[4]
            const deltaTime = area.extraData[2] - (date - area.timeSinceRequest) / 1000
            const maxMapObjects = 36

            if (kingdomID == 2 && everwinterGlacier++ >= 15)
                return true
            
            if ((index - Math.max(0, everwinterGlacier - 14)) >= maxMapObjects)
                return false

            if (deltaTime <= 0)
                preSpyInfo(area.x, area.y, kingdomID)().then(({ areaInfo: area }) =>
                    area.extraData[2] > 0 && sortData())

            msg += `${KIDNames[kingdomID]} ${area.x}\:${area.y} ${pretty(Math.round(1000000000 * Math.abs(Math.max(0, deltaTime))), 's')}\n`

            return true
        })


        msg = "```ansi\n" + msg

        while (msg.length >= 2000 - 3)
            msg = msg.replace(/\n.*$/, '')

        msg += "```"

        try {
            const channel = await client.channels.fetch(pluginOptions.channelID)

            let message = (await channel.messages.fetch({ limit: 1 })).first()
            if (!message || !message.editable || message.system || message.author.id != client.user.id)
                message = await channel.send({ content: "```Loading...```", flags: [4096] })

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