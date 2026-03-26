if (require('node:worker_threads').isMainThread)
    return module.exports = {
        hidden: true
    }

const pretty = require('pretty-time')
const { getCommanderStats } = require("../../getEquipment")
const { getResourceCastleList, ClientCommands, AreaType, spendSkip, KingdomID, movements, movementEvents } = require('../../protocols')
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
const getAreaCached = require('../../getMap.js')
const err = require("../../err.json")
const units = require("../../items/units.json")

const minTroopCount = 100
const troopBlackList = [277]

async function barronHit(type, kingdomID, options, maxLevel) {
    const getLevel = victorys => 
        Math.floor(1.9 * Math.pow(victorys, .555)) + ([1,35,20,45][kingdomID] ?? 0)

    const sourceCastleArea = (await getResourceCastleList()).castles.find(e => e.kingdomID == kingdomID)
        .areaInfo.find(e => [AreaType.externalKingdom, AreaType.mainCastle].includes(e.type));

    /** @type {Array<import("../../protocols.js").Types.GAAAreaInfo>} */
    const areas = []
    /** @type {import("../../protocols.js").Types.ServerGetAreaInfo} */
    do {
        try {
            areas.push(...((await getAreaCached(kingdomID,
                sourceCastleArea.x - 50, sourceCastleArea.y - 50,
                sourceCastleArea.x + 50, sourceCastleArea.y + 50))
                .areaInfo.filter(ai => ai.type == type).sort((a, b) =>
                    (Math.pow(sourceCastleArea.x - a.x, 2) + Math.pow(sourceCastleArea.y - a.y, 2)) -
                    (Math.pow(sourceCastleArea.x - b.x, 2) + Math.pow(sourceCastleArea.y - b.y, 2)))))
            break
        } catch (e) {
            console.warn(e)
        }
    } while (true);


    async function skipTarget(areaInfo) {
        while (areaInfo.extraData[2] > 0) {
            let skip = spendSkip(areaInfo.extraData[2])

            if (skip == undefined)
                throw new Error("couldntFindSkip")

            sendXT("msd", JSON.stringify({ 
                X: areaInfo.x, Y: areaInfo.y, MID: -1, NID: -1, MST: skip, KID: `${kingdomID}` }))
            let result = (await waitForResult("msd", 7000, (obj, result) => {
                if (result != 0)
                    return true

                if (obj.AI[0] != areaInfo.type ||
                    obj.AI[6] != kingdomID ||
                    obj.AI[1] != areaInfo.x ||
                    obj.AI[2] != areaInfo.y)
                    return false
                return true
            }))[1]

            if (result != 0)
                break
        }
    }
    
    const sendHit = async () => {
        const commander = await waitForCommanderAvailable(options.commanderWhiteList)
        const hasShieldMadiens = !(((commander.EQ[3] ?? [])[5]?.every(([id, _]) => id == 121 ? false : true)) ?? true)
        try {
            const attackInfo = await waitToAttack(async () => {
                const sourceCastle = (await ClientCommands.getDetailedCastleList())
                    .castles.find(a => a.kingdomID == kingdomID)
                    .areaInfo.find(a => a.areaID == sourceCastleArea.extraData[0])

                let index = -1
                const timeSinceEpoch = Date.now()
                for (let i = 0; i < areas.length; i++) {
                    const areaInfo = areas[i]
                    const shouldUpgradeTower = options.upgradeTowers && getLevel(areaInfo.extraData[1], kingdomID) != maxLevel
                    if (options.useTimeSkips || shouldUpgradeTower) {
                        
                        try {
                            await skipTarget(areaInfo)
                        }
                        catch(e) {
                            console.warn(e)
                            continue
                        }
                    }
                    else if (movements.find(movement =>
                        movement.kingdomID == kingdomID &&
                        movement.targetAttack.x == areaInfo.x && movement.targetAttack.y == areaInfo.y))
                        continue

                    else if (((areaInfo.timeSinceRequest + areaInfo.extraData[2] * 1000) - timeSinceEpoch) > 0)
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
                const attackerWallTools = []
                const attackerShieldTools = []

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
                        else if (unitInfo.defRangeBonus)
                            attackerShieldTools.push([unitInfo, unit.ammount])
                    }
                    else if (unitInfo.fightType == 0) {
                        if (troopBlackList.includes(unitInfo.wodID))
                            continue
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

                attackerWallTools.sort((a, b) =>
                    Number(a[0].wallBonus) - Number(b[0].wallBonus))

                attackerShieldTools.sort((a, b) =>
                    Number(a[0].defRangeBonus) - Number(b[0].defRangeBonus))

                const autoConfigure = !(options.attackLeft || options.attackRight || options.attackMiddle)
                const commanderStats = getCommanderStats(commander)
                const attackInfo = getAttackInfo(kingdomID, sourceCastleArea, AI, commander, level, parseInt(options.attackWaves), options, commanderStats.additionalWaves)
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

                    if (options.attackLeft) {
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

                sendXT("cra", JSON.stringify(attackInfo))

                let [obj, result] = await waitForResult("cra", 1000 * 10, (obj, result) => {
                    if (result != 0)
                        return true

                    if (obj.AAM.M.KID != kingdomID || obj.AAM.M.TA[1] != AI.x || obj.AAM.M.TA[2] != AI.y)
                        return false
                    return true
                })

                return { ...obj, result }
            })

            if (!attackInfo) {
                freeCommander(commander.lordID)
                return false
            }
            if (attackInfo.result != 0) {
                console.debug(`${JSON.stringify(attackInfo)}`)
                throw err[attackInfo.result]
            }
            console.info("hittingTargetAttack", KingdomID[kingdomID], ' ', 'C', attackInfo.AAM.UM.L.VIS + 1, ' ', attackInfo.AAM.M.TA[1], ':', attackInfo.AAM.M.TA[2], " ", pretty(Math.round(1000000000 * Math.abs(Math.max(0, attackInfo.AAM.M.TT - attackInfo.AAM.M.PT))), 's'), "tillImpactAttack")
            return true
        } catch (e) {
            freeCommander(commander.lordID)
            switch (e) {
                case "NO_MORE_TROOPS":
                    try {
                        if (botConfig.externalEvent && kingdomID == KingdomID.greatEmpire) {
                            await (require("../../plugins-extra/externalEventHelper.js"))
                                .recruitTroops()
                            return true
                        }
                    }
                    catch (e) {
                        console.debug(e)
                    }
                    console.log(`[${KingdomID[kingdomID]}] Waiting for more troops`)
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
                case "ATTACK_TOO_MANY_UNITS":
                    return true
                case "CANT_START_NEW_ARMIES":
                default:
                    throw e
            }
        }
    }

    while (true) {
        if (!options.useTimeSkips) {
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