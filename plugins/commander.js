if (require('node:worker_threads').isMainThread)
    return module.exports = { hidden: true }

const { xtHandler, playerInfo, waitForResult } = require('../ggeBot.js')
const { ClassTypes : { Lord }, movementEvents } = require('../protocols.js')

const event = new EventTarget()
/** @type {Array<Number>} */
let usedCommanders = []
/** @type {Array<import("../protocols.js").ClassTypes.Lord>} */
let commanders = []

xtHandler.on("gli", (obj, r) => !r ? 
    commanders = Array.from(obj.C).map(e => new Lord(e)) : undefined)

function freeCommander(lordID) {
    const index = usedCommanders.findIndex(e => e == lordID)
    if (index == -1)
        return
    
    usedCommanders.splice(index, 1)
    event.dispatchEvent(new CustomEvent('freedCommander', { detail: lordID }))
}
function useCommander(lordID) {
    if (!usedCommanders.includes(lordID))
        usedCommanders.push(lordID)
    
    return lordID
}

movementEvents.on("outgoing", (/** @type {import("../protocols.js").ClassTypes.Movement} */ movement) => {
    if(movement.owner.ownerID != playerInfo.playerID)
        return

    // console.log(`using: ${movement.lord.lordID}`)

    useCommander(movement.lord.lordID)
})

movementEvents.on("return", (/** @type {import("../protocols.js").ClassTypes.Movement} */ movement) => {
    if (movement.targetOwner.ownerID != playerInfo.playerID)
        return

    // console.log(`freeing: ${movement.lord.lordID}`)

    freeCommander(movement.lord.lordID)
})
/**
 * 
 * @param {string} commanderWhitelist 
 * @param {filterCallback} filterCallback 
 * @param {sortCallback} sortCallback 
 * @returns 
 */

const waitForCommanderAvailable = async (commanderWhitelist, filterCallback, sortCallback) => {
    if (![, 0, ""].includes(commanderWhitelist) &&
        !Array.isArray(commanderWhitelist)) {
        commanderWhitelist = commanderWhitelist.split(",").map(e => {
            let [start, end] = e.split("-").map(Number)
            
            return Array.from({ length: (end ?? start) - start + 1 }, (_, i) => start + i - 1)
        }).flat()
    }

    if (commanders.length == 0)
        commanders = Array.from((await waitForResult("gli", 1000 * 10))[0].C)
            .map(e => new Lord(e))

    let usableCommanders = commanders.filter(e => 
        ((!commanderWhitelist || commanderWhitelist.includes(e.lordPosition)) &&
            !usedCommanders.includes(e.lordID)))

    if (sortCallback)
        usableCommanders.sort(sortCallback)
    if (filterCallback)
        usableCommanders = usableCommanders.filter(filterCallback)

    let lordID = usableCommanders[0]?.lordID

    lordID ??= await new Promise(resolve => {
        const checkForCommander = currentEvent => {
            const commander = commanders.find(e => e.lordID == currentEvent.detail)
            if(commanderWhitelist && !commanderWhitelist.includes(commander.lordPosition))
                return
            if(!(!filterCallback || filterCallback(commander)))
                return

            event.removeEventListener("freedCommander", checkForCommander)
            currentEvent.stopImmediatePropagation()
            resolve(currentEvent.detail)
        }
        event.addEventListener("freedCommander", checkForCommander)
    })

    useCommander(lordID)
    return commanders.find(e => e.lordID == lordID)
}

/**
 * @callback filterCallback
 * @param {import("../protocols.js").ClassTypes.Lord}
 * @callback sortCallback
 * @param {import("../protocols.js").ClassTypes.Lord}
 * @param {import("../protocols.js").ClassTypes.Lord}
 */

module.exports = {
    movementEvents,
    waitForCommanderAvailable,
    useCommander,
    freeCommander
}