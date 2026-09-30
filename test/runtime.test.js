'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const register = require('../nodes/sw-light');

function setup(extra = {}) {
    let Constructor, observer, connection;
    let current = { entity_id: 'light.example', state: 'on', attributes: { brightness: 100, supported_color_modes: ['brightness'], supported_features: 32 } };
    let ready = true, released = false, attempts = 0;
    const calls = [], messages = [], statuses = [], errors = [];
    const RED = { nodes: { registerType: (_type, ctor) => Constructor = ctor,
        createNode: node => { const emitter = new EventEmitter(); node.on = emitter.on.bind(emitter); node.emit = emitter.emit.bind(emitter);
            node.send = outputs => messages.push(outputs); node.status = status => statuses.push(status); node.error = error => errors.push(error); } } };
    const adapter = { connected: () => ready, state: () => structuredClone(current), states: () => extra.states || {}, services: () => extra.services || {},
        subscribe: async (_id, obs, conn) => { observer = obs; connection = conn; },
        call: async (...args) => { calls.push(args); if (extra.onCall) await extra.onCall(...args); if (extra.reject) throw new Error('Transport failed'); }, close: async () => { released = true; } };
    register(RED, () => {
        attempts++;
        if (extra.initFailures && attempts <= extra.initFailures) {
            const error = new Error('Home Assistant server client is not initialized'); error.eventType = 'unavailable'; throw error;
        }
        return adapter;
    });
    const node = new Constructor({ entityId: 'light.example', ...extra.config });
    return { node, calls, messages, statuses, errors,
        input: msg => new Promise(resolve => node.emit('input', msg, outputs => messages.push(outputs), error => resolve(error))),
        update: state => { current = state; observer?.(state); }, disconnect: () => { ready = false; connection?.(false); },
        reconnect: () => { ready = true; connection?.(true); },
        close: () => new Promise(resolve => node.emit('close', false, resolve)), released: () => released };
}
test('runtime preserves incoming message and labels cached state honestly', async () => {
    const s = setup(); const msg = { action: 'on', payload: 'unchanged', topic: 'room', brightness_pct: 45 };
    assert.equal(await s.input(msg), undefined); assert.equal(s.calls.length, 1);
    assert.equal(s.calls[0][1], 'turn_on'); assert.deepEqual(s.calls[0][3], { entity_id: 'light.example' });
    const out = s.messages.find(m => m[0])[0]; assert.equal(out.payload, msg.payload);
    assert.equal(out.sw_light.brightness, 100); assert.equal(out.sw_light.state_confirmation, 'last_observed');
    assert.equal(msg.sw_light, undefined); await s.close(); assert.equal(s.released(), true);
});
test('external manual threshold blocks OFF, toggle and zero brightness; lower releases', async () => {
    const s = setup(); s.update({ entity_id: 'light.example', state: 'on', attributes: { brightness: 255, supported_color_modes: ['brightness'] } });
    for (const msg of [{ action: 'off' }, { action: 'toggle' }, { action: 'on', brightness_pct: 0 }]) await s.input(msg);
    assert.equal(s.calls.length, 0);
    s.update({ entity_id: 'light.example', state: 'on', attributes: { brightness: 150, supported_color_modes: ['brightness'] } });
    await s.input({ action: 'off' }); assert.equal(s.calls.length, 1);
    assert.ok(s.messages.some(m => m[1]?.sw_light_event.type === 'override_released')); await s.close();
});
test('explicit latch, intentional manual commands, invalid flag and errors', async () => {
    const s = setup({ config: { overrideStrategy: 'explicit' } });
    await s.input({ action: 'on', source: 'manual', manual_override: true, brightness_pct: 100 });
    await s.input({ action: 'off' }); assert.equal(s.calls.length, 1);
    assert.ok(await s.input({ action: 'on', manual_override: false }));
    assert.ok(await s.input({ action: 'on', source: 'manual', manual_override: 'false' }));
    await s.input({ action: 'on', source: 'manual', manual_override: false });
    await s.input({ action: 'off' }); assert.equal(s.calls.length, 3); await s.close();
});
test('unavailability, invalid configuration and async rejection stay contained', async () => {
    for (const extra of [{ reject: true }, { config: { entityId: 'switch.wrong' } }]) {
        const s = setup(extra); assert.ok(await s.input({ action: 'on' }));
        assert.ok(s.messages.some(m => m[1]?.sw_light_event.type === 'error')); await s.close();
    }
    const s = setup(); s.disconnect(); assert.ok(await s.input({ action: 'on' }));
    assert.equal(s.calls.length, 0); assert.equal(s.statuses.at(-1).text, 'HA NOT READY'); await s.close();
    const count = s.messages.length; await s.input({ action: 'on' }); assert.equal(s.messages.length, count);
});
test('adaptive apply failure preserves the successful light result and reports phase', async () => {
    const s = setup({ config: { adaptiveEnabled: true } });
    s.update({ entity_id: 'light.example', state: 'off', attributes: { supported_color_modes: ['color_temp'] } });
    assert.equal(await s.input({ action: 'on' }), undefined);
    assert.equal(s.calls.length, 1);
    assert.ok(s.messages.some(m => m[0]?.sw_light.action === 'turn_on'));
    const event = s.messages.find(m => m[1]?.sw_light_event.phase === 'adaptive_apply')[1].sw_light_event;
    assert.equal(event.type, 'warning'); assert.equal(event.light_service_completed, true); await s.close();
});
test('configured ON controls an OFF light with its own brightness and no downstream action', async () => {
    const s = setup({ config: { action: 'on', brightnessPct: 70, autoMaxPct: 80 } });
    s.update({ entity_id: 'light.example', state: 'off', attributes: { supported_color_modes: ['brightness'], supported_features: 32 } });
    await s.input({ payload: Date.now(), action: 'invalid-but-ignored' });
    assert.equal(s.calls[0][1], 'turn_on'); assert.equal(s.calls[0][2].brightness, 179);
    assert.equal(s.calls[0][2].transition, 1); assert.equal(s.statuses.at(-1).text, 'AUTO · ON · 70%'); await s.close();
});
test('explicit 100% threshold allows OFF at 94, 95 and 99 percent', async () => {
    const s = setup({ config: { action: 'off', overrideThreshold: 100 } });
    for (const brightness of [240,242,252,254]) {
        s.update({ entity_id: 'light.example', state: 'on', attributes: { brightness, supported_color_modes: ['brightness'], supported_features: 32 } });
        await s.input({ transition: 3 }); assert.equal(s.calls.at(-1)[1], 'turn_off');
        assert.deepEqual(s.calls.at(-1)[2], { transition: 3 });
    }
    assert.equal(s.calls.length, 4); assert.equal(s.statuses.at(-1).text, 'AUTO · OFF'); await s.close();
});
test('configured actions all block at 255 and status explains the decision', async () => {
    for (const action of ['on','off','toggle']) {
        const s = setup({ config: { action } });
        s.update({ entity_id: 'light.example', state: 'on', attributes: { brightness: 255, supported_color_modes: ['brightness'] } });
        assert.equal(await s.input({ payload: 'trigger' }), undefined);
        assert.equal(s.calls.length, 0); assert.equal(s.statuses.at(-1).text, `MANUAL · 100% · BLOCK ${action.toUpperCase()}`);
        await s.close();
    }
    // 100% protection cannot be disabled by the optional extra override strategy.
    const s = setup({ config: { action: 'off', manualOverride: false, overrideStrategy: 'explicit' } });
    s.update({ entity_id: 'light.example', state: 'on', attributes: { brightness: 255 } });
    await s.input({}); assert.equal(s.calls.length, 0); await s.close();
});
test('configured Toggle resolves ON to turn_off and OFF to turn_on', async () => {
    const s = setup({ config: { action: 'toggle' } });
    await s.input({}); assert.equal(s.calls[0][1], 'turn_off');
    s.update({ entity_id: 'light.example', state: 'off', attributes: { supported_color_modes: ['brightness'] } });
    await s.input({}); assert.equal(s.calls[1][1], 'turn_on'); assert.equal(s.calls[1][2].brightness, 239); await s.close();
});
test('From msg actions, nested fallback, precedence and invalid/missing actions', async () => {
    const s = setup({ config: { action: 'msg' } });
    for (const action of ['on','off','toggle']) {
        await s.input({ action }); assert.equal(s.calls.at(-1)[1], action === 'on' ? 'turn_on' : 'turn_off');
    }
    await s.input({ auto_light: { action: 'on' } }); assert.equal(s.calls.at(-1)[1], 'turn_on');
    await s.input({ action: 'off', auto_light: { action: 'on' } }); assert.equal(s.calls.at(-1)[1], 'turn_off');
    const count = s.calls.length;
    for (const msg of [{}, { action: 'bad' }, { action: null }, { action: '', auto_light: { action: 'on' } }]) {
        assert.ok(await s.input(msg)); assert.match(s.statuses.at(-1).text, /Action must/);
    }
    assert.equal(s.calls.length, count); await s.close();
});
test('uninitialized HA is transient and next input retries rather than freezing error', async () => {
    const s = setup({ config: { action: 'on' }, initFailures: 1 });
    assert.equal(s.statuses.at(-1).text, 'HA NOT READY');
    assert.ok(await s.input({})); assert.equal(s.calls.length, 0);
    assert.equal(await s.input({}), undefined); assert.equal(s.calls.length, 1); await s.close();
});

const profile = id => ({ entity_id: id, state: 'off', attributes: { configuration: { lights: ['light.example'] } } });
const ctState = (state = 'off', brightness = 100) => ({ entity_id: 'light.example', state, attributes: {
    brightness, supported_color_modes: ['color_temp', 'rgb'], supported_features: 32, min_color_temp_kelvin: 2000, max_color_temp_kelvin: 6500 } });
function adaptiveSetup(extra = {}) {
    return setup({ states: { 'switch.profile': profile('switch.profile') }, services: { adaptive_lighting: { apply: {} } },
        ...extra, config: { adaptiveEnabled: true, ...extra.config } });
}
test('automatic OFF → ON applies current provider calculation, brightness and fade stay SW Light owned', async () => {
    let target = 2400, observedTemperature;
    const s = adaptiveSetup({ onCall: async (domain, service, data) => {
        if (domain === 'adaptive_lighting') { observedTemperature = target; assert.equal(data.adapt_brightness, false); }
    } });
    for (const value of [2400, 4200]) {
        target = value; s.update(ctState()); await s.input({ action: 'on', transition: 3 });
        assert.equal(observedTemperature, value);
        assert.equal(s.calls.at(-2)[2].brightness, 239);
        assert.deepEqual(s.calls.at(-1)[2], { entity_id: 'switch.profile', lights: ['light.example'],
            adapt_brightness: false, adapt_color: true, prefer_rgb_color: false, turn_on_lights: true, transition: 3 });
        assert.equal(s.messages.filter(m => m[0]).at(-1)[0].sw_light.adaptive.applied, true);
    }
    await s.close();
});
test('already ON, manual, explicit Kelvin/color, zero brightness and adaptive disabled never apply', async () => {
    for (const [state, msg, config] of [
        [ctState('on'), { action: 'on', brightness_pct: 80 }],
        [ctState(), { action: 'on', source: 'manual' }],
        [ctState(), { action: 'on', color_temp_kelvin: 3000 }],
        [ctState(), { action: 'on', rgb_color: [1,2,3] }],
        [ctState(), { action: 'on', brightness_pct: 0 }],
        [ctState(), { action: 'on' }, { adaptiveEnabled: false, colorMode: 'kelvin', kelvin: 2700 }]
    ]) {
        const s = adaptiveSetup({ config }); s.update(state); await s.input(msg);
        assert.equal(s.calls.length, 1);
        if (msg.color_temp_kelvin) assert.equal(s.calls[0][2].color_temp_kelvin, 3000);
        if (msg.rgb_color) assert.deepEqual(s.calls[0][2].rgb_color, [1,2,3]);
        if (config) assert.equal(s.calls[0][2].color_temp_kelvin, 2700);
        await s.close();
    }
});
test('non-CT, missing, ambiguous, unavailable, running profiles and apply rejection preserve ON', async () => {
    for (const extra of [
        { noCT: true }, { states: {} },
        { states: { 'switch.a': profile('switch.a'), 'switch.b': profile('switch.b') } },
        { states: { 'switch.profile': { ...profile('switch.profile'), state: 'unavailable' } } },
        { states: { 'switch.profile': { ...profile('switch.profile'), state: 'on' } } },
        { states: { 'switch.profile': { ...profile('switch.profile'), attributes: { configuration: { lights: ['light.example'], sleep_rgb_or_color_temp: 'rgb_color' } } } } },
        { services: {} }, { onCall: async domain => { if (domain === 'adaptive_lighting') throw new Error('Offline'); } }
    ]) {
        const s = adaptiveSetup(extra); const state = ctState();
        if (extra.noCT) state.attributes.supported_color_modes = ['brightness'];
        s.update(state); assert.equal(await s.input({ action: 'on' }), undefined);
        assert.equal(s.calls[0][1], 'turn_on'); assert.equal(s.calls[0][2].brightness, 239);
        assert.ok(s.messages.some(m => m[0]));
        assert.ok(s.messages.some(m => m[1]?.sw_light_event.phase === 'adaptive_apply'));
        await s.close();
    }
});
test('advanced selector resolves ambiguity and fresh provider states are read after reconnect', async () => {
    const states = { 'switch.a': profile('switch.a'), 'switch.b': profile('switch.b') };
    const s = adaptiveSetup({ states, config: { adaptiveEntity: 'switch.b' } }); s.update(ctState());
    await s.input({ action: 'toggle' }); assert.equal(s.calls[1][2].entity_id, 'switch.b');
    s.disconnect(); assert.ok(await s.input({ action: 'on' })); assert.equal(s.calls.length, 2);
    states['switch.b'].state = 'unavailable'; s.reconnect(); s.update(ctState());
    await s.input({ action: 'on' }); assert.equal(s.calls.length, 3);
    await s.close(); await s.input({ action: 'on' }); assert.equal(s.calls.length, 3);
});
test('adaptive ON never bypasses manual override; lowering observed brightness releases it', async () => {
    const s = adaptiveSetup(); s.update(ctState('on', 255));
    for (const action of ['on', 'off', 'toggle']) await s.input({ action });
    assert.equal(s.calls.length, 0);
    s.update(ctState('on', 150)); await s.input({ action: 'off' });
    assert.equal(s.calls.length, 1); assert.equal(s.calls[0][1], 'turn_off');
    s.update(ctState()); await s.input({ action: 'on' }); assert.equal(s.calls.length, 3);
    await s.close();
});

test('message Adaptive Lighting opt-in/out overrides configuration; invalid overrides fail before control', async () => {
    const s = adaptiveSetup({ config: { adaptiveEnabled: false } }); s.update(ctState());
    await s.input({ action: 'on', adaptive_lighting: true }); assert.equal(s.calls.length, 2);
    s.update(ctState()); await s.input({ action: 'on', adaptive_lighting: false }); assert.equal(s.calls.length, 3);
    assert.ok(await s.input({ action: 'on', adaptive_lighting: 'invalid' })); assert.equal(s.calls.length, 3);
    await s.close();
});
test('legacy opt-in is migrated without enabling former inactive adaptive nodes', () => {
    const light = require('../lib/light');
    assert.equal(light.config({ entityId: 'light.example', colorMode: 'adaptive', adaptiveApply: false }).adaptiveEnabled, false);
    assert.equal(light.config({ entityId: 'light.example', colorMode: 'adaptive', adaptiveApply: true }).adaptiveEnabled, true);
});
test('configured color is retained as fallback; adaptive action overrides it only on OFF → ON', async () => {
    const s = adaptiveSetup({ config: { colorMode: 'kelvin', kelvin: 2700 } }); s.update(ctState());
    await s.input({ action: 'on' }); assert.equal(s.calls[0][2].color_temp_kelvin, 2700); assert.equal(s.calls.length, 2);
    s.update(ctState('on')); await s.input({ action: 'on', brightness_pct: 80 });
    assert.equal(s.calls.length, 3); assert.equal(s.calls.at(-1)[2].color_temp_kelvin, 2700);
    await s.close();
});

test('close during initial light call prevents subsequent adaptive call and outputs', async () => {
    let entered, release;
    const started = new Promise(resolve => { entered = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    const s = adaptiveSetup({ onCall: async domain => { if (domain === 'light') { entered(); await gate; } } });
    s.update(ctState()); const pending = s.input({ action: 'on' }); await started;
    await s.close(); const count = s.messages.length; release(); await pending;
    assert.equal(s.calls.length, 1); assert.equal(s.messages.length, count); assert.equal(s.released(), true);
});
