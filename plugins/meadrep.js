const {workerData, isMainThread} = require('node:worker_threads')

const name = "Mead replace"

if (isMainThread)
    return module.exports = {
        name : name,
        description : "Mead replace",
    }

const { xtHandler, sendXT, waitForResult } = require("../ggebot")

let dcl = undefined
let gcl = undefined

xtHandler.on("dcl", (obj) => {
    dcl = obj
})

xtHandler.on("gcl", (obj) => {
    gcl = obj
})
const externalKingdom = 12
const stormIslands = 4
const greatEmpire = 0
const castleType = 0
const areaID = 3
const mainCastle = 1

let hoursLeftTillRefil = 2.1

async function needMead() {
    try {
        await sendXT("dcl", JSON.stringify({CD : 1}))

        {
            let [obj] = await waitForResult("dcl", 1000 * 10)
            dcl = obj //hacky nooo
        }
        let ai = gcl.C.find(k => k.KID == stormIslands).AI.find(ai => ai.AI[castleType] == externalKingdom)
        let areaInfo = dcl.C.find(k => k.KID == stormIslands).AI.find(ai2 => ai2.AID == ai.AI[areaID])
        
        // console.log((areaInfo.MEAD / (areaInfo.gpa.DMEADC / 10) - 2.1) * 60 * 60)
        if(areaInfo?.gpa?.MRMEAD == undefined || areaInfo.gpa.MRMEAD <= 0)
            return console.warn("No mead storage")
        if(areaInfo.MEAD / (areaInfo.gpa.DMEADC / 10) > 2.1) {
            let time = (areaInfo.MEAD / (areaInfo.gpa.DMEADC / 10) - hoursLeftTillRefil) * 60 * 60 * 1000
            if(areaInfo.gpa.DMEADC != 0) //2147483647
                setTimeout(needMead, Math.min(time, 2147483647))
            
            return console.log("Don't need mead")
        }
        console.log("Need mead")
        //From where? Try ops... Don't take from those who are in the negatives todo
        let mainCastleAI = gcl.C.find(k => k.KID == greatEmpire).AI.find(ai => ai.AI[castleType] == mainCastle)

        console.log(`Will try to send ${Math.floor(areaInfo.gpa.MRMEAD - areaInfo.MEAD)} Mead`)
        await sendXT("kgt", JSON.stringify({"SCID":mainCastleAI.AI[areaID],"SKID":greatEmpire,"TKID":stormIslands,"G":[["MEAD", Math.floor(areaInfo.gpa.MRMEAD - areaInfo.MEAD)]]}))
        console.log((areaInfo.gpa.MRMEAD / (areaInfo.gpa.DMEADC / 10) - hoursLeftTillRefil) * 60 * 60 * 1000)
        if(areaInfo.gpa.DMEADC != 0)
            setTimeout(needMead, (areaInfo.gpa.MRMEAD / (areaInfo.gpa.DMEADC / 10) - hoursLeftTillRefil) * 60 * 60 * 1000)
        let [obj, r] = await waitForResult("kgt", 1000 * 10)
        let rt = obj.kpi.find(e => e.KID == 4)
        
        if (areaInfo.gpa.MRMEAD / (areaInfo.gpa.DMEADC / 10) < hoursLeftTillRefil) {

            for (let i = 0; i < rt.RS / 60 / 60 * 2; i++) {
                await sendXT("msk", JSON.stringify({ "MST": "MS4", "KID": "4", "TT": "2" }))
            }
        }
    }
    catch (e) {
        console.warn(e)
        console.warn("Is storm even unlocked?")
    }
}
xtHandler.on("lli", async (_, r) => {
    if(r != 0)
        return

    setTimeout(async () => { //Not sure what I was on to do this but aint changing it.
        needMead()
    }, 1000 * 10)

    let [obj, _] = await waitForResult("kpl", 1000 * 10)
    
    let rt = obj.RT.find(e => e.KID == 4)
    
    if(rt.RS < hoursLeftTillRefil / 60 / 60)
        return

    for (let i = 0; i < rt.RS / 60 / 60 * 2; i++) {
        await sendXT("msk", JSON.stringify({"MST":"MS4","KID":"4","TT":"2"}))
    }
})
