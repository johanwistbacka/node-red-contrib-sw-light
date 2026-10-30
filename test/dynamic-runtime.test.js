'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { config } = require('../lib/light');
const { createController } = require('../lib/controller');
function fixture(extra = {}) {
    let time = Date.parse('2026-06-21T10:50:42.679Z'), closed = false;
    let state = { entity_id: 'light.one', state: 'off', attributes: { brightness: 100,
        supported_color_modes: ['color_temp', 'rgb'], supported_features: 32,
        min_color_temp_kelvin: 2700, max_color_temp_kelvin: 4000 } };
    const calls = [], events = []; let locations = 0;
    const adapter = { state: () => state, states: () => ({}), services: () => ({}), connected: () => true,
        location: async () => { locations++; if (extra.locationError) throw Error('secret coordinates');
            return extra.location || { latitude: 59.3293, longitude: 18.0686 }; },
        call: async (...args) => calls.push(args) };
    const c = config({ entityId: 'light.one', colorMode: 'dynamic', adaptiveEnabled: true, ...extra.config });
    const node = { send: outputs => events.push(outputs[1]), status() {} };
    const controller = createController(c, adapter, node, () => closed, () => time);
    return { calls, events, adapter, controller, locations: () => locations,
        setTime: value => { time = Date.parse(value); }, setState: value => { state = value; }, state: () => state,
        close: () => { closed = true; }, run: msg => controller.execute({ action: 'on', ...msg }, node.send) };
}
test('OFF → ON uses fresh Kelvin in one call and clamps; already-ON brightness preserves CT', async () => {
    const f = fixture(); let result = await f.run({});
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0][2].color_temp_kelvin, 4000);
    assert.equal(f.calls[0][2].brightness, 239); assert.equal(result.dynamic_ct.desired_kelvin, 5500);
    assert.equal(result.adaptive_lighting, false);
    f.setState({ ...f.state(), state: 'on' }); f.setTime('2026-06-21T23:00Z');
    await f.run({ brightness_pct: 80 }); assert.equal(f.calls[1][2].color_temp_kelvin, undefined); assert.equal(f.locations(), 1);
    f.setState({ ...f.state(), state: 'off' }); result = await f.run({ action: 'toggle' });
    assert.equal(f.calls[2][2].color_temp_kelvin, 2700); assert.equal(result.dynamic_ct.desired_kelvin, 2000); assert.equal(f.locations(), 2);
});
test('each ON refreshes solar CT on an already-ON lamp, including manual and configured ON', async () => {
    for (const config of [{}, { action: 'on' }]) {
        const f = fixture({ config });
        f.setState({ ...f.state(), state: 'on' });
        let result = await f.run({});
        assert.equal(result.dynamic_ct.applied, true); assert.equal(result.dynamic_ct.desired_kelvin, 5500);
        assert.equal(f.calls[0][2].color_temp_kelvin, 4000);
        f.setTime('2026-06-21T23:00Z');
        result = await f.run({ source: 'manual' });
        assert.equal(result.dynamic_ct.desired_kelvin, 2000); assert.equal(f.calls[1][2].color_temp_kelvin, 2700);
        assert.equal(f.locations(), 2); assert.equal(f.calls.length, 2);
    }
});
test('absolute and relative dimming on an already-ON lamp preserve CT without location lookup', async () => {
    for (const msg of [{ brightness_pct: 60 }, { brightness: 153 },
        { brightness_step_pct: -10 }, { brightness_step: -20 }]) {
        const f = fixture(); f.setState({ ...f.state(), state: 'on' });
        const result = await f.run(msg);
        assert.equal(result.dynamic_ct.reason, 'brightness_only'); assert.equal(result.dynamic_ct.applied, false);
        assert.equal(f.calls[0][2].color_temp_kelvin, undefined); assert.equal(f.locations(), 0);
        assert.equal(f.calls[0][1], 'turn_on'); assert.ok(f.calls[0][2].brightness < 239);
    }
});
test('brightness supplied when turning an OFF lamp ON still sets its initial solar CT', async () => {
    const f = fixture(); const result = await f.run({ brightness_pct: 60 });
    assert.equal(result.dynamic_ct.applied, true); assert.equal(f.calls[0][2].color_temp_kelvin, 4000);
    assert.equal(f.calls[0][2].brightness, 153); assert.equal(f.locations(), 1);
});
test('explicit Kelvin, mired and RGB win even on an already-ON light; no location required', async () => {
    for (const msg of [{ color_temp_kelvin: 3200 }, { color_temp: 312.5 }, { rgb_color: [255, 0, 0] }]) {
        const f = fixture({ locationError: true });
        for (const state of ['off', 'on']) {
            f.setState({ ...f.state(), state }); await f.run(msg);
            const data = f.calls.at(-1)[2];
            if (msg.rgb_color) assert.deepEqual(data.rgb_color, [255, 0, 0]); else assert.equal(data.color_temp_kelvin, 3200);
        }
        assert.equal(f.locations(), 0); assert.equal(f.calls.length, 2);
    }
});
test('non-CT, missing location, invalid location/range all retain normal ON', async () => {
    for (const extra of [{ locationError: true }, { location: { latitude: 91, longitude: 18 } }, { nonCt: true }, { badRange: true }]) {
        const f = fixture(extra);
        if (extra.nonCt) f.state().attributes.supported_color_modes = ['brightness'];
        if (extra.badRange) f.state().attributes.max_color_temp_kelvin = 2000;
        const result = await f.run({}); assert.equal(result.outcome, 'succeeded');
        assert.equal(f.calls.length, 1); assert.equal(f.calls[0][2].brightness, 239); assert.equal(f.calls[0][2].color_temp_kelvin, undefined);
        assert.equal(result.dynamic_ct.applied, false);
        if (extra.nonCt) assert.equal(f.locations(), 0); else assert.ok(f.events.some(e => e.sw_light_event.phase === 'dynamic_ct'));
        assert.doesNotMatch(JSON.stringify(f.events) + JSON.stringify(result), /secret coordinates|latitude|longitude/);
    }
});
test('manual brightness protection, OFF and zero brightness do not calculate; manual ON calculates', async () => {
    const f = fixture(); f.setState({ ...f.state(), state: 'on', attributes: { ...f.state().attributes, brightness: 255 } });
    for (const action of ['on', 'off', 'toggle']) assert.equal((await f.run({ action })).outcome, 'skipped');
    assert.equal(f.calls.length, 0); assert.equal(f.locations(), 0);
    f.setState({ ...f.state(), state: 'off' });
    await f.run({ action: 'off' }); await f.run({ brightness_pct: 0 }); assert.equal(f.locations(), 0);
    await f.run({ source: 'manual' }); assert.equal(f.locations(), 1); assert.ok(f.calls.at(-1)[2].color_temp_kelvin);
});
test('legacy keep and fixed modes remain unchanged', async () => {
    for (const colorMode of ['keep', 'kelvin', 'mired', 'color', 'default']) {
        const f = fixture({ config: { colorMode, adaptiveEnabled: false } }); await f.run({}); assert.equal(f.locations(), 0);
        assert.equal(f.calls.length, 1);
        if (colorMode === 'kelvin') assert.equal(f.calls[0][2].color_temp_kelvin, 2700);
    }
});
test('closing during location retrieval prevents later light command', async () => {
    const f = fixture(); let release, entered;
    const started = new Promise(resolve => { entered = resolve; });
    f.adapter.location = () => { entered(); return new Promise(resolve => { release = resolve; }); };
    const pending = f.run({}); await started; f.close(); release({ latitude: 59.3293, longitude: 18.0686 });
    assert.equal((await pending).reason, 'node_closed'); assert.equal(f.calls.length, 0);
});

test('external ON, override or unavailable state during location lookup is respected, including failure', async () => {
    for (const reject of [false, true]) for (const kind of ['normal_on', 'override', 'unavailable']) {
        const f = fixture(); let release, entered;
        const started = new Promise(resolve => { entered = resolve; });
        f.adapter.location = () => { entered(); return new Promise((resolve, fail) => {
            release = () => reject ? fail(Error('location failed')) : resolve({ latitude: 59.3293, longitude: 18.0686 });
        }); };
        const pending = f.run({}); await started;
        f.setState({ ...f.state(), state: kind === 'unavailable' ? 'unavailable' : 'on',
            attributes: { ...f.state().attributes, brightness: kind === 'override' ? 255 : 100 } });
        release(); const result = await pending;
        if (kind === 'normal_on') {
            assert.equal(result.outcome, 'succeeded'); assert.equal(f.calls.length, 1);
            assert.equal(f.calls[0][2].color_temp_kelvin, reject ? undefined : 4000);
            assert.equal(result.dynamic_ct.applied, !reject);
        } else { assert.equal(f.calls.length, 0); assert.equal(result.outcome, kind === 'override' ? 'skipped' : 'failed'); }
    }
});

test('state reread preserves dimming after external ON and resolves toggle to OFF', async () => {
    for (const msg of [{ brightness_pct: 60 }, { action: 'toggle' }]) {
        const f = fixture(); let release, entered;
        const started = new Promise(resolve => { entered = resolve; });
        f.adapter.location = () => { entered(); return new Promise(resolve => { release = resolve; }); };
        const pending = f.run(msg); await started;
        f.setState({ ...f.state(), state: 'on' });
        release({ latitude: 59.3293, longitude: 18.0686 });
        const result = await pending;
        assert.equal(result.dynamic_ct.reason, 'state_changed'); assert.equal(f.calls.length, 1);
        assert.equal(f.calls[0][2].color_temp_kelvin, undefined);
        assert.equal(f.calls[0][1], msg.action === 'toggle' ? 'turn_off' : 'turn_on');
    }
});
