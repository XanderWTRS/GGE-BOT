if (require('node:worker_threads').isMainThread)
    return module.exports = {
        pluginOptions: [
            {
                type: "Select",
                key: "eventDifficulty",
                selection: [
                    "Classic",
                    "Easy",
                    "Easy+",
                    "Intermediate",
                    "Intermediate+",
                    "Hard",
                    "Hard+",
                    "Expert",
                    "Expert+",
                    "Master",
                    "Master+",
                    "Archmaster"
                ],
                default: "4"
            },
            {
                type: "Checkbox",
                key: "eventWallToolsFirst"
            },
            {
                type: "Checkbox",
                key: "lowValueChests",
                default: false
            },
            {
                type: "Checkbox",
                key: "noChests",
                default: false
            },
            {
                type: "Checkbox",
                key: "useFeather",
                default: false
            },
            {
                type: "Checkbox",
                key: "useCoin",
                default: false
            },
            {
                type: "Checkbox",
                key: "useFood",
                default: true
            },
            {
                type: "Checkbox",
                key: "foodTroopsOnly",
                default: false
            },
            {
                type: "Text",
                key: "commanderWhiteList",
                default: "1-99"
            },
            {
                type: "Text",
                key: "scoreShutoff"
            }
        ]

    }

const pretty = require('pretty-time')
const err = require("../../err.json")
const { spendSkip } = require("../skips.js")
const { movementEvents, AreaType, KingdomID, castles, ClientCommands } = require("../../protocols.js")
const { waitToAttack, getAttackInfo, assignUnit, getTotalAmountToolsFlank, getTotalAmountToolsFront, getAmountSoldiersFlank, getAmountSoldiersFront, getMaxUnitsInReinforcementWave } = require("./attack.js")
const { waitForCommanderAvailable, freeCommander, useCommander } = require("../commander.js")
const { sendXT, waitForResult, xtHandler, events, playerInfo, botConfig } = require("../../ggeBot.js")

const eventsDifficulties = require("../../items/eventAutoScalingDifficulties.json")
const eventAutoScalingCamps = require("../../items/eventAutoScalingCamps.json")
const nomadCampsClassic = require("../../items/nomadCamps.json")
const ggeConfig = require("../../ggeConfig.json")
const pluginOptions = botConfig.plugins[require("path").basename(__filename).slice(0, -3)] ?? {}

const kingdomID = KingdomID.greatEmpire
const type = AreaType.nomadCamp
const minTroopCount = 100
const eventID = 72
let nomadsPoints = 0

const skipTarget = async areaInfo => {
    while (areaInfo.extraData[2] > 0) {
        let skip = spendSkip(areaInfo.extraData[2])

        if (skip == undefined)
            throw new Error("couldntFindSkip")

        const { result } = await ClientCommands.skipTarget(type, areaInfo.x, areaInfo.y, kingdomID, skip)

        if (result != 0)
            break
    }
}

movementEvents.on("returning", (/** @type {import("../../protocols.js").ClassTypes.Movement} */ movement) => {
    if (movement.targetOwner.ownerID != playerInfo.playerID)
        return

    if (movement.sourceAttack.type != type)
        return

    skipTarget(movement.sourceAttack)
})

let quit = false

xtHandler.on("pep", obj => {
    if (obj.EID != eventID)
        return

    if (pluginOptions.nomadsScoreShutoff <= 0)
        pluginOptions.nomadsScoreShutoff = Infinity

    nomadsPoints = Number(obj.OP[0])
    if (nomadsPoints >= pluginOptions.nomadsScoreShutoff) {
        console.log("shuttingDownEvent", "scoreReached")
        quit = true
    }
})

events.on("eventStop", eventInfo => {
    if (eventInfo.EID != eventID)
        return

    if (quit)
        return

    console.log("shuttingDownEvent", "eventEnded")
    quit = true
})
events.on("eventStart", async eventInfo => {
    if (eventInfo.EID != eventID)
        return

    if (eventInfo.EDID == -1 && !(ggeConfig.classicBug && pluginOptions.eventDifficulty == 0)) {
        const eventDifficultyID =
            Number(eventsDifficulties.find(e =>
                ((pluginOptions.eventDifficulty)) == e.difficultyTypeID &&
                e.eventID == eventID)
                .difficultyID)

        await sendXT("sede", JSON.stringify({ EID: eventID, EDID: eventDifficultyID, C2U: 0 }))
        await waitForResult("sede", 1000 * 10)
        eventInfo.EDID = eventDifficultyID
    }
    let classic = false
    if ([-1, 0].includes(eventInfo.EDID))
        classic = true

    const castle = castles.find(e => e.kingdomID == kingdomID && e.areaInfo.type == AreaType.mainCastle)

    const areas = (await ClientCommands.getAreaInfo(kingdomID,
        castle.areaInfo.x - 50, castle.areaInfo.y - 50,
        castle.areaInfo.x + 50, castle.areaInfo.y + 50)).areaInfo.filter(ai => ai.type == type)
        .sort((a, b) =>
            (Math.pow(castle.areaInfo.x - a.x, 2) + Math.pow(castle.areaInfo.y - a.y, 2)) -
            (Math.pow(castle.areaInfo.x - b.x, 2) + Math.pow(castle.areaInfo.y - b.y, 2)))
        .sort((a, b) => a.extraData[6] - b.extraData[6])

    quit = false

    while (!quit) {
        const commander = await waitForCommanderAvailable(pluginOptions.commanderWhiteList)
        try {
            const attackInfo = await waitToAttack(async () => {
                const areaInfo = areas.shift()

                areas.push(areaInfo)

                await skipTarget(areaInfo)

                const campInfo = classic ? nomadCampsClassic.find(obj => areaInfo.extraData[1] == obj.id) :
                    eventAutoScalingCamps.find(obj => areaInfo.extraData[5] == obj.eventAutoScalingCampID)

                const level = Number(classic ? (80 + campInfo.countVictory) : campInfo.camplevel)

                const attackerMeleeTroops = []
                const attackerRangeTroops = []
                const attackerNomadTools = []
                const attackerWallNomadTools = []
                const attackerGateNomadTools = []
                const attackerShieldNomadTools = []
                const attackerWallTools = []
                const attackerShieldTools = []

                for (let i = 0; i < castle.unitInventory.length; i++) {
                    const unit = castle.unitInventory[i]
                    if (unit.amount <= 0)
                        continue

                    if (unit.unitInfo.wodID == 277)
                        continue

                    else if (unit.unitInfo.khanTabletBooster != undefined && unit.unitInfo.ragePointBonus == undefined) {
                        if (unit.unitInfo.gateBonus)
                            attackerGateNomadTools.push(unit)
                        else if (unit.unitInfo.wallBonus)
                            attackerWallNomadTools.push(unit)
                        else if (unit.unitInfo.defRangeBonus)
                            attackerShieldNomadTools.push(unit)
                        else
                            attackerNomadTools.push(unit)
                    }
                    else if (
                        unit.unitInfo.toolCategory &&
                        unit.unitInfo.usageEventID == undefined &&
                        unit.unitInfo.allowedToAttack == undefined &&
                        unit.unitInfo.typ == 'Attack' &&
                        unit.unitInfo.amountPerWave == undefined
                    ) {
                        if (unit.unitInfo.wallBonus)
                            attackerWallTools.push(unit)
                        else if (unit.unitInfo.defRangeBonus)
                            attackerShieldTools.push(unit)
                    }
                    else if (unit.unitInfo.fightType == 0 && !unit.unitInfo.beefSupply) {
                        if(pluginOptions.foodTroopsOnly && unit.unitInfo.meadSupply)
                            continue
                        if (unit.unitInfo.foodSupply && !pluginOptions.useFood)
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

                attackerNomadTools.sort((a, b) =>
                    Number(b.unitInfo.khanTabletBooster) - Number(a.unitInfo.khanTabletBooster))
                attackerGateNomadTools.sort((a, b) =>
                    Number(b.unitInfo.khanTabletBooster) - Number(a.unitInfo.khanTabletBooster))
                attackerWallNomadTools.sort((a, b) =>
                    Number(b.unitInfo.khanTabletBooster) - Number(a.unitInfo.khanTabletBooster))
                attackerShieldNomadTools.sort((a, b) =>
                    Number(b.unitInfo.khanTabletBooster) - Number(a.unitInfo.khanTabletBooster))

                if (pluginOptions.lowValueChests) {
                    attackerNomadTools.reverse()
                    attackerGateNomadTools.reverse()
                    attackerWallNomadTools.reverse()
                    attackerShieldNomadTools.reverse()
                }

                attackerWallTools.sort((a, b) =>
                    Number(a.unitInfo.wallBonus) - Number(b.unitInfo.wallBonus))

                attackerShieldTools.sort((a, b) =>
                    Number(a.unitInfo.defRangeBonus) - Number(b.unitInfo.defRangeBonus))

                attackerWallNomadTools.push(...attackerWallTools)
                attackerShieldNomadTools.push(...attackerShieldTools)

                const maxToolsFlank = getTotalAmountToolsFlank(level, 0)
                const maxToolsFront = getTotalAmountToolsFront(level)
                const commanderStats = commander.getEffects()
                const attackInfo = getAttackInfo(kingdomID, castle, areaInfo, commander, level, undefined, pluginOptions, commanderStats.additionalWaves)
                const maxTroopFront = getAmountSoldiersFront(level, commanderStats.attackUnitAmountFront)
                const maxTroopFlank = getAmountSoldiersFlank(level, commanderStats.attackUnitAmountFlank)
                const desiredToolCount = attackerNomadTools.length == 0 ? 40 : 10

                attackInfo.A.forEach((wave, index) => {
                    let maxTools = maxToolsFlank
                    if (index == 0) {
                        wave.L.T.forEach((unitSlot, i) =>
                            maxTools -= assignUnit(unitSlot, i == 0 ?
                                attackerWallNomadTools : attackerShieldNomadTools, Math.min(maxTools / 2, desiredToolCount)))

                        maxTools = maxToolsFlank
                        wave.R.T.forEach((unitSlot, i) =>
                            maxTools -= assignUnit(unitSlot, i == 0 ?
                                attackerWallNomadTools : attackerShieldNomadTools, Math.min(maxTools / 2, desiredToolCount)))

                        maxTools = maxToolsFront
                        wave.M.T.forEach((unitSlot, i) =>
                            maxTools -= assignUnit(unitSlot, i == 0 ? attackerWallNomadTools :
                                i == 1 ? attackerGateNomadTools : attackerShieldNomadTools, Math.min(maxTools / 3, desiredToolCount)))

                        let maxTroops = maxTroopFlank

                        wave.L.U.forEach(unitSlot =>
                            maxTroops -= assignUnit(unitSlot, attackerRangeTroops.length <= 0 ?
                                attackerMeleeTroops : attackerRangeTroops, maxTroops))
                        maxTroops = maxTroopFlank
                        wave.R.U.forEach(unitSlot =>
                            maxTroops -= assignUnit(unitSlot, attackerRangeTroops.length <= 0 ?
                                attackerMeleeTroops : attackerRangeTroops, maxTroops))
                        maxTroops = maxTroopFront
                        wave.M.U.forEach(unitSlot =>
                            maxTroops -= assignUnit(unitSlot, attackerRangeTroops.length <= 0 ?
                                attackerMeleeTroops : attackerRangeTroops, maxTroops))
                        attackerMeleeTroops.sort((a, b) => Number(a.unitInfo.meleeAttack) - Number(b.unitInfo.meleeAttack))
                        attackerRangeTroops.sort((a, b) => Number(a.unitInfo.rangeAttack) - Number(b.unitInfo.rangeAttack))
                        return
                    }
                    else if (!pluginOptions.noChests) {
                        const selectTool = i => {
                            let tools = pluginOptions.eventWallToolsFirst ? [] : attackerNomadTools
                            if (tools.length == 0 || !tools[0]?.unitInfo.khanTabletBooster) {
                                if (i == 0) {
                                    tools = attackerWallNomadTools
                                    if (tools.length == 0 || !tools[0]?.unitInfo.khanTabletBooster)
                                        tools = attackerShieldNomadTools
                                }
                                else if (i == 1) {
                                    tools = attackerShieldNomadTools
                                    if (tools.length == 0 || !tools[0]?.unitInfo.khanTabletBooster)
                                        tools = attackerWallNomadTools
                                }
                                if (i == 2) {
                                    tools = attackerGateNomadTools
                                    if (tools.length == 0 || !tools[0]?.unitInfo.khanTabletBooster)
                                        tools = attackerWallNomadTools
                                    if (tools.length == 0 || !tools[0]?.unitInfo.khanTabletBooster)
                                        tools = attackerShieldNomadTools
                                }
                                if (!tools[0]?.unitInfo.khanTabletBooster)
                                    tools = []
                            }

                            return tools
                        }

                        wave.L.T.forEach(unitSlot =>
                            maxTools -= assignUnit(unitSlot, selectTool(0), maxTools))
                        maxTools = maxToolsFlank
                        wave.R.T.forEach(unitSlot =>
                            maxTools -= assignUnit(unitSlot, selectTool(1), maxTools))
                        maxTools = maxToolsFront
                        wave.M.T.forEach(unitSlot =>
                            maxTools -= assignUnit(unitSlot, selectTool(2), maxTools))
                    }

                    let maxTroops = maxTroopFlank

                    wave.L.U.forEach(unitSlot =>
                        maxTroops -= assignUnit(unitSlot, attackerMeleeTroops.length <= 0 ?
                            attackerRangeTroops : attackerMeleeTroops, maxTroops))
                    maxTroops = maxTroopFlank
                    wave.R.U.forEach(unitSlot =>
                        maxTroops -= assignUnit(unitSlot, attackerMeleeTroops.length <= 0 ?
                            attackerRangeTroops : attackerMeleeTroops, maxTroops))
                    maxTroops = maxTroopFront
                    wave.M.U.forEach(unitSlot =>
                        maxTroops -= assignUnit(unitSlot, attackerRangeTroops.length <= 0 ?
                            attackerMeleeTroops : attackerRangeTroops, maxTroops))
                })
                let maxTroops = getMaxUnitsInReinforcementWave(playerInfo.level, level) + Number(0 | commanderStats.attackUnitAmountReinforcementBonus)
                attackInfo.RW.forEach((unitSlot, i) => {
                    let attacker = i & 1 ?
                        (attackerMeleeTroops.length > 0 ? attackerMeleeTroops : attackerRangeTroops) :
                        (attackerRangeTroops.length > 0 ? attackerRangeTroops : attackerMeleeTroops)

                    maxTroops -= assignUnit(unitSlot, attacker,
                        Math.floor(maxTroops / 2) - 1)
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
                continue
            }

            console.info("hittingTargetAttack", 'C', attackInfo.AAM.UM.L.VIS + 1, ' ', attackInfo.AAM.M.TA[1], ':', attackInfo.AAM.M.TA[2], " ", pretty(Math.round(1000000000 * Math.abs(Math.max(0, attackInfo.AAM.M.TT - attackInfo.AAM.M.PT))), 's'), "tillImpactAttack")
        } catch (e) {
            freeCommander(commander.lordID)
            console.warn(e)
            switch (e) {
                case "NO_MORE_TROOPS":
                    await new Promise(resolve => movementEvents.on("return", function self(/** @type {import("../../protocols.js").ClassTypes.Movement} */ movement) {
                        if (movement.kingdomID != kingdomID || movement.targetAttack.extraData[0] != castle.id)
                            return

                        movementEvents.off("return", self)
                        resolve()
                    }))
                    break
                case "LORD_IS_USED":
                    useCommander(commander.lordID)
                case "COOLING_DOWN":
                case "TIMED_OUT":
                case "MISSING_UNITS":
                case "CANT_START_NEW_ARMIES":
                    break
                default:
                    console.error(e)
                    quit = true
            }
        }
    }
})