"""Measure actual backend captures versus cached paints under continuous damage."""
import time
import os
import re
from pathlib import Path
from statistics import median


def telemetry(pid):
    stat = Path(f'/proc/{pid}/stat').read_text().split(') ', 1)[1].split()
    cpu = (int(stat[11]) + int(stat[12])) / os.sysconf('SC_CLK_TCK')
    status = Path(f'/proc/{pid}/status').read_text()
    rss = int(re.search(r'VmRSS:\s+(\d+)', status)[1])
    engines = {}
    clients = set()
    for path in Path(f'/proc/{pid}/fdinfo').iterdir():
        try:
            text = path.read_text()
        except OSError:
            continue
        client = re.search(r'drm-client-id:\s+(\d+)', text)
        if not client or client[1] in clients:
            continue
        clients.add(client[1])
        for name, value in re.findall(r'drm-engine-([\w-]+):\s+(\d+) ns', text):
            engines[name] = engines.get(name, 0) + int(value)
    return dict(cpu_seconds=cpu, rss_kib=rss, gpu_engine_ns=engines)


def test_blur_rate(evaluate, check, results, pid):
    evaluate('surface = soft._surfaces.get("quick-settings"); surface.menu.open();')
    time.sleep(0.6)
    check('rate-backend-capability', '"frame_divisor" in surface._effect')
    measurements = []
    for rate, divisor in enumerate([1, 2, 4]):
        evaluate(f'soft._settings.set_int("blur-rate", {rate});')
        time.sleep(0.3)
        check(f'rate-divisor-{divisor}', f'surface._effect.frame_divisor === {divisor}')
        evaluate('globalThis.rateStart = [surface._effect.capture_count, surface._effect.cached_count]; '
                 'globalThis.rateTimer = imports.gi.GLib.timeout_add(0, 8, () => { '
                 'surface._blur.queue_redraw(); surface._effect.queue_repaint(); return true; });')
        time.sleep(1.5)
        evaluate('imports.gi.GLib.source_remove(rateTimer);')
        counts = evaluate('[surface._effect.capture_count-rateStart[0], surface._effect.cached_count-rateStart[1]]')
        total = sum(counts)
        assert total >= 15, f'Insufficient paint samples: {counts}'
        fraction = counts[0] / total
        if divisor == 1:
            assert counts[1] == 0, counts
        else:
            assert 0.1 <= fraction <= (0.72 if divisor == 2 else 0.45), counts
        measurements.append(dict(divisor=divisor, captures=counts[0], cached=counts[1], fraction=fraction))
    # Balanced order, identical moving scene; read per-process counters rather
    # than whole-device utilization from other desktop applications.
    samples = []
    for order in [[0, 1, 2], [2, 0, 1], [1, 2, 0]]:
        for rate in order:
            evaluate(f'soft._settings.set_int("blur-rate", {rate});')
            time.sleep(0.5)
            evaluate('globalThis.benchTick = 0; '
                     'globalThis.benchTimer = imports.gi.GLib.timeout_add(0, 8, () => { '
                     'testBackdrop.translation_x = 8 * Math.sin(++benchTick / 12); '
                     'surface._blur.queue_redraw(); surface._effect.queue_repaint(); return true; }); '
                     'globalThis.rateStart = [surface._effect.capture_count, surface._effect.cached_count];')
            start = telemetry(pid)
            begin = time.monotonic()
            time.sleep(5)
            end = telemetry(pid)
            elapsed = time.monotonic() - begin
            counts = evaluate('[surface._effect.capture_count-rateStart[0], surface._effect.cached_count-rateStart[1]]')
            evaluate('imports.gi.GLib.source_remove(benchTimer); testBackdrop.translation_x = 0;')
            samples.append(dict(divisor=[1, 2, 4][rate], elapsed_s=elapsed,
                                cpu_percent_one_core=100 * (end['cpu_seconds']-start['cpu_seconds'])/elapsed,
                                rss_kib=end['rss_kib'], captures=counts[0], cached=counts[1],
                                gpu_engine_ms_per_s={k:(v-start['gpu_engine_ns'].get(k, v))/1e6/elapsed
                                                     for k,v in end['gpu_engine_ns'].items()}))
    summary = []
    for divisor in [1, 2, 4]:
        group = [s for s in samples if s['divisor'] == divisor]
        summary.append(dict(divisor=divisor,
                            cpu_percent_one_core=median(s['cpu_percent_one_core'] for s in group),
                            rss_mib=median(s['rss_kib'] for s in group)/1024,
                            captures_per_s=median(s['captures']/s['elapsed_s'] for s in group),
                            gpu_engine_ms_per_s={k:median(s['gpu_engine_ms_per_s'].get(k, 0) for s in group)
                                                 for k in group[0]['gpu_engine_ms_per_s']}))
    results['blur-rate-benchmark'] = dict(samples=samples, medians=summary,
                                         workload='Moving striped backdrop; Quick Settings open; 3 x 5s per mode; balanced order')
    # Parameter changes must bypass the throttle.
    evaluate('globalThis.captureBefore = surface._effect.capture_count; '
             'soft._settings.set_int("blur-radius", 38);')
    time.sleep(0.1)
    check('rate-parameter-invalidation', 'surface._effect.capture_count > captureBefore')
    evaluate('soft._settings.set_int("blur-rate", 0); surface.menu.close();')
    results['blur-rate-measurements'] = measurements
