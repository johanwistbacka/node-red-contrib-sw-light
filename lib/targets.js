'use strict';
const { fault } = require('./light');

function target(raw, override) {
    const value = override === undefined ? { type: raw.targetType ?? 'entity', id: (raw.targetType ?? 'entity') === 'label' ? raw.labelId : raw.entityId } : override;
    if (!value || typeof value !== 'object' || Array.isArray(value) || !['entity', 'label'].includes(value.type) ||
        typeof value.id !== 'string' || !value.id.trim()) throw fault('Target requires type entity/label and a stable id', 'config_error');
    if (value.type === 'entity' && !/^light\.[a-z0-9_]+$/.test(value.id)) throw fault('Select a light entity', 'config_error');
    return { type: value.type, id: value.id };
}

// HA 2026.9 service target semantics. Area relationships are part of Label
// expansion; Area is deliberately not exposed as a configured target type.
function labelLights(id, { labels, entities, devices, areas }) {
    if (![labels, entities, devices, areas].every(Array.isArray)) throw fault('HA registries unavailable', 'target_resolution_failure');
    if (!labels.some(l => l.label_id === id)) throw fault(`Label ${id} was deleted or does not exist`, 'target_resolution_failure');
    const marked = item => Array.isArray(item.labels) && item.labels.includes(id);
    const deviceIds = new Set(devices.filter(marked).map(d => d.id));
    const areaIds = new Set(areas.filter(marked).map(a => a.area_id));
    const areaDevices = new Set(devices.filter(d => areaIds.has(d.area_id)).map(d => d.id));
    return [...new Set(entities.filter(e => {
        if (!/^light\.[a-z0-9_]+$/.test(e.entity_id) || e.hidden_by || e.disabled_by) return false;
        if (marked(e)) return true;
        if (e.entity_category) return false;
        return deviceIds.has(e.device_id) || areaIds.has(e.area_id) || (!e.area_id && areaDevices.has(e.device_id));
    }).map(e => e.entity_id))].sort();
}
async function resolveTarget(adapter, configured) {
    if (configured.type === 'entity') return [configured.id];
    return labelLights(configured.id, await adapter.registries());
}
function createTargetResolver(adapter) {
    let snapshot;
    const membership = new Map();
    return async selected => {
        if (selected.type === 'entity') return [selected.id];
        const next = await adapter.registries();
        if (next !== snapshot) { membership.clear(); snapshot = next; }
        if (!membership.has(selected.id)) membership.set(selected.id, labelLights(selected.id, snapshot));
        return [...membership.get(selected.id)];
    };
}
function aggregateStatus(infos) {
    const counts = { on: 0, manual: 0, off: 0, unavailable: 0 };
    for (const info of infos) {
        if (!['on', 'off'].includes(info.state)) counts.unavailable++;
        else if (info.manual_override) counts.manual++;
        else counts[info.state]++;
    }
    return { fill: counts.unavailable ? 'red' : counts.manual ? 'yellow' : counts.on ? 'green' : 'grey',
        shape: counts.unavailable ? 'ring' : 'dot',
        text: infos.length ? Object.entries(counts).filter(([,n]) => n).map(([key,n]) => `${n} ${key}`).join(' · ') : 'LABEL EMPTY' };
}
module.exports = { target, labelLights, resolveTarget, createTargetResolver, aggregateStatus };
