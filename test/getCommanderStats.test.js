const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")
const vm = require("node:vm")

function loadGetCommanderStats({ generals = [], skl } = {}) {
    const modulePath = path.resolve(__dirname, "../plugins-extra/getCommanderStats.js")
    const code = fs.readFileSync(modulePath, "utf8")
    const module = { exports: {} }
    const handlers = {}

    const customRequire = id => {
        if (id == "node:worker_threads")
            return { isMainThread: false }

        if (id == "../ggeBot.js")
            return {
                xtHandler: { on: (event, callback) => handlers[event] = callback },
                events: { on: (event, callback) => handlers[event] = callback },
                sendXT: () => {}
            }

        if (id.startsWith("."))
            return require(path.resolve(path.dirname(modulePath), id))

        return require(id)
    }

    const wrapper = vm.runInNewContext(
        `(function (exports, require, module, __filename, __dirname) {\n${code}\n})`,
        {
            require: customRequire,
            module,
            exports: module.exports,
            __dirname: path.dirname(modulePath),
            __filename: modulePath
        }
    )

    wrapper(module.exports, customRequire, module, modulePath, path.dirname(modulePath))

    handlers.gie?.({ G: generals })
    if (skl !== undefined)
        handlers.skl?.(skl)

    return module.exports.getCommanderStats
}

test("getCommanderStats treats omitted server arrays as empty", () => {
    const getCommanderStats = loadGetCommanderStats({
        generals: [{ GID: 1 }],
        skl: {}
    })

    const stats = getCommanderStats(
        { generalID: 1, EQ: [[undefined]] },
        { gaa: { AI: [34] } }
    )

    assert.deepEqual(Object.entries(stats), [])
})
