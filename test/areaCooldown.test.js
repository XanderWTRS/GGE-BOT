const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")

const { DEFAULT_RETRY_DELAY_MS, createAreaCooldowns } = require("../utils/areaCooldown.js")

test("area cooldowns skip unavailable areas until their retry delay expires", () => {
    let now = 1_000
    const cooldowns = createAreaCooldowns(undefined, () => now)
    const firstArea = { x: 10, y: 20 }
    const secondArea = { x: 30, y: 40 }
    const areas = [
        firstArea,
        secondArea
    ]

    assert.equal(cooldowns.getNext(areas), firstArea)

    cooldowns.mark(firstArea)

    assert.equal(cooldowns.getNext(areas), secondArea)

    cooldowns.mark(secondArea)

    assert.equal(cooldowns.getNext(areas), undefined)
    assert.equal(DEFAULT_RETRY_DELAY_MS, 30 * 60 * 1000)
    assert.equal(cooldowns.getWaitMs(areas), 30 * 60 * 1000)

    now += 30 * 60 * 1000

    assert.equal(cooldowns.getWaitMs(areas), 0)
    assert.equal(cooldowns.getNext(areas), firstArea)
})

test("invasion attack modules use cooldowns for unspawned targets", () => {
    const attackModules = [
        "../plugins-extra/attack/attackBloodcrows.js",
        "../plugins-extra/attack/attackForeign.js"
    ]

    for (const attackModule of attackModules) {
        const source = fs.readFileSync(path.resolve(__dirname, attackModule), "utf8")

        assert.match(source, /createAreaCooldowns/)
        assert.match(source, /areaCooldowns\.getNext\(areas\)/)
        assert.match(source, /NO_PLAYER_SPAWNED_YET[\s\S]*areaCooldowns\.mark\(areaInfo\)/)
        assert.match(source, /areaCooldowns\.getWaitMs\(areas\)/)
    }
})

test("invasion attack modules cooldown targets after successful attacks", () => {
    const attackModules = [
        "../plugins-extra/attack/attackBloodcrows.js",
        "../plugins-extra/attack/attackForeign.js"
    ]

    for (const attackModule of attackModules) {
        const source = fs.readFileSync(path.resolve(__dirname, attackModule), "utf8")
        const cooldownMarks = source.match(/areaCooldowns\.mark\(areaInfo\)/g) ?? []

        assert.equal(cooldownMarks.length, 2)
        assert.match(source, /if \(result != 0\)\s+throw err\[result\]\s+areaCooldowns\.mark\(areaInfo\)\s+return obj/)
    }
})

test("foreign attack reads unit info from each inventory unit", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../plugins-extra/attack/attackForeign.js"), "utf8")

    assert.doesNotMatch(source, /(?<!\.)\bunitInfo\b/)
})
