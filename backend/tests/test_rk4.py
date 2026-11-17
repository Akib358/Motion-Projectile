import math
import unittest

from backend.engine.rk4 import (
    SimulationInput,
    run_rk4_simulation,
    run_convergence_analysis,
)


class TestRK4ProjectileEngine(unittest.TestCase):
    def test_ideal_projectile_matches_analytical(self):
        params = SimulationInput(
            initial_velocity=50.0,
            launch_angle_deg=45.0,
            gravity=9.81,
            time_step=0.05,
            physics_model="ideal",
        )
        res = run_rk4_simulation(params)
        summary = res["summary"]
        analytical = res["analytical"]

        # Exact quadratic analytical expectations: T = 2*50*sin(45)/9.81, H = v0^2*sin^2(45)/(2g), R = v0^2/g
        self.assertAlmostEqual(summary["maximum_height"], analytical["maximum_height"], places=4)
        self.assertAlmostEqual(summary["horizontal_range"], analytical["horizontal_range"], places=1)
        self.assertAlmostEqual(summary["flight_time"], analytical["flight_time"], places=2)
        self.assertAlmostEqual(summary["max_speed"], 50.0, places=6)
        self.assertLess(res["errors"]["max_step_position_error"], 1e-10)
        self.assertLess(res["errors"]["max_step_velocity_error"], 1e-10)

    def test_rk4_stores_derivative_stages_k1_to_k4(self):
        params = SimulationInput(
            initial_velocity=30.0,
            launch_angle_deg=60.0,
            gravity=9.81,
            time_step=0.1,
            physics_model="ideal",
        )
        res = run_rk4_simulation(params)
        step0 = res["steps"][0]
        # k1 must be derivative [vx, vy, 0, -g], NOT h*derivative
        self.assertAlmostEqual(step0["k1"][0], 30.0 * math.cos(math.radians(60.0)), places=8)
        self.assertAlmostEqual(step0["k1"][1], 30.0 * math.sin(math.radians(60.0)), places=8)
        self.assertAlmostEqual(step0["k1"][2], 0.0, places=8)
        self.assertAlmostEqual(step0["k1"][3], -9.81, places=8)

    def test_quadratic_drag_reduces_range_and_height(self):
        ideal = run_rk4_simulation(
            SimulationInput(
                initial_velocity=40.0,
                launch_angle_deg=45.0,
                time_step=0.02,
                physics_model="ideal",
            )
        )
        drag = run_rk4_simulation(
            SimulationInput(
                initial_velocity=40.0,
                launch_angle_deg=45.0,
                time_step=0.02,
                physics_model="quadratic_drag",
                mass=0.25,
                air_density=1.225,
                drag_coefficient=0.47,
                cross_sectional_area=0.015,
            )
        )
        self.assertIsNone(drag["analytical"])
        self.assertLess(drag["summary"]["horizontal_range"], ideal["summary"]["horizontal_range"])
        self.assertLess(drag["summary"]["maximum_height"], ideal["summary"]["maximum_height"])

    def test_step_halving_convergence_fourth_order_on_drag(self):
        conv = run_convergence_analysis(
            SimulationInput(
                initial_velocity=45.0,
                launch_angle_deg=40.0,
                time_step=0.2,
                physics_model="quadratic_drag",
                mass=0.5,
                air_density=1.225,
                drag_coefficient=0.47,
                cross_sectional_area=0.02,
            )
        )
        self.assertEqual(conv["method"], "step_halving")
        self.assertEqual(len(conv["entries"]), 3)
        order = conv["entries"][1]["observed_order"]
        self.assertIsNotNone(order)
        self.assertGreater(order, 3.5)
        self.assertLess(order, 4.5)

    def test_destination_not_silently_forced(self):
        res = run_rk4_simulation(
            SimulationInput(
                initial_velocity=20.0,
                launch_angle_deg=45.0,
                time_step=0.02,
                physics_model="ideal",
                destination_distance=200.0,
                destination_tolerance=5.0,
            )
        )
        self.assertFalse(res["summary"]["destination_reached"])
        self.assertLess(res["summary"]["horizontal_range"], 50.0)

    def test_powered_rocket_increases_range_over_ballistic(self):
        ballistic = run_rk4_simulation(
            SimulationInput(
                initial_velocity=25.0,
                launch_angle_deg=50.0,
                time_step=0.02,
                physics_model="quadratic_drag",
                mass=2.0,
            )
        )
        rocket = run_rk4_simulation(
            SimulationInput(
                initial_velocity=25.0,
                launch_angle_deg=50.0,
                time_step=0.02,
                physics_model="powered_rocket",
                mass=2.0,
                dry_mass=1.2,
                thrust=60.0,
                burn_time=2.5,
            )
        )
        self.assertGreater(rocket["summary"]["horizontal_range"], ballistic["summary"]["horizontal_range"])

    def test_aircraft_lift_extends_flight(self):
        ballistic = run_rk4_simulation(
            SimulationInput(
                initial_velocity=35.0,
                launch_angle_deg=20.0,
                time_step=0.02,
                physics_model="quadratic_drag",
                mass=5.0,
                cross_sectional_area=0.08,
            )
        )
        aircraft = run_rk4_simulation(
            SimulationInput(
                initial_velocity=35.0,
                launch_angle_deg=20.0,
                time_step=0.02,
                physics_model="aircraft_flight",
                mass=5.0,
                cross_sectional_area=0.08,
                thrust=18.0,
                wing_area=0.45,
                lift_coefficient=0.65,
            )
        )
        self.assertGreater(aircraft["summary"]["flight_time"], ballistic["summary"]["flight_time"])

    def test_input_validation_rejects_invalid_angle_and_negative_velocity(self):
        with self.assertRaises(ValueError):
            run_rk4_simulation(SimulationInput(initial_velocity=-10.0, launch_angle_deg=45.0))
        with self.assertRaises(ValueError):
            run_rk4_simulation(SimulationInput(initial_velocity=10.0, launch_angle_deg=95.0))


if __name__ == "__main__":
    unittest.main()
