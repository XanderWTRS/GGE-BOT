if (require('node:worker_threads').isMainThread) {
    module.exports = {
        pluginOptions: [
            {
                type: "Text",
                key: "feastFoodReduction",
                default: "150000"
            },
            {
                type: "Text",
                key: "minimumFood",
                default: "150000"
            },
            {
                type: "Text",
                key: "minimumFoodRate",
                default: "0"
            },
        ]
    }
    return
}

const { ClientCommands, KingdomID, AreaType, castles } = require("../protocols.js")
const { events, botConfig } = require("../ggeBot.js")
const pluginOptions = botConfig.plugins[require('path').basename(__filename).slice(0, -3)] ?? {}
const feastFoodReduction = pluginOptions.feastFoodReduction ? Number(pluginOptions.feastFoodReduction): 150000
const minimumFood = pluginOptions.minimumFood ? Number(pluginOptions.minimumFood): 150000
const minimumFoodRate = pluginOptions.minimumFoodRate ? Number(pluginOptions.minimumFoodRate) : 0

const tryToFeast = async () => {
    let mainCastleAreaID = castles.find(e => e.kingdomID == KingdomID.greatEmpire && e.type == AreaType.mainCastle).id
    let feasts = 0

    castles.forEach(areaInfo => {
        if(areaInfo.kingdomID == KingdomID.stormIslands)
            return
        if (areaInfo.kingdomID == KingdomID.berimond)
            return

        let foodRate = areaInfo.getProductionData.deltaFood - areaInfo.getProductionData.FoodConsumptionRate * 
            areaInfo.getProductionData.foodConsumptionReductionPercentage
        if (foodRate < Math.max(0, minimumFoodRate))
            return
        if (areaInfo.id == mainCastleAreaID && areaInfo.getProductionData.maxAmmountFood < areaInfo.food)
            return
        while (minimumFood < (areaInfo.food - feastFoodReduction) && feastFoodReduction <= areaInfo.food) {
            ClientCommands.startFeast(8, areaInfo.areaID, areaInfo.kingdomID)
            feasts++
            areaInfo.food -= feastFoodReduction
        }
    })

    if (feasts > 0)
        console.log("consumed", feastFoodReduction * feasts)
    else {
        console.log("notEnoughFoodToFeast")
    }
}

events.once("load", () => {
    setInterval(tryToFeast, 1000 * 60 * 8)
    tryToFeast()
})