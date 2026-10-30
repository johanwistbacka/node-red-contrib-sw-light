'use strict';

const DEFAULTS = Object.freeze({
    action: 'msg',
    brightnessPct: 94, autoMaxPct: 94, minPct: 1, transitionOn: 1,
    transitionOff: 1, manualOverride: true, overrideThreshold: 98,
    overrideStrategy: 'threshold', adaptiveEnabled: false, colorMode: 'keep', kelvin: 2700,
    mired: 370, fixedColor: '#ffffff', adaptiveEntity: '', dynamicMinKelvin: 2000, dynamicMaxKelvin: 5500
});
const COLOR_KEYS = ['color_temp_kelvin', 'color_temp', 'rgbww_color', 'rgbw_color',
    'rgb_color', 'hs_color', 'xy_color', 'color_name'];
const BRIGHTNESS_KEYS = ['brightness_pct', 'brightness', 'brightness_step_pct', 'brightness_step'];
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

function fault(message, type = 'error') {
    const error = new Error(message);
    error.eventType = type;
    return error;
}
function number(value, name, min, max, integer = false) {
    if ((typeof value !== 'number' && typeof value !== 'string') ||
        (typeof value === 'string' && !value.trim())) throw fault(`${name} must be numeric`);
    const n = Number(value);
    if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) {
        throw fault(`${name} must be ${integer ? 'an integer ' : ''}between ${min} and ${max}`);
    }
    return n;
}
function boolean(value, name) {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    throw fault(`${name} must be boolean`);
}
function config(raw) {
    const c = { ...DEFAULTS, ...raw };
    if (own(raw, 'adaptiveApply')) boolean(raw.adaptiveApply, 'adaptiveApply');
    // Preserve opt-in from legacy flows; inactive legacy adaptive mode stays off.
    c.adaptiveEnabled = own(raw, 'adaptiveEnabled') ? boolean(raw.adaptiveEnabled, 'adaptiveEnabled') :
        raw.colorMode === 'adaptive' && boolean(raw.adaptiveApply ?? false, 'adaptiveApply');
    if (c.colorMode === 'adaptive') c.colorMode = 'keep';
    if (!['on', 'off', 'toggle', 'msg'].includes(c.action)) throw fault('Invalid configured action');
    for (const key of ['brightnessPct', 'autoMaxPct', 'minPct', 'overrideThreshold']) {
        c[key] = number(c[key], key, key === 'minPct' || key === 'overrideThreshold' ? 1 : 0, 100);
    }
    if (c.minPct > c.autoMaxPct || c.brightnessPct < c.minPct || c.brightnessPct > c.autoMaxPct) {
        throw fault('Require minPct <= brightnessPct <= autoMaxPct');
    }
    for (const key of ['transitionOn', 'transitionOff']) c[key] = number(c[key], key, 0, 3600);
    c.manualOverride = boolean(c.manualOverride, 'manualOverride');
    if (c.manualOverride && c.overrideStrategy === 'threshold' && c.autoMaxPct >= c.overrideThreshold) {
        throw fault('Automatic maximum must be below the manual override threshold');
    }
    if (!['threshold', 'explicit'].includes(c.overrideStrategy)) throw fault('Invalid override strategy');
    if (!['adaptive', 'keep', 'dynamic', 'kelvin', 'mired', 'default', 'color'].includes(c.colorMode)) throw fault('Invalid color mode');
    for (const key of ['dynamicMinKelvin', 'dynamicMaxKelvin']) {
        // Older editor saves can contain blank optional bounds, even outside Dynamic.
        if (c[key] === undefined || (typeof c[key] === 'string' && !c[key].trim())) c[key] = DEFAULTS[key];
        c[key] = number(c[key], key, 1000, 40000, true);
    }
    if (c.dynamicMinKelvin > c.dynamicMaxKelvin) throw fault('Warmest Kelvin must not exceed coolest Kelvin');
    c.kelvin = number(c.kelvin, 'kelvin', 1000, 40000, true);
    c.mired = number(c.mired, 'mired', 25, 1000);
    if (!/^#[0-9a-f]{6}$/i.test(c.fixedColor)) throw fault('Fixed color must be #rrggbb');
    if (c.adaptiveEntity && !/^switch\.[a-z0-9_]+$/.test(c.adaptiveEntity)) throw fault('Adaptive entity must be a switch entity');
    if ((c.targetType ?? 'entity') === 'entity' && !/^light\.[a-z0-9_]+$/.test(c.entityId || '')) throw fault('Select a light entity');
    const configured = require('./targets').target(c);
    c.targetType = configured.type;
    if (configured.type === 'label') c.labelId = configured.id;
    if (configured.type === 'area') c.areaId = configured.id;
    if (configured.type === 'group') c.groupId = configured.id;
    if (configured.type === 'entities') c.entityIds = configured.ids;
    return c;
}
function pct(brightness) { return brightness * 100 / 255; }
function byte(percent) { return Math.round(percent * 255 / 100); }
function capabilities(state) {
    const a = state?.attributes || {};
    const modes = Array.isArray(a.supported_color_modes) ? a.supported_color_modes : [];
    return { modes, brightness: modes.some(m => ['brightness','color_temp','hs','xy','rgb','rgbw','rgbww','white'].includes(m)),
        transition: Boolean((Number(a.supported_features) || 0) & 32) };
}
function vector(value, key, limits) {
    if (!Array.isArray(value) || value.length !== limits.length) throw fault(`${key} requires ${limits.length} values`);
    return value.map((n, i) => number(n, `${key}[${i}]`, 0, limits[i], limits[i] === 255));
}
function rgbToHs(rgb) {
    const [r, g, b] = rgb.map(v => v / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d) h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, max ? d / max * 100 : 0];
}
function hsToRgb([h, s]) {
    s /= 100;
    const f = n => { const k = (n + h / 60) % 6; return Math.round(255 * (1 - s * Math.max(0, Math.min(k, 4 - k, 1)))); };
    return [f(5), f(3), f(1)];
}
function rgbToXy(rgb) {
    const [r, g, b] = rgb.map(v => { v /= 255; return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92; });
    const x = r * 0.664511 + g * 0.154324 + b * 0.162028;
    const y = r * 0.283881 + g * 0.668433 + b * 0.047685;
    const z = r * 0.000088 + g * 0.072310 + b * 0.986039;
    return x + y + z ? [x / (x + y + z), y / (x + y + z)] : [0, 0];
}
function normalizeColor(key, value) {
    if (key === 'color_temp_kelvin') return { kind: 'kelvin', value: number(value, key, 1000, 40000, true) };
    if (key === 'color_temp') return { kind: 'kelvin', value: Math.round(1000000 / number(value, key, 25, 1000)) };
    const lengths = { rgb_color: [255,255,255], rgbw_color: [255,255,255,255], rgbww_color: [255,255,255,255,255], hs_color: [360,100], xy_color: [1,1] };
    if (lengths[key]) return { kind: key, value: vector(value, key, lengths[key]) };
    if (typeof value !== 'string' || !/^[a-zA-Z][a-zA-Z ]{0,39}$/.test(value)) throw fault('Invalid color_name');
    return { kind: key, value };
}
function colorPayload(color, state) {
    const modes = capabilities(state).modes;
    const { kind, value } = color;
    if (kind === 'kelvin') {
        return dynamicPayload(value, state);
    }
    if (kind === 'color_name') return modes.some(m => ['hs','xy','rgb','rgbw','rgbww'].includes(m)) ? { color_name: value } : null;
    if (modes.includes(kind.replace('_color', ''))) return { [kind]: value };
    // Preserve white channels: never silently discard RGBW/RGBWW channels.
    if (!['rgb_color', 'hs_color'].includes(kind)) return null;
    const rgb = kind === 'rgb_color' ? value : hsToRgb(value);
    if (modes.includes('rgb')) return { rgb_color: rgb };
    if (modes.includes('hs')) return { hs_color: rgbToHs(rgb) };
    if (modes.includes('xy')) return { xy_color: rgbToXy(rgb) };
    if (modes.includes('rgbw')) return { rgbw_color: [...rgb, 0] };
    if (modes.includes('rgbww')) return { rgbww_color: [...rgb, 0, 0] };
    return null;
}
function dynamicPayload(kelvin, state) {
    if (!capabilities(state).modes.includes('color_temp')) return null;
    const a = state.attributes || {};
    const min = a.min_color_temp_kelvin ?? (a.max_mireds ? Math.ceil(1000000 / a.max_mireds) : 1000);
    const max = a.max_color_temp_kelvin ?? (a.min_mireds ? Math.floor(1000000 / a.min_mireds) : 40000);
    if (![min, max].every(n => typeof n === 'number' && Number.isFinite(n) && n > 0) || Math.ceil(min) > Math.floor(max)) {
        throw fault('Invalid lamp color-temperature range', 'warning');
    }
    return { color_temp_kelvin: Math.max(Math.ceil(min), Math.min(Math.floor(max), kelvin)) };
}
class Override {
    constructor(c) { this.c = c; this.threshold = false; this.explicit = false; }
    get active() { return this.c.manualOverride && (this.threshold || this.explicit); }
    observe(state) {
        if (!this.c.manualOverride) return;
        if (state?.state === 'off') { this.threshold = false; this.explicit = false; }
        else if (state?.state === 'on' && this.c.overrideStrategy === 'threshold' && Number.isFinite(state.attributes?.brightness)) {
            // Compare bytes to avoid treating 254/255 as 100%.
            this.threshold = state.attributes.brightness >= byte(this.c.overrideThreshold);
        }
    }
    set(value) { this.explicit = boolean(value, 'manual_override'); if (!this.explicit) this.threshold = false; }
}
function resolveAction(c, msg) {
    const action = c.action === 'msg' ? (own(msg, 'action') ? msg.action : msg.auto_light?.action) : c.action;
    if (!['on', 'off', 'toggle'].includes(action)) throw fault('Action must be on, off or toggle; From msg requires msg.action (or msg.auto_light.action)');
    return action;
}
function plan(c, msg, state, overrideActive) {
    const action = resolveAction(c, msg);
    const source = msg.source ?? 'automatic';
    const adaptiveEnabled = own(msg, 'adaptive_lighting') ? boolean(msg.adaptive_lighting, 'adaptive_lighting') : c.adaptiveEnabled;
    if (!['automatic', 'manual'].includes(source)) throw fault('msg.source must be automatic or manual');
    const turningOn = action === 'on' || (action === 'toggle' && state.state === 'off');
    const cap = capabilities(state), data = {}, unsupported = [];
    const bKeys = BRIGHTNESS_KEYS.filter(k => own(msg, k));
    // Validate even lower-precedence properties, so bad input never disappears silently.
    const validated = {};
    for (const key of bKeys) validated[key] = number(msg[key], key, key.includes('step') ? (key.endsWith('pct') ? -100 : -255) : 0, key.endsWith('pct') ? 100 : 255, !key.endsWith('pct'));
    const colors = COLOR_KEYS.filter(k => own(msg, k)).map(k => [k, normalizeColor(k, msg[k])]);
    const transition = own(msg, 'transition') ? number(msg.transition, 'transition', 0, 3600) : turningOn ? c.transitionOn : c.transitionOff;
    if (cap.transition) data.transition = transition;
    else if (own(msg, 'transition')) unsupported.push('transition');
    let zero = false;
    if (turningOn) {
        let level = c.brightnessPct;
        if (bKeys.length) {
            const key = bKeys[0], value = validated[key];
            if (key.includes('step')) {
                const current = state.state === 'off' ? 0 : state.attributes?.brightness;
                if (!Number.isFinite(current)) throw fault('Brightness steps require a known brightness');
                level = pct(current) + (key.endsWith('pct') ? value : pct(value));
                level = Math.max(0, Math.min(100, level));
            } else level = key.endsWith('pct') ? value : pct(value);
        }
        zero = level === 0 && cap.brightness;
        if (cap.brightness && !zero) {
            level = Math.max(c.minPct, Math.min(source === 'automatic' ? c.autoMaxPct : 100, level));
            data.brightness = Math.min(byte(level), source === 'automatic' ? Math.floor(c.autoMaxPct * 255 / 100) : 255);
        } else if (bKeys.length && !cap.brightness) unsupported.push(...bKeys);
        let color = colors[0]?.[1];
        if (!color && c.colorMode === 'kelvin') color = normalizeColor('color_temp_kelvin', c.kelvin);
        if (!color && c.colorMode === 'mired') color = normalizeColor('color_temp', c.mired);
        if (!color && c.colorMode === 'color') color = normalizeColor('rgb_color', c.fixedColor.match(/[0-9a-f]{2}/gi).map(v => parseInt(v, 16)));
        if (color && !zero) {
            const payload = colorPayload(color, state);
            if (payload) Object.assign(data, payload);
            else unsupported.push(colors[0]?.[0] || c.colorMode);
        }
    } else unsupported.push(...bKeys, ...colors.map(([key]) => key));
    if (zero) {
        for (const key of Object.keys(data)) if (key !== 'transition') delete data[key];
        if (!own(msg, 'transition') && cap.transition) data.transition = c.transitionOff;
    }
    return { action, source, adaptiveEnabled: c.colorMode === 'dynamic' ? false : adaptiveEnabled, service: turningOn && !zero ? 'turn_on' : 'turn_off',
        turningOn: turningOn && !zero, offToOn: turningOn && !zero && state.state === 'off',
        supportsTemperature: cap.modes.includes('color_temp'), data, unsupported,
        blocked: source === 'automatic' && overrideActive,
        explicitBrightness: bKeys.length > 0,
        explicitColor: colors.length > 0,
        ignoredConflicts: [...bKeys.slice(1), ...colors.slice(1).map(([key]) => key)] };
}
function normalized(state, override, adaptive, action) {
    const a = state?.attributes || {};
    return { entity_id: state?.entity_id, state: state?.state ?? 'missing',
        brightness: a.brightness ?? null, brightness_pct: Number.isFinite(a.brightness) ? Math.round(pct(a.brightness) * 10) / 10 : null,
        color_mode: a.color_mode ?? null, color_temp_kelvin: a.color_temp_kelvin ?? (a.color_temp ? Math.round(1000000 / a.color_temp) : null),
        color_temp: a.color_temp ?? null,
        color: Object.fromEntries(['rgb_color','rgbw_color','rgbww_color','hs_color','xy_color'].filter(k => Array.isArray(a[k])).map(k => [k, [...a[k]]])),
        manual_override: override, adaptive_lighting: adaptive, action,
        observed_at: state?.last_updated ?? null };
}
module.exports = { DEFAULTS, COLOR_KEYS, BRIGHTNESS_KEYS, config, number, fault, pct, byte, capabilities, resolveAction,
    normalizeColor, colorPayload, dynamicPayload, Override, plan, normalized };
