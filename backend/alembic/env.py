import sys
import os
from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

# Add backend directory to sys.path to import modules
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

# Import Base from database.py
from database import Base

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Set target_metadata to Base.metadata
# Models will be imported in run_migrations_online() to avoid circular imports
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        # DEFERRED IMPORT: Import models AFTER connecting to avoid circular imports
        # This registers all models in Base.metadata
        from app.models.transaction import Transaction
        from app.models.category import Category
        from app.models.account import Account
        from app.models.budget import Budget
        from app.models.goal import Goal
        from app.models.reminder import Reminder
        from app.models.credit_card_statement import CreditCardStatement
        from app.models.debt_share import DebtShare
        from app.models.config import Config
        from app.models.subscription import Subscription
        from app.models.transaction_split import TransactionSplit
        from app.models.iou import IOU
        from app.models.net_worth_snapshot import NetWorthSnapshot

        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            render_as_batch=True  # Required for SQLite ALTER COLUMN emulation
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
