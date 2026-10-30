'use strict';

// Timestamp the displayed status, preserving its time during identical refreshes.
function createStatusReporter(report, now = Date.now) {
    let previous, timestamp;
    return status => {
        if (!status.text) {
            previous = undefined;
            report(status);
            return;
        }
        if (!previous || status.text !== previous.text || status.fill !== previous.fill || status.shape !== previous.shape) {
            const date = new Date(now());
            const pad = value => String(value).padStart(2, '0');
            timestamp = `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
            previous = { text: status.text, fill: status.fill, shape: status.shape };
        }
        report({ ...status, text: `${status.text} · ${timestamp}` });
    };
}

module.exports = { createStatusReporter };
