if (require('node:worker_threads').isMainThread)
    return module.exports = {
        hidden: true
    }

const { getCommanderStats } = require("../../getEquipment")
const { Types, getResourceCastleList, ClientCommands, AreaType, spendSkip, KingdomID } = require('../../protocols')
const { waitToAttack, getAttackInfo, assignUnit, getAmountSoldiersFlank, getAmountSoldiersFront, getMaxUnitsInReinforcementWave } = require("./attack.js")
const { movementEvents, waitForCommanderAvailable, freeCommander, useCommander } = require("../commander")
const { sendXT, waitForResult, xtHandler, botConfig, playerInfo } = require("../../ggeBot.js")
const getAreaCached = require('../../getMap.js')
const err = require("../../err.json")

const units = require("../../items/units.json")
const pretty = require('pretty-time')

const minTroopCount = 100

const troopBlackList = [277]//, 34, 35]

async function barronHit(type, kingdomID, options) {
    function getLevel(victorys, kid) {
        function getKingdomOffset(e) {
            let t = 0
            switch (e) {
                case 0:
                    t = 1
                    break
                case 2:
                    t = 20
                    break
                case 1:
                    t = 35
                    break
                case 3:
                    t = 45
            }
            return t
        }
        var n = getKingdomOffset(kid)
        return (0 | Math.floor(1.9 * Math.pow(Math.abs(victorys), .555))) + n
    }

    /** @type {Array<import("../../protocols.js").Types.GAAAreaInfo>} */
    let sortedAreaInfo = []
    const movements = []

    xtHandler.on("gam", obj => {
        const movementsGAA = Types.GetAllMovements(obj)
        movementsGAA?.movements.forEach(movement => {
            if (kingdomID != movement.movementData.kingdomID)
                return

            const targetAttack = movement.movementData.targetAttack

            if (type != targetAttack.type)
                return

            if (movements.find(e => e.x == targetAttack.x && e.y == targetAttack.y))
                return

            movements.push(targetAttack)
        })
    })
    let skipTarget = async (AI) => {
        while (AI.extraData[2] > 0) {
            let skip = spendSkip(AI.extraData[2])

            if (skip == undefined)
                throw new Error("couldntFindSkip")

            sendXT("msd", JSON.stringify({ X: AI.x, Y: AI.y, MID: -1, NID: -1, MST: skip, KID: `${kingdomID}` }))
            let [obj2, result2] = await waitForResult("msd", 7000, (obj, result) => {
                if (result != 0)
                    return true

                if (obj.AI[0] != AI.type ||
                    obj.AI[6] != kingdomID ||
                    obj.AI[1] != AI.x ||
                    obj.AI[2] != AI.y)
                    return false
                return true
            })

            if (Number(result2) != 0)
                break

            Object.assign(AI, new Types.GAAAreaInfo(obj2.AI))
        }
    }
    
    xtHandler.on("cat", obj => {
        const movementInfo = Types.ReturningAttack(obj)
        const sourceAttack = movementInfo.movement.movementData.sourceAttack
        if (kingdomID != movementInfo.movement.movementData.kingdomID ||
            type != sourceAttack.type)
            return

        if(options.useTimeSkips)
            skipTarget(sourceAttack)

        let index = movements.findIndex(e => e.x == sourceAttack.x && e.y == sourceAttack.y)
        if (index == -1)
            return

        movements.splice(index, 1)
    })
    const sourceCastleArea = (await getResourceCastleList()).castles.find(e => e.kingdomID == kingdomID)
        .areaInfo.find(e => [AreaType.externalKingdom, AreaType.mainCastle].includes(e.type));

    const sendHit = async () => {
        let comList = undefined
        if (![, 0, ""].includes(options.commanderWhiteList)) {
            comList = options.commanderWhiteList.split(",").map(e => {
                const [start, end] = e.split("-").map(parseInt)
                if (end == undefined)
                    end = start

                return Array.from({ length: end - start + 1 }, (_, i) => start + i)
            }).flat()
        }

        const commander = await waitForCommanderAvailable(comList)
        const hasShieldMadiens = !(((commander.EQ[3] ?? [])[5]?.every(([id, _]) => id == 121 ? false : true)) ?? true)
        try {
            const attackInfo = await waitToAttack(async () => {
                const sourceCastle = (await ClientCommands.getDetailedCastleList())
                    .castles.find(a => a.kingdomID == kingdomID)
                    .areaInfo.find(a => a.areaID == sourceCastleArea.extraData[0])
                const executionStartTime = Date.now() // Start timer for "human" interaction

                let index = -1
                const timeSinceEpoch = Date.now()
                for (let i = 0; i < sortedAreaInfo.length; i++) {
                    const areaInfo = sortedAreaInfo[i]
                    if (!options.useTimeSkips) {
                        if (movements.find(e => e.x == areaInfo.x && e.y == areaInfo.y))
                            continue

                        if (((areaInfo.timeSinceRequest + areaInfo.extraData[2] * 1000) - timeSinceEpoch) > 0)
                            continue
                    }
                    else {
                        try {
                            await skipTarget(areaInfo)
                        }
                        catch(e) {
                            console.warn(e)
                            continue
                        }
                    }

                    index = i
                    break
                }
                if (index == -1)
                    return

                const AI = sortedAreaInfo[index]
                const level = getLevel(AI.extraData[1], kingdomID)

                const attackerMeleeTroops = []
                const attackerRangeTroops = []

                for (let i = 0; i < sourceCastle.unitInventory.length; i++) {
                    const unit = sourceCastle.unitInventory[i]
                    const unitInfo = units.find(obj => unit.unitID == obj.wodID)
                    if (unitInfo == undefined)
                        continue

                    if (unitInfo.fightType == 0) {
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

                let doLeft = !!(options.attackLeft)
                let doRight = !!(options.attackRight)
                let doMiddle = !!(options.attackMiddle)
                let doCourtyard = !!(options.attackCourtyard)

                const commanderStats = getCommanderStats(commander)
                const attackInfo = getAttackInfo(kingdomID, sourceCastleArea, AI, commander, level, parseInt(options.attackWaves), options, commanderStats.additionalWaves)
                const maxTroopFront = getAmountSoldiersFront(level, commanderStats.attackUnitAmountFront)
                const maxTroopFlank = getAmountSoldiersFlank(level, commanderStats.attackUnitAmountFlank)

                if (!(doLeft || doRight || doMiddle)) {
                    doLeft = true
                    if (!doCourtyard)
                        doCourtyard = hasShieldMadiens ? false : true
                }

                attackInfo.A.forEach(wave => {
                    let maxTroops = maxTroopFlank

                    if (doLeft) {
                        wave.L.U.forEach(unitSlot =>
                            maxTroops -= assignUnit(unitSlot, attackerMeleeTroops.length <= 0 ?
                                attackerRangeTroops : attackerMeleeTroops, maxTroops))
                    }

                    if (doRight) {
                        maxTroops = maxTroopFlank
                        wave.R.U.forEach(unitSlot =>
                            maxTroops -= assignUnit(unitSlot, attackerMeleeTroops.length <= 0 ?
                                attackerRangeTroops : attackerMeleeTroops, maxTroops))
                    }

                    if (doMiddle) {
                        maxTroops = maxTroopFront
                        wave.M.U.forEach(unitSlot =>
                            maxTroops -= assignUnit(unitSlot, attackerMeleeTroops.length <= 0 ?
                                attackerRangeTroops : attackerMeleeTroops, maxTroops))
                    }
                })

                if (doCourtyard) {
                    let maxTroops = getMaxUnitsInReinforcementWave(playerInfo.level, level) + Number(0 | commanderStats.attackUnitAmountReinforcementBonus)
                    attackInfo.RW.forEach((unitSlot, i) => {
                        let attacker = i & 1 ?
                            (attackerMeleeTroops.length > 0 ? attackerMeleeTroops : attackerRangeTroops) :
                            (attackerRangeTroops.length > 0 ? attackerRangeTroops : attackerMeleeTroops)

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
                if (result == 0) {
                    if (!options.useTimeSkips)
                        movements.push(AI)
                }

                const executionDuration = ((Date.now() - executionStartTime) / 1000).toFixed(2);
                obj.executionDuration = executionDuration; // Pass it out

                return { ...obj, attackInfo, result, executionDuration }
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
                    await new Promise(resolve => movementEvents.on("return", function self(movementInfo) {
                        if (movementInfo.movement.movementData.kingdomID != kingdomID)
                            return
                        if (movementInfo.movement.movementData.targetAttack.extraData[0] != sourceCastleArea.extraData[0])
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
    /** @type {import("../../protocols.js").Types.ServerGetAreaInfo} */
    let gaa
    do {
        try {
            gaa = await getAreaCached(kingdomID,
                sourceCastleArea.x - 50, sourceCastleArea.y - 50,
                sourceCastleArea.x + 50, sourceCastleArea.y + 50)
            error = false
        } catch (e) {
            console.warn(e)
            error = true
        }
    } while (error);

    let areaInfo = gaa.areaInfo.filter(ai => ai.type == type).sort((a, b) => 
            (Math.pow(sourceCastleArea.x - a.x, 2) + Math.pow(sourceCastleArea.y - a.y, 2)) -
            (Math.pow(sourceCastleArea.x - b.x, 2) + Math.pow(sourceCastleArea.y - b.y, 2)))

    sortedAreaInfo.push(...areaInfo)

    while (true) {
        if (!options.useTimeSkips) {
            let minimumTimeTillHit = 5 * 1000 + Date.now()

            sortedAreaInfo.forEach(ai => {
                if (!movements.find(a => a.x == ai.x && a.y == ai.y))
                    minimumTimeTillHit = Math.min(minimumTimeTillHit, (ai.timeSinceRequest + ai.extraData[2] * 1000))
            })
            let time = (Math.max(0, minimumTimeTillHit - Date.now()))
            if (time > 0)
                console.info("waitingForNextPossibleHit", Math.round(time / 1000), "waitingForNextPossibleHit2")
            await new Promise(r => setTimeout(r, time).unref())
        }

        while (await sendHit());
    }
}

module.exports = barronHit