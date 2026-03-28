
if (require('node:worker_threads').isMainThread) {
    return module.exports = {
        force: true,
        hidden: true
    }
}

const { xtHandler, sendXT} = require("../ggeBot")

const quests = [3000, 3002, 3019, 3490, 84]
const messageIds = [67]

xtHandler.on("sne", obj => obj.MSG.forEach(([messageID, messageType]) => {
    if(messageIds.includes(messageType))
        sendXT("dms", JSON.stringify({ MID: messageID })) 
}))

xtHandler.on("qli", obj => obj.QL.forEach(({ QID }) => {
    if(quests.includes(QID))
        sendXT("qsc", JSON.stringify({ QID }))
}))