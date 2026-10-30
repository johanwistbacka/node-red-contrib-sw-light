'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const html = fs.readFileSync(require.resolve('../nodes/sw-light.html'), 'utf8');
const script = html.match(/<script type="text\/javascript">([\s\S]*?)<\/script>/)[1];
function savedValidation() {
    let definition;
    vm.runInNewContext(script, { RED: { nodes: { registerType: (_name, def) => { definition = def; } } }, $: () => ({ length: 0 }) });
    return definition;
}

test('saved pre-Dynamic Entity and Label nodes validate without mutation or resaving', () => {
    const definition = savedValidation();
    for (const targetType of [undefined, 'entity', 'label']) {
        const node = Object.fromEntries(Object.entries(definition.defaults).map(([key, rule]) => [key, rule.value]));
        Object.assign(node, { server: 'server', entityId: 'light.example', labelId: 'cozy', brightnessPct: '95', autoMaxPct: '97' });
        delete node.dynamicMinKelvin; delete node.dynamicMaxKelvin; delete node.groupId;
        if (targetType === undefined) delete node.targetType;
        else node.targetType = targetType;
        const before = JSON.stringify(node);
        for (const [key, rule] of Object.entries(definition.defaults)) {
            if (rule.validate) assert.equal(rule.validate.call(node, node[key]), true, `${targetType ?? 'legacy'}: ${key}`);
        }
        assert.equal(JSON.stringify(node), before);
    }
});

test('Dynamic range fallback preserves strict validation of explicitly saved values', () => {
    const { defaults } = savedValidation();
    for (const key of ['dynamicMinKelvin', 'dynamicMaxKelvin']) {
        assert.equal(defaults[key].validate.call({}, undefined), true);
        for (const value of ['', '  ']) assert.equal(defaults[key].validate.call({ [key]: value }, value), true);
        for (const value of [null, false, [], [2000], {}, 'invalid', 999, 40001, 2000.5]) assert.equal(defaults[key].validate.call({ [key]: value }, value), false);
    }
    assert.equal(defaults.dynamicMinKelvin.validate.call({ dynamicMinKelvin: 6000 }, 6000), false);
    assert.equal(defaults.dynamicMaxKelvin.validate.call({ dynamicMaxKelvin: 1500 }, 1500), false);
    assert.equal(defaults.targetType.validate('device'), false);
});

function editor(overrides = {}) {
    let definition;
    const fields = new Map(), requests = [];
    function $(selector) {
        if (!fields.has(selector)) fields.set(selector, { value: '', checked: false, textValue: '', visible: true, events: {}, length: 1, attributes: {},
            empty() { return this; }, appendTo() { return this; },
            attr(key, value) { if (value === undefined) return this.attributes[key]; this.attributes[key] = value; return this; },
            val(value) {
                if (value === undefined) return this.value;
                this.value = this.attributes.type === 'text' ? (value === null ? '' : String(value)) : value;
                // Model browser coercion of number inputs, including jQuery's null handling.
                if (this.attributes.type === 'number') {
                    const text = value === null ? '' : String(value);
                    this.value = text.trim() && /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text) ? text : '';
                }
                return this;
            },
            prop(key, value) { if (value === undefined) return this[key]; this[key] = value; return this; },
            text(value) { this.textValue = value; return this; }, hide() { this.visible = false; return this; }, show() { this.visible = true; return this; },
            toggle(value) { this.visible = value; return this; },
            on(event, callback) { this.events[event] = callback; return this; }, off() { this.events = {}; return this; },
            autocomplete(options) { if (typeof options === 'object') this.options = options; if (options === 'destroy') this.destroyed = true; return this; } });
        return fields.get(selector);
    }
    $.getJSON = url => {
        const request = { url, done(cb) { this.success = cb; return this; }, fail(cb) { this.failure = cb; return this; }, abort() { this.aborted = true; } };
        requests.push(request); return request;
    };
    vm.runInNewContext(script, { RED: { nodes: { registerType: (_name, def) => { definition = def; } } }, $ });
    const saved = Object.fromEntries(Object.entries(definition.defaults).map(([key, value]) => [key, value.value]));
    saved.server = 'server'; saved.targetType = 'label'; saved.labelId = 'cozy_id';
    Object.assign(saved, overrides);
    for (const [key, value] of Object.entries(saved)) {
        if (key === 'dynamicMinKelvin' || key === 'dynamicMaxKelvin') $('#node-input-' + key).attr('type', html.match(new RegExp('id="node-input-' + key + '" type="([^"]+)"'))[1]);
        $('#node-input-' + key).val(value); if (typeof value === 'boolean') $('#node-input-' + key).prop('checked', value);
    }
    definition.oneditprepare.call(saved);
    return { definition, saved, $, requests };
}

test('missing and blank Dynamic bounds validate all saved targets without resaving', () => {
    const { defaults } = savedValidation();
    for (const targetType of ['entity', 'entities', 'label', 'area', 'group']) {
        for (const colorMode of ['keep', 'default', 'dynamic', 'kelvin', 'mired', 'color']) {
            for (const bounds of [{}, { dynamicMinKelvin: '', dynamicMaxKelvin: ' ' }, { dynamicMinKelvin: '3000', dynamicMaxKelvin: '' }]) {
                const saved = Object.fromEntries(Object.entries(defaults).map(([key, rule]) => [key, rule.value]));
                delete saved.dynamicMinKelvin; delete saved.dynamicMaxKelvin;
                Object.assign(saved, { server: 'server', targetType, entityId: 'light.one', entityIds: ['light.one', 'light.two'], labelId: 'hall', areaId: 'hall', groupId: 'light.hall', colorMode }, bounds);
                const before = JSON.stringify(saved);
                for (const [key, rule] of Object.entries(defaults)) {
                    if (rule.validate) assert.equal(rule.validate.call(saved, saved[key]), true, `${targetType}/${colorMode}: ${key}`);
                }
                assert.equal(JSON.stringify(saved), before);
            }
        }
    }
});

test('opening old nodes fills only missing or blank Dynamic bounds and cancel preserves saved config', () => {
    for (const bounds of [
        { dynamicMinKelvin: undefined, dynamicMaxKelvin: undefined },
        { dynamicMinKelvin: '', dynamicMaxKelvin: '  ' },
        { dynamicMinKelvin: '3000', dynamicMaxKelvin: undefined },
        { dynamicMinKelvin: undefined, dynamicMaxKelvin: '4500' },
        { dynamicMinKelvin: '6000', dynamicMaxKelvin: '1500' },
        { dynamicMinKelvin: null, dynamicMaxKelvin: false }
    ]) {
        const e = editor(bounds), before = JSON.stringify(e.saved);
        for (const key of ['dynamicMinKelvin', 'dynamicMaxKelvin']) {
            const value = bounds[key];
            const expected = value === undefined || (typeof value === 'string' && !value.trim()) ? e.definition.defaults[key].value : value;
            const malformed = typeof expected !== 'number' && typeof expected !== 'string';
            assert.equal(e.$('#node-input-' + key).val(), malformed ? JSON.stringify(expected) : String(expected));
        }
        e.definition.oneditcancel.call(e.saved);
        assert.equal(JSON.stringify(e.saved), before);
    }
});

test('number-input coercion cannot turn malformed saved Dynamic bounds into valid defaults on Done', () => {
    for (const key of ['dynamicMinKelvin', 'dynamicMaxKelvin']) {
        for (const value of [null, false, true, 'invalid', [], [2000], {}]) {
            const e = editor({ [key]: value }), input = e.$('#node-input-' + key);
            assert.equal(input.attr('type'), 'text');
            assert.notEqual(input.val(), '');
            assert.equal(e.definition.defaults[key].validate.call(e.saved, input.val()), false);
            e.definition.oneditsave.call(e.saved);
            const serialized = { ...e.saved, dynamicMinKelvin: e.$('#node-input-dynamicMinKelvin').val(), dynamicMaxKelvin: e.$('#node-input-dynamicMaxKelvin').val() };
            // Closed-dialog validation must also reject the value Node-RED reads on Done.
            const closed = savedValidation();
            assert.equal(closed.defaults[key].validate.call(serialized, serialized[key]), false);
            assert.throws(() => require('../lib/light').config({ ...serialized, entityId: 'light.one' }), /dynamic/);
            input.val(key === 'dynamicMinKelvin' ? '2000' : '5500');
            assert.equal(e.definition.defaults[key].validate.call(e.saved, input.val()), true);
        }
    }
});

test('opening numeric strings preserves effective bounds even when number inputs reject their spelling', () => {
    for (const bounds of [
        { dynamicMinKelvin: '0xFA0', dynamicMaxKelvin: ' 4500 ' },
        { dynamicMinKelvin: ' 6000 ', dynamicMaxKelvin: '5500' }
    ]) {
        const e = editor(bounds), before = JSON.stringify(e.saved);
        for (const key of ['dynamicMinKelvin', 'dynamicMaxKelvin']) {
            assert.equal(e.$('#node-input-' + key).val(), String(Number(bounds[key])));
        }
        e.definition.oneditsave.call(e.saved);
        const serialized = { ...e.saved, dynamicMinKelvin: e.$('#node-input-dynamicMinKelvin').val(), dynamicMaxKelvin: e.$('#node-input-dynamicMaxKelvin').val() };
        const closed = savedValidation();
        const valid = Number(bounds.dynamicMinKelvin) <= Number(bounds.dynamicMaxKelvin);
        for (const key of ['dynamicMinKelvin', 'dynamicMaxKelvin']) assert.equal(closed.defaults[key].validate.call(serialized, serialized[key]), valid);
        if (valid) {
            const config = require('../lib/light').config({ ...serialized, entityId: 'light.one' });
            assert.equal(config.dynamicMinKelvin, 4000); assert.equal(config.dynamicMaxKelvin, 4500);
        } else assert.throws(() => require('../lib/light').config({ ...serialized, entityId: 'light.one' }), /Warmest Kelvin/);
        assert.equal(JSON.stringify(e.saved), before);
    }
});

test('incomplete numeric input remains invalid through Done while truly empty Dynamic fields use defaults', () => {
    for (const key of ['dynamicMinKelvin', 'dynamicMaxKelvin']) {
        const e = editor(), input = e.$('#node-input-' + key);
        assert.equal(input.attr('type'), 'text');
        assert.equal(input.attr('inputmode'), 'numeric');
        for (const token of ['-', '3e', '+', '.', '3e+', 'NaN', 'Infinity']) {
            input.val(token);
            assert.equal(input.val(), token);
            assert.equal(e.definition.defaults[key].validate.call(e.saved, input.val()), false);
            e.definition.oneditsave.call(e.saved);
            const serialized = { ...e.saved, [key]: input.val() };
            assert.equal(savedValidation().defaults[key].validate.call(serialized, serialized[key]), false);
            assert.throws(() => require('../lib/light').config({ ...serialized, entityId: 'light.one' }), /dynamic/);
        }
        input.val('');
        assert.equal(e.definition.defaults[key].validate.call(e.saved, ''), true);
    }
});

test('Dynamic validation uses default for a blank peer but rejects an inverted effective range', () => {
    const e = editor({ dynamicMinKelvin: '', dynamicMaxKelvin: '4500' });
    const min = e.definition.defaults.dynamicMinKelvin.validate, max = e.definition.defaults.dynamicMaxKelvin.validate;
    e.$('#node-input-dynamicMinKelvin').val('');
    assert.equal(min.call(e.saved, ''), true); assert.equal(max.call(e.saved, '4500'), true);
    e.$('#node-input-dynamicMaxKelvin').val('1500');
    assert.equal(min.call(e.saved, ''), false); assert.equal(max.call(e.saved, '1500'), false);
    e.$('#node-input-dynamicMinKelvin').val('6000'); e.$('#node-input-dynamicMaxKelvin').val('');
    assert.equal(min.call(e.saved, '6000'), false); assert.equal(max.call(e.saved, ''), false);
    e.definition.oneditcancel.call(e.saved);
});
test('Label autocomplete displays names and serializes stable ID; Entity fields and old defaults remain', () => {
    const e = editor(); const label = e.$('#node-input-labelId');
    assert.equal(e.$('.sw-label-target').visible, true); assert.equal(e.$('.sw-entity-target').visible, false);
    const request = e.requests.find(r => r.url === 'sw-light/labels/server'); assert.ok(request);
    request.success([{ label_id: 'cozy_id', name: 'Mysbelysning' }]);
    assert.equal(e.$('#sw-label-name').textValue, 'Mysbelysning');
    let matches; label.options.source({ term: 'mys' }, values => { matches = values; });
    assert.equal(matches[0].label, 'Mysbelysning (cozy_id)'); assert.equal(matches[0].value, 'cozy_id');
    label.options.select({}, { item: matches[0] });
    assert.equal(label.val(), 'cozy_id');
    assert.equal(e.definition.defaults.entityId.validate.call(e.saved, ''), true);
    assert.equal(e.definition.defaults.labelId.validate.call(e.saved, ''), false);
    // Node-RED saves default fields from their matching inputs, never the helper display text.
    const serialized = Object.fromEntries(Object.keys(e.definition.defaults).map(key => [key, e.$('#node-input-' + key).val()]));
    assert.equal(serialized.targetType, 'label'); assert.equal(serialized.labelId, 'cozy_id');
    e.definition.oneditsave.call(e.saved); assert.equal(label.destroyed, true); assert.ok(e.requests.every(r => r.aborted));
    assert.equal(e.definition.defaults.targetType.value, 'entity');
    e.$('#node-input-targetType').val('entity');
    assert.equal(e.definition.defaults.entityId.validate.call({}, 'light.old'), true);
    assert.equal(e.definition.defaults.entityId.validate.call({}, ''), false);
});
test('editor ignores obsolete responses and cleans Label autocomplete on cancel', () => {
    const e = editor(), old = e.requests.find(r => r.url.startsWith('sw-light/labels'));
    e.$('#node-input-server').val('other'); e.$('#node-input-server').events['change.swLight']();
    old.success([{ label_id: 'cozy_id', name: 'Obsolete name' }]);
    assert.notEqual(e.$('#sw-label-name').textValue, 'Obsolete name');
    e.definition.oneditcancel.call(e.saved); assert.equal(e.$('#node-input-labelId').destroyed, true);
});
test('Label editor endpoint uses server.read permission, shared adapter and cleans its handle', async () => {
    let route, permission, closed = 0;
    const RED = { nodes: { registerType() {} }, auth: { needsPermission: value => { permission = value; return 'permission middleware'; } },
        httpAdmin: { get: (path, middleware, callback) => { if (path.includes('/labels/')) route = { path, middleware, callback }; } } };
    require('../nodes/sw-light')(RED, (_RED, id) => { assert.equal(id, 'selected'); return { resolve: async () => {}, labels: async () => [{ label_id: 'stable', name: 'Name' }], close: async () => { closed++; } }; });
    assert.equal(permission, 'server.read'); assert.equal(route.path, '/sw-light/labels/:serverId');
    let response;
    await route.callback({ params: { serverId: 'selected' } }, { json: value => { response = value; } });
    assert.equal(response[0].label_id, 'stable'); assert.equal(closed, 1);
});


test('validation follows unsaved target selector changes in the editor', () => {
    const e = editor(); const old = { targetType: 'entity', entityId: 'light.old' };
    assert.equal(e.definition.defaults.entityId.validate.call(old, ''), true);
    assert.equal(e.definition.defaults.labelId.validate.call(old, ''), false);
    e.$('#node-input-targetType').val('entity');
    assert.equal(e.definition.defaults.entityId.validate.call(e.saved, ''), false);
    assert.equal(e.definition.defaults.labelId.validate.call(e.saved, ''), true);
    e.definition.oneditcancel.call(e.saved);
});

test('Dynamic editor exposes range, hides legacy controls and preserves default Keep current', () => {
    const e = editor(); assert.equal(e.definition.defaults.colorMode.value, 'keep');
    e.$('#node-input-colorMode').val('dynamic'); e.$('#node-input-adaptiveEnabled').prop('checked', true);
    e.$('#node-input-targetType, #node-input-labelId, #node-input-colorMode, #node-input-adaptiveEnabled, #node-input-manualOverride, #node-input-overrideStrategy, #node-input-entityId').events['change.swLight']();
    assert.equal(e.$('.sw-color-dynamic').visible, true);
    assert.equal(e.$('.sw-legacy-adaptive').visible, false); assert.equal(e.$('.sw-adaptive-row').visible, false);
    assert.equal(e.$('#node-input-adaptiveEnabled').prop('checked'), true); // saved compatibility flag preserved
    const validate = e.definition.defaults.dynamicMinKelvin.validate;
    assert.equal(validate.call(e.saved, 2000), true); assert.equal(validate.call(e.saved, 2000.5), false);
    e.$('#node-input-dynamicMinKelvin').val(6000); assert.equal(validate.call(e.saved, 6000), false);
    e.definition.oneditcancel.call(e.saved);
});


test('Area editor and saved multiple-entity validation retain stable IDs and cancel stale responses', () => {
    const e = editor(); e.$('#node-input-targetType').val('area');
    const area = e.$('#node-input-areaId'); area.val('room');
    const request = e.requests.find(r => r.url === 'sw-light/areas/server');
    request.success([{ area_id: 'room', name: 'Vardagsrum' }]);
    assert.equal(e.$('.sw-area-target').visible, true);
    assert.equal(e.$('#sw-area-name').textValue, 'Vardagsrum');
    let matches; area.options.source({ term: 'vardag' }, values => { matches = values; });
    assert.equal(matches[0].value, 'room'); area.options.select({}, { item: matches[0] });
    assert.equal(area.val(), 'room'); assert.equal(e.definition.defaults.areaId.validate.call({}, ''), false);
    e.$('#node-input-targetType').val('entities');
    for (const v of [undefined, [], 'light.one', ['switch.bad']]) assert.equal(e.definition.defaults.entityIds.validate.call({}, v), false);
    assert.equal(e.definition.defaults.entityIds.validate.call({}, ['light.one', 'light.two']), true);
    assert.equal(e.definition.defaults.entityId.validate.call({}, ''), true);
    e.definition.oneditcancel.call(e.saved);
    assert.equal(area.destroyed, true); assert.equal(request.aborted, true);
    request.success([{ area_id: 'room', name: 'Stale' }]); assert.notEqual(e.$('#sw-area-name').textValue, 'Stale');
});
test('Area editor endpoint requires server.read, closes shared handle on success and failure', async () => {
    let route, closed = 0, fail = false;
    const RED = { nodes: { registerType() {} }, auth: { needsPermission: value => { assert.equal(value, 'server.read'); return 'guard'; } },
        httpAdmin: { get: (path, guard, callback) => { assert.equal(guard, 'guard'); if (path.includes('/areas/')) route = callback; } } };
    require('../nodes/sw-light')(RED, () => ({ resolve: async () => {}, areas: async () => { if (fail) throw Error('Unavailable'); return [{ area_id: 'room' }]; }, close: async () => { closed++; } }));
    let response, code;
    const res = { json: value => { response = value; }, status: value => { code = value; return res; } };
    await route({ params: { serverId: 'server' } }, res); assert.equal(response[0].area_id, 'room'); assert.equal(closed, 1);
    fail = true; await route({ params: { serverId: 'server' } }, res); assert.equal(code, 503); assert.equal(closed, 2);
});


test('Group editor uses friendly names but saves IDs, filters plain lights and rejects stale responses', () => {
    const e = editor(); e.$('#node-input-targetType').val('group');
    const group = e.$('#node-input-groupId'); group.val('light.room');
    const request = e.requests.find(r => r.url === 'homeassistant/states/server'); assert.ok(request);
    request.success({ 'light.room': { entity_id: 'light.room', attributes: { friendly_name: 'Vardagsrum', entity_id: ['light.one'] } },
        'group.old': { entity_id: 'group.old', attributes: { friendly_name: 'Old group', entity_id: ['light.two'] } },
        'light.one': { entity_id: 'light.one', attributes: { friendly_name: 'Plain light' } } });
    assert.equal(e.$('.sw-group-target').visible, true); assert.equal(e.$('#sw-group-name').textValue, 'Vardagsrum');
    let matches; group.options.source({ term: '' }, values => { matches = values; }); assert.equal(matches.length, 2);
    group.options.source({ term: 'vardag' }, values => { matches = values; });
    assert.equal(matches[0].value, 'light.room'); group.options.select({}, { item: matches[0] }); assert.equal(group.val(), 'light.room');
    const validate = e.definition.defaults.groupId.validate;
    for (const id of ['light.room', 'group.old']) assert.equal(validate.call(e.saved, id), true);
    for (const id of ['', 'switch.bad', 'light.bad name']) assert.equal(validate.call(e.saved, id), false);
    e.$('#node-input-server').val('other'); e.$('#node-input-server').events['change.swLight']();
    request.success({ 'light.room': { entity_id: 'light.room', attributes: { friendly_name: 'Obsolete', entity_id: [] } } });
    assert.notEqual(e.$('#sw-group-name').textValue, 'Obsolete');
    e.definition.oneditcancel.call(e.saved); assert.equal(group.destroyed, true); assert.equal(request.aborted, true);
});
