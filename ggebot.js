process.on('uncaughtException', console.error) //Wanna cry? Remove this.
const { isMainThread, workerData, parentPort } = require('node:worker_threads')
const EventEmitter = require('node:events')
const WebSocket = require('ws')
const ActionType = require('./actions.json')
const err = require('./err.json')
const {DatabaseSync} = require('node:sqlite')
const events = new EventEmitter()
if (isMainThread)
    return
const botConfig = workerData

const _console = console

function mngLog(msg,logLevel) {
    _console.log(`[${botConfig.name}] ${msg}`)
    const now = new Date()
    let hours = now.getHours()
    let minutes = now.getMinutes()
    
    hours = hours < 10 ? '0' + hours : hours
    minutes = minutes < 10 ? '0' + minutes : minutes
    
    parentPort.postMessage([ActionType.GetLogs,[logLevel, `[${hours + ':' + minutes}] ` + msg]])
}
if (!botConfig.internalWorker) {
    console = {}
    console.log = msg => mngLog(msg, 0)
    console.info = msg => mngLog(msg, 0)
    console.warn = msg => mngLog(msg, 1)
    console.error = msg => mngLog(msg, 2)
    console.debug = _console.debug
    console.trace = _console.trace
}

events.on("configModified", () => {
    console.log(`[GGEBOT] config has been reload`)
})

const rawProtocolSeparator = "%"

const xtHandler = new EventEmitter()

function sendXT(cmdName, paramObj) {
    webSocket.send(rawProtocolSeparator + ["xt",  botConfig.gameServer, cmdName, 1].join(rawProtocolSeparator) + rawProtocolSeparator + paramObj + rawProtocolSeparator)
}

/**
 * 
 * @param {string} key 
 * @param {number} timeout 
 * @param {function(object,number)} func 
 * @returns {Promise<[obj: object, result: Number]>}
 */

let lordErrors = 0
const waitForResult = (key, timeout, func) => new Promise((resolve, reject) => {
    if (timeout == undefined) 
        reject(`waitForResult: No timeout specified`)

    func ??= _ => true

    let timer;
    let result;
    const checkForLordIssues = () => {
        if (err[result] == "LORD_IS_USED")
            lordErrors++

        if (lordErrors == 5) {
            console.error("Closing forcefully due to LORD_IS_USED errors!")
            parentPort.postMessage([ActionType.KillBot])
            return
        }
    }

    if(timeout > 0) {
        timer = setTimeout(() => {
            xtHandler.removeListener(key, helperFunction)
            const msg = (result == undefined || result == 0) ? "TIMED_OUT" : !err[result] ? result : err[result]
            
            console.warn(`${key} Timed out`)

            reject(msg)
        }, timeout)
    }

    const helperFunction = (data, _result) => {
        if (result != 0)
            result = _result
        checkForLordIssues()
        if (!func(Object(data), Number(_result)))
            return

        xtHandler.removeListener(key, helperFunction)
        clearInterval(timer)
        resolve([Object(data), Number(_result)])
    }

    xtHandler.addListener(key, helperFunction)
})

const webSocket = new WebSocket(`wss://${botConfig.gameURL}/`);
webSocket.onopen = _ => webSocket.send('<msg t="sys"><body action="verChk" r="0"><ver v="166"/></body></msg>')

const playerInfo = {
    level : NaN,
    userID : NaN,
    playerID: NaN,
    email : String(),
    acceptedTOS: Boolean(),
    verifiedEmail: Boolean(),
    isCheater: Boolean(),
    name: String(),
    alliance : {
        id : Number(),
        rank : Number(),
        name : String(),
        fame : Number(),
        searchingForPlayers : Boolean()
    }
}

xtHandler.on("gal", obj => {
    playerInfo.alliance.id = Number(obj.AID)
    playerInfo.alliance.rank = Number(obj.R)
    playerInfo.alliance.name = String(obj.N)
    playerInfo.alliance.fame = Number(obj.ACF)
    playerInfo.alliance.searchingForPlayers = Boolean(obj.SA)
})

xtHandler.on("gxp", obj => {
    playerInfo.level = obj.LVL + obj.LL
})
xtHandler.on("gpi", obj => {
    playerInfo.userID = Number(obj.UID)
    playerInfo.playerID = Number(obj.PID)
    playerInfo.name = String(obj.PN)
    playerInfo.email = String(obj.E)
    playerInfo.verifiedEmail = Boolean(obj.V)
    playerInfo.acceptedTOS = Boolean(obj.CTAC)
    playerInfo.isCheater = Boolean(obj.CL)
})

module.exports = { sendXT, xtHandler, waitForResult, webSocket, events, botConfig, playerInfo }
require("./protocols.js")
for (const [_,val] of Object.entries(botConfig.plugins)) {
    if(!val.state)
        continue
    try {
        require(`./${val.filename}`)
    }
    catch(e) {
        console.warn(e)
    }
}

let errorCount = 0
let sentHits = 0

xtHandler.on("cra", (obj,r) => r == 0 ? sentHits++ : void 0)

webSocket.onmessage = async (e) => {
    let message = e.data.toString()
    if (message.charAt(0) == rawProtocolSeparator) {
        let params = message.substr(1, message.length - 2).split(rawProtocolSeparator)
        let data = params.splice(1, params.length - 1)

        switch(data[0]) {
            case "gbd":
                for (const [key, value] of Object.entries(JSON.parse(data[3])))
                    xtHandler.emit(key, value, Number(data[2]), "str")
                break
            case "vck":
                xtHandler.emit(data[0], data[3], Number(data[2]), "str");
                break
            case "gfl":
                xtHandler.emit(data[0], data[3], Number(data[2]), "str");
                break
            default: 
                if (data[2] != 0 && !(data[0] == "lli" && data[2] == 453)) {
                    console.warn(`Got result ${err[data[2]] ? err[data[2]] : data[2]} from ${data[0]}`)
                    errorCount++
                }
            case "core_pol":
            case "rlu":
                if(xtHandler.listenerCount(data[0]) == 0)
                    return
                xtHandler.emit(data[0], data[3] ? JSON.parse(data[3]) : undefined, Number(data[2]), "str");
        }
    }
    
    else if (message.charAt(0) == "<") {
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
webSocket.onerror = () => {events.emit("unload"); process.exit(0)}
webSocket.onclose = () => {events.emit("unload"); process.exit(0)}

events.on("unload", () => {
    console.log(`errorCount: ${errorCount}`)
    console.log(`sentHits: ${sentHits}`)
})

const { getResourceCastleList, AreaType, KingdomID, Types } = require('./protocols.js');
let status = {}
events.once("load", async (_, r) => {
    const sourceCastleArea = (await getResourceCastleList()).castles.find(e => e.kingdomID == KingdomID.stormIslands)
        .areaInfo.find(e => e.type == AreaType.externalKingdom);
    setInterval(() =>
        sendXT("dcl", JSON.stringify({ CD: 1 })),
        1000 * 60 * 5)
        
    xtHandler.on("dcl", obj => {
        const castleProd = Types.DetailedCastleList(obj)
            .castles.find(a => a.kingdomID == kid)
            .areaInfo.find(a => a.areaID == sourceCastleArea.extraData[0])

        if(!castleProd)
            return

        Object.assign(status, {
            aquamarine: castleProd.aqua,
            food: castleProd.food,
            mead: castleProd.mead
        })
        parentPort.postMessage([ActionType.StatusUser, status])
    })

    xtHandler.on("gcu", obj => {
        Object.assign(status, {
            coin: Math.floor(obj.C1),
            rubies: Math.floor(obj.C2),
        })
        parentPort.postMessage([ActionType.StatusUser, status])
    })
})

parentPort.on("message", async obj => {
    switch (obj[0]) {
        case ActionType.SetPluginOptions:
            function deepCopy(old_, new_) {
                Object.keys(new_).forEach(key => {
                    if (typeof new_[key] === 'object' && !Array.isArray(new_[key]) && new_[key] !== null)
                        deepCopy(old_[key], new_[key])
                    else
                        old_[key] = new_[key];
                });
            }
            deepCopy(botConfig,obj[1])
            events.emit("configModified")
            break
            break
        case ActionType.StatusUser:
            parentPort.postMessage([ActionType.StatusUser, status])
            break
        case ActionType.GetExternalEvent:
            sendXT("sei", JSON.stringify({}))
            let [sei, _] = await waitForResult("sei", 1000* 10)
            if(sei.E.find(e => e.EID == 113))
                sendXT("glt", JSON.stringify({GST:3}))
            else
                sendXT("glt", JSON.stringify({GST:2}))
            let [glt, _2] = await waitForResult("glt", 1000* 10)
            parentPort.postMessage([ActionType.GetExternalEvent, {sei: sei, glt: glt}])
            break
        
    }
})

let retry = async () => {
    if(botConfig.externalEvent) {
        sendXT("tlep", JSON.stringify({TLT: botConfig.tempServerData.glt.TLT}))
        return
    }
    // const RCT = await new Promise(resolve => {
    //     const messageCallback = (obj) => {
    //         if(obj[0] != ActionType.CAPTCHA)
    //             return
    //         parentPort.off('message', messageCallback)
    //         resolve(obj[1])
    //     }
    //     parentPort.on('message', messageCallback)
    //     parentPort.postMessage([ActionType.CAPTCHA])
    // })
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
            "PLFID": 1,
            // "RCT" : 0
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
            PLFID: 1,
            // RCT : 0
        }))
    }
}
xtHandler.on("vck", async _ => {
    await retry()
})

xtHandler.on("rlu", _ => webSocket.send('<msg t="sys"><body action="autoJoin" r="-1"></body></msg>'))

let loginAttempts = 0
xtHandler.on("lli", async (obj,r) => {
    if(r == 453)
    {
        console.log(`retrying login in ${obj.CD} seconds`)
        setTimeout(retry, obj.CD * 1000)
        return
    }

    if(err[r] == "IS_BANNED") {
        console.log(`retrying login in ${Math.round(obj.RS / 60 / 60)} hours`)
        setTimeout(retry, obj.RS * 1000)
        return
    }

    if (r == 0) {
        //Due to exploits that can break the client this is to give limited access again.
        const timer = setTimeout(() => {
            console.warn("Logged in (without event data)")
            console.warn("Some features will not work.")
            events.emit("load")
        }, 25 * 1000)

        xtHandler.once("sei", () => {
            parentPort.postMessage([ActionType.Started])
            console.log("Logged in")
            events.emit("load")
            clearTimeout(timer)
        })
        setInterval(() => sendXT("pin", "<RoundHouseKick>"), 1000 * 60).unref()
        return
    }
    
    if (r == err["INVALID_LOGIN_TOKEN"]) {
        loginAttempts++
        if (loginAttempts < 30)
            return retry()
    }
    if(botConfig.internalWorker) 
        process.exit(0)
    
    status.hasError = true
    parentPort.postMessage([ActionType.StatusUser, status])
    const userDatabase = new DatabaseSync('./user.db')
    userDatabase.prepare(`UPDATE SubUsers SET state = ? WHERE id = ?`)
        .run(0, botConfig.gameID)
    userDatabase.close()
})

xtHandler.on("sne", obj => {
    obj.MSG.forEach(message => {
        if(message[1] != 67)
            return
        sendXT("dms", JSON.stringify({MID:message[0]}))
    });
})