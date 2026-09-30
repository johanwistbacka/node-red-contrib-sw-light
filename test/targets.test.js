'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { target, labelLights, resolveTarget, aggregateStatus } = require('../lib/targets');
const light = require('../lib/light');
const registry = () => ({ labels: [{ label_id: 'cozy', name: 'Cozy lights' }], entities: [], devices: [], areas: [] });
const entity = (id, extra = {}) => ({ entity_id: id, labels: [], hidden_by: null, disabled_by: null, entity_category: null, ...extra });

test('legacy Entity, explicit Entity and Label configurations use stable identity', async () => {
    assert.deepEqual(target({ entityId: 'light.old' }), { type: 'entity', id: 'light.old' });
    assert.equal(light.config({ entityId: 'light.old' }).targetType, 'entity');
    assert.equal(light.config({ targetType: 'label', labelId: 'cozy' }).labelId, 'cozy');
    assert.deepEqual(await resolveTarget({}, target({ targetType: 'entity', entityId: 'light.new' })), ['light.new']);
    for (const value of [null, 'cozy', { type: 'area', id: 'room' }, { type: 'label', id: '' }, { type: 'entity', id: 'switch.bad' }]) {
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
