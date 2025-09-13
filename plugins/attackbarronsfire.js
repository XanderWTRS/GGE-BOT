const { workerData, isMainThread } = require('node:worker_threads')

const name = "Attack Barrons"
if (isMainThread)
    return module.exports = {
        name: name,
        description: "Hits Barrons (Fire)",
        pluginOptions: [
            {
                type: "Checkbox",
                label: "Single Target",
                key: "singleTarget",
            },
            {
                type: "Checkbox",
                label: "Use TimeSkips",
                key: "useTimeSkips",
            }
        ]
    }

const { xtHandler, sendXT, waitForResult } = require("../ggebot.js")
const attack = require("./attack.js")
const pretty = require('pretty-time');
const pluginOptions = workerData.plugins[require('path').basename(__filename).slice(0, -3)] ??= {}

const kid = 3
const type = 2
if(pluginOptions.useTimeSkips) {
xtHandler.on("cat", async (obj, result) => {
    if (result != 0)
        return

    let attackSource = obj.A.M.SA

    if (attackSource[0] != type)
        return

    let TX = attackSource[1]
    let TY = attackSource[2]
    for (let i = 0; i < attackSource[5] / 60 * 30; i++) {
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
}
xtHandler.on("lli", async (_, result) => {
    if (result != 0)
        return

    sendXT("jca", JSON.stringify({ "CID": -1, "KID": kid }))

    var [obj, result] = await waitForResult("jaa", 1000 * 10, (obj, result) => Number(result) == 0 && obj.KID == kid)

    if (result != 0)
        return

    let SX = Number(obj.gca.A[1])
    let SY = Number(obj.gca.A[2])
    let attackFort = async (TX, TY, ai, firstWave, waves) => {
        if(ai[5] > 0 && !pluginOptions.useTimeSkips)
            return console.info(`Skipping ${TX}:${TY} needs time`)
        for (let i = 0; i < ai[5] / 60 * 30; i++) {
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
            let eventEmitter = attack(SX, SY, TX, TY, kid, firstWave, waves)
            try {
                let info = await new Promise((resolve, reject) => {
                    eventEmitter.once("sent", resolve)
                    eventEmitter.once("error", reject)
                })

                let timetaken = info.AAM.M.TT
                let timespent = info.AAM.M.PT
                let time = timetaken - timespent

                console.info(`[${name}] Hitting target C${info.AAM.UM.L.VIS + 1} ${TX}:${TY} ${pretty(Math.round(1000000000 * Math.abs(Math.max(0, time))), 's') + " till impact"}`)
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

    sendXT("gaa", JSON.stringify({
        KID: kid,
        AX1: SX - 50,
        AY1: SY - 50,
        AX2: SX + 50,
        AY2: SY + 50
    }), "str")
    var [obj, _] = await waitForResult("gaa", 5500, (obj, result) => {
        try {
            if (result != 0)
                return

            if (obj.KID != kid)
                return false

            let ai = obj.AI[0]
            let x = ai[1]
            let y = ai[2]
            let rect = {
                x: SX - 50,
                y: SY - 50,
                w: SX + 50,
                h: SY + 50
            }
            if (!(rect.x <= x && x <= rect.x + rect.w &&
                rect.y <= y && y <= rect.y + rect.h))
                return false

            return true
        }
        catch (e) {
            console.error(e)
            return false
        }
    })
    let AI = obj.AI.filter(ai => ai[0] == type).sort((a, b) => {
        if (Math.sqrt(Math.pow(SX - a[1], 2) + Math.pow(SY - a[2], 2)) < Math.sqrt(Math.pow(SX - b[1], 2) + Math.pow(SY - b[2], 2)))
            return -1
        if (Math.sqrt(Math.pow(SX - a[1], 2) + Math.pow(SY - a[2], 2)) > Math.sqrt(Math.pow(SX - b[1], 2) + Math.pow(SY - b[2], 2)))
            return 1
    })

    while (true) {
        for (let i = 0; pluginOptions.singleTarget ? i < 1 : i < AI.length; i++) {
            let ai = AI[i];
            sendXT("gaa", JSON.stringify({
                KID: kid,
                AX1: ai[1],
                AY1: ai[2],
                AX2: ai[1],
                AY2: ai[2]
            }), "str")
            let [obj, _] = await waitForResult("gaa", 5500, (obj, result) => {
                try {
                    if (result != 0)
                        return

                    if (obj.KID != kid)
                        return false

                    let ai2 = obj.AI[0]
                    let x = ai2[1]
                    let y = ai2[2]
                    if (x != ai[1] || y != ai[2])
                        return false

                    return true
                }
                catch (e) {
                    console.error(e)
                    return false
                }
            })
            ai = obj.AI[0]
            //skip time
            try {
                await attackFort(ai[1], ai[2], ai, undefined, undefined)
            }
            catch (e) {
                console.error(e)
            }

        }
    }
})
