#!/usr/bin/env python3
"""Quick LiteLLM connectivity test. Run inside the litellm container."""
import urllib.request, json, os, sys

KEY = os.environ.get('LITELLM_MASTER_KEY', '')
BASE = 'http://localhost:4000'

# 1. Health check
try:
    r = urllib.request.urlopen(f'{BASE}/health', timeout=5)
    print(f'[OK] Health: {r.status}')
except Exception as e:
    print(f'[FAIL] Health: {e}')
    sys.exit(1)

# 2. List models
try:
    req = urllib.request.Request(f'{BASE}/v1/models',
        headers={'Authorization': f'Bearer {KEY}'})
    r = urllib.request.urlopen(req, timeout=10)
    models = json.loads(r.read())
    names = [m['id'] for m in models.get('data', [])]
    print(f'[OK] Models ({len(names)}): {", ".join(names[:10])}{"..." if len(names)>10 else ""}')
except Exception as e:
    print(f'[FAIL] Models: {e}')

# 3. Chat completion test
model = sys.argv[1] if len(sys.argv) > 1 else 'gemini-flash'
try:
    body = json.dumps({
        'model': model,
        'messages': [{'role': 'user', 'content': 'Say hi in 3 words'}],
        'max_tokens': 20
    }).encode()
    req = urllib.request.Request(f'{BASE}/v1/chat/completions',
        data=body,
        headers={'Content-Type': 'application/json',
                 'Authorization': f'Bearer {KEY}'})
    r = urllib.request.urlopen(req, timeout=30)
    resp = json.loads(r.read())
    msg = resp['choices'][0]['message']['content']
    print(f'[OK] Chat ({model}): {msg}')
except Exception as e:
    print(f'[FAIL] Chat ({model}): {e}')
