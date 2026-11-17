import {
  EnvironmentId,
  PhysicsModel,
  ProjectileType,
  SimulationConfig,
} from '../types/simulation';

export interface ProjectileOption {
  id: ProjectileType;
  name: string;
  subtitle: string;
  description: string;
  defaultMass: number;
  defaultCd: number;
  defaultArea: number;
  recommendedModel: PhysicsModel;
}

export const PROJECTILE_OPTIONS: ProjectileOption[] = [
  {
    id: 'ball',
    name: 'Ballistic Sphere',
    subtitle: 'Standard sports or calibration sphere',
    description:
      'Symmetric spherical body suited for comparing ideal vacuum trajectories against quadratic aerodynamic drag.',
    defaultMass: 0.45,
    defaultCd: 0.47,
    defaultArea: 0.038,
    recommendedModel: 'ideal',
  },
  {
    id: 'rocket',
    name: 'Sounding Rocket',
    subtitle: 'Finned cylindrical launch vehicle',
    description:
      'Slender nose-coned body with stabilizing fins. Can be visualized under ballistic equations or simulated with powered thrust & propellant burn.',
    defaultMass: 4.5,
    defaultCd: 0.28,
    defaultArea: 0.018,
    recommendedModel: 'powered_rocket',
  },
  {
    id: 'airplane',
    name: 'Research Glider / UAV',
    subtitle: 'Fixed-wing aerodynamic airframe',
    description:
      'Swept-wing airframe supporting optional aerodynamic lift, thrust, and drag modeling—or pure ballistic visualization.',
    defaultMass: 6.0,
    defaultCd: 0.14,
    defaultArea: 0.06,
    recommendedModel: 'aircraft_flight',
  },
  {
    id: 'custom',
    name: 'Custom Projectile',
    subtitle: 'User-defined probe or test mass',
    description:
      'Finned telemetry dart with fully customizable mass, drag coefficient, cross-sectional area, and optional propulsion.',
    defaultMass: 1.5,
    defaultCd: 0.35,
    defaultArea: 0.02,
    recommendedModel: 'quadratic_drag',
  },
];

export interface PhysicsModelOption {
  id: PhysicsModel;
  code: string;
  name: string;
  shortLabel: string;
  description: string;
  assumptions: string[];
  equationsLatex: string[];
}

export const PHYSICS_MODELS: PhysicsModelOption[] = [
  {
    id: 'ideal',
    code: 'Model A',
    name: 'Ideal Projectile (No Air Resistance)',
    shortLabel: 'Ideal Ballistic',
    description:
      'Classical point-mass motion under uniform gravity with zero aerodynamic drag. Provides an exact analytical reference solution for RK4 error validation.',
    assumptions: [
      'Uniform gravitational acceleration g acting downward (-y)',
      'Zero air resistance (c = 0) and zero wind shear',
      'Point-mass dynamics regardless of selected 3D object mesh',
    ],
    equationsLatex: [
      String.raw`\frac{dx}{dt} = v_x, \quad \frac{dy}{dt} = v_y`,
      String.raw`\frac{dv_x}{dt} = 0, \quad \frac{dv_y}{dt} = -g`,
    ],
  },
  {
    id: 'quadratic_drag',
    code: 'Model B',
    name: 'Quadratic Air Resistance',
    shortLabel: 'Quadratic Drag',
    description:
      'Nonlinear aerodynamic drag proportional to speed squared, coupling horizontal and vertical velocity components. Accuracy is evaluated via step-halving convergence.',
    assumptions: [
      'Constant air density rho, drag coefficient Cd, and cross-sectional area A',
      'Drag force opposes instantaneous velocity vector with c = rho * Cd * A / (2m)',
      'No simple closed-form analytical trajectory exists; uses h, h/2, h/4 convergence',
    ],
    equationsLatex: [
      String.raw`v = \sqrt{v_x^2 + v_y^2}, \quad c = \frac{\rho C_d A}{2m}`,
      String.raw`\frac{dv_x}{dt} = -c v v_x, \quad \frac{dv_y}{dt} = -g - c v v_y`,
    ],
  },
  {
    id: 'powered_rocket',
    code: 'Model C',
    name: 'Powered Rocket Flight (Optional Extension)',
    shortLabel: 'Powered Rocket',
    description:
      'Extends quadratic drag with finite-burn thrust along the velocity vector and linear propellant mass depletion from initial mass m0 down to dry mass.',
    assumptions: [
      'Constant thrust T applied tangential to velocity for 0 <= t <= t_burn',
      'Linear mass depletion m(t) = max(m_dry, m0 - m_dot * t)',
      'Unpowered ballistic coasting with quadratic drag after burnout',
    ],
    equationsLatex: [
      String.raw`\frac{dv_x}{dt} = \frac{T(t)}{m(t)}\frac{v_x}{v} - \frac{\rho C_d A}{2m(t)} v v_x`,
      String.raw`\frac{dv_y}{dt} = -g + \frac{T(t)}{m(t)}\frac{v_y}{v} - \frac{\rho C_d A}{2m(t)} v v_y`,
    ],
  },
  {
    id: 'aircraft_flight',
    code: 'Model D',
    name: 'Aerodynamic Aircraft Flight (Optional Extension)',
    shortLabel: 'Aircraft Flight',
    description:
      '2D point-mass flight model combining axial engine thrust, aerodynamic lift perpendicular to velocity, parasitic drag, and gravity.',
    assumptions: [
      'Lift L = 0.5 * rho * v^2 * S_wing * Cl acts perpendicular to velocity (-vy/v, vx/v)',
      'Drag D = 0.5 * rho * v^2 * A * Cd opposes velocity',
      'Constant thrust T aligned with flight path',
    ],
    equationsLatex: [
      String.raw`\frac{dv_x}{dt} = \frac{(T - D)v_x - L v_y}{m v}`,
      String.raw`\frac{dv_y}{dt} = -g + \frac{(T - D)v_y + L v_x}{m v}`,
    ],
  },
];

export interface EnvironmentOption {
  id: EnvironmentId;
  name: string;
  description: string;
  accentHex: string;
  groundColor: string;
}

export const ENVIRONMENT_OPTIONS: EnvironmentOption[] = [
  {
    id: 'modern_city',
    name: 'Modern City',
    description: 'Urban test corridor with glass-and-concrete skyline towers and paved launch apron.',
    accentHex: '#38bdf8',
    groundColor: '#1e293b',
  },
  {
    id: 'rural_village',
    name: 'Rural Village',
    description: 'Low-rise timber dwellings, stone boundary walls, and gravel range markers.',
    accentHex: '#f59e0b',
    groundColor: '#475569',
  },
  {
    id: 'countryside',
    name: 'Countryside',
    description: 'Rolling meadow terrain with scattered windbreak trees and wooden range posts.',
    accentHex: '#22c55e',
    groundColor: '#365314',
  },
  {
    id: 'mountain',
    name: 'Mountain Landscape',
    description: 'High-relief alpine ridgelines surrounding a flat valley telemetry floor.',
    accentHex: '#818cf8',
    groundColor: '#334155',
  },
  {
    id: 'open_field',
    name: 'Open Field',
    description: 'Unobstructed instrumented proving ground with calibrated metric range grid.',
    accentHex: '#06b6d4',
    groundColor: '#1e3a2f',
  },
  {
    id: 'custom_env',
    name: 'Custom Grid Range',
    description: 'High-contrast blueprint CAD grid chamber for pure trajectory geometry inspection.',
    accentHex: '#0ea5e9',
    groundColor: '#0f172a',
  },
];

export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  simulationName: 'Ideal 45° Validation Run',
  projectileType: 'ball',
  physicsModel: 'ideal',
  sourceEnvironment: 'open_field',
  destinationEnvironment: 'open_field',
  environmentTime: 'day',
  environmentWeather: 'clear',
  initialVelocity: 50,
  launchAngleDeg: 45,
  gravity: 9.81,
  timeStep: 0.05,
  initialHeight: 0,
  mass: 0.45,
  airDensity: 1.225,
  dragCoefficient: 0.47,
  crossSectionalArea: 0.038,
  thrust: 110,
  burnTime: 2.5,
  dryMass: 2.8,
  liftCoefficient: 0.42,
  wingArea: 0.22,
  destinationDistance: 254.8,
  destinationHeight: 0,
  destinationTolerance: 5,
};

export interface SimulationPreset {
  id: string;
  label: string;
  description: string;
  patch: Partial<SimulationConfig>;
}

export const SIMULATION_PRESETS: SimulationPreset[] = [
  {
    id: 'ideal_45',
    label: '45° Ideal Benchmark',
    description: 'v0 = 50 m/s, theta = 45°, g = 9.81 m/s², h = 0.05 s (Exact analytical match)',
    patch: {
      simulationName: 'Ideal 45° Validation Run',
      projectileType: 'ball',
      physicsModel: 'ideal',
      initialVelocity: 50,
      launchAngleDeg: 45,
      gravity: 9.81,
      timeStep: 0.05,
      initialHeight: 0,
      destinationDistance: 254.84,
      destinationHeight: 0,
    },
  },
  {
    id: 'drag_sphere',
    label: 'Quadratic Drag Sphere',
    description: 'v0 = 55 m/s, m = 0.45 kg, Cd = 0.47, rho = 1.225 kg/m³',
    patch: {
      simulationName: 'Quadratic Drag Sphere Study',
      projectileType: 'ball',
      physicsModel: 'quadratic_drag',
      initialVelocity: 55,
      launchAngleDeg: 42,
      gravity: 9.81,
      timeStep: 0.05,
      initialHeight: 0,
      mass: 0.45,
      airDensity: 1.225,
      dragCoefficient: 0.47,
      crossSectionalArea: 0.038,
      destinationDistance: 65,
      destinationHeight: 0,
    },
  },
  {
    id: 'sounding_rocket',
    label: 'Powered Rocket Ascent',
    description: 'Thrust = 140 N, Burn = 2.5 s, Mass 4.5 -> 2.8 kg',
    patch: {
      simulationName: 'Sounding Rocket Burn Profile',
      projectileType: 'rocket',
      physicsModel: 'powered_rocket',
      initialVelocity: 18,
      launchAngleDeg: 65,
      gravity: 9.81,
      timeStep: 0.05,
      initialHeight: 0,
      mass: 4.5,
      dryMass: 2.8,
      thrust: 140,
      burnTime: 2.5,
      dragCoefficient: 0.28,
      crossSectionalArea: 0.018,
      destinationDistance: 420,
      destinationHeight: 0,
    },
  },
  {
    id: 'aircraft_climb',
    label: 'Aerodynamic UAV Glide',
    description: 'Lift Cl = 0.38, Wing S = 0.18 m², Thrust = 5.5 N',
    patch: {
      simulationName: 'UAV Aerodynamic Trajectory',
      projectileType: 'airplane',
      physicsModel: 'aircraft_flight',
      sourceEnvironment: 'modern_city',
      destinationEnvironment: 'modern_city',
      environmentTime: 'evening',
      initialVelocity: 32,
      launchAngleDeg: 22,
      gravity: 9.81,
      timeStep: 0.05,
      initialHeight: 15,
      mass: 6.0,
      thrust: 5.5,
      liftCoefficient: 0.38,
      wingArea: 0.18,
      dragCoefficient: 0.1,
      crossSectionalArea: 0.05,
      destinationDistance: 212,
      destinationHeight: 0,
    },
  },
];
