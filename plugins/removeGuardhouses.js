if (require('node:worker_threads').isMainThread)
    return module.exports = {
    }

const { waitForResult, xtHandler, sendXT, events } = require("../ggeBot")
const buildings = require("../items/buildings.json")
const { spendSkip, Types, MinuteSkipType, ClientCommands, KingdomID, kingdomLock, getResourceCastleList, AreaType, deconstructBuilding } = require("../protocols")

const list = []

for (let start = 154; true;) {
    let item = buildings.find(building => building.wodID == start)
    if (!item.upgradeWodID)
        break

    list.push(item.wodID)

    if (start == item.upgradeWodID)
        throw Error("RECURSION")

    start = item.upgradeWodID
}

events.once("load", async () => {
    const resourceCastleList = await getResourceCastleList()

    const areaInfo = resourceCastleList.castles.find(e => e.kingdomID == KingdomID.greatEmpire)
        .areaInfo.find(e => AreaType.mainCastle == e.type)

    kingdomLock(async () => {
        let castle = await ClientCommands.joinCastle(areaInfo.extraData[0], KingdomID.greatEmpire)()

        let listOfGuardhouses = castle.getCastleArea.buildings.reduce((accumulator, object) => {
            let building = buildings.find(e => e?.wodID == list.find(wodID => wodID == object.wodID))
            if (building)
                accumulator.push({ ownerID: object.ownerID, building })
            return accumulator
        }, [])

        for (let i = 0; i < listOfGuardhouses.length; i++) {
            const guardhouse = listOfGuardhouses[i]
            
            await deconstructBuilding(castle, guardhouse.ownerID)
        }
        console.log("Removed Guardhouses")
    })
})