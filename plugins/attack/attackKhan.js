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
                type: "Text",
                key: "scoreShutoff",
                default: "881100"
            }
        ]

    }

const err = require("../../err.json")
const { spendSkip } = require("../skips.js")
const { movementEvents, ClassTypes, castles, AreaType, KingdomID } = require('../../protocols.js')
const { waitToAttack, getAttackInfo, assignUnit, getTotalAmountToolsFlank, getTotalAmountToolsFront, getAmountSoldiersFlank, getAmountSoldiersFront, getMaxUnitsInReinforcementWave } = require("./attack.js")
const { waitForCommanderAvailable, freeCommander, useCommander } = require("../commander.js")
const { sendXT, waitForResult, xtHandler, events, playerInfo, botConfig } = require("../../ggeBot.js")
const { getCommanderStats } = require("../../getEquipment.js")
const eventsDifficulties = require("../../items/eventAutoScalingDifficulties.json")

const pluginOptions = botConfig.plugins[require('path').basename(__filename).slice(0, -3)] ?? {}
const eventAutoScalingCamps = require("../../items/eventAutoScalingCamps.json")
const pretty = require('pretty-time')

const kingdomID = KingdomID.greatEmpire
const type = AreaType.khanCamp
const minTroopCount = 100
const eventID = 72
const troopBlackList = [277, 34, 35]

let campRageNeeded = NaN

const skipTarget = async AI => {
    while (AI[5] > 0) {
        let skip = spendSkip(AI[5])

        if (skip == undefined)
            throw new Error("couldntFindSkip")

        await sendXT("msd", JSON.stringify({ X: AI[1], Y: AI[2], MID: -1, NID: -1, MST: skip, KID: `${kingdomID}` }))
        let [obj, result] = await waitForResult("msd", 7000, (obj, result) => result != 0 || obj.AI[0] == type)

        if (Number(result) != 0)
            break

        Object.assign(AI, obj.AI)
    }
}

xtHandler.on("cra", (obj, r) => {
    if (r != 0)
        return false

    if (obj.AAM.M.TA[0] != type)
        return false

    campRageNeeded = eventAutoScalingCamps.find(obj2 => obj.AAM.M.TA[9] == obj2.eventAutoScalingCampID).playerRageCap
})
xtHandler.on("cat", (obj, r) => {
    if (r != 0)
        return false
    
    const attackSource = obj.A.M.SA
    
    if (attackSource[0] != type)
        return false

    campRageNeeded = eventAutoScalingCamps.find(obj2 => 
        attackSource[9] == obj2.eventAutoScalingCampID).playerRageCap

    skipTarget(attackSource)
})
xtHandler.on("rpr", obj => {
    if (obj.EID != eventID)
        return
    
    let rage = obj.PCRP

    if (obj.PCRP >= campRageNeeded) {
        if (rage > campRageNeeded)
            console.warn("rageTooHigh")

        console.info("rageTrigger")
        sendXT("lta", JSON.stringify({ AV: 0, EID: eventID }))
    }
})
let nomadsPoints = 0
let quit = false

xtHandler.on("pep", obj => {
    if (obj.EID != eventID)
        return
    nomadsPoints = Number(obj.OP[0])
    
    if(quit)
        return

    if (pluginOptions.nomadsScoreShutoff <= 0)
        pluginOptions.nomadsScoreShutoff = Infinity

    if (nomadsPoints >= pluginOptions.nomadsScoreShutoff) {
        console.log("shuttingDownEvent", "scoreReached")
        quit = true
    }
})
events.on("eventStop", eventInfo => {
    if (eventInfo.EID != eventID)
        return

    if(quit)
        return

    console.log("shuttingDownEvent", "eventEnded")
    quit = true
})
events.on("eventStart", async eventInfo => {
    if (eventInfo.EID != eventID)
        return

    if (eventInfo.EDID == -1) {
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
    if(eventInfo.EDID == 0)
        classic = true

    const castle = castles.find(e => e.kingdomID == kingdomID && e.areaInfo.type == AreaType.mainCastle)

    quit = false

    while (!quit) {
        const commander = await waitForCommanderAvailable(pluginOptions.commanderWhiteList)
        try {
            const attackInfo = await waitToAttack(async () => {
                await sendXT("fnm", JSON.stringify({ T: type, KID: kingdomID, LMIN: -1, LMAX: -1, NID: -801 }))

                const AI = (await waitForResult("fnm", 8500, (obj, result) => {
                    if (result != 0)
                        return false

                    if (obj.gaa.KID != kingdomID)
                        return false

                    if (obj.gaa.AI[0][0] != type)
                        return false

                    return true
                }))[0].gaa.AI[0]

                await skipTarget(AI)

                const level = Number(eventAutoScalingCamps.find(obj => AI[9] == obj.eventAutoScalingCampID).camplevel)

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
                    else if (unit.unitInfo.fightType == 0) {
                        if(troopBlackList.includes(unit))
                            continue
                        if(unit.unitInfo.foodSupply && !pluginOptions.useFood)
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
                    Number(b.unitInfo.khanTabletBooster) - Number(a.unitInfo.khanTabletBooster))
                attackerGateNomadTools.sort((a, b) =>
                    Number(b.unitInfo.khanTabletBooster) - Number(a.unitInfo.khanTabletBooster))
                attackerWallNomadTools.sort((a, b) =>
                    Number(b.unitInfo.khanTabletBooster) - Number(a.unitInfo.khanTabletBooster))
                attackerShieldNomadTools.sort((a, b) =>
                    Number(b.unitInfo.khanTabletBooster) - Number(a.unitInfo.khanTabletBooster))

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

                const commanderStats = getCommanderStats(commander)
                const attackInfo = getAttackInfo(kingdomID, castle, new ClassTypes.GAAAreaInfo(AI), commander, level, undefined, pluginOptions, commanderStats.additionalWaves)
                const maxToolsFlank = getTotalAmountToolsFlank(level, 0)
                const maxToolsFront = getTotalAmountToolsFront(level)
                const maxTroopFront = getAmountSoldiersFront(level, commanderStats.attackUnitAmountFront)
                const maxTroopFlank = getAmountSoldiersFlank(level, commanderStats.attackUnitAmountFlank)
                const desiredToolCount = attackerNomadtools.length == 0 || (!tools[0]?.unitInfo?.khanTabletBooster && !tools[0]?.unitInfo?.ragePointBonus) ? 20 : 10

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
                                    if(!tools[0]?.unitInfo?.khanTabletBooster && !tools[0]?.unitInfo?.ragePointBonus)
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

                    wave.L.U.forEach((unitSlot, i) =>
                        maxTroops -= assignUnit(unitSlot, attackerMeleeTroops.length <= 0 ?
                            attackerRangeTroops : attackerMeleeTroops, maxTroops))
                    maxTroops = maxTroopFlank
                    wave.R.U.forEach((unitSlot, i) =>
                        maxTroops -= assignUnit(unitSlot, attackerMeleeTroops.length <= 0 ?
                            attackerRangeTroops : attackerMeleeTroops, maxTroops))
                    maxTroops = maxTroopFront
                    wave.M.U.forEach((unitSlot, i) =>
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

                    if (obj.AAM.M.KID != kingdomID || obj.AAM.M.TA[1] != AI[1] || obj.AAM.M.TA[2] != AI[2])
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
                        if(movement.kingdomID != kingdomID || movement.targetAttack.extraData[0] != castle.areaInfo.id)
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
                case "CANT_START_NEW_ARMIES":
                    break
                default:
                    console.error(e)
                    quit = true
            }
        }
    }
})