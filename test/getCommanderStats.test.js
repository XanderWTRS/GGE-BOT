const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")

test("extra attack plugins use the Lord effects API instead of the legacy helper", () => {
    const legacyHelper = path.resolve(__dirname, "../plugins-extra/getCommanderStats.js")
    assert.equal(fs.existsSync(legacyHelper), false)

    const attackModules = [
        "../plugins-extra/attack/attackBerimondKingdom.js",
        "../plugins-extra/attack/attackBloodcrows.js",
        "../plugins-extra/attack/attackForeign.js"
    ]

    for (const attackModule of attackModules) {
        const source = fs.readFileSync(path.resolve(__dirname, attackModule), "utf8")

        assert.doesNotMatch(source, /getCommanderStats/)
        assert.match(source, /commander\.getEffects\(/)
    }
})
