const { isMainThread } = require('node:worker_threads')

const name = "Attack Khan"

if (isMainThread)
    return module.exports = {
        name: name,
        description: "Hits khan camps (NOT RESPONSIBLE)",
        pluginOptions: [
            {
                type: "Text",
                label: "Com White List",
                key: "commanderWhiteList"
            },
            {
                type: "Checkbox",
                label: "Lowest value chests first",
                key: "lowValueChests",
                default: false
            },
            {
                type: "Text",
                label: "Waves till chest",
                key: "wavesTillChests",
                default: 4
            },
            {
                type: "Checkbox",
                label: "Max Hit",
                key: "maxHit",
                default: false
            },
        ]

    }

const { xtHandler, sendXT, waitForResult, events, botConfig } = require("../../ggebot")
const attack = require("./attack.js")
const pretty = require('pretty-time')
const kid = 0
const type = 35
const pluginOptions = botConfig.plugins[require('path').basename(__filename).slice(0, -3)] ??= {}

const { getResourceCastleList, AreaType, spendSkip } = require('../../protocols.js');

events.on("load", async () => {
    const skipTarget = async (AI) => {
        while (AI[5] > 0) {
            let skip = spendSkip(AI[5])
            
            if(skip == undefined)
                throw new Error("Couldn't find skip")

            sendXT("msd", JSON.stringify({ X: AI[1], Y: AI[2], MID: -1, NID: -1, MST: skip, KID: `${kid}` }))
            let [obj, result] = await waitForResult("msd", 7000, (obj, result) => result != 0 || obj.AI[0] == type)

            if (Number(result) != 0)
                break

            Object.assign(AI, obj.AI)
        }
    }

    let catListener = async (obj, result) => {
        if (result != 0)
            return

        let attackSource = obj.A.M.SA

        if (attackSource[0] != type)
            return

        skipTarget(attackSource)
    }
    let quit = false
    events.once("unload", () => {
        quit = true

        xtHandler.off("cat", catListener)
    })

    xtHandler.on("cat", catListener)

    let resourceCastleList = await getResourceCastleList()
    let castle = resourceCastleList.castles.find(e => e.kingdomID == kid)
        .areaInfo.find(e => [AreaType.mainCastle, AreaType.externalKingdom].includes(e.type))

    while (!quit) {
        try {
            sendXT("fnm", JSON.stringify({ T: type, KID: kid, LMIN: -1, LMAX: -1, NID: -801 }))
            let [obj, _] = await waitForResult("fnm", 8500, (obj, result) => {
                if (result != 0)
                    return false

                if (obj.gaa.KID != kid)
                    return false

                if (obj.gaa.AI[0][0] != type)
                    return false

                return true
            })
            let AI = obj.gaa.AI[0]
            await skipTarget(AI)

            while (!quit) {
                let eventEmitter = attack(castle.x, castle.y, AI[1], AI[2], kid, undefined, undefined, { ...pluginOptions, ai: AI })
                try {
                    let info = await new Promise((resolve, reject) => {
                        eventEmitter.once("sent", resolve)
                        eventEmitter.once("error", reject)
                    })

                    let timetaken = info.AAM.M.TT
                    let timespent = info.AAM.M.PT
                    let time = timetaken - timespent

                    console.info(`[${name}] Hitting target C${info.AAM.UM.L.VIS + 1} ${AI[1]}:${AI[2]} ${pretty(Math.round(1000000000 * Math.abs(Math.max(0, time))), 's') + " till impact"}`)
                }
                catch (e) {
                    let timeout = (ms) => new Promise(r => setTimeout(r, ms).unref());
                    switch (e) {
                        case "NO_MORE_TROOPS":
                            let [obj, _] = await waitForResult("cat", 1000 * 60 * 60 * 24, (obj, result) => {
                                return result == 0 && obj.A.M.KID == kid
                            })

                            console.info(`[${name}] Waiting ${obj.A.M.TT - obj.A.M.PT + 1} seconds for more troops`)
                            await timeout((obj.A.M.TT - obj.A.M.PT + 1) * 1000)
                        case "LORD_IS_USED":
                        case "COOLING_DOWN":
                        case "CANT_START_NEW_ARMIES":
                            break
                        default:
                            quit = true
                    }
                    console.warn(`[${name}] ${e}`)
                    continue
                }
                break;
            }
        }
        catch (e) {
            console.warn(`[${name}] ${e}`)
            break
        }
    }
})
