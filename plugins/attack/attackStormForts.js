const fs = require("fs")
if (require('node:worker_threads').isMainThread) {
    module.exports = {
        pluginOptions: [
            { type: "Label", key: "easyForts", md: 2 },
            { type: "Checkbox", key: "allowLvl60Easy", default: true },
            { type: "Checkbox", key: "allowLvl70Easy", default: true },
            { type: "Checkbox", key: "allowLvl80Easy", default: true },
            { type: "", md: 3 },

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
            { type: "Checkbox", key: "useCoin", default: false },
            // { type: "Checkbox", key: "meadReplace", default: false },
            { type: "Checkbox", key: "resourceSend", default: false },
        ]
    }
    try {
        fs.accessSync("./plugins-extra/upgradeStormCargo.js")
        module.exports.pluginOptions.push({
            type: "Checkbox",
            key: "upgradeStormForts"
        })
    }
    catch (e) {
        console.debug(e)
    }
    return module.exports.pluginOptions.push({
        type: "Text",
        key: "commanderWhiteList",
        default: "1-99"
    })
}


const { movementEvents, ClientCommands, AreaType, KingdomID, movements, spiralCoordinates, castles } = require("../../protocols.js")
const { waitToAttack, getAttackInfo, assignUnit, getAmountSoldiersFlank } = require("./attack.js")
const { waitForCommanderAvailable, freeCommander, useCommander } = require("../commander.js")
const { sendXT, waitForResult, botConfig, events, xtHandler } = require("../../ggeBot.js")

const err = require("../../err.json")
const pretty = require('pretty-time')

const minTroopCount = 100

const pluginOptions =
    botConfig.plugins[require("path").basename(__filename).slice(0, -3)] ?? {}

if (pluginOptions.upgradeStormForts) {
    try {
        require("../../plugins-extra/upgradeStormCargo.js")
    }
    catch (e) {
        console.warn(e)
    }
}
// if (pluginOptions.meadReplace) {
//     try {
//         require("../meadReplaceStorm.js")
//     }
//     catch (e) {
//         console.warn(e)
//     }
// }
if (pluginOptions.resourceSend) {
    try {
        require("../resourceSendStorm.js")
    }
    catch (e) {
        console.warn(e)
    }
}

const kingdomID = KingdomID.stormIslands
const type = AreaType.stormTower

events.once("load", async () => {
    const castle = castles.find(e => e.kingdomID == kingdomID && e.areaInfo.type == AreaType.externalKingdom)
    async function onResourceUpdate() {
        let resUpdate = false
        if (pluginOptions["buyCoins"] && castle.getProductionData.maxAmountAqua <=
            Math.min(castle.getProductionData.maxAmountAqua, castle.aqua + 100000)) {
            for (let i = 0; i < Math.floor(castle.aqua / 75000); i++) {
                castle.aqua -= 75000
                sendXT("sbp", JSON.stringify({
                    PID: 2798, BT: 3, TID: -1, AMT: 1,
                    KID: 4, AID: -1, PC2: -1, BA: 0, PWR: 0, _PO: -1
                }))
                console.info("broughtCoins")
            }
            resUpdate = true
        }
        if (pluginOptions["buyDecoration"] && castle.getProductionData.maxAmountAqua <=
            Math.min(castle.getProductionData.maxAmountAqua, castle.aqua + 100000)) {
            for (let i = 0; i < Math.floor(castle.aqua / 100000); i++) {
                castle.aqua -= 100000
                sendXT("sbp", JSON.stringify({
                    PID: 3117, BT: 3, TID: -1, AMT: 1,
                    KID: 4, AID: -1, PC2: -1, BA: 0, PWR: 0, _PO: -1
                }))
                console.info("broughtDeco")
            }
            resUpdate = true
        }
        if (pluginOptions["buyXP"] && castle.getProductionData.maxAmountAqua <=
            Math.min(castle.getProductionData.maxAmountAqua, castle.aqua + 100000)) {
            for (let i = 0; i < Math.floor(castle.aqua / 10000); i++) {
                castle.aqua -= 10000
                sendXT("sbp", JSON.stringify({
                    PID: 3114, BT: 3, TID: -1, AMT: 1,
                    KID: 4, AID: -1, PC2: -1, BA: 0, PWR: 0, _PO: -1
                }))
                console.info("broughtXP")
            }
            resUpdate = true
        }
        if(resUpdate)
            stormCastle.emit("resourceUpdate")
    }
    await onResourceUpdate()
    castle.on("resourceUpdate", onResourceUpdate)

    let allowedLevels = []

    if (pluginOptions["allowLvl40Hard"])
        allowedLevels.push(10)
    if (pluginOptions["allowLvl50Hard"])
        allowedLevels.push(11)
    if (pluginOptions["allowLvl60Hard"])
        allowedLevels.push(12)
    if (pluginOptions["allowLvl70Hard"])
        allowedLevels.push(13)
    if (pluginOptions["allowLvl80Hard"])
        allowedLevels.push(14)
    if (pluginOptions["allowLvl60Easy"])
        allowedLevels.push(7)
    if (pluginOptions["allowLvl70Easy"])
        allowedLevels.push(8)
    if (pluginOptions["allowLvl80Easy"])
        allowedLevels.push(9)

    if (allowedLevels.length === 0)
        allowedLevels.push(7, 8, 9, 13, 14)

    let areas = []

    const sendHit = async () => {
        const commander = await waitForCommanderAvailable(pluginOptions.commanderWhiteList, undefined,
            (a, b) => b.getEffects().lootBonus - a.getEffects().lootBonus)
        try {
            const attackInfo = await waitToAttack(async () => {
                let index = -1
                const timeSinceEpoch = Date.now()
                for (let i = 0; i < areas.length; i++) {
                    const areaInfo = areas[i]

                    if (movements.find(movement =>
                        movement.kingdomID == kingdomID &&
                        movement.targetAttack.x == areaInfo.x && movement.targetAttack.y == areaInfo.y))
                        continue

                    if ((areaInfo.timeSinceRequest + areaInfo.extraData[3] * 1000) - timeSinceEpoch > 0)
                        continue

                    await ClientCommands.preSpyInfo(areaInfo.x, areaInfo.y, kingdomID, false)

                    if (!allowedLevels.includes(areaInfo.extraData[2]))
                        continue

                    if (timeSinceEpoch - (areaInfo.timeSinceRequest + areaInfo.extraData[3] * 1000) > 0)
                        continue

                    index = i
                    break
                }
                if (index == -1)
                    return

                const areaInfo = areas[index]

                const level = {
                    7: 60,
                    8: 70,
                    9: 80,
                    10: 40,
                    11: 50,
                    12: 60,
                    13: 70,
                    14: 80,
                }[areaInfo.extraData[2]]

                const attackerMeleeTroops = []
                const attackerRangeTroops = []
                const attackerWallTools = []

                for (let i = 0; i < castle.unitInventory.length; i++) {
                    const unit = castle.unitInventory[i]
                    if (unit.amount <= 0)
                        continue

                    if (
                        unit.unitInfo.toolCategory &&
                        unit.unitInfo.usageEventID == undefined &&
                        unit.unitInfo.allowedToAttack == undefined &&
                        unit.unitInfo.typ == 'Attack' &&
                        unit.unitInfo.amountPerWave == undefined
                    ) {
                        if (unit.unitInfo.wallBonus)
                            attackerWallTools.push(unit)
                    }
                    else if (unit.unitInfo.fightType == 0 && !unit.unitInfo.beefSupply) {
                        if (unit.unitInfo.role == "melee")
                            attackerMeleeTroops.push(unit)
                        else if (unit.unitInfo.role == "ranged")
                            attackerRangeTroops.push(unit)
                    }
                }

                let allTroopCount = 0

                attackerRangeTroops.forEach(e => allTroopCount += e.amount)
                attackerMeleeTroops.forEach(e => allTroopCount += e.amount)

                if (allTroopCount < minTroopCount)
                    throw "NO_MORE_TROOPS"

                const commanderStats = commander.getEffects()
                const attackInfo = getAttackInfo(kingdomID, castle, areaInfo, commander, level, 3, pluginOptions, commanderStats.additionalWaves)
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

                    wave.L.U.forEach(unitSlot =>
                        maxTroops -= assignUnit(unitSlot, attackerMeleeTroops.length <= 0 ?
                            attackerRangeTroops : attackerMeleeTroops, maxTroops))
                    maxTroops = maxTroopFlank
                    wave.R.U.forEach(unitSlot =>
                        maxTroops -= assignUnit(unitSlot, attackerMeleeTroops.length <= 0 ?
                            attackerRangeTroops : attackerMeleeTroops, maxTroops))
                })

                await sendXT("cra", JSON.stringify(attackInfo))

                let [obj, result] = await waitForResult("cra", 1000 * 10, (obj, result) => {
                    if (result != 0)
                        return true

                    if (obj.AAM.M.KID != kingdomID || obj.AAM.M.TA[1] != areaInfo.x || obj.AAM.M.TA[2] != areaInfo.y)
                        return false
                    return true
                })
                if (result != 0)
                    throw err[result]
                return obj
            })

            if (!attackInfo) {
                freeCommander(commander.lordID)
                return false
            }

            console.info("hittingTargetAttack", 'C', attackInfo.AAM.UM.L.VIS + 1, ' ', attackInfo.AAM.M.TA[1], ':', attackInfo.AAM.M.TA[2], " ", pretty(Math.round(1000000000 * Math.abs(Math.max(0, attackInfo.AAM.M.TT - attackInfo.AAM.M.PT))), 's'), "tillImpactAttack")
            return true
        } catch (e) {
            freeCommander(commander.lordID)
            switch (e) {
                case "NO_MORE_TROOPS":
                    console.log("Waiting for more troops.")
                    await new Promise(resolve => movementEvents.on("return", function self(/** @type {import("../../protocols.js").Types.Movement} */ movement) {
                        if (movement.kingdomID != kingdomID || movement.targetAttack.extraData[0] != castle.id)
                            return

                        movementEvents.off("return", self)
                        resolve()
                    }))
                    return true
                case "LORD_IS_USED":
                    useCommander(commander.lordID)
                case "COOLING_DOWN":
                case "TIMED_OUT":
                case "MISSING_UNITS":
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
                x: castle.areaInfo.x + rX - 50,
                y: castle.areaInfo.y + rY - 50,
                w: castle.areaInfo.x + rX + 50,
                h: castle.areaInfo.y + rY + 50
            }
            if (j > Math.pow(13 * 13, 2))
                break done
        } while ((castle.areaInfo.x + rX) <= -50 || (castle.areaInfo.y + rY) <= -50 || (castle.areaInfo.x + rX) >= (1286 + 50) || (castle.areaInfo.y + rY) >= (1286 + 50))
        rect.x = rect.x < 0 ? 0 : rect.x
        rect.y = rect.y < 0 ? 0 : rect.y
        rect.w = rect.w < 0 ? 0 : rect.w
        rect.h = rect.h < 0 ? 0 : rect.h
        rect.x = rect.x > 1286 ? 1286 : rect.x
        rect.y = rect.y > 1286 ? 1286 : rect.y
        rect.w = rect.w > 1286 ? 1286 : rect.w
        rect.h = rect.h > 1286 ? 1286 : rect.h
        
        areas.push(...(await ClientCommands.getAreaInfo(kingdomID, rect.x, rect.y, rect.w, rect.h))
            .areaInfo.filter(ai => ai.type == type).sort((a, b) =>
            (Math.pow(castle.areaInfo.x - a.x, 2) + Math.pow(castle.areaInfo.y - a.y, 2)) -
            (Math.pow(castle.areaInfo.x - b.x, 2) + Math.pow(castle.areaInfo.y - b.y, 2))))

        if (areas.every(ai => ![7, 8, 9].includes(ai.extraData[2]))) //Find and hit a good one before continuing scanning
            continue

        areas.sort((a, b) => {
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

        for (let i = 0; i < areas.length; i++) {
            const areaInfo = areas[i]

            if (!allowedLevels.includes(areaInfo.extraData[2]))
                if (((areaInfo.timeSinceRequest + areaInfo.extraData[3] * 1000) - Date.now()) <= 0)
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