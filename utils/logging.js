const seenWarnings = new Set()

function formatDetails(details = {}) {
    return Object.entries(details)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join(" ")
}

function warnOnce(key, message, details) {
    if (seenWarnings.has(key))
        return

    seenWarnings.add(key)
    const detailText = formatDetails(details)
    console.warn(detailText ? `${message}; ${detailText}` : message)
}

module.exports = {
    warnOnce
}
