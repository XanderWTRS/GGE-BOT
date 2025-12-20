const name = "commander"

if (require('node:worker_threads').isMainThread)
    return module.exports = {name, hidden: true }

//Failing here Lord ID not properly aqquired
//This thing is gonna give you a stroke...

const { xtHandler, sendXT, waitForResult, events } = require("../ggebot")
const playerid = require("./playerid.js")
const { Types } = require("../protocols.js")
const EventEmitter = require('node:events')

const event = new EventTarget()

let gamResolverHasResolved = false
let gamResolver = Promise.withResolvers()
let gliResolverHasResolved = false
let gliResolver = Promise.withResolvers()

let commanders = gliResolver.promise //SAME AS THIS
let usedCommanders = gamResolver.promise //THIS MUST BE RESOLVED 

async function freeCommander(LID) {
    if (LID == undefined)
        return
    let index = (await usedCommanders).findIndex(e => e == LID)
    if (index == -1)
        return

    (await usedCommanders).splice(index, 1)
    event.dispatchEvent(new CustomEvent('freedCommander', { detail: LID }))
}
async function useCommander(LID) {
    let usedCommandersR = await usedCommanders

    if (LID != undefined && !usedCommandersR.includes(LID))
        usedCommandersR.push(LID)
    return LID
}

const waitForCommanderAvailable = async (arr, filterCallback, sortCallback) => { //THE FUCK IS WRONG WITH ME YOU ARE SATAN DARREN
    let usedCommandersR = await usedCommanders
    /** @type {Array} */
    let commandersR = await commanders
    let usableCommanders = commandersR.map(e => new Types.Lord(e))
        .filter(e => ((!arr || arr.includes(e.lordPosition)) &&
        !usedCommandersR.includes(e.lordID)))

    if(sortCallback) 
        usableCommanders.sort(sortCallback)
    if(filterCallback)
        usableCommanders.sort(filterCallback)

    let LID = usableCommanders[0]?.lordID

    LID ??= await new Promise(resolve => {
        let checkForCommander = async currentEvent => {
            currentEvent.stopPropagation()
            event.removeEventListener("freedCommander", checkForCommander)
            if (!arr || arr.includes(commandersR.find(e => e.ID == currentEvent.detail).VIS)
                && filterCallback(new Types.Lord(e))) {
                resolve(currentEvent.detail)
            }
        }
        event.addEventListener("freedCommander", checkForCommander)
    })

    useCommander(LID)
    return new Types.Lord(commandersR.find(e => e.ID == LID))
}

events.once("load", async () => {
    let parseGLI = (gli) => {
        //I don't like
        //Need to change the resolved objects inner items instead of itself
        if (gliResolverHasResolved) {
            commanders = Promise.resolve(gli) 
            return
        }
        gliResolverHasResolved = true
        gliResolver.resolve(gli)
    }

    xtHandler.on("aci", (obj, r) => !r ? parseGLI(obj.gli.C) : void 0)
    xtHandler.on("adi", (obj, r) => !r ? parseGLI(obj.gli.C) : void 0)
    xtHandler.on("gli", (obj, r) => !r ? parseGLI(obj.C) : void 0)

    xtHandler.on("cat", async (obj) => {
        if (obj.A.M.TA[4] != await playerid)
            return

        useCommander(obj?.A?.UM?.L?.ID)
        setTimeout(() => freeCommander(obj?.A?.UM?.L?.ID), (obj.A.M.TT - obj.A.M.PT + 1) * 1000).unref()
    })
    let usedCommanders = []
    xtHandler.on("gam", async (obj) => {
        let useCommander = (LID) => {
            if (LID != undefined && !usedCommanders.includes(LID))
                usedCommanders.push(LID)
            return LID
        }

        for (let i = 0; i < obj.M.length; i++) {
            const o = obj.M[i];
            if (o.M.SA[4] != await playerid)
                continue

            let lordID = o?.UM?.L?.ID
            if(lordID == undefined)
                continue

            if(usedCommanders.includes(lordID))
                continue
            useCommander(lordID)
        }
        for (let i = 0; i < obj.M.length; i++) {
            const o = obj.M[i];
            try {
            if (o.M.TA[4] != await playerid)
                continue
            if (o.M.T != 2)
                continue
            let lordID = o?.UM?.L?.ID
            if(lordID == undefined)
                continue

            if(usedCommanders.includes(lordID))
                continue

            useCommander(lordID)
            setTimeout(() => freeCommander(lordID),
                (o.M.TT - o.M.PT + 1) * 1000).unref()
            }
            catch(e) {
                
            }
        }

        if (gamResolverHasResolved) {
            usedCommanders.forEach(async LID => {
                await useCommander(LID)
            })
            return
        }
        gamResolverHasResolved = true
        gamResolver.resolve(usedCommanders)
    })

    sendXT("gli", JSON.stringify({}))
})

const movementEvents = new EventEmitter()

xtHandler.on("cat", obj => {
    const movementInfo = Types.ReturningAttack(obj)
    
    setTimeout(() => 
        movementEvents.emit("return", movementInfo), 
    
    movementInfo.movement.movement.totalTime -
    movementInfo.movement.movement.deltaTime -
    new Date().getTime())
})

module.exports = {
    movementEvents,
    waitForCommanderAvailable,
    useCommander,
    freeCommander,
    gli : async() => await commanders
}