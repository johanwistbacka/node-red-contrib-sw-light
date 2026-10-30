'use strict';
// Public Stockholm city centre. Development-only; never used as runtime fallback.
const { calculate } = require('../lib/solar-temperature');
const rows = [];
for (const date of ['2026-12-21', '2026-03-20', '2026-06-21', '2026-09-22']) {
    for (let minutes = 0; minutes < 1440; minutes += 15) {
        const timestamp = Date.parse(`${date}T00:00:00Z`) + minutes * 60000;
        rows.push({ timestamp, ...calculate({ timestamp, latitude: 59.3293, longitude: 18.0686 }) });
    }
}
process.stdout.write(JSON.stringify(rows));
