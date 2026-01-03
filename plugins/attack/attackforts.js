const { isMainThread } = require('node:worker_threads')
const name = "Attack Aqua Forts"

if (isMainThread)
    return module.exports = {
        name: name,
        pluginOptions: [
            {
                type: "Text",
                label: "Com White List",
                key: "commanderWhiteList"
            },
            {
                type: "Checkbox",
                label: "Easy forts only",
                key: "easyfortsonly",
                default: false
            },
            {
                type: "Checkbox",
                label: "Add worser forts",
                key: "addworserforts",
                default: false
            },
            {
                type: "Checkbox",
                label: "Use Coin",
                key: "useCoin",
                default: false
            },
            {
                type: "Checkbox",
                label: "Buy Coins",
                key: "buycoins",
                default: false
            },
            {
                type: "Checkbox",
                label: "Buy Deco",
                key: "buydeco",
                default: false
            },
            {
                type: "Checkbox",
                label: "Buy XP",
                key: "buyxp",
                default: false
            }]
    }

const { getCommanderStats } = require("../../getEquipment")
const { Types, getResourceCastleList, ClientCommands, areaInfoLock, AreaType, KingdomID, kingdomLock } = require('../../protocols')
const { waitToAttack, getAttackInfo, assignUnit, getAmountSoldiersFlank } = require("./attack")
const { movementEvents, waitForCommanderAvailable, freeCommander, useCommander } = require("../commander")
const { sendXT, waitForResult, xtHandler, botConfig, events } = require("../../ggebot")
const getAreaCached = require('../../getmap.js')
const err = require("../../err.json")
const units = require("../../items/units.json")
const pretty = require('pretty-time')

const minTroopCount = 100

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

const pluginOptions = 
    botConfig.plugins[require('path').basename(__filename).slice(0, -3)] ?? {}

const kid = KingdomID.stormIslands
const type = AreaType.stormTower

events.once("load", async () => {
    kingdomLock(() => 
        sendXT("jca", JSON.stringify({ CID: -1, KID: KingdomID.stormIslands })))
    setInterval(() => kingdomLock(() =>
        sendXT("jca", JSON.stringify({ CID: -1, KID: KingdomID.stormIslands }))),
        1000 * 60 * 5)
    let allowedLevels = [
        9,
        8,
        7,
        14,
        13,
        12,
    ]

    if (pluginOptions["easyfortsonly"]) {
        allowedLevels = [
            9, 8, 7
        ]
    }
    if (pluginOptions["addworserforts"])
        allowedLevels.push(11, 10)
    
    let aquamarine = 0
    xtHandler.on("grc", (obj, r) => r == 0 ? aquamarine = obj.A : void 0)
    if (pluginOptions["buycoins"]) {
        xtHandler.addListener("jaa", (_, r) => {
            if (r != 0)
                return

            if (aquamarine > 500000) { //might not work
                sendXT("sbp", JSON.stringify({ "PID": 2798, "BT": 3, "TID": -1, "AMT": 1, "KID": 4, "AID": -1, "PC2": -1, "BA": 0, "PWR": 0, "_PO": -1 }))
                console.info(`[${name}] Buying Coins`)
            }
        })
    }
    if (pluginOptions["buydeco"]) {
        xtHandler.addListener("jaa", (_, r) => {
            if (r != 0)
                return

            if (aquamarine > 500000) {
                sendXT("sbp", JSON.stringify({ "PID": 3117, "BT": 3, "TID": -1, "AMT": 1, "KID": 4, "AID": -1, "PC2": -1, "BA": 0, "PWR": 0, "_PO": -1 }))
                console.info(`[${name}] Buying Deco`)
            }
        })
    }
    if (pluginOptions["buyxp"]) {
        xtHandler.addListener("jaa", (_, r) => {
            if (r != 0)
                return

            for (let i = 0; i < Math.floor(aquamarine / 10000); i++) {
                sendXT("sbp", JSON.stringify({ "PID": 3114, "BT": 3, "TID": -1, "AMT": 1, "KID": 4, "AID": -1, "PC2": -1, "BA": 0, "PWR": 0, "_PO": -1 }))
                console.info(`[${name}] Got XP`)
            }
        })
    }
    let towerTime = new WeakMap()
    let sortedAreaInfo = []
    const movements = []

    xtHandler.on("gam", obj => {
        const movementsGAA = Types.GetAllMovements(obj)
        movementsGAA?.movements.forEach(movement => {
            if(kid != movement.movement.kingdomID)
                return
            
            const targetAttack = movement.movement.targetAttack

            if(type != targetAttack.type)
                return

            if(movements.find(e => e.x == targetAttack.x && e.y == targetAttack.y))
                return

            movements.push(targetAttack)
        })
    })
    movementEvents.on("return", movementInfo => {
        const sourceAttack = movementInfo.movement.movement.sourceAttack
        if(kid != movementInfo.movement.movement.kingdomID ||
           type != sourceAttack.type)
           return

        let index = movements.findIndex(e => e.x == sourceAttack.x && e.y == sourceAttack)
        if(index == -1)
            return
        movements.splice(index, 1)
    })
    const sourceCastleArea = (await getResourceCastleList()).castles.find(e => e.kingdomID == kid)
        .areaInfo.find(e => e.type == AreaType.externalKingdom);
    //Gotta detect cooling down towers
    const sendHit = async () => {
        let comList = undefined
        if (![, ""].includes(pluginOptions.commanderWhiteList)) {
            const [start, end] = pluginOptions.commanderWhiteList.split("-").map(Number).map(a => a - 1);
            comList = Array.from({ length: end - start + 1 }, (_, i) => start + i)
        }

        const commander = await waitForCommanderAvailable(comList, undefined, 
            (a, b) => getCommanderStats(b).relicLootBonus - getCommanderStats(a).relicLootBonus)

        try {
            const attackInfo = await waitToAttack(async () => {
                const sourceCastle = (await ClientCommands.getDetailedCastleList()())
                    .castles.find(a => a.kingdomID == kid)
                    .areaInfo.find(a => a.areaID == sourceCastleArea.extraData[0])
                let index = -1
                const timeSinceEpoch = Date.now()
                for (let i = 0; i < sortedAreaInfo.length; i++) {
                    const oldAreaInfo = sortedAreaInfo[i]
                    
                    if(movements.find(e => e.x == oldAreaInfo.x && e.y == oldAreaInfo.y))
                        continue

                    let time = towerTime.get(oldAreaInfo) - timeSinceEpoch
                    if (time > 0)
                        continue

                    const areaInfo = (await ClientCommands.getAreaInfo(kid, oldAreaInfo.x, oldAreaInfo.y, oldAreaInfo.x, oldAreaInfo.y)()).areaInfo[0]

                    Object.assign(oldAreaInfo, areaInfo)
                    if(!allowedLevels.includes(areaInfo.extraData[2])) {
                        continue
                    }

                    towerTime.set(oldAreaInfo, timeSinceEpoch + oldAreaInfo.extraData[5] * 1000)
                    if(oldAreaInfo.extraData[3] > 0)
                        continue
                    if (towerTime.get(oldAreaInfo) - Date.now() > 0)
                        continue

                    index = i
                    break
                }
                if (index == -1)
                    return

                let AI = sortedAreaInfo.splice(index, 1)[0]

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
                const level = toLevel[AI.extraData[2]]

                const attackInfo = getAttackInfo(kid, sourceCastleArea, AI, commander, level, undefined, pluginOptions.useCoin)

                const attackerMeleeTroops = []
                const attackerRangeTroops = []

                for (let i = 0; i < sourceCastle.unitInventory.length; i++) {
                    const unit = sourceCastle.unitInventory[i]
                    const unitInfo = units.find(obj => unit.unitID == obj.wodID)
                    if (unitInfo == undefined)
                        continue

                    if (unitInfo.fightType == 0) {
                        if (unitInfo.role == "melee")
                            attackerMeleeTroops.push([unitInfo, unit.ammount])
                        else if (unitInfo.role == "ranged")
                            attackerRangeTroops.push([unitInfo, unit.ammount])
                    }
                }

                let allTroopCount = 0

                attackerRangeTroops.forEach(e => allTroopCount += e[1])
                attackerMeleeTroops.forEach(e => allTroopCount += e[1])

                if (allTroopCount < minTroopCount)
                    throw "NO_MORE_TROOPS"

                attackInfo.A.forEach((wave, i) => {
                    if(i > 4)
                        return
                    const commanderStats = getCommanderStats(commander)
                    const maxTroopFlank = getAmountSoldiersFlank(level) * 1 + (commanderStats.relicAttackUnitAmountFlank ?? 0) / 100
                    
                    let maxTroops = maxTroopFlank

                    wave.L.U.forEach((unitSlot, i) =>
                        maxTroops -= assignUnit(unitSlot, attackerMeleeTroops.length <= 0 ?
                            attackerRangeTroops : attackerMeleeTroops, maxTroops))
                    maxTroops = maxTroopFlank
                    wave.R.U.forEach((unitSlot, i) =>
                        maxTroops -= assignUnit(unitSlot, attackerMeleeTroops.length <= 0 ?
                            attackerRangeTroops : attackerMeleeTroops, maxTroops))
                })

                await areaInfoLock(() => sendXT("cra", JSON.stringify(attackInfo)))

                let [obj, r] = await waitForResult("cra", 6000, (obj, result) => {
                    if (result != 0)
                        return true

                    if (obj.AAM.M.KID != kid || obj.AAM.M.TA[1] != AI.x || obj.AAM.M.TA[2] != AI.y)
                        return false
                    return true
                })
                return {...obj, result: r}
            })
            
            if (!attackInfo) {
                freeCommander(commander.lordID)
                return false
            }
            if(attackInfo.result != 0)
                throw err[attackInfo.result]

            console.info(`[${name}] Hitting target C${attackInfo.AAM.UM.L.VIS + 1} ${attackInfo.AAM.M.TA[1]}:${attackInfo.AAM.M.TA[2]} ${pretty(Math.round(1000000000 * Math.abs(Math.max(0, attackInfo.AAM.M.TT - attackInfo.AAM.M.PT))), 's') + " till impact"}`)
            return true
        } catch (e) {
            freeCommander(commander.lordID)
            switch (e) {
                case "NO_MORE_TROOPS":
                                        await new Promise(resolve => movementEvents.on("return", function self(movementInfo) {
                        if (movementInfo.movement.movement.kingdomID != kid)
                            return
                        if (movementInfo.movement.movement.targetAttack.extraData[0] != sourceCastleArea.extraData[0])
                            return

                        movementEvents.off("return", self)
                        resolve()
                    }))
                    return true
                case "LORD_IS_USED":
                    useCommander(commander.lordID)
                case "COOLING_DOWN":
                case "TIMED_OUT":
                case "CANT_START_NEW_ARMIES":
                    return true
                default:
                    throw e
            }
        }
    }
    done:
    for (let i = 0, j = 0; i < 13 * 13; i++) {
        let rX, rY
        let rect
        do {

            ({ x: rX, y: rY } = spiralCoordinates(j++))
            rX *= 100
            rY *= 100

            rect = {
                x: sourceCastleArea.x + rX - 50,
                y: sourceCastleArea.y + rY - 50,
                w: sourceCastleArea.x + rX + 50,
                h: sourceCastleArea.y + rY + 50
            }
            if (j > Math.pow(13 * 13, 2))
                break done
        } while ((sourceCastleArea.x + rX) <= -50 || (sourceCastleArea.y + rY) <= -50 || (sourceCastleArea.x + rX) >= (1286 + 50) || (sourceCastleArea.y + rY) >= (1286 + 50))
        rect.x = rect.x < 0 ? 0 : rect.x
        rect.y = rect.y < 0 ? 0 : rect.y
        rect.w = rect.w < 0 ? 0 : rect.w
        rect.h = rect.h < 0 ? 0 : rect.h
        rect.x = rect.x > 1286 ? 1286 : rect.x
        rect.y = rect.y > 1286 ? 1286 : rect.y
        rect.w = rect.w > 1286 ? 1286 : rect.w
        rect.h = rect.h > 1286 ? 1286 : rect.h
        let gaa = await getAreaCached(kid, rect.x, rect.y, rect.w, rect.h)

        let areaInfo = gaa.areaInfo.filter(ai => ai.type == type)
        .sort((a, b) => {
            let d1 = Math.sqrt(Math.pow(sourceCastleArea.x - a.x, 2) + Math.pow(sourceCastleArea.y - a.y, 2))
            let d2 = Math.sqrt(Math.pow(sourceCastleArea.x - b.x, 2) + Math.pow(sourceCastleArea.y - b.y, 2))
            if (d1 < d2)
                return -1
            if (d1 > d2)
                return 1
        })
        const timeSinceEpoch = Date.now()
        areaInfo.forEach(ai =>
            towerTime.set(ai, timeSinceEpoch + ai.extraData[5] * 1000))

        sortedAreaInfo = sortedAreaInfo.concat(areaInfo)
        sortedAreaInfo.sort((a, b) => {
            if ((a.extraData[2] % 10) > (b.extraData[2] % 10)) 
                return -1
            if ((a.extraData[2] % 10) < (b.extraData[2] % 10)) 
                return 1
            //hits left
            if (a.extraData[4] < b.extraData[4]) 
                return -1
            if (a.extraData[4] > b.extraData[4]) 
                return 1

            return 0
        })
        while (await sendHit());
    }

    while (true) {
        let minimumTimeTillHit = Infinity

        sortedAreaInfo.forEach(e => {
            if ((towerTime.get(e) - Date.now()) <= 0 && !allowedLevels.includes(e.extraData[2])) {
                towerTime.set(areaInfo, timeSinceEpoch + 60 * 60 * 1000) //HACK:
                return
            }
            if (!movements.find(a => a.x == e.x && a.y == e.y))
                minimumTimeTillHit = Math.min(minimumTimeTillHit, towerTime.get(e))
        })

        let time = (Math.max(0, minimumTimeTillHit - Date.now()))
        console.info(`[${name}] Waiting ${Math.round(time / 1000)} for next fortress hit`)
        await new Promise(r => setTimeout(r, time).unref())
        
        while (await sendHit());
    }
})