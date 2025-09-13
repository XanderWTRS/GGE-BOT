const {workerData, isMainThread} = require('node:worker_threads')

const name = "Attack Khan"

if (isMainThread)
    return module.exports = {
        name : name,
        description : "Hits khan camps (NOT RESPONSIBLE)",
        pluginOptions : [
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
                type: "Text",
                label: "Waves till chest",
                key: "wavesTillChests",
                default: 4
            },
        ]
        
    }

const { xtHandler, sendXT, waitForResult } = require("../ggebot")
const attack = require("./attack.js")
const pretty = require('pretty-time')
const kid = 0
const type = 35
const pluginOptions = workerData.plugins[require('path').basename(__filename).slice(0, -3)] ??= {}

xtHandler.on("cat", async (obj, result) => {
    if (result != 0)
        return

    let attackSource = obj.A.M.SA

    if (attackSource[0] != type)
        return

    let TX = attackSource[1]
    let TY = attackSource[2]

    for (let i = 0; i < attackSource[5] / 60 / 30; i++) {
        sendXT("msd", JSON.stringify({ "X": TX, "Y": TY, "MID": -1, "NID": -1, "MST": "MS4", "KID": `${obj.A.M.KID}` }))

        var [obj2, _] = await waitForResult("msd", 7000, (obj, result) => {
            if (result != 0)
                return false

            if (obj.AI[0] != type || obj.AI[1] != TX || obj.AI[2] != TY)
                return false
            return true
        })
        
        if (obj2.AI[5] <= 0)
            break
    }
})

xtHandler.on("lli", async (_, result) => {
    if (result != 0)
        return

    sendXT("jca", JSON.stringify({ "CID": -1, "KID": kid }))

    var [obj, result] = await waitForResult("jaa", 1400 * 10, (obj, result) => {
        return Number(result) == 0 && obj.KID == kid
    })

    if (result != 0)
        return

    let SX = Number(obj.gca.A[1])
    let SY = Number(obj.gca.A[2])
    let attackFort = async (TX, TY, ai) => {
        for (let i = 0; i < ai[5] / 60 / 30; i++) {
            sendXT("msd", JSON.stringify({ "X": TX, "Y": TY, "MID": -1, "NID": -1, "MST": "MS4", "KID": `${kid}` }))
            var [obj2, _] = await waitForResult("msd", 7000, (obj, result) => {
                if (result != 0)
                    return false

                if (obj.AI[0] != type || obj.AI[1] != TX || obj.AI[2] != TY)
                    return false
                return true
            })
            if (obj2.AI[5] <= 0)
                break
        }
        while (true) {
            let rangeArray = undefined
            if(pluginOptions.commanderWhiteList && pluginOptions.commanderWhiteList != "") {
                const [start, end] = pluginOptions.commanderWhiteList.split("-").map(Number).map(a=>a-1);
                rangeArray = Array.from({ length: end - start + 1 }, (_, i) => start + i);
            }
            let eventEmitter = attack(SX, SY, TX, TY, kid, undefined, undefined, {
                commanderWhiteList : rangeArray,
                lowValueChests : pluginOptions.lowValueChests,
                wavesTillChests : pluginOptions.wavesTillChests
            })
            try {
                let info = await new Promise((resolve, reject) => {
                    //FIXME: Possible memory leakage. Need to remove resolve and reject on await completion
                    eventEmitter.once("sent", resolve)
                    eventEmitter.once("error", reject)
                })

                let timetaken = info.AAM.M.TT
                let timespent = info.AAM.M.PT
                let time = timetaken - timespent

                console.info(`[${name}] Hitting target C${info.AAM.UM.L.VIS+1} ${TX}:${TY} ${pretty(Math.round(1000000000 * Math.abs(Math.max(0, time))), 's') + " till impact"}`)
            }
            catch (e) {
                let timeout = (ms) => new Promise(r => setTimeout(r, ms).unref());
                switch (e) {
                    case "NO_MORE_TROOPS":
                        console.info(`[${name}] No more troops`)
                        let [obj, _] = await waitForResult("cat", 1000 * 60 * 60 * 24, (obj, result) => {
                            return result == 0 && obj.A.M.KID == kid
                        })

                        console.info(`[${name}] Waiting ${obj.A.M.TT - obj.A.M.PT + 1} seconds for more troops`)
                        await timeout((obj.A.M.TT - obj.A.M.PT + 1) * 1000)
                        continue
                    default:
                        console.warn(e)
                }
            }
            break;
        }
    }

    while (true) {
        sendXT("fnm", JSON.stringify({"T":type,"KID":kid,"LMIN":-1,"LMAX":-1,"NID":-801}), "str")
        let [obj, _] = await waitForResult("fnm", 8500, (obj, result) => {
            if (result != 0)
                return false
            
            if(obj.gaa.KID != kid)
                return false

            if(obj.gaa.AI[0][0] != type)
                 return false

            return true
        })
        let ai = obj.gaa.AI[0];

        try {
            await attackFort(ai[1], ai[2], ai)
        }
        catch (e) {
            console.error(e)
        }

    }
})