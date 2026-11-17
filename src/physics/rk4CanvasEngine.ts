import { RK4Step, SimulationConfig, SimulationOutput, SolverMethod } from '../types/simulation';

/**
 * State vector Y = [x, y, vx, vy] for 2D projectile motion.
 */
export interface PhysicsState {
  t: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface CanvasSimulationParams {
  v0: number; // Launch speed (0 - 10000 m/s)
  angleDeg: number; // Launch angle (0 - 90 deg)
  y0: number; // Launch height (0 - 500 m)
  gravity: number; // Gravitational acceleration (> 0 m/s^2)
  dragEnabled: boolean; // Toggle quadratic aerodynamic drag
  dragCoefficient: number; // Cd (0 - 2.0)
  airDensity: number; // kg/m^3 (default 1.225)
  crossSectionalArea: number; // m^2 (default 0.038)
  mass: number; // kg (default 0.45)
  windSpeed?: number; // m/s horizontal wind (+ tailwind, - headwind)
}

export interface AnalyticalBenchmark {
  flightTime: number;
  maxHeight: number;
  horizontalRange: number;
  finalVelocity: number;
  peakX: number;
  samplePoints: { x: number; y: number }[];
}

export interface TrajectoryComputation {
  steps: RK4Step[];
  points: PhysicsState[];
  peakPoint: PhysicsState;
  landingPoint: PhysicsState;
  analytical: AnalyticalBenchmark;
  dtUsed: number;
}

export interface EnergyBreakdown {
  kinetic: number;
  potential: number;
  totalMechanical: number;
  initialTotal: number;
  thermalLoss: number;
  kineticPct: number;
  potentialPct: number;
  totalPct: number;
}

export interface ComparisonTrajectoryItem {
  id: string;
  label: string;
  color: string;
  angleDeg?: number;
  gravity?: number;
  trajectory: TrajectoryComputation;
}

export const GRAVITY_PRESETS = [
  { id: 'earth', name: 'Earth', g: 9.81 },
  { id: 'moon', name: 'Moon', g: 1.62 },
  { id: 'mars', name: 'Mars', g: 3.71 },
  { id: 'jupiter', name: 'Jupiter', g: 24.79 },
] as const;

/**
 * Computes quadratic aerodynamic drag factor c = (rho * Cd * A) / (2 * m).
 */
export function computeDragFactor(params: CanvasSimulationParams): number {
  if (!params.dragEnabled || params.dragCoefficient <= 0 || params.mass <= 0) {
    return 0;
  }
  return (
    (Math.max(0, params.airDensity) *
      Math.max(0, params.dragCoefficient) *
      Math.max(0, params.crossSectionalArea)) /
    (2 * Math.max(0.01, params.mass))
  );
}

/**
 * Evaluates derivative vector f(t, Y) = [dx/dt, dy/dt, dvx/dt, dvy/dt].
 */
export function evaluateDerivative(
  state: [number, number, number, number],
  gravity: number,
  dragFactor: number,
  windSpeed = 0,
): [number, number, number, number] {
  const [, , vx, vy] = state;
  if (dragFactor <= 0) {
    return [vx, vy, 0, -gravity];
  }
  const relVx = vx - windSpeed;
  const relSpeed = Math.hypot(relVx, vy);
  return [vx, vy, -dragFactor * relSpeed * relVx, -gravity - dragFactor * relSpeed * vy];
}

/**
 * Advances [x, y, vx, vy] by one Classical Fourth-Order Runge-Kutta (RK4) step of size h.
 */
export function rk4StepVector(
  yVec: [number, number, number, number],
  h: number,
  gravity: number,
  dragFactor: number,
  windSpeed = 0,
): {
  next: [number, number, number, number];
  k1: [number, number, number, number];
  k2: [number, number, number, number];
  k3: [number, number, number, number];
  k4: [number, number, number, number];
} {
  const k1 = evaluateDerivative(yVec, gravity, dragFactor, windSpeed);
  const s2: [number, number, number, number] = [
    yVec[0] + 0.5 * h * k1[0],
    yVec[1] + 0.5 * h * k1[1],
    yVec[2] + 0.5 * h * k1[2],
    yVec[3] + 0.5 * h * k1[3],
  ];
  const k2 = evaluateDerivative(s2, gravity, dragFactor, windSpeed);
  const s3: [number, number, number, number] = [
    yVec[0] + 0.5 * h * k2[0],
    yVec[1] + 0.5 * h * k2[1],
    yVec[2] + 0.5 * h * k2[2],
    yVec[3] + 0.5 * h * k2[3],
  ];
  const k3 = evaluateDerivative(s3, gravity, dragFactor, windSpeed);
  const s4: [number, number, number, number] = [
    yVec[0] + h * k3[0],
    yVec[1] + h * k3[1],
    yVec[2] + h * k3[2],
    yVec[3] + h * k3[3],
  ];
  const k4 = evaluateDerivative(s4, gravity, dragFactor, windSpeed);

  const next: [number, number, number, number] = [
    yVec[0] + (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
    yVec[1] + (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
    yVec[2] + (h / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]),
    yVec[3] + (h / 6) * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]),
  ];

  return { next, k1, k2, k3, k4 };
}

/**
 * Advances [x, y, vx, vy] by one Forward Euler step of size h (Order O(h)).
 */
export function eulerStepVector(
  yVec: [number, number, number, number],
  h: number,
  gravity: number,
  dragFactor: number,
  windSpeed = 0,
): {
  next: [number, number, number, number];
  k1: [number, number, number, number];
  k2: [number, number, number, number];
  k3: [number, number, number, number];
  k4: [number, number, number, number];
} {
  const k1 = evaluateDerivative(yVec, gravity, dragFactor, windSpeed);
  const next: [number, number, number, number] = [
    yVec[0] + h * k1[0],
    yVec[1] + h * k1[1],
    yVec[2] + h * k1[2],
    yVec[3] + h * k1[3],
  ];
  const zero: [number, number, number, number] = [0, 0, 0, 0];
  return { next, k1, k2: zero, k3: zero, k4: zero };
}

/**
 * Advances [x, y, vx, vy] by one Modified Euler / Heun step of size h (Order O(h^2)).
 */
export function modifiedEulerStepVector(
  yVec: [number, number, number, number],
  h: number,
  gravity: number,
  dragFactor: number,
  windSpeed = 0,
): {
  next: [number, number, number, number];
  k1: [number, number, number, number];
  k2: [number, number, number, number];
  k3: [number, number, number, number];
  k4: [number, number, number, number];
} {
  const k1 = evaluateDerivative(yVec, gravity, dragFactor, windSpeed);
  const predictor: [number, number, number, number] = [
    yVec[0] + h * k1[0],
    yVec[1] + h * k1[1],
    yVec[2] + h * k1[2],
    yVec[3] + h * k1[3],
  ];
  const k2 = evaluateDerivative(predictor, gravity, dragFactor, windSpeed);
  const next: [number, number, number, number] = [
    yVec[0] + 0.5 * h * (k1[0] + k2[0]),
    yVec[1] + 0.5 * h * (k1[1] + k2[1]),
    yVec[2] + 0.5 * h * (k1[2] + k2[2]),
    yVec[3] + 0.5 * h * (k1[3] + k2[3]),
  ];
  const zero: [number, number, number, number] = [0, 0, 0, 0];
  return { next, k1, k2, k3: zero, k4: zero };
}

/**
 * Closed-form vacuum (no-drag) analytical solution supporting elevated launch height y0 >= 0.
 */
export function computeNoDragAnalytical(params: CanvasSimulationParams): AnalyticalBenchmark {
  const g = Math.max(0.01, params.gravity);
  const v0 = Math.max(0, params.v0);
  const y0 = Math.max(0, params.y0);
  const theta = (Math.max(0, Math.min(90, params.angleDeg)) * Math.PI) / 180;
  const vx0 = v0 * Math.cos(theta);
  const vy0 = v0 * Math.sin(theta);

  // Flight time solves y0 + vy0*t - 0.5*g*t^2 = 0
  const discriminant = vy0 * vy0 + 2 * g * y0;
  const flightTime = v0 === 0 && y0 === 0 ? 0 : (vy0 + Math.sqrt(Math.max(0, discriminant))) / g;
  const tPeak = vy0 > 0 ? vy0 / g : 0;
  const maxHeight = y0 + (vy0 > 0 ? (vy0 * vy0) / (2 * g) : 0);
  const peakX = vx0 * tPeak;
  const horizontalRange = vx0 * flightTime;
  const vyFinal = vy0 - g * flightTime;
  const finalVelocity = Math.hypot(vx0, vyFinal);

  const samplePoints: { x: number; y: number }[] = [];
  const sampleCount = 80;
  for (let i = 0; i <= sampleCount; i += 1) {
    const t = (flightTime * i) / sampleCount;
    samplePoints.push({
      x: vx0 * t,
      y: Math.max(0, y0 + vy0 * t - 0.5 * g * t * t),
    });
  }

  return {
    flightTime,
    maxHeight,
    horizontalRange,
    finalVelocity,
    peakX,
    samplePoints,
  };
}

/**
 * Computes full numerical trajectory using the specified ODE solver ('rk4' | 'euler' | 'modified_euler').
 * Uses linear ground-crossing interpolation and parabolic apex refinement.
 */
export function computeTrajectoryWithMethod(
  params: CanvasSimulationParams,
  preferredDt = 0.02,
  method: SolverMethod = 'rk4',
): TrajectoryComputation {
  const g = Math.max(0.01, params.gravity);
  const v0 = Math.max(0, params.v0);
  const y0 = Math.max(0, params.y0);
  const theta = (Math.max(0, Math.min(90, params.angleDeg)) * Math.PI) / 180;
  const wind = params.dragEnabled ? (params.windSpeed ?? 0) : 0;

  const analytical = computeNoDragAnalytical(params);
  const dragFactor = computeDragFactor(params);

  const estTime = Math.max(0.5, analytical.flightTime || 1);
  const maxSteps = 3200;
  const dt = Math.max(preferredDt, estTime / maxSteps);

  let state: [number, number, number, number] = [0, y0, v0 * Math.cos(theta), v0 * Math.sin(theta)];
  let t = 0;

  const points: PhysicsState[] = [
    { t: 0, x: state[0], y: state[1], vx: state[2], vy: state[3] },
  ];
  const steps: RK4Step[] = [];
  let peakPoint: PhysicsState = { ...points[0] };

  if (v0 === 0 && y0 === 0) {
    return {
      steps: [],
      points,
      peakPoint,
      landingPoint: points[0],
      analytical,
      dtUsed: dt,
    };
  }

  for (let iter = 0; iter < 5000; iter += 1) {
    const { next, k1, k2, k3, k4 } =
      method === 'euler'
        ? eulerStepVector(state, dt, g, dragFactor, wind)
        : method === 'modified_euler'
          ? modifiedEulerStepVector(state, dt, g, dragFactor, wind)
          : rk4StepVector(state, dt, g, dragFactor, wind);
    const nextT = t + dt;

    const currentPoint: PhysicsState = {
      t,
      x: state[0],
      y: state[1],
      vx: state[2],
      vy: state[3],
    };

    const anaX = v0 * Math.cos(theta) * t;
    const anaY = y0 + v0 * Math.sin(theta) * t - 0.5 * g * t * t;
    const anaVx = v0 * Math.cos(theta);
    const anaVy = v0 * Math.sin(theta) - g * t;

    const stepObj: RK4Step = {
      iteration: iter,
      t,
      x: state[0],
      y: state[1],
      vx: state[2],
      vy: state[3],
      speed: Math.hypot(state[2], state[3]),
      k1,
      k2,
      k3,
      k4,
      next_state: next,
    };

    if (!params.dragEnabled) {
      stepObj.analytical = { x: anaX, y: Math.max(0, anaY), vx: anaVx, vy: anaVy };
      stepObj.position_error = Math.hypot(state[0] - anaX, state[1] - anaY);
      stepObj.velocity_error = Math.hypot(state[2] - anaVx, state[3] - anaVy);
    }

    steps.push(stepObj);

    if (currentPoint.y > peakPoint.y) {
      peakPoint = { ...currentPoint };
    }

    // Refine peak with parabolic interpolation when vy changes from + to -
    if (state[3] >= 0 && next[3] < 0) {
      const frac = state[3] / Math.max(1e-9, state[3] - next[3]);
      const tApex = t + frac * dt;
      const apexY = Math.max(
        peakPoint.y,
        state[1] + frac * (next[1] - state[1]) + 0.125 * dt * (state[3] - next[3]),
      );
      const apexX = state[0] + frac * (next[0] - state[0]);
      if (apexY >= peakPoint.y) {
        peakPoint = {
          t: tApex,
          x: apexX,
          y: apexY,
          vx: state[2] + frac * (next[2] - state[2]),
          vy: 0,
        };
      }
    }

    // Detect ground crossing y <= 0 after launch
    if (next[1] <= 0 && (iter > 0 || y0 > 0 || state[3] >= 0)) {
      const denom = state[1] - next[1];
      const frac = denom > 1e-12 ? Math.max(0, Math.min(1, state[1] / denom)) : 1;
      let landingPoint: PhysicsState = {
        t: t + frac * dt,
        x: state[0] + frac * (next[0] - state[0]),
        y: 0,
        vx: state[2] + frac * (next[2] - state[2]),
        vy: state[3] + frac * (next[3] - state[3]),
      };

      if (method === 'rk4' && state[1] >= 0) {
        let subDt = frac * dt;
        for (let nr = 0; nr < 3; nr += 1) {
          const probe = rk4StepVector(state, subDt, g, dragFactor, wind).next;
          if (Math.abs(probe[1]) < 1e-12) {
            landingPoint = {
              t: t + subDt,
              x: probe[0],
              y: 0,
              vx: probe[2],
              vy: probe[3],
            };
            break;
          }
          const slopeY = Math.abs(probe[3]) > 1e-6 ? probe[3] : -1e-6;
          subDt = Math.max(0, Math.min(dt, subDt - probe[1] / slopeY));
          const refined = rk4StepVector(state, subDt, g, dragFactor, wind).next;
          landingPoint = {
            t: t + subDt,
            x: refined[0],
            y: 0,
            vx: refined[2],
            vy: refined[3],
          };
        }
      }

      points.push(landingPoint);
      return {
        steps,
        points,
        peakPoint,
        landingPoint,
        analytical,
        dtUsed: dt,
      };
    }

    state = next;
    t = nextT;
    points.push({
      t,
      x: state[0],
      y: state[1],
      vx: state[2],
      vy: state[3],
    });
  }

  const last = points[points.length - 1];
  return {
    steps,
    points,
    peakPoint,
    landingPoint: last,
    analytical,
    dtUsed: dt,
  };
}

/**
 * Computes full RK4 trajectory with linear ground-crossing interpolation.
 */
export function computeRk4Trajectory(
  params: CanvasSimulationParams,
  preferredDt = 0.02,
): TrajectoryComputation {
  return computeTrajectoryWithMethod(params, preferredDt, 'rk4');
}

/**
 * Smoothly interpolates position & velocity along precomputed RK4 points at playback time t.
 */
export function interpolateTrajectoryAtTime(
  points: PhysicsState[],
  t: number,
): PhysicsState {
  if (points.length === 0) {
    return { t: 0, x: 0, y: 0, vx: 0, vy: 0 };
  }
  if (t <= points[0].t) return points[0];
  const last = points[points.length - 1];
  if (t >= last.t) return last;

  let lo = 0;
  let hi = points.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t <= t) lo = mid;
    else hi = mid;
  }

  const p0 = points[lo];
  const p1 = points[hi];
  const span = p1.t - p0.t;
  const f = span > 1e-9 ? (t - p0.t) / span : 0;

  return {
    t,
    x: p0.x + f * (p1.x - p0.x),
    y: Math.max(0, p0.y + f * (p1.y - p0.y)),
    vx: p0.vx + f * (p1.vx - p0.vx),
    vy: p0.vy + f * (p1.vy - p0.vy),
  };
}

/**
 * Computes instantaneous Kinetic, Potential, and Total Mechanical Energy.
 */
export function computeEnergyBreakdown(
  state: PhysicsState,
  params: CanvasSimulationParams,
): EnergyBreakdown {
  const m = Math.max(0.01, params.mass);
  const g = Math.max(0.01, params.gravity);
  const speedSq = state.vx * state.vx + state.vy * state.vy;
  const kinetic = 0.5 * m * speedSq;
  const potential = m * g * Math.max(0, state.y);
  const totalMechanical = kinetic + potential;
  const initialTotal = Math.max(1e-6, 0.5 * m * params.v0 * params.v0 + m * g * Math.max(0, params.y0));
  const thermalLoss = Math.max(0, initialTotal - totalMechanical);

  return {
    kinetic,
    potential,
    totalMechanical,
    initialTotal,
    thermalLoss,
    kineticPct: Math.min(100, Math.max(0, (kinetic / initialTotal) * 100)),
    potentialPct: Math.min(100, Math.max(0, (potential / initialTotal) * 100)),
    totalPct: Math.min(100, Math.max(0, (totalMechanical / initialTotal) * 100)),
  };
}

/**
 * Computes 30°, 45°, and 60° trajectories for Angle Comparison Mode.
 */
export function computeAngleComparisonSet(
  baseParams: CanvasSimulationParams,
): ComparisonTrajectoryItem[] {
  const angles: { deg: number; color: string; label: string }[] = [
    { deg: 30, color: '#38bdf8', label: '30° Low Arc' },
    { deg: 45, color: '#facc15', label: '45° Max Range' },
    { deg: 60, color: '#22c55e', label: '60° High Arc' },
  ];
  return angles.map((a) => ({
    id: `angle_${a.deg}`,
    label: a.label,
    color: a.color,
    angleDeg: a.deg,
    trajectory: computeRk4Trajectory({ ...baseParams, angleDeg: a.deg }, 0.025),
  }));
}

/**
 * Computes Earth (9.81), Moon (1.62), and Mars (3.71) trajectories for 3-Lane Gravity Comparison Mode.
 */
export function computeGravityComparisonSet(
  baseParams: CanvasSimulationParams,
): ComparisonTrajectoryItem[] {
  const planets: { id: string; label: string; g: number; color: string }[] = [
    { id: 'earth', label: 'Earth (g = 9.81 m/s²)', g: 9.81, color: '#38bdf8' },
    { id: 'moon', label: 'Moon (g = 1.62 m/s²)', g: 1.62, color: '#22c55e' },
    { id: 'mars', label: 'Mars (g = 3.71 m/s²)', g: 3.71, color: '#facc15' },
  ];
  return planets.map((p) => ({
    id: `grav_${p.id}`,
    label: p.label,
    color: p.color,
    gravity: p.g,
    trajectory: computeRk4Trajectory({ ...baseParams, gravity: p.g }, 0.025),
  }));
}

/**
 * Converts a live HTML5 Canvas RK4 computation into a SimulationOutput compatible with
 * ResultDashboard, ScientificCharts, Rk4IterationExplorer, SQLite, and Firestore.
 */
export function buildSimulationOutputFromTrajectory(
  config: SimulationConfig,
  traj: TrajectoryComputation,
  solverMethod: SolverMethod = 'rk4',
): SimulationOutput {
  const { steps, peakPoint, landingPoint, analytical } = traj;
  const finalSpeed = Math.hypot(landingPoint.vx, landingPoint.vy);
  let maxSpeed = Math.hypot(
    config.initialVelocity * Math.cos((config.launchAngleDeg * Math.PI) / 180),
    config.initialVelocity * Math.sin((config.launchAngleDeg * Math.PI) / 180),
  );
  for (const s of steps) {
    if (s.speed > maxSpeed) maxSpeed = s.speed;
  }
  if (finalSpeed > maxSpeed) maxSpeed = finalSpeed;

  const destDist = config.destinationDistance;
  let destReached: boolean | null = null;
  let destDelta: number | null = null;
  let yAtDest: number | null = null;
  if (destDist !== null && destDist > 0) {
    destDelta = landingPoint.x - destDist;
    destReached = Math.abs(destDelta) <= config.destinationTolerance;
    yAtDest = 0;
  }

  const isIdeal = config.physicsModel === 'ideal';
  const engineLabel =
    solverMethod === 'euler'
      ? 'euler-canvas'
      : solverMethod === 'modified_euler'
        ? 'modified-euler-canvas'
        : 'rk4-canvas';

  return {
    engine: engineLabel,
    physics_model: config.physicsModel,
    summary: {
      flight_time: landingPoint.t,
      maximum_height: peakPoint.y,
      horizontal_range: landingPoint.x,
      initial_velocity: config.initialVelocity,
      final_velocity: finalSpeed,
      max_speed: maxSpeed,
      step_count: Math.max(1, steps.length),
      crossed_ground: true,
      destination_distance: destDist,
      destination_height: config.destinationHeight,
      destination_reached: destReached,
      destination_delta: destDelta,
      y_at_destination: yAtDest,
    },
    landing_point: {
      t: landingPoint.t,
      x: landingPoint.x,
      y: 0,
      vx: landingPoint.vx,
      vy: landingPoint.vy,
      speed: finalSpeed,
    },
    analytical: isIdeal
      ? {
          flight_time: analytical.flightTime,
          maximum_height: analytical.maxHeight,
          horizontal_range: analytical.horizontalRange,
          final_velocity: analytical.finalVelocity,
        }
      : null,
    errors: isIdeal
      ? {
          flight_time: {
            abs: Math.abs(landingPoint.t - analytical.flightTime),
            pct:
              analytical.flightTime > 0
                ? (Math.abs(landingPoint.t - analytical.flightTime) / analytical.flightTime) * 100
                : null,
          },
          maximum_height: {
            abs: Math.abs(peakPoint.y - analytical.maxHeight),
            pct:
              analytical.maxHeight > 0
                ? (Math.abs(peakPoint.y - analytical.maxHeight) / analytical.maxHeight) * 100
                : null,
          },
          horizontal_range: {
            abs: Math.abs(landingPoint.x - analytical.horizontalRange),
            pct:
              analytical.horizontalRange > 0
                ? (Math.abs(landingPoint.x - analytical.horizontalRange) /
                    analytical.horizontalRange) *
                  100
                : null,
          },
          final_velocity: {
            abs: Math.abs(finalSpeed - analytical.finalVelocity),
            pct:
              analytical.finalVelocity > 0
                ? (Math.abs(finalSpeed - analytical.finalVelocity) / analytical.finalVelocity) * 100
                : null,
          },
          max_step_position_error: steps.reduce((m, s) => Math.max(m, s.position_error ?? 0), 0),
          max_step_velocity_error: steps.reduce((m, s) => Math.max(m, s.velocity_error ?? 0), 0),
        }
      : null,
    steps,
  };
}

export interface MethodComparisonRow {
  method: SolverMethod;
  label: string;
  orderLabel: string;
  flightTime: number;
  maxHeight: number;
  horizontalRange: number;
  finalVelocity: number;
  rangeAbsError: number;
  rangePctError: number | null;
  heightAbsError: number;
  heightPctError: number | null;
  timeAbsError: number;
  timePctError: number | null;
  trajectory: TrajectoryComputation;
}

export interface MultiMethodComparisonReport {
  referenceSource: 'analytical' | 'fine_rk4';
  referenceFlightTime: number;
  referenceMaxHeight: number;
  referenceHorizontalRange: number;
  referenceFinalVelocity: number;
  methods: MethodComparisonRow[];
}

export function configToCanvasParams(
  config: SimulationConfig,
  forceDrag?: boolean,
): CanvasSimulationParams {
  return {
    v0: Math.max(0.01, Math.min(10000, config.initialVelocity)),
    angleDeg: Math.max(0.1, Math.min(89.9, config.launchAngleDeg)),
    y0: Math.max(0, Math.min(500, config.initialHeight)),
    gravity: Math.max(0.1, config.gravity),
    dragEnabled: forceDrag !== undefined ? forceDrag : config.physicsModel !== 'ideal',
    dragCoefficient: config.dragCoefficient,
    airDensity: config.airDensity,
    crossSectionalArea: config.crossSectionalArea,
    mass: config.mass,
    windSpeed: 0,
  };
}

/**
 * Compares RK4, Modified Euler, and Euler methods on the exact same simulation config.
 */
export function computeMethodComparisonSummary(
  config: SimulationConfig,
): MultiMethodComparisonReport {
  const params = configToCanvasParams(config);
  const h = Math.max(0.002, Math.min(0.5, config.timeStep || 0.05));
  const isIdeal = !params.dragEnabled;

  const rk4Traj = computeTrajectoryWithMethod(params, h, 'rk4');
  const modEulerTraj = computeTrajectoryWithMethod(params, h, 'modified_euler');
  const eulerTraj = computeTrajectoryWithMethod(params, h, 'euler');

  let refT = rk4Traj.analytical.flightTime;
  let refH = rk4Traj.analytical.maxHeight;
  let refR = rk4Traj.analytical.horizontalRange;
  let refV = rk4Traj.analytical.finalVelocity;

  if (!isIdeal) {
    const fineDt = Math.max(0.001, Math.min(0.0025, h / 8));
    const fineRef = computeTrajectoryWithMethod(params, fineDt, 'rk4');
    refT = fineRef.landingPoint.t;
    refH = fineRef.peakPoint.y;
    refR = fineRef.landingPoint.x;
    refV = Math.hypot(fineRef.landingPoint.vx, fineRef.landingPoint.vy);
  }

  const defs: { method: SolverMethod; label: string; orderLabel: string; traj: TrajectoryComputation }[] = [
    { method: 'rk4', label: 'RK4 (Runge-Kutta 4th)', orderLabel: 'O(h⁴)', traj: rk4Traj },
    { method: 'modified_euler', label: 'Modified Euler (Heun)', orderLabel: 'O(h²)', traj: modEulerTraj },
    { method: 'euler', label: 'Forward Euler', orderLabel: 'O(h)', traj: eulerTraj },
  ];

  const methods: MethodComparisonRow[] = defs.map((d) => {
    const tVal = d.traj.landingPoint.t;
    const hVal = d.traj.peakPoint.y;
    const rVal = d.traj.landingPoint.x;
    const vVal = Math.hypot(d.traj.landingPoint.vx, d.traj.landingPoint.vy);
    const rErr = Math.abs(rVal - refR);
    const hErr = Math.abs(hVal - refH);
    const tErr = Math.abs(tVal - refT);
    return {
      method: d.method,
      label: d.label,
      orderLabel: d.orderLabel,
      flightTime: tVal,
      maxHeight: hVal,
      horizontalRange: rVal,
      finalVelocity: vVal,
      rangeAbsError: rErr,
      rangePctError: refR > 1e-9 ? (rErr / refR) * 100 : null,
      heightAbsError: hErr,
      heightPctError: refH > 1e-9 ? (hErr / refH) * 100 : null,
      timeAbsError: tErr,
      timePctError: refT > 1e-9 ? (tErr / refT) * 100 : null,
      trajectory: d.traj,
    };
  });

  return {
    referenceSource: isIdeal ? 'analytical' : 'fine_rk4',
    referenceFlightTime: refT,
    referenceMaxHeight: refH,
    referenceHorizontalRange: refR,
    referenceFinalVelocity: refV,
    methods,
  };
}

export interface StepConvergencePoint {
  h: number;
  steps: number;
  rk4Range: number;
  rk4Height: number;
  rk4RangeError: number;
  rk4HeightError: number;
  rk4ObservedOrder: number | null;
  modEulerRangeError: number;
  eulerRangeError: number;
}

/**
 * Evaluates Error vs Step Size (h) across varying time steps [2h, h, h/2, h/4, h/8]
 * to verify theoretical O(h^4) accuracy for RK4 alongside Euler O(h) and Modified Euler O(h^2).
 */
export function computeMultiMethodStepConvergence(
  config: SimulationConfig,
): StepConvergencePoint[] {
  const params = configToCanvasParams(config);
  const baseH = Math.max(0.01, Math.min(0.2, config.timeStep || 0.05));
  const rawSteps = [baseH * 4, baseH * 2, baseH, baseH / 2, baseH / 4];
  const stepSizes = Array.from(
    new Set(rawSteps.map((s) => Number(Math.max(0.002, Math.min(0.4, s)).toFixed(5)))),
  ).sort((a, b) => b - a);

  const isIdeal = !params.dragEnabled;
  const refAna = computeNoDragAnalytical(params);
  let refR = refAna.horizontalRange;
  let refH = refAna.maxHeight;

  if (!isIdeal) {
    const fine = computeTrajectoryWithMethod(params, Math.max(0.0008, baseH / 16), 'rk4');
    refR = fine.landingPoint.x;
    refH = fine.peakPoint.y;
  }

  const rows: StepConvergencePoint[] = [];
  for (let i = 0; i < stepSizes.length; i += 1) {
    const h = stepSizes[i];
    const rk4 = computeTrajectoryWithMethod(params, h, 'rk4');
    const mod = computeTrajectoryWithMethod(params, h, 'modified_euler');
    const eul = computeTrajectoryWithMethod(params, h, 'euler');

    const rk4RangeError = Math.max(1e-14, Math.abs(rk4.landingPoint.x - refR));
    const rk4HeightError = Math.max(1e-14, Math.abs(rk4.peakPoint.y - refH));
    const modEulerRangeError = Math.max(1e-14, Math.abs(mod.landingPoint.x - refR));
    const eulerRangeError = Math.max(1e-14, Math.abs(eul.landingPoint.x - refR));

    let observedOrder: number | null = null;
    if (i > 0) {
      const prev = rows[i - 1];
      const ratioH = prev.h / h;
      const ratioE = prev.rk4RangeError / rk4RangeError;
      if (ratioH > 1.05 && ratioE > 1 && prev.rk4RangeError > 1e-12 && rk4RangeError > 1e-13) {
        observedOrder = Math.log(ratioE) / Math.log(ratioH);
      }
    }

    rows.push({
      h,
      steps: Math.max(1, rk4.steps.length),
      rk4Range: rk4.landingPoint.x,
      rk4Height: rk4.peakPoint.y,
      rk4RangeError,
      rk4HeightError,
      rk4ObservedOrder: observedOrder,
      modEulerRangeError,
      eulerRangeError,
    });
  }

  return rows;
}
