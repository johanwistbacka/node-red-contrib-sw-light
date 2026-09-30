'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const l = require('../lib/light');
const a = require('../lib/adaptive');
const c = extra => l.config({ entityId: 'light.example', ...extra });
const state = (brightness = 128, modes = ['color_temp','rgb'], value = 'on') => ({ entity_id: 'light.example', state: value,
    attributes: { brightness, supported_color_modes: modes, supported_features: 32, min_color_temp_kelvin: 2000, max_color_temp_kelvin: 6500 } });
const plan = (msg, extra = {}, s = state(), active = false) => l.plan(c(extra), msg, s, active);

test('defaults, brightness conversions and strict numeric validation', () => {
    assert.equal(c().overrideThreshold, 98); assert.equal(c().brightnessPct, 94); assert.equal(l.byte(100), 255); assert.equal(l.pct(255), 100);
    for (const value of [NaN, Infinity, undefined, null, '', ' ', true, {}, -1, 101]) assert.throws(() => plan({ action: 'on', brightness_pct: value }));
    assert.throws(() => plan({ action: 'on', brightness: 2.5 }));
    assert.throws(() => c({ minPct: 50, autoMaxPct: 40 }));
    assert.throws(() => c({ overrideThreshold: 90 }));
    assert.throws(() => c({ adaptiveApply: 'false-ish' }));
    assert.throws(() => plan({ action: 'on', transition: -1 }));
});
test('message precedence, automatic cap, explicit source and minimum', () => {
    assert.equal(plan({ action: 'on' }, { brightnessPct: 50 }).data.brightness, 128);
    const p = plan({ action: 'on', brightness: 230, brightness_pct: 45, transition: 3 });
    assert.equal(p.data.brightness, 115); assert.equal(p.data.transition, 3); assert.deepEqual(p.ignoredConflicts, ['brightness']);
    assert.equal(plan({ action: 'on', brightness_pct: 100 }).data.brightness, 239);
    assert.equal(plan({ action: 'on', source: 'manual', brightness_pct: 100 }).data.brightness, 255);
    assert.equal(plan({ action: 'on', brightness_pct: 0.1 }).data.brightness, 3);
    assert.equal(plan({ action: 'on', brightness_pct: 0 }).service, 'turn_off');
    assert.throws(() => plan({ action: 'on', source: 'other' }));
    assert.throws(() => plan({ action: 'on', brightness_pct: 40, brightness: NaN }));
});
test('relative steps are resolved before limits and preserve message overrides', () => {
    assert.equal(plan({ action: 'on', brightness_step_pct: 100 }).data.brightness, 239);
    assert.equal(plan({ action: 'on', brightness_step: -20 }).data.brightness, 108);
    assert.equal(plan({ action: 'on', brightness_step_pct: -100 }).service, 'turn_off');
    assert.equal(plan({ action: 'on', brightness_step: 10 }, {}, state(0, ['brightness'], 'off')).data.brightness, 10);
    assert.throws(() => plan({ action: 'on', brightness_step: 2 }, {}, state(null)));
});
test('override observes real byte thresholds, release, explicit latch and off', () => {
    const defaults = new l.Override(c());
    defaults.observe(state(239)); assert.equal(defaults.active, false);
    defaults.observe(state(249)); assert.equal(defaults.active, false);
    defaults.observe(state(250)); assert.equal(defaults.active, true);
    defaults.observe(state(254)); assert.equal(defaults.active, true);
    defaults.observe(state(204)); assert.equal(defaults.active, false);
    const o = new l.Override(c({ overrideThreshold: 100 })); o.observe(state(254)); assert.equal(o.active, false);
    o.observe(state(255)); assert.equal(o.active, true);
    o.observe({ state: 'unavailable' }); assert.equal(o.active, true);
    o.observe(state(240)); assert.equal(o.active, false);
    o.set(true); o.observe(state(80)); assert.equal(o.active, true);
    o.set(false); assert.equal(o.active, false);
    o.set(true); o.observe(state(0, [], 'off')); assert.equal(o.active, false);
    const explicit = new l.Override(c({ overrideStrategy: 'explicit' })); explicit.observe(state(255)); assert.equal(explicit.active, false);
    const custom = new l.Override(c({ autoMaxPct: 70, brightnessPct: 70, overrideThreshold: 80 })); custom.observe(state(204)); assert.equal(custom.active, true);
    for (const action of ['on','off','toggle']) assert.equal(plan({ action }, {}, state(), true).blocked, true);
    assert.equal(plan({ action: 'on', brightness_pct: 0 }, {}, state(), true).blocked, true);
    assert.equal(plan({ action: 'off', source: 'manual' }, {}, state(), true).blocked, false);
});
test('toggle follows current state and off filters inapplicable properties', () => {
    assert.equal(plan({ action: 'toggle' }).turningOn, false);
    assert.equal(plan({ action: 'toggle' }, {}, state(0, ['rgb'], 'off')).turningOn, true);
    const p = plan({ action: 'off', rgb_color: [255,0,0], brightness_pct: 50 });
    assert.deepEqual(p.data, { transition: 1 }); assert.equal(p.unsupported.length, 2);
});
test('adaptive, keep and lamp default omit configured color; message wins', () => {
    for (const colorMode of ['adaptive','keep','default']) assert.deepEqual(plan({ action: 'on' }, { colorMode }).data, { transition: 1, brightness: 239 });
    const p = plan({ action: 'on', color_temp_kelvin: 2200, rgb_color: [255,0,0] }, { colorMode: 'color' });
    assert.equal(p.data.color_temp_kelvin, 2200); assert.equal(p.explicitColor, true); assert.deepEqual(p.ignoredConflicts, ['rgb_color']);
    assert.equal(plan({ action: 'on' }, { colorMode: 'kelvin', kelvin: 3000 }).data.color_temp_kelvin, 3000);
    assert.equal(plan({ action: 'on', color_temp: 400 }).data.color_temp_kelvin, 2500);
    assert.throws(() => plan({ action: 'on', color_temp_kelvin: 1500 }));
});
test('color normalization respects all native modes and converts RGB/HS', () => {
    const samples = { rgb_color: [255,0,0], rgbw_color: [255,0,0,80], rgbww_color: [255,0,0,20,40], hs_color: [120,100], xy_color: [0.3,0.4] };
    for (const [key, value] of Object.entries(samples)) {
        assert.deepEqual(plan({ action: 'on', [key]: value }, {}, state(128, [key.replace('_color','')])).data[key], value);
    }
    assert.deepEqual(plan({ action: 'on', rgb_color: [255,0,0] }, {}, state(128, ['hs'])).data.hs_color, [0,100]);
    assert.deepEqual(plan({ action: 'on', hs_color: [120,100] }, {}, state(128, ['rgb'])).data.rgb_color, [0,255,0]);
    const xy = plan({ action: 'on', rgb_color: [255,0,0] }, {}, state(128, ['xy'])).data.xy_color;
    assert.ok(xy.every(Number.isFinite)); assert.ok(xy[0] > 0.6);
    assert.deepEqual(plan({ action: 'on', rgb_color: [1,2,3] }, {}, state(128, ['rgbww'])).data.rgbww_color, [1,2,3,0,0]);
    assert.equal(plan({ action: 'on', color_name: 'red' }).data.color_name, 'red');
    for (const value of [[256,0,0], [0,0], [1,2,NaN], 'red']) assert.throws(() => plan({ action: 'on', rgb_color: value }));
    assert.throws(() => plan({ action: 'on', hs_color: [361,20] }));
});
test('unsupported capabilities filtered, states and message arrays unchanged', () => {
    const s = state(0, ['onoff']); s.attributes.supported_features = 0;
    const msg = { action: 'on', brightness_pct: 40, transition: 2, rgb_color: [1,2,3] };
    const before = structuredClone({ s, msg }), p = plan(msg, {}, s);
    assert.deepEqual(p.data, {}); assert.deepEqual(p.unsupported, ['transition','brightness_pct','rgb_color']);
    assert.deepEqual({ s, msg }, before);
    assert.equal(plan({ action: 'on', rgbw_color: [1,2,3,4] }, {}, state(128, ['rgb'])).unsupported[0], 'rgbw_color');
});
test('Adaptive discovery never guesses names or resolves ambiguous membership', () => {
    const sw = { entity_id: 'switch.any_name', state: 'off', attributes: { configuration: { lights: ['light.example'] } } };
    const states = { [sw.entity_id]: sw };
    assert.equal(a.select(c(), states), sw.entity_id);
    assert.equal(a.select(c(), { ...states, 'switch.other': { ...sw, entity_id: 'switch.other' } }), null);
    assert.equal(a.select(c({ adaptiveEntity: 'switch.selected' }), states), 'switch.selected');
    assert.equal(a.select(c(), { 'switch.fake': { entity_id: 'switch.fake', attributes: { lights: ['light.example'], manual_control: [] } } }), null);
});


test('observed HA colors tolerate null and non-array attributes and copy valid arrays', () => {
    const keys = ['rgb_color', 'rgbw_color', 'rgbww_color', 'hs_color', 'xy_color'];
    for (const value of [null, undefined, 0, false, {}, 'unknown']) {
        const observed = state(255);
        for (const key of keys) observed.attributes[key] = value;
        const info = l.normalized(observed, true, false, 'state_changed');
        assert.deepEqual(info.color, {});
        assert.equal(info.brightness_pct, 100); assert.equal(info.manual_override, true);
    }
    const observed = state(204);
    for (const key of keys) observed.attributes[key] = [1, 2, 3];
    const before = structuredClone(observed), info = l.normalized(observed, false, false, 'state_changed');
    for (const key of keys) {
        assert.deepEqual(info.color[key], [1, 2, 3]);
        assert.notEqual(info.color[key], observed.attributes[key]);
    }
    info.color.rgb_color[0] = 99;
    assert.deepEqual(observed, before);
});
