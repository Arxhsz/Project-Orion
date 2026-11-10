"""Local development server: reload the browser on source edits and restart Python."""
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parent


def python_revision():
    return tuple((p.name, p.stat().st_mtime_ns) for p in sorted(ROOT.glob('*.py')))


def main():
    port = sys.argv[1] if len(sys.argv) > 1 else '4174'
    env = dict(os.environ, ORION_DEV_RELOAD='1')
    process = None
    try:
        while True:
            revision = python_revision()
            process = subprocess.Popen([sys.executable, str(ROOT / 'orion_server.py'), port], cwd=ROOT, env=env)
            while process.poll() is None and python_revision() == revision:
                time.sleep(0.5)
            if process.poll() is not None:
                return process.returncode
            print('Python source changed; restarting local preview.', flush=True)
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
    except KeyboardInterrupt:
        return 0
    finally:
        if process is not None and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()


if __name__ == '__main__':
    sys.exit(main())
