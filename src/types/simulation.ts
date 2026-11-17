export type ProjectileType = 'rocket' | 'airplane' | 'ball' | 'custom';

export type PhysicsModel =
  | 'ideal'
  | 'quadratic_drag'
  | 'powered_rocket'
  | 'aircraft_flight';

export type EnvironmentId =
  | 'modern_city'
  | 'rural_village'
  | 'countryside'
  | 'mountain'
  | 'open_field'
  | 'custom_env';

export type EnvironmentTime = 'day' | 'evening';
export type EnvironmentWeather = 'clear' | 'overcast' | 'windy';

export interface SimulationConfig {
  simulationName: string;
  projectileType: ProjectileType;
  physicsModel: PhysicsModel;
  sourceEnvironment: EnvironmentId;
  destinationEnvironment: EnvironmentId;
  environmentTime: EnvironmentTime;
  environmentWeather: EnvironmentWeather;
  initialVelocity: number;
  launchAngleDeg: number;
  gravity: number;
  timeStep: number;
  initialHeight: number;
  mass: number;
  airDensity: number;
  dragCoefficient: number;
  crossSectionalArea: number;
  thrust: number;
  burnTime: number;
  dryMass: number;
  liftCoefficient: number;
  wingArea: number;
  destinationDistance: number | null;
  destinationHeight: number;
  destinationTolerance: number;
}

export interface AnalyticalState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface RK4Step {
  iteration: number;
  t: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  k1: [number, number, number, number];
  k2: [number, number, number, number];
  k3: [number, number, number, number];
  k4: [number, number, number, number];
  next_state: [number, number, number, number];
  analytical?: AnalyticalState;
  position_error?: number;
  velocity_error?: number;
}

export interface ErrorPair {
  abs: number;
  pct: number | null;
}

export interface AnalyticalSummary {
  flight_time: number;
  maximum_height: number;
  horizontal_range: number;
  final_velocity: number;
}

export interface ErrorsSummary {
  flight_time: ErrorPair;
  maximum_height: ErrorPair;
  horizontal_range: ErrorPair;
  final_velocity: ErrorPair;
  max_step_position_error: number;
  max_step_velocity_error: number;
}

export interface SimulationSummary {
  flight_time: number;
  maximum_height: number;
  horizontal_range: number;
  initial_velocity: number;
  final_velocity: number;
  max_speed: number;
  step_count: number;
  crossed_ground: boolean;
  destination_distance: number | null;
  destination_height: number;
  destination_reached: boolean | null;
  destination_delta: number | null;
  y_at_destination: number | null;
}

export interface SimulationOutput {
  engine: string;
  physics_model: PhysicsModel;
  summary: SimulationSummary;
  landing_point: {
    t: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    speed: number;
  };
  analytical: AnalyticalSummary | null;
  errors: ErrorsSummary | null;
  steps: RK4Step[];
}

export interface ConvergenceEntry {
  h: number;
  steps: number;
  horizontal_range: number;
  maximum_height: number;
  flight_time: number;
  range_error: number;
  height_error: number;
  time_error: number;
  observed_order: number | null;
}

export interface ConvergenceOutput {
  physics_model: PhysicsModel;
  method: 'analytical_comparison' | 'step_halving';
  entries: ConvergenceEntry[];
}

export interface SavedSimulationRecord {
  id: string;
  uid: string;
  simulationName: string;
  projectileType: ProjectileType;
  physicsModel: PhysicsModel;
  sourceEnvironment: EnvironmentId;
  destinationEnvironment: EnvironmentId;
  environmentTime: EnvironmentTime;
  environmentWeather: EnvironmentWeather;
  initialVelocity: number;
  launchAngleDeg: number;
  gravity: number;
  timeStep: number;
  initialHeight: number;
  mass: number;
  airDensity: number;
  dragCoefficient: number;
  crossSectionalArea: number;
  thrust: number;
  burnTime: number;
  dryMass: number;
  liftCoefficient: number;
  wingArea: number;
  destinationDistance: number | null;
  destinationHeight: number;
  destinationTolerance: number;
  maximumHeight: number;
  flightTime: number;
  horizontalRange: number;
  finalVelocity: number;
  maxSpeed: number;
  stepCount: number;
  destinationReached: boolean | null;
  destinationDelta: number | null;
  yAtDestination: number | null;
  analyticalSummary: AnalyticalSummary | null;
  errorsSummary: ErrorsSummary | null;
  createdAt: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string | null;
  themePreference: 'dark' | 'light';
  audioEnabled: boolean;
  audioVolume: number;
  createdAt: string;
}

export type SolverMethod = 'rk4' | 'euler' | 'modified_euler';

export interface AnalyzedSimulationEntry {
  id: string;
  title: string;
  source: 'simulator' | 'saved';
  solverMethod: SolverMethod;
  config: SimulationConfig;
  output: SimulationOutput | null;
  savedId?: string | null;
  createdAt: string;
}

export type AppPage =
  | 'home'
  | 'new-simulation'
  | 'history'
  | 'analytics'
  | 'learn-rk4'
  | 'profile'
  | 'settings';
