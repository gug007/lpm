# simdrive.py <companion host:port>: one idb connection to the iOS Simulator,
# kept open for the whole take, reading the simulated iPhone's screen (its
# accessibility tree) in a few milliseconds. Reads JSON lines on stdin and
# answers each with one JSON line:
#   {"op": "describe"} -> {"ok": true, "elements": [...]}
# Taps don't go through idb: its touches never reach a device Device Hub hosts
# (phone.js presses elements through Device Hub instead).
import asyncio
import json
import logging
import sys

from idb.common.types import AccessibilityInfoOptions, TCPAddress
from idb.grpc.client import Client


async def main(address):
    host, port = address.rsplit(":", 1)
    logger = logging.getLogger("simdrive")
    loop = asyncio.get_running_loop()
    reader = asyncio.StreamReader()
    await loop.connect_read_pipe(lambda: asyncio.StreamReaderProtocol(reader), sys.stdin)
    async with Client.build(address=TCPAddress(host=host, port=int(port)), logger=logger) as client:
        print(json.dumps({"ok": True, "ready": True}), flush=True)
        while True:
            line = await reader.readline()
            if not line:
                return
            try:
                req = json.loads(line)
                op = req.get("op")
                if op == "describe":
                    info = await client.accessibility_info(target=None, options=AccessibilityInfoOptions())
                    out = {"ok": True, "elements": json.loads(info.json)}
                else:
                    out = {"ok": False, "error": f"unknown op {op!r}"}
            except Exception as e:
                out = {"ok": False, "error": f"{type(e).__name__}: {e}"}
            print(json.dumps(out), flush=True)


asyncio.run(main(sys.argv[1]))
