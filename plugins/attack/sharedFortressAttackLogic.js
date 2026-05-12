if (require('node:worker_threads').isMainThread)
    return module.exports = {
        hidden: true
    }

const pretty = require('pretty-time')
const { movements, movementEvents, castles, ClientCommands, AreaType, KingdomID, spiralCoordinates } = require('../../protocols')
const { waitToAttack, getAttackInfo, assignUnit, getAmountSoldiersFlank, getMaxUnitsInReinforcementWave } = require("./attack")
const { waitForCommanderAvailable, freeCommander, useCommander } = require("../commander")
const { sendXT, waitForResult, playerInfo } = require("../../ggeBot.js")

const err = require('../../err.json')

const minTroopCount = 100
const minTroopCountCY = 500
const type = AreaType.fortress

async function fortressHit(kingdomID, level, options) {
    options.useCoin = true
    options.useFeather = true

    const areas = []

    const castle = castles.find(e => e.kingdomID == kingdomID && e.areaInfo.type == AreaType.externalKingdom)
    const sendHit = async () => {
        const commander = await waitForCommanderAvailable(options.commanderWhiteList,
            undefined,
            (a, b) => b.getEffects().speedBonus - a.getEffects().speedBonus)
        
        const hasShieldMadiens = commander.getEffects().AttackSupportUnits
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

                    if (((areaInfo.timeSinceRequest + areaInfo.extraData[2] * 1000) - timeSinceEpoch) > -5000)
                        continue

                    await ClientCommands.preSpyInfo(areaInfo.x, areaInfo.y, kingdomID, false)

                    if (areaInfo.extraData[2] > 0)
                        continue

                    index = i
                    break
                }
                if (index == -1)
                    return

                let AI = areas[index]

                const attackInfo = getAttackInfo(kingdomID, castle, AI, commander, level, undefined, options)

                const attackerTroops = []

                for (let i = 0; i < castle.unitInventory.length; i++) {
                    const unit = castle.unitInventory[i]
                    if (unit.amount <= 0)
                        continue

                    if (unit.unitInfo.fightType == 0 &&
                        unit.unitInfo.beefSupply == undefined &&
                        unit.unitInfo.role
                    ) {
                        if (kingdomID == KingdomID.firePeaks &&
                            unit.unitInfo.wodID == 277 && !hasShieldMadiens)
                            continue

                        attackerTroops.push(unit)
                    }
                }

                attackerTroops.sort((a, b) => Number(b.unitInfo.speed) - Number(a.unitInfo.speed))

                let allTroopCount = 0

                attackerTroops.forEach(e => allTroopCount += e.amount)

                if (allTroopCount < minTroopCount + (hasShieldMadiens ? 0 : minTroopCountCY))
                    throw "NO_MORE_TROOPS"

                attackInfo.A.forEach((wave, i) => {
                    if (i > 2 && kingdomID != KingdomID.firePeaks)
                        return
                    if (i > 4 && kingdomID == KingdomID.firePeaks)
                        return

                    const maxTroopFlank = getAmountSoldiersFlank(level)

                    let maxTroops = maxTroopFlank

                    wave.L.U.forEach(unitSlot =>
                        maxTroops -= assignUnit(unitSlot, attackerTroops, maxTroops))
                })

                if (!hasShieldMadiens) {
                    let maxTroops = getMaxUnitsInReinforcementWave(playerInfo.level, level)
                    attackInfo.RW.forEach(unitSlot =>
                        maxTroops -= assignUnit(unitSlot, attackerTroops, maxTroops))
                }

                await sendXT("cra", JSON.stringify(attackInfo))

                const [obj, result] = await waitForResult("cra", 1000 * 10, (obj, result) => {
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

            if (!attackInfo) {
                freeCommander(commander.lordID)
                return false
            }

            console.info("hittingTargetAttack", KingdomID[kingdomID], ' ', 'C', attackInfo.AAM.UM.L.VIS + 1, ' ', attackInfo.AAM.M.TA[1], ':', attackInfo.AAM.M.TA[2], " ", pretty(Math.round(1000000000 * Math.abs(Math.max(0, attackInfo.AAM.M.TT - attackInfo.AAM.M.PT))), 's'), "tillImpactAttack")
            return true
        } catch (e) {
            freeCommander(commander.lordID)
            switch (e) {
                case "NO_MORE_TROOPS":
                    await new Promise(resolve => movementEvents.on("return", function self(/** @type {import("../../protocols.js").Types.Movement} */ movement) {
                        if (movement.kingdomID != kingdomID || movement.targetAttack.extraData[0] != castle.areaInfo.id)
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
        } while ((castle.areaInfo.x + rX) <= -50 ||
        (castle.areaInfo.y + rY) <= -50 || (castle.areaInfo.x + rX) >= (1286 + 50) || (castle.areaInfo.y + rY) >= (1286 + 50))

        rect.x = rect.x < 0 ? 0 : rect.x
        rect.y = rect.y < 0 ? 0 : rect.y
        rect.w = rect.w < 0 ? 0 : rect.w
        rect.h = rect.h < 0 ? 0 : rect.h
        rect.x = rect.x > 1286 ? 1286 : rect.x
        rect.y = rect.y > 1286 ? 1286 : rect.y
        rect.w = rect.w > 1286 ? 1286 : rect.w
        rect.h = rect.h > 1286 ? 1286 : rect.h

        areas.push(...(await ClientCommands.getAreaInfo(kingdomID, rect.x, rect.y, rect.w, rect.h)).areaInfo.filter(e => e.type == type))

        areas.sort((a, b) =>
            (Math.pow(castle.areaInfo.x - a.x, 2) + Math.pow(castle.areaInfo.y - a.y, 2)) -
            (Math.pow(castle.areaInfo.x - b.x, 2) + Math.pow(castle.areaInfo.y - b.y, 2)))
        while (await sendHit());
    }

    while (true) {
        let minimumTimeTillHit = Infinity
        areas.forEach(areaInfo => {
            if (movements.find(movement =>
                movement.kingdomID == kingdomID &&
                movement.targetAttack.x == areaInfo.x && movement.targetAttack.y == areaInfo.y))
                return
            minimumTimeTillHit = Math.min(minimumTimeTillHit, (areaInfo.timeSinceRequest + areaInfo.extraData[2] * 1000))
        })
        const time = (Math.max(0, minimumTimeTillHit - Date.now())) + 5000
        console.info("waitingForNextPossibleHit", Math.round(time / 1000), "waitingForNextPossibleHit2")
        await new Promise(r => setTimeout(r, time).unref())

        while (await sendHit());
    }
}

module.exports = fortressHit