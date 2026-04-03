if (require('node:worker_threads').isMainThread)
    return module.exports = { hidden : true }

const {
    ClientCommands,
    KingdomSkipType,
    KingdomID,
    AreaType,
    kingdomInfoList,
    castles
} = require("../protocols.js")

const { events } = require("../ggeBot.js")

const hoursLeftTillRefilMandatory = 2.1
const hoursLeftTillRefilWarning = 3.1
const sendResTimeout = 29 * 30 * 1000
const targetKingdomID = KingdomID.stormIslands

events.once("load", async () => {
    if (!kingdomInfoList.unlockInfo.find(e => e.kingdomID == KingdomID.stormIslands)?.isUnlocked)
        return console.warn("wontRunWithoutStormUnlocked")

    const stormAreaInfo = castles.find(e => e.kingdomID == targetKingdomID &&
        e.areaInfo.type == AreaType.externalKingdom)

    let checkMead = async () => {
        let resource = kingdomInfoList.resourceTransferList.find(e => e.kingdomID == targetKingdomID)

        let resourceMead = resource?.resources?.find(e => e.type == "MEAD")
        if (resourceMead)
            stormAreaInfo.mead += resourceMead.count

        let meadLossPerHour = stormAreaInfo.mead / stormAreaInfo.getProductionData.MeadConsumptionRate
        let hoursTillRefill = Math.max(0, meadLossPerHour - hoursLeftTillRefilMandatory)

        if (meadLossPerHour == Infinity || isNaN(meadLossPerHour))
            return console.log("dontNeedToSendMead")

        if (stormAreaInfo.getProductionData.maxAmmountMead / stormAreaInfo.getProductionData.MeadConsumptionRate < hoursLeftTillRefilWarning)
            console.warn("notEnoughTimeForMeadReplace", hoursLeftTillRefilWarning, "hoursForFoodMeadReplace")

        if (resource?.remainingTime >= (stormAreaInfo.mead - (resourceMead ? resourceMead.count : 0)) / stormAreaInfo.getProductionData.MeadConsumptionRate / 60 / 60) { //TODO: Partial Skipping
            for (let i = 0; i < resource.remainingTime / 60 / 30; i++) {
                await ClientCommands.getMinuteSkipKingdom("MS3", targetKingdomID, KingdomSkipType.sendResource)()
            }
            resource.remainingTime = 0
        }
        else
            console.log("dontNeedMeadForAnother", Math.round(hoursTillRefill), "hoursMeadReplace")

        setTimeout(async () => {
            let ammount = Math.floor((stormAreaInfo.getProductionData.maxAmmountMead - stormAreaInfo.mead))
            let mainCastleAreaID = castles.find(e => e.kingdomID == KingdomID.greatEmpire && e.areaInfo.type == AreaType.mainCastle)

            let info = await ClientCommands.getKingdomInfo(
                mainCastleAreaID,
                KingdomID.greatEmpire,
                targetKingdomID,
                [["MEAD", ammount]]
            )()
            if (info.result == 0)
                console.log("sentMeadReplace", ammount, "meadToMeadReplace")
            else
                console.log("failedToSendMead")
            
            setTimeout(checkMead, sendResTimeout)

        }, Math.min(hoursTillRefill * 60 * 60 * 1000, 2147483647))
    }
    checkMead()
})