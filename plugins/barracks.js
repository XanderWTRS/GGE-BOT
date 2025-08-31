//%xt%EmpireEx_19%bup%1%{"LID":0,"WID":207,"AMT":110,"PO":-1,"PWR":0,"SK":73,"SID":0,"AID":3760167}%

const { workerData, isMainThread } = require('node:worker_threads')
const name = "Barracks"
if (isMainThread)
    return module.exports = {
        name: name,
        description: "Fills barracks periodically (Range mead only)",
        pluginOptions: [
            {
                type: "Text",
                label: "Level",
                key: "level",
            },
            {
                type: "Select",
                label: "Troop Type",
                key: "troopType",
                selection: [
                    "Range Mead Att",
                    "Range Mead Def",
                    "Melee Mead Att",
                    "Melee Mead Def",
                ],
                default : 0
            },
        ]
    };
    
const pluginOptions = workerData.plugins[require('path').basename(__filename).slice(0, -3)] ??= {}
let selectedTroop = [
    206,
    229,
    196,
    218
][pluginOptions.troopType];
const { xtHandler,sendXT, waitForResult } = require("../ggebot")
const { buildings, units } = require("../ids.js")

let foundAll = false
let list = []
let start = 160
while(!foundAll) {
    let item = buildings[start]
    list.push(item.wodID)
    if(!item.upgradeWodID)
        foundAll = true
    if(start == item.upgradeWodID)
        throw Error("Recursion")
    start = item.upgradeWodID
}

xtHandler.on("lli", async (_, r) => {
    if(r != 0)
        return
    if(String(pluginOptions.level) == "") {
        console.warn("Level not defined")
        return
    }
    
    var [obj,_] = await waitForResult("gcl", 1000 * 10)
    let castles = obj.C
    
    let recruitTroops = async (KID, AID) => {
        await sendXT("jca", JSON.stringify({"CID":AID,"KID":KID}))
        let [obj,_] = await waitForResult("jaa", 1000 * 10, (o) => o.grc.KID == KID && o.grc.AID == AID)
        
        let troop = obj.gui.I[0]
        if(troop == undefined)
            return
        let buildingObject = obj.gca.BD.find(e => list.includes(e[0])) 
        let wodID = buildingObject[0]
        if(!wodID)
            return
        await sendXT("spl", JSON.stringify({"LID":0}))
        let [obj2] = await waitForResult("spl", 1000 * 10) 

        for (let i = 0; i < obj2.QS.length; i++) {
            const obj4 = obj2.QS[i];
            if(obj4.P)
                continue
            if(obj4.SI.RUT == 0)
                continue
            //%xt%EmpireEx_19%bup%1%
            //{"LID":0,"WID":213,"AMT":190,"PO":-1,"PWR":0,"SK":73,"SID":2,"AID":3751645}%

            let foundAll = false
            let list = []
            let start = selectedTroop
            while (!foundAll) {
                let item = units[start]
                list.push(item.wodID)
                if (!item.upgradeWodID)
                    foundAll = true
                if (start == item.upgradeWodID)
                    throw Error("Recursion")
                start = item.upgradeWodID
            }
            let stackSize = Number(buildings[wodID].stackSize)
            let buildingUniqueID = buildingObject[1]
            let builditems = obj.gca.CI.find(e => e.OID == buildingUniqueID)
            if(builditems?.CIL.find(e => e.find(e =>e.CID == 14))) {
                stackSize += 80 //190 probs
            }
            await sendXT("bup", JSON.stringify({
                "LID": 0,
                "WID": list[Number(pluginOptions.level) - 1], //change this
                "AMT": stackSize, 
                "PO": -1,
                "PWR": 0,
                "SK": 73,
                "SID": 2,
                "AID": AID
            }))
            let [obj3,r] = await waitForResult("bup", 1000 * 10)
            if(r != 0) {
                console.warn(`Failed to recruit troops at KID:${KID} AID:${AID}`)
                break
            }
        }
        await sendXT("ahr", JSON.stringify({"ID":0,"T":6}))
        
        await sendXT("spl", JSON.stringify({"LID":0}))
        let [obj3] = await waitForResult("spl", 1000 * 10)
        setTimeout(() => recruitTroops(KID,AID), obj3.TCT * 1000)
    }
    for (let i = 0; i < castles.length; i++) {
        const o = castles[i];
        if(o.KID == 4 || o.KID == 5)
            continue
        for (let i = 0; i < o.AI.length; i++) {
            const ai = o.AI[i];
            try {
                await recruitTroops(o.KID, ai.AI[3])
            }
            catch(e) {
                console.warn(e)
            }
        }
    }

})