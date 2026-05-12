if (require('node:worker_threads').isMainThread)
    return module.exports = { }

const {
    ClientCommands,
    KingdomSkipType,
    KingdomID,
    AreaType,
    castles,
    unlockInfoList
} = require("../protocols.js")
const { spendSkip } = require("./skips.js")
const { events } = require("../ggeBot.js")

const hoursLeftTillRefilMandatory = 2.1
const hoursLeftTillRefilWarning = 3.1
const sendResTimeout = 29 * 30 * 1000
const kingdomID = KingdomID.stormIslands

/**
 * 
 * @param {import("../protocols.js").ClassTypes.CastleInfo} castle 
 * @returns 
 */
const skipResource = async castle => {
    while (castle.troopTransfer?.remainingTime > 0) {
        let skip = spendSkip(castle.troopTransfer.remainingTime)

        if (skip == undefined)
            throw new Error("couldntFindSkip")

        
        if(await ClientCommands.skipResourceTransfer(skip, kingdomID, KingdomSkipType.sendResource) != 0)
            return
    }
}

events.once("load", async () => {
    if(!unlockInfoList.find(e => e.kingdomID == kingdomID)?.isUnlocked)
        return console.warn("wontRunWithoutStormUnlocked")

    const stormCastle = castles.find(e => e.kingdomID == kingdomID &&
        e.areaInfo.type == AreaType.externalKingdom)
    
    const mainCastle = castles.find(({ kingdomID, areaInfo }) => kingdomID == KingdomID.greatEmpire && areaInfo.type == AreaType.mainCastle)

    let checkMead = async () => {
        if (stormCastle.resourceTransfer?.resources.mead)
            stormCastle.mead += stormCastle.resourceTransfer.resources.mead

        let meadLossPerHour = stormCastle.mead / stormCastle.getProductionData.MeadConsumptionRate
        let hoursTillRefill = Math.max(0, meadLossPerHour - hoursLeftTillRefilMandatory)

        if (meadLossPerHour == Infinity || isNaN(meadLossPerHour))
            return console.log("dontNeedToSendMead")

        if (stormCastle.getProductionData.maxAmountMead / stormCastle.getProductionData.MeadConsumptionRate < hoursLeftTillRefilWarning)
            console.warn("notEnoughTimeForMeadReplace", hoursLeftTillRefilWarning, "hoursForFoodMeadReplace")

        if (stormCastle.resourceTransfer?.remainingTime >= 
                (stormCastle.mead - stormCastle.resourceTransfer.resources.mead) / stormCastle.getProductionData.MeadConsumptionRate / 60 / 60) { //TODO: Partial Skipping
            await skipResource(stormCastle)
            stormCastle.resourceTransfer.remainingTime = 0
        }
        else
            console.log("dontNeedMeadForAnother", Math.round(hoursTillRefill), "hoursMeadReplace")

        setTimeout(async () => {
            let amount = Math.floor((stormCastle.getProductionData.maxAmountMead - stormCastle.mead))

            let result = await ClientCommands.kingdomUnitTransfer(
                mainCastle.id,
                KingdomID.greatEmpire,
                kingdomID,
                [["MEAD", amount]])
            if (result == 0)
                console.log("sentMeadReplace", amount, "meadToMeadReplace")
            else
                console.log("failedToSendMead")
            
            setTimeout(checkMead, sendResTimeout)

        }, Math.min(hoursTillRefill * 60 * 60 * 1000, 2147483647))
    }
    checkMead()
})