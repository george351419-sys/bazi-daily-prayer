"""Test-only controllable clock. Never imported by the production service."""
import json
import os
import sys
from pathlib import Path
from prayer_device.core import Store
from prayer_device.server import Server

store=Store(sys.argv[1])
clock=Path(sys.argv[2])
store.automation.clock=lambda:float(clock.read_text())
credentials=[store.provision() for _ in range(3)]
with open(sys.argv[3],'x') as output:
    os.chmod(sys.argv[3],0o600)
    json.dump(credentials,output)
server=Server(('127.0.0.1',0),store,os.environ['PRAYER_DEVICE_SERVICE_KEY'])
print('http://127.0.0.1:'+str(server.server_port),flush=True)
server.serve_forever()
