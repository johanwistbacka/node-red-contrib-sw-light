#!/usr/bin/env node
'use strict';

// Local repair for the published HA provider, not a process-wide rejection handler.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');

const ORIGINAL_SHA256 = '120e0cacf500e8bd80409325773013ea277f8df583ed5547724af06b7de534c5';
const ORIGINAL = 't(e).then(n=>r.setState(n,!0))';
const REPAIRED = ORIGINAL + '.catch(()=>{if(e.connected)console.warn("[HA registry] Refresh failed; retaining last state until the next refresh")})';
const hash = data => crypto.createHash('sha256').update(data).digest('hex');

function repair(source) {
    if (hash(source) !== ORIGINAL_SHA256) throw Error('Unrecognized HA registry source; refusing to patch');
    if (source.split(ORIGINAL).length - 1 !== 5) throw Error('Expected exactly five HA registry refresh handlers');
    return source.split(ORIGINAL).join(REPAIRED);
}

function locate(userDir) {
    const req = createRequire(path.join(path.resolve(userDir), 'package.json'));
    const manifest = fs.realpathSync(req.resolve('node-red-contrib-home-assistant-websocket/package.json'));
    const version = JSON.parse(fs.readFileSync(manifest)).version;
    if (!['0.80.3', '0.81.0'].includes(version)) throw Error(`Unverified HA provider ${version}; refusing to patch`);
    return { file: fs.realpathSync(path.join(path.dirname(manifest), 'dist/homeAssistant/collections.js')), version };
}

function check(userDir) {
    const { file, version } = locate(userDir), source = fs.readFileSync(file, 'utf8');
    const original = source.split(REPAIRED).join(ORIGINAL), patched = repair(original);
    if (source !== original && source !== patched) throw Error('Unexpected HA registry changes; refusing to patch');
    return { status: source === patched ? 'applied' : 'repair-required', file, providerVersion: version, sha256: hash(source) };
}

function replace(file, contents) {
    const temporary = file + '.sw-registry-' + crypto.randomUUID();
    try {
        fs.writeFileSync(temporary, contents, { flag: 'wx', mode: fs.statSync(file).mode & 0o777 });
        fs.renameSync(temporary, file);
    } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

function apply(userDir, backupDir) {
    const { file, version } = locate(userDir), source = fs.readFileSync(file, 'utf8');
    // Recognize only the exact repair derived from the audited original bytes.
    const original = source.split(REPAIRED).join(ORIGINAL);
    const patched = repair(original);
    if (source === patched) return { changed: false, file, providerVersion: version, sha256: hash(source) };
    if (source !== original) throw Error('Unexpected HA registry changes; refusing to patch');
    fs.mkdirSync(backupDir, { mode: 0o700 });
    fs.writeFileSync(path.join(backupDir, 'collections.js'), source, { flag: 'wx', mode: 0o600 });
    fs.writeFileSync(path.join(backupDir, 'repair.json'), JSON.stringify({ file,
        originalSha256: hash(source), patchedSha256: hash(patched) }, null, 2), { flag: 'wx', mode: 0o600 });
    replace(file, patched);
    return { changed: true, file, providerVersion: version, sha256: hash(fs.readFileSync(file)), backupDir };
}

function restore(userDir, backupDir) {
    const { file, version } = locate(userDir), source = fs.readFileSync(path.join(backupDir, 'collections.js'), 'utf8');
    const metadata = JSON.parse(fs.readFileSync(path.join(backupDir, 'repair.json')));
    const patched = repair(source);
    if (metadata.file !== file || metadata.originalSha256 !== hash(source) || metadata.patchedSha256 !== hash(patched)) {
        throw Error('Backup identity does not match the selected HA provider');
    }
    const current = fs.readFileSync(file, 'utf8');
    if (current === source) return { changed: false, file, providerVersion: version, sha256: hash(source) };
    if (current !== patched) throw Error('HA provider changed since repair; refusing to overwrite it');
    replace(file, source);
    return { changed: true, file, providerVersion: version, sha256: hash(fs.readFileSync(file)) };
}

if (require.main === module) {
    const [mode, userDir, backupDir, ...extra] = process.argv.slice(2);
    const usage = 'Usage: sw-light-ha-registry check NODE_RED_USER_DIR\n' +
        '       sw-light-ha-registry apply|restore NODE_RED_USER_DIR BACKUP_DIR\n' +
        'Stop Node-RED before apply/restore, then restart it. Use a fresh backup directory for apply.';
    if (['--help', '-h'].includes(mode) && !userDir) {
        console.log(usage);
    } else if (!['check', 'apply', 'restore'].includes(mode) || !userDir || extra.length ||
        (mode === 'check' ? Boolean(backupDir) : !backupDir)) {
        console.error(usage);
        process.exitCode = 1;
    } else {
        try { console.log(JSON.stringify(mode === 'check' ? check(userDir) :
            (mode === 'apply' ? apply : restore)(userDir, path.resolve(backupDir)))); }
        catch (error) { console.error(error.message); process.exitCode = 1; }
    }
}

module.exports = { repair, check, apply, restore, ORIGINAL_SHA256 };
