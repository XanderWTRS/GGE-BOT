const fs = require("fs")
if (require('node:worker_threads').isMainThread) {
    module.exports = {
        pluginOptions: [
            { type: "Label", key: "easyForts", md: 2 },
            { type: "Checkbox", key: "allowLvl60Easy", default: true },
            { type: "Checkbox", key: "allowLvl70Easy", default: true },
            { type: "Checkbox", key: "allowLvl80Easy", default: true },
            { type: "", md: 3},
            
            { type: "Label", key: "hardForts", md: 2 },
            { type: "Checkbox", key: "allowLvl40Hard", default: false },
            { type: "Checkbox", key: "allowLvl50Hard", default: false },
            { type: "Checkbox", key: "allowLvl60Hard", default: false },
            { type: "Checkbox", key: "allowLvl70Hard", default: false },
            { type: "Checkbox", key: "allowLvl80Hard", default: false },

            { type: "Label", key: "other" },
            { type: "Checkbox", key: "buyCoins", default: true },
            { type: "Checkbox", key: "buyDecoration", default: false },
            { type: "Checkbox", key: "buyXP", default: false },
            {
                type: "Checkbox",
                key: "useFeather",
                default: false
            },
            { type: "Checkbox", key: "useCoin", default: false }
        ]
    }
    try {
        fs.accessSync("./plugins-extra/upgradeStormCargo.js")
        module.exports.pluginOptions.push({
            type: "Checkbox",
            key: "upgradeStormForts"
        })
    }
    catch(e) {
        console.debug(e)
    }
    module.exports.pluginOptions.push({
        type: "Text",
        key: "commanderWhiteList",
        default: "1-99"
    })
    return
}

const { getCommanderStats } = require("../../getEquipment.js")
const { movementEvents, getResourceCastleList, ClientCommands, AreaType, KingdomID, movements } = require('../../protocols.js')
const { waitToAttack, getAttackInfo, assignUnit, getAmountSoldiersFlank } = require("./attack.js")
const { waitForCommanderAvailable, freeCommander, useCommander } = require("../commander.js")
const { sendXT, waitForResult, xtHandler, botConfig, events } = require("../../ggeBot.js")
const getAreaCached = require('../../getMap.js')
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

if (pluginOptions.upgradeStormForts) {
    try {
        require("../../plugins-extra/upgradeStormCargo.js")
    }
    catch (e) {
        console.warn(e)
    }
}

const kingdomID = KingdomID.stormIslands
const type = AreaType.stormTower

xtHandler.on("dcl", async obj => {
    const sourceCastleArea = (await getResourceCastleList()).castles.find(e => e.kingdomID == kingdomID)
        .areaInfo.find(e => e.type == AreaType.externalKingdom)
    
    const castleProd = ClassTypes.DetailedCastleList(obj)
        .castles.find(a => a.kingdomID == kingdomID)
        .areaInfo.find(a => a.areaID == sourceCastleArea.extraData[0])

    if (pluginOptions["buyCoins"] && castleProd.getProductionData.maxAmmountAqua <=
        Math.min(castleProd.getProductionData.maxAmmountAqua, castleProd.aqua + 100000)) {
        for (let i = 0; i < Math.floor(castleProd.aqua / 75000); i++) {
            castleProd.aqua -= 75000
            sendXT("sbp", JSON.stringify({
                PID: 2798, BT: 3, TID: -1, AMT: 1,
                KID: 4, AID: -1, PC2: -1, BA: 0, PWR: 0, _PO: -1
            }))
            console.info("broughtCoins")
        }
    }
    if (pluginOptions["buyDecoration"] && castleProd.getProductionData.maxAmmountAqua <=
        Math.min(castleProd.getProductionData.maxAmmountAqua, castleProd.aqua + 100000)) {
        for (let i = 0; i < Math.floor(castleProd.aqua / 100000); i++) {
            castleProd.aqua -= 100000
            sendXT("sbp", JSON.stringify({
                PID: 3117, BT: 3, TID: -1, AMT: 1,
                KID: 4, AID: -1, PC2: -1, BA: 0, PWR: 0, _PO: -1
            }))
            console.info("broughtDeco")
        }
    }
    if (pluginOptions["buyXP"] && castleProd.getProductionData.maxAmmountAqua <=
        Math.min(castleProd.getProductionData.maxAmmountAqua, castleProd.aqua + 100000)) {
        for (let i = 0; i < Math.floor(castleProd.aqua / 10000); i++) {
            castleProd.aqua -= 10000
            sendXT("sbp", JSON.stringify({
                PID: 3114, BT: 3, TID: -1, AMT: 1,
                KID: 4, AID: -1, PC2: -1, BA: 0, PWR: 0, _PO: -1
            }))
            console.info("broughtXP")
        }
    }
})

events.once("load", async () => {
    let allowedLevels = []
    
    pluginOptions["allowLvl40Hard"] ?? allowedLevels.push(10)
    pluginOptions["allowLvl50Hard"] ?? allowedLevels.push(11)
    pluginOptions["allowLvl60Hard"] ?? allowedLevels.push(12)
    pluginOptions["allowLvl70Hard"] ?? allowedLevels.push(13)
    pluginOptions["allowLvl80Hard"] ?? allowedLevels.push(14)
    pluginOptions["allowLvl60Easy"] ?? allowedLevels.push(7)
    pluginOptions["allowLvl70Easy"] ?? allowedLevels.push(8)
    pluginOptions["allowLvl80Easy"] ?? allowedLevels.push(9)

    if (allowedLevels.length === 0)
        allowedLevels.push(7, 8, 9, 13, 14)

    let sortedAreaInfo = []

    const sourceCastleArea = (await getResourceCastleList()).castles.find(e => e.kingdomID == kingdomID)
        .areaInfo.find(e => e.type == AreaType.externalKingdom)

    const sendHit = async () => {
        const commander = await waitForCommanderAvailable(pluginOptions.commanderWhiteList, undefined, 
            (a, b) => getCommanderStats(b).lootBonus - getCommanderStats(a).lootBonus)

        try {
            const attackInfo = await waitToAttack(async () => {
                let index = -1
                const timeSinceEpoch = Date.now()
                for (let i = 0; i < sortedAreaInfo.length; i++) {
                    const areaInfo = sortedAreaInfo[i]
                    
                    if(movements.find(movement =>
                                        movement.kingdomID == kingdomID &&
                                        movement.targetAttack.x == areaInfo.x && movement.targetAttack.y == areaInfo.y))
                        continue

                    let time = (areaInfo.timeSinceRequest + areaInfo.extraData[3] * 1000) - timeSinceEpoch
                    if (time > 0)
                        continue

                    await ClientCommands.preSpyInfo(areaInfo.x, areaInfo.y, kingdomID)()

                    if(!allowedLevels.includes(areaInfo.extraData[2]))
                        continue

                    if ((areaInfo.timeSinceRequest + areaInfo.extraData[3] * 1000) - Date.now() > 0)
                        continue

                    index = i
                    break
                }
                if (index == -1)
                    return

                let AI = sortedAreaInfo[index]

                const level = {
                    7: 60,
                    8: 70,
                    9: 80,
                    10: 40,
                    11: 50,
                    12: 60,
                    13: 70,
                    14: 80,
                }[AI.extraData[2]]

                const attackerMeleeTroops = []
                const attackerRangeTroops = []
                const attackerWallTools = []
                
                const sourceCastle = (await ClientCommands.getDetailedCastleList())
                    .castles.find(a => a.kingdomID == kingdomID)
                    .areaInfo.find(a => a.areaID == sourceCastleArea.extraData[0])

                for (let i = 0; i < sourceCastle.unitInventory.length; i++) {
                    const unit = sourceCastle.unitInventory[i]
                    const unitInfo = units.find(obj => unit.unitID == obj.wodID)
                    if (unitInfo == undefined)
                        continue

                    if (
                        unitInfo.toolCategory &&
                        unitInfo.usageEventID == undefined &&
                        unitInfo.allowedToAttack == undefined &&
                        unitInfo.typ == 'Attack' &&
                        unitInfo.amountPerWave == undefined
                    ) {
                        if (unitInfo.wallBonus)
                            attackerWallTools.push([unitInfo, unit.ammount])
                    }
                    else if (unitInfo.fightType == 0) {
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

                const commanderStats = getCommanderStats(commander)
                const attackInfo = getAttackInfo(kingdomID, sourceCastleArea, AI, commander, level, 3, pluginOptions, commanderStats.additionalWaves)
                const maxTroopFlank = getAmountSoldiersFlank(level, commanderStats.attackUnitAmountFlank)
                const maxToolsFlank = 10

                attackInfo.LP = 3
                attackInfo.A.forEach((wave, index) => {
                    let maxTroops = maxTroopFlank
                    let maxTools = maxToolsFlank
                    if (index == 0) {
                        wave.L.T.forEach(unitSlot =>
                            maxTools -= assignUnit(unitSlot,
                                attackerWallTools, maxTools))
                    }

                    wave.L.U.forEach((unitSlot, i) =>
                        maxTroops -= assignUnit(unitSlot, attackerMeleeTroops.length <= 0 ?
                            attackerRangeTroops : attackerMeleeTroops, maxTroops))
                    maxTroops = maxTroopFlank
                    wave.R.U.forEach((unitSlot, i) =>
                        maxTroops -= assignUnit(unitSlot, attackerMeleeTroops.length <= 0 ?
                            attackerRangeTroops : attackerMeleeTroops, maxTroops))
                })

                sendXT("cra", JSON.stringify(attackInfo))

                let [obj, r] = await waitForResult("cra", 1000 * 10, (obj, result) => {
                    if (result != 0)
                        return true

                    if (obj.AAM.M.KID != kingdomID || obj.AAM.M.TA[1] != AI.x || obj.AAM.M.TA[2] != AI.y)
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

            console.info("hittingTargetAttack", 'C', attackInfo.AAM.UM.L.VIS + 1, ' ', attackInfo.AAM.M.TA[1], ':', attackInfo.AAM.M.TA[2], " ", pretty(Math.round(1000000000 * Math.abs(Math.max(0, attackInfo.AAM.M.TT - attackInfo.AAM.M.PT))), 's'), "tillImpactAttack")
            return true
        } catch (e) {
            freeCommander(commander.lordID)
            switch (e) {
                case "NO_MORE_TROOPS":
                    await new Promise(resolve => movementEvents.on("return", function self(/** @type {import("../../protocols.js").Types.Movement} */ movement) {
                        if (movement.kingdomID != kingdomID || movement.targetAttack.extraData[0] != sourceCastleArea.extraData[0])
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
        let gaa
        let attemptsLeft = 5
        do {
            try {
                gaa = await getAreaCached(kingdomID, rect.x, rect.y, rect.w, rect.h)
            }
            catch { attemptsLeft-- }
            if (attemptsLeft <= 0)
                continue done
        } while (!gaa)
        
        let areaInfo = gaa.areaInfo.filter(ai => ai.type == type).sort((a, b) => 
            (Math.pow(sourceCastleArea.x - a.x, 2) + Math.pow(sourceCastleArea.y - a.y, 2)) -
            (Math.pow(sourceCastleArea.x - b.x, 2) + Math.pow(sourceCastleArea.y - b.y, 2)))

        sortedAreaInfo.push(...areaInfo)

        if(sortedAreaInfo.every(ai => ![7,8,9].includes(ai.extraData[2]))) //Find and hit a good one before continuing scanning
            continue

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

        for (let i = 0; i < sortedAreaInfo.length; i++) {
            const areaInfo = sortedAreaInfo[i]

            if (!allowedLevels.includes(areaInfo.extraData[2]))
                if(((areaInfo.timeSinceRequest + areaInfo.extraData[3] * 1000) - Date.now()) <= 0)
                    continue
            
            if (movements.find(movement =>
                    movement.kingdomID == kingdomID &&
                    movement.targetAttack.x == areaInfo.x && movement.targetAttack.y == areaInfo.y))
                continue
            
            minimumTimeTillHit = Math.min(minimumTimeTillHit, (areaInfo.timeSinceRequest + areaInfo.extraData[3] * 1000))
        }

        let time = (Math.max(0, minimumTimeTillHit - Date.now()))
        console.info("waitingForNextPossibleHit", Math.round(time / 1000), "waitingForNextPossibleHit2")
        await new Promise(r => setTimeout(r, time).unref())
        
        while (await sendHit());
    }
})