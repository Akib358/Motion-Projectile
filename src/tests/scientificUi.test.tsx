import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MathFormula } from '../components/MathFormula';
import { ResultDashboard } from '../components/ResultDashboard';
import { Rk4IterationExplorer } from '../components/Rk4IterationExplorer';
import { DEFAULT_SIMULATION_CONFIG } from '../data/catalog';
import {
  computeMethodComparisonSummary,
  computeMultiMethodStepConvergence,
} from '../physics/rk4CanvasEngine';
import { AnalyticsView } from '../pages/AnalyticsView';
import { HistoryView } from '../pages/HistoryView';
import { HomeView } from '../pages/HomeView';
import { LearnRk4View } from '../pages/LearnRk4View';
import {
  AnalyzedSimulationEntry,
  SavedSimulationRecord,
  SimulationOutput,
} from '../types/simulation';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    firebaseUser: { uid: 'test-uid' },
    profile: {
      uid: 'test-uid',
      email: 'researcher@example.edu',
      displayName: 'Dr. Ada Lovelace',
      themePreference: 'dark',
      audioEnabled: true,
      audioVolume: 0.45,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    getIdToken: async () => 'mock-token',
  }),
}));

function buildSampleOutput(overrides?: Partial<SimulationOutput['summary']>): SimulationOutput {
  return {
    engine: 'python-rk4',
    physics_model: 'ideal',
    summary: {
      flight_time: 7.2082,
      maximum_height: 63.7105,
      horizontal_range: 254.842,
      initial_velocity: 50,
      final_velocity: 50,
      max_speed: 50,
      step_count: 145,
      crossed_ground: true,
      destination_distance: 254.8,
      destination_height: 0,
      destination_reached: true,
      destination_delta: 0.042,
      y_at_destination: 0.04,
      ...overrides,
    },
    landing_point: {
      t: 7.2082,
      x: 254.842,
      y: 0,
      vx: 35.355,
      vy: -35.355,
      speed: 50,
    },
    analytical: {
      flight_time: 7.2082,
      maximum_height: 63.7105,
      horizontal_range: 254.842,
      final_velocity: 50,
    },
    errors: {
      flight_time: { abs: 1.2e-13, pct: null },
      maximum_height: { abs: 2.1e-13, pct: 3.3e-13 },
      horizontal_range: { abs: 4.5e-13, pct: 1.7e-13 },
      final_velocity: { abs: 1.0e-13, pct: 2.0e-13 },
      max_step_position_error: 5.4e-13,
      max_step_velocity_error: 3.1e-13,
    },
    steps: [
      {
        iteration: 0,
        t: 0,
        x: 0,
        y: 0,
        vx: 35.355339,
        vy: 35.355339,
        speed: 50,
        k1: [35.355339, 35.355339, 0, -9.81],
        k2: [35.355339, 35.110089, 0, -9.81],
        k3: [35.355339, 35.110089, 0, -9.81],
        k4: [35.355339, 34.864839, 0, -9.81],
        next_state: [1.767767, 1.755504, 35.355339, 34.864839],
        analytical: { x: 0, y: 0, vx: 35.355339, vy: 35.355339 },
        position_error: 0,
        velocity_error: 0,
      },
    ],
  };
}

function buildSavedRecord(id: string, name: string, model: SavedSimulationRecord['physicsModel']): SavedSimulationRecord {
  return {
    id,
    uid: 'test-uid',
    simulationName: name,
    projectileType: 'ball',
    physicsModel: model,
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
    thrust: 0,
    burnTime: 0,
    dryMass: 0.45,
    liftCoefficient: 0,
    wingArea: 0,
    destinationDistance: 254.8,
    destinationHeight: 0,
    destinationTolerance: 5,
    maximumHeight: 63.71,
    flightTime: 7.21,
    horizontalRange: 254.84,
    finalVelocity: 50,
    maxSpeed: 50,
    stepCount: 145,
    destinationReached: true,
    destinationDelta: 0.04,
    yAtDestination: 0,
    analyticalSummary: null,
    errorsSummary: null,
    createdAt: '2026-04-01T12:00:00.000Z',
  };
}

describe('PROJECTILE LAB Scientific UI Components', () => {
  it('renders KaTeX formulas cleanly without raw error fallback', () => {
    const { container } = render(<MathFormula latex={String.raw`k_1 = f(t_n, Y_n)`} />);
    expect(container.querySelector('.katex')).toBeTruthy();
  });

  it('renders LearnRk4View curriculum derivations and explicit k1-k4 slope definitions', () => {
    render(<LearnRk4View />);
    expect(
      screen.getByText(/Classical Fourth-Order Runge-Kutta \(RK4\) for Projectile Motion/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/derivative slope vector/i)).toBeInTheDocument();
  });

  it('displays honest destination reached and not-reached status plus zero-denominator safe error handling', () => {
    const onSave = vi.fn();
    const onExport = vi.fn();
    const onInspect = vi.fn();

    const { rerender } = render(
      <ResultDashboard
        config={DEFAULT_SIMULATION_CONFIG}
        output={buildSampleOutput({ destination_reached: true, destination_delta: 0.04 })}
        saving={false}
        savedId={null}
        onSaveSimulation={onSave}
        onExportCsv={onExport}
        onInspectChart={onInspect}
      />,
    );

    expect(screen.getByText(/Target Destination Reached/i)).toBeInTheDocument();
    expect(screen.getByText(/N\/A \(0 denom\)/i)).toBeInTheDocument();

    rerender(
      <ResultDashboard
        config={DEFAULT_SIMULATION_CONFIG}
        output={buildSampleOutput({
          destination_distance: 400,
          destination_reached: false,
          destination_delta: -145.16,
        })}
        saving={false}
        savedId={null}
        onSaveSimulation={onSave}
        onExportCsv={onExport}
        onInspectChart={onInspect}
      />,
    );

    expect(screen.getByText(/Selected Destination Not Reached/i)).toBeInTheDocument();
    expect(screen.getByText(/shortfall/i)).toBeInTheDocument();
  });

  it('allows inspecting RK4 step slopes k1-k4 inside Rk4IterationExplorer', () => {
    const sample = buildSampleOutput();
    const onSelect = vi.fn();

    render(
      <Rk4IterationExplorer
        steps={sample.steps}
        timeStep={0.05}
        selectedIteration={0}
        onSelectIteration={onSelect}
      />,
    );

    expect(screen.getByText(/Inspecting Iteration #0/i)).toBeInTheDocument();
    expect(screen.getByText(/k₁ = f\(tₙ, Yₙ\)/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText('#0'));
    expect(onSelect).toHaveBeenCalledWith(0);
  });

  it('renders HomeView empty state honestly and populated runs when saved', () => {
    const onNav = vi.fn();
    const onProj = vi.fn();
    const onOpen = vi.fn();

    const { rerender } = render(
      <HomeView
        simulations={[]}
        loadingHistory={false}
        onNavigate={onNav}
        onStartWithProjectile={onProj}
        onOpenSaved={onOpen}
      />,
    );

    expect(screen.getByText(/You have no saved simulations yet/i)).toBeInTheDocument();

    rerender(
      <HomeView
        simulations={[buildSavedRecord('sim1', 'Drag Validation #1', 'quadratic_drag')]}
        loadingHistory={false}
        onNavigate={onNav}
        onStartWithProjectile={onProj}
        onOpenSaved={onOpen}
      />,
    );

    expect(screen.getAllByText('Drag Validation #1').length).toBeGreaterThanOrEqual(1);
  });

  it('filters HistoryView by simulation name cleanly', () => {
    render(
      <HistoryView
        simulations={[
          buildSavedRecord('sim1', 'Ideal 45° Run', 'ideal'),
          buildSavedRecord('sim2', 'Drag Sphere Test', 'quadratic_drag'),
        ]}
        loading={false}
        onOpenSimulation={vi.fn()}
        onDeleteSimulation={vi.fn()}
        onStartNew={vi.fn()}
      />,
    );

    const searchInput = screen.getByLabelText(/Search saved simulations/i);
    fireEvent.change(searchInput, { target: { value: 'Drag Sphere' } });

    expect(screen.getByText('Drag Sphere Test')).toBeInTheDocument();
    expect(screen.queryByText('Ideal 45° Run')).not.toBeInTheDocument();
  });

  it('compares RK4, Modified Euler, and Euler errors and computes O(h^4) convergence', () => {
    const report = computeMethodComparisonSummary({
      ...DEFAULT_SIMULATION_CONFIG,
      physicsModel: 'ideal',
      initialVelocity: 50,
      launchAngleDeg: 45,
      gravity: 9.81,
      timeStep: 0.05,
    });

    expect(report.referenceSource).toBe('analytical');
    expect(report.methods).toHaveLength(3);
    const [rk4, modEuler, euler] = report.methods;
    expect(rk4.rangeAbsError).toBeLessThan(modEuler.rangeAbsError);
    expect(modEuler.rangeAbsError).toBeLessThan(euler.rangeAbsError);

    const dragConv = computeMultiMethodStepConvergence({
      ...DEFAULT_SIMULATION_CONFIG,
      physicsModel: 'quadratic_drag',
      initialVelocity: 50,
      launchAngleDeg: 45,
      gravity: 9.81,
      timeStep: 0.05,
    });
    expect(dragConv.length).toBeGreaterThanOrEqual(4);
    expect(dragConv[dragConv.length - 1].rk4RangeError).toBeLessThan(
      dragConv[0].rk4RangeError,
    );
  });

  it('renders AnalyticsView unique test-case list, detailed inputs/outputs, method comparison, and Compare All Runs', () => {
    if (typeof window.ResizeObserver === 'undefined') {
      window.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    }

    const sessionRuns: AnalyzedSimulationEntry[] = [
      {
        id: 'run_1',
        title: 'Vacuum Test 45deg',
        source: 'simulator',
        solverMethod: 'rk4',
        config: {
          ...DEFAULT_SIMULATION_CONFIG,
          simulationName: 'Vacuum Test 45deg',
          physicsModel: 'ideal',
          initialVelocity: 50,
          launchAngleDeg: 45,
          timeStep: 0.05,
        },
        output: buildSampleOutput(),
        createdAt: '2026-04-02T10:00:00.000Z',
      },
      {
        id: 'run_2',
        title: 'Air Drag Sphere Run',
        source: 'simulator',
        solverMethod: 'euler',
        config: {
          ...DEFAULT_SIMULATION_CONFIG,
          simulationName: 'Air Drag Sphere Run',
          physicsModel: 'quadratic_drag',
          initialVelocity: 60,
          launchAngleDeg: 35,
          timeStep: 0.05,
          airDensity: 1.225,
          dragCoefficient: 0.47,
          crossSectionalArea: 0.038,
          mass: 0.45,
        },
        output: null,
        createdAt: '2026-04-02T10:05:00.000Z',
      },
    ];

    const onDeleteEntry = vi.fn();

    render(
      <AnalyticsView
        simulations={[]}
        sessionRuns={sessionRuns}
        onOpenInSimulator={vi.fn()}
        onDeleteEntry={onDeleteEntry}
        onClearSessionRuns={vi.fn()}
        onStartNew={vi.fn()}
      />,
    );

    expect(screen.getByText('Simulation Test Cases')).toBeInTheDocument();
    expect(screen.getByText('1. Simulation Inputs')).toBeInTheDocument();
    expect(screen.getByText(/Numerical Method Comparison on Same Inputs/i)).toBeInTheDocument();
    expect(screen.getByText(/4\. Error Analysis Plot: Error vs\. Step Size \(h\)/i)).toBeInTheDocument();

    // Clicking the first unique title selects it and shows its Ideal Closed-Form vs RK4 validation
    fireEvent.click(screen.getByText('Vacuum Test 45deg'));
    expect(
      screen.getByText(/Numerical \(RK4\) vs\. Analytical \(Closed-Form Ideal\) Error Table/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Air Resistance is disabled for this Ideal Motion run/i),
    ).toBeInTheDocument();

    // Removing the entry triggers onDeleteEntry with the selected test case
    fireEvent.click(screen.getByRole('button', { name: 'Remove Vacuum Test 45deg' }));
    expect(onDeleteEntry).toHaveBeenCalledWith(expect.objectContaining({ id: 'run_1' }));

    // Switch to Compare All Runs table
    fireEvent.click(screen.getByText('Compare All Runs'));
    expect(screen.getByText('All Test Cases & Edited Runs Comparison')).toBeInTheDocument();
    expect(screen.getByText('Air Drag Sphere Run')).toBeInTheDocument();
  });
});
