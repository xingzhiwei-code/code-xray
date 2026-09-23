#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""T301d demo: full V04-1 double-loop over the MCP NDJSON channel.

baseline -> modify -> review -> read evidence -> modify again -> re-review,
asserting: new reviewId per change, old review stale+incomplete, gate
semantics, idempotent re-finish. Transcript saved as evidence artifact.
"""
import json, os, subprocess, sys, tempfile, shutil, time

ROOT = os.path.dirname(os.path.abspath(__file__)) + '/..'
AGENT = os.path.join(ROOT, 'dist', 'agent.js')
FIXTURE = os.path.join(ROOT, 'fixtures', 'java-spring-jpa')

ws = tempfile.mkdtemp(prefix='xray-v04-demo-')
shutil.copytree(os.path.join(FIXTURE, 'src'), os.path.join(ws, 'src'))
data = tempfile.mkdtemp(prefix='xray-v04-data-')

proc = subprocess.Popen(['node', AGENT], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE, env={**os.environ, 'XRAY_DATA_DIR': data}, text=True)
log = []

def send(msg):
    line = json.dumps(msg, ensure_ascii=False)
    proc.stdin.write(line + '\n'); proc.stdin.flush()
    log.append(('>>', json.loads(line)))

def recv(expect_id, timeout=120):
    deadline = time.time() + timeout
    while time.time() < deadline:
        line = proc.stdout.readline()
        if not line: raise SystemExit('server closed')
        m = json.loads(line)
        log.append(('<<', m))
        if m.get('id') == expect_id: return m
    raise SystemExit('timeout waiting for %s' % expect_id)

def call(i, tool, args):
    send({'jsonrpc': '2.0', 'id': i, 'method': 'tools/call', 'params': {'name': tool, 'arguments': args}})
    r = recv(i)
    env = r['result']['structuredContent']
    assert env['status'] == 'ok', 'tool %s failed: %s' % (tool, json.dumps(env.get('error'), ensure_ascii=False))
    return env['data']

checks = []
def check(name, cond, detail=''):
    checks.append((name, bool(cond), detail))
    print('%s %s %s' % ('PASS' if cond else 'FAIL', name, detail))

send({'jsonrpc': '2.0', 'id': 0, 'method': 'initialize', 'params': {'protocolVersion': '2025-06-18', 'capabilities': {}, 'clientInfo': {'name': 'v04-demo', 'version': '0'}}})
recv(0)
send({'jsonrpc': '2.0', 'method': 'notifications/initialized'})

# --- Round 1: baseline -> agent modifies -> review ---
s1 = call('r1-start', 'xray_review_start', {'path': ws})
check('R1 baseline captured', s1['fileCount'] == 36, 'files=%d snapshot=%s' % (s1['fileCount'], s1['baselineSnapshotId'][:12]))

svc = os.path.join(ws, 'src/main/java/demo/orders/OrderService.java')
src = open(svc).read()
open(svc, 'w').write(src.replace(
    '    public List<Order> openOrders() {',
    '    public void auditAll(List<Order> orders) {\n        for (Order order : orders) {\n            orderRepository.save(order);\n        }\n    }\n\n    public List<Order> openOrders() {'))

f1 = call('r1-finish', 'xray_review_finish', {'path': ws, 'sessionId': s1['sessionId']})
rec1 = f1['record']
check('R1 new reviewId', rec1['reviewId'].startswith('rev_'), rec1['reviewId'])
check('R1 detects modified file', 'src/main/java/demo/orders/OrderService.java' in rec1['output']['pathImpacts']['modified'], str(rec1['output']['pathImpacts']['modified']))
check('R1 new findings > 0', len(rec1['output']['newFindingIds']) > 0, 'new=%d continuing=%d' % (len(rec1['output']['newFindingIds']), len(rec1['output']['continuingFindingIds'])))
check('R1 gate needs_human, non-blocking', rec1['gate']['state'] == 'needs_human' and rec1['gate']['blocking'] is False, rec1['gate']['state'])
check('R1 suggested checks present', len(rec1['output']['suggestedChecks']) > 0, 'checks=%d' % len(rec1['output']['suggestedChecks']))

# read evidence for the first NEW finding
new_fid = rec1['output']['newFindingIds'][0]
send({'jsonrpc': '2.0', 'id': 'r1-scan', 'method': 'tools/call', 'params': {'name': 'xray_scan', 'arguments': {'path': ws}}})
r = recv('r1-scan'); scan_env = r['result']['structuredContent']['data']
finding = next(f for f in scan_env['findings'] if f['id'] == new_fid)
ev = call('r1-ev', 'xray_evidence', {'path': ws, 'evidenceId': finding['evidenceIds'][0], 'analysisId': scan_env['analysisId']})
ev_text = ''.join(l['text'] for l in ev['lines'])
check('R1 evidence is source-data at changed file', ev['kind'] == 'source-data' and ev['path'] == 'src/main/java/demo/orders/OrderService.java' and 'orderRepository' in ev_text,
      '%s:%d %s' % (ev['path'], ev['start']['line'], ev_text.strip()[:60]))
check('R1 new finding anchored in auditAll', 'auditAll' in finding['symbol'], finding['symbol'])

# idempotent re-finish on unchanged snapshot
f1b = call('r1-refinish', 'xray_review_finish', {'path': ws, 'sessionId': s1['sessionId']})
check('R1 re-finish idempotent', f1b['reused'] is True and f1b['record']['reviewId'] == rec1['reviewId'], 'reused=%s' % f1b['reused'])

# --- Round 2: modify again -> re-review; old review must go stale ---
s2 = call('r2-start', 'xray_review_start', {'path': ws})
open(svc, 'w').write(open(svc).read().replace(
    '    public void auditAll(List<Order> orders) {\n        for (Order order : orders) {\n            orderRepository.save(order);\n        }\n    }\n\n',
    '    public void auditAll(List<Order> orders) {\n        orderRepository.saveAll(orders);\n    }\n\n'))
f2 = call('r2-finish', 'xray_review_finish', {'path': ws, 'sessionId': s2['sessionId']})
rec2 = f2['record']
check('R2 new reviewId differs', rec2['reviewId'] != rec1['reviewId'], rec2['reviewId'])
check('R2 removal of loop risk detected', len(rec2['output']['removedFindingIds']) > 0 or len(rec2['output']['newFindingIds']) == 0,
      'removed=%d new=%d' % (len(rec2['output']['removedFindingIds']), len(rec2['output']['newFindingIds'])))

old = call('r2-read-old', 'xray_review_read', {'path': ws, 'reviewId': rec1['reviewId']})
check('R2 old review stale + incomplete', old['stale'] is True and old['record']['gate']['state'] == 'incomplete',
      'stalePaths=%s' % old['stalePaths'][:2])

# --- summary ---
debt = call('sum-debt', 'xray_summary', {'path': ws, 'kind': 'debt'})
check('debt summary reusable', debt['modelVersion'] == 'debt-model-v1', 'total=%s' % debt['total'])

proc.stdin.close(); proc.wait(timeout=10)
failed = [c for c in checks if not c[1]]
print('\n%d/%d checks passed' % (len(checks) - len(failed), len(checks)))

os.makedirs(os.path.join(ROOT, 'artifacts', 'evidence', 'E031'), exist_ok=True)
with open(os.path.join(ROOT, 'artifacts', 'evidence', 'E031', 'v04-double-loop-transcript.ndjson'), 'w') as f:
    for direction, m in log:
        f.write(direction + ' ' + json.dumps(m, ensure_ascii=False)[:4000] + '\n')
with open(os.path.join(ROOT, 'artifacts', 'evidence', 'E031', 'checks.json'), 'w') as f:
    json.dump([{'name': n, 'passed': p, 'detail': d} for n, p, d in checks], f, ensure_ascii=False, indent=1)
shutil.rmtree(ws, ignore_errors=True); shutil.rmtree(data, ignore_errors=True)
sys.exit(1 if failed else 0)
