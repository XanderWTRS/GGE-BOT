if (require("node:worker_threads").isMainThread)
    return module.exports = { hidden: true }

const pretty = require("pretty-time")
const { getCommanderStats } = require("../../getEquipment")
const { spendSkip, haveEnoughSkips } = require("../skips.js")
const { castles, ClientCommands, AreaType, KingdomID, movements, movementEvents, resources } = require("../../protocols")
const { 
    waitToAttack, 
    getAttackInfo, 
    assignUnit, 
    getAmountSoldiersFlank, 
    getAmountSoldiersFront, 
    getMaxUnitsInReinforcementWave, 
    getTotalAmountToolsFlank } = require("./attack.js")
const { waitForCommanderAvailable, freeCommander, useCommander } = require("../commander")
const { sendXT, waitForResult, botConfig, playerInfo } = require("../../ggeBot.js")
const err = require("../../err.json")
const minTroopCount = 80
const troopBlackList = [277]

try {
    var { recruitTroops } = require("../../plugins-extra/externalEventHelper.js")
}
catch(e) {
    console.debug(e)
}

async function barronHit(type, kingdomID, options, maxLevel) {
    const getLevel = victorys => 
        Math.floor(1.9 * Math.pow(victorys, .555)) + ([1,35,20,45][kingdomID] ?? 0)

    const castle = castles.find(e => e.kingdomID == kingdomID && 
        [AreaType.externalKingdom, AreaType.mainCastle].includes(e.areaInfo.type))

    do {
        try {
            var areas = (await ClientCommands.getAreaInfo(kingdomID,
                castle.areaInfo.x - 50, castle.areaInfo.y - 50,
                castle.areaInfo.x + 50, castle.areaInfo.y + 50))
                .areaInfo.filter(ai => ai.type == type).sort((a, b) =>
                    (Math.pow(castle.areaInfo.x - a.x, 2) + Math.pow(castle.areaInfo.y - a.y, 2)) -
                    (Math.pow(castle.areaInfo.x - b.x, 2) + Math.pow(castle.areaInfo.y - b.y, 2)))
            break
        } catch (e) {
            console.warn(e)
        }
    } while (true)

    async function skipTarget(areaInfo) {
        while (areaInfo.extraData[2] > 0) {
            let skip = spendSkip(areaInfo.extraData[2])

            if (skip == undefined)
                throw new Error("couldntFindSkip")

            await sendXT("msd", JSON.stringify({ 
                X: areaInfo.x, Y: areaInfo.y, MID: -1, NID: -1, MST: skip, KID: `${kingdomID}` }))
            const [, result] = (await waitForResult("msd", 7000, (obj, result) => {
                if (result != 0)
                    return true

                if (obj.AI[0] != areaInfo.type ||
                    obj.AI[6] != kingdomID ||
                    obj.AI[1] != areaInfo.x ||
                    obj.AI[2] != areaInfo.y)
                    return false
                return true
            }))

            if (result != 0)
                break
        }
    }
    
    const sendHit = async () => {
        const commander = await waitForCommanderAvailable(options.commanderWhiteList)
        const hasShieldMadiens = !(((commander.EQ[3] ?? [])[5]?.every(([id, _]) => id == 121 ? false : true)) ?? true)
        try {
            const attackInfo = await waitToAttack(async () => {
                let index = -1
                const timeSinceEpoch = Date.now()
                for (let i = 0; i < areas.length; i++) {
                    const areaInfo = areas[i]
                    const shouldUpgradeTower = options.upgradeTowers && getLevel(areaInfo.extraData[1], kingdomID) != maxLevel
                    const skipsPerTower = 7200
                    
                    const coinSkips = recruitTroops ? Math.floor(resources.coins / (1000 / (20 * 5))) : 0
                    const enoughSkips = haveEnoughSkips(skipsPerTower * movements.reduce((count, movement) => 
                            (movement.targetAttack.type == type ? count++ : count, count), 0) - coinSkips) || (recruitTroops && resources.coins > 25000)
                    
                    if (enoughSkips && (options.useTimeSkips || shouldUpgradeTower)) {
                        try {
                            await skipTarget(areaInfo)
                        }
                        catch(e) {
                            console.warn(e)
                            continue
                        }
                    }
                    else if (((areaInfo.timeSinceRequest + areaInfo.extraData[2] * 1000) - timeSinceEpoch) > 0)
                        continue
                    else if (movements.find(movement =>
                        movement.kingdomID == kingdomID &&
                        movement.targetAttack.x == areaInfo.x && movement.targetAttack.y == areaInfo.y))
                        continue

                    index = i
                    break
                }
                if (index == -1)
                    return

                const AI = areas[index]
                const level = getLevel(AI.extraData[1], kingdomID)

                const attackerMeleeTroops = []
                const attackerRangeTroops = []
                const attackerShieldTools = []
                const attackerWallTools = []

                for (let i = 0; i < castle.unitInventory.length; i++) {
                    const unit = castle.unitInventory[i]
                    
                    if (unit.unitInfo == undefined || unit.amount <= 0)
                        continue

                    if (unit.unitInfo.toolCategory &&
                        unit.unitInfo.usageEventID == undefined &&
                        unit.unitInfo.allowedToAttack == undefined &&
                        unit.unitInfo.typ == 'Attack' &&
                        unit.unitInfo.amountPerWave == undefined) {
                        if (unit.unitInfo.wallBonus)
                            attackerWallTools.push(unit)
                        else if (unit.unitInfo.defRangeBonus)
                            attackerShieldTools.push(unit)
                    }
                    else if (unit.unitInfo.fightType == 0) {
                        if (troopBlackList.includes(unit.unitInfo.wodID))
                            continue
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

                attackerWallTools.sort((a, b) =>
                    Number(a.unitInfo.wallBonus) - Number(b.unitInfo.wallBonus))

                attackerShieldTools.sort((a, b) =>
                    Number(a.unitInfo.defRangeBonus) - Number(b.unitInfo.defRangeBonus))

                const autoConfigure = !(options.attackLeft || options.attackRight || options.attackMiddle)
                const commanderStats = getCommanderStats(commander)
                const attackInfo = getAttackInfo(kingdomID, castle, AI, commander, level, parseInt(options.attackWaves), options, commanderStats.additionalWaves)
                const maxTroopFront = getAmountSoldiersFront(level, commanderStats.attackUnitAmountFront)
                const maxTroopFlank = getAmountSoldiersFlank(level, commanderStats.attackUnitAmountFlank)
                const maxToolsFlank = options.useShields ? getTotalAmountToolsFlank(level, 0) : 10

                attackInfo.A.forEach((wave, index) => {
                    let maxTroops = maxTroopFlank

                    if(index == 0 && options.useWallTools) {
                        const desiredToolCount = 10
                        let maxTools = maxToolsFlank
                        if (autoConfigure ? true : options.attackLeft) {
                            wave.L.T.forEach((unitSlot, i) =>
                                maxTools -= assignUnit(unitSlot, i == 0 ?
                                    attackerWallTools : attackerShieldTools, Math.min(maxTools, desiredToolCount)))

                            wave.L.U.forEach(unitSlot =>
                                maxTroops -= assignUnit(unitSlot, attackerRangeTroops.length <= 0 ?
                                    attackerMeleeTroops : attackerRangeTroops, maxTroops))
                        }
                        maxTools = maxToolsFlank
                        if (options.attackRight) {
                            wave.R.T.forEach((unitSlot, i) =>
                                maxTools -= assignUnit(unitSlot, i == 0 ?
                                    attackerWallTools : attackerShieldTools, Math.min(maxTools, desiredToolCount)))

                            maxTroops = maxTroopFlank
                            wave.R.U.forEach(unitSlot =>
                                maxTroops -= assignUnit(unitSlot, attackerRangeTroops.length <= 0 ?
                                    attackerMeleeTroops : attackerRangeTroops, maxTroops))
                        }
                        maxTools = maxToolsFlank
                        if (options.attackMiddle) {
                            wave.M.T.forEach((unitSlot, i) =>
                                maxTools -= assignUnit(unitSlot, i == 0 ?
                                    attackerWallTools : attackerShieldTools, Math.min(maxTools, desiredToolCount)))

                            maxTroops = maxTroopFront
                            wave.M.U.forEach(unitSlot =>
                                maxTroops -= assignUnit(unitSlot, attackerRangeTroops.length <= 0 ?
                                    attackerMeleeTroops : attackerRangeTroops, maxTroops))
                        }
                        return
                    }

                    if (autoConfigure ? true : options.attackLeft) {
                        wave.L.U.forEach(unitSlot =>
                            maxTroops -= assignUnit(unitSlot, attackerMeleeTroops.length <= 0 ?
                                attackerRangeTroops : attackerMeleeTroops, maxTroops))
                    }
                    if (options.attackRight) {
                        maxTroops = maxTroopFlank
                        wave.R.U.forEach(unitSlot =>
                            maxTroops -= assignUnit(unitSlot, attackerMeleeTroops.length <= 0 ?
                                attackerRangeTroops : attackerMeleeTroops, maxTroops))
                    }
                    if (options.attackMiddle) {
                        maxTroops = maxTroopFront
                        wave.M.U.forEach(unitSlot =>
                            maxTroops -= assignUnit(unitSlot, attackerMeleeTroops.length <= 0 ?
                                attackerRangeTroops : attackerMeleeTroops, maxTroops))
                    }
                })

                if (autoConfigure ? (hasShieldMadiens ? false : true) : options.attackCourtyard) {
                    let maxTroops = getMaxUnitsInReinforcementWave(playerInfo.level, level) + Number(0 | commanderStats.attackUnitAmountReinforcementBonus)
                    attackInfo.RW.forEach((unitSlot, i) => {
                        let attacker = i & 1 ?
                            (attackerRangeTroops.length > 0 ? attackerRangeTroops : attackerMeleeTroops) : 
                            (attackerMeleeTroops.length > 0 ? attackerMeleeTroops : attackerRangeTroops)

                        maxTroops -= assignUnit(unitSlot, attacker,
                            Math.floor(maxTroops / 2) - 1)
                    })
                }

                await sendXT("cra", JSON.stringify(attackInfo))

                let [obj, result] = await waitForResult("cra", 1000 * 10, (obj, result) => {
                    if (result != 0)
                        return true

                    if (obj.AAM.M.KID != kingdomID || obj.AAM.M.TA[1] != AI.x || obj.AAM.M.TA[2] != AI.y)
                        return false
                    return true
                })

                if (result != 0)
                    throw err[result]

                return obj
            })

            console.info("hittingTargetAttack", KingdomID[kingdomID], ' ', 'C', attackInfo.AAM.UM.L.VIS + 1, ' ', attackInfo.AAM.M.TA[1], ':', attackInfo.AAM.M.TA[2], " ", pretty(Math.round(1000000000 * Math.abs(Math.max(0, attackInfo.AAM.M.TT - attackInfo.AAM.M.PT))), 's'), "tillImpactAttack")
            return true
        } catch (e) {
            freeCommander(commander.lordID)
            switch (e) {
                case "NO_MORE_TROOPS":
                    try {
                        if (botConfig.externalEvent && kingdomID == KingdomID.greatEmpire && recruitTroops) {
                            await recruitTroops()
                            return true
                        }
                    }
                    catch (e) {
                        console.debug(e)
                    }
                    console.log(`[${KingdomID[kingdomID]}] Waiting for more troops`)
                    await new Promise(resolve => movementEvents.on("return", function self(/** @type {import("../../protocols.js").ClassTypes.Movement} */ movement) {
                        if (movement.kingdomID != kingdomID || movement.targetAttack.extraData[0] != castle.extraData[0])
                            return

                        movementEvents.off("return", self)
                        resolve()
                    }))
                    return true
                case "LORD_IS_USED":
                    useCommander(commander.lordID)
                case "COOLING_DOWN":
                case "TIMED_OUT":
                case "ATTACK_TOO_MANY_UNITS":
                    return true
                case "CANT_START_NEW_ARMIES":
                default:
                    throw e
            }
        }
    }

    while (true) {
        if (!options.useTimeSkips && !options.upgradeTowers) {
            let minimumTimeTillHit = 5 * 1000 + Date.now()

            areas.forEach(areaInfo => {
                if (movements.find(movement =>
                    movement.kingdomID == kingdomID &&
                    movement.targetAttack.x == areaInfo.x && movement.targetAttack.y == areaInfo.y))
                    return

                minimumTimeTillHit = Math.min(minimumTimeTillHit, (areaInfo.timeSinceRequest + areaInfo.extraData[2] * 1000))
            })
            
            const time = (Math.max(0, minimumTimeTillHit - Date.now()))
            if (time > 0)
                console.info("waitingForNextPossibleHit", Math.round(time / 1000), "waitingForNextPossibleHit2")
            await new Promise(r => setTimeout(r, time).unref())
        }

        while (await sendHit());
    }
}

module.exports = barronHit