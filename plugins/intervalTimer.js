const { isMainThread } = require('node:worker_threads')
const { changeUser, getUser, events } = require("../main.js")
const dayjs = require("dayjs")

if (isMainThread) {
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
            .setHours(hours, minutes, 0, 0)

        if (now > target)
            target.setDate(target.getDate() + 1)

        const millisecondsRemaining = target - now
        console.log(millisecondsRemaining)
    }
    getUser().forEach(({id, plugins}) => {
        const pluginPath = require('path').basename(__filename).slice(0, -3)
        const pluginOptions = plugins[pluginPath] ?? {}
        
        if(!pluginOptions.state)
            return

        const startTimeInfo = dayjs(pluginOptions.startTimer)
        const endTimeInfo = dayjs(pluginOptions.endTimer)
        const startTime = getTimeFromNow(startTimeInfo.hour(), startTimeInfo.minute())
        const endTime = getTimeFromNow(endTimeInfo.hour(), endTimeInfo.minute())

        function startBot(user) {
            user.state = true
            changeUser(user.uuid, user)
        }
        function stopBot(user) {
            user.state = false
            changeUser(user.uuid, user)
        }

        let startTimer = setInterval(() => startBot(user.uuid, user), startTime)
        let endTimer = setInterval(() => stopBot(user.uuid, user), endTime)
        
        events.on("userChange", user => {
            if(user.id != id)
                return

            if (user.plugins[pluginPath].startTimer == pluginOptions.startTimer &&
                user.plugins[pluginPath].stopTimer == pluginOptions.stopTimer)
                return

            const startTimeInfo = dayjs(user.plugins[pluginPath].startTimer)
            const endTimeInfo = dayjs(user.plugins[pluginPath].endTimer)
            const startTime = getTimeFromNow(startTimeInfo.hour(), startTimeInfo.minute())
            const endTime = getTimeFromNow(endTimeInfo.hour(), endTimeInfo.minute())

            clearInterval(startTimer)
            clearInterval(endTimer)
            
            let startTimer = setInterval(() => startBot(user.uuid, user), startTime)
            let endTimer = setInterval(() => stopBot(user.uuid, user), endTime)
        })

        events.once("userDelete", user => {
            if(user.id != id)
                return

            clearInterval(startTimer)
            clearInterval(endTimer)
        })
    })
    return
}
