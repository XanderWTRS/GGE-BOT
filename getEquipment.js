if (require('node:worker_threads').isMainThread)
    return module.exports = { hidden: true }

const effects = require("./items/effects.json")
const effectTypes = require("./items/effecttypes.json")
const effectCaps = require("./items/effectCaps.json")
const generalSkills = require("./items/generalSkills.json")
const relicEffects = require("./items/relicEffects.json")
const equipmentEffects = require("./items/equipment_effects.json")
const { xtHandler, events, sendXT } = require("./ggeBot.js")

let generals = []

xtHandler.on("gie", obj => {
    generals = obj.G
})
events.on("load", () => sendXT("gie", JSON.stringify({})))

function getCommanderStats(commander, AI) {
    let ungroupedActiveEffects = {}

    generals.find(e => e.GID == commander.generalID)?.SIDS.forEach(skillID => {
        const generalSkill = generalSkills.find(e => e.skillID == skillID)
        if (!generalSkill)
            return
        const [effectID, value] = generalSkill.effects.split("&")
        let effect = effects.find(e => e.effectID == effectID)

        let maxCap = Number(effectCaps.find(e => e.capID == effect.capID)?.maxTotalBonus ?? Infinity)

        ungroupedActiveEffects[effectID] = Math.min(maxCap, (ungroupedActiveEffects[effectID] ?? 0) + Number(value))
    })

    commander.EQ.forEach(equipment => {
        equipment[5].forEach(([id, _, effectValues]) => {
            let effectID = Array.isArray(effectValues) ? relicEffects.find(e => e.id == id)?.effectID :
                Array.isArray(_) ? (effectValues = _, equipmentEffects.find(e => e.effectID)) : undefined

            if(effectID == undefined)
                return
            
            let effect = effects.find(e => e.effectID == effectID)

            if (effect == undefined)
                return
            
            if(effect.areaTypeID && AI && !effect.areaTypeID.split(',').map(Number).includes(AI.type))
                return

            let maxCap = Number(effectCaps.find(e => e.capID == effect.capID).maxTotalBonus ?? Infinity)

            ungroupedActiveEffects[effectID] = Math.min(maxCap, (ungroupedActiveEffects[effectID] ?? 0) + Number(effectValues[0]))
        })
        
        equipment[12]?.[3][4]?.forEach(([id, _, effectValues]) => {
            let effectID = Array.isArray(effectValues) ? relicEffects.find(e => e.id == id)?.effectID :
                Array.isArray(_) ? (effectValues = _, equipmentEffects.find(e => e.effectID)) : undefined

            if(effectID == undefined)
                return
            
            let effect = effects.find(e => e.effectID == effectID)

            if (effect == undefined)
                return

            if(effect.areaTypeID && AI && !effect.areaTypeID.split(',').map(Number).includes(AI.type))
                return

            let maxCap = Number(effectCaps.find(e => e.capID == effect.capID).maxTotalBonus ?? Infinity)

            ungroupedActiveEffects[effectID] = Math.min(maxCap, (ungroupedActiveEffects[effectID] ?? 0) + Number(effectValues[0]))
        })
    })
    let activeEffects = {}
    
    for (const key in ungroupedActiveEffects) {
        let effectTypeID = effects.find(e => e.effectID == key).effectTypeID
        let effectType = effectTypes.find(e => e.effectTypeID == effectTypeID)
        activeEffects[effectType.name] ??= 0
        activeEffects[effectType.name] += ungroupedActiveEffects[key]
    }
    //HACK:
    commander.EQ[4][5].forEach(([id, effectarray]) =>
        id == 21 ? activeEffects.additionalWaves += effectarray[0] : void 0)

    return activeEffects
}

module.exports = { getCommanderStats }