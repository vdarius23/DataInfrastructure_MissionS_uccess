#!/usr/bin/env python3
"""DriveSense phone simulator.

Generates synthetic but realistic GPS + accelerometer events for one short trip and
streams them to Azure IoT Hub over MQTT, exactly like a phone would. No phone hardware needed.
The DriveSense ingestor reads the stream from IoT Hub and stores the readings.

Nothing is sent until you run this script explicitly:

    python src/mobile/simulator/send_events.py              # DRIVESENSE_DEVICE_CONNECTION_STRING
    python src/mobile/simulator/send_events.py --count 30 --scenario harsh-brake
    python src/mobile/simulator/send_events.py --dry-run    # print payloads only (no Azure)

The device connection string comes from IoT Hub (az iot hub device-identity connection-string
show). Each reading's device_id is taken from it, because the ingestor only accepts readings
whose device_id matches the identity IoT Hub authenticated.

Exit codes: 0 = all events delivered, 1 = at least one event not delivered, 2 = bad arguments.
--dry-run uses only the standard library; streaming needs azure-iot-device (requirements.txt).
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

CONNECTION_STRING_ENV = "DRIVESENSE_DEVICE_CONNECTION_STRING"
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


def parse_connection_string(value: str) -> dict[str, str]:
    """Split 'HostName=...;DeviceId=...;SharedAccessKey=...' into a dict.

    Keys may contain '=' at the end (base64), so each part is split on the first '=' only.
    """
    parts: dict[str, str] = {}
    for item in value.split(";"):
        key, separator, part_value = item.partition("=")
        if separator:
            parts[key.strip()] = part_value.strip()
    return parts


def stream_events(connection_string: str, events: list[dict[str, Any]], delay: float) -> int:
    """Send the events over one MQTT connection. Returns how many IoT Hub acknowledged."""
    from azure.iot.device import IoTHubDeviceClient, Message  # only needed when streaming

    client = IoTHubDeviceClient.create_from_connection_string(connection_string)
    try:
        client.connect()
    except Exception as exc:  # the SDK raises several error types; all mean "not connected"
        print(f"Cannot connect to IoT Hub: {exc}", file=sys.stderr)
        return 0

    delivered = 0
    width = len(str(len(events)))
    try:
        for number, event in enumerate(events, start=1):
            message = Message(json.dumps(event))
            message.content_type = "application/json"
            message.content_encoding = "utf-8"
            message.message_id = event["event_id"]
            try:
                client.send_message(message)  # returns once IoT Hub has acknowledged it
                delivered += 1
                label, result = "[ OK ]", "sent"
            except Exception as exc:
                label, result = "[FAIL]", f"not sent ({exc})"
            print(
                f"{label} {number:>{width}}/{len(events)} {event['event_id']} "
                f"lat={event['latitude']:.5f} lon={event['longitude']:.5f} "
                f"speed={event['speed_mps']:.1f} m/s -> {result}"
            )
            if number < len(events) and delay:
                time.sleep(delay)
    finally:
        client.shutdown()
    return delivered


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Stream synthetic phone sensor events.")
    parser.add_argument(
        "--connection-string",
        default=os.getenv(CONNECTION_STRING_ENV, ""),
        help=f"IoT Hub device connection string (env {CONNECTION_STRING_ENV}).",
    )
    parser.add_argument("--count", type=int, default=10, help="Events to send (default 10).")
    parser.add_argument(
        "--device-id",
        default=None,
        help="Device identifier for --dry-run (default: the connection string's DeviceId).",
    )
    parser.add_argument("--session-id", default=None, help="Trip identifier (default: generated).")
    parser.add_argument("--seed", type=int, default=None, help="Random seed for sensor values.")
    parser.add_argument(
        "--scenario",
        choices=SCENARIOS,
        default="smooth",
        help="Driving style to simulate (default %(default)s).",
    )
    parser.add_argument("--delay", type=float, default=0.2, help="Seconds between messages.")
    parser.add_argument(
        "--dry-run", action="store_true", help="Print the payloads without sending them."
    )
    args = parser.parse_args(argv)

    if args.count < 1:
        parser.error("--count must be at least 1")
    if args.delay < 0:
        parser.error("--delay must be >= 0")

    hub_device_id = parse_connection_string(args.connection_string).get("DeviceId")
    if not args.dry_run:
        if not hub_device_id:
            parser.error(
                f"set {CONNECTION_STRING_ENV} or --connection-string to a device connection "
                "string (HostName=...;DeviceId=...;SharedAccessKey=...)"
            )
        if args.device_id and args.device_id != hub_device_id:
            parser.error(
                f"--device-id {args.device_id} does not match the connection string's "
                f"DeviceId {hub_device_id}; the ingestor would reject every reading"
            )
    args.device_id = args.device_id or hub_device_id or "phone_01"
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

    hub = parse_connection_string(args.connection_string).get("HostName", "?")
    print("DriveSense phone simulator")
    print(f"  IoT Hub : {hub}")
    print(f"  Device  : {args.device_id}")
    print(f"  Session : {session_id}")
    print(f"  Events  : {args.count}")
    print(f"  Scenario: {args.scenario}")
    print()

    delivered = stream_events(args.connection_string, events, args.delay)
    failed = args.count - delivered
    print(f"\nSummary: {delivered}/{args.count} events delivered to IoT Hub, {failed} failed.")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())