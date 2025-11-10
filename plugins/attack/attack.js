const { isMainThread } = require('node:worker_threads')
const name = "Attack"
if (isMainThread) {
    module.exports = {
        name: name,
        description: "Handles Hits",
        force: true,
        pluginOptions: [
            {
                type: "Checkbox",
                label: "Use Coin",
                key: "useCoin",
                default: false
            },
            {
                type: "Text",
                label: "Com White List",
                key: "commanderWhiteList"
            },
            {
                type: "Text",
                label: "Attack Delay (Seconds)",
                key: "attackDelay",
                default: "4.8"
            },
            {
                type: "Text",
                label: "Attack Delay Randomization (Seconds)",
                key: "attackDelayRand",
                default: "3"
            },
        ]
    }
    return
}

const { botConfig, xtHandler, sendXT, waitForResult } = require("../../ggebot")
const fs = require("fs/promises")
const { RateLimiter } = require("limiter")
const EventEmitter = require("events")

const commander = require("../commander")
const playerid = require("../playerid")
const { getCommanderStats } = require("../../getEquipment")
const { kingdomLock, AreaType, areaInfoLock, ClientCommands, getResourceCastleList } = require("../../protocols")
function getKingdomOffset(e) {
    var t = 0;
    switch (e) {
        case 0:
            t = 1;
            break;
        case 2:
            t = 20;
            break;
        case 1:
            t = 35;
            break;
        case 3:
            t = 45
    }
    return t
}
function getLevel(e, t, id) {
    if (t == 4 && id == 25) {
        let toLevel = {
            7: 60,
            8: 70,
            9: 80,
            10: 40,
            11: 50,
            12: 60,
            13: 70,
            14: 80,
        }

        return toLevel[e]
    }
    if (id == 11 && t == 1) {
        return 44
    }
    if (id == 11 && t == 2) {
        return 20
    }

    var n = getKingdomOffset(t);
    return (0 | Math.floor(1.9 * Math.pow(Math.abs(e), .555))) + n
}
function getTotalAmountToolsFlank(e, t) {
    return getTotalAmountTools(0, e, t)
}
function getTotalAmountToolsMiddle(e) {
    return getTotalAmountTools(1, e, 0)
}
function getTotalAmountTools(e, t, n) {
    return 1 === e ? t < 11 ? 10 : t < 37 ? 20 : t < 50 ? 30 : t < 69 ? 40 : 50 : t < 37 ? 10 : t < 50 ? 20 : t < 69 ? 30 : 0 | Math.ceil(40 + n)
}

/*
i.areaType == u.WorldConst.AREA_TYPE_CAPITAL ? 
    : 
    if(areaType == AREA_TYPE_CAPITAL)
        this._waves.push(new o.CastleAttackWaveVO(e,p.CastleModel.landmark.capitalLandmark.minDefenseLevel,i)) 
    else if(areaType == AREA_TYPE_CAPITAL)
        this._waves.push(new o.CastleAttackWaveVO(e,p.CastleModel.landmark.metroLandmark.minDefenseLevel,i))
    else if(areaType == AREA_TYPE_KINGS_TOWER)
        this._waves.push(new o.CastleAttackWaveVO(e,l.OutpostConst.KINGS_TOWER_DEFAULT_LEVEL,i)) 
    else if(areaType == AREA_TYPE_MONUMENT)
        this._waves.push(new o.CastleAttackWaveVO(e,l.OutpostConst.MONUMENT_DEFAULT_LEVEL,i)) 
    else if(areaType == AREA_TYPE_LABORATORY)
        this._waves.push(new o.CastleAttackWaveVO(e,l.OutpostConst.LABORATORY_DEFAULT_LEVEL,i)) 
    else
        this._waves.push(new o.CastleAttackWaveVO(e,0,i))
        const waveUnlockLevelList = [0, 13, 26, 51]
        getMaxWaveCount = function(e) {
            for (var n = 1, i = waveUnlockLevelList.length - 1; i >= 0; i--)
                if (e >= waveUnlockLevelList[i]) {
                    n = i + 1;
                    break
                }
            return n
        }
        ,
        CombatConst.getMaxWaveCountWithBonus = function(e, t, n) {
            return CombatConst.getMaxWaveCount(e, t) + n
        }
*/

function getMaxAttackers(targetLevel) {
    let t = 320;
    return targetLevel <= 69 && (t = Math.min(260, 5 * targetLevel + 8)), t
}
const getAmountSoldiersFlank = e => Math.floor(0 | Math.ceil(.2 * getMaxAttackers(e)))
const getAmountSoldiersMiddle = e => Math.floor(0 | Math.ceil(getMaxAttackers(e) - 2 * getAmountSoldiersFlank(e)))
const getMaxUnitsInReinforcementWave = function (playerlevel, targetLevel) {
    var a = 20 * Math.sqrt(playerlevel) + 50 + 20 * targetLevel;
    return 0 | Math.round(a)
}
/*
    Actually know how many waves it has
    
    Ability to say what it should use first strongest ect

    filling waves with presets
*/

let campRageNeeded = undefined
let playerLevel = undefined
xtHandler.on("gxp", obj => {
    playerLevel = obj.LVL + obj.LL
})
xtHandler.on("rpr", (obj) => {
    if (obj.EID != 72)
        return
    let rage = obj.PCRP
    if (rage >= campRageNeeded) {
        if (rage > campRageNeeded) {
            console.warn(`[${name}] Rage is higher than expected`)
        }
        console.info(`[${name}] Rage trigger`)
        sendXT("lta", JSON.stringify({ "AV": 0, "EID": 72 }))
    }
})
let eventAutoScalingCamps = undefined
xtHandler.on("cra", async (obj, r) => {
    if (r != 0)
        return false

    if (obj.AAM.M.TA[0] != 35)
        return false
    if(!eventAutoScalingCamps)
        eventAutoScalingCamps = JSON.parse((await fs.readFile("./items/eventAutoScalingCamps.json")).toString())

    campRageNeeded = eventAutoScalingCamps.find(obj2 => obj.AAM.M.TA[9] == obj2.eventAutoScalingCampID).playerRageCap
})

const pluginOptions = botConfig.plugins[require('path').basename(__filename).slice(0, -3)] ??= {}

const limiter = new RateLimiter({
    tokensPerInterval: 1,
    interval: 4500
});

function randomIntFromInterval(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}
const attack = (SX, SY, TX, TY, kid, tools, waves, options) => {
    let eventEmitter = new EventEmitter();
    setImmediate(async () => {
        let rangeArray = undefined
        if (pluginOptions.commanderWhiteList && pluginOptions.commanderWhiteList != "") {
            const [start, end] = pluginOptions.commanderWhiteList.split("-").map(Number).map(a => a - 1);
            rangeArray = Array.from({ length: end - start + 1 }, (_, i) => start + i);
        }
        let comList = options?.commanderWhiteList ? options.commanderWhiteList : rangeArray

        let LID = undefined

        let attackTarget = {
            "SX": SX,
            "SY": SY,
            "TX": TX,
            "TY": TY,
            "KID": kid,
            "LID": LID,
            "WT": 0,
            "HBW": -1,
            "BPC": 0,
            "ATT": 0,
            "AV": 0,
            "LP": 3,
            "FC": 0,
            "PTT": 1,
            "SD": 0,
            "ICA": 0,
            "CD": 99,
            "A": [],
            "BKS": [],
            "AST": [
                -1,
                -1,
                -1
            ],
            "RW": [
                [
                    -1,
                    0
                ],
                [
                    -1,
                    0
                ],
                [
                    -1,
                    0
                ],
                [
                    -1,
                    0
                ],
                [
                    -1,
                    0
                ],
                [
                    -1,
                    0
                ],
                [
                    -1,
                    0
                ],
                [
                    -1,
                    0
                ]
            ],
            "ASCT": 0
        }
        try {
            let command = ""
            if (options?.abi)
                command = "abi"
            else if (options?.aci)
                command = "aci"
            else if (options?.acc) {
                command = "acc"
                attackTarget.AV = 1
                attackTarget.ICA = 1
            }
            else
                command = "adi"
            let ai = undefined
            let commanders = undefined
            if (!options.ai) {
                console.warn("Legacy tech used")
                await areaInfoLock(() => {
                    sendXT(command, JSON.stringify({ "SX": SX, "SY": SY, "TX": TX, "TY": TY, "KID": kid }))
                })
                var [obj, _] = await waitForResult(command, 7000, (obj, result) => {
                    if (result != 0)
                        return false

                    if (!obj.gaa) {

                    }

                    if (obj.KID != kid || obj.gaa.AI[1] != TX || obj.gaa.AI[2] != TY)
                        return false
                    return true
                })
                ai = obj.gaa.AI
                commanders = obj.gli.C
            }
            else {
                ai = options.ai
                commanders = await commander.gli()
            }

            let hasShieldMadiens = false
            
            LID = attackTarget.LID = await commander.waitForCommanderAvailable(comList, LID => {
                if (ai[0] != AreaType.watchTower)
                    return true

                let com = commanders.find(e => e.ID == LID)
                try {
                    hasShieldMadiens = false
                    com.EQ[3][5].every(([id, effectarray]) => {
                        if (id != 121)
                            return true
                        hasShieldMadiens = true
                        return false
                    })
                }
                catch (e) {
                    console.warn(e)
                }
                return hasShieldMadiens
            })

            let com = commanders.find(e => e.ID == LID)
            if (ai[0] != AreaType.watchTower) {
                let eq = com.EQ[3]
                if(eq != undefined)
                   eq[5].every(([id, effectarray]) => {
                        if (id != 121)
                            return true
                        hasShieldMadiens = true
                        return false
                    })
            }

            if (!waves) {
                const waveUnlockLevelList = [0, 13, 26, 51]
                let getMaxWaveCount = function (e) {
                    for (var n = 1, i = waveUnlockLevelList.length - 1; i >= 0; i--)
                        if (e >= waveUnlockLevelList[i]) {
                            n = i + 1;
                            break
                        }
                    return n
                }
                waves ??= getMaxWaveCount(playerLevel)

                try {
                    com.EQ[4][5].forEach(([id, effectarray]) => {
                        if (id != 21)
                            return
                        waves += effectarray[0]
                    })
                }
                catch {

                }
            }
            if(pluginOptions.useCoin && ai[0] == AreaType.watchTower) {
                attackTarget.PTT = 0
            }
            else if (pluginOptions.useCoin && ai[0] != 11) {
                attackTarget.HBW = ai[0] == 25 ? 1030 : 1007
            }

            attackTarget.LP = ai[0] == 25 ? 3 : 0
            let lvl = options?.lvl

            const eventAutoScalingCamps = JSON.parse((await fs.readFile("./items/eventAutoScalingCamps.json")).toString())

            if (ai[0] == 2)
                lvl = getLevel(ai[4], kid, ai[0])
            else if (ai[0] == 11)
                lvl = getLevel(ai[4], kid, ai[0])
            else if (ai[0] == 25)
                lvl = getLevel(ai[5], kid, ai[0])
            else if (ai[0] == 17)
                lvl = 60
            else if (ai[0] == 27)
                lvl = eventAutoScalingCamps.find(obj => ai[8] == obj.eventAutoScalingCampID).camplevel
            else if (ai[0] == 29)
                lvl = eventAutoScalingCamps.find(obj => ai[8] == obj.eventAutoScalingCampID).camplevel
            else if (ai[0] == 35)
                lvl = eventAutoScalingCamps.find(obj => ai[9] == obj.eventAutoScalingCampID).camplevel
            else if (ai[0] == 30)
                lvl = 70
            if (lvl == undefined)
                throw "Level is undefined"

            for (let i = 0; i < waves; i++) {
                const LEVELS_LEFTWALL_TOOLS = [0, 37]
                const LEVELS_LEFTWALL_UNITS = [0, 13]
                const LEVELS_MIDDLEWALL_TOOLS = [0, 11, 37]
                const LEVELS_MIDDLEWALL_UNITS = [0, 0, 13, 13, 26, 26]
                const LEVELS_RIGHTWALL_TOOLS = [0, 37]
                const LEVELS_RIGHTWALL_UNITS = [0, 13]
                const unitSlot = [-1, 0];
                let wave = {
                    "L": {
                        "T": [],
                        "U": []
                    },
                    "R": {
                        "T": [],
                        "U": []
                    },
                    "M": {
                        "T": [],
                        "U": []
                    }
                }
                let func = (wallLevelRequirement, row) => {
                    wallLevelRequirement.every(e => {
                        if (e > lvl)
                            return false
                        row.push(structuredClone(unitSlot))
                        return true
                    })
                }
                func(LEVELS_LEFTWALL_TOOLS, wave.L.T)
                func(LEVELS_LEFTWALL_UNITS, wave.L.U)
                func(LEVELS_MIDDLEWALL_TOOLS, wave.M.T)
                func(LEVELS_MIDDLEWALL_UNITS, wave.M.U)
                func(LEVELS_RIGHTWALL_TOOLS, wave.R.T)
                func(LEVELS_RIGHTWALL_UNITS, wave.R.U)
                attackTarget.A.push(structuredClone(wave))
            }
            let troopCount = 0
            let attackerMeleeTroops = []
            let attackerRangeTroops = []
            let attackerSamuraiTools = []

            let attackerWallSamuraiTools = []
            let attackerGateSamuraiTools = []
            let attackerShieldSamuraiTools = []

            let attackerNomadTools = []
            let attackerWallNomadTools = []
            let attackerGateNomadTools = []
            let attackerShieldNomadTools = []
            let attackerBannerKhanTools = []


            let attackerBeriTools = []
            let attackerWallBeriTools = []
            let attackerGateBeriTools = []
            let attackerShieldBeriTools = []

            const units = JSON.parse((await fs.readFile("./items/units.json")).toString())
            let resourceCastleList = await getResourceCastleList()
            let dcl = await ClientCommands.getDetailedCastleList()()
             let areaID = resourceCastleList.castles.find(e => e.kingdomID == kid)
                        .areaInfo.find(e => [AreaType.externalKingdom,AreaType.mainCastle, 15].includes(e.type))
                        .extraData[0]
            let sourceCastle = dcl.castles.find(a => a.kingdomID == kid)
                .areaInfo.find(a => a.areaID == areaID)

            
            
            for (let i = 0; i < sourceCastle.unitInventory.length; i++) {
                const unit = sourceCastle.unitInventory[i];
                let unitInfo = units.find(obj => unit.unitID == obj.wodID)
                if (unitInfo == undefined)
                    continue
                else if (unitInfo.samuraiTokenBooster != undefined) {
                    if (unitInfo.gateBonus) {
                        attackerGateSamuraiTools.push([unitInfo, unit.ammount])
                        continue
                    }
                    if (unitInfo.wallBonus) {
                        attackerWallSamuraiTools.push([unitInfo, unit.ammount])
                        continue
                    }
                    if (unitInfo.defRangeBonus) {
                        attackerShieldSamuraiTools.push([unitInfo, unit.ammount])
                        continue
                    }

                    attackerSamuraiTools.push([unitInfo, unit.ammount])
                    continue
                }
                else if (unitInfo.ragePointBonus != undefined) {
                    let val = unitInfo.khanTabletBooster
                    val ??= 0
                    unitInfo.ragePointBonus += val
                    attackerBannerKhanTools.push([unitInfo, unit.ammount])
                    continue
                }
                else if (unitInfo.khanTabletBooster != undefined) {
                    if (unitInfo.gateBonus) {
                        attackerGateNomadTools.push([unitInfo, unit.ammount])
                        continue
                    }
                    if (unitInfo.wallBonus) {
                        attackerWallNomadTools.push([unitInfo, unit.ammount])
                        continue
                    }
                    if (unitInfo.defRangeBonus) {
                        attackerShieldNomadTools.push([unitInfo, unit.ammount])
                        continue
                    }

                    attackerNomadTools.push([unitInfo, unit.ammount])
                    continue
                }
                else if (unitInfo.pointBonus != undefined) {
                    if (unitInfo.gateBonus) {
                        attackerGateBeriTools.push([unitInfo, unit.ammount])
                        continue
                    }
                    if (unitInfo.wallBonus) {
                        attackerWallBeriTools.push([unitInfo, unit.ammount])
                        continue
                    }
                    if (unitInfo.defRangeBonus) {
                        attackerShieldBeriTools.push([unitInfo, unit.ammount])
                        continue
                    }

                    attackerBeriTools.push([unitInfo, unit.ammount])
                    continue
                }
                if (unitInfo.fightType == undefined)
                    continue

                if (unitInfo.fightType == 0) {
                    if (unitInfo.role == "melee") {
                        attackerMeleeTroops.push([unitInfo, unit.ammount])
                    }
                    else if (unitInfo.role == "ranged") {
                        attackerRangeTroops.push([unitInfo, unit.ammount])
                    }
                }
            }

            let allTroopCount = 0

            attackerRangeTroops.find(e => allTroopCount += e[1])
            attackerMeleeTroops.find(e => allTroopCount += e[1])
            

            attackerSamuraiTools.sort((a, b) => Number(b[0].samuraiTokenBooster) - Number(a[0].samuraiTokenBooster))
            if (options?.lowValueChests) {
                attackerSamuraiTools.reverse()
            }
            attackerGateSamuraiTools.sort((a, b) => Number(b[0].samuraiTokenBooster) - Number(a[0].samuraiTokenBooster))
            attackerWallSamuraiTools.sort((a, b) => Number(b[0].samuraiTokenBooster) - Number(a[0].samuraiTokenBooster))
            attackerShieldSamuraiTools.sort((a, b) => Number(b[0].samuraiTokenBooster) - Number(a[0].samuraiTokenBooster))

            attackerNomadTools.sort((a, b) => Number(b[0].khanTabletBooster) - Number(a[0].khanTabletBooster))
            if (options?.lowValueChests) {
                attackerNomadTools.reverse()
            }
            attackerGateNomadTools.sort((a, b) => Number(b[0].khanTabletBooster) - Number(a[0].khanTabletBooster))
            attackerWallNomadTools.sort((a, b) => Number(b[0].khanTabletBooster) - Number(a[0].khanTabletBooster))
            attackerShieldNomadTools.sort((a, b) => Number(b[0].khanTabletBooster) - Number(a[0].khanTabletBooster))

            attackerBannerKhanTools.sort((a, b) => Number(b[0].ragePointBonus) - Number(a[0].ragePointBonus))
            if (options?.lowValueChests) {
                attackerBannerKhanTools.reverse()
            }
            attackerBeriTools.sort((a, b) => Number(b[0].pointBonus) - Number(a[0].pointBonus))
            if (options?.lowValueChests) {
                attackerBeriTools.reverse()
            }
            attackerGateBeriTools.sort((a, b) => Number(b[0].pointBonus) - Number(a[0].pointBonus))
            attackerWallBeriTools.sort((a, b) => Number(b[0].pointBonus) - Number(a[0].pointBonus))
            attackerShieldBeriTools.sort((a, b) => Number(b[0].pointBonus) - Number(a[0].pointBonus))


            attackerMeleeTroops.sort((a, b) => Number(a[0].meleeAttack) - Number(b[0].meleeAttack))
            attackerRangeTroops.sort((a, b) => Number(a[0].rangeAttack) - Number(b[0].rangeAttack))
            let commanderStats = getCommanderStats(com)

            attackTarget.A.forEach((wave, i) => {
                let maxTroopAmmountMiddle = getAmountSoldiersMiddle(lvl)
                let maxTroopAmmountFlank = getAmountSoldiersFlank(lvl)
                
                let setupFlank = units => {
                    let isMelee = (i != 0 && ai[0] != 11) || (ai[0] == 11 && attackerMeleeTroops[0] && attackerMeleeTroops[0][0].wodID == 277)
                    let attackerTroop = isMelee ? attackerMeleeTroops[0] : attackerRangeTroops[0];
                    let attackerTroopAlt = !isMelee ? attackerMeleeTroops[0] : attackerRangeTroops[0];
                    if (attackerTroop == undefined) {
                        isMelee = !isMelee
                        attackerTroop = attackerTroopAlt
                    }

                    if (attackerTroop == undefined)
                        return

                    let unitType = attackerTroop[0].wodID
                    let unitAmmount = Math.min(attackerTroop[1], maxTroopAmmountFlank)

                    maxTroopAmmountFlank -= unitAmmount
                    attackerTroop[1] -= unitAmmount

                    if (attackerTroop[1] <= 0)
                        (isMelee ? attackerMeleeTroops : attackerRangeTroops).shift()

                    troopCount += unitAmmount
                    if (unitAmmount <= 0)
                        return
                    units[0] = unitType
                    units[1] = unitAmmount
                }
                let setupMiddle = units => {
                    let isMelee = false
                    let attackerTroop = isMelee ? attackerMeleeTroops[0] : attackerRangeTroops[0];
                    let attackerTroopAlt = !isMelee ? attackerMeleeTroops[0] : attackerRangeTroops[0];
                    if (attackerTroop == undefined) {
                        isMelee = !isMelee
                        attackerTroop = attackerTroopAlt
                    }

                    if (attackerTroop == undefined)
                        return

                    let unitType = attackerTroop[0].wodID
                    let unitAmmount = Math.min(attackerTroop[1], maxTroopAmmountMiddle)

                    maxTroopAmmountMiddle -= unitAmmount
                    attackerTroop[1] -= unitAmmount

                    if (attackerTroop[1] <= 0)
                        (isMelee ? attackerMeleeTroops : attackerRangeTroops).shift()

                    troopCount += unitAmmount
                    if (unitAmmount <= 0)
                        return
                    units[0] = unitType
                    units[1] = unitAmmount
                }
                wave.L.U.forEach(setupFlank)
                maxTroopAmmountFlank = getAmountSoldiersFlank(lvl)

                
                if ((!hasShieldMadiens || ai[0] != 11) && !options?.oneFlank)
                    wave.R.U.forEach(setupFlank)
                if (ai[0] != 11 && !options?.oneFlank)
                    wave.M.U.forEach(setupMiddle)
                if (i == 0) {
                    if (ai[0] == 27) {
                        let maxToolsLeftFlank = getTotalAmountToolsFlank(lvl, 0)

                        wave.L.T.forEach((units, i) => {
                            let attackerTroop = i == 0 ? attackerWallNomadTools[0] : attackerShieldNomadTools[0]
                            if (attackerTroop == undefined)
                                throw i == 0 ? Error("Ran out of Wall tools") : Error("Ran out of Shield tools")

                            let unitType = attackerTroop[0].wodID
                            let unitAmmount = Math.min(attackerTroop[1], Math.min(maxToolsLeftFlank, 10))
                            maxToolsLeftFlank -= unitAmmount
                            attackerTroop[1] -= unitAmmount
                            if (attackerTroop[1] <= 0) {
                                (i == 0 ? attackerWallNomadTools : attackerShieldNomadTools).shift()
                            }
                            if (unitAmmount <= 0)
                                return
                            units[0] = unitType
                            units[1] = unitAmmount
                        })
                        let maxToolsRightFlank = getTotalAmountToolsFlank(lvl, 0)

                        wave.R.T.forEach((units, i) => {
                            let attackerTroop = i == 0 ? attackerWallNomadTools[0] : attackerShieldNomadTools[0]
                            if (attackerTroop == undefined)
                                throw i == 0 ? Error("Ran out of Wall tools") : Error("Ran out of Shield tools")

                            let unitType = attackerTroop[0].wodID
                            let unitAmmount = Math.min(attackerTroop[1], Math.min(maxToolsRightFlank, 10))
                            maxToolsRightFlank -= unitAmmount
                            attackerTroop[1] -= unitAmmount
                            if (attackerTroop[1] <= 0) {
                                (i == 0 ? attackerWallNomadTools : attackerShieldNomadTools).shift()
                            }
                            if (unitAmmount <= 0)
                                return
                            units[0] = unitType
                            units[1] = unitAmmount
                        })
                        let maxToolsMiddleFlank = getTotalAmountToolsMiddle(lvl)
                        wave.M.T.forEach((units, i) => {
                            let attackerTroop = i == 0 ? attackerWallNomadTools[0] : i == 1 ? attackerShieldNomadTools[0] : attackerGateNomadTools[0]
                            if (attackerTroop == undefined)
                                throw i == 0 ? Error("Ran out of Wall tools") : i == 1 ? Error("Ran out of Shield tools") : Error("Ran out of Gate tools")

                            let unitType = attackerTroop[0].wodID
                            let unitAmmount = Math.min(attackerTroop[1], Math.min(maxToolsMiddleFlank, 10))
                            maxToolsMiddleFlank -= unitAmmount
                            attackerTroop[1] -= unitAmmount
                            if (attackerTroop[1] <= 0) {
                                (i == 0 ? attackerWallNomadTools : i == 1 ? attackerShieldNomadTools : attackerGateNomadTools).shift()
                            }
                            if (unitAmmount <= 0)
                                return
                            units[0] = unitType
                            units[1] = unitAmmount
                        })
                    }
                    else if (ai[0] == 35) {
                        let maxToolsLeftFlank = getTotalAmountToolsFlank(lvl, 0)

                        wave.L.T.forEach((units, i) => {
                            let attackerTroop = i == 0 ? attackerWallNomadTools[0] : attackerShieldNomadTools[0]
                            if (attackerTroop == undefined)
                                throw i == 0 ? Error("Ran out of Wall tools") : Error("Ran out of Shield tools")

                            let unitType = attackerTroop[0].wodID
                            let unitAmmount = Math.min(attackerTroop[1], Math.min(maxToolsLeftFlank, 10))
                            maxToolsLeftFlank -= unitAmmount
                            attackerTroop[1] -= unitAmmount
                            if (attackerTroop[1] <= 0) {
                                (i == 0 ? attackerWallNomadTools : attackerShieldNomadTools).shift()
                            }
                            if (unitAmmount <= 0)
                                return
                            units[0] = unitType
                            units[1] = unitAmmount
                        })
                        let maxToolsRightFlank = getTotalAmountToolsFlank(lvl, 0)

                        wave.R.T.forEach((units, i) => {
                            let attackerTroop = i == 0 ? attackerWallNomadTools[0] : attackerShieldNomadTools[0]
                            if (attackerTroop == undefined)
                                throw i == 0 ? Error("Ran out of Wall tools") : Error("Ran out of Shield tools")

                            let unitType = attackerTroop[0].wodID
                            let unitAmmount = Math.min(attackerTroop[1], Math.min(maxToolsRightFlank, 10))
                            maxToolsRightFlank -= unitAmmount
                            attackerTroop[1] -= unitAmmount
                            if (attackerTroop[1] <= 0) {
                                (i == 0 ? attackerWallNomadTools : attackerShieldNomadTools).shift()
                            }
                            if (unitAmmount <= 0)
                                return
                            units[0] = unitType
                            units[1] = unitAmmount
                        })
                        let maxToolsMiddleFlank = getTotalAmountToolsMiddle(lvl)
                        wave.M.T.forEach((units, i) => {
                            let attackerTroop = i == 0 ? attackerWallNomadTools[0] : i == 1 ? attackerShieldNomadTools[0] : attackerGateNomadTools[0]
                            if (attackerTroop == undefined)
                                throw i == 0 ? Error("Ran out of Wall tools") : i == 1 ? Error("Ran out of Shield tools") : Error("Ran out of Gate tools")

                            let unitType = attackerTroop[0].wodID
                            let unitAmmount = Math.min(attackerTroop[1], Math.min(maxToolsMiddleFlank, 10))
                            maxToolsMiddleFlank -= unitAmmount
                            attackerTroop[1] -= unitAmmount
                            if (attackerTroop[1] <= 0) {
                                (i == 0 ? attackerWallNomadTools : i == 1 ? attackerShieldNomadTools : attackerGateNomadTools).shift()
                            }
                            if (unitAmmount <= 0)
                                return
                            units[0] = unitType
                            units[1] = unitAmmount
                        })
                    }
                    else if (ai[0] == 29) {
                        let maxToolsLeftFlank = getTotalAmountToolsFlank(lvl, 0)

                        wave.L.T.forEach((units, i) => {
                            let attackerTroop = i == 0 ? attackerWallSamuraiTools[0] : attackerShieldSamuraiTools[0]
                            if (attackerTroop == undefined)
                                throw i == 0 ? Error("Ran out of Wall tools") : Error("Ran out of Shield tools")

                            let unitType = attackerTroop[0].wodID
                            let unitAmmount = Math.min(attackerTroop[1], Math.min(maxToolsLeftFlank, i == 0 ? 5 : 8))
                            maxToolsLeftFlank -= unitAmmount
                            attackerTroop[1] -= unitAmmount
                            if (attackerTroop[1] <= 0) {
                                (i == 0 ? attackerWallSamuraiTools : attackerShieldSamuraiTools).shift()
                            }
                            if (unitAmmount <= 0)
                                return
                            units[0] = unitType
                            units[1] = unitAmmount
                        })
                        let maxToolsRightFlank = getTotalAmountToolsFlank(lvl, 0)

                        wave.R.T.forEach((units, i) => {
                            let attackerTroop = i == 0 ? attackerWallSamuraiTools[0] : attackerShieldSamuraiTools[0]
                            if (attackerTroop == undefined)
                                throw i == 0 ? Error("Ran out of Wall tools") : Error("Ran out of Shield tools")

                            let unitType = attackerTroop[0].wodID
                            let unitAmmount = Math.min(attackerTroop[1], Math.min(maxToolsRightFlank, i == 0 ? 5 : 8))
                            maxToolsRightFlank -= unitAmmount
                            attackerTroop[1] -= unitAmmount
                            if (attackerTroop[1] <= 0) {
                                (i == 0 ? attackerWallSamuraiTools : attackerShieldSamuraiTools).shift()
                            }
                            if (unitAmmount <= 0)
                                return
                            units[0] = unitType
                            units[1] = unitAmmount
                        })
                        let maxToolsMiddleFlank = getTotalAmountToolsMiddle(lvl)
                        wave.M.T.forEach((units, i) => {
                            let attackerTroop = i == 0 ? attackerWallSamuraiTools[0] : i == 1 ? attackerShieldSamuraiTools[0] : attackerGateSamuraiTools[0]
                            if (attackerTroop == undefined)
                                throw i == 0 ? Error("Ran out of Wall tools") : i == 1 ? Error("Ran out of Shield tools") : Error("Ran out of Gate tools")

                            let unitType = attackerTroop[0].wodID
                            let unitAmmount = Math.min(attackerTroop[1], Math.min(maxToolsMiddleFlank, (i == 0 || i == 1) ? 5 : 8))
                            maxToolsMiddleFlank -= unitAmmount
                            attackerTroop[1] -= unitAmmount
                            if (attackerTroop[1] <= 0) {
                                (i == 0 ? attackerWallSamuraiTools : i == 1 ? attackerShieldSamuraiTools : attackerGateSamuraiTools).shift()
                            }
                            if (unitAmmount <= 0)
                                return
                            units[0] = unitType
                            units[1] = unitAmmount
                        })
                    }
                    else if (ai[0] == 30) {
                        let maxToolsLeftFlank = getTotalAmountToolsFlank(lvl, 0)

                        wave.L.T.forEach((units, i) => {
                            let attackerTroop = i == 0 ? attackerWallBeriTools[0] : attackerShieldBeriTools[0]
                            if (attackerTroop == undefined)
                                throw i == 0 ? Error("Ran out of Wall tools") : Error("Ran out of Shield tools")

                            let unitType = attackerTroop[0].wodID
                            let unitAmmount = Math.min(attackerTroop[1], Math.min(maxToolsLeftFlank, 10))
                            maxToolsLeftFlank -= unitAmmount
                            attackerTroop[1] -= unitAmmount
                            if (attackerTroop[1] <= 0) {
                                (i == 0 ? attackerWallBeriTools : attackerShieldBeriTools).shift()
                            }
                            if (unitAmmount <= 0)
                                return
                            units[0] = unitType
                            units[1] = unitAmmount
                        })
                        let maxToolsRightFlank = getTotalAmountToolsFlank(lvl, 0)

                        wave.R.T.forEach((units, i) => {
                            let attackerTroop = i == 0 ? attackerWallBeriTools[0] : attackerShieldBeriTools[0]
                            if (attackerTroop == undefined)
                                throw i == 0 ? Error("Ran out of Wall tools") : Error("Ran out of Shield tools")

                            let unitType = attackerTroop[0].wodID
                            let unitAmmount = Math.min(attackerTroop[1], Math.min(maxToolsRightFlank, 10))
                            maxToolsRightFlank -= unitAmmount
                            attackerTroop[1] -= unitAmmount
                            if (attackerTroop[1] <= 0) {
                                (i == 0 ? attackerWallBeriTools : attackerShieldBeriTools).shift()
                            }
                            if (unitAmmount <= 0)
                                return
                            units[0] = unitType
                            units[1] = unitAmmount
                        })
                        let maxToolsMiddleFlank = getTotalAmountToolsMiddle(lvl)
                        wave.M.T.forEach((units, i) => {
                            let attackerTroop = i == 0 ? attackerWallBeriTools[0] : i == 1 ? attackerShieldBeriTools[0] : attackerGateBeriTools[0]
                            if (attackerTroop == undefined)
                                throw i == 0 ? Error("Ran out of Wall tools") : i == 1 ? Error("Ran out of Shield tools") : Error("Ran out of Gate tools")

                            let unitType = attackerTroop[0].wodID
                            let unitAmmount = Math.min(attackerTroop[1], Math.min(maxToolsMiddleFlank, 10))
                            maxToolsMiddleFlank -= unitAmmount
                            attackerTroop[1] -= unitAmmount
                            if (attackerTroop[1] <= 0) {
                                (i == 0 ? attackerWallBeriTools : i == 1 ? attackerShieldBeriTools : attackerGateBeriTools).shift()
                            }
                            if (unitAmmount <= 0)
                                return
                            units[0] = unitType
                            units[1] = unitAmmount
                        })
                    }
                }

                else {
                    let maxTools = 0
                    const chestWaveFlank = units => {
                        let attackerTroop = options.toolsOnly ? attackerWallNomadTools[0] : attackerNomadTools[0]
                        attackerTroop ??= attackerWallNomadTools[0]
                        if (attackerTroop == undefined) {
                            throw Error("Ran out of Chests")
                        }

                        let unitType = attackerTroop[0].wodID
                        let unitAmmount = Math.min(attackerTroop[1], maxTools)
                        maxTools -= unitAmmount
                        attackerTroop[1] -= unitAmmount
                        if (attackerTroop[1] <= 0) {
                            if (attackerNomadTools[0])
                                attackerNomadTools.shift()
                            else
                                attackerWallNomadTools.shift()
                        }
                        if (unitAmmount <= 0)
                            return
                        units[0] = unitType
                        units[1] = unitAmmount
                    }
                    const chestWaveMiddle = units => {
                        let attackerTroop = options.toolsOnly ? attackerGateNomadTools[0] : attackerNomadTools[0]
                        attackerTroop ??= attackerGateNomadTools[0]
                        if (attackerTroop == undefined)
                            throw Error("Ran out of Chests")

                        let unitType = attackerTroop[0].wodID
                        let unitAmmount = Math.min(attackerTroop[1], maxTools)
                        maxTools -= unitAmmount
                        attackerTroop[1] -= unitAmmount
                        if (attackerTroop[1] <= 0) {
                            if (attackerNomadTools[0])
                                attackerNomadTools.shift()
                            else
                                attackerGateNomadTools.shift()

                        }
                        if (unitAmmount <= 0)
                            return
                        units[0] = unitType
                        units[1] = unitAmmount
                    }
                    if (ai[0] == 29 && !options?.noChests) {
                        let maxToolsLeftFlank = getTotalAmountToolsFlank(lvl, 0)

                        wave.L.T.forEach(units => {
                            let attackerTroop = options.toolsOnly ? attackerWallSamuraiTools[0] : attackerSamuraiTools[0]
                            if (attackerTroop == undefined)
                                throw Error("Ran out of Chests")

                            let unitType = attackerTroop[0].wodID
                            let unitAmmount = Math.min(attackerTroop[1], maxToolsLeftFlank)
                            maxToolsLeftFlank -= unitAmmount
                            attackerTroop[1] -= unitAmmount
                            if (attackerTroop[1] <= 0) {
                                if (attackerSamuraiTools[0])
                                    attackerSamuraiTools.shift()
                                else
                                    attackerWallSamuraiTools.shift()
                            }
                            if (unitAmmount <= 0)
                                return
                            units[0] = unitType
                            units[1] = unitAmmount
                        })
                        let maxToolsRightFlank = getTotalAmountToolsFlank(lvl, 0)

                        wave.R.T.forEach((units, i) => {
                            let attackerTroop = options.toolsOnly ? attackerShieldSamuraiTools[0] : attackerSamuraiTools[0]
                            if (attackerTroop == undefined)
                                throw Error("Ran out of Chests")

                            let unitType = attackerTroop[0].wodID
                            let unitAmmount = Math.min(attackerTroop[1], maxToolsRightFlank)
                            maxToolsRightFlank -= unitAmmount
                            attackerTroop[1] -= unitAmmount
                            if (attackerTroop[1] <= 0) {
                                if (attackerSamuraiTools[0])
                                    attackerSamuraiTools.shift()
                                else
                                    attackerShieldSamuraiTools.shift()
                            }
                            if (unitAmmount <= 0)
                                return
                            units[0] = unitType
                            units[1] = unitAmmount
                        })
                        let maxToolsMiddleFlank = getTotalAmountToolsMiddle(lvl)

                        wave.M.T.forEach((units, i) => {
                            let attackerTroop = options.toolsOnly ? attackerGateSamuraiTools[0] : attackerSamuraiTools[0]
                            if (attackerTroop == undefined)
                                throw Error("Ran out of Chests")

                            let unitType = attackerTroop[0].wodID
                            let unitAmmount = Math.min(attackerTroop[1], maxToolsMiddleFlank)
                            maxToolsMiddleFlank -= unitAmmount
                            attackerTroop[1] -= unitAmmount
                            if (attackerTroop[1] <= 0) {
                                if (attackerSamuraiTools[0])
                                    attackerSamuraiTools.shift()
                                else
                                    attackerGateSamuraiTools.shift()
                            }
                            if (unitAmmount <= 0)
                                return
                            units[0] = unitType
                            units[1] = unitAmmount
                        })
                    }
                    else if (ai[0] == 27 && !options?.noChests) {
                        maxTools = getTotalAmountToolsFlank(lvl, 0)
                        wave.L.T.forEach(chestWaveFlank)

                        maxTools = getTotalAmountToolsFlank(lvl, 0)
                        wave.R.T.forEach(chestWaveFlank)

                        maxTools = getTotalAmountToolsMiddle(lvl)
                        wave.M.T.forEach(chestWaveMiddle)
                    }
                    else if (ai[0] == 35) {
                        maxTools = getTotalAmountToolsFlank(lvl, 0)
                        const bannerWaveFlank = units => {
                            let attackerTroop = attackerBannerKhanTools[0]
                            if (attackerTroop == undefined)
                                throw Error("Ran out of Banners")

                            let unitType = attackerTroop[0].wodID
                            let unitAmmount = Math.min(attackerTroop[1], maxTools)
                            maxTools -= unitAmmount
                            attackerTroop[1] -= unitAmmount
                            if (attackerTroop[1] <= 0) {
                                attackerBannerKhanTools.shift()
                            }
                            if (unitAmmount <= 0)
                                return
                            units[0] = unitType
                            units[1] = unitAmmount
                        }
                        const bannerWaveMiddle = units => {
                            let attackerTroop = attackerBannerKhanTools[0]
                            if (attackerTroop == undefined)
                                throw Error("Ran out of Banners")

                            let unitType = attackerTroop[0].wodID
                            let unitAmmount = Math.min(attackerTroop[1], maxTools)
                            maxTools -= unitAmmount
                            attackerTroop[1] -= unitAmmount
                            if (attackerTroop[1] <= 0) {
                                attackerBannerKhanTools.shift()
                            }
                            if (unitAmmount <= 0)
                                return
                            units[0] = unitType
                            units[1] = unitAmmount
                        }

                        wave.L.T.forEach(options.wavesTillChests > i ? bannerWaveFlank : chestWaveFlank)
                        maxTools = getTotalAmountToolsFlank(lvl, 0)
                        wave.R.T.forEach(options.wavesTillChests > i ? bannerWaveFlank : chestWaveFlank)
                        maxTools = getTotalAmountToolsMiddle(lvl)
                        wave.M.T.forEach(options.wavesTillChests > i ? bannerWaveMiddle : chestWaveMiddle)
                    }
                    else if (ai[0] == 30 && !options?.noChests) {
                        let maxToolsLeftFlank = getTotalAmountToolsFlank(lvl, 0)

                        wave.L.T.forEach((units, i) => {
                            let attackerTroop = options.toolsOnly ? attackerWallBeriTools[0] : attackerBeriTools[0]
                            if (attackerTroop == undefined)
                                throw Error("Ran out of Chests")

                            let unitType = attackerTroop[0].wodID
                            let unitAmmount = Math.min(attackerTroop[1], maxToolsLeftFlank)
                            maxToolsLeftFlank -= unitAmmount
                            attackerTroop[1] -= unitAmmount
                            if (attackerTroop[1] <= 0) {
                                if (attackerBeriTools[0])
                                    attackerBeriTools.shift()
                                else
                                    attackerWallBeriTools.shift()
                            }
                            if (unitAmmount <= 0)
                                return
                            units[0] = unitType
                            units[1] = unitAmmount
                        })
                        let maxToolsRightFlank = getTotalAmountToolsFlank(lvl, 0)

                        wave.R.T.forEach((units, i) => {
                            let attackerTroop = options.toolsOnly ? attackerShieldBeriTools[0] : attackerBeriTools[0]
                            if (attackerTroop == undefined)
                                throw Error("Ran out of Chests")

                            let unitType = attackerTroop[0].wodID
                            let unitAmmount = Math.min(attackerTroop[1], maxToolsRightFlank)
                            maxToolsRightFlank -= unitAmmount
                            attackerTroop[1] -= unitAmmount
                            if (attackerTroop[1] <= 0) {
                                if (attackerBeriTools[0])
                                    attackerBeriTools.shift()
                                else
                                    attackerShieldBeriTools.shift()
                            }
                            if (unitAmmount <= 0)
                                return
                            units[0] = unitType
                            units[1] = unitAmmount
                        })
                        let maxToolsMiddleFlank = getTotalAmountToolsMiddle(lvl)

                        wave.M.T.forEach((units, i) => {
                            let attackerTroop = options.toolsOnly ? attackerGateBeriTools[0] : attackerBeriTools[0]
                            if (attackerTroop == undefined)
                                throw Error("Ran out of Chests")

                            let unitType = attackerTroop[0].wodID
                            let unitAmmount = Math.min(attackerTroop[1], maxToolsMiddleFlank)
                            maxToolsMiddleFlank -= unitAmmount
                            attackerTroop[1] -= unitAmmount
                            if (attackerTroop[1] <= 0) {
                                if (attackerBeriTools[0])
                                    attackerBeriTools.shift()
                                else
                                    attackerGateBeriTools.shift()
                            }
                            if (unitAmmount <= 0)
                                return
                            units[0] = unitType
                            units[1] = unitAmmount
                        })
                    }
                }
            })
            
            if (ai[0] == 35) {
                let maxTroops = getMaxUnitsInReinforcementWave(playerLevel,lvl)
                let setupCourtyard = units => {
                    let isMelee = false
                    let attackerTroop = isMelee ? attackerMeleeTroops[0] : attackerRangeTroops[0];
                    let attackerTroopAlt = !isMelee ? attackerMeleeTroops[0] : attackerRangeTroops[0];
                    if (attackerTroop == undefined) {
                        isMelee = !isMelee
                        attackerTroop = attackerTroopAlt
                    }

                    if (attackerTroop == undefined)
                        return

                    let unitType = attackerTroop[0].wodID
                    let unitAmmount = Math.min(attackerTroop[1], maxTroops)

                    maxTroops -= unitAmmount
                    attackerTroop[1] -= unitAmmount

                    if (attackerTroop[1] <= 0)
                        (isMelee ? attackerMeleeTroops : attackerRangeTroops).shift()

                    troopCount += unitAmmount
                    if (unitAmmount <= 0)
                        return
                    units[0] = unitType
                    units[1] = unitAmmount
                }
                
                attackTarget.RW.forEach(setupCourtyard)
            }
            if (tools) {
                attackTarget.A.forEach(wave => {
                    wave.L.T.forEach((_, i) => {
                        let tool = tools.L[i]
                        if (tool == undefined)
                            return
                        t = tool
                    })
                    if (!options.oneFlank)
                        wave.M.T.forEach((_, i) => {
                            let tool = tools.M[i]
                            if (tool == undefined)
                                return
                            t = tool
                        })
                    if (!options.oneFlank)
                        wave.R.T.forEach((_, i) => {
                            let tool = tools.R[i]
                            if (tool == undefined)
                                return
                            t = tool
                        })
                })
                attackTarget.A[0].L.T = tools.L
                if (!options.oneFlank)
                    attackTarget.A[0].R.T = tools.R
                if (!options.oneFlank)
                    attackTarget.A[0].M.T = tools.M
            }
            if (troopCount <= 2)
                throw "NO_MORE_TROOPS"
            
            const rndInt = randomIntFromInterval(1, Number(pluginOptions.attackDelayRand) ?? 3) * 1000;
            limiter.tokenBucket.interval = (Number(pluginOptions.attackDelay * 1000) ?? 4800) + rndInt
            await limiter.removeTokens(1)
            const command2 = options?.cam ?  "cam" : "cra"
            await areaInfoLock(() => sendXT(command2, JSON.stringify(attackTarget)))

                var [obj, _] = await waitForResult(command2, 6000, (obj, result) => {
                    if (result != 0)
                        return false

                    if (obj.AAM.M.KID != kid || obj.AAM.M.TA[1] != TX || obj.AAM.M.TA[2] != TY)
                        return false
                    return true
                })

            eventEmitter.emit("sent", obj)

            let func = async (obj, result) => {
                if (result != 0) {
                    xtHandler.removeListener("cat", func)
                }

                if (obj.A.M.TA[4] != await playerid && LID != obj.A.UM.L.ID)
                    return

                xtHandler.removeListener("cat", func)
                eventEmitter.emit("returning")

                setTimeout(() => {
                    eventEmitter.emit("returned")
                }, (obj.A.M.TT - obj.A.M.PT + 1) * 1000).unref()
            }
            xtHandler.addListener("cat", func)
        }
        catch (e) {
            if (e != "NO_MORE_TROOPS")
                console.error(JSON.stringify(attackTarget))
            await commander.freeCommander(LID)
            if (e == "LORD_IS_USED")
                await commander.useCommander(LID)

            eventEmitter.emit("error", e)
        }
    })


    return eventEmitter
}

module.exports = attack
