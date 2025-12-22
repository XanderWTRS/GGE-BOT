const name = "commander"

if (require('node:worker_threads').isMainThread)
    return module.exports = { name, hidden: true }

const { xtHandler, sendXT, events, playerInfo } = require("../ggebot")
const { Types } = require("../protocols.js")
const EventEmitter = require('node:events')

const event = new EventTarget()

let commanders = []
let usedCommanders = [] 

function freeCommander(LID) {
    console.debug(`Freeing ${LID}`)
    if (LID == undefined)
        return
    let index = usedCommanders.findIndex(e => e == LID)
    if (index == -1)
        return

    usedCommanders.splice(index, 1)
    event.dispatchEvent(new CustomEvent('freedCommander', { detail: LID }))
}
function useCommander(LID) {
    console.debug(`Using ${LID}`)
    if (LID != undefined && !usedCommanders.includes(LID))
        usedCommanders.push(LID)
    return LID
}

const waitForCommanderAvailable = async (arr, filterCallback, sortCallback) => {
    let usableCommanders = commanders.map(e => new Types.Lord(e))
        .filter(e => ((!arr || arr.includes(e.lordPosition)) &&
            !usedCommanders.includes(e.lordID)))

    if (sortCallback)
        usableCommanders.sort(sortCallback)
    if (filterCallback)
        usableCommanders.sort(filterCallback)

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
            if (!arr || arr.includes(com.VIS)
                && (!filterCallback || filterCallback(new Types.Lord(com)))) {
                resolve(currentEvent.detail)
                }
        }
        event.addEventListener("freedCommander", checkForCommander)
    })

    useCommander(LID)
    return new Types.Lord(commanders.find(e => e.ID == LID))
}

events.once("load", () => {
    let parseGLI = e => commanders = e

    xtHandler.on("aci", (obj, r) => !r ? parseGLI(obj.gli.C) : void 0)
    xtHandler.on("adi", (obj, r) => !r ? parseGLI(obj.gli.C) : void 0)
    xtHandler.on("gli", (obj, r) => !r ? parseGLI(obj.C) : void 0)

    xtHandler.on("cat", obj => {
        if (obj.A.M.TA[4] != playerInfo.playerID)
            return

        if (usedCommanders.includes(obj?.A?.UM?.L?.ID))
            return

        useCommander(obj?.A?.UM?.L?.ID)

        setTimeout(() => freeCommander(obj?.A?.UM?.L?.ID),
            (obj.A.M.TT - obj.A.M.PT + 1) * 1000).unref()
    })
    xtHandler.on("gam", (obj) => {
        for (let i = 0; i < obj.M.length; i++) {
            const o = obj.M[i];
            if (o.M.SA[4] != playerInfo.playerID)
                continue

            let lordID = o?.UM?.L?.ID
            if (lordID == undefined)
                continue

            if (usedCommanders.includes(lordID))
                continue
            
            useCommander(lordID)
        }
        for (let i = 0; i < obj.M.length; i++) {
            const o = obj.M[i];
            try {
                if (o.M.TA[4] != playerInfo.playerID)
                    continue
                if (o.M.T != 2)
                    continue
                let lordID = o?.UM?.L?.ID
                if (lordID == undefined)
                    continue

                if (usedCommanders.includes(lordID))
                    continue

                useCommander(lordID)
                
                setTimeout(() => freeCommander(lordID), 
                    (o.M.TT - o.M.PT + 1) * 1000).unref()
            }
            catch (e) {
                console.warn(e)
            }
        }
    })
})

const movementEvents = new EventEmitter()

xtHandler.on("cat", obj => {
    const movementInfo = Types.ReturningAttack(obj)

    setTimeout(() =>
        movementEvents.emit("return", movementInfo),

        movementInfo.movement.movement.totalTime -
        (movementInfo.movement.movement.deltaTime -
        new Date().getTime()))
})

module.exports = {
    movementEvents,
    waitForCommanderAvailable,
    useCommander,
    freeCommander
}