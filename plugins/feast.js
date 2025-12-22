const { isMainThread } = require('node:worker_threads')
const { botConfig } = require("../ggebot")
const name = "Feast"
if (isMainThread) {
    module.exports = {
        name: name,
        description: "Triggers feast",
        pluginOptions: [
            {
                type: "Text",
                label: "Feast Food Reduction",
                key: "feastFoodReduction",
                default: 150000
            },
            {
                type: "Text",
                label: "Minimum Food",
                key: "minimumFood",
                default: 150000
            },
            {
                type: "Text",
                label: "Minimum Food rate",
                key: "minimumFoodRate",
                default: 0
            },
        ]
    }
    return
}

const { events } = require("../ggebot")

const pluginOptions = botConfig.plugins[require('path').basename(__filename).slice(0, -3)] ??= {}
const { ClientCommands, getResourceCastleList, KingdomID, AreaType } = require("../protocols.js")
const feastFoodReduction = pluginOptions.feastFoodReduction ? Number(pluginOptions.feastFoodReduction): 150000
const minimumFood = pluginOptions.minimumFood ? Number(pluginOptions.minimumFood): 150000
const minimumFoodRate = pluginOptions.minimumFoodRate ? Number(pluginOptions.minimumFoodRate) : 0
events.once("load", async () => {
    let dcl = await ClientCommands.getDetailedCastleList()()
    let resourceCastleList = await getResourceCastleList()
    let mainCastleAreaID = Number(resourceCastleList.castles.find(e => e.kingdomID == KingdomID.greatEmpire)
        .areaInfo.find(e => e.type == AreaType.mainCastle)
        .extraData[0])
    let feasts = 0

    dcl.castles.forEach(castle => {
        if(castle.kingdomID == KingdomID.stormIslands)
            return
        if(castle.kingdomID == KingdomID.berimond)
            return
        
        castle.areaInfo.forEach(areaInfo => {
            let foodRate = areaInfo.getProductionData.deltaFood - areaInfo.getProductionData.FoodConsumptionRate * areaInfo.getProductionData.foodConsumptionReductionPercentage
            if (foodRate < Math.max(0, minimumFoodRate))
                return
            if (areaInfo.areaID == mainCastleAreaID && areaInfo.getProductionData.maxAmmountFood < areaInfo.food)
                return
            while (minimumFood < (areaInfo.food - feastFoodReduction) && feastFoodReduction <= areaInfo.food) {
                ClientCommands.startFeast(8, areaInfo.areaID, castle.kingdomID)()
                feasts++
                areaInfo.food -= feastFoodReduction
            }
        })
    })

    if (feasts > 0)
        console.log(`[${name}] Feasted ${feastFoodReduction * feasts} food`)
    else {
        console.log(`[${name}] Not enough food to feast`)
    }
})