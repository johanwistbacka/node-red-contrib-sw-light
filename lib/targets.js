'use strict';
const { fault } = require('./light');

function target(raw, override) {
    const kind = raw.targetType ?? 'entity';
    const value = override === undefined ? { type: kind, ...(kind === 'entities' ? { ids: raw.entityIds } :
        { id: kind === 'label' ? raw.labelId : kind === 'area' ? raw.areaId : kind === 'group' ? raw.groupId : raw.entityId }) } : override;
    if (!value || typeof value !== 'object' || Array.isArray(value) || !['entity', 'entities', 'label', 'area', 'group'].includes(value.type))
        throw fault('Target requires type entity/entities/label/area/group', 'config_error');
    if (value.type === 'entities') {
        if (!Array.isArray(value.ids) || !value.ids.length || !value.ids.every(id => typeof id === 'string' && /^light\.[a-z0-9_]+$/.test(id)))
            throw fault('Select one or more light entities', 'config_error');
        return { type: 'entities', ids: [...new Set(value.ids)] };
    }
    if (typeof value.id !== 'string' || !value.id.trim()) throw fault('Target requires a stable id', 'config_error');
    if (value.type === 'entity' && !/^light\.[a-z0-9_]+$/.test(value.id)) throw fault('Select a light entity', 'config_error');
    if (value.type === 'group' && !/^(light|group)\.[a-z0-9_]+$/.test(value.id)) throw fault('Select a light or legacy group entity', 'config_error');
    return { type: value.type, id: value.id };
}

// Resolve registry membership before dispatching independent per-light commands.
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
function areaLights(id, { entities, devices, areas }) {
    if (![entities, devices, areas].every(Array.isArray)) throw fault('HA registries unavailable', 'target_resolution_failure');
    if (!areas.some(a => a.area_id === id)) throw fault(`Area ${id} was deleted or does not exist`, 'target_resolution_failure');
    const deviceIds = new Set(devices.filter(d => d.area_id === id).map(d => d.id));
    return [...new Set(entities.filter(e => /^light\.[a-z0-9_]+$/.test(e.entity_id) && !e.hidden_by && !e.disabled_by && !e.entity_category &&
        (e.area_id === id || (!e.area_id && deviceIds.has(e.device_id)))).map(e => e.entity_id))].sort();
}
// Group members are explicit HA state attributes, independent of registry APIs.
function groupMembers(id, states, knownGroups = new Set()) {
    const read = typeof states === 'function' ? states : entityId => states?.[entityId];
    const lights = new Set(), groups = new Set(), visiting = new Set();
    function expand(groupId) {
        if (visiting.has(groupId)) throw fault(`Group cycle at ${groupId}`, 'target_resolution_failure');
        if (groups.has(groupId)) return;
        const members = read(groupId)?.attributes?.entity_id;
        if (!Array.isArray(members) || !members.every(member => typeof member === 'string' && /^[a-z0-9_]+\.[a-z0-9_]+$/.test(member)))
            throw fault(`Group ${groupId} is missing or has invalid membership`, 'target_resolution_failure');
        visiting.add(groupId); groups.add(groupId);
        for (const member of members) {
            if (member.startsWith('group.') || (member.startsWith('light.') && (knownGroups.has(member) || read(member)?.attributes?.entity_id !== undefined))) expand(member);
            else if (member.startsWith('light.')) lights.add(member);
        }
        visiting.delete(groupId);
    }
    expand(id);
    return { ids: [...lights].sort(), groups: [...groups].sort() };
}
async function resolveTarget(adapter, configured) {
    if (configured.type === 'entity') return [configured.id];
    if (configured.type === 'entities') return [...configured.ids];
    if (configured.type === 'group') return groupMembers(configured.id, id => adapter.state(id)).ids;
    const registries = await adapter.registries(configured.type);
    return (configured.type === 'area' ? areaLights : labelLights)(configured.id, registries);
}
function createTargetResolver(adapter) {
    let snapshot;
    const membership = new Map();
    let observedGroups = [], groupRoot;
    let knownGroups = new Set();
    const resolve = async selected => {
        observedGroups = [];
        if (selected.type === 'group') {
            if (groupRoot !== selected.id) { groupRoot = selected.id; knownGroups.clear(); }
            observedGroups = [...knownGroups]; // retain raw group observations if resolution fails
            const result = groupMembers(selected.id, id => adapter.state(id), knownGroups);
            observedGroups = result.groups; knownGroups = new Set(result.groups); return result.ids;
        }
        groupRoot = undefined; knownGroups.clear();
        if (selected.type === 'entity') return [selected.id];
        if (selected.type === 'entities') return [...selected.ids];
        const next = await adapter.registries(selected.type);
        if (next !== snapshot) { membership.clear(); snapshot = next; }
        const key = `${selected.type}:${selected.id}`;
        if (!membership.has(key)) membership.set(key, (selected.type === 'area' ? areaLights : labelLights)(selected.id, snapshot));
        return [...membership.get(key)];
    };
    resolve.groupIds = () => [...observedGroups];
    return resolve;
}
function aggregateStatus(infos, type = 'label') {
    const counts = { on: 0, manual: 0, off: 0, unavailable: 0 };
    for (const info of infos) {
        if (!['on', 'off'].includes(info.state)) counts.unavailable++;
        else if (info.manual_override) counts.manual++;
        else counts[info.state]++;
    }
    return { fill: counts.unavailable ? 'red' : counts.manual ? 'yellow' : counts.on ? 'green' : 'grey',
        shape: counts.unavailable ? 'ring' : 'dot',
        text: infos.length ? Object.entries(counts).filter(([,n]) => n).map(([key,n]) => `${n} ${key}`).join(' · ') : `${type.toUpperCase()} EMPTY` };
}
module.exports = { target, labelLights, areaLights, groupMembers, resolveTarget, createTargetResolver, aggregateStatus };
