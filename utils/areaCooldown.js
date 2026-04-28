const DEFAULT_RETRY_DELAY_MS = 22 * 60 * 1000

const getAreaKey = areaInfo => `${areaInfo.x}:${areaInfo.y}`

function createAreaCooldowns(retryDelayMs = DEFAULT_RETRY_DELAY_MS, now = () => Date.now()) {
    const retryAt = new Map()

    return {
        mark(areaInfo) {
            retryAt.set(getAreaKey(areaInfo), now() + retryDelayMs)
        },

        getNext(areas) {
            for (let i = 0; i < areas.length; i++) {
                const areaInfo = areas.shift()
                areas.push(areaInfo)

                if ((retryAt.get(getAreaKey(areaInfo)) ?? 0) <= now())
                    return areaInfo
            }
        },

        getWaitMs(areas) {
            let nextRetryAt = Infinity

            for (const areaInfo of areas) {
                const areaRetryAt = retryAt.get(getAreaKey(areaInfo)) ?? 0

                if (areaRetryAt <= now())
                    return 0

                nextRetryAt = Math.min(nextRetryAt, areaRetryAt)
            }

            return Number.isFinite(nextRetryAt) ? Math.max(0, nextRetryAt - now()) : 0
        }
    }
}

module.exports = {
    DEFAULT_RETRY_DELAY_MS,
    createAreaCooldowns
}
