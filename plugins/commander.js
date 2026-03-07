if (require('node:worker_threads').isMainThread)
    return module.exports = { hidden: true }

const { xtHandler, playerInfo } = require('../ggeBot.js')
const { Types } = require('../protocols.js')
const EventEmitter = require('node:events')

const event = new EventTarget()

let commanders = []
let usedCommanders = [] 

function freeCommander(LID) {
    let index = usedCommanders.findIndex(e => e == LID)
    if (index == -1)
        return

    usedCommanders.splice(index, 1)
    event.dispatchEvent(new CustomEvent('freedCommander', { detail: LID }))
}
function useCommander(LID) {
    if (!usedCommanders.includes(LID))
        usedCommanders.push(LID)
    return LID
}

const waitForCommanderAvailable = async (arr, filterCallback, sortCallback) => {
    if (commanders.length == 0) {
        commanders = (await waitForResult("gli", 1000 * 10))[0].C
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
            const com = commanders.find(e => e.ID == currentEvent.detail)
            if(!arr)
                return resolve(currentEvent.detail)
            if(!arr.includes(com.VIS))
                return
            if(!(!filterCallback || filterCallback(new Types.Lord(com))))
                return

            event.removeEventListener("freedCommander", checkForCommander)
            currentEvent.stopImmediatePropagation()
            resolve(currentEvent.detail)
        }
        event.addEventListener("freedCommander", checkForCommander)
    })

    useCommander(LID)
    return new Types.Lord(commanders.find(e => e.ID == LID))
}

xtHandler.on("aci", (obj, r) => !r ? commanders = obj.gli.C : void 0)
xtHandler.on("adi", (obj, r) => !r ? commanders = obj.gli.C : void 0)
xtHandler.on("gli", (obj, r) => !r ? commanders = obj.C : void 0)

const movementEvents = new EventEmitter()

xtHandler.on("cat", obj => {
    const movementInfo = Types.ReturningAttack(obj)
    const movement = movementInfo.movement
    const lordID = movement.lordMovement.lord.lordID

    if (movement.movementData.ownerID != playerInfo.playerID)
        return
    
    useCommander(lordID)

    setTimeout(() => {
        if (usedCommanders.findIndex(e => e == lordID) == -1)
            return
        
        freeCommander(lordID)

        movementEvents.emit("return", movementInfo)
    }, movementInfo.movement.movementData.totalTime -
        (movementInfo.movement.movementData.deltaTime - Date.now()) + 1000).unref()
})
xtHandler.on("gam", async obj => {
    if (playerInfo.playerID == NaN) {
        playerInfo.playerID = await new Promise(resolve => {
            xtHandler.once("gpi", obj => resolve(Number(obj.PID)))
        })
    }
    const allMovements = Types.GetAllMovements(obj)

    allMovements.movements.forEach(movement => {
        const lordID = movement.lordMovement?.lord?.lordID
        
        if(movement.movementData.ownerID == playerInfo.playerID)
            useCommander(lordID)

        if (usedCommanders.findIndex(e => e == lordID) == -1 && movement.movementData.ownerID == playerInfo.playerID) {
            setTimeout(() => {
                if (usedCommanders.findIndex(e => e == lordID) == -1)
                    return

                freeCommander(lordID)
                
                movementEvents.emit("return", { movement, ownerInfo: allMovements.ownerInfo})
            }, (movement.movementData.totalTime - (movement.movementData.deltaTime - Date.now())) + 1000).unref()
        }
    })
})

module.exports = {
    movementEvents,
    waitForCommanderAvailable,
    useCommander,
    freeCommander
}