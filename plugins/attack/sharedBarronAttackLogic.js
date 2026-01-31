const { isMainThread } = require('node:worker_threads')
const name = "Fortress Hit"

if (isMainThread)
    return module.exports = {
        name: name,
        hidden: true
    }

const { getCommanderStats } = require("../../getEquipment")
const { Types, getResourceCastleList, ClientCommands, areaInfoLock, AreaType, spendSkip } = require('../../protocols')
const { waitToAttack, getAttackInfo, assignUnit, getAmountSoldiersFlank, getAmountSoldiersFront, getMaxUnitsInReinforcementWave, boxMullerRandom, sleep } = require("./attack.js")
const { movementEvents, waitForCommanderAvailable, freeCommander, useCommander } = require("../commander")
const { sendXT, waitForResult, xtHandler, botConfig, playerInfo } = require("../../ggebot")
const getAreaCached = require('../../getmap.js')
const err = require("../../err.json")

const units = require("../../items/units.json")
const pretty = require('pretty-time')

const minTroopCount = 100

const troopBlackList = [277]//, 34, 35]

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
async function barronHit(name, type, kid, options) {
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
    let pluginOptions = {}
    Object.assign(pluginOptions, botConfig.plugins["attack"] ?? {})
    Object.assign(pluginOptions, options ?? {})
    
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
    let skipTarget = async (AI) => {
        while (AI.extraData[2] > 0) {
            let skip = spendSkip(AI.extraData[2])

            if (skip == undefined)
                throw new Error("Couldn't find skip")

            sendXT("msd", JSON.stringify({ X: AI.x, Y: AI.y, MID: -1, NID: -1, MST: skip, KID: `${kid}` }))
            let [obj2, result2] = await waitForResult("msd", 7000, (obj, result) => {
                if (result != 0)
                    return true

                if (obj.AI[0] != AI.type ||
                    obj.AI[6] != kid ||
                    obj.AI[1] != AI.x ||
                    obj.AI[2] != AI.y)
                    return false
                return true
            })

            if (Number(result2) != 0)
                break

            Object.assign(AI, Types.GAAAreaInfo(obj2.AI))
        }
    }
    movementEvents.on("return", movementInfo => {
        const sourceAttack = movementInfo.movement.movement.sourceAttack
        if(kid != movementInfo.movement.movement.kingdomID ||
           type != sourceAttack.type)
           return

        let index = movements.findIndex(e => e.x == sourceAttack.x && e.y == sourceAttack.y)
        if(index == -1)
            return

        movements.splice(index, 1)
        skipTarget(sourceAttack)
    })
    const sourceCastleArea = (await getResourceCastleList()).castles.find(e => e.kingdomID == kid)
        .areaInfo.find(e => [AreaType.externalKingdom, AreaType.mainCastle].includes(e.type));

    const sendHit = async () => {
        let comList = undefined
        if (![, 0, ""].includes(pluginOptions.commanderWhiteList)) {
            const [start, end] = pluginOptions.commanderWhiteList.split("-").map(Number).map(a => a - 1)
            comList = Array.from({ length: end - start + 1 }, (_, i) => start + i)
        }

        const commander = await waitForCommanderAvailable(comList)
        const hasShieldMadiens = !(((commander.EQ[3] ?? [])[5]?.every(([id, _]) => id == 121 ? false : true)) ?? true)
        try {
            const attackSentInfo = await waitToAttack(async () => {
                const executionStartTime = Date.now() // Start timer for "human" interaction

                const sourceCastle = (await ClientCommands.getDetailedCastleList()())
                    .castles.find(a => a.kingdomID == kid)
                    .areaInfo.find(a => a.areaID == sourceCastleArea.extraData[0])
                let index = -1
                const timeSinceEpoch = Date.now()
                for (let i = 0; i < sortedAreaInfo.length; i++) {
                    const areaInfo = sortedAreaInfo[i]
                    
                    if(movements.find(e => e.x == areaInfo.x && e.y == areaInfo.y))
                        continue

                    let time = towerTime.get(areaInfo) - timeSinceEpoch
                    if (!options.useTimeSkips && time > 0)
                        continue

                    Object.assign(areaInfo, (await ClientCommands.getAreaInfo(kid, areaInfo.x, areaInfo.y, areaInfo.x, areaInfo.y)()).areaInfo[0])
                    towerTime.set(areaInfo, timeSinceEpoch + areaInfo.extraData[2] * 1000)

                    if (!options.useTimeSkips && areaInfo.extraData[2] > 0)
                        continue

                    index = i
                    break
                }
                if (index == -1)
                    return

                let AI = sortedAreaInfo.splice(index, 1)[0]
                
                // Simulating: Clicking on target (Reaction time ~300ms-600ms)
                // await sleep(boxMullerRandom(300, 600, 1)) 

                await skipTarget(AI)

                // Simulating: Opening Attack Dialog (Animation wait ~400ms-800ms)
                // await sleep(boxMullerRandom(400, 800, 1))

                const level = getLevel(AI.extraData[1], kid)

                const attackInfo = getAttackInfo(kid, sourceCastleArea, AI, commander, level, undefined, pluginOptions)

                const attackerMeleeTroops = []
                const attackerRangeTroops = []

                for (let i = 0; i < sourceCastle.unitInventory.length; i++) {
                    const unit = sourceCastle.unitInventory[i]
                    const unitInfo = units.find(obj => unit.unitID == obj.wodID)
                    if (unitInfo == undefined)
                        continue

                    if (unitInfo.fightType == 0) {
                        if(troopBlackList.includes(unitInfo.wodID))
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
                
                // Simulating: Selecting Units and filling waves (Cognitive processing ~100ms per wave/calculation)
                // await sleep(boxMullerRandom(200, 400, 1))

                // Get user options, defaulting to full attack if not set
                let maxWaves = parseInt(pluginOptions.attackWaves)
                if(maxWaves == undefined || isNaN(maxWaves) || maxWaves == 0)
                    maxWaves = Infinity
                
                let doLeft = !!(pluginOptions.attackLeft)
                let doRight = !!(pluginOptions.attackRight)
                let doMiddle = !!(pluginOptions.attackMiddle)
                let doCourtyard = !!(pluginOptions.attackCourtyard)

                const commanderStats = getCommanderStats(commander)
                const maxTroopFront = Math.floor(getAmountSoldiersFront(level) * (1 + (commanderStats.relicAttackUnitAmountFront ?? 0) / 100)) - 1
                const maxTroopFlank = Math.floor(getAmountSoldiersFlank(level) * (1 + (commanderStats.relicAttackUnitAmountFlank ?? 0) / 100)) - 1

                if(!(doLeft || doRight || doMiddle)) {
                    doLeft = true
                    if(!doCourtyard)
                        doCourtyard = hasShieldMadiens ? false : true
                }

                attackInfo.A.forEach((wave, waveIndex) => {
                    if (waveIndex >= maxWaves) return;

                    let maxTroops = maxTroopFlank

                    if (doLeft) {
                        wave.L.U.forEach((unitSlot, i) =>
                            maxTroops -= assignUnit(unitSlot, attackerMeleeTroops.length <= 0 ?
                                attackerRangeTroops : attackerMeleeTroops, maxTroops))
                    }

                    if (doRight) {
                        maxTroops = maxTroopFlank
                        wave.R.U.forEach((unitSlot, i) =>
                            maxTroops -= assignUnit(unitSlot, attackerMeleeTroops.length <= 0 ?
                                attackerRangeTroops : attackerMeleeTroops, maxTroops))
                    }

                    if (doMiddle) {
                        maxTroops = maxTroopFront
                        wave.M.U.forEach((unitSlot, i) =>
                            maxTroops -= assignUnit(unitSlot, attackerMeleeTroops.length <= 0 ?
                                attackerRangeTroops : attackerMeleeTroops, maxTroops))
                    }
                })


                if (doCourtyard) {
                    let maxTroops = getMaxUnitsInReinforcementWave(playerInfo.level, level)
                    attackInfo.RW.forEach((unitSlot, i) => {
                        let attacker = i & 1 ?
                            (attackerMeleeTroops.length > 0 ? attackerMeleeTroops : attackerRangeTroops) :
                            (attackerRangeTroops.length > 0 ? attackerRangeTroops : attackerMeleeTroops)

                        maxTroops -= assignUnit(unitSlot, attacker,
                            Math.floor(maxTroops / 2) - 1)
                    })
                }

                // Final hesitation before clicking "Attack" (Human verification/hesitation ~150ms-400ms)
                // await sleep(boxMullerRandom(150, 400, 1))

                //await areaInfoLock(() => 
                    sendXT("cra", JSON.stringify(attackInfo))
                //)

                let [obj, r] = await waitForResult("cra", 1000 * 10, (obj, result) => {
                    if (result != 0)
                        return true

                    if (obj.AAM.M.KID != kid || obj.AAM.M.TA[1] != AI.x || obj.AAM.M.TA[2] != AI.y)
                        return false
                    return true
                })
                
                const executionDuration = ((Date.now() - executionStartTime) / 1000).toFixed(2);
                obj.executionDuration = executionDuration; // Pass it out

                return { ...obj, attackInfo, result: r, executionDuration }
            })
            
            if (!attackSentInfo) {
                freeCommander(commander.lordID)
                return false
            }
            if(attackSentInfo.result != 0) {
                console.debug(`${JSON.stringify(attackSentInfo)}`)
                throw err[attackSentInfo.result]
            }
            
            console.info(`Hitting target C${attackSentInfo.AAM.UM.L.VIS + 1} ${attackSentInfo.AAM.M.TA[1]}:${attackSentInfo.AAM.M.TA[2]} ${pretty(Math.round(1000000000 * Math.abs(Math.max(0, attackSentInfo.AAM.M.TT - attackSentInfo.AAM.M.PT))), 's') + " till impact"}`)
            console.debug(`(Setup: ${attackSentInfo.executionDuration}s)`)
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
                    return true
                case "ATTACK_TOO_MANY_UNITS":
                    console.warn(`Math error (Too Many Units). Skipping this target to prevent crash.`)
                    return true
                case "CANT_START_NEW_ARMIES":
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

        let areaInfo = gaa.areaInfo.filter(ai => ai.type == type).sort((a, b) => {
            let d1 = Math.sqrt(Math.pow(sourceCastleArea.x - a.x, 2) + Math.pow(sourceCastleArea.y - a.y, 2))
            let d2 = Math.sqrt(Math.pow(sourceCastleArea.x - b.x, 2) + Math.pow(sourceCastleArea.y - b.y, 2))
            if (d1 < d2)
                return -1
            if (d1 > d2)
                return 1
        })
        const timeSinceEpoch = Date.now()
        areaInfo.forEach(ai =>
            towerTime.set(ai, timeSinceEpoch + ai.extraData[2] * 1000))

        sortedAreaInfo = sortedAreaInfo.concat(areaInfo)
        
        while (await sendHit());
    }

    while (true) {
        let minimumTimeTillHit = Infinity
        
        sortedAreaInfo.forEach(e => {
            if(!movements.find(a => a.x == e.x && a.y == e.y))
                minimumTimeTillHit = Math.min(minimumTimeTillHit, towerTime.get(e))
        })
        let time = (Math.max(0, minimumTimeTillHit - Date.now()))
        console.info(`Waiting ${Math.round(time / 1000)} for next hit`)
        await new Promise(r => setTimeout(r, time).unref())
        
        while (await sendHit());
    }
}

module.exports = barronHit