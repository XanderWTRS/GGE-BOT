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
            { type: "Checkbox", label: "Attack Level 40", key: "allowLvl40", default: false },
            { type: "Checkbox", label: "Attack Level 50", key: "allowLvl50", default: false },
            { type: "Checkbox", label: "Attack Level 60", key: "allowLvl60", default: false },
            { type: "Checkbox", label: "Attack Level 70", key: "allowLvl70", default: true },
            { type: "Checkbox", label: "Attack Level 80", key: "allowLvl80", default: true },
            { type: "Text", label: "Minutes per Hit", key: "minutesPerHit", default: "5" },
            { type: "Text", label: "Travel Time per Field", key: "travelSpeedFactor", default: "0.33" },
            { type: "Checkbox", label: "Use Coin", key: "useCoin", default: false },
            { type: "Checkbox", label: "Buy Coins", key: "buycoins", default: false },
            { type: "Checkbox", label: "Buy Deco", key: "buydeco", default: false },
            { type: "Checkbox", label: "Buy XP", key: "buyxp", default: false }
        ]
    }

const { getCommanderStats } = require("../../getEquipment")
const { Types, getResourceCastleList, ClientCommands, areaInfoLock, AreaType, KingdomID } = require('../../protocols')
const { waitToAttack, getAttackInfo, assignUnit, getAmountSoldiersFlank } = require("./attack")
const { movementEvents, waitForCommanderAvailable, freeCommander, useCommander } = require("../commander")
const { sendXT, waitForResult, xtHandler, botConfig, events } = require("../../ggebot")
const getAreaCached = require('../../getmap.js')
const err = require("../../err.json")
const units = require("../../items/units.json")
const pretty = require('pretty-time')

const minTroopCount = 100

// --- SESSION STATS ---
let sessionAquaFarmed = 0;
let lastAquaAmount = -1;

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
        case 0: x = k; y = -k + 1 + posInSide; break
        case 1: x = k - 1 - posInSide; y = k; break
        case 2: x = -k; y = k - 1 - posInSide; break
        case 3: x = -k + 1 + posInSide; y = -k; break
    }
    return { x, y }
}

const pluginOptions = botConfig.plugins[require('path').basename(__filename).slice(0, -3)] ?? {}
const kid = KingdomID.stormIslands
const type = AreaType.stormTower

events.once("load", async () => {
    let allowedLevels = [];
    if (pluginOptions["allowLvl40"]) allowedLevels.push(10);
    if (pluginOptions["allowLvl50"]) allowedLevels.push(11);
    if (pluginOptions["allowLvl60"]) allowedLevels.push(7, 12);
    if (pluginOptions["allowLvl70"]) allowedLevels.push(8, 13);
    if (pluginOptions["allowLvl80"]) allowedLevels.push(9, 14);
    if (allowedLevels.length === 0) allowedLevels = [8, 9, 13, 14];

    const sourceCastleArea = (await getResourceCastleList()).castles.find(e => e.kingdomID == kid)
        .areaInfo.find(e => e.type == AreaType.externalKingdom);
        
    xtHandler.on("dcl", obj => {
        const castleProd = Types.DetailedCastleList(obj)
            .castles.find(a => a.kingdomID == kid)
            .areaInfo.find(a => a.areaID == sourceCastleArea.extraData[0])
        if (!castleProd) return;

        if (lastAquaAmount !== -1 && castleProd.aqua > lastAquaAmount) {
            sessionAquaFarmed += (castleProd.aqua - lastAquaAmount);
        }
        lastAquaAmount = castleProd.aqua;

        if (pluginOptions["buycoins"] && castleProd.aqua >= 500000) {
            castleProd.aqua -= 500000;
            sendXT("sbp", JSON.stringify({ "PID": 2798, "BT": 3, "TID": -1, "AMT": 1, "KID": 4, "AID": -1, "PC2": -1, "BA": 0, "PWR": 0, "_PO": -1 }))
        }
        if (pluginOptions["buydeco"] && castleProd.aqua >= 100000) {
            castleProd.aqua -= 100000;
            sendXT("sbp", JSON.stringify({ "PID": 3113, "BT": 3, "TID": -1, "AMT": 1, "KID": 4, "AID": -1, "PC2": -1, "BA": 0, "PWR": 0, "_PO": -1 }))
        }
    })

    let towerTime = new WeakMap()
    let sortedAreaInfo = []
    const movements = []

    xtHandler.on("gam", obj => {
        const movementsGAA = Types.GetAllMovements(obj)
        movementsGAA?.movements.forEach(movement => {
            if(kid != movement.movement.kingdomID) return
            const targetAttack = movement.movement.targetAttack
            if(type != targetAttack.type) return
            if(!movements.find(e => e.x == targetAttack.x && e.y == targetAttack.y)) movements.push(targetAttack)
        })
    })

    const sendHit = async () => {
        let comList = undefined
        if (![, ""].includes(pluginOptions.commanderWhiteList)) {
            const [start, end] = pluginOptions.commanderWhiteList.split("-").map(Number).map(a => a - 1);
            comList = Array.from({ length: end - start + 1 }, (_, i) => start + i)
        }

        const commander = await waitForCommanderAvailable(comList, undefined, 
            (a, b) => getCommanderStats(b).relicLootBonus - getCommanderStats(a).relicLootBonus)

        try {
            const attackResult = await waitToAttack(async () => {
                const sourceCastle = (await ClientCommands.getDetailedCastleList()())
                    .castles.find(a => a.kingdomID == kid)
                    .areaInfo.find(a => a.areaID == sourceCastleArea.extraData[0])
                
                let index = -1
                const timeSinceEpoch = Date.now()

                for (let i = 0; i < sortedAreaInfo.length; i++) {
                    const areaInfo = sortedAreaInfo[i]
                    if(movements.find(e => e.x == areaInfo.x && e.y == areaInfo.y)) continue

                    let cooldown = towerTime.get(areaInfo) - timeSinceEpoch
                    if (cooldown > 0) continue

                    Object.assign(areaInfo, (await ClientCommands.getAreaInfo(kid, areaInfo.x, areaInfo.y, areaInfo.x, areaInfo.y)()).areaInfo[0])
                    if(!allowedLevels.includes(areaInfo.extraData[2])) continue

                    // --- REISEZEIT-PRÜFUNG ÜBER UI-WERTE ---
                    const dist = Math.sqrt(Math.pow(sourceCastleArea.x - areaInfo.x, 2) + Math.pow(sourceCastleArea.y - areaInfo.y, 2));
                    
                    const speedFactor = Number(pluginOptions["travelSpeedFactor"] || 0.33);
                    const minsPerHit = Number(pluginOptions["minutesPerHit"] || 5);
                    
                    const estTravelMin = dist * speedFactor;
                    const hitsLeft = areaInfo.extraData[4]; 
                    const maxAllowedMin = hitsLeft * minsPerHit; 

                    console.info(`[${name}] Tower ${areaInfo.x}:${areaInfo.y} | Dist: ${Math.round(dist)} | Hits: ${hitsLeft} | Est. Travel: ${Math.round(estTravelMin)}m`);

                    if (estTravelMin > maxAllowedMin) {
                        console.info(`[${name}] Skip: Too far (${Math.round(estTravelMin)}m > Limit ${Math.round(maxAllowedMin)}m)`);
                        continue; 
                    }

                    towerTime.set(areaInfo, timeSinceEpoch + areaInfo.extraData[5] * 1000)
                    if(areaInfo.extraData[3] > 0) continue

                    index = i
                    break
                }

                if (index == -1) return

                let AI = sortedAreaInfo.splice(index, 1)[0]
                const level = { 10: 40, 11: 50, 7: 60, 12: 60, 8: 70, 13: 70, 9: 80, 14: 80 }[AI.extraData[2]];
                const attackInfo = getAttackInfo(kid, sourceCastleArea, AI, commander, level, undefined, pluginOptions.useCoin)

                attackInfo.LP = 3 
                const attackerMeleeTroops = []
                const attackerRangeTroops = []

                for (let i = 0; i < sourceCastle.unitInventory.length; i++) {
                    const unit = sourceCastle.unitInventory[i]
                    const unitInfo = units.find(obj => unit.unitID == obj.wodID)
                    if (unitInfo && unitInfo.fightType == 0) {
                        if (unitInfo.role == "melee") attackerMeleeTroops.push([unitInfo, unit.ammount])
                        else if (unitInfo.role == "ranged") attackerRangeTroops.push([unitInfo, unit.ammount])
                    }
                }

                if ((attackerRangeTroops.reduce((a, b) => a + b[1], 0) + attackerMeleeTroops.reduce((a, b) => a + b[1], 0)) < minTroopCount)
                    throw "NO_MORE_TROOPS";

                attackInfo.A.forEach((wave, i) => {
                    if(i > 4) return
                    const commanderStats = getCommanderStats(commander)
                    const maxTroopFlank = Math.floor(getAmountSoldiersFlank(level) * (1 + (commanderStats.relicAttackUnitAmountFlank ?? 0) / 100)) - 1
                    let maxTroops = maxTroopFlank
                    wave.L.U.forEach((unitSlot) => maxTroops -= assignUnit(unitSlot, attackerMeleeTroops.length <= 0 ? attackerRangeTroops : attackerMeleeTroops, maxTroops))
                    maxTroops = maxTroopFlank
                    wave.R.U.forEach((unitSlot) => maxTroops -= assignUnit(unitSlot, attackerMeleeTroops.length <= 0 ? attackerRangeTroops : attackerMeleeTroops, maxTroops))
                })

                await areaInfoLock(() => sendXT("cra", JSON.stringify(attackInfo)))
                let [obj, r] = await waitForResult("cra", 1000 * 10, (obj, result) => {
                    return result != 0 || (obj?.AAM?.M?.KID == kid)
                })
                return {...obj, result: r}
            })
            
            if (!attackResult) { freeCommander(commander.lordID); return false; }
            if(attackResult.result != 0) throw err[attackResult.result]

            console.info(`[${name}] Attack launched! Session Aqua total: +${sessionAquaFarmed}`);
            return true
        } catch (e) {
            freeCommander(commander.lordID)
            console.error(`[${name}] Error: ${e.message || e}`);
            return false;
        }
    }

    done:
    for (let i = 0, j = 0; i < 13 * 13; i++) {
        let rX, rY, rect
        do {
            ({ x: rX, y: rY } = spiralCoordinates(j++))
            rX *= 100; rY *= 100
            rect = { x: sourceCastleArea.x + rX - 50, y: sourceCastleArea.y + rY - 50, w: sourceCastleArea.x + rX + 50, h: sourceCastleArea.y + rY + 50 }
            if (j > Math.pow(13 * 13, 2)) break done
        } while ((sourceCastleArea.x + rX) <= -50 || (sourceCastleArea.y + rY) <= -50 || (sourceCastleArea.x + rX) >= (1286 + 50) || (sourceCastleArea.y + rY) >= (1286 + 50))
        
        rect.x = Math.max(0, Math.min(1286, rect.x)); rect.y = Math.max(0, Math.min(1286, rect.y))
        rect.w = Math.max(0, Math.min(1286, rect.w)); rect.h = Math.max(0, Math.min(1286, rect.h))
        
        let gaa = await getAreaCached(kid, rect.x, rect.y, rect.w, rect.h)
        let areaInfo = gaa.areaInfo.filter(ai => ai.type == type)
        const timeSinceEpoch = Date.now()
        areaInfo.forEach(ai => towerTime.set(ai, timeSinceEpoch + ai.extraData[5] * 1000))
        sortedAreaInfo = sortedAreaInfo.concat(areaInfo)
        
        sortedAreaInfo.sort((a, b) => {
            if ((a.extraData[2] % 10) > (b.extraData[2] % 10)) return -1
            if ((a.extraData[2] % 10) < (b.extraData[2] % 10)) return 1
            return a.extraData[4] - b.extraData[4] 
        })
        while (await sendHit());
    }

    while (true) {
        let minimumTimeTillHit = Infinity
        for (let i = 0; i < sortedAreaInfo.length; i++) {
            const areaInfo = sortedAreaInfo[i]
            if (!allowedLevels.includes(areaInfo.extraData[2])) continue
            if (!movements.find(m => m.x == areaInfo.x && m.y == areaInfo.y))
                minimumTimeTillHit = Math.min(minimumTimeTillHit, towerTime.get(areaInfo))
        }
        let waitTime = Math.max(20000, minimumTimeTillHit - Date.now())
        console.info(`[${name}] Status: +${sessionAquaFarmed} Aqua. Next check in ${Math.round(waitTime/1000)}s...`);
        await new Promise(r => setTimeout(r, waitTime).unref())
        while (await sendHit());
    }
})
