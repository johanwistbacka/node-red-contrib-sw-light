'use strict';

const SunCalc = require('suncalc');
const DAY = 86400000;
// SunCalc 2.1.1 returns apparent altitude. Its refraction formula clamps
// negative geometric altitude to zero, so this is the apparent value at
// the geometric horizon. Compare against it to retain our noon > 0 policy.
// https://github.com/mourner/suncalc/blob/v2.1.1/index.js#L55-L59
const REFRACTION_AT_HORIZON_DEGREES = 0.0002967 / Math.tan(0.00312536 / 0.08901179) * 180 / Math.PI;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

function coordinates(latitude, longitude) {
    if (typeof latitude !== 'number' || !Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
        typeof longitude !== 'number' || !Number.isFinite(longitude) || Math.abs(longitude) > 180) {
        throw new Error('Invalid solar location');
    }
    return { latitude, longitude };
}

// Pure, on-demand calculation. Dates are absolute instants; no civil timezone,
// Node-RED context, HA entity, timer or cached Kelvin is involved.
function calculate({ timestamp, latitude, longitude, minKelvin = 2000, maxKelvin = 5500 }) {
    coordinates(latitude, longitude);
    const time = timestamp instanceof Date ? timestamp.getTime() : timestamp;
    if (typeof time !== 'number' || !Number.isFinite(time) || !Number.isFinite(new Date(time).getTime())) throw new Error('Invalid solar timestamp');
    if (![minKelvin, maxKelvin].every(k => Number.isInteger(k) && k >= 1000 && k <= 40000) || minKelvin > maxKelvin) throw new Error('Invalid solar Kelvin range');
    // Find the solar day containing the instant (nearest transit). Adjacent
    // days cover date boundaries and longitudes on either side of the dateline.
    const days = [-1, 0, 1].map(d => SunCalc.getTimes(new Date(time + d * DAY), latitude, longitude));
    const times = days.reduce((a, b) => Math.abs(a.solarNoon - time) <= Math.abs(b.solarNoon - time) ? a : b);
    // SunCalc 2 returns null for rise/set events absent during polar day/night.
    const noon = times.solarNoon.getTime(), sunrise = times.sunrise?.getTime() ?? NaN, sunset = times.sunset?.getTime() ?? NaN;
    let fraction = 0, phase = 'night';
    if (Number.isFinite(sunrise) && Number.isFinite(sunset)) {
        if (time > sunrise && time < sunset) {
            const halfDay = time <= noon ? noon - sunrise : sunset - noon;
            fraction = clamp(1 - ((time - noon) / halfDay) ** 2, 0, 1);
            phase = time <= noon ? 'morning' : 'evening';
        }
    } else {
        // No artificial midday burst during polar night. Midnight sun follows
        // a smooth daily cycle, warmest at solar midnight, coolest at noon.
        const elevation = SunCalc.getPosition(new Date(noon), latitude, longitude).altitude;
        const aboveGeometricHorizon = elevation > REFRACTION_AT_HORIZON_DEGREES;
        phase = aboveGeometricHorizon ? 'polar_day' : 'polar_night';
        if (aboveGeometricHorizon) fraction = clamp(1 - ((time - noon) / (DAY / 2)) ** 2, 0, 1);
    }
    const kelvin = clamp(5 * Math.round((minKelvin + (maxKelvin - minKelvin) * fraction) / 5), minKelvin, maxKelvin);
    return { kelvin, fraction, phase, solarNoon: noon,
        sunrise: Number.isFinite(sunrise) ? sunrise : null, sunset: Number.isFinite(sunset) ? sunset : null };
}
module.exports = { calculate, coordinates };
