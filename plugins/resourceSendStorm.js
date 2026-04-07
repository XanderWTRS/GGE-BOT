if (require('node:worker_threads').isMainThread)
    return module.exports = { hidden: true }

const { events } = require("../ggeBot.js")

const {
    ClientCommands,
    KingdomID,
    AreaType,
    castles,
    unlockInfoList
} = require("../protocols.js")

async function trySendRes() {
    if (!unlockInfoList.find(e => e.kingdomID == KingdomID.stormIslands)?.isUnlocked)
        return console.warn("wontRunWithoutStormUnlocked")

    let stormCastle = castles.find(e => e.kingdomID == KingdomID.stormIslands)
    let allowedAIDS = castles.filter(e => e.kingdomID != KingdomID.stormIslands
        && [AreaType.mainCastle, AreaType.externalKingdom].includes(e.areaInfo.type)).map(e => e.id)

    for (let i = 0; i < castles.length; i++) {
        if (stormCastle.wood <= 0 && stormCastle.stone <= 0)
            break

        const castle = castles[i]

        if ([KingdomID.berimond, KingdomID.stormIslands].includes(castle.kingdomID))
            continue
        if (!allowedAIDS.includes(castle.areaID))
            continue
        if (castle.resourceTransfer?.remainingTime > 0)
            continue

        let maxWoodToSend = Math.min(castle.getProductionData.maxAmountWood - castle.wood, stormCastle.wood)
        let maxStoneToSend = Math.min(castle.getProductionData.maxAmountStone - castle.stone, stormCastle.stone)

        const G = [
            ["W", maxWoodToSend],
            ["S", maxStoneToSend]
        ].filter(e => e[1] > 0)

        if (G.length == 0)
            continue

        let result = await ClientCommands.kingdomUnitTransfer(stormCastle.areaID, KingdomID.stormIslands, castle.kingdomID, G)
        
        if (result != 0)
            continue

        stormCastle.wood -= maxWoodToSend
        stormCastle.stone -= maxStoneToSend
        stormCastle.emit("resourceUpdate")
        console.log("sentResSend", JSON.stringify(G), "toResSend", KingdomID[castle.kingdomID])

    }
}

events.once("load", async () => {
    trySendRes()
    setInterval(trySendRes, 1000 * 60 * 30)
})