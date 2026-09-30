'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const html = fs.readFileSync(require.resolve('../nodes/sw-light.html'), 'utf8');
const script = html.match(/<script type="text\/javascript">([\s\S]*?)<\/script>/)[1];
function editor() {
    let definition;
    const fields = new Map(), requests = [];
    function $(selector) {
        if (!fields.has(selector)) fields.set(selector, { value: '', checked: false, textValue: '', visible: true, events: {}, length: 1,
            val(value) { if (value === undefined) return this.value; this.value = value; return this; },
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
    for (const [key, value] of Object.entries(saved)) { $('#node-input-' + key).val(value); if (typeof value === 'boolean') $('#node-input-' + key).prop('checked', value); }
    definition.oneditprepare.call(saved);
    return { definition, saved, $, requests };
}
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
        httpAdmin: { get: (path, middleware, callback) => { route = { path, middleware, callback }; } } };
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
