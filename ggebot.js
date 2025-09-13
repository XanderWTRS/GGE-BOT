process.on('uncaughtException', console.error) //Wanna cry? Remove this.
const { isMainThread, workerData, parentPort } = require('node:worker_threads');
const EventEmitter = require('node:events')
const WebSocket = require('ws')
const ActionType = require("./actions.json")
const error = require("./err.json")
const sqlite3 = require("sqlite3")
const ggeConfig = require("./ggeConfig.json")

if (isMainThread)
    throw Error("This should be running off of the main thread!")

let _console = console
const messageBuffer = []
let messageBufferCount = 0
function mngLog(msg,logLevel) {
    if(logLevel > 0)
       _console.log(msg)
    let now = new Date();
    let hours = now.getHours();
    let minutes = now.getMinutes();
    
    hours = hours < 10 ? '0' + hours : hours;
    minutes = minutes < 10 ? '0' + minutes : minutes;

    messageBuffer[messageBufferCount] = [logLevel, `[${hours + ':' + minutes}] ` + msg]
    messageBufferCount = (messageBufferCount + 1) % 25
    
    parentPort.postMessage([ActionType.GetLogs,[messageBuffer, messageBufferCount]])
}
if (!workerData.internalWorker) {
    console = {}
    console.log = msg => mngLog(msg, 0)
    console.info = msg => mngLog(msg, 0)
    console.warn = msg => mngLog(msg, 1)
    console.error = msg => mngLog(msg, 2)
}

const rawProtocolSeparator = "%"

const xtHandler = new EventEmitter()

function sendXT(cmdName, paramObj) {
    webSocket.send(rawProtocolSeparator + ["xt", ggeConfig.gameServer, cmdName, 1].join(rawProtocolSeparator) + rawProtocolSeparator + paramObj + rawProtocolSeparator)
}

const waitForResult = (key, timeout, func) => new Promise((resolve, reject) => {
    if (timeout == undefined) 
        throw Error(`waitForResult: No timeout specified`)

    func ??= (_, result) => result == 0

    let timer;
    let result;

    if(timeout > 0) {
        timer = setTimeout(() => {
            xtHandler.removeListener(key, helperFunction)
            let msg = (result == undefined || result == 0) ? `Timed out waiting for ${key}` : !error[result] ? result : error[result]
            reject(msg)
        }, timeout)
        timer.unref()
    }

    let helperFunction = (data, _result) => {
        if (result != 0)
            result = _result
        if (!func(data, _result))
            return

        xtHandler.removeListener(key, helperFunction)
        clearInterval(timer)
        resolve([data, _result])
    }

    xtHandler.addListener(key, helperFunction)
})

const webSocket = new WebSocket(ggeConfig.gameURL);
webSocket.onopen = _ => webSocket.send('<msg t="sys"><body action="verChk" r="0"><ver v="166"/></body></msg>')

module.exports = { sendXT, xtHandler, waitForResult, webSocket }

for (const [key,val] of Object.entries(workerData.plugins)) {
    if(!val.state)
        continue
    try {
        require("./plugins/" + key)
    }
    catch(e) {
        console.warn(e)
    }
}

let rollbackBuffer = []
let rollbackBufferCount = 0

webSocket.onmessage = async (e) => {
    let message = e.data.toString()
    if (message.charAt(0) == rawProtocolSeparator) {
        let params = message.substr(1, message.length - 2).split(rawProtocolSeparator)
        let data = params.splice(1, params.length - 1)

        if(data[2] != 0)
            console.warn(`Got result ${error[data[2]] ? error[data[2]] : data[2]} from ${data[0]}`)

        rollbackBuffer[rollbackBufferCount] = [data[0], data[3], data[2]]

        rollbackBufferCount = (rollbackBufferCount + 1) % 250

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
                if(xtHandler.listenerCount(data[0]) == 0)
                    return
                xtHandler.emit(data[0], data[3] ? JSON.parse(data[3]) : undefined, Number(data[2]), "str");
        }
    }
    
    else if (message.charAt(0) == "<") {
        switch (message) {
            case "<msg t='sys'><body action='apiOK' r='0'></body></msg>":
                webSocket.send(`<msg t="sys"><body action="login" r="0"><login z="${ggeConfig.gameServer}"><nick><![CDATA[]]></nick><pword><![CDATA[undefined%en%0]]></pword></login></body></msg>`)
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
webSocket.onerror = () => process.exit(0)
webSocket.onclose = () => process.exit(0)

const status = require("./plugins/status.js");
parentPort.on("message", obj => {
    switch (obj[0]) {
        case ActionType.GetLogs:
            parentPort.postMessage([ActionType.GetLogs, [messageBuffer, messageBufferCount]])
        case ActionType.StatusUser:
            parentPort.postMessage([ActionType.StatusUser, status])
            break
    }
})

let retry =async () => {
    const RCT = await new Promise(resolve => {
        const messageCallback = (obj) => {
            if(obj[0] != ActionType.CAPTCHA)
                return
            parentPort.off('message', messageCallback)
            resolve(obj[1])
        }
        parentPort.on('message', messageCallback)
        parentPort.postMessage([ActionType.CAPTCHA])
    })
    if (workerData.lt) {
        sendXT("lli", JSON.stringify({
            "CONM": 350,
            "RTM": 57,
            "ID": 0,
            "PL": 1,
            "NOM": workerData.name,
            "LT": workerData.lt,
            "LANG": "en",
            "DID": "0",
            "AID": "17254677223212351",
            "KID": "",
            "REF": "https://empire.goodgamestudios.com",
            "GCI": "",
            "SID": 9,
            "PLFID": 1,
            "RCT" : RCT
        }))
    }
    else {
        sendXT("lli", JSON.stringify({
            CONM: 212,
            RTM: 25,
            ID: 0,
            PL: 1,
            NOM: workerData.name,
            PW: workerData.pass,
            LT: null,
            LANG: "en",
            DID: "0",
            AID: "1745592024940879420",
            KID: "",
            REF: "https://empire.goodgamestudios.com",
            GCI: "",
            SID: 9,
            PLFID: 1,
            RCT : RCT
        }))
    }
}
xtHandler.on("vck", async _ => {
    await retry()
})

xtHandler.on("rlu", _ => webSocket.send('<msg t="sys"><body action="autoJoin" r="-1"></body></msg>'))

let loginAttempts = 0
xtHandler.on("lli", (_,r) => {
    if(r == 453)
    {
	console.log(`Timed out for: ${_.CD}`)
        setTimeout(() => retry(), _.CD * 1000)
    }
    if (r == 0) {
        parentPort.postMessage([ActionType.Started])
        console.log("Logged in")
        return
    }
    //Really need to account for gge's new timeout
    if (r == error["INVALID_LOGIN_TOKEN"]) {
        loginAttempts++
        if (loginAttempts < 30)
            return retry()
    }
    if(workerData.internalWorker) 
        process.exit(0)

    let userDatabase = new sqlite3.Database("./user.db", sqlite3.OPEN_READWRITE)
    status.hasError = true
    parentPort.postMessage([ActionType.StatusUser, status])
    userDatabase.run(`UPDATE SubUsers SET state = ? WHERE id = ?`, [0, workerData.id], _ => {
        userDatabase.close()
    })
})