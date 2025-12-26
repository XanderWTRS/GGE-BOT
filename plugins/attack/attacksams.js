const { isMainThread } = require('node:worker_threads')

const name = "Attack Samurai Camps"
    
if (isMainThread)
    return module.exports = {
        name: name,
        pluginOptions: [
            {
                type: "Select",
                label: "Event Difficulty",
                key: "eventDifficulty",
                selection: [
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
                default : 3
            },
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
            },
            {
                type: "Checkbox",
                label: "No chests",
                key: "noChests",
                default: false
            },
            {
                type: "Checkbox",
                label: "Use Coin",
                key: "useCoin",
                default: false
            }
        ]

    }

const { Types, getResourceCastleList, ClientCommands, areaInfoLock, AreaType, spendSkip, getEventList } = require('../../protocols')
const { waitToAttack, getAttackInfo, assignUnit, getTotalAmountToolsFlank, getTotalAmountToolsFront, getAmountSoldiersFlank, getAmountSoldiersFront, getMaxUnitsInReinforcementWave } = require("./attack")
const { movementEvents, waitForCommanderAvailable, freeCommander, useCommander } = require("../commander")
const { sendXT, waitForResult, xtHandler, events, playerInfo, botConfig } = require("../../ggebot")
const { getCommanderStats } = require("../../getEquipment")
const eventsDifficulties = require("../../items/eventAutoScalingDifficulties.json")
const pluginOptions = Object.assign(structuredClone(
    botConfig.plugins[require('path').basename(__filename).slice(0, -3)] ?? {}),
    botConfig.plugins["attack"] ?? {})

const kid = 0
const type = AreaType.samCamp

const eventAutoScalingCamps = require("../../items/eventAutoScalingCamps.json")
const units = require("../../items/units.json")
const pretty = require('pretty-time')
const getAreaCached = require("../../getmap")

const minTroopCount = 100
const eventID = 80

events.once("load", async () => {
    const sei = await getEventList()
    const eventInfo = sei.E.find(e => e.EID == eventID)

    if (eventInfo == undefined)
        return console.warn(`${name} Event not running`)

    if (eventInfo.EDID == -1) {
        const eventDifficultyID = 
            Number(eventsDifficulties.find(e => 
                (pluginOptions.eventDifficulty + 1) == e.difficultyTypeID && e.eventID == eventID)
                .difficultyID)
                
        sendXT("sede", JSON.stringify({ EID: eventID, EDID: eventDifficultyID, C2U: 0 }))
    }

    const skipTarget = async (AI) => {
        while (AI.extraData[2] > 0) {
            let skip = spendSkip(AI.extraData[2])

            if (skip == undefined)
                throw new Error("Couldn't find skip")

            sendXT("msd", JSON.stringify({ X: AI.x, Y: AI.y, MID: -1, NID: -1, MST: skip, KID: `${kid}` }))
            let [obj, result] = await waitForResult("msd", 7000, (obj, result) => {
                return result != 0 || 
                    Types.GAAAreaInfo(obj.AI).type == type })

            if (Number(result) != 0)
                break

            Object.assign(AI, Types.GAAAreaInfo(obj.AI))
        }
    }

    xtHandler.on("cat", (obj, result) => {
        if (result != 0)
            return

        let attackSource = obj.A.M.SA

        if (attackSource[0] != type)
            return

        skipTarget(Types.GAAAreaInfo(attackSource))
    })
    const sourceCastleArea = (await getResourceCastleList()).castles.find(e => e.kingdomID == kid)
        .areaInfo.find(e => AreaType.mainCastle == e.type);
    let gaa = await getAreaCached(kid,
        sourceCastleArea.x - 50, sourceCastleArea.y - 50,
        sourceCastleArea.x + 50, sourceCastleArea.y + 50)

    let areaInfo = gaa.areaInfo.filter(ai => ai.type == type)
        .sort((a, b) => Math.sqrt(Math.pow(sourceCastleArea.x - a.x, 2) + Math.pow(sourceCastleArea.y - a.y, 2)) -
            Math.sqrt(Math.pow(sourceCastleArea.x - b.x, 2) + Math.pow(sourceCastleArea.y - b.y, 2)))
        .sort((a, b) => a.extraData[6] - b.extraData[6])
    let quit = false
    while (!quit) {
        let comList = undefined
        if (![, "", "0"].includes(pluginOptions.commanderWhiteList)) {
            const [start, end] = pluginOptions.commanderWhiteList.split("-").map(Number).map(a => a - 1);
            comList = Array.from({ length: end - start + 1 }, (_, i) => start + i);
        }

        const commander = await waitForCommanderAvailable(comList)
        try {
            const attackInfo = await waitToAttack(async () => {
                const sourceCastle = (await ClientCommands.getDetailedCastleList()())
                    .castles.find(a => a.kingdomID == kid)
                    .areaInfo.find(a => a.areaID == sourceCastleArea.extraData[0])

                const AI = areaInfo.shift()

                areaInfo.push(AI)

                Object.assign(AI, (await ClientCommands.getAreaInfo(kid, AI.x, AI.y, AI.x, AI.y)()).areaInfo[0])


                await skipTarget(AI)

                const level = 
                    Number(eventAutoScalingCamps.find(obj => 
                        AI.extraData[5] == obj.eventAutoScalingCampID).camplevel)
                const attackInfo = getAttackInfo(kid, sourceCastleArea, AI, commander, level)

                if (pluginOptions.useCoin)
                    attackInfo.HBW = 1007

                const attackerMeleeTroops = []
                const attackerRangeTroops = []
                const attackerSamuraiTools = []
                const attackerWallSamuraiTools = []
                const attackerGateSamuraiTools = []
                const attackerShieldSamuraiTools = []

                for (let i = 0; i < sourceCastle.unitInventory.length; i++) {
                    const unit = sourceCastle.unitInventory[i];
                    const unitInfo = units.find(obj => unit.unitID == obj.wodID)
                    if (unitInfo == undefined)
                        continue

                    else if (unitInfo.samuraiTokenBooster != undefined) {
                        if (unitInfo.gateBonus)
                            attackerGateSamuraiTools.push([unitInfo, unit.ammount])
                        else if (unitInfo.wallBonus)
                            attackerWallSamuraiTools.push([unitInfo, unit.ammount])
                        else if (unitInfo.defRangeBonus)
                            attackerShieldSamuraiTools.push([unitInfo, unit.ammount])
                        else
                            attackerSamuraiTools.push([unitInfo, unit.ammount])
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

                attackerSamuraiTools.sort((a, b) =>
                    Number(b[0].khanTabletBooster) - Number(a[0].khanTabletBooster))
                attackerGateSamuraiTools.sort((a, b) =>
                    Number(b[0].khanTabletBooster) - Number(a[0].khanTabletBooster))
                attackerWallSamuraiTools.sort((a, b) =>
                    Number(b[0].khanTabletBooster) - Number(a[0].khanTabletBooster))
                attackerShieldSamuraiTools.sort((a, b) =>
                    Number(b[0].khanTabletBooster) - Number(a[0].khanTabletBooster))

                if (pluginOptions.lowValueChests) {
                    attackerSamuraiTools.reverse()
                    attackerGateSamuraiTools.reverse()
                    attackerWallSamuraiTools.reverse()
                    attackerShieldSamuraiTools.reverse()
                }

                attackInfo.A.forEach((wave, index) => {
                    const maxToolsFlank = getTotalAmountToolsFlank(level, 0)
                    const maxToolsFront = getTotalAmountToolsFront(level)

                    const desiredToolCount = attackerSamuraiTools.length == 0 ? 20 : 10
                    const commanderStats = getCommanderStats(commander)
                    const maxTroopFront = getAmountSoldiersFront(level) * 1 + (commanderStats.relicAttackUnitAmountFront ?? 0) / 100
                    const maxTroopFlank = getAmountSoldiersFlank(level) * 1 + (commanderStats.relicAttackUnitAmountFlank ?? 0) / 100

                    let maxTools = maxToolsFlank
                    if (index == 0) {
                        wave.L.T.forEach((unitSlot, i) =>
                            maxTools -= assignUnit(unitSlot, i == 0 ?
                                attackerWallSamuraiTools : attackerShieldSamuraiTools, Math.min(maxTools, desiredToolCount)))

                        maxTools = maxToolsFlank
                        wave.R.T.forEach((unitSlot, i) =>
                            maxTools -= assignUnit(unitSlot, i == 0 ?
                                attackerWallSamuraiTools : attackerShieldSamuraiTools, Math.min(maxTools, desiredToolCount)))

                        maxTools = maxToolsFront
                        wave.M.T.forEach((unitSlot, i) =>
                            maxTools -= assignUnit(unitSlot, i == 0 ? attackerWallSamuraiTools :
                                i == 1 ? attackerGateSamuraiTools : attackerShieldSamuraiTools, Math.min(maxTools, desiredToolCount)))

                        let maxTroops = maxTroopFlank

                        wave.L.U.forEach((unitSlot, i) =>
                            maxTroops -= assignUnit(unitSlot, attackerRangeTroops.length <= 0 ?
                                attackerMeleeTroops : attackerRangeTroops, maxTroops))
                        maxTroops = maxTroopFlank
                        wave.R.U.forEach((unitSlot, i) =>
                            maxTroops -= assignUnit(unitSlot, attackerRangeTroops.length <= 0 ?
                                attackerMeleeTroops : attackerRangeTroops, maxTroops))
                        maxTroops = maxTroopFront
                        wave.M.U.forEach((unitSlot, i) =>
                            maxTroops -= assignUnit(unitSlot, attackerRangeTroops.length <= 0 ?
                                attackerMeleeTroops : attackerRangeTroops, maxTroops))

                        attackerMeleeTroops.sort((a, b) => Number(a[0].meleeAttack) - Number(b[0].meleeAttack))
                        attackerRangeTroops.sort((a, b) => Number(a[0].rangeAttack) - Number(b[0].rangeAttack))
                    }
                    else if(!pluginOptions.noChests) {
                        const selectTool = i => {
                            let tools = attackerSamuraiTools
                            if (tools.length == 0) {
                                if (i == 0) {
                                    tools = attackerWallSamuraiTools
                                    if (tools.length == 0)
                                        tools = attackerShieldSamuraiTools
                                }
                                else if (i == 1) {
                                    tools = attackerShieldSamuraiTools
                                    if (tools.length == 0)
                                        tools = attackerWallSamuraiTools
                                }
                                if (i == 2) {
                                    tools = attackerGateSamuraiTools
                                    if (tools.length == 0)
                                        tools = attackerWallSamuraiTools
                                    if (tools.length == 0)
                                        tools = attackerShieldSamuraiTools
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
                    }
                });
                let maxTroops = getMaxUnitsInReinforcementWave(playerInfo.level, level)
                attackInfo.RW.forEach(unitSlot =>
                    maxTroops -= assignUnit(unitSlot, attackerRangeTroops.length <= 0 ?
                        attackerMeleeTroops : attackerRangeTroops,
                        maxTroops))

                await areaInfoLock(() => sendXT("cra", JSON.stringify(attackInfo)))

                let [obj, r] = await waitForResult("cra", 6000, (obj, result) => {
                    if (result != 0)
                        return true

                    if (obj.AAM.M.KID != kid || obj.AAM.M.TA[1] != AI.x || obj.AAM.M.TA[2] != AI.y)
                        return false
                    return true
                })
                return {...obj, result: r}
            })

            if (!attackInfo) {
                freeCommander(commander.lordID)
                return false
            }
            if(attackInfo.result != 0) 
                throw err[attackInfo.result]
            
            console.info(`[${name}] Hitting target C${attackInfo.AAM.UM.L.VIS + 1} ${attackInfo.AAM.M.TA[1]}:${attackInfo.AAM.M.TA[2]} ${pretty(Math.round(1000000000 * Math.abs(Math.max(0, attackInfo.AAM.M.TT - attackInfo.AAM.M.PT))), 's') + " till impact"}`)
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
                    break
                default:
                    console.error(e)
                    quit = true
            }
        }
    }
})