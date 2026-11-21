#!/usr/bin/env python3
"""DriveSense phone simulator.

Generates synthetic but realistic GPS + accelerometer events for one short trip and
sends them to the DriveSense API with HTTP POST requests. No phone hardware needed.

Nothing is sent until you run this script explicitly:

    python src/mobile/simulator/send_events.py
    python src/mobile/simulator/send_events.py --api-url http://localhost:8000 --count 10
    python src/mobile/simulator/send_events.py --dry-run      # print payloads only

Exit codes: 0 = all events delivered, 1 = at least one event not delivered, 2 = bad arguments.
Uses only the Python standard library.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import random
import sys
import time
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib import error, parse, request

DEFAULT_API_URL = "http://localhost:8000"
METERS_PER_DEGREE_LAT = 111_320.0
GRAVITY = 9.81
SAMPLE_INTERVAL_S = 1.0
SCENARIOS = ("smooth", "harsh-brake")
HARSH_BRAKE_MPS2 = -4.5  # well past the backend's -3.0 m/s^2 harsh-braking threshold
# Trip start: Cluj-Napoca city centre.
START_LATITUDE = 46.7712
START_LONGITUDE = 23.6236


def build_trip_events(
    count: int,
    device_id: str,
    session_id: str,
    rng: random.Random,
    start_time: datetime,
    scenario: str = "smooth",
) -> list[dict[str, Any]]:
    """Build ``count`` consecutive samples (1 Hz) of an urban drive.

    The car accelerates during the first half of the trip and eases off in the second
    half. With scenario "harsh-brake" the driver brakes hard for 2 seconds at 60% of
    the trip. Phone axes: x = lateral, y = longitudinal, z = vertical (gravity included).
    """
    brake_start = int(count * 0.6) if scenario == "harsh-brake" else None
    latitude, longitude = START_LATITUDE, START_LONGITUDE
    heading = math.radians(rng.uniform(55.0, 95.0))
    speed = rng.uniform(7.0, 9.0)
    events: list[dict[str, Any]] = []

    for index in range(count):
        progress = index / max(count - 1, 1)
        longitudinal = 1.2 * math.cos(math.pi * progress) + rng.gauss(0.0, 0.15)
        if brake_start is not None and brake_start <= index < brake_start + 2:
            longitudinal = HARSH_BRAKE_MPS2 + rng.gauss(0.0, 0.2)
        new_speed = max(0.0, speed + longitudinal * SAMPLE_INTERVAL_S)
        # Use the real speed change: once the car has stopped it no longer decelerates.
        longitudinal = (new_speed - speed) / SAMPLE_INTERVAL_S
        heading_change = math.radians(rng.gauss(0.0, 2.0))
        lateral = new_speed * heading_change / SAMPLE_INTERVAL_S

        if index > 0:
            heading += heading_change
            distance = (speed + new_speed) / 2 * SAMPLE_INTERVAL_S
            latitude += distance * math.cos(heading) / METERS_PER_DEGREE_LAT
            longitude += (
                distance
                * math.sin(heading)
                / (METERS_PER_DEGREE_LAT * math.cos(math.radians(latitude)))
            )
            speed = new_speed

        timestamp = start_time + timedelta(seconds=index * SAMPLE_INTERVAL_S)
        events.append(
            {
                "event_id": f"evt_{uuid.uuid4().hex[:20]}",
                "device_id": device_id,
                "session_id": session_id,
                "timestamp": timestamp.isoformat(timespec="milliseconds").replace("+00:00", "Z"),
                "latitude": round(latitude, 6),
                "longitude": round(longitude, 6),
                "speed_mps": round(speed, 2),
                "acceleration_x": round(lateral + rng.gauss(0.0, 0.05), 3),
                "acceleration_y": round(
                    (longitudinal if index > 0 else 0.0) + rng.gauss(0.0, 0.05), 3
                ),
                "acceleration_z": round(GRAVITY + rng.gauss(0.0, 0.08), 3),
            }
        )
    return events


def _read_error_message(exc: error.HTTPError) -> str:
    try:
        body = json.loads(exc.read().decode("utf-8", errors="replace"))
        err = body["error"]
        details = "; ".join(f"{d.get('field')}: {d.get('message')}" for d in err.get("details", []))
        return f"{err['code']}: {err['message']}" + (f" ({details})" if details else "")
    except (ValueError, KeyError, TypeError, AttributeError):
        return exc.reason if isinstance(exc.reason, str) else "HTTP error"


def check_health(api_url: str, timeout: float) -> tuple[bool, str]:
    try:
        with request.urlopen(f"{api_url}/health", timeout=timeout) as response:
            body = json.loads(response.read().decode("utf-8"))
            return True, f"status={body.get('status')} database={body.get('database')}"
    except error.HTTPError as exc:
        return False, f"HTTP {exc.code}: {_read_error_message(exc)}"
    except (error.URLError, TimeoutError, OSError, ValueError) as exc:
        reason = getattr(exc, "reason", exc)
        return False, f"cannot connect ({reason})"


def send_event(api_url: str, event: dict[str, Any], timeout: float) -> tuple[bool, str]:
    data = json.dumps(event).encode("utf-8")
    req = request.Request(
        f"{api_url}/api/events",
        data=data,
        method="POST",
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    try:
        with request.urlopen(req, timeout=timeout) as response:
            return True, f"HTTP {response.status}"
    except error.HTTPError as exc:
        return False, f"HTTP {exc.code} {_read_error_message(exc)}"
    except (error.URLError, TimeoutError, OSError) as exc:
        reason = getattr(exc, "reason", exc)
        return False, f"connection error ({reason})"


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Send synthetic phone sensor events.")
    parser.add_argument(
        "--api-url",
        default=os.getenv("DRIVESENSE_API_URL", DEFAULT_API_URL),
        help="Base URL of the DriveSense API (env DRIVESENSE_API_URL, default %(default)s).",
    )
    parser.add_argument("--count", type=int, default=10, help="Events to send (default 10).")
    parser.add_argument("--device-id", default="phone_01", help="Device identifier.")
    parser.add_argument("--session-id", default=None, help="Trip identifier (default: generated).")
    parser.add_argument("--seed", type=int, default=None, help="Random seed for sensor values.")
    parser.add_argument(
        "--scenario",
        choices=SCENARIOS,
        default="smooth",
        help="Driving style to simulate (default %(default)s).",
    )
    parser.add_argument(
        "--delay", type=float, default=0.2, help="Seconds to wait between requests."
    )
    parser.add_argument("--timeout", type=float, default=5.0, help="HTTP timeout in seconds.")
    parser.add_argument(
        "--dry-run", action="store_true", help="Print the payloads without sending them."
    )
    args = parser.parse_args(argv)

    if args.count < 1:
        parser.error("--count must be at least 1")
    if args.delay < 0 or args.timeout <= 0:
        parser.error("--delay must be >= 0 and --timeout must be > 0")
    parsed = parse.urlparse(args.api_url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        parser.error("--api-url must be an http(s) URL such as http://localhost:8000")
    args.api_url = args.api_url.rstrip("/")
    return args


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    rng = random.Random(args.seed)
    now = datetime.now(UTC).replace(microsecond=0)
    session_id = args.session_id or f"trip_{now:%Y%m%dT%H%M%S}_{uuid.uuid4().hex[:4]}"
    start_time = now - timedelta(seconds=args.count * SAMPLE_INTERVAL_S)
    events = build_trip_events(
        args.count, args.device_id, session_id, rng, start_time, args.scenario
    )

    if args.dry_run:
        print(json.dumps(events, indent=2))
        return 0

    print("DriveSense phone simulator")
    print(f"  API URL : {args.api_url}")
    print(f"  Device  : {args.device_id}")
    print(f"  Session : {session_id}")
    print(f"  Events  : {args.count}")
    print(f"  Scenario: {args.scenario}")

    healthy, health_message = check_health(args.api_url, args.timeout)
    print(f"  Health  : {health_message}")
    if not healthy:
        print(
            "\nThe API is not available. Start it with 'docker compose up --build' "
            "and check --api-url.",
            file=sys.stderr,
        )
        return 1
    print()

    delivered = 0
    width = len(str(args.count))
    for number, event in enumerate(events, start=1):
        ok, message = send_event(args.api_url, event, args.timeout)
        delivered += ok
        label = "[ OK ]" if ok else "[FAIL]"
        print(
            f"{label} {number:>{width}}/{args.count} {event['event_id']} "
            f"lat={event['latitude']:.5f} lon={event['longitude']:.5f} "
            f"speed={event['speed_mps']:.1f} m/s -> {message}"
        )
        if number < args.count and args.delay:
            time.sleep(args.delay)

    failed = args.count - delivered
    print(f"\nSummary: {delivered}/{args.count} events delivered, {failed} failed.")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
