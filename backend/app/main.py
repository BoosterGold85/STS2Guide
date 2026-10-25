"""M0 console: offline normalization and safe live bridge health monitoring."""
import argparse
from dataclasses import asdict
import json
import math
import time
from .game.client import BridgeClient, ReadOnlyBridgeClient, BridgeError
from .game.parser import parse_state, ParseError
from .game.snapshots import capture


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fixture', help='Parse an existing raw bridge JSON file offline')
    parser.add_argument('--capture', help='Write sanitized normalized diagnostic JSON (requires --fixture)')
    parser.add_argument('--watch', action='store_true', help='Poll chosen bridge; recovers after disconnect')
    parser.add_argument('--interval', type=float, default=2)
    parser.add_argument('--port', type=int, help='Default: 15526 legacy health, 15527 read-only prototype')
    parser.add_argument('--readonly-bridge', action='store_true', help='Use the separately built RunCoach.ReadOnly prototype (compatibility unverified)')
    args = parser.parse_args()
    if not math.isfinite(args.interval) or args.interval <= 0:
        parser.error('--interval must be finite and positive')
    if args.capture and not args.fixture:
        parser.error('--capture requires --fixture; unsafe live capture is disabled')
    if args.fixture and args.watch:
        parser.error('--watch is for live bridge polling only')
    try:
        if args.fixture:
            with open(args.fixture, encoding='utf-8') as stream:
                raw = json.load(stream)
            state = parse_state(raw)
            if args.capture:
                capture(raw, args.capture)
            print(json.dumps({'source': 'offline', 'state': asdict(state)}, indent=2))
            return 0
        client_type = ReadOnlyBridgeClient if args.readonly_bridge else BridgeClient
        client = client_type(args.port) if args.port is not None else client_type()
        while True:
            code = 0
            try:
                if args.readonly_bridge:
                    state = parse_state(client.state())
                    print(json.dumps({'status': 'observing_unverified', 'state': asdict(state)}), flush=True)
                else:
                    health = client.health()
                    print(json.dumps({'status': 'connected_state_blocked', 'bridge': health,
                                  'reason': 'State GET endpoints have gameplay side effects; live run not read.'}), flush=True)
            except (BridgeError, ParseError) as exc:
                code = 1
                print(json.dumps({'status': 'disconnected', 'error': str(exc)}), flush=True)
            if not args.watch:
                return code
            time.sleep(args.interval)
    except KeyboardInterrupt:
        return 0
    except (OSError, ValueError, ParseError) as exc:
        print(json.dumps({'status': 'error', 'error': str(exc)}))
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
