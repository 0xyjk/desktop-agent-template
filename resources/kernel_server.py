#!/usr/bin/env python3
"""
Persistent IPython kernel server.

Protocol (stdin/stdout, newline-delimited JSON):
  Input:  {"code": "..."}
  Output: {"stdout": "...", "stderr": "...", "images": ["base64..."], "error": "..."|null}

Signals ready with {"status": "ready"} after kernel starts.
"""
import re
import sys
import json
from jupyter_client import KernelManager


def strip_ansi(text: str) -> str:
    return re.sub(r'\x1b\[[0-9;]*[mK]', '', text)


def collect_outputs(kc, msg_id: str) -> dict:
    """Collect all iopub messages for a given execute request."""
    stdout_parts: list[str] = []
    stderr_parts: list[str] = []
    images: list[str] = []
    error = None

    while True:
        try:
            msg = kc.get_iopub_msg(timeout=60)
        except Exception:
            break

        if msg.get('parent_header', {}).get('msg_id') != msg_id:
            continue

        msg_type = msg['msg_type']
        content = msg['content']

        if msg_type == 'stream':
            if content['name'] == 'stdout':
                stdout_parts.append(content['text'])
            elif content['name'] == 'stderr':
                stderr_parts.append(content['text'])

        elif msg_type in ('display_data', 'execute_result'):
            data = content.get('data', {})
            if 'image/png' in data:
                images.append(data['image/png'])
            elif 'text/plain' in data and msg_type == 'execute_result':
                stdout_parts.append(data['text/plain'])

        elif msg_type == 'error':
            tb = content.get('traceback', [content.get('evalue', 'Unknown error')])
            error = strip_ansi('\n'.join(tb))

        elif msg_type == 'status' and content.get('execution_state') == 'idle':
            break

    return {
        'stdout': ''.join(stdout_parts),
        'stderr': ''.join(stderr_parts),
        'images': images,
        'error': error,
    }


def main():
    km = KernelManager(kernel_name='python3')
    km.start_kernel()
    kc = km.client()
    kc.start_channels()
    kc.wait_for_ready(timeout=30)

    # Enable inline matplotlib and configure Chinese font support
    init_code = """
%matplotlib inline
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm

_chinese_fonts = ['Arial Unicode MS', 'STHeiti', 'Songti SC', 'PingFang HK', 'Microsoft YaHei', 'SimHei', 'Noto Sans CJK SC', 'WenQuanYi Micro Hei']
_available = {f.name for f in fm.fontManager.ttflist}
for _font in _chinese_fonts:
    if _font in _available:
        plt.rcParams['font.family'] = _font
        break
plt.rcParams['axes.unicode_minus'] = False
"""
    init_id = kc.execute(init_code)
    collect_outputs(kc, init_id)

    print(json.dumps({'status': 'ready'}), flush=True)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except json.JSONDecodeError:
            continue

        code = request.get('code', '')
        msg_id = kc.execute(code)
        result = collect_outputs(kc, msg_id)
        print(json.dumps(result), flush=True)

    km.shutdown_kernel()


if __name__ == '__main__':
    main()
