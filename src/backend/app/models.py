"""SQLAlchemy ORM models."""

from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, Float, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SensorEvent(Base):
    """One GPS + accelerometer sample sent by a phone."""

    __tablename__ = "sensor_events"
    __table_args__ = (
        UniqueConstraint("event_id", name="uq_sensor_events_event_id"),
        CheckConstraint("latitude BETWEEN -90 AND 90", name="ck_sensor_events_latitude_range"),
        CheckConstraint("longitude BETWEEN -180 AND 180", name="ck_sensor_events_longitude_range"),
        CheckConstraint("speed_mps >= 0", name="ck_sensor_events_speed_non_negative"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    event_id: Mapped[str] = mapped_column(String(64), nullable=False)
    device_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    session_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    # Attribute is ``timestamp`` (API contract); column is ``event_timestamp``.
    timestamp: Mapped[datetime] = mapped_column(
        "event_timestamp", DateTime(timezone=True), nullable=False, index=True
    )
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    speed_mps: Mapped[float] = mapped_column(Float, nullable=False)
    acceleration_x: Mapped[float] = mapped_column(Float, nullable=False)
    acceleration_y: Mapped[float] = mapped_column(Float, nullable=False)
    acceleration_z: Mapped[float] = mapped_column(Float, nullable=False)