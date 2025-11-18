const { isMainThread } = require('node:worker_threads')
const name = "Common Attack"

if (isMainThread)
    return module.exports = {
        name: name,
        hidden: true
    };

const pretty = require('pretty-time')
const attack = require("./attack.js")
const { xtHandler, sendXT, waitForResult, events } = require("../../ggebot.js")
const { ClientCommands, getResourceCastleList, AreaType, spendSkip } = require('../../protocols.js');
const getAreaCached = require('../../getmap.js');

let commonAttack = async (name, type, kid, options) => {
    let skipTarget = async (kid, x, y, ai) => {
        while(ai[5] > 0) {
            let skip = spendSkip(ai[5])
            
            if(skip == undefined)
                throw new Error("Couldn't find skip")

            sendXT("msd", JSON.stringify({ X: x, Y: y, MID: -1, NID: -1, MST: skip, KID: `${kid}` }))
            let [obj2, result2] = await waitForResult("msd", 7000, (obj, result) => {
                if (result != 0)
                    return true
                let ckid = 0
                switch(type) {
                    case AreaType.barron:
                        ckid = obj.AI[6]
                    break
                    case AreaType.nomadCamp:
                    case AreaType.samCamp:
                    case AreaType.beriCamp:
                        ckid = 0
                        break
                    default:
                    console.warn(`[${name}] unsure how to handle this approprately!`)
                    console.warn(JSON.stringify(obj.AI))
                }

                if (obj.AI[0] != type || ckid != kid || obj.AI[1] != x || obj.AI[2] != y)
                    return false
                return true
            })
            
            if (Number(result2) != 0)
                break
            
            Object.assign(ai, obj2.AI)
        }
    }

    let catListener = async (obj, result) => {
        if (result != 0)
            return

        let attackSource = obj.A.M.SA

        if (attackSource[0] != type)
            return

        skipTarget(obj.A.M.KID, attackSource[1], attackSource[2], attackSource)
    }
    let quit = false
    events.once("unload", () => {
        quit = true

        if (options.useTimeSkips)
            xtHandler.off("cat", catListener)
    })

    if (options.useTimeSkips)
        xtHandler.on("cat", catListener)

    let resourceCastleList = await getResourceCastleList()
    let castle = resourceCastleList.castles.find(e => e.kingdomID == kid)
        .areaInfo.find(e => [AreaType.mainCastle,AreaType.externalKingdom].includes(e.type))

    let gaa = await getAreaCached(kid, castle.x - 50, castle.y - 50,
        castle.x + 50, castle.y + 50)

    let areaInfo = gaa.areaInfo.filter(ai => ai.type == type)
        .sort((a, b) => Math.sqrt(Math.pow(castle.x - a.x, 2) + Math.pow(castle.y - a.y, 2)) -
            Math.sqrt(Math.pow(castle.x - b.x, 2) + Math.pow(castle.y - b.y, 2)))

    while (!quit) {
        let timer = new Date().getTime() + 1000 * 60 * 60 * 3 + 60 * 1000

        for (let i = 0; options.singleTarget ? i < 1 : i < areaInfo.length; i++) {
            const currentAreaInfo = areaInfo[i]
            try {
                if((timer - new Date().getTime()) < 0)
                    break;
                
                let ai = (await ClientCommands.getAreaInfo(
                    kid,
                    currentAreaInfo.x, currentAreaInfo.y,
                    currentAreaInfo.x, currentAreaInfo.y)()).areaInfo[0]

                if (ai.extraData[2] > 0 && !options.useTimeSkips) {
                    console.info(`[${name}] Skipping ${ai.x}:${ai.y} needs time`)
                    continue
                }

                await skipTarget(kid,ai.x, ai.y, [ai.type, ai.x, ai.y, ...ai.extraData])
                let failCount = 0
                newTarget:
                while (!quit) {
                    let eventEmitter = attack(castle.x, castle.y, ai.x, ai.y, kid, undefined, undefined, {...options, ai: [ai.type, ai.x, ai.y, ...ai.extraData]})
                    try {
                        let info = await new Promise((resolve, reject) => {
                            eventEmitter.once("sent", resolve)
                            eventEmitter.once("error", reject)
                        })

                        let timetaken = info.AAM.M.TT
                        let timespent = info.AAM.M.PT
                        let time = timetaken - timespent

                        console.info(`[${name}] Hitting target C${info.AAM.UM.L.VIS + 1} ${ai.x}:${ai.y} ${pretty(Math.round(1000000000 * Math.abs(Math.max(0, time))), 's') + " till impact"}`)
                        failCount = 0
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
                            case "CANT_START_NEW_ARMIES":
                                break
                            case "RECRUITED_MORE_TROOPS":
                                if(failCount++ < 5)
                                    break
                            case "COOLING_DOWN": 
                                break newTarget
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
    }
}
module.exports = commonAttack
