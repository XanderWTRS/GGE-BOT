const { xtHandler, sendXT } = require("./ggeBot")
const allListedCommands = require("./allListedCommands.json")
const { RateLimiter } = require("limiter")

const alphabet = "abcdefghijklmnopqrstuvwxyz"
const limiter = new RateLimiter({ tokensPerInterval: 35, interval: "second" })
setImmediate(async () => {
    for (let i = 0; i < alphabet.length; i++) {
        const firstLetter = alphabet[i]
        for (let i = 0; i < alphabet.length; i++) {
            const secondLetter = alphabet[i]
            for (let i = 0; i < alphabet.length; i++) {
                const thirdLetter = alphabet[i]
                for (let i = 0; i < alphabet.length; i++) {
                    const fourthLetter = alphabet[i]
                    const command = `${firstLetter}${secondLetter}${thirdLetter}${fourthLetter}`

                    if (allListedCommands.includes(command))
                        continue

                    await limiter.removeTokens(1)

                    sendXT(command, "{}")
                    xtHandler.once(command, (...data) => console.log(command, ...data))
                }
            }
        }
        console.log("cycle", i)
    }
    console.log("Finished searching")
})