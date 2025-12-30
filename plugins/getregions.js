const { isMainThread } = require('node:worker_threads');
const name = "GetRegion"

if (isMainThread)
    return module.exports = {
        name: name,
        hidden: true
    };

const { xtHandler, sendXT, events } = require("../ggebot")
const EventEmitter = require('node:events')

class TargetType {
    event = new EventEmitter()
    kid = 0
    x = 0
    y = 0
    ai = []
    updateTimer
    updateRealtime
    timeSinceRequest = 0
}

let mapObjects = []
let _mapObjects = []

function resetMapObjects() {
    _mapObjects.forEach((kingdom, index) => {
        for(type in kingdom)
        {
            for(targetType in kingdom[type])
            {
                if (isNaN(targetType))
                    return

                kingdom[type][targetType].updateRealtime = false
            }
        }
    })
    _mapObjects.length = 0
    mapObjects.length = 0
    for (let i = 0; i <= 4; i++) {
        mapObjects.push(new Proxy(_mapObjects[_mapObjects.push({}) - 1], {
            get(target, prop) {
                let num = new Number(prop)

                if (isNaN(num))
                    return target[num]

                return target[`${num}`] ??= { event : new EventEmitter() }
            }
        }))
    }
}
let whiteList = []

function addToWhiteList(type) {
    if(whiteList.includes(type))
        return 
    whiteList.push(type)
}

resetMapObjects() 

let getTowers = () => {
    let _getTowers = async () => {
        for (let kid = 1; kid <= 4; kid++) {
            for (let x = 0; x < 1286; x += 100) {
                for (let y = 0; y < 1286; y += 100) {
                    sendXT("gaa", JSON.stringify(
                        {
                            KID: kid,
                            AX1: x,
                            AX2: x + 100,
                            AY1: y,
                            AY2: y + 100
                        }), "str")
                }
            }
        }
    }

    let recievedData = false
    let retryAttempts = 0
    xtHandler.once("gaa", () => { recievedData = true; retryAttempts = 0; })
    let timer = setInterval(() => {
        if (recievedData == true)
            return clearInterval(timer)

        if (retryAttempts >= 5) {
            clearInterval(timer)
            throw new Error("Failed to get area data")
        }

        console.warn("Failed to get area data retrying...")
        retryAttempts++
        _getTowers()
    }, 1000 * 16)

    _getTowers()
}

events.once("load", async () => {
    setInterval(getTowers, 1800 * 1000).unref()
    getTowers()
})

xtHandler.on("gaa", obj => {
    obj?.AI?.forEach(e => {
        let type = e.shift()
        let x = e.shift()
        let y = e.shift()

        if (!whiteList.includes(type))
            return
        /**@type {TargetType} */
        let mapObject = mapObjects[obj.KID][type][`${x}:${y}`] ??= new TargetType()
        mapObject.ai = e;
        mapObject.kid = obj.KID
        mapObject.x = x
        mapObject.y = y
        mapObject.timeSinceRequest = Date.now()
        Object.defineProperty(mapObject, 'updateRealtime', {
            set: function (bool) {
                if ((!!this.updateTimer) == bool)
                    return;

                if (!bool) {
                    clearInterval(this.updateTimer)
                    this.updateTimer = undefined
                    return
                }

                this.updateTimer = setInterval(async () => {
                    sendXT("gaa", JSON.stringify(
                        {
                            KID: this.kid,
                            AX1: this.x,
                            AX2: this.x,
                            AY1: this.y,
                            AY2: this.y
                        }), "str")
                }, 32 * 1000)
            },
            get: function () {
                return !!this.updateTimer
            }
        })
        mapObjects[obj.KID][type].event.emit("update", mapObject);

        mapObject.event.emit("update", mapObject);
    })
})

module.exports = { TargetType, mapObjects,_mapObjects, addToWhiteList }
