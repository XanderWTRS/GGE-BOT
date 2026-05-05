const assert = require("node:assert/strict")
const EventEmitter = require("node:events")
const Module = require("node:module")
const path = require("node:path")
const test = require("node:test")
const vm = require("node:vm")
const fs = require("node:fs")

function withMockedRequire(mocks, callback) {
    const originalLoad = Module._load
    Module._load = function (request, parent, isMain) {
        const resolvedParent = parent?.filename ? path.resolve(parent.filename) : ""
        const key = `${resolvedParent}:${request}`
        if (Object.hasOwn(mocks, key))
            return mocks[key]
        if (Object.hasOwn(mocks, request))
            return mocks[request]
        return originalLoad.call(this, request, parent, isMain)
    }

    try {
        return callback()
    } finally {
        Module._load = originalLoad
    }
}

function captureWarns(callback) {
    const originalWarn = console.warn
    const warnings = []
    console.warn = (...args) => warnings.push(args.join(" "))

    try {
        callback()
    } finally {
        console.warn = originalWarn
    }

    return warnings
}

test("Lord ignores unknown equipment effect ids from live data", () => {
    const protocolsPath = path.resolve(__dirname, "../protocols.js")
    const ggeBotMock = {
        waitForResult: async () => [{}, 0],
        sendXT: () => {},
        xtHandler: new EventEmitter(),
        events: new EventEmitter(),
        status: {},
        playerInfo: {}
    }

    delete require.cache[protocolsPath]
    const protocols = withMockedRequire({
        [`${protocolsPath}:./ggeBot.js`]: ggeBotMock
    }, () => require(protocolsPath))

    const warnings = captureWarns(() => assert.doesNotThrow(() => {
        new protocols.ClassTypes.Lord({
            ID: 1,
            N: "unknown effect",
            GID: 999,
            EQ: [
                [
                    undefined, undefined, undefined, undefined, undefined,
                    [[999999999, [10]]]
                ]
            ]
        })
    }))

    assert.match(warnings.join("\n"), /Commander effect skipped/)
    assert.match(warnings.join("\n"), /unknown equipment effect id 999999999/)
    assert.match(warnings.join("\n"), /lord "unknown effect"/)
})

test("feast skips castles whose production data has not loaded yet", async () => {
    const feastPath = path.resolve(__dirname, "../plugins/feast.js")
    const events = new EventEmitter()
    const protocolsMock = {
        ClientCommands: {
            startFeast: () => assert.fail("startFeast should not run without production data")
        },
        KingdomID: {
            greatEmpire: 0,
            stormIslands: 2,
            berimond: 10,
            0: "Great Empire"
        },
        AreaType: {
            mainCastle: 1
        },
        castles: [
            {
                kingdomID: 0,
                id: 1,
                areaInfo: { type: 1 },
                food: 500000
            }
        ]
    }
    const ggeBotMock = {
        events,
        botConfig: { plugins: { feast: {} } }
    }
    let onUnhandled
    const unhandled = new Promise(resolve => {
        onUnhandled = reason => resolve(reason)
        process.once("unhandledRejection", onUnhandled)
    })

    const code = fs.readFileSync(feastPath, "utf8")
    const module = { exports: {} }
    const customRequire = id => {
        if (id == "node:worker_threads")
            return { isMainThread: false }
        if (id == "../protocols.js")
            return protocolsMock
        if (id == "../ggeBot.js")
            return ggeBotMock
        if (id == "../utils/logging.js")
            return {
                warnOnce: (_key, message) => warnings.push(message)
            }
        return require(id)
    }

    const warnings = []
    const wrapper = vm.runInNewContext(
        `(function (exports, require, module, __filename, __dirname) {\n${code}\n})`,
        {
            require: customRequire,
            module,
            exports: module.exports,
            console: {
                log: () => {},
                warn: (...args) => warnings.push(args.join(" ")),
                error: console.error
            },
            setInterval: () => {},
            __dirname: path.dirname(feastPath),
            __filename: feastPath
        }
    )

    wrapper(module.exports, customRequire, module, feastPath, path.dirname(feastPath))
    events.emit("load")

    const result = await Promise.race([
        unhandled.then(reason => ({ reason })),
        new Promise(resolve => setImmediate(() => resolve({ reason: undefined })))
    ])
    process.off("unhandledRejection", onUnhandled)

    assert.equal(result.reason, undefined)
    assert.match(warnings.join("\n"), /Feast skipped castle 1 in Great Empire/)
    assert.match(warnings.join("\n"), /production data not loaded yet/)
})

test("waitForResult resolves protocol timeouts instead of rejecting", async () => {
    const ggeBotPath = path.resolve(__dirname, "../ggeBot.js")
    const code = fs.readFileSync(ggeBotPath, "utf8")
    const timeoutLine = code.match(/const waitForResult[\s\S]*?const webSocket = new WebSocket/)?.[0]
        ?.replace(/\nconst webSocket = new WebSocket[\s\S]*/, "\nmodule.exports = { waitForResult, xtHandler }\n")

    assert.ok(timeoutLine, "waitForResult block should be loadable")

    const module = { exports: {} }
    const warnings = []
    const wrapper = vm.runInNewContext(
        `(function (exports, require, module) {
const err = {}
const ggeConfig = { timeoutMultiplier: 1 }
const xtHandler = new (require("node:events"))()
const webSocket = { pause: () => {} }
let importantErrors = 0
let timedOut = 0
const warnOnce = (_key, message) => console.warn(message)
${timeoutLine}
})`,
        {
            require: id => {
                if (id == "node:events")
                    return EventEmitter
                return require(id)
            },
            module,
            exports: module.exports,
            console: {
                warn: (...args) => warnings.push(args.join(" ")),
                error: console.error
            },
            setTimeout,
            clearInterval,
            process: { exit: () => assert.fail("timeout should not exit on first failure") },
            WebSocket: function () {}
        }
    )

    wrapper(module.exports, require, module)

    const result = await module.exports.waitForResult("gaa", 1)
    assert.equal(result[1], "TIMED_OUT")
    assert.deepEqual(Object.keys(result[0]), [])
    assert.match(warnings.join("\n"), /Protocol timeout/)
    assert.match(warnings.join("\n"), /command gaa/)
    assert.match(warnings.join("\n"), /did not receive a matching response/)
})
