const { isMainThread } = require('node:worker_threads')
const { changeUser, getUser, events } = require("../main.js")
const dayjs = require("dayjs")

if (isMainThread) {
    return module.exports { hidden : true }
    module.exports = {
        pluginOptions: [
            {
                type: "Text",
                key: "startStopRandomness"
            },
            {
                type: "Time",
                key: "startTimer"
            },
            {
                type: "Time",
                key: "stopTimer"
            }
        ]
    }
    function getTimeFromNow(hours, minutes) {
        const now = new Date()
        const target = new Date()
        
        target.setHours(hours, minutes, 0, 0)

        if (now > target)
            target.setDate(target.getDate() + 1)

        return target - now
    }
    function startBot(user) {
        user.state = 1
        changeUser(user.uuid, user)
    }
    function stopBot(user) {
        user.state = 0
        changeUser(user.uuid, user)
    }
    function scheduleBot(user, startTimer, endTimer) {
        const startTimeInfo = dayjs(startTimer)
        const endTimeInfo = dayjs(endTimer)
        const startTime = getTimeFromNow(startTimeInfo.hour(), startTimeInfo.minute())
        const endTime = getTimeFromNow(endTimeInfo.hour(), endTimeInfo.minute())

        return [setTimeout(() =>
            startBot(user), startTime),
        setTimeout(() =>
            stopBot(user), endTime)]
    }
    getUser().forEach(user => {
        const pluginPath = require('path').basename(__filename).slice(0, -3)
        const pluginOptions = user.plugins[pluginPath] ?? {}
        let startTimer
        let endTimer 

        if (pluginOptions.state) {
            [startTimer, endTimer] = scheduleBot(user, pluginOptions.startTimer, pluginOptions.endTimer)
        }
        
        events.on("userChange", user2 => {
            if(user2.id != user.id)
                return

            if (!user2.plugins[pluginPath].state)
                return

            const startTime = user2.plugins[pluginPath].startTimer
            const endTime = user2.plugins[pluginPath].endTimer

            if(pluginOptions.startTimer == startTime &&
                pluginOptions.endTimer == endTime)
                return

            clearInterval(startTimer)
            clearInterval(endTimer)
            
            [startTimer, endTimer] = scheduleBot(user, startTime, endTime)
        })

        events.once("userDelete", user2 => {
            if(user2.id != user.id)
                return

            clearInterval(startTimer)
            clearInterval(endTimer)
        })
    })
    return
}
