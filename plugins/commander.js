if (require('node:worker_threads').isMainThread)
    return module.exports = { hidden: true }

const { xtHandler, playerInfo, waitForResult } = require('../ggeBot.js')
const { Types } = require('../protocols.js')
const EventEmitter = require('node:events')

const event = new EventTarget()

let commanders = []
let usedCommanders = [] 

function freeCommander(LID) {
    if (LID == undefined)
        return
    let index = usedCommanders.findIndex(e => e == LID)
    if (index == -1)
        return

    usedCommanders.splice(index, 1)
    event.dispatchEvent(new CustomEvent('freedCommander', { detail: LID }))
}
function useCommander(LID) {
    if (LID != undefined && !usedCommanders.includes(LID))
        usedCommanders.push(LID)
    return LID
}

const waitForCommanderAvailable = async (arr, filterCallback, sortCallback) => {
    if(commanders.length == 0) {
        parseGLI((await waitForResult("gli", 1000 * 10))[0].C)
    }
    let usableCommanders = commanders.map(e => new Types.Lord(e))
        .filter(e => ((!arr || arr.includes(e.lordPosition)) &&
            !usedCommanders.includes(e.lordID)))

    if (sortCallback)
        usableCommanders.sort(sortCallback)
    if (filterCallback)
        usableCommanders = usableCommanders.filter(filterCallback)

    let LID = usableCommanders[0]?.lordID

    LID ??= await new Promise(resolve => {
        const checkForCommander = currentEvent => {
            currentEvent.stopImmediatePropagation()
            if(usedCommanders.find(e => e == currentEvent.detail)) {
                debugger
                return
            }
            event.removeEventListener("freedCommander", checkForCommander)
            const com = commanders.find(e => e.ID == currentEvent.detail)
            if ((!arr || arr.includes(com.VIS))
                && (!filterCallback || filterCallback(new Types.Lord(com)))) {
                resolve(currentEvent.detail)
                }
        }
        event.addEventListener("freedCommander", checkForCommander)
    })

    useCommander(LID)
    return new Types.Lord(commanders.find(e => e.ID == LID))
}

let parseGLI = e => commanders = e

xtHandler.on("aci", (obj, r) => !r ? parseGLI(obj.gli.C) : void 0)
xtHandler.on("adi", (obj, r) => !r ? parseGLI(obj.gli.C) : void 0)
xtHandler.on("gli", (obj, r) => !r ? parseGLI(obj.C) : void 0)

xtHandler.on("cat", obj => {
    if (obj.A.M.OID != playerInfo.playerID)
        return

    useCommander(obj?.A?.UM?.L?.ID)

    setTimeout(() => {
        const lordID = obj?.A?.UM?.L?.ID
        let index = usedCommanders.findIndex(e => e == lordID)
        if (index == -1)
            return

        freeCommander(lordID)
    }, (obj.A.M.TT - obj.A.M.PT + 1) * 1000).unref()
})
const returningLords = []
xtHandler.on("gam", async obj => {
    if (playerInfo.playerID == NaN) {
        playerInfo.playerID = await new Promise(resolve => {
            xtHandler.once("gpi", obj => resolve(Number(obj.PID)))
        })
    }
    for (let i = 0; i < obj.M.length; i++) {
        const o = obj.M[i]
        try {
            let lordID = o?.UM?.L?.ID
            if (lordID == undefined)
                continue

            if(!usedCommanders.includes(lordID) && o.M.OID == playerInfo.playerID) 
                useCommander(lordID)
            
            if (returningLords.findIndex(e => e == lordID) == -1 && o.M.SID == playerInfo.playerID) {
                returningLords.push(lordID)
                setTimeout(() => {
                    let index = usedCommanders.findIndex(e => e == lordID)
                    if (index == -1)
                        return
                    
                    returningLords.splice(index, 1)
                    
                    freeCommander(lordID)

                    // movementEvents.emit("return", movementInfo)
                }, (o.M.TT - o.M.PT + 1) * 1000).unref()
            }
        }
        catch (e) {
            console.warn(e)
        }
    }
})

const movementEvents = new EventEmitter()

xtHandler.on("cat", obj => {
    const movementInfo = Types.ReturningAttack(obj)

    setTimeout(() =>
        movementEvents.emit("return", movementInfo),

        movementInfo.movement.movementData.totalTime -
        (movementInfo.movement.movementData.deltaTime -
        Date.now()))
})

module.exports = {
    movementEvents,
    waitForCommanderAvailable,
    useCommander,
    freeCommander
}