const { isMainThread } = require('node:worker_threads')
const name = "Fortress Hit"

if (isMainThread)
    return module.exports = {
        name: name,
        hidden: true
    };

const { Types, getResourceCastleList, ClientCommands, areaInfoLock, AreaType, KingdomID } = require('../../protocols')
const { waitToAttack, getAttackInfo, assignUnit, getAmountSoldiersFlank } = require("./attack")
const { movementEvents, waitForCommanderAvailable, freeCommander, useCommander } = require("../commander")
const { sendXT, waitForResult, xtHandler, botConfig } = require("../../ggebot")
const getAreaCached = require('../../getmap.js')
const err = require('../../err.json')
const units = require("../../items/units.json")
const pretty = require('pretty-time')
const { getCommanderStats } = require('../../getEquipment.js')

const minTroopCount = 100

function spiralCoordinates(n) {
    if (n === 0) return { x: 0, y: 0 };

    const k = Math.ceil((Math.sqrt(n + 1) - 1) / 2);
    const layerStart = (2 * (k - 1) + 1) ** 2;
    const offset = n - layerStart;
    const sideLength = 2 * k;
    const side = Math.floor(offset / sideLength);
    const posInSide = offset % sideLength;

    let x, y;

    switch (side) {
        case 0:
            x = k;
            y = -k + 1 + posInSide;
            break;
        case 1:
            x = k - 1 - posInSide;
            y = k;
            break;
        case 2:
            x = -k;
            y = k - 1 - posInSide;
            break;
        case 3:
            x = -k + 1 + posInSide;
            y = -k;
            break;
    }

    return { x, y };
}
async function fortressHit(name, kid, type, level, options) {
    let pluginOptions = {}
    Object.assign(pluginOptions, options ?? {})
    Object.assign(pluginOptions, botConfig.plugins["attack"] ?? {})
    
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
        .areaInfo.find(e => AreaType.externalKingdom == e.type);

    const sendHit = async () => {
        let comList = undefined
        if (![, 0, ""].includes(pluginOptions.commanderWhiteList)) {
            const [start, end] = pluginOptions.commanderWhiteList.split("-").map(Number).map(a => a - 1);
            comList = Array.from({ length: end - start + 1 }, (_, i) => start + i);
        }

        const commander = await waitForCommanderAvailable(comList, 
            (a, b) =>
                (b.EQ[3] ?? [])[5]?.every(([id, _]) => id == 121 ? true : false) ?? false - 
                (a.EQ[3] ?? [])[5]?.every(([id, _]) => id == 121 ? true : false) ?? false,
            (a, b) => getCommanderStats(b).relicSpeedBonus - getCommanderStats(a).relicSpeedBonus)
        console.debug(`Chose ${getCommanderStats(commander).relicSpeedBonus}`)
        try {
            const attackInfo = await waitToAttack(async () => {
                const sourceCastle = (await ClientCommands.getDetailedCastleList()())
                    .castles.find(a => a.kingdomID == kid)
                    .areaInfo.find(a => a.areaID == sourceCastleArea.extraData[0])
                let index = -1
                const timeSinceEpoch = new Date().getTime()
                for (let i = 0; i < sortedAreaInfo.length; i++) {
                    const oldAreaInfo = sortedAreaInfo[i];
                    
                    if(movements.find(e => e.x == oldAreaInfo.x && e.y == oldAreaInfo.y))
                        continue

                    let time = towerTime.get(oldAreaInfo) - timeSinceEpoch
                    if (time > 0)
                        continue

                    const areaInfo = (await ClientCommands.getAreaInfo(kid, oldAreaInfo.x, oldAreaInfo.y, oldAreaInfo.x, oldAreaInfo.y)()).areaInfo[0]

                    Object.assign(oldAreaInfo, areaInfo)
                    towerTime.set(oldAreaInfo, timeSinceEpoch + oldAreaInfo.extraData[2] * 1000)

                    if (towerTime.get(oldAreaInfo) - new Date().getTime() > 0)
                        continue

                    index = i
                    break
                }
                if (index == -1)
                    return

                let AI = sortedAreaInfo.splice(index, 1)[0]

                const attackInfo = getAttackInfo(kid, sourceCastleArea, AI, commander, level)

                if (pluginOptions.useCoin)
                    attackInfo.HBW = 1007

                const attackerMeleeTroops = []
                const attackerRangeTroops = []

                for (let i = 0; i < sourceCastle.unitInventory.length; i++) {
                    const unit = sourceCastle.unitInventory[i];
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

                attackInfo.A.forEach(wave => {
                    const maxTroopFlank = getAmountSoldiersFlank(level)

                    let maxTroops = maxTroopFlank

                    wave.L.U.forEach((unitSlot, i) =>
                        maxTroops -= assignUnit(unitSlot, attackerMeleeTroops.length <= 0 ?
                            attackerRangeTroops : attackerMeleeTroops, maxTroops))
                });

                await areaInfoLock(() => sendXT("cra", JSON.stringify(attackInfo)))

                let [obj, r] =await waitForResult("cra", 6000, (obj, result) => {
                    if (result != 0)
                        return true

                    if (obj.AAM.M.KID != kid || obj.AAM.M.TA[1] != AI.x || obj.AAM.M.TA[2] != AI.y)
                        return false
                    return true
                })
                return {...obj, result: r}
            })
            if (!attackInfo) {
                freeCommander(commander)
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
                    await new Promise(resolve => movementEvents.on("return", function self(obj) {
                        const movementInfo = Types.ReturningAttack(obj)

                        if (movementInfo.movement.movement.kingdomID != kid)
                            return
                        if (movementInfo.movement.movement.targetAttack.extraData[0] != AID)
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

        let areaInfo = gaa.areaInfo.filter(ai => ai.type == type).sort((a, b) => {
            let d1 = Math.sqrt(Math.pow(sourceCastleArea.x - a.x, 2) + Math.pow(sourceCastleArea.y - a.y, 2))
            let d2 = Math.sqrt(Math.pow(sourceCastleArea.x - b.x, 2) + Math.pow(sourceCastleArea.y - b.y, 2))
            if (d1 < d2)
                return -1
            if (d1 > d2)
                return 1
        })
        const timeSinceEpoch = new Date().getTime()
        areaInfo.forEach(ai =>
            towerTime.set(ai, timeSinceEpoch + ai.extraData[2] * 1000))

        sortedAreaInfo = sortedAreaInfo.concat(areaInfo)
        
        while (await sendHit());
    }

    while (true) {
        let minimumTimeTillHit = Infinity
        sortedAreaInfo.forEach(e => 
            minimumTimeTillHit = Math.min(minimumTimeTillHit, towerTime.get(e)))
        let time = (Math.max(0, minimumTimeTillHit - new Date().getTime()))
        console.info(`[${name}] Waiting ${Math.round(time / 1000)} for next fortress hit`)
        await new Promise(r => setTimeout(r, time).unref());
        
        while (await sendHit());
    }
}

module.exports = fortressHit