"""Alembic environment: uses the app's own database settings and models."""

from logging.config import fileConfig

from alembic import context

from app import models  # noqa: F401  (registers the tables on Base.metadata)
from app.database import Base, engine

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)  # logging settings from alembic.ini (CLI only)

target_metadata = Base.metadata


def run_migrations(connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


# The app passes its own open connection (see app/database.py). The CLI does not, so we
# connect with the app's engine, which reads DATABASE_URL.
existing_connection = config.attributes.get("connection")
if existing_connection is not None:
    run_migrations(existing_connection)
else:
    with engine.connect() as new_connection:
        run_migrations(new_connection)
