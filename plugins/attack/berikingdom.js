const { isMainThread } = require('node:worker_threads')

const name = "Attack Berimond Kingdom"


if (isMainThread)
    return module.exports = {
        name: name,
        description: "Hits khan camps (NOT RESPONSIBLE)",
        pluginOptions: [
            {
                type: "Text",
                label: "Com White List",
                key: "commanderWhiteList"
            },
            {
                type: "Checkbox",
                label: "Lowest value chests first",
                key: "lowValueChests",
                default: false
            }
        ]
    }

const { Types, getResourceCastleList, ClientCommands, areaInfoLock, AreaType, getEventList, KingdomID } = require('../../protocols')
const { waitToAttack, getAttackInfo, assignUnit, getTotalAmountToolsFlank, getTotalAmountToolsFront, getAmountSoldiersFlank, getAmountSoldiersFront, getMaxUnitsInReinforcementWave } = require("./attack")
const { movementEvents, waitForCommanderAvailable } = require("../commander")
const { sendXT, waitForResult, xtHandler, events, playerInfo, botConfig } = require("../../ggebot")
const { getCommanderStats } = require("../../getEquipment")
const pluginOptions = Object.assign(structuredClone(
    botConfig.plugins[require('path').basename(__filename).slice(0, -3)] ?? {}),
    botConfig.plugins["attack"] ?? {})

const kid = KingdomID.berimond
const type = AreaType.watchTower
const level = 70

const units = require("../../items/units.json")
const pretty = require('pretty-time')

const minTroopCount = 32
const eventID = 3
events.once("load", async () => {
    const sei = await getEventList()
    const eventInfo = sei.E.find(e => e.EID == eventID)

    if (eventInfo == undefined)
        return console.warn(`${name} Event not running`)

    let quit = false
    while (!quit) {
        try {
            let comList = undefined
            if (![, "", "0"].includes(pluginOptions.commanderWhiteList)) {
                const [start, end] = pluginOptions.commanderWhiteList.split("-").map(Number).map(a => a - 1);
                comList = Array.from({ length: end - start + 1 }, (_, i) => start + i);
            }

            const commander = await waitForCommanderAvailable(comList)
            const attackInfo = await waitToAttack(async () => {
                const sourceCastleArea = (await getResourceCastleList()).castles.find(e => e.kingdomID == kid)
                    .areaInfo.find(e => e.type == AreaType.beriCastle);

                const sourceCastle = (await ClientCommands.getDetailedCastleList()())
                    .castles.find(a => a.kingdomID == kid)
                    .areaInfo.find(a => a.areaID == sourceCastleArea.extraData[0])

                sendXT("fnm", JSON.stringify({ T: type, KID: kid, LMIN: -1, LMAX: -1, NID: -801 }))

                const AI = (await waitForResult("fnm", 8500, (obj, result) => {
                    if (result != 0)
                        return false

                    if (obj.gaa.KID != kid)
                        return false

                    if (obj.gaa.AI[0][0] != type)
                        return false

                    return true
                }))[0].gaa.AI[0];

                const attackInfo = getAttackInfo(kid, sourceCastleArea, Types.GAAAreaInfo(AI), commander, level)

                if (pluginOptions.useCoin)
                    attackTarget.PTT = 0

                const attackerMeleeTroops = []
                const attackerRangeTroops = []
                const attackerBerimondTools = []
                const attackerWallBerimondTools = []
                const attackerGateBerimondTools = []
                const attackerShieldBerimondTools = []

                for (let i = 0; i < sourceCastle.unitInventory.length; i++) {
                    const unit = sourceCastle.unitInventory[i];
                    const unitInfo = units.find(obj => unit.unitID == obj.wodID)
                    if (unitInfo == undefined)
                        continue

                    else if (unitInfo.pointBonus != undefined) {
                        if (unitInfo.gateBonus)
                            attackerGateBerimondTools.push([unitInfo, unit.ammount])
                        else if (unitInfo.wallBonus)
                            attackerWallBerimondTools.push([unitInfo, unit.ammount])
                        else if (unitInfo.defRangeBonus)
                            attackerShieldBerimondTools.push([unitInfo, unit.ammount])
                        else
                            attackerBerimondTools.push([unitInfo, unit.ammount])
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

                attackerBerimondTools.sort((a, b) =>
                    Number(b[0].khanTabletBooster) - Number(a[0].khanTabletBooster))
                attackerGateBerimondTools.sort((a, b) =>
                    Number(b[0].khanTabletBooster) - Number(a[0].khanTabletBooster))
                attackerWallBerimondTools.sort((a, b) =>
                    Number(b[0].khanTabletBooster) - Number(a[0].khanTabletBooster))
                attackerShieldBerimondTools.sort((a, b) =>
                    Number(b[0].khanTabletBooster) - Number(a[0].khanTabletBooster))

                if (pluginOptions.lowValueChests) {
                    attackerBannerKhanTools.reverse()
                    attackerBerimondTools.reverse()
                    attackerGateBerimondTools.reverse()
                    attackerWallBerimondTools.reverse()
                    attackerShieldBerimondTools.reverse()
                }

                attackInfo.A.forEach((wave, index) => {
                    const maxToolsFlank = getTotalAmountToolsFlank(level, 0)
                    const maxToolsFront = getTotalAmountToolsFront(level)

                    const desiredToolCount = attackerBerimondTools.length == 0 ? 20 : 10
                    const commanderStats = getCommanderStats(commander)
                    const maxTroopFront = getAmountSoldiersFront(level) * 1 + (commanderStats.relicAttackUnitAmountFront ?? 0) / 100
                    const maxTroopFlank = getAmountSoldiersFlank(level) * 1 + (commanderStats.relicAttackUnitAmountFlank ?? 0) / 100

                    let maxTools = maxToolsFlank
                    if (index == 0) {
                        wave.L.T.forEach((unitSlot, i) =>
                            maxTools -= assignUnit(unitSlot, i == 0 ?
                                attackerWallBerimondTools : attackerShieldBerimondTools, Math.min(maxTools, desiredToolCount)))

                        maxTools = maxToolsFlank
                        wave.R.T.forEach((unitSlot, i) =>
                            maxTools -= assignUnit(unitSlot, i == 0 ?
                                attackerWallBerimondTools : attackerShieldBerimondTools, Math.min(maxTools, desiredToolCount)))

                        maxTools = maxToolsFront
                        wave.M.T.forEach((unitSlot, i) =>
                            maxTools -= assignUnit(unitSlot, i == 0 ? attackerWallBerimondTools :
                                i == 1 ? attackerGateBerimondTools : attackerShieldBerimondTools, Math.min(maxTools, desiredToolCount)))

                        let maxTroops = maxTroopFlank

                        wave.L.U.forEach((unitSlot, i) =>
                            maxTroops -= assignUnit(unitSlot, attackerRangeTroops.length <= 0 ?
                                attackerMeleeTroops : attackerRangeTroops, maxTroops))
                        maxTroops = maxTroopFlank
                    }
                    else {
                        const selectTool = i => {
                            let tools = attackerBerimondTools
                            if (tools.length == 0) {
                                if (i == 0) {
                                    tools = attackerWallBerimondTools
                                    if (tools.length == 0)
                                        tools = attackerShieldBerimondTools
                                }
                                else if (i == 1) {
                                    tools = attackerShieldBerimondTools
                                    if (tools.length == 0)
                                        tools = attackerWallBerimondTools
                                }
                                if (i == 2) {
                                    tools = attackerGateBerimondTools
                                    if (tools.length == 0)
                                        tools = attackerWallBerimondTools
                                    if (tools.length == 0)
                                        tools = attackerShieldBerimondTools
                                }
                            }
                            return tools
                        }

                        wave.L.T.forEach((unitSlot, i) =>
                            maxTools -= assignUnit(unitSlot, selectTool(0), maxTools))
                        maxTools = maxToolsFlank
                        wave.R.T.forEach((unitSlot, i) =>
                            maxTools -= assignUnit(unitSlot, selectTool(1), maxTools))
                        maxTools = maxToolsFront
                        wave.M.T.forEach((unitSlot, i) =>
                            maxTools -= assignUnit(unitSlot, selectTool(2), maxTools))
                    }
                });

                await areaInfoLock(() => sendXT("aci", JSON.stringify(attackInfo)))

                return (await waitForResult("aci", 6000, (obj, result) => {
                    if (result != 0)
                        return false

                    if (obj.AAM.M.KID != kid || obj.AAM.M.TA[1] != AI[1] || obj.AAM.M.TA[2] != AI[2])
                        return false
                    return true
                }))[0]
            })

            console.info(`[${name}] Hitting target C${attackInfo.AAM.UM.L.VIS + 1} ${attackInfo.AAM.M.TA[1]}:${attackInfo.AAM.M.TA[2]} ${pretty(Math.round(1000000000 * Math.abs(Math.max(0, attackInfo.AAM.M.TT - attackInfo.AAM.M.PT))), 's') + " till impact"}`)
        } catch (e) {
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
                case "LORD_IS_USED":
                case "COOLING_DOWN":
                case "CANT_START_NEW_ARMIES":
                    break
                default:
                    console.error(e)
                    quit = true
            }
        }
    }
})