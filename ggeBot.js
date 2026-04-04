const { isMainThread, workerData : botConfig, parentPort } = require("node:worker_threads")
if (isMainThread)
    throw new Error("Run as worker")

process.on("uncaughtException", console.error) //Wanna cry? Remove this.

const { getCallSites } = require("node:util")
const EventEmitter = require("node:events")
const path = require("node:path")
const { RateLimiter } = require("limiter")
const WebSocket = require("ws")
const { I18n } = require("i18n")
const ggeConfig = require("./ggeConfig.json")
const ActionType = require("./actions.json")
const err = require("./err.json")

const limiter = new RateLimiter({ tokensPerInterval: 2.5, interval: "sec" })
const events = new EventEmitter()
const xtHandler = new EventEmitter()
const i18n = new I18n({
    locales: ['en', 'de', 'ar', 'fi', 'he', 'hu', 'pl', 'ro', 'tr', 'cs', 'nl', 'fr'],
    directory: path.join(__dirname, "website", "public", 'locales'),
    updateFiles: false
})
const _console = console

function mngLog(logLevel, msg) {
    let callSites = getCallSites(6)
    let scriptName = path.basename(callSites[2]?.scriptName).slice(0, -3)
    
    let now = new Date()
    let hours = now.getHours()
    let minutes = now.getMinutes()

    hours = hours < 10 ? '0' + hours : hours
    minutes = minutes < 10 ? '0' + minutes : minutes

    let message = [`[${hours + ':' + minutes}] `, '[', `${scriptName}`, '] ']

    message.push(...msg)

    message = message.map(msg => {
        if(msg instanceof Error)
            return msg.message

        return msg
    })

    _console.log(`[${botConfig.name}] ${message.map(i18n.__).join("")}`)
    parentPort.postMessage([ActionType.GetLogs, logLevel, message])
}

if (!botConfig.internalWorker) {
    console = {}
    console.log = (...msg) => mngLog(0, msg)
    console.info = (...msg) => mngLog(0, msg)
    console.warn = (...msg) => mngLog(1, msg)
    console.error = (...msg) => mngLog(2, msg)
    console.debug = ggeConfig.debug ? _console.debug : _ => { }
    console.trace = _console.trace
}
let requestCount = 0
async function sendXT(cmdName, paramObj) {
    try {
    console.debug(cmdName, JSON.parse(paramObj))
    } catch {}
    await limiter.removeTokens(1)
    requestCount++
    webSocket.send(`%xt%${botConfig.gameServer}%${cmdName}%1%${paramObj}%`)
}

let lordErrors = 0
let tooManyUnits = 0

/**
 * 
 * @param {string} key 
 * @param {number} timeout 
 * @param {function(object,number)} func 
 * @returns {Promise<[obj: object, result: Number]>}
 */
const waitForResult = (key, timeout, func) => new Promise((resolve, reject) => {
    if (timeout == undefined)
        reject(`waitForResult: No timeout specified`)

    func ??= _ => true

    let timer
    let result
    const checkForLordIssues = () => {
        if (err[result] == "LORD_IS_USED")
            lordErrors++
        if (err[result] == "ATTACK_TOO_MANY_UNITS")
            tooManyUnits++
        if (lordErrors == 5) {
            console.error("closedReason", "LORD_IS_USED")
            return webSocket.pause()
            parentPort.postMessage([ActionType.KillBot])
            return
        }
        if (tooManyUnits == 12) {
            console.error("closedReason", "ATTACK_TOO_MANY_UNITS")
            return webSocket.pause()
            parentPort.postMessage([ActionType.KillBot])
            return
        }
        if (err[result] == "MOVEMENT_HAS_NO_UNITS") {
            console.error("closedReason", "MOVEMENT_HAS_NO_UNITS")
            return webSocket.pause()
            parentPort.postMessage([ActionType.KillBot])
            return
        }
        if (err[result] == "CANT_START_NEW_ARMIES") {
            console.error("closedReason", "CANT_START_NEW_ARMIES")
            return webSocket.pause()
            parentPort.postMessage([ActionType.KillBot])
            return
        }
    }

    if (timeout > 0) {
        timer = setTimeout(() => {
            xtHandler.removeListener(key, helperFunction)
            const msg = (result == undefined || result == 0) ? "TIMED_OUT" : !err[result] ? result : err[result]
            result = -1
            
            console.warn(key, msg)

            reject(msg)
        }, timeout * (ggeConfig.timeoutMultiplier ?? 1))
    }

    const helperFunction = (data, _result) => {
        if (result != 0)
            result = _result

        const msg = (_result == undefined || _result == 0) ? "TIMED_OUT" : !err[_result] ? _result : err[_result]
        
        checkForLordIssues()
        if (!func(Object(data), Number(_result)))
            return
        if(_result != 0)
            console.warn(key, msg)

        xtHandler.removeListener(key, helperFunction)
        clearInterval(timer)
        resolve([Object(data), Number(_result)])
    }

    xtHandler.addListener(key, helperFunction)
})

const webSocket = new WebSocket(`wss://${botConfig.gameURL}/`)

const status = {}
const playerInfo = {
    level: NaN,
    userID: String(),
    playerID: String(),
    email: String(),
    acceptedTOS: Boolean(),
    verifiedEmail: Boolean(),
    isCheater: Boolean(),
    name: String(),
    alliance: {
        id: String(),
        rank: Number(),
        name: String(),
        fame: Number(),
        searchingForPlayers: Boolean()
    }
}

module.exports = {
    sendXT,
    xtHandler,
    waitForResult,
    webSocket,
    events,
    botConfig,
    playerInfo,
    status,
    i18n
}

webSocket.onopen = () => webSocket.send('<msg t="sys"><body action="verChk" r="0"><ver v="166"/></body></msg>')

let errorCount = 0

webSocket.onmessage = e => {
    let message = String(e.data.toString())
    if (message.charAt(0) == "%") {
        const [,,cmd,, r, obj] = message.split("%")
        const result = Number(r)

        switch (cmd) {
            case "gbd":
                for (const [key, value] of Object.entries(JSON.parse(obj)))
                    xtHandler.emit(key, value, 0)
                break
            case "vck":
                xtHandler.emit(cmd, obj, result)
                break
            case "gfl":
                xtHandler.emit(cmd, obj, result)
                break
            default:
                if (result != 0 && !(cmd == "lli" && result == 453)) {
                    console.debug(err[result] ?? result, cmd)
                    errorCount++
                }
            case "core_pol":
            case "rlu":
                if (xtHandler.listenerCount(cmd) == 0)
                    return
                try {
                    var obj2 = JSON.parse(obj)
                }
                catch {
                    obj2 = obj
                }
                xtHandler.emit(cmd, obj2, result)
        }
    }

    else if (message[0] == "<") {
        switch (message) {
            case "<msg t='sys'><body action='apiOK' r='0'></body></msg>":
                webSocket.send(`<msg t="sys"><body action="login" r="0"><login z="${botConfig.gameServer}"><nick><![CDATA[]]></nick><pword><![CDATA[undefined%en%0]]></pword></login></body></msg>`)
                break
            case "<msg t='sys'><body action='joinOK' r='1'><pid id='0'/><vars /><uLs r='1'></uLs></body></msg>":
                webSocket.send('<msg t="sys"><body action="roundTrip" r="1"></body></msg>')
                sendXT("vck", `undefined%web-html5%<RoundHouseKick>%${(Math.random() * Number.MAX_VALUE).toFixed()}`)
                break
            case "<msg t='sys'><body action='roundTripRes' r='1'></body></msg>":
                break
        }
    }
}
webSocket.onerror = () => {
    events.emit("unload")
    process.exit(0)
}
webSocket.onclose = () => {
    events.emit("unload")
    process.exit(0)
}

events.on("configModified", () => console.log("botConfigReloaded"))

events.once("load", async () => {
    const { KingdomID, castles } = require("./protocols.js")
    const castle = castles.find(e => e.kingdomID == KingdomID.stormIslands)
    function getStormStats() {
        Object.assign(status, {
            aquamarin_name: castle.aqua != 0 ? Math.floor(castle.aqua) : undefined,
            food: castle.food != 0 ? Math.floor(castle.food) : undefined,
            mead: Math.floor(castle.mead != 0 ? Math.floor(castle.mead) : undefined)
        })
        parentPort.postMessage([ActionType.StatusUser, status])
    }
    if(!castle)
        return

    castle.on("resourceUpdate", getStormStats)
    getStormStats()
})

xtHandler.on("rlu", () => webSocket.send('<msg t="sys"><body action="autoJoin" r="-1"></body></msg>'))
xtHandler.on("gal", obj => {
    playerInfo.alliance.id = String(obj.AID)
    playerInfo.alliance.rank = Number(obj.R)
    playerInfo.alliance.name = String(obj.N)
    playerInfo.alliance.fame = Number(obj.ACF)
    playerInfo.alliance.searchingForPlayers = Boolean(obj.SA)
})
xtHandler.on("gxp", obj => {
    playerInfo.level = obj.LVL + obj.LL

    if (!botConfig.externalEvent)
        return

    Object.assign(status, { level: playerInfo.level })
    parentPort.postMessage([ActionType.StatusUser, status])
})
xtHandler.on("gpi", obj => {
    playerInfo.userID = String(obj.UID)
    playerInfo.playerID = String(obj.PID)
    playerInfo.name = String(obj.PN)
    playerInfo.email = String(obj.E)
    playerInfo.verifiedEmail = Boolean(obj.V)
    playerInfo.acceptedTOS = Boolean(obj.CTAC)
    playerInfo.isCheater = Boolean(obj.CL)
})
xtHandler.on("gcu", obj => {
    Object.assign(status, {
        cash: obj.C1 != 0 ? Math.floor(playerInfo.coin = obj.C1) : undefined,
        gold: obj.C2 != 0 ? Math.floor(playerInfo.rubies = obj.C2) : undefined,
        requestCount,
        errorCount
    })
    parentPort.postMessage([ActionType.StatusUser, status])
})
xtHandler.on("gai", obj => {
    Object.assign(status, {
        attackDailyCount: obj.AC != 0 ? Math.floor(playerInfo.attackDailyCount = obj.AC) : undefined,
    })
    parentPort.postMessage([ActionType.StatusUser, status])
})
parentPort.on("message", async obj => {
    switch (obj[0]) {
        case ActionType.SetPluginOptions:
            function deepCopy(old_, new_) {
                Object.keys(new_).forEach(key => {
                    if (typeof new_[key] === "object" && !Array.isArray(new_[key]) && new_[key] !== null)
                        deepCopy(old_[key], new_[key])
                    else
                        old_[key] = new_[key]
                })
            }
            deepCopy(botConfig, obj[1])
            events.emit("configModified")
            break
            break
        case ActionType.StatusUser:
            parentPort.postMessage([ActionType.StatusUser, status])
            break
        case ActionType.GetExternalEvent:
            await sendXT("sei", JSON.stringify({}))
            let [sei, _] = await waitForResult("sei", 1000 * 10)
            if (sei.E.find(e => e.EID == 113))
                await sendXT("glt", JSON.stringify({ GST: 3 }))
            else
                await sendXT("glt", JSON.stringify({ GST: 2 }))
            let [glt, _2] = await waitForResult("glt", 1000 * 10)
            parentPort.postMessage([ActionType.GetExternalEvent, { sei: sei, glt: glt }])
            break

    }
})

async function retry() {
    if (botConfig.externalEvent) {
        sendXT("tlep", JSON.stringify({ TLT: botConfig.tempServerData.glt.TLT }))
    }
    if (botConfig.lt) {
        sendXT("lli", JSON.stringify({
            "CONM": 350,
            "RTM": 57,
            "ID": 0,
            "PL": 1,
            "NOM": botConfig.name,
            "LT": botConfig.lt,
            "LANG": "en",
            "DID": "0",
            "AID": "17254677223212351",
            "KID": "",
            "REF": "https://empire.goodgamestudios.com",
            "GCI": "",
            "SID": 9,
            "PLFID": 1
        }))
    }
    else {
        sendXT("lli", JSON.stringify({
            CONM: 212,
            RTM: 25,
            ID: 0,
            PL: 1,
            NOM: botConfig.name,
            PW: botConfig.pass,
            LT: null,
            LANG: "en",
            DID: "0",
            AID: "1745592024940879420",
            KID: "",
            REF: "https://empire.goodgamestudios.com",
            GCI: "",
            SID: 9,
            PLFID: 1
        }))
    }
    events.emit("sentLLI")
}
xtHandler.on("vck", retry)

let loginAttempts = 0
xtHandler.on("lli", async (obj, r) => {
    if (r == 453) {
        console.log("retryLogin", obj.CD, "retryLoginSeconds")
        setTimeout(retry, obj.CD * 1000)
        return
    }

    if (err[r] == "IS_BANNED") {
        console.log("retryLogin", obj.CD, "retryLoginSeconds")
        console.log("retryLogin", (obj.RS / 60 / 60).toFixed(2), "retryLoginHours")
        setTimeout(retry, obj.RS * 1000)
        return
    }

    if (r == 0) {
        //Due to exploits that can break the client this is to give limited access again.
        const timer = setTimeout(() => {
            console.warn("loggedIn", "loggedInWithoutEventData")
            console.warn("featuresMightNotWork")
            events.emit("load")
        }, 30 * 1000 * (ggeConfig.timeoutMultiplier ?? 1))

        xtHandler.once("sei", () => {
            parentPort.postMessage([ActionType.Started])
            console.log("loggedIn")
            setTimeout(() => events.emit("load"), 4500)
            clearTimeout(timer)
        })
        events.emit("earlyLoad")
        setInterval(() => sendXT("pin", "<RoundHouseKick>"), 1000 * 60).unref()
        return
    }

    if (r == err["INVALID_LOGIN_TOKEN"]) {
        loginAttempts++
        if (loginAttempts < 30)
            return retry()
    }
    if (botConfig.internalWorker)
        process.exit(0)

    status.hasError = true
    parentPort.postMessage([ActionType.StatusUser, status])
    parentPort.postMessage([ActionType.KillBot])
})

try {
    require("./plugins/misc.js")
}
catch(e) {
    console.debug(e)
}

for (const [, val] of Object.entries(botConfig.plugins)) {
    if (!val.state)
        continue
    try {
        require(`./${val.filename}`)
    }
    catch (e) {
        console.warn(e)
    }
}