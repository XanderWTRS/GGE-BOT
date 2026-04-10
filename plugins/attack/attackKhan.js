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
                type: "Text",
                key: "commanderWhiteList",
                default: "1-99"
            },
            {
                type: "Checkbox",
                key: "eventWallToolsFirst",
                default: false
            },
            {
                type: "Checkbox",
                key: "lowValueChests",
                default: false
            },
            {
                type: "Text",
                key: "wavesTillChests",
                default: "4"
            },
            {
                type: "Checkbox",
                key: "useFeather",
                default: false
            },
            {
                type: "Checkbox",
                key: "useCoin",
                default: true
            },
            {
                type: "Checkbox",
                key: "noChests",
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
                key: "scoreShutoff",
                default: "881100"
            }
        ]

    }

const err = require("../../err.json")
const { spendSkip } = require("../skips.js")
const { movementEvents, castles, AreaType, KingdomID, ClientCommands } = require("../../protocols.js")
const { waitToAttack, getAttackInfo, assignUnit, getTotalAmountToolsFlank, getTotalAmountToolsFront, getAmountSoldiersFlank, getAmountSoldiersFront, getMaxUnitsInReinforcementWave } = require("./attack.js")
const { waitForCommanderAvailable, freeCommander, useCommander } = require("../commander.js")
const { sendXT, waitForResult, xtHandler, events, playerInfo, botConfig } = require("../../ggeBot.js")

const eventsDifficulties = require("../../items/eventAutoScalingDifficulties.json")
const nomadCampsClassic = require("../../items/nomadCamps.json")
const ggeConfig = require("../../ggeConfig.json")

const pluginOptions = botConfig.plugins[require("path").basename(__filename).slice(0, -3)] ?? {}
const eventAutoScalingCamps = require("../../items/eventAutoScalingCamps.json")
const pretty = require('pretty-time')

const kingdomID = KingdomID.greatEmpire
const type = AreaType.khanCamp
const minTroopCount = 100
const eventID = 72
const troopBlackList = [277, 34, 35]

let campRageNeeded = NaN

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

movementEvents.on("outgoing", async (/** @type {import("../../protocols.js").ClassTypes.Movement} */ movement) => {
    if (movement.owner?.ownerID != playerInfo.playerID)
        return

    if (movement.targetAttack.type != type)
        return

    campRageNeeded = eventAutoScalingCamps.find(campInfo =>
        campInfo.eventAutoScalingCampID == movement.targetAttack.extraData[6]).playerRageCap
})

movementEvents.on("returning", (/** @type {import("../../protocols.js").ClassTypes.Movement} */ movement) => {
    if (movement.owner?.ownerID != playerInfo.playerID)
        return

    if (movement.sourceAttack.type != type)
        return

    campRageNeeded = eventAutoScalingCamps.find(campInfo =>
        campInfo.eventAutoScalingCampID == movement.sourceAttack.extraData[6]).playerRageCap
    skipTarget(movement.sourceAttack)
})

xtHandler.on("rpr", ({ EID, PCRP: rage }) => {
    if (EID != eventID)
        return

    if (rage >= campRageNeeded) {
        if (rage > campRageNeeded)
            console.warn("rageTooHigh")

        console.info("rageTrigger")
        sendXT("lta", JSON.stringify({ AV: 0, EID: eventID }))
    }
})
let nomadsPoints = 0
let quit = false

xtHandler.on("pep", ({ EID, OP }) => {
    if (EID != eventID)
        return

    nomadsPoints = Number(OP[0])

    if (quit)
        return

    if (pluginOptions.nomadsScoreShutoff <= 0)
        pluginOptions.nomadsScoreShutoff = Infinity

    if (nomadsPoints >= pluginOptions.nomadsScoreShutoff) {
        console.log("shuttingDownEvent", "scoreReached")
        quit = true
    }
})
events.on("eventStop", ({ EID }) => {
    if (EID != eventID)
        return

    if (quit)
        return

    console.log("shuttingDownEvent", "eventEnded")
    quit = true
})
events.on("eventStart", async ({ EID, EDID }) => {
    if (EID != eventID)
        return

    if (EDID == -1 && !(ggeConfig.classicBug && pluginOptions.eventDifficulty == 0)) {
        const eventDifficultyID =
            Number(eventsDifficulties.find(e =>
                ((pluginOptions.eventDifficulty)) == e.difficultyTypeID &&
                e.eventID == eventID)
                .difficultyID)

        await sendXT("sede", JSON.stringify({ EID: eventID, EDID: eventDifficultyID, C2U: 0 }))
        await waitForResult("sede", 1000 * 10)
        EDID = eventDifficultyID
    }
    let classic = false

    if ([-1, 0].includes(EDID))
        classic = true

    const castle = castles.find(e => e.kingdomID == kingdomID && e.areaInfo.type == AreaType.mainCastle)

    quit = false

    const { areaInfo } = await ClientCommands.getNextMapObject(type, kingdomID)

    while (!quit) {
        const commander = await waitForCommanderAvailable(pluginOptions.commanderWhiteList)
        try {
            const attackInfo = await waitToAttack(async () => {
                await skipTarget(areaInfo)

                const campInfo = classic ? nomadCampsClassic.find(obj => areaInfo.extraData[1] == obj.id) :
                    eventAutoScalingCamps.find(obj => areaInfo.extraData[6] == obj.eventAutoScalingCampID)

                const level = Number(classic ? (80 + campInfo.countVictory) : campInfo.camplevel)

                const attackerMeleeTroops = []
                const attackerRangeTroops = []
                const attackerBannerKhanTools = []
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

                    if (unit.unitInfo.ragePointBonus != undefined)
                        attackerBannerKhanTools.push(unit)
                    else if (unit.unitInfo.khanTabletBooster != undefined) {
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
                        if (troopBlackList.includes(unit))
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

                attackerBannerKhanTools.sort((a, b) =>
                    Number(b.unitInfo.ragePointBonus + Number(b.unitInfo.khanTabletBooster ?? 0)) -
                    Number(a.unitInfo.ragePointBonus + Number(a.unitInfo.khanTabletBooster ?? 0)))

                attackerNomadTools.sort((a, b) =>
                    Number(b.unitInfo.khanTabletBooster ?? 0) - Number(a.unitInfo.khanTabletBooster ?? 0))
                attackerGateNomadTools.sort((a, b) =>
                    Number(b.unitInfo.khanTabletBooster ?? 0) - Number(a.unitInfo.khanTabletBooster ?? 0))
                attackerWallNomadTools.sort((a, b) =>
                    Number(b.unitInfo.khanTabletBooster ?? 0) - Number(a.unitInfo.khanTabletBooster ?? 0))
                attackerShieldNomadTools.sort((a, b) =>
                    Number(b.unitInfo.khanTabletBooster ?? 0) - Number(a.unitInfo.khanTabletBooster ?? 0))

                if (pluginOptions.lowValueChests) {
                    attackerBannerKhanTools.reverse()
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

                const commanderStats = commander.getEffects()
                const attackInfo = getAttackInfo(kingdomID, castle, areaInfo, commander, level, undefined, pluginOptions, commanderStats.additionalWaves)
                const maxToolsFlank = getTotalAmountToolsFlank(level, 0)
                const maxToolsFront = getTotalAmountToolsFront(level)
                const maxTroopFront = getAmountSoldiersFront(level, commanderStats.attackUnitAmountFront)
                const maxTroopFlank = getAmountSoldiersFlank(level, commanderStats.attackUnitAmountFlank)
                const desiredToolCount = attackerNomadTools.length == 0 || (!attackerNomadTools[0]?.unitInfo?.khanTabletBooster && !attackerNomadTools[0]?.unitInfo?.ragePointBonus) ? 20 : 10

                attackInfo.A.forEach((wave, index) => {
                    let maxTools = maxToolsFlank
                    if (index == 0) {
                        wave.L.T.forEach((unitSlot, i) =>
                            maxTools -= assignUnit(unitSlot, i == 0 ?
                                attackerWallNomadTools : attackerShieldNomadTools, Math.min(maxTools, desiredToolCount)))

                        maxTools = maxToolsFlank
                        wave.R.T.forEach((unitSlot, i) =>
                            maxTools -= assignUnit(unitSlot, i == 0 ?
                                attackerWallNomadTools : attackerShieldNomadTools, Math.min(maxTools, desiredToolCount)))

                        maxTools = maxToolsFront
                        wave.M.T.forEach((unitSlot, i) =>
                            maxTools -= assignUnit(unitSlot, i == 0 ? attackerWallNomadTools :
                                i == 1 ? attackerGateNomadTools : attackerShieldNomadTools, Math.min(maxTools, desiredToolCount)))

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
                            let tools = pluginOptions.eventWallToolsFirst ? [] : attackerBannerKhanTools
                            if (pluginOptions.wavesTillChests <= index) {
                                tools = attackerNomadTools
                                if (tools.length == 0 || (!tools[0]?.unitInfo?.khanTabletBooster && !tools[0]?.unitInfo?.ragePointBonus)) {
                                    if (i == 0) {
                                        tools = attackerWallNomadTools
                                        if (tools.length == 0 || (!tools[0]?.unitInfo?.khanTabletBooster && !tools[0]?.unitInfo?.ragePointBonus))
                                            tools = attackerShieldNomadTools
                                    }
                                    else if (i == 1) {
                                        tools = attackerShieldNomadTools
                                        if (tools.length == 0 || (!tools[0]?.unitInfo?.khanTabletBooster && !tools[0]?.unitInfo?.ragePointBonus))
                                            tools = attackerWallNomadTools
                                    }
                                    if (i == 2) {
                                        tools = attackerGateNomadTools
                                        if (tools.length == 0 || (!tools[0]?.unitInfo?.khanTabletBooster && !tools[0]?.unitInfo?.ragePointBonus))
                                            tools = attackerWallNomadTools
                                        if (tools.length == 0 || (!tools[0]?.unitInfo?.khanTabletBooster && !tools[0]?.unitInfo?.ragePointBonus))
                                            tools = attackerShieldNomadTools
                                    }
                                    if (!tools[0]?.unitInfo?.khanTabletBooster && !tools[0]?.unitInfo?.ragePointBonus)
                                        tools = []
                                }
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
                        if (movement.kingdomID != kingdomID || movement.targetAttack.extraData[0] != castle.areaInfo.id)
                            return

                        movementEvents.off("return", self)
                        resolve()
                    }))
                    break
                case "LORD_IS_USED":
                    useCommander(commander.lordID)
                case "ATTACK_TOO_MANY_UNITS":
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
