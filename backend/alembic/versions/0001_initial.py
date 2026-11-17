"""Initial schema migration for Users, Simulations, SimulationSteps, and SimulationMetadata."""

from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("firebase_uid", sa.String(length=128), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("display_name", sa.String(length=150), nullable=False),
        sa.Column("profile_image", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_users_firebase_uid", "users", ["firebase_uid"], unique=True)

    op.create_table(
        "simulations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("simulation_name", sa.String(length=200), nullable=False),
        sa.Column("projectile_type", sa.String(length=50), nullable=False),
        sa.Column("physics_model", sa.String(length=50), nullable=False),
        sa.Column("source_environment", sa.String(length=64), nullable=False),
        sa.Column("destination_environment", sa.String(length=64), nullable=False),
        sa.Column("initial_velocity", sa.Float(), nullable=False),
        sa.Column("launch_angle", sa.Float(), nullable=False),
        sa.Column("gravity", sa.Float(), nullable=False),
        sa.Column("time_step", sa.Float(), nullable=False),
        sa.Column("mass", sa.Float(), nullable=False),
        sa.Column("drag_coefficient", sa.Float(), nullable=False),
        sa.Column("air_density", sa.Float(), nullable=False),
        sa.Column("cross_sectional_area", sa.Float(), nullable=False),
        sa.Column("maximum_height", sa.Float(), nullable=False),
        sa.Column("flight_time", sa.Float(), nullable=False),
        sa.Column("horizontal_range", sa.Float(), nullable=False),
        sa.Column("final_velocity", sa.Float(), nullable=False),
        sa.Column("destination_reached", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_simulations_user_id", "simulations", ["user_id"])

    op.create_table(
        "simulation_steps",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("simulation_id", sa.Integer(), sa.ForeignKey("simulations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("iteration_number", sa.Integer(), nullable=False),
        sa.Column("time", sa.Float(), nullable=False),
        sa.Column("x", sa.Float(), nullable=False),
        sa.Column("y", sa.Float(), nullable=False),
        sa.Column("vx", sa.Float(), nullable=False),
        sa.Column("vy", sa.Float(), nullable=False),
        sa.Column("k1", sa.JSON(), nullable=False),
        sa.Column("k2", sa.JSON(), nullable=False),
        sa.Column("k3", sa.JSON(), nullable=False),
        sa.Column("k4", sa.JSON(), nullable=False),
    )
    op.create_index("ix_sim_step_sim_iter", "simulation_steps", ["simulation_id", "iteration_number"])

    op.create_table(
        "simulation_metadata",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("simulation_id", sa.Integer(), sa.ForeignKey("simulations.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("initial_height", sa.Float(), nullable=False),
        sa.Column("destination_distance", sa.Float(), nullable=True),
        sa.Column("destination_height", sa.Float(), nullable=False),
        sa.Column("analytical_summary", sa.JSON(), nullable=True),
        sa.Column("errors_summary", sa.JSON(), nullable=True),
        sa.Column("extra_params", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("simulation_metadata")
    op.drop_table("simulation_steps")
    op.drop_table("simulations")
    op.drop_table("users")
