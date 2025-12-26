const { isMainThread } = require('node:worker_threads')
const name = "Attack"
if (isMainThread) {
    module.exports = {
        name: name,
        description: "Handles Hits",
        force: true,
        pluginOptions: [
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
            }
        ]
    }
    return
}

const {botConfig, playerInfo} = require("../../ggebot")

const getTotalAmountTools = (e, t, n) =>
    1 === e ? t < 11 ? 10 :
        t < 37 ? 20 :
            t < 50 ? 30 :
                t < 69 ? 40 : 50 : //TODO: WTF
        t < 37 ? 10 :
            t < 50 ? 20 :
                t < 69 ? 30 : 0 | Math.ceil(40 + n)

const getTotalAmountToolsFlank = (e, t) => getTotalAmountTools(0, e, t)
const getTotalAmountToolsFront = e => getTotalAmountTools(1, e, 0)

const getMaxAttackers = targetLevel =>
    targetLevel <= 69 ? Math.min(260, 5 * targetLevel + 8) : 320
const getAmountSoldiersFlank = e => Math.floor(0 | Math.ceil(.2 * getMaxAttackers(e)))
const getAmountSoldiersFront = e => Math.floor(0 | Math.ceil(getMaxAttackers(e) - 2 * getAmountSoldiersFlank(e)))
const getMaxUnitsInReinforcementWave = (playerlevel, targetLevel) =>
    0 | Math.round(20 * Math.sqrt(playerlevel) + 50 + 20 * targetLevel)

function getMaxWaveCount(e) {
    const waveUnlockLevelList = [0, 13, 26, 51]
    for (var n = 1, i = waveUnlockLevelList.length - 1; i >= 0; i--)
        if (e >= waveUnlockLevelList[i]) {
            n = i + 1;
            break
        }
    return n
}

function assignUnit(unitSlot, units, maxUnits) {
    let unit = units[0]
    if (!unit)
        return 0

    let unitType = unit[0].wodID
    let unitAmmount = Math.floor(Math.max(Math.min(unit[1], maxUnits),0))

    unit[1] -= unitAmmount

    if (unit[1] <= 0)
        units.shift()

    if (unitAmmount > 0) {
        unitSlot[0] = unitType
        unitSlot[1] = unitAmmount
    }

    return unitAmmount
}
function getAttackInfo(kid, sourceCastle, AI, commander, level, waves) {
    const attackTarget = {
        SX: sourceCastle.x,
        SY: sourceCastle.y,
        TX: AI.x,
        TY: AI.y,
        KID: kid,
        LID: commander.lordID,
        WT: 0,
        HBW: -1,
        BPC: 0,
        ATT: 0,
        AV: 0,
        LP: 3,
        FC: 0,
        PTT: 1,
        SD: 0,
        ICA: 0,
        CD: 99,
        A: [],
        BKS: [],
        AST: [
            -1,
            -1,
            -1
        ],
        RW: [ //TODO: SET THIS UP PROPERLY
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
        ASCT: 0
    }

    if (!waves) {
        waves = getMaxWaveCount(playerInfo.level)

        try {
            commander.EQ[4][5].forEach(([id, effectarray]) =>
                id == 21 ? waves += effectarray[0] : void 0)
        }
        catch { }
    }

    for (let i = 0; i < waves; i++) {
        const wave = {
            L: {
                T: [],
                U: []
            },
            R: {
                T: [],
                U: []
            },
            M: {
                T: [],
                U: []
            }
        }
        const setupWave = (wallLevelRequirement, row) =>
            wallLevelRequirement.every(e =>
                e <= level ? row.push([-1, 0]) : false)

        setupWave([0, 37], wave.L.T)
        setupWave([0, 13], wave.L.U)
        setupWave([0, 11, 37], wave.M.T)
        setupWave([0, 0, 13, 13, 26, 26], wave.M.U)
        setupWave([0, 37], wave.R.T)
        setupWave([0, 13], wave.R.U)
        attackTarget.A.push(wave)
    }

    return attackTarget
}

function randomIntFromInterval(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}

const pluginOptions = botConfig.plugins[require('path').basename(__filename).slice(0, -3)] ??= {}
const attacks = []
let alreadyRunning = false
let timeTillTimeout = NaN
const napTime = 1000 * 60 * 60 * 2
const waitToAttack = callback => new Promise((resolve, reject) => {
    if (isNaN(timeTillTimeout))
        timeTillTimeout = new Date().getTime() + napTime

    attacks.push(() => {
        try {
            ret = callback()
            resolve(ret)
            return ret
        }
        catch (e) {
            reject(e)
            return true
        }
    })
    
    if (!alreadyRunning) {
        alreadyRunning = true
        setImmediate(async () => {
            try {
                do {
                    const rndInt = randomIntFromInterval(1, Number(pluginOptions.attackDelayRand ?? 3)) * 1000;
                    let timeout = ms => new Promise(r => setTimeout(r, ms).unref());

                    if(!await (attacks.shift()()))
                        continue
                    if (timeTillTimeout - new Date().getTime() <= 0) {
                        console.log(`[${name}] Having a 30 minute nap to prevent ban`)
                        await timeout(1000 * 60 * 30)
                        timeTillTimeout = new Date().getTime() + napTime
                    }
                    else
                        await timeout(Number((pluginOptions.attackDelay ?? 4.8) * 1000) + rndInt)


                }
                while (attacks.length > 0);
            }
            catch (e) {
                console.error(e)
            }
            finally {
                alreadyRunning = false
            }
        })
    }
})

module.exports = {
    getAttackInfo,
    assignUnit,
    waitToAttack,
    getTotalAmountToolsFlank,
    getTotalAmountToolsFront,
    getAmountSoldiersFlank,
    getAmountSoldiersFront,
    getMaxUnitsInReinforcementWave
} 