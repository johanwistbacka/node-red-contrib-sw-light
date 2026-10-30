'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createStatusReporter } = require('../lib/status');

test('status uses local date/time and preserves it across identical refreshes and date boundaries', () => {
    let time = new Date(2026, 0, 2, 3, 4, 5).getTime();
    const statuses = [];
    const report = createStatusReporter(value => statuses.push(value), () => time);
    const status = { fill: 'green', shape: 'dot', text: 'AUTO · ON · 94%' };
    report(status);
    assert.deepEqual(statuses.at(-1), { ...status, text: 'AUTO · ON · 94% · 02/01 03:04:05' });
    time = new Date(2026, 0, 3, 6, 7, 8).getTime();
    report({ ...status });
    assert.deepEqual(statuses.at(-1), statuses[0]);
    report({ fill: 'grey', shape: 'dot', text: 'AUTO · OFF' });
    assert.equal(statuses.at(-1).text, 'AUTO · OFF · 03/01 06:07:08');
    assert.equal(status.text, 'AUTO · ON · 94%');
});

test('status icon changes count even when the text is unchanged', () => {
    let time = new Date(2026, 9, 30, 14, 32, 8).getTime();
    const statuses = [];
    const report = createStatusReporter(value => statuses.push(value), () => time);
    report({ fill: 'green', shape: 'dot', text: '1 on' });
    time += 1000;
    report({ fill: 'red', shape: 'dot', text: '1 on' });
    assert.equal(statuses.at(-1).text, '1 on · 30/10 14:32:09');
    time += 1000;
    report({ fill: 'red', shape: 'ring', text: '1 on' });
    assert.equal(statuses.at(-1).text, '1 on · 30/10 14:32:10');
});

test('each node owns its timestamp and a cleared status resets it', () => {
    let time = new Date(2026, 9, 30, 14, 32, 8).getTime();
    const first = [], second = [];
    const reportFirst = createStatusReporter(value => first.push(value), () => time);
    const reportSecond = createStatusReporter(value => second.push(value), () => time);
    const error = { fill: 'red', shape: 'ring', text: 'HA NOT READY' };
    reportFirst(error);
    time += 1000;
    reportSecond(error);
    reportFirst(error);
    assert.equal(first.at(-1).text, 'HA NOT READY · 30/10 14:32:08');
    assert.equal(second.at(-1).text, 'HA NOT READY · 30/10 14:32:09');
    reportFirst({});
    assert.deepEqual(first.at(-1), {});
    time += 1000;
    reportFirst(error);
    assert.equal(first.at(-1).text, 'HA NOT READY · 30/10 14:32:10');
});
