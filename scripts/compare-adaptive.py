"""Dev comparison: pip install astral==3.2; pass downloaded pinned AL source.

Executes upstream's pure SunEvents and color_temp_kelvin methods; removes only
HA color conversion imports, which these methods never call. No live HA access.
Usage: python scripts/compare-adaptive.py /path/to/color_and_brightness.py
"""
import ast
import datetime
import json
from pathlib import Path
import subprocess
import sys
import types
from zoneinfo import ZoneInfo
import astral

source = Path(sys.argv[1]).read_text()
tree = ast.parse(source)
tree.body = [n for n in tree.body if not (isinstance(n, ast.ImportFrom) and n.module and n.module.startswith('homeassistant'))]
module = types.ModuleType('sw_light_al_comparison')
sys.modules[module.__name__] = module
exec(compile(tree, str(sys.argv[1]), 'exec'), module.__dict__)
sun = module.SunEvents(name='comparison', astral_observer=astral.Observer(59.3293, 18.0686),
    sunrise_time=None, min_sunrise_time=None, max_sunrise_time=None, sunset_time=None,
    min_sunset_time=None, max_sunset_time=None, timezone=ZoneInfo('Europe/Stockholm'))
settings = module.SunLightSettings.__new__(module.SunLightSettings)
object.__setattr__(settings, 'min_color_temp', 2000)
object.__setattr__(settings, 'max_color_temp', 5500)
object.__setattr__(settings, 'adapt_until_sleep', False)
rows = json.loads(subprocess.check_output(['node', 'scripts/compare-solar.js'], text=True))
report = {'source_sha256': __import__('hashlib').sha256(source.encode()).hexdigest(), 'astral_version': astral.__version__, 'dates': {}}
for row in rows:
    dt = datetime.datetime.fromtimestamp(row['timestamp'] / 1000, datetime.UTC)
    al_kelvin = settings.color_temp_kelvin(sun.sun_position(dt))
    item = {'utc': dt.isoformat(), 'local': dt.astimezone(ZoneInfo('Europe/Stockholm')).strftime('%H:%M'),
        'sw_kelvin': row['kelvin'], 'al_kelvin': al_kelvin, 'difference': row['kelvin'] - al_kelvin}
    report['dates'].setdefault(str(dt.date()), []).append(item)
for date, samples in report['dates'].items():
    deltas = [abs(s['difference']) for s in samples]
    print(f'{date}: max delta {max(deltas)} K, mean absolute delta {sum(deltas)/len(deltas):.2f} K')
    for s in samples:
        if s['local'] in ['06:00', '09:00', '12:00', '15:00', '18:00', '21:00']:
            print(f"  {s['local']} SW={s['sw_kelvin']} AL={s['al_kelvin']}")
Path('docs/solar-comparison.json').write_text(json.dumps(report, indent=2) + '\n')
