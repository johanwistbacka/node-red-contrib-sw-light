'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');
const { repair, check, apply, restore, ORIGINAL_SHA256 } = require('../scripts/patch-ha-registry-reconnect');

function fixture(t) {
    const req = createRequire(path.join(process.env.SW_LIGHT_HA_USER_DIR, 'package.json'));
    const manifest = req.resolve('node-red-contrib-home-assistant-websocket/package.json');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-ha-registry-test-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const provider = path.join(directory, 'node_modules/node-red-contrib-home-assistant-websocket');
    fs.mkdirSync(path.join(provider, 'dist/homeAssistant'), { recursive: true });
    fs.copyFileSync(manifest, path.join(provider, 'package.json'));
    const file = path.join(provider, 'dist/homeAssistant/collections.js');
    fs.copyFileSync(path.join(path.dirname(manifest), 'dist/homeAssistant/collections.js'), file);
    // Resolve real provider dependencies while keeping the repaired file disposable.
    fs.symlinkSync(path.dirname(path.dirname(manifest)), path.join(provider, 'node_modules'), 'dir');
    fs.writeFileSync(path.join(directory, 'package.json'), '{}');
    return { directory, file, backup: path.join(directory, 'backup'), peerDir: process.env.SW_LIGHT_HA_USER_DIR };
}

const optional = { skip: !process.env.SW_LIGHT_HA_USER_DIR };

test('HA repair is byte-guarded, backed up, idempotent and reversibly scoped to its file', optional, t => {
    const f = fixture(t), original = fs.readFileSync(f.file, 'utf8');
    assert.equal(require('node:crypto').createHash('sha256').update(original).digest('hex'), ORIGINAL_SHA256);
    assert.equal(check(f.directory).status, 'repair-required');
    assert.equal(fs.readFileSync(f.file, 'utf8'), original);
    assert.equal(fs.existsSync(f.backup), false);
    assert.equal(apply(f.directory, f.backup).changed, true);
    assert.equal(check(f.directory).status, 'applied');
    assert.equal(fs.readFileSync(f.file, 'utf8'), repair(original));
    assert.equal(fs.readFileSync(path.join(f.backup, 'collections.js'), 'utf8'), original);
    assert.equal(apply(f.directory, f.backup).changed, false);
    fs.appendFileSync(f.file, '\n// unrelated provider edit');
    assert.throws(() => restore(f.directory, f.backup), /refusing to overwrite/);
    fs.writeFileSync(f.file, repair(original));
    assert.equal(restore(f.directory, f.backup).changed, true);
    assert.equal(check(f.directory).status, 'repair-required');
    assert.equal(fs.readFileSync(f.file, 'utf8'), original);
    assert.equal(restore(f.directory, f.backup).changed, false);
    fs.appendFileSync(f.file, '\n// different artifact');
    assert.throws(() => apply(f.directory, path.join(f.directory, 'new-backup')), /Unrecognized/);
    assert.equal(fs.existsSync(path.join(f.directory, 'new-backup')), false);
    assert.throws(() => check(f.directory), /Unrecognized/);
});

test('public HA registry CLI reports status and fails closed on an unverified provider', optional, t => {
    const f = fixture(t), cli = path.resolve(__dirname, '../scripts/patch-ha-registry-reconnect.js');
    const command = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 5000 });
    assert.equal(command('--help').status, 0);
    assert.equal(command('check', f.directory, f.backup).status, 1);
    assert.equal(JSON.parse(command('check', f.directory).stdout).status, 'repair-required');
    assert.equal(command('apply', f.directory, f.backup).status, 0);
    assert.equal(JSON.parse(command('check', f.directory).stdout).status, 'applied');
    assert.equal(command('restore', f.directory, f.backup).status, 0);
    const manifest = path.join(f.directory, 'node_modules/node-red-contrib-home-assistant-websocket/package.json');
    const metadata = JSON.parse(fs.readFileSync(manifest)); metadata.version = '0.82.0';
    fs.writeFileSync(manifest, JSON.stringify(metadata));
    const unknown = command('apply', f.directory, path.join(f.directory, 'unverified-backup'));
    assert.equal(unknown.status, 1); assert.match(unknown.stderr, /Unverified HA provider/);
    assert.equal(fs.existsSync(path.join(f.directory, 'unverified-backup')), false);
});

// Run the actual published HA collections and WebSocket Connection in a child.
// Strict rejection handling makes the original defect terminate that process.
const scenario = String.raw`
const assert = require('node:assert/strict');
const {createRequire} = require('node:module');
const path = require('node:path');
const req = createRequire(path.join(process.argv[1], 'package.json'));
const peer = createRequire(path.join(process.argv[2], 'package.json'));
const {Connection} = peer('home-assistant-js-websocket');
const collections = req('node-red-contrib-home-assistant-websocket/dist/homeAssistant/collections.js');
class Socket {
    constructor(epoch) { this.haVersion='2026.10.0'; this.OPEN=1; this.readyState=1;
        this.events={}; this.sent=[]; this.hold=false; this.epoch=epoch; }
    addEventListener(e,f) { (this.events[e]??=[]).push(f); }
    removeEventListener(e,f) { this.events[e]=(this.events[e]||[]).filter(x=>x!==f); }
    emit(e,d) { for(const f of this.events[e]||[]) f(d); }
    send(s) {
        const m=JSON.parse(s); this.sent.push(m);
        if(this.hold && m.type.endsWith('/list')) return;
        queueMicrotask(()=>this.reply(m.id, true, m.type.endsWith('/list') ? [{epoch:this.epoch}] : null));
    }
    reply(id,success,result) { this.emit('message', {data:JSON.stringify({type:'result',id,success,
        ...(success?{result}:{error:{code:'test_error',message:'private-error-not-for-log'}})})}); }
}
(async()=>{
    const registry=process.argv[3], mode=process.argv[4], socket=new Socket('initial');
    const conn=new Connection(socket, {}), observed=[];
    collections['subscribe'+registry+'Registry'](conn, value=>observed.push(value));
    await new Promise(setImmediate);
    assert.ok(observed.some(x=>x[0]?.epoch==='initial'));
    socket.hold=true;
    const sub=socket.sent.find(x=>x.type==='subscribe_events');
    socket.emit('message',{data:JSON.stringify({type:'event',id:sub.id,event:{event_type:sub.event_type}})});
    const pending=socket.sent.at(-1);
    if(mode==='connected-error') socket.reply(pending.id,false);
    else { conn.closeRequested=true; socket.readyState=3; socket.emit('close'); }
    await new Promise(setImmediate);
    assert.equal(observed.at(-1)[0].epoch, 'initial');
    if(mode==='disconnect') {
        // The earlier flag only suppressed the automatic reconnect timer.
        // A real reconnect uses an open connection, not a user-requested close.
        conn.closeRequested=false;
        const next=new Socket('reconnected'); conn._setSocket(next);
        await new Promise(setImmediate);
        assert.ok(observed.some(x=>x[0]?.epoch==='reconnected'));
        // The restored event subscription must also process a later update.
        next.epoch='updated'; const nextSub=next.sent.find(x=>x.type==='subscribe_events');
        next.emit('message',{data:JSON.stringify({type:'event',id:nextSub.id,event:{event_type:nextSub.event_type}})});
        await new Promise(resolve=>setTimeout(resolve,550));
        assert.ok(observed.some(x=>x[0]?.epoch==='updated'));
    }
    console.log('PASSED '+registry+' '+mode);
})();
`;

function run(f, registry, mode) {
    return spawnSync(process.execPath, ['--unhandled-rejections=strict', '-e', scenario,
        f.directory, f.peerDir, registry, mode], { encoding: 'utf8', timeout: 5000 });
}

test('published registry refresh crashes before repair and recovers after repair for all five registries', optional, t => {
    const f = fixture(t);
    const registries = ['Area', 'Device', 'Entity', 'Floor', 'Label'];
    for (const name of registries) {
        const result = run(f, name, 'disconnect');
        assert.equal(result.status, 1, name + ' must reproduce the original crash');
        assert.match(result.stderr, /UnhandledPromiseRejection/);
    }
    apply(f.directory, f.backup);
    for (const name of registries) {
        const result = run(f, name, 'disconnect');
        assert.equal(result.status, 0, name + ': ' + result.stderr);
        assert.match(result.stdout, /PASSED/);
        assert.equal(result.stderr, '');
    }
});

test('connected registry errors retain existing data and emit a sanitized warning after repair', optional, t => {
    const f = fixture(t);
    apply(f.directory, f.backup);
    for (const name of ['Area', 'Device', 'Entity', 'Floor', 'Label']) {
        const result = run(f, name, 'connected-error');
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stderr, /\[HA registry\] Refresh failed/);
        assert.doesNotMatch(result.stderr, /private-error/);
    }
});
