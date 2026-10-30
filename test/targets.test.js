'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { target, labelLights, resolveTarget, aggregateStatus } = require('../lib/targets');
const light = require('../lib/light');
const registry = () => ({ labels: [{ label_id: 'cozy', name: 'Cozy lights' }], entities: [], devices: [], areas: [] });
const entity = (id, extra = {}) => ({ entity_id: id, labels: [], hidden_by: null, disabled_by: null, entity_category: null, ...extra });

test('Area membership respects explicit entity area, filters indirect diagnostics and fails closed', async () => {
    const { areaLights } = require('../lib/targets');
    const r = registry(); r.areas = [{ area_id: 'room' }, { area_id: 'empty' }];
    r.devices = [{ id: 'inside', area_id: 'room' }, { id: 'outside', area_id: 'other' }];
    r.entities = [entity('light.direct', { area_id: 'room', device_id: 'outside' }),
        entity('light.inherited', { device_id: 'inside' }), entity('light.moved', { device_id: 'inside', area_id: 'other' }),
        entity('light.hidden', { area_id: 'room', hidden_by: 'user' }), entity('light.disabled', { area_id: 'room', disabled_by: 'integration' }),
        entity('light.diagnostic', { area_id: 'room', entity_category: 'diagnostic' }), entity('sensor.other', { area_id: 'room' })];
    const before = structuredClone(r);
    assert.deepEqual(areaLights('room', r), ['light.direct', 'light.inherited']);
    assert.deepEqual(r, before); assert.deepEqual(areaLights('empty', r), []);
    assert.throws(() => areaLights('missing', r), /deleted/);
    assert.throws(() => areaLights('room', {}), /unavailable/);
    assert.equal(light.config({ targetType: 'area', areaId: 'room' }).areaId, 'room');
    assert.deepEqual(await resolveTarget({ registries: async () => r }, { type: 'area', id: 'room' }), ['light.direct', 'light.inherited']);
});
test('multiple entities require a nonempty light ID list, deduplicate and never depend on registry availability', async () => {
    const configured = target({ targetType: 'entities', entityIds: ['light.two', 'light.one', 'light.two'] });
    assert.deepEqual(configured, { type: 'entities', ids: ['light.two', 'light.one'] });
    assert.deepEqual(light.config({ targetType: 'entities', entityIds: configured.ids }).entityIds, configured.ids);
    const resolver = require('../lib/targets').createTargetResolver({ registries: assert.fail });
    const ids = await resolver(configured); ids.push('light.local');
    assert.deepEqual(await resolver(configured), ['light.two', 'light.one']);
    assert.deepEqual(await resolveTarget({}, configured), configured.ids);
    for (const ids of [null, [], 'light.one', ['light.one', 'switch.bad'], [''], [42]]) {
        assert.throws(() => target({}, { type: 'entities', ids }), /light entities/);
    }
});
test('resolver separates identical Area and Label IDs and refreshes Area membership', async () => {
    let r = registry(); r.areas = [{ area_id: 'cozy' }];
    r.entities = [entity('light.label', { labels: ['cozy'] }), entity('light.area', { area_id: 'cozy' })];
    const resolve = require('../lib/targets').createTargetResolver({ registries: async () => r });
    assert.deepEqual(await resolve({ type: 'label', id: 'cozy' }), ['light.label']);
    assert.deepEqual(await resolve({ type: 'area', id: 'cozy' }), ['light.area']);
    r = { ...r, entities: [entity('light.new', { area_id: 'cozy' })] };
    assert.deepEqual(await resolve({ type: 'area', id: 'cozy' }), ['light.new']);
    assert.equal(aggregateStatus([], 'area').text, 'AREA EMPTY');
});

test('legacy Entity, explicit Entity and Label configurations use stable identity', async () => {
    assert.deepEqual(target({ entityId: 'light.old' }), { type: 'entity', id: 'light.old' });
    assert.equal(light.config({ entityId: 'light.old' }).targetType, 'entity');
    assert.equal(light.config({ targetType: 'label', labelId: 'cozy' }).labelId, 'cozy');
    assert.deepEqual(await resolveTarget({}, target({ targetType: 'entity', entityId: 'light.new' })), ['light.new']);
    for (const value of [null, 'cozy', { type: 'device', id: 'room' }, { type: 'label', id: '' }, { type: 'entity', id: 'switch.bad' }]) {
        assert.throws(() => target({}, value));
    }
});
test('Label resolves direct entities and devices, deduplicates and filters non-light/hidden/disabled members', () => {
    const r = registry(); r.devices = [{ id: 'd', labels: ['cozy'] }];
    r.entities = [entity('light.direct', { labels: ['cozy'] }), entity('light.device', { device_id: 'd' }),
        entity('light.both', { labels: ['cozy'], device_id: 'd' }), entity('sensor.other', { labels: ['cozy'] }),
        entity('light.hidden', { labels: ['cozy'], hidden_by: 'user' }), entity('light.disabled', { labels: ['cozy'], disabled_by: 'integration' }),
        entity('light.diagnostic', { device_id: 'd', entity_category: 'diagnostic' }),
        entity('light.direct_config', { labels: ['cozy'], entity_category: 'config' })];
    const before = structuredClone(r);
    assert.deepEqual(labelLights('cozy', r), ['light.both', 'light.device', 'light.direct', 'light.direct_config']);
    assert.deepEqual(r, before);
});
test('Label area relationships follow entity area precedence, without inheriting parent device labels', () => {
    const r = registry(); r.areas = [{ area_id: 'a', labels: ['cozy'] }];
    r.devices = [{ id: 'parent', labels: ['cozy'] }, { id: 'child', via_device_id: 'parent', labels: [] }, { id: 'area_device', area_id: 'a', labels: [] }];
    r.entities = [entity('light.direct_area', { area_id: 'a' }), entity('light.inherited_area', { device_id: 'area_device' }),
        entity('light.other_area', { device_id: 'area_device', area_id: 'elsewhere' }), entity('light.child', { device_id: 'child' })];
    assert.deepEqual(labelLights('cozy', r), ['light.direct_area', 'light.inherited_area']);
});
test('empty, deleted and temporarily unavailable registries are distinct', async () => {
    assert.deepEqual(labelLights('cozy', registry()), []);
    const r = registry(); r.entities = [entity('sensor.only', { labels: ['cozy'] })];
    assert.deepEqual(labelLights('cozy', r), []);
    assert.throws(() => labelLights('deleted', r), /deleted/);
    assert.throws(() => labelLights('cozy', {}), /unavailable/);
    await assert.rejects(resolveTarget({ registries: async () => { throw Error('temporarily unavailable'); } }, { type: 'label', id: 'cozy' }));
});
test('aggregate status represents independent observed states', () => {
    assert.equal(aggregateStatus([{ state: 'on' }, { state: 'on', manual_override: true }, { state: 'off' }, { state: 'unavailable' }]).text, '1 on · 1 manual · 1 off · 1 unavailable');
    assert.equal(aggregateStatus([]).text, 'LABEL EMPTY');
});


test('resolver caches membership per registry snapshot and refreshes on replacement', async () => {
    const { createTargetResolver } = require('../lib/targets');
    let r = registry(); r.entities.push(entity('light.first', { labels: ['cozy'] }));
    const resolve = createTargetResolver({ registries: async () => r });
    const configured = { type: 'label', id: 'cozy' };
    assert.deepEqual(await resolve(configured), ['light.first']);
    // Snapshots are immutable; replacement is the adapter invalidation boundary.
    r = { ...r, entities: [entity('light.second', { labels: ['cozy'] })] };
    const ids = await resolve(configured); ids.push('light.local');
    assert.deepEqual(await resolve(configured), ['light.second']);
});


test('Group expands nested modern and legacy groups, deduplicates lights and preserves snapshots', async () => {
    const { groupMembers, createTargetResolver } = require('../lib/targets');
    const group = members => ({ state: 'on', attributes: { entity_id: members } });
    const states = { 'light.room': group(['light.one', 'group.nested', 'light.sub']),
        'group.nested': group(['light.two', 'sensor.ignored', 'light.one']), 'light.sub': group(['light.two', 'light.missing']) };
    const before = structuredClone(states);
    const result = { ids: ['light.missing', 'light.one', 'light.two'], groups: ['group.nested', 'light.room', 'light.sub'] };
    assert.deepEqual(groupMembers('light.room', states), result); assert.deepEqual(states, before);
    const configured = target({ targetType: 'group', groupId: 'light.room' });
    assert.equal(light.config({ targetType: 'group', groupId: 'light.room' }).groupId, 'light.room');
    assert.deepEqual(await resolveTarget({ state: id => states[id] }, configured), result.ids);
    const resolve = createTargetResolver({ state: id => states[id], registries: assert.fail });
    const ids = await resolve(configured); ids.push('light.extra');
    const groups = resolve.groupIds(); groups.push('group.extra');
    assert.deepEqual(resolve.groupIds(), result.groups);
    states['light.room'] = group(['light.new']);
    assert.deepEqual(await resolve(configured), ['light.new']); assert.deepEqual(resolve.groupIds(), ['light.room']);
    await resolve({ type: 'entity', id: 'light.one' }); assert.deepEqual(resolve.groupIds(), []);
    assert.deepEqual(groupMembers('group.empty', { 'group.empty': group([]) }).ids, []);
});
test('Group malformed, missing and cyclic memberships fail closed', () => {
    const { groupMembers } = require('../lib/targets');
    for (const id of ['switch.group', 'light.', '', 'light.bad id']) assert.throws(() => target({ targetType: 'group', groupId: id }));
    const group = members => ({ attributes: { entity_id: members } });
    for (const members of [undefined, null, 'light.one', ['light.one', 42], ['light.one', 'bad']]) {
        assert.throws(() => groupMembers('light.root', { 'light.root': group(members) }), { eventType: 'target_resolution_failure' });
    }
    for (const states of [{}, { 'group.root': group(['light.one', 'group.missing']) },
        { 'group.root': group(['light.one', 'group.root']) },
        { 'group.root': group(['light.one', 'light.nested']), 'light.nested': group(['group.root']) }]) {
        assert.throws(() => groupMembers('group.root', states), { eventType: 'target_resolution_failure' });
    }
});
