'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
for (const directory of ['lib', 'nodes', 'test', 'scripts']) {
    for (const file of fs.readdirSync(directory).filter(f => f.endsWith('.js'))) {
        execFileSync(process.execPath, ['--check', path.join(directory, file)]);
    }
}
const html = fs.readFileSync('nodes/sw-light.html', 'utf8');
const script = html.match(/<script type="text\/javascript">([\s\S]*?)<\/script>/)[1];
new vm.Script(script, { filename: 'sw-light editor' });
const editorInputs = [...html.matchAll(/id="node-input-([^"]+)"/g)].map(m => m[1]);
let definition;
vm.runInNewContext(script, { RED: { nodes: { registerType: (_type, def) => definition = def } } });
for (const key of Object.keys(definition.defaults)) {
    if (!editorInputs.includes(key)) throw new Error(`Missing editor field: ${key}`);
}
for (const file of fs.readdirSync('examples').filter(f => f.endsWith('.json'))) {
    const flow = JSON.parse(fs.readFileSync(path.join('examples', file), 'utf8'));
    if (!Array.isArray(flow)) throw new Error(`${file}: not a Node-RED flow`);
}
console.log('JavaScript syntax, editor field parity, example JSON: passed');
