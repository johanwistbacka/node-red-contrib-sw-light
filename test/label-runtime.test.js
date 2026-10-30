'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const register = require('../nodes/sw-light');

const state = (id, modes = ['brightness'], brightness = 100, value = 'on') => ({ entity_id: id, state: value,
    attributes: { brightness, supported_color_modes: modes, supported_features: 32 } });
function setup(config = {}) {
    let Constructor, observe, connection, registryChange, watched = [], stopped = false;
    let registries = { labels: [{ label_id: 'cozy', name: 'Cozy' }], entities: ['light.window', 'light.table', 'light.floor'].map(entity_id => ({ entity_id, labels: ['cozy'], area_id: 'room' })), devices: [], areas: [{ area_id: 'room' }] };
    const states = { 'light.window': state('light.window', ['brightness'], 239), 'light.table': state('light.table', ['brightness'], 255), 'light.floor': state('light.floor', ['brightness'], 178) };
    const calls = [], messages = [], statuses = [], watches = [];
    let ready = true, failure, registryFailure;
    const adapter = { connected: () => ready, state: id => structuredClone(states[id]), states: () => structuredClone(states), services: () => ({ adaptive_lighting: { apply: {} } }),
        location: async () => ({ latitude: 59.3293, longitude: 18.0686 }),
        subscribe: async (_id, obs, conn) => { observe = obs; connection = conn; },
        watch: async (ids, obs, conn) => { watched = ids; watches.push([...ids]); observe = obs; connection = conn; },
        registries: async () => { if (registryFailure) throw Error('registries unavailable'); return structuredClone(registries); },
        onRegistryChange: cb => { registryChange = cb; },
        call: async (domain, service, data, target) => { calls.push({ domain, service, data, target }); if (target?.entity_id === failure) throw Error('Member transport failed'); },
        close: async () => { stopped = true; watched = []; } };
    const RED = { nodes: { registerType: (_type, ctor) => { Constructor = ctor; }, createNode: node => {
        const e = new EventEmitter(); node.on = e.on.bind(e); node.emit = e.emit.bind(e);
        node.status = value => statuses.push(value); node.send = outputs => messages.push(outputs); node.error = () => {};
    } } };
    register(RED, () => adapter);
    const node = new Constructor({ targetType: 'label', labelId: 'cozy', ...config });
    return { states, calls, messages, statuses, watches,
        input: msg => new Promise(resolve => node.emit('input', msg, outputs => messages.push(outputs), resolve)),
        update: (id, value) => { states[id] = value; if (!stopped && watched.includes(id)) observe(value, id); },
        membership: entries => { registries.entities = entries; registryChange?.(); },
        deleted: () => { registries.labels = []; registryChange?.(); },
        areaDeleted: () => { registries.areas = []; registryChange?.(); },
        fail: id => { failure = id; }, registryFail: value => { registryFailure = value; },
        disconnect: () => { ready = false; connection?.(false); }, reconnect: () => { ready = true; connection?.(true); },
        output: () => messages.filter(m => m[0]).at(-1)?.[0].sw_light,
        close: () => new Promise(resolve => node.emit('close', false, resolve)) };
}

test('aggregate status retains its timestamp on repeated inputs and updates when displayed counts change', async t => {
    let time = new Date(2026, 9, 30, 14, 32, 8).getTime();
    t.mock.method(Date, 'now', () => time);
    const s = setup();
    t.after(() => s.close());
    await s.input({ action: 'off' });
    assert.equal(s.statuses.at(-1).text, '2 on · 1 manual · 30/10 14:32:08');
    time += 1000;
    await s.input({ action: 'off' });
    assert.equal(s.statuses.at(-1).text, '2 on · 1 manual · 30/10 14:32:08');
    s.update('light.floor', state('light.floor', ['brightness'], 100, 'off'));
    assert.equal(s.statuses.at(-1).text, '1 on · 1 manual · 1 off · 30/10 14:32:09');
    time += 1000;
    s.update('light.floor', state('light.floor', ['brightness'], 100, 'off'));
    assert.equal(s.statuses.at(-1).text, '1 on · 1 manual · 1 off · 30/10 14:32:09');
});

test('Area and selected entities retain independent override and partial failure results', async () => {
    for (const config of [{ targetType: 'area', areaId: 'room' },
        { targetType: 'entities', entityIds: ['light.floor', 'light.window', 'light.table', 'light.window'] }]) {
        const s = setup(config); s.fail('light.floor');
        assert.equal(await s.input({ action: 'off' }), undefined);
        assert.deepEqual(s.calls.map(c => c.target.entity_id), ['light.floor', 'light.window']);
        assert.deepEqual(s.output().counts, { succeeded: 1, skipped: 1, failed: 1, manual: 1 });
        assert.equal(s.output().target.type, config.targetType);
        s.update('light.table', state('light.table', ['brightness'], 170));
        s.calls.length = 0; await s.input({ action: 'off' });
        assert.equal(s.output().counts.manual, 0); assert.equal(s.calls.length, 3);
        await s.close();
    }
});
test('Area membership refreshes while idle, recovers on reconnect and stops observing on close', async () => {
    const s = setup({ targetType: 'area', areaId: 'room' }); await s.input({ action: 'off' });
    s.membership([{ entity_id: 'light.window', area_id: 'room' }]);
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.deepEqual(s.watches.at(-1), ['light.window']);
    const before = s.messages.length; s.update('light.table', state('light.table', ['brightness'], 100));
    assert.equal(s.messages.length, before);
    s.disconnect(); s.reconnect(); await new Promise(resolve => setTimeout(resolve, 150));
    assert.deepEqual(s.watches.at(-1), ['light.window']);
    s.membership([]); await s.input({ action: 'on' });
    assert.match(s.statuses.at(-1).text, /^AREA EMPTY · \d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/);
    s.areaDeleted(); s.calls.length = 0; assert.ok(await s.input({ action: 'on' })); assert.equal(s.calls.length, 0);
    await s.close(); const closedCount = s.messages.length;
    s.membership([{ entity_id: 'light.window', area_id: 'room' }]);
    await new Promise(resolve => setTimeout(resolve, 150)); assert.equal(s.messages.length, closedCount);
});
test('runtime selected-entity list overrides one input and next input restores configured Entity', async () => {
    const s = setup({ targetType: 'entity', entityId: 'light.window' });
    await s.input({ action: 'off', target: { type: 'entities', ids: ['light.window', 'light.floor', 'light.window'] } });
    assert.deepEqual(s.output().resolved_entity_ids, ['light.window', 'light.floor']);
    s.calls.length = 0; await s.input({ action: 'off' });
    assert.equal(s.output().entity_id, 'light.window'); assert.equal(s.calls.length, 1); await s.close();
});

test('Label automatic OFF skips only the manually overridden member and aggregates results', async () => {
    const s = setup(); assert.equal(await s.input({ action: 'off', payload: 'kept' }), undefined);
    assert.deepEqual(s.calls.map(c => c.target.entity_id), ['light.floor', 'light.window']);
    const out = s.output(); assert.deepEqual(out.target, { type: 'label', id: 'cozy' });
    assert.deepEqual(out.counts, { succeeded: 2, skipped: 1, failed: 0, manual: 1 });
    assert.equal(out.results.find(r => r.entity_id === 'light.table').manual_override, true);
    assert.match(s.statuses.at(-1).text, /^2 on · 1 manual · \d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/); // transport acknowledgement is not state confirmation
    assert.ok(s.messages.some(m => m[1]?.sw_light_event.entity_id === 'light.table' && m[1].sw_light_event.blocked));
    await s.close();
});
test('lowering one member releases only its override; manual commands preserve semantics', async () => {
    const s = setup(); await s.input({ action: 'off' });
    s.update('light.window', state('light.window', ['brightness'], 255));
    s.update('light.table', state('light.table', ['brightness'], 180));
    s.calls.length = 0; await s.input({ action: 'off' });
    assert.deepEqual(s.calls.map(c => c.target.entity_id), ['light.floor', 'light.table']);
    assert.ok(s.messages.some(m => m[1]?.sw_light_event.type === 'override_released' && m[1].sw_light_event.entity_id === 'light.table'));
    s.calls.length = 0; await s.input({ action: 'off', source: 'manual' }); assert.equal(s.calls.length, 3);
    await s.close();
});
test('heterogeneous capabilities, independent maximum and mixed Adaptive Lighting', async () => {
    const s = setup({ adaptiveEnabled: true, colorMode: 'kelvin', kelvin: 2700 });
    s.states['light.window'] = state('light.window', ['color_temp'], 100, 'off');
    s.states['light.table'] = state('light.table', ['rgb'], 100, 'off');
    s.states['light.floor'] = state('light.floor', ['onoff'], undefined, 'off');
    s.states['switch.profile'] = { entity_id: 'switch.profile', state: 'off', attributes: { configuration: { lights: ['light.window'] } } };
    await s.input({ action: 'on', brightness_pct: 100 });
    const lights = s.calls.filter(c => c.domain === 'light');
    assert.equal(lights.length, 3);
    assert.equal(lights.find(c => c.target.entity_id === 'light.window').data.color_temp_kelvin, 2700);
    assert.equal(lights.find(c => c.target.entity_id === 'light.table').data.color_temp_kelvin, undefined);
    assert.equal(lights.find(c => c.target.entity_id === 'light.floor').data.brightness, undefined);
    for (const c of lights.filter(c => c.target.entity_id !== 'light.floor')) assert.equal(c.data.brightness, 239);
    const applies = s.calls.filter(c => c.domain === 'adaptive_lighting'); assert.equal(applies.length, 1);
    assert.deepEqual(applies[0].data.lights, ['light.window']);
    assert.equal(s.output().counts.succeeded, 3); await s.close();
});
test('Dynamic refreshes already-ON Entity and Label members, while dimming and override preserve CT', async t => {
    const s = setup({ colorMode: 'dynamic', dynamicMinKelvin: 3200, dynamicMaxKelvin: 3200 });
    t.after(() => s.close());
    s.states['light.window'] = state('light.window', ['color_temp'], 239);
    s.states['light.floor'] = state('light.floor', ['color_temp'], 178);
    s.states['light.table'] = state('light.table', ['color_temp'], 255);
    s.states['light.window'].attributes.color_temp_kelvin = 2202;
    s.states['light.floor'].attributes.color_temp_kelvin = 3831;
    assert.equal(await s.input({ action: 'on' }), undefined);
    assert.deepEqual(s.output().counts, { succeeded: 2, skipped: 1, failed: 0, manual: 1 });
    assert.equal(s.calls.length, 2);
    for (const call of s.calls) assert.equal(call.data.color_temp_kelvin, 3200);
    for (const result of s.output().results.filter(r => r.outcome === 'succeeded')) {
        assert.equal(result.dynamic_ct.applied, true); assert.equal(result.dynamic_ct.sent_kelvin, 3200);
    }
    s.calls.length = 0;
    await s.input({ action: 'on', brightness_step_pct: -10 });
    assert.equal(s.calls.length, 2);
    for (const call of s.calls) assert.equal(call.data.color_temp_kelvin, undefined);
    s.calls.length = 0;
    await s.input({ action: 'on', target: { type: 'entity', id: 'light.window' } });
    assert.equal(s.calls.length, 1); assert.equal(s.output().dynamic_ct.sent_kelvin, 3200);
});
test('unavailable and disappearing member do not prevent other successes; failure identifies entity', async () => {
    for (const unavailable of ['unavailable', 'missing', 'transport']) {
        const s = setup();
        if (unavailable === 'missing') delete s.states['light.table'];
        else if (unavailable === 'transport') { s.states['light.table'].attributes.brightness = 100; s.fail('light.table'); }
        else s.states['light.table'].state = 'unavailable';
        assert.equal(await s.input({ action: 'off' }), undefined);
        assert.deepEqual(s.output().counts, { succeeded: 2, skipped: 0, failed: 1, manual: 0 });
        assert.equal(s.output().results.find(r => r.outcome === 'failed').entity_id, 'light.table');
        assert.ok(s.messages.some(m => m[1]?.sw_light_event.entity_id === 'light.table'));
        await s.close();
    }
});
test('dynamic membership reconciles observations, retains existing override and removes departed lights', async () => {
    const s = setup({ overrideStrategy: 'explicit' });
    s.states['light.table'].attributes.brightness = 100;
    await s.input({ action: 'on', source: 'manual', manual_override: true });
    s.states['light.new'] = state('light.new', ['brightness'], 70);
    s.membership(['light.window', 'light.new'].map(entity_id => ({ entity_id, labels: ['cozy'] })));
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.deepEqual(s.watches.at(-1), ['light.new', 'light.window']);
    s.calls.length = 0; await s.input({ action: 'off' });
    assert.deepEqual(s.calls.map(c => c.target.entity_id), ['light.new']);
    assert.equal(s.output().counts.manual, 1);
    const before = s.messages.length; s.update('light.table', state('light.table', ['brightness'], 255));
    assert.equal(s.messages.length, before);
    await s.close();
    s.membership([]); await new Promise(resolve => setTimeout(resolve, 150)); assert.equal(s.messages.length, before);
});
test('empty, deleted and temporarily unavailable Label reports useful events, recovers after reconnect', async () => {
    const s = setup(); s.membership([]); await s.input({ action: 'on' });
    assert.equal(s.output().results.length, 0); assert.match(s.statuses.at(-1).text, /^LABEL EMPTY · \d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/);
    assert.ok(s.messages.some(m => m[1]?.sw_light_event.type === 'target_empty'));
    s.deleted(); assert.ok(await s.input({ action: 'on' }));
    assert.ok(s.messages.some(m => m[1]?.sw_light_event.type === 'target_resolution_failure')); await s.close();
    const r = setup(); r.registryFail(true); assert.ok(await r.input({ action: 'on' }));
    r.registryFail(false); r.disconnect(); assert.ok(await r.input({ action: 'off' }));
    r.reconnect(); await new Promise(resolve => setTimeout(resolve, 150));
    await r.input({ action: 'off' }); assert.equal(r.output().counts.succeeded, 2); await r.close();
});
test('structured runtime target overrides configuration; next input restores configured Label', async () => {
    const s = setup(); await s.input({ action: 'off', target: { type: 'entity', id: 'light.window' } });
    assert.equal(s.output().entity_id, 'light.window'); assert.equal(s.calls.length, 1);
    await s.input({ action: 'off' }); assert.equal(s.output().target.type, 'label'); assert.equal(s.output().results.length, 3);
    assert.ok(await s.input({ action: 'off', target: { type: 'area', id: 'a' } })); await s.close();
});

test('closing a Label during the first action prevents remaining lights and aggregate output', async () => {
    let Constructor, release, started;
    const actionStarted = new Promise(resolve => { started = resolve; });
    const calls = [], messages = [];
    const adapter = { connected: () => true, subscribe: async () => {}, watch: async () => {}, close: async () => {},
        registries: async () => ({ labels: [{ label_id: 'test' }], entities: ['light.a', 'light.b'].map(entity_id => ({ entity_id, labels: ['test'] })), devices: [], areas: [] }),
        state: id => state(id, ['brightness'], 100, 'off'), states: () => ({}), services: () => ({}),
        call: async (...args) => { calls.push(args); started(); await new Promise(resolve => { release = resolve; }); } };
    const RED = { nodes: { registerType: (_name, ctor) => { Constructor = ctor; }, createNode: node => {
        const e = new EventEmitter(); node.on = e.on.bind(e); node.emit = e.emit.bind(e);
        node.status = () => {}; node.send = out => messages.push(out); node.error = () => {};
    } } };
    register(RED, () => adapter);
    const node = new Constructor({ targetType: 'label', labelId: 'test', adaptiveEnabled: true });
    const complete = new Promise(resolve => node.emit('input', { action: 'on' }, out => messages.push(out), resolve));
    await actionStarted;
    const close = new Promise(resolve => node.emit('close', false, resolve));
    release(); await complete; await close;
    assert.equal(calls.length, 1); assert.equal(messages.length, 0);
});


const groupState = (id, members) => ({ entity_id: id, state: 'on', attributes: { brightness: 255, entity_id: members } });
test('Group controls leaves independently, keeps dimming CT and reports partial failure', async t => {
    const s = setup({ targetType: 'group', groupId: 'light.room', colorMode: 'dynamic', dynamicMinKelvin: 3200, dynamicMaxKelvin: 3200 });
    t.after(() => s.close());
    s.states['light.room'] = groupState('light.room', ['light.window', 'group.nested', 'light.window']);
    s.states['group.nested'] = groupState('group.nested', ['light.floor', 'light.table', 'sensor.ignored']);
    for (const id of ['light.window', 'light.floor', 'light.table']) s.states[id].attributes.supported_color_modes = ['color_temp'];
    s.fail('light.floor'); assert.equal(await s.input({ action: 'on' }), undefined);
    assert.deepEqual(s.calls.map(c => c.target.entity_id), ['light.floor', 'light.window']);
    assert.deepEqual(s.output().counts, { succeeded: 1, skipped: 1, failed: 1, manual: 1 });
    for (const c of s.calls) assert.equal(c.data.color_temp_kelvin, 3200);
    s.calls.length = 0; await s.input({ action: 'on', brightness_step_pct: -10 });
    for (const c of s.calls) assert.equal(c.data.color_temp_kelvin, undefined);
    s.states['light.table'].state = 'unavailable'; s.fail(undefined);
    s.calls.length = 0; await s.input({ action: 'off' });
    assert.deepEqual(s.output().counts, { succeeded: 2, skipped: 0, failed: 1, manual: 1 });
    assert.equal(s.output().target.type, 'group'); assert.equal(s.output().results.find(r => r.outcome === 'failed').entity_id, 'light.table');
});
test('Group observes nested idle membership changes, reconnects and recovers deleted roots', async t => {
    const s = setup({ targetType: 'group', groupId: 'light.room', overrideStrategy: 'explicit' }); t.after(() => s.close());
    s.states['light.room'] = groupState('light.room', ['group.nested']);
    s.states['group.nested'] = groupState('group.nested', ['light.window']);
    await s.input({ action: 'on', source: 'manual', manual_override: true });
    s.update('group.nested', groupState('group.nested', ['light.window', 'light.floor']));
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.deepEqual(s.watches.at(-1), ['light.floor', 'light.window', 'group.nested', 'light.room']);
    s.calls.length = 0; await s.input({ action: 'off' }); assert.deepEqual(s.calls.map(c => c.target.entity_id), ['light.floor']);
    s.disconnect(); s.states['group.nested'] = groupState('group.nested', ['light.window']); s.reconnect();
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.deepEqual(s.watches.at(-1), ['light.window', 'group.nested', 'light.room']);
    delete s.states['light.room']; s.calls.length = 0;
    assert.ok(await s.input({ action: 'on' })); assert.equal(s.calls.length, 0);
    assert.deepEqual(s.watches.at(-1), ['group.nested', 'light.room']);
    s.update('light.room', groupState('light.room', [])); await new Promise(resolve => setTimeout(resolve, 150));
    assert.match(s.statuses.at(-1).text, /^GROUP EMPTY · \d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/);
    await s.close(); const count = s.messages.length;
    s.update('light.room', groupState('light.room', ['light.floor'])); await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(s.messages.length, count);
});
test('Group runtime override is restored to configured Entity on the next input', async t => {
    const s = setup({ targetType: 'entity', entityId: 'light.window' }); t.after(() => s.close());
    s.states['group.room'] = groupState('group.room', ['light.floor', 'light.window']);
    await s.input({ action: 'off', target: { type: 'group', id: 'group.room' } });
    assert.deepEqual(s.output().resolved_entity_ids, ['light.floor', 'light.window']);
    s.calls.length = 0; await s.input({ action: 'off' }); assert.equal(s.calls.length, 1); assert.equal(s.output().entity_id, 'light.window');
});


test('failed Group message override recovers on idle root repair and next input restores Entity', async t => {
    const s = setup({ targetType: 'entity', entityId: 'light.window' }); t.after(() => s.close());
    assert.ok(await s.input({ action: 'on', target: { type: 'group', id: 'light.missing_group' } }));
    assert.equal(s.calls.length, 0); assert.deepEqual(s.watches.at(-1), ['light.missing_group']);
    s.update('light.missing_group', groupState('light.missing_group', ['light.floor']));
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.deepEqual(s.watches.at(-1), ['light.floor', 'light.missing_group']);
    assert.equal(s.calls.length, 0); assert.match(s.statuses.at(-1).text, /^1 on · \d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/);
    await s.input({ action: 'off' }); assert.equal(s.calls.length, 1); assert.equal(s.output().entity_id, 'light.window');
});


test('deleted known nested light group fails closed, and removing it from root permits recovery', async t => {
    const s = setup({ targetType: 'group', groupId: 'light.room' }); t.after(() => s.close());
    s.states['light.room'] = groupState('light.room', ['light.nested', 'light.window']);
    s.states['light.nested'] = groupState('light.nested', ['light.floor']);
    await s.input({ action: 'off' }); assert.equal(s.calls.length, 2);
    s.update('light.nested', undefined); delete s.states['light.nested']; await new Promise(resolve => setTimeout(resolve, 150)); s.calls.length = 0;
    assert.ok(await s.input({ action: 'on' })); assert.equal(s.calls.length, 0); assert.match(s.statuses.at(-1).text, /^TARGET UNAVAILABLE · \d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/);
    s.states['light.nested'] = { entity_id: 'light.nested', state: 'unavailable', attributes: {} };
    assert.ok(await s.input({ action: 'on' })); assert.equal(s.calls.length, 0);
    delete s.states['light.nested'];
    s.update('light.room', groupState('light.room', ['light.window'])); await new Promise(resolve => setTimeout(resolve, 150));
    await s.input({ action: 'off' }); assert.equal(s.calls.length, 1);
    // Removed group identities expire after successful reconciliation; a later plain missing light is a per-leaf failure.
    s.update('light.room', groupState('light.room', ['light.nested', 'light.window']));
    s.calls.length = 0; await s.input({ action: 'off' });
    assert.deepEqual(s.output().counts, { succeeded: 1, skipped: 0, failed: 1, manual: 0 }, JSON.stringify(s.output().results));
});


test('explicit Kelvin clamps per selected lamp and reports actual sent values in result output', async t => {
    const s = setup({ targetType: 'entities', entityIds: ['light.window', 'light.floor', 'light.table'] }); t.after(() => s.close());
    for (const [id, max] of [['light.window', 4000], ['light.floor', 6500]]) {
        Object.assign(s.states[id].attributes, { supported_color_modes: ['color_temp'], min_color_temp_kelvin: 2202, max_color_temp_kelvin: max });
    }
    await s.input({ action: 'on', source: 'manual', color_temp_kelvin: 5000 });
    assert.deepEqual(s.output().counts, { succeeded: 3, skipped: 0, failed: 0, manual: 1 });
    assert.equal(s.calls.find(c => c.target.entity_id === 'light.window').data.color_temp_kelvin, 4000);
    assert.equal(s.calls.find(c => c.target.entity_id === 'light.floor').data.color_temp_kelvin, 5000);
    assert.equal(s.calls.find(c => c.target.entity_id === 'light.table').data.color_temp_kelvin, undefined);
    assert.equal(s.output().results.find(r => r.entity_id === 'light.window').service_data.color_temp_kelvin, 4000);
    assert.ok(s.messages.some(m => m[1]?.sw_light_event.type === 'unsupported' && m[1].sw_light_event.entity_id === 'light.table'));
    s.calls.length = 0; await s.input({ action: 'on', color_temp_kelvin: 5000 });
    assert.equal(s.calls.length, 2); assert.equal(s.output().counts.skipped, 1);
});
