if (require('node:worker_threads').isMainThread)
    return module.exports = { hidden: true }

const { events } = require("../ggeBot.js")

const {
    ClientCommands,
    KingdomID,
    AreaType,
    castles,
    kingdomInfoList
} = require("../protocols.js")

async function trySendRes() {
    let stormAreaInfo = castles.find(e => e.kingdomID == KingdomID.stormIslands)
    let allowedAIDS = castles.filter(e => e.kingdomID != KingdomID.stormIslands
        && [AreaType.mainCastle, AreaType.externalKingdom].includes(e.areaInfo.type)).map(e => e.id)

    if (!kingdomInfoList.unlockInfo.find(e => e.kingdomID == KingdomID.stormIslands)?.isUnlocked)
        return console.warn("wontRunWithoutStormUnlocked")

    for (let i = 0; i < castles.length; i++) {
        if (stormAreaInfo.wood <= 0 && stormAreaInfo.stone <= 0)
            break

        const castle = castles[i]

        if (castle.kingdomID.includes(KingdomID.berimond, KingdomID.stormIslands))
            continue
        if (!allowedAIDS.includes(castle.areaID))
            continue
        if (kingdomInfoList.resourceTransferList.find(e => e.kingdomID == castle.kingdomID)?.remainingTime > 0)
            continue

        let maxWoodToSend = Math.min(castle.getProductionData.maxAmmountWood - castle.wood, stormAreaInfo.wood)
        let maxStoneToSend = Math.min(castle.getProductionData.maxAmmountStone - castle.stone, stormAreaInfo.stone)

        const G = [
            ["W", maxWoodToSend],
            ["S", maxStoneToSend]
        ].filter(e => e[1] > 0)

        if (G.length == 0)
            continue

        let kingdomInfo = await ClientCommands.getKingdomInfo(stormAreaInfo.areaID, KingdomID.stormIslands, castle.kingdomID, G)()

        if (kingdomInfo.result != 0)
            continue

        stormAreaInfo.wood -= maxWoodToSend
        stormAreaInfo.stone -= maxStoneToSend
        console.log("sentResSend", JSON.stringify(G), "toResSend", KingdomID[castle.kingdomID])

    }
}

events.once("load", async () => {
    trySendRes()
    setInterval(trySendRes, 1000 * 60 * 30)
})