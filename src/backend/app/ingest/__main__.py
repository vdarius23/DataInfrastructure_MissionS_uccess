"""Run the ingestor: ``python -m app.ingest``.

    python -m app.ingest                       # read the IoT Hub stream (runs until stopped)
    python -m app.ingest --replay events.json  # store messages from a file ('-' = stdin)

Replay mode feeds the same handler without Azure. CI and offline demos use it.

Environment:
    IOTHUB_EVENTS_CONNECTION_STRING  Event Hub-compatible connection string (terraform output)
    IOTHUB_CONSUMER_GROUP            consumer group to read with (default "ingestor")
"""

import argparse
import logging
import os
import sys
from pathlib import Path

from app.config import get_settings
from app.database import SessionLocal, init_db, wait_for_database
from app.ingest.handler import IngestResult, ingest_message, split_replay

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logging.getLogger("azure").setLevel(logging.WARNING)  # the SDK is very chatty at INFO
logger = logging.getLogger("app.ingest")

DEVICE_ID_PROPERTY = b"iothub-connection-device-id"


def _log(result: IngestResult, device_id: str | None) -> None:
    if result.outcome == "rejected":
        logger.warning("rejected %s from %s: %s", result.event_id, device_id, result.reason)
    else:
        logger.info("%s %s from %s", result.outcome, result.event_id, device_id)


def replay(source: str) -> int:
    text = sys.stdin.read() if source == "-" else Path(source).read_text(encoding="utf-8")
    counts = {"stored": 0, "duplicate": 0, "rejected": 0}
    for body in split_replay(text):
        with SessionLocal() as db:
            result = ingest_message(db, body, hub_device_id=None)
        counts[result.outcome] += 1
        _log(result, "replay")
    print(
        f"Replay: {counts['stored']} stored, {counts['duplicate']} duplicate, "
        f"{counts['rejected']} rejected."
    )
    return 0 if counts["rejected"] == 0 else 1


def stream(connection_string: str, consumer_group: str) -> int:
    from azure.eventhub import EventHubConsumerClient  # only needed in stream mode

    def on_event(partition_context, event) -> None:
        if event is None:
            return
        raw_device = (event.system_properties or {}).get(DEVICE_ID_PROPERTY)
        device_id = raw_device.decode() if isinstance(raw_device, bytes) else raw_device
        with SessionLocal() as db:
            result = ingest_message(db, event.body_as_str(encoding="utf-8"), device_id)
        _log(result, device_id)

    def on_error(partition_context, error) -> None:
        partition = partition_context.partition_id if partition_context else "-"
        logger.error("stream error on partition %s: %s", partition, error)

    client = EventHubConsumerClient.from_connection_string(
        connection_string, consumer_group=consumer_group
    )
    logger.info("reading IoT Hub stream (consumer group %s)", consumer_group)
    with client:
        # "-1" = from the oldest retained message. After a restart this re-reads up to a
        # day of messages; duplicates are skipped by the event_id unique constraint.
        client.receive(on_event=on_event, on_error=on_error, starting_position="-1")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="DriveSense IoT Hub ingestor")
    parser.add_argument("--replay", metavar="FILE", help="store messages from FILE ('-' = stdin)")
    args = parser.parse_args(argv)

    wait_for_database(get_settings().db_connect_timeout_seconds)
    init_db()

    if args.replay:
        return replay(args.replay)

    connection_string = os.getenv("IOTHUB_EVENTS_CONNECTION_STRING", "").strip()
    if not connection_string:
        print("IOTHUB_EVENTS_CONNECTION_STRING is not set (see .env.example).", file=sys.stderr)
        return 2
    return stream(connection_string, os.getenv("IOTHUB_CONSUMER_GROUP", "ingestor"))


if __name__ == "__main__":
    sys.exit(main())
