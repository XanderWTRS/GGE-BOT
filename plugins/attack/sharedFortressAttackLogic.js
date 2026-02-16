if (require('node:worker_threads').isMainThread)
    return module.exports = {
        hidden: true
    }

const { Types, getResourceCastleList, ClientCommands, AreaType, KingdomID } = require('../../protocols')
const { waitToAttack, getAttackInfo, assignUnit, getAmountSoldiersFlank, getMaxUnitsInReinforcementWave } = require("./attack")
const { movementEvents, waitForCommanderAvailable, freeCommander, useCommander } = require("../commander")
const { sendXT, waitForResult, xtHandler, botConfig, playerInfo } = require("../../ggeBot.js")
const err = require('../../err.json')
const units = require("../../items/units.json")
const pretty = require('pretty-time')
const { getCommanderStats } = require('../../getEquipment.js')

const minTroopCount = 100
const minTroopCountCY = 500
const type = AreaType.fortress

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
async function fortressHit(kid, level, options) {
    options.useCoin = true
    options.useFeather = true
    
    let towerTime = new WeakMap()
    const areas = []
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

        let index = movements.findIndex(e => e.x == sourceAttack.x && e.y == sourceAttack.y)
        if(index == -1)
            return
        movements.splice(index, 1)
    })
    const sourceCastleArea = (await getResourceCastleList()).castles.find(e => e.kingdomID == kid)
        .areaInfo.find(e => AreaType.externalKingdom == e.type);

    const sendHit = async () => {
        let comList = undefined
        if (![, 0, ""].includes(options.commanderWhiteList)) {
            const [start, end] = options.commanderWhiteList.split("-").map(Number).map(a => a - 1)
            comList = Array.from({ length: end - start + 1 }, (_, i) => start + i)
        }

        const commander = await waitForCommanderAvailable(comList,
            undefined,
            (a, b) => getCommanderStats(b).relicSpeedBonus - getCommanderStats(a).relicSpeedBonus)

        const hasShieldMadiens = !(((commander.EQ[3] ?? [])[5]?.every(([id, _]) => id == 121 ? false : true)) ?? true)
        try {
            const attackInfo = await waitToAttack(async () => {
                let index = -1
                const timeSinceEpoch = Date.now()
                for (let i = 0; i < areas.length; i++) {
                    const areaInfo = areas[i]
                    
                    if(movements.find(e => e.x == areaInfo.x && e.y == areaInfo.y))
                        continue

                    let time = towerTime.get(areaInfo) - timeSinceEpoch
                    if (time > 0)
                        continue

                    // if (areaInfo.extraData[2] != 0) {
                        sendXT("ssi", JSON.stringify({ TX: areaInfo.x, TY: areaInfo.y, KID: kid }))
                        Object.assign(areaInfo, Types.GAAAreaInfo((await waitForResult("ssi", 1000 * 10, obj => obj.gaa.KID == kid && obj.gaa.AI[0][0] == type))[0].gaa.AI[0]))
                        towerTime.set(areaInfo, timeSinceEpoch + areaInfo.extraData[2] * 1000)

                        if (areaInfo.extraData[2] > 0)
                            continue
                    // }

                    index = i
                    break
                }
                if (index == -1)
                    return

                const sourceCastle = (await ClientCommands.getDetailedCastleList())
                    .castles.find(a => a.kingdomID == kid)
                    .areaInfo.find(a => a.areaID == sourceCastleArea.extraData[0])

                let AI = areas[index]

                const attackInfo = getAttackInfo(kid, sourceCastleArea, AI, commander, level, undefined, options)

                const attackerTroops = []

                for (let i = 0; i < sourceCastle.unitInventory.length; i++) {
                    const unit = sourceCastle.unitInventory[i]
                    const unitInfo = units.find(obj => unit.unitID == obj.wodID)
                    if (unitInfo == undefined)
                        continue

                    if (unitInfo.fightType == 0) {
                        if(kid == KingdomID.firePeaks && 
                            unitInfo.wodID == 277 && !hasShieldMadiens)
                            continue
                        
                        if(!unitInfo.role)
                            continue

                        attackerTroops.push([unitInfo, unit.ammount])
                    }
                }

                attackerTroops.sort((a, b) => Number(b[0].speed) - Number(a[0].speed))

                let allTroopCount = 0

                attackerTroops.forEach(e => allTroopCount += e[1])

                if (allTroopCount < minTroopCount + (hasShieldMadiens ? 0 : minTroopCountCY))
                    throw "NO_MORE_TROOPS"

                attackInfo.A.forEach((wave, i) => {
                    if(i > 2 && kid != KingdomID.firePeaks)
                        return
                    if(i > 4 && kid == KingdomID.firePeaks)
                        return
                    
                    const maxTroopFlank = getAmountSoldiersFlank(level)

                    let maxTroops = maxTroopFlank

                    wave.L.U.forEach((unitSlot, i) =>
                        maxTroops -= assignUnit(unitSlot, attackerTroops, maxTroops))
                })

                if (!hasShieldMadiens) {
                    let maxTroops = getMaxUnitsInReinforcementWave(playerInfo.level, level)
                    attackInfo.RW.forEach((unitSlot, i) =>
                        maxTroops -= assignUnit(unitSlot, attackerTroops, maxTroops))
                }

                sendXT("cra", JSON.stringify(attackInfo))
                
                let [obj, r] = await waitForResult("cra", 1000 * 10, (obj, result) => {
                    if (result != 0)
                        return true

                    if (obj.AAM.M.KID != kid || obj.AAM.M.TA[1] != AI.x || obj.AAM.M.TA[2] != AI.y)
                        return false
                    return true
                })
                
                if(r == 0) {
                    movements.push(AI)
                }
                return {...obj, result: r}
            })
            if (!attackInfo) {
                freeCommander(commander.lordID)
                return false
            }
            if(attackInfo.result != 0) 
                throw err[attackInfo.result]
            
            console.info("hittingTargetAttack", KingdomID[kid], ' ', 'C', attackInfo.AAM.UM.L.VIS + 1, ' ', attackInfo.AAM.M.TA[1], ':', attackInfo.AAM.M.TA[2], " ", pretty(Math.round(1000000000 * Math.abs(Math.max(0, attackInfo.AAM.M.TT - attackInfo.AAM.M.PT))), 's'), "tillImpactAttack")
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
    
    // sendXT("fnm", JSON.stringify({T:type,KID:kid,LMIN:-1,LMAX:-1,NID:-1}))
    // let AI = Types.GAAAreaInfo((await waitForResult("fnm", 1000 * 10, obj => {
    //     return obj.gaa.KID == kid && obj.gaa.AI[0][0] == 11
    // }))[0].gaa.AI[0])
    const getFirstFortress = async () => {
        let error = false
        let gaa
        do {
            try {
                gaa = await ClientCommands.getAreaInfo(kid,
                    (1300 / 2) - 50, (1300 / 2) - 50,
                    (1300 / 2) + 50, (1300 / 2) + 50)()
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
    const AI = await getFirstFortress()
    areas.push(AI)

    const timeSinceEpoch = Date.now()
    towerTime.set(AI, timeSinceEpoch + AI.extraData[2] * 1000)
    
    const startingX = AI.x
    const startingY = AI.y

    for (let j = 1;; j++) {
        let { x: rX, y: rY } = spiralCoordinates(j)
        let x = startingX + rX * 39
        let y = startingY + rY * 39        

        let error = false
        do {
            try {
                sendXT("ssi", JSON.stringify({ TX: x, TY: y, KID: kid }))
                var [obj, result] = await waitForResult("ssi", 1000 * 10, (obj, r) => {
                    return r != 0 || obj.gaa.KID == kid && obj.gaa.AI[0][0] == 11
                })
                error = false
            } catch (e) {
                console.warn(e)
                error = true
            }
        } while (error);

        if(result != 0)
            break

        let AI = Types.GAAAreaInfo(obj.gaa.AI[0])
        areas.push(AI)
        const timeSinceEpoch = Date.now()

        towerTime.set(AI, timeSinceEpoch + AI.extraData[2] * 1000)
        
        while (await sendHit());
    }
    
    while (true) {
        let minimumTimeTillHit = Infinity
        areas.forEach(e => {
            if(!movements.find(a => a.x == e.x && a.y == e.y))
                minimumTimeTillHit = Math.min(minimumTimeTillHit, towerTime.get(e))
        })
        let time = (Math.max(0, minimumTimeTillHit - Date.now()))
        console.info("waitingForNextPossibleHit", Math.round(time / 1000), "waitingForNextPossibleHit2")
        await new Promise(r => setTimeout(r, time).unref())
        
        while (await sendHit());
    }
}

module.exports = fortressHit