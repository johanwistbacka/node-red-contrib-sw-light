'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadIntegration } = require('../lib/ha-adapter');
const PACKAGE = 'node-red-contrib-home-assistant-websocket';

test('peer contract covers both reviewed HA contrib minors without a direct dependency', () => {
    const metadata = require('../package.json');
    assert.equal(metadata.peerDependencies[PACKAGE], '>=0.80.3 <0.82.0');
    assert.equal(metadata.dependencies?.[PACKAGE], undefined);
    assert.equal(require('../package-lock.json').packages[''].peerDependencies[PACKAGE], metadata.peerDependencies[PACKAGE]);
});

for (const [version, supported] of [
    ['0.80.2', false], ['0.80.3', true], ['0.80.4', true],
    ['0.81.0', true], ['0.81.1', true], ['0.81.0-beta.1', false],
    ['0.82.0', false], ['1.0.0', false]
]) {
    test(`runtime provider version guard: ${version} ${supported ? 'accepted' : 'rejected'}`, t => {
        const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-light-peer-'));
        t.after(() => fs.rmSync(userDir, { recursive: true, force: true }));
        const directory = path.join(userDir, 'node_modules', PACKAGE);
        fs.mkdirSync(path.join(directory, 'dist', 'homeAssistant'), { recursive: true });
        fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: PACKAGE, version }));
        fs.writeFileSync(path.join(directory, 'dist', 'homeAssistant', 'index.js'), 'exports.getHomeAssistant = () => {};');
        const RED = { settings: { userDir } };
        if (supported) assert.equal(typeof loadIntegration(RED).getHomeAssistant, 'function');
        else assert.throws(() => loadIntegration(RED), /Unsupported HA contrib/);
    });
}
