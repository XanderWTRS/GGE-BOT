const {workerData, isMainThread} = require('node:worker_threads')

const name = "Attack Fortress (Fire)"

if (isMainThread)
    return module.exports = {
        name : name,
        description : "Hits Fortresses (Fire)"
    }

const { xtHandler, sendXT, waitForResult } = require("../ggebot")
const attack = require("./attack.js")
const pretty = require('pretty-time')
const kid = 3
const type = 11

const pluginOptions = workerData.plugins[require('path').basename(__filename).slice(0, -3)] ??= {}
let blackListedCoords = []

xtHandler.on("gam", (obj, result) => {
    if (result != 0)
        return

    if (obj.M.length != 0)
        blackListedCoords = []

    obj.M.forEach(M => {
        let m = M.M
        if (m.KID != 3)
            return
        blackListedCoords.push([m.SA[1], m.SA[2]])
        blackListedCoords.push([m.TA[1], m.TA[2]])
    });
})
function spiralCoordinates(n) {
    if (n === 0) return { x: 0, y: 0 };

    const k = Math.ceil((Math.sqrt(n + 1) - 1) / 2);
    const layerStart = (2 * (k - 1) + 1) ** 2;
    const offset = n - layerStart;
    const sideLength = 2 * k;
    const side = Math.floor(offset / sideLength);
    const posInSide = offset % sideLength;

    let x, y;

    switch (side) {
        case 0:
            x = k;
            y = -k + 1 + posInSide;
            break;
        case 1:
            x = k - 1 - posInSide;
            y = k;
            break;
        case 2:
            x = -k;
            y = k - 1 - posInSide;
            break;
        case 3:
            x = -k + 1 + posInSide;
            y = -k;
            break;
    }

    return { x, y };
}
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
        while (true) {
            let eventEmitter = attack(SX, SY, TX, TY, kid, undefined, 4, { abi :true})
            try {
                let info = await new Promise((resolve, reject) => {
                    //FIXME: Possible memory leakage. Need to remove resolve and reject on await completion
                    eventEmitter.once("sent", resolve)
                    eventEmitter.once("error", reject)
                })

                let timetaken = info.AAM.M.TT
                let timespent = info.AAM.M.PT
                let time = timetaken - timespent

                blackListedCoords.push([TX,TY])

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

        done:
        for (let i = 0, j = 0; i < 13 * 13; i++) { //TODO: This algo is a bit shit on larger scales of people may want to reconsider later
            let rX, rY
            let rect
            do {

                ({ x: rX, y: rY } = spiralCoordinates(j++))
                rX *= 100
                rY *= 100

                rect = {
                    x: SX + rX - 50,
                    y: SY + rY - 50,
                    w: SX + rX + 50,
                    h: SY + rY + 50
                }
                if (j > Math.pow(13 * 13, 2))
                    break done
            } while ((SX + rX) <= -50 || (SY + rY) <= -50 || (SX + rX) >= (1286 + 50) || (SY + rY) >= (1286 + 50))
            rect.x = rect.x < 0 ? 0 : rect.x
            rect.y = rect.y < 0 ? 0 : rect.y
            rect.w = rect.w < 0 ? 0 : rect.w
            rect.h = rect.h < 0 ? 0 : rect.h
            rect.x = rect.x > 1286 ? 1286 : rect.x
            rect.y = rect.y > 1286 ? 1286 : rect.y
            rect.w = rect.w > 1286 ? 1286 : rect.w
            rect.h = rect.h > 1286 ? 1286 : rect.h

            sendXT("gaa", JSON.stringify({
                KID: kid,
                AX1: rect.x,
                AY1: rect.y,
                AX2: rect.w,
                AY2: rect.h
            }), "str")
            let lastRegion = undefined
            try {
                let [obj, _] = await waitForResult("gaa", 5500, (obj, result) => {
                    try {
                        if (result != 0)
                            return

                        if (obj.KID != kid)
                            return false

                        let ai = lastRegion = obj.AI[0]
                        if(ai == undefined)
                            return false
                        let x = ai[1]
                        let y = ai[2]

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

                let AI = obj.AI.filter(ai => ai[0] == type &&
                    ai[5] == 0).sort((a, b) => {
                        if (Math.sqrt(Math.pow(SX - a[1], 2) + Math.pow(SY - a[2], 2)) < Math.sqrt(Math.pow(SX - b[1], 2) + Math.pow(SY - b[2], 2)))
                            return -1
                        if (Math.sqrt(Math.pow(SX - a[1], 2) + Math.pow(SY - a[2], 2)) > Math.sqrt(Math.pow(SX - b[1], 2) + Math.pow(SY - b[2], 2)))
                            return 1
                    })

                for (let i = 0; i < AI.length; i++) {
                    const ai = AI[i];
                    if (!blackListedCoords.every(([x, y]) => x != ai[1] || y != ai[2])) {
                        console.info(`[${name}] skipping ${ai[1]}:${ai[2]} already hitting`)
                        continue;
                    }

                    await attackFort(ai[1], ai[2])
                }
            }
            catch (e) {
                console.error(`[${name}] Couldn't not scan area ${JSON.stringify(rect)} with error ${e}}`)
                console.error(`[${name}] lastRegionChecked ${JSON.stringify(lastRegion)}`)
            }
        }


        await new Promise((resolve) => setTimeout(_ => resolve(), 1000 * 60 * 5).unref());
        console.info(`[${name}] Ran out of forts rescanning`)
    }
})