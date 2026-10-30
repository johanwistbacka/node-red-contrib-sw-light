'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { calculate } = require('../lib/solar-temperature');
const { config, dynamicPayload } = require('../lib/light');
const location = { latitude: 59.3293, longitude: 18.0686 }; // Public Stockholm city centre, test-only.
const at = (timestamp, extra = {}) => calculate({ timestamp: new Date(timestamp), ...location, ...extra });
test('legacy missing or blank Dynamic bounds use defaults without mutating saved config', () => {
    for (const targetType of ['entity', 'entities', 'label', 'area', 'group']) {
        for (const colorMode of ['keep', 'default', 'dynamic', 'kelvin', 'mired', 'color']) {
            for (const bounds of [{}, { dynamicMinKelvin: undefined, dynamicMaxKelvin: undefined },
                { dynamicMinKelvin: '', dynamicMaxKelvin: '  ' }, { dynamicMinKelvin: '3000', dynamicMaxKelvin: '' }]) {
                const raw = { targetType, entityId: 'light.one', entityIds: ['light.one', 'light.two'], labelId: 'hall', areaId: 'hall', groupId: 'light.hall', colorMode, ...bounds };
                const before = JSON.stringify(raw), result = config(raw);
                assert.equal(result.dynamicMinKelvin, bounds.dynamicMinKelvin === '3000' ? 3000 : 2000);
                assert.equal(result.dynamicMaxKelvin, 5500);
                assert.equal(result.colorMode, colorMode);
                assert.equal(JSON.stringify(raw), before);
            }
        }
    }
});
test('Dynamic bound fallback preserves explicit values and rejects invalid effective ranges', () => {
    assert.equal(config({ entityId: 'light.one', dynamicMinKelvin: '2701', dynamicMaxKelvin: '3999' }).dynamicMaxKelvin, 3999);
    assert.equal(config({ entityId: 'light.one', dynamicMinKelvin: '', dynamicMaxKelvin: 4500 }).dynamicMinKelvin, 2000);
    for (const key of ['dynamicMinKelvin', 'dynamicMaxKelvin']) {
        for (const value of [null, false, true, 'invalid', 999, 40001, 2000.5, [], {}]) {
            assert.throws(() => config({ entityId: 'light.one', [key]: value }), /dynamic/);
        }
    }
    for (const bounds of [{ dynamicMinKelvin: '', dynamicMaxKelvin: 1500 }, { dynamicMinKelvin: 6000, dynamicMaxKelvin: '' }]) {
        assert.throws(() => config({ entityId: 'light.one', ...bounds }), /Warmest/);
    }
});
for (const date of ['2026-12-21', '2026-03-20', '2026-06-21', '2026-09-22']) {
    test(`deterministic daylight curve and boundaries: ${date}`, () => {
        const day = at(`${date}T12:00:00Z`);
        const noon = calculate({ timestamp: day.solarNoon, ...location });
        assert.equal(noon.kelvin, 5500);
        for (const time of [day.sunrise - 60000, day.sunrise, day.sunset, day.sunset + 60000]) {
            assert.equal(calculate({ timestamp: time, ...location }).kelvin, 2000);
        }
        const morning = calculate({ timestamp: (day.sunrise + day.solarNoon) / 2, ...location });
        const evening = calculate({ timestamp: (day.sunset + day.solarNoon) / 2, ...location });
        assert.equal(morning.kelvin, 4625); assert.equal(evening.kelvin, 4625);
        for (const time of [day.sunrise + 60000, day.sunset - 60000]) {
            const k = calculate({ timestamp: time, ...location }).kelvin;
            assert.ok(k > 2000 && k < 2100);
        }
        assert.deepEqual(at(`${date}T12:00:00Z`), at(`${date}T12:00:00Z`));
    });
}
test('absolute timestamps are DST and process-timezone independent', () => {
    for (const [civil, utc] of [['2026-03-29T01:30:00+01:00', '2026-03-29T00:30:00Z'],
        ['2026-03-29T03:30:00+02:00', '2026-03-29T01:30:00Z'],
        ['2026-10-25T02:30:00+02:00', '2026-10-25T00:30:00Z'],
        ['2026-10-25T02:30:00+01:00', '2026-10-25T01:30:00Z']]) assert.deepEqual(at(civil), at(utc));
    const previous = process.env.TZ;
    try {
        process.env.TZ = 'Pacific/Auckland'; const first = at('2026-06-21T12:00:00Z');
        process.env.TZ = 'America/Los_Angeles'; assert.deepEqual(at('2026-06-21T12:00:00Z'), first);
    } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});
test('configured endpoints, including non-multiples of five, remain bounded', () => {
    const noon = at('2026-12-21T12:00Z').solarNoon;
    assert.equal(calculate({ timestamp: noon, ...location, minKelvin: 2701, maxKelvin: 3999 }).kelvin, 3999);
    assert.equal(at('2026-12-21T23:00Z', { minKelvin: 2701, maxKelvin: 3999 }).kelvin, 2701);
    assert.equal(at('2026-06-21T12:00Z', { minKelvin: 3000, maxKelvin: 3000 }).kelvin, 3000);
});
test('invalid inputs fail without exposing coordinates', () => {
    for (const extra of [{ latitude: 91 }, { longitude: -181 }, { latitude: NaN }, { latitude: null },
        { longitude: '18' }, { timestamp: new Date('invalid') }, { timestamp: null }, { timestamp: '2026-06-21' },
        { minKelvin: 6000, maxKelvin: 2000 }, { minKelvin: 999 }, { maxKelvin: Infinity }]) {
        assert.throws(() => at('2026-06-21T12:00Z', extra), /Invalid solar/);
    }
    assert.throws(() => config({ entityId: 'light.one', dynamicMinKelvin: 6000 }), /Warmest/);
});
test('polar regions and dateline locations produce finite bounded values', () => {
    for (const latitude of [-90, -78, 78, 90]) for (const date of ['2026-12-21', '2026-06-21']) {
        const result = at(`${date}T12:00Z`, { latitude, longitude: 0 });
        assert.ok(result.kelvin >= 2000 && result.kelvin <= 5500);
        assert.match(result.phase, /polar_/);
    }
    for (const longitude of [-180, 180]) {
        const result = at('2026-06-21T00:00Z', { longitude });
        assert.ok(result.kelvin > 5000); // local solar noon near UTC midnight
    }
});
test('absent polar sunrise/sunset preserve warm nights and the full daylight curve', () => {
    for (const [latitude, day, night] of [[78, '2026-06-21', '2026-12-21'], [-78, '2026-12-21', '2026-06-21']]) {
        const daylight = at(`${day}T12:00Z`, { latitude, longitude: 0 });
        assert.equal(daylight.phase, 'polar_day');
        assert.equal(daylight.sunrise, null); assert.equal(daylight.sunset, null);
        assert.equal(calculate({ timestamp: daylight.solarNoon, latitude, longitude: 0 }).kelvin, 5500);
        const darkness = at(`${night}T12:00Z`, { latitude, longitude: 0 });
        assert.equal(darkness.phase, 'polar_night');
        assert.equal(darkness.kelvin, 2000);
        assert.equal(darkness.sunrise, null); assert.equal(darkness.sunset, null);
    }
});
test('near-horizon polar nights stay warm despite positive apparent altitude', () => {
    for (const [latitude, date] of [[90, '2026-03-19'], [90, '2026-03-20'], [-90, '2026-03-21'], [-90, '2026-09-22']]) {
        const result = at(`${date}T12:00Z`, { latitude, longitude: 0 });
        assert.ok(require('suncalc').getPosition(new Date(result.solarNoon), latitude, 0).altitude > 0);
        assert.equal(result.sunrise, null); assert.equal(result.sunset, null);
        assert.equal(result.phase, 'polar_night');
        assert.equal(result.kelvin, 2000);
    }
    for (const [latitude, date] of [[90, '2026-03-21'], [-90, '2026-09-23']]) {
        const result = at(`${date}T12:00Z`, { latitude, longitude: 0 });
        assert.equal(result.phase, 'polar_day');
        assert.equal(calculate({ timestamp: result.solarNoon, latitude, longitude: 0 }).kelvin, 5500);
    }
});
test('dynamic CT clamps per lamp, including legacy mired bounds; non-CT omitted', () => {
    const state = attributes => ({ attributes: { supported_color_modes: ['color_temp'], ...attributes } });
    const range = state({ min_color_temp_kelvin: 2700, max_color_temp_kelvin: 4000 });
    assert.deepEqual(dynamicPayload(2000, range), { color_temp_kelvin: 2700 });
    assert.deepEqual(dynamicPayload(5500, range), { color_temp_kelvin: 4000 });
    assert.deepEqual(dynamicPayload(3200, range), { color_temp_kelvin: 3200 });
    assert.deepEqual(dynamicPayload(5500, state({ min_mireds: 250, max_mireds: 370 })), { color_temp_kelvin: 4000 });
    assert.equal(dynamicPayload(3000, { attributes: { supported_color_modes: ['rgb'] } }), null);
    assert.throws(() => dynamicPayload(3000, state({ min_color_temp_kelvin: 4000, max_color_temp_kelvin: 2000 })), /Invalid lamp/);
});
