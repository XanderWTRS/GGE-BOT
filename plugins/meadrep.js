const { isMainThread } = require('node:worker_threads')

const name = "Mead replace"

if (isMainThread)
    return module.exports = {
        name: name,
        description: "Mead replace",
    }

const {
    ClientCommands,
    KingdomSkipType,
    MinuteSkipType,
    KingdomID,
    AreaType,
    getResourceCastleList,
    getKingdomInfoList
} = require("../protocols.js")

const { events } = require("../ggebot")

let hoursLeftTillRefilMandatory = 2.1
let hoursLeftTillRefilWarning = 3.1
let sendResTimeout = 29 * 30 * 1000
let targetKingdomID = KingdomID.stormIslands

events.once("load", async () => {
    let kingdomInfoList = await getKingdomInfoList()
    let resourceCastleList = await getResourceCastleList()

    if (!kingdomInfoList.unlockInfo.find(e => e.kingdomID == KingdomID.stormIslands)?.isUnlocked)
        return console.warn(`[${name}] refusing to run without Storm Islands unlocked`)

    let checkMead = async () => {
        let dcl = await ClientCommands.getDetailedCastleList()()
        let stormAreaID = resourceCastleList.castles.find(e => e.kingdomID == targetKingdomID)
            .areaInfo.find(e => e.type == AreaType.externalKingdom)
            .extraData[0] // AreaID

        let resource = kingdomInfoList.resourceTransferList.find(e => e.kingdomID == targetKingdomID)
        let stormAreaInfo = dcl.castles.find(e => e.kingdomID == targetKingdomID).areaInfo.find(ai => ai.areaID == stormAreaID)

        let resourceMead = resource?.resources?.find(e => e.type == "MEAD")
        if (resourceMead)
            stormAreaInfo.mead += resourceMead.count

        let meadLossPerHour = stormAreaInfo.mead / stormAreaInfo.getProductionData.MeadConsumptionRate
        let hoursTillRefill = Math.max(0, meadLossPerHour - hoursLeftTillRefilMandatory)

        if (meadLossPerHour == Infinity || isNaN(meadLossPerHour))
            return console.log(`[${name}] Will never need to send mead`)

        if (stormAreaInfo.getProductionData.maxAmmountMead / stormAreaInfo.getProductionData.MeadConsumptionRate < hoursLeftTillRefilWarning)
            console.warn(`[${name}] Please aim above ${hoursLeftTillRefilWarning} hours I won't work well under that`)

        if (resource?.remainingTime >= (stormAreaInfo.mead - (resourceMead ? resourceMead.count : 0)) / stormAreaInfo.getProductionData.MeadConsumptionRate / 60 / 60) { //TODO: Partial Skipping
            console.log(`[${name}] Using ${Math.floor(resource.remainingTime / 60 / 30)} 30 minute skips`)
            for (let i = 0; i < resource.remainingTime / 60 / 30; i++) {
                await ClientCommands.getMinuteSkipKingdom(MinuteSkipType.MS3, targetKingdomID, KingdomSkipType.sendResource)()
            }
            resource.remainingTime = 0
        }
        else
            console.log(`[${name}] Don't need to send mead for another ${Math.round(hoursTillRefill)} hours`)


        setTimeout(async () => {
            let dcl = await ClientCommands.getDetailedCastleList()()
            let stormAreaID = resourceCastleList.castles.find(e => e.kingdomID == targetKingdomID)
                .areaInfo.find(e => e.type == AreaType.externalKingdom)
                .extraData[0] // AreaID

            let stormAreaInfo = dcl.castles.find(e => e.kingdomID == targetKingdomID).areaInfo.find(ai => ai.areaID == stormAreaID)

            let ammount = Math.floor((stormAreaInfo.getProductionData.maxAmmountMead - stormAreaInfo.mead))
            let mainCastleAreaID = resourceCastleList.castles.find(e => e.kingdomID == KingdomID.greatEmpire)
                .areaInfo.find(e => e.type == AreaType.mainCastle).extraData[0]

            let info = await ClientCommands.getKingdomInfo(
                mainCastleAreaID,
                KingdomID.greatEmpire,
                targetKingdomID,
                [["MEAD", ammount]]
            )()
            if (info.result == 0)
                console.log(`[${name}] Sent ${ammount} mead to ${KingdomID[targetKingdomID]}`)
            else
                console.log(`[${name}] Failed to send ${ammount} mead to ${KingdomID[targetKingdomID]}`)
            setTimeout(checkMead, sendResTimeout)

        }, Math.min(hoursTillRefill * 60 * 60 * 1000, 2147483647))
    }
    checkMead()
})