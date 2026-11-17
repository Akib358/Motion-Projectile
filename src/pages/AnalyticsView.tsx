import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowUpRight,
  Download,
  GitCompare,
  Layers,
  PlayCircle,
  Search,
  Trash2,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import {
  buildSimulationOutputFromTrajectory,
  computeMethodComparisonSummary,
  computeMultiMethodStepConvergence,
  computeTrajectoryWithMethod,
  configToCanvasParams,
  PhysicsState,
} from '../physics/rk4CanvasEngine';
import { loadSimulationSteps } from '../services/simulationService';
import {
  AnalyzedSimulationEntry,
  RK4Step,
  SavedSimulationRecord,
  SimulationConfig,
  SimulationOutput,
  SolverMethod,
} from '../types/simulation';
import { Rk4IterationExplorer } from '../components/Rk4IterationExplorer';

interface AnalyticsViewProps {
  simulations: SavedSimulationRecord[];
  sessionRuns?: AnalyzedSimulationEntry[];
  onOpenInSimulator?: (entry: AnalyzedSimulationEntry) => void;
  onDeleteEntry?: (entry: AnalyzedSimulationEntry) => Promise<void> | void;
  onClearSessionRuns?: () => void;
  onStartNew: () => void;
}

function savedRecordToConfig(sim: SavedSimulationRecord): SimulationConfig {
  return {
    simulationName: sim.simulationName,
    projectileType: sim.projectileType,
    physicsModel: sim.physicsModel,
    sourceEnvironment: sim.sourceEnvironment,
    destinationEnvironment: sim.destinationEnvironment,
    environmentTime: sim.environmentTime,
    environmentWeather: sim.environmentWeather,
    initialVelocity: sim.initialVelocity,
    launchAngleDeg: sim.launchAngleDeg,
    gravity: sim.gravity,
    timeStep: sim.timeStep,
    initialHeight: sim.initialHeight,
    mass: sim.mass,
    airDensity: sim.airDensity,
    dragCoefficient: sim.dragCoefficient,
    crossSectionalArea: sim.crossSectionalArea,
    thrust: sim.thrust,
    burnTime: sim.burnTime,
    dryMass: sim.dryMass,
    liftCoefficient: sim.liftCoefficient,
    wingArea: sim.wingArea,
    destinationDistance: sim.destinationDistance,
    destinationHeight: sim.destinationHeight,
    destinationTolerance: sim.destinationTolerance,
  };
}

function formatMethodLabel(method: SolverMethod): string {
  if (method === 'euler') return 'Euler';
  if (method === 'modified_euler') return 'Modified Euler';
  return 'RK4';
}

function interpolateYAtX(points: PhysicsState[], targetX: number): number | null {
  if (points.length === 0) return null;
  const maxX = points[points.length - 1].x;
  if (targetX < -1e-6 || targetX > maxX + 1e-6) return null;
  if (targetX <= points[0].x) return Math.max(0, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    const p0 = points[i - 1];
    const p1 = points[i];
    if (p1.x >= targetX) {
      const span = p1.x - p0.x;
      const frac = span > 1e-9 ? (targetX - p0.x) / span : 0;
      return Math.max(0, p0.y + frac * (p1.y - p0.y));
    }
  }
  return 0;
}

function downloadStepsCsv(title: string, steps: RK4Step[]) {
  const header = [
    'iteration',
    't_n',
    'x',
    'y',
    'vx',
    'vy',
    'k1_vx',
    'k1_vy',
    'k1_ax',
    'k1_ay',
    'k2_vx',
    'k2_vy',
    'k2_ax',
    'k2_ay',
    'k3_vx',
    'k3_vy',
    'k3_ax',
    'k3_ay',
    'k4_vx',
    'k4_vy',
    'k4_ax',
    'k4_ay',
    'next_x',
    'next_y',
    'next_vx',
    'next_vy',
  ].join(',');

  const rows = steps.map((s) =>
    [
      s.iteration,
      s.t.toFixed(6),
      s.x.toFixed(6),
      s.y.toFixed(6),
      s.vx.toFixed(6),
      s.vy.toFixed(6),
      ...s.k1.map((v) => v.toFixed(6)),
      ...s.k2.map((v) => v.toFixed(6)),
      ...s.k3.map((v) => v.toFixed(6)),
      ...s.k4.map((v) => v.toFixed(6)),
      ...s.next_state.map((v) => v.toFixed(6)),
    ].join(','),
  );

  const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_iterations.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function AnalyticsView({
  simulations,
  sessionRuns = [],
  onOpenInSimulator,
  onDeleteEntry,
  onClearSessionRuns,
  onStartNew,
}: AnalyticsViewProps) {
  const { firebaseUser, getIdToken } = useAuth();
  const [viewMode, setViewMode] = useState<'single' | 'compare'>('single');
  const [search, setSearch] = useState('');
  const [modeFilter, setModeFilter] = useState<'all' | 'ideal' | 'drag'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIteration, setSelectedIteration] = useState<number | null>(0);
  const [tableMethod, setTableMethod] = useState<SolverMethod>('rk4');
  const [showAllMethodsOverlay, setShowAllMethodsOverlay] = useState(false);
  const [loadedStepsById, setLoadedStepsById] = useState<Record<string, RK4Step[]>>({});
  const [loadingStepsId, setLoadingStepsId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleRemoveEntry = async (entry: AnalyzedSimulationEntry) => {
    if (!onDeleteEntry) return;
    setDeletingId(entry.id);
    try {
      await onDeleteEntry(entry);
      if (selectedId === entry.id) {
        setSelectedId(null);
      }
    } finally {
      setDeletingId(null);
    }
  };

  // Merge Simulator session runs (unique titles + edited values) and saved DB runs
  const allEntries = useMemo<AnalyzedSimulationEntry[]>(() => {
    const map = new Map<string, AnalyzedSimulationEntry>();

    for (const run of sessionRuns) {
      map.set(run.id, run);
    }

    for (const sim of simulations) {
      const savedConfig = savedRecordToConfig(sim);
      const id = `saved_${sim.id}`;
      // Avoid duplicating if already represented by matching savedId
      const alreadyExists = Array.from(map.values()).some((e) => e.savedId === sim.id);
      if (alreadyExists) continue;

      const cachedSteps = loadedStepsById[id] ?? [];
      const fallbackTraj = computeTrajectoryWithMethod(
        configToCanvasParams(savedConfig),
        savedConfig.timeStep || 0.05,
        'rk4',
      );
      const stepsToUse = cachedSteps.length > 0 ? cachedSteps : fallbackTraj.steps;

      const reconstructedOutput: SimulationOutput = {
        engine: 'python-rk4',
        physics_model: sim.physicsModel,
        summary: {
          flight_time: sim.flightTime,
          maximum_height: sim.maximumHeight,
          horizontal_range: sim.horizontalRange,
          initial_velocity: sim.initialVelocity,
          final_velocity: sim.finalVelocity,
          max_speed: sim.maxSpeed,
          step_count: sim.stepCount,
          crossed_ground: true,
          destination_distance: sim.destinationDistance,
          destination_height: sim.destinationHeight,
          destination_reached: sim.destinationReached,
          destination_delta: sim.destinationDelta,
          y_at_destination: sim.yAtDestination,
        },
        landing_point: {
          t: sim.flightTime,
          x: sim.horizontalRange,
          y: 0,
          vx: stepsToUse[stepsToUse.length - 1]?.next_state[2] ?? 0,
          vy: stepsToUse[stepsToUse.length - 1]?.next_state[3] ?? 0,
          speed: sim.finalVelocity,
        },
        analytical:
          sim.analyticalSummary ??
          (sim.physicsModel === 'ideal'
            ? {
                flight_time: fallbackTraj.analytical.flightTime,
                maximum_height: fallbackTraj.analytical.maxHeight,
                horizontal_range: fallbackTraj.analytical.horizontalRange,
                final_velocity: fallbackTraj.analytical.finalVelocity,
              }
            : null),
        errors: sim.errorsSummary,
        steps: stepsToUse,
      };

      map.set(id, {
        id,
        title: sim.simulationName,
        source: 'saved',
        solverMethod: 'rk4',
        config: savedConfig,
        output: reconstructedOutput,
        savedId: sim.id,
        createdAt: sim.createdAt,
      });
    }

    return Array.from(map.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [sessionRuns, simulations, loadedStepsById]);

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allEntries.filter((entry) => {
      if (q && !entry.title.toLowerCase().includes(q)) return false;
      const isDrag = entry.config.physicsModel !== 'ideal';
      if (modeFilter === 'ideal' && isDrag) return false;
      if (modeFilter === 'drag' && !isDrag) return false;
      return true;
    });
  }, [allEntries, search, modeFilter]);

  const activeEntry = useMemo(() => {
    if (filteredEntries.length === 0) return allEntries[0] ?? null;
    return filteredEntries.find((e) => e.id === selectedId) ?? filteredEntries[0] ?? null;
  }, [filteredEntries, allEntries, selectedId]);

  // Reset table method to the active run's method when switching test cases
  useEffect(() => {
    if (activeEntry) {
      setTableMethod(activeEntry.solverMethod);
      setSelectedIteration(0);
    }
  }, [activeEntry?.id]);

  // Fetch persisted SQLite/Firestore steps when inspecting a saved record if not yet cached
  useEffect(() => {
    if (!activeEntry || activeEntry.source !== 'saved' || !activeEntry.savedId || !firebaseUser) {
      return;
    }
    const entryId = activeEntry.id;
    const savedId = activeEntry.savedId;
    if (loadedStepsById[entryId]) return;

    let cancelled = false;
    setLoadingStepsId(entryId);
    getIdToken()
      .then((token) => loadSimulationSteps(token, savedId))
      .then((steps) => {
        if (!cancelled && steps.length > 0) {
          setLoadedStepsById((prev) => ({ ...prev, [entryId]: steps }));
        }
      })
      .catch(() => {
        // Fallback trajectory steps remain available if offline
      })
      .finally(() => {
        if (!cancelled) setLoadingStepsId(null);
      });

    return () => {
      cancelled = true;
    };
  }, [activeEntry?.id, activeEntry?.source, activeEntry?.savedId, firebaseUser, getIdToken, loadedStepsById]);

  // Multi-method analysis for the selected simulation (RK4, Modified Euler, Euler)
  const methodReport = useMemo(() => {
    if (!activeEntry) return null;
    return computeMethodComparisonSummary(activeEntry.config);
  }, [activeEntry]);

  // Step-size convergence O(h^4) for the selected simulation
  const convergenceRows = useMemo(() => {
    if (!activeEntry) return [];
    return computeMultiMethodStepConvergence(activeEntry.config);
  }, [activeEntry]);

  // Comparative Overlay: Ideal Parabolic vs Air-Resistance Asymmetric Path (+ optional Euler/ModEuler)
  const overlayChartData = useMemo(() => {
    if (!activeEntry) return [];
    const cfg = activeEntry.config;
    const h = Math.max(0.005, Math.min(0.25, cfg.timeStep || 0.05));
    const idealTraj = computeTrajectoryWithMethod(configToCanvasParams(cfg, false), h, 'rk4');
    const dragTraj = computeTrajectoryWithMethod(configToCanvasParams(cfg, true), h, 'rk4');
    const modTraj = showAllMethodsOverlay
      ? computeTrajectoryWithMethod(configToCanvasParams(cfg), h, 'modified_euler')
      : null;
    const eulTraj = showAllMethodsOverlay
      ? computeTrajectoryWithMethod(configToCanvasParams(cfg), h, 'euler')
      : null;

    const maxRange = Math.max(
      1,
      idealTraj.landingPoint.x,
      dragTraj.landingPoint.x,
      modTraj?.landingPoint.x ?? 0,
      eulTraj?.landingPoint.x ?? 0,
    );

    const samples = 85;
    const rows: {
      x: number;
      idealY: number | null;
      dragY: number | null;
      modEulerY?: number | null;
      eulerY?: number | null;
    }[] = [];

    for (let i = 0; i <= samples; i += 1) {
      const x = (maxRange * i) / samples;
      rows.push({
        x: Number(x.toFixed(2)),
        idealY: interpolateYAtX(idealTraj.points, x),
        dragY: interpolateYAtX(dragTraj.points, x),
        ...(showAllMethodsOverlay
          ? {
              modEulerY: modTraj ? interpolateYAtX(modTraj.points, x) : null,
              eulerY: eulTraj ? interpolateYAtX(eulTraj.points, x) : null,
            }
          : {}),
      });
    }

    return rows;
  }, [activeEntry, showAllMethodsOverlay]);

  const idealVsDragDelta = useMemo(() => {
    if (!activeEntry) return null;
    const cfg = activeEntry.config;
    const h = Math.max(0.005, Math.min(0.25, cfg.timeStep || 0.05));
    const idealTraj = computeTrajectoryWithMethod(configToCanvasParams(cfg, false), h, 'rk4');
    const dragTraj = computeTrajectoryWithMethod(configToCanvasParams(cfg, true), h, 'rk4');
    return {
      idealRange: idealTraj.landingPoint.x,
      dragRange: dragTraj.landingPoint.x,
      rangeReduction: idealTraj.landingPoint.x - dragTraj.landingPoint.x,
      idealHeight: idealTraj.peakPoint.y,
      dragHeight: dragTraj.peakPoint.y,
      heightReduction: idealTraj.peakPoint.y - dragTraj.peakPoint.y,
    };
  }, [activeEntry]);

  // Active iteration steps for selected method in the RK4/Method table
  const tableStepsData = useMemo(() => {
    if (!activeEntry) return { steps: [] as RK4Step[], timeStep: 0.05 };
    if (
      tableMethod === activeEntry.solverMethod &&
      activeEntry.output?.steps &&
      activeEntry.output.steps.length > 0
    ) {
      return {
        steps: activeEntry.output.steps,
        timeStep: activeEntry.config.timeStep || 0.05,
      };
    }
    const row = methodReport?.methods.find((m) => m.method === tableMethod);
    if (row) {
      return {
        steps: row.trajectory.steps,
        timeStep: row.trajectory.dtUsed,
      };
    }
    const computed = computeTrajectoryWithMethod(
      configToCanvasParams(activeEntry.config),
      activeEntry.config.timeStep || 0.05,
      tableMethod,
    );
    return { steps: computed.steps, timeStep: computed.dtUsed };
  }, [activeEntry, tableMethod, methodReport]);

  // Cross-test-case comparison rows across all runs
  const crossComparisonRows = useMemo(() => {
    return allEntries.map((entry) => {
      const report = computeMethodComparisonSummary(entry.config);
      const usedMethodRow =
        report.methods.find((m) => m.method === entry.solverMethod) ?? report.methods[0];
      const rk4Row = report.methods[0];
      const isDrag = entry.config.physicsModel !== 'ideal';
      const outSummary =
        entry.output?.summary ??
        buildSimulationOutputFromTrajectory(
          entry.config,
          usedMethodRow.trajectory,
          entry.solverMethod,
        ).summary;

      return {
        entry,
        isDrag,
        usedMethodRow,
        rk4Row,
        H: outSummary.maximum_height,
        T: outSummary.flight_time,
        R: outSummary.horizontal_range,
        rangeAbsErr: usedMethodRow.rangeAbsError,
        rangePctErr: usedMethodRow.rangePctError,
        rk4PctErr: rk4Row.rangePctError,
      };
    });
  }, [allEntries]);

  if (allEntries.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-8 sm:p-10 glass-card rounded-2xl text-center space-y-4"
      >
        <h2 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
          No Simulation Runs to Analyze Yet
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-lg mx-auto">
          Launch a ball or rocket in the Simulator (or edit values to create unique test cases) and
          every run will appear here with full RK4, analytical, method comparison, and error plots.
        </p>
        <button
          type="button"
          onClick={onStartNew}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-emerald-500 text-slate-950 text-sm font-bold cursor-pointer"
        >
          <PlayCircle className="w-4 h-4" aria-hidden="true" />
          <span>Open Simulator</span>
        </button>
      </motion.div>
    );
  }

  const activeConfig = activeEntry!.config;
  const activeIsDrag = activeConfig.physicsModel !== 'ideal';
  const activeMethodRow =
    methodReport?.methods.find((m) => m.method === activeEntry!.solverMethod) ??
    methodReport?.methods[0];
  const rk4Row = methodReport?.methods[0];
  const activeSummary = activeEntry!.output?.summary ?? {
    maximum_height: activeMethodRow?.maxHeight ?? 0,
    flight_time: activeMethodRow?.flightTime ?? 0,
    horizontal_range: activeMethodRow?.horizontalRange ?? 0,
    final_velocity: activeMethodRow?.finalVelocity ?? 0,
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-5"
    >
      {/* Top Toolbar: Search, Filter & Single vs Compare Mode */}
      <div className="glass-card rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search test case title..."
              aria-label="Search test case title"
              className="w-full pl-9 pr-3 py-2 text-xs bg-white dark:bg-[#070a0f] border border-sky-500/25 rounded-lg text-slate-900 dark:text-white"
            />
          </div>

          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#070a0f] border border-sky-500/20">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'ideal', label: 'Ideal' },
                { id: 'drag', label: 'Air Drag' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setModeFilter(f.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                  modeFilter === f.id
                    ? 'bg-white dark:bg-[#111722] text-sky-600 dark:text-sky-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#070a0f] border border-sky-500/20 self-start lg:self-auto">
          <button
            type="button"
            onClick={() => setViewMode('single')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
              viewMode === 'single'
                ? 'bg-gradient-to-r from-sky-500 to-emerald-500 text-slate-950'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            <Layers className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Test Case Details ({allEntries.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('compare')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
              viewMode === 'compare'
                ? 'bg-gradient-to-r from-sky-500 to-emerald-500 text-slate-950'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            <GitCompare className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Compare All Runs</span>
          </button>
        </div>
      </div>

      {viewMode === 'compare' ? (
        /* Cross-Test-Case Error & Output Comparison View */
        <div className="space-y-5">
          <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                  All Test Cases &amp; Edited Runs Comparison
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Click any simulation title below to inspect its full RK4 iterations, analytical vs
                  numerical breakdown, and convergence curves.
                </p>
              </div>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 tabular-nums">
                {crossComparisonRows.length} unique test cases
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-[#070a0f] text-slate-500 dark:text-slate-400 border-b border-sky-500/20">
                  <tr>
                    <th className="px-3 py-2.5 whitespace-nowrap">Unique Title</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">Method · Mode</th>
                    <th className="px-3 py-2.5 text-right whitespace-nowrap">v₀ (m/s)</th>
                    <th className="px-3 py-2.5 text-right whitespace-nowrap">θ (°)</th>
                    <th className="px-3 py-2.5 text-right whitespace-nowrap">g (m/s²)</th>
                    <th className="px-3 py-2.5 text-right whitespace-nowrap">h (s)</th>
                    <th className="px-3 py-2.5 text-right whitespace-nowrap">Max H (m)</th>
                    <th className="px-3 py-2.5 text-right whitespace-nowrap">Flight T (s)</th>
                    <th className="px-3 py-2.5 text-right whitespace-nowrap">Range R (m)</th>
                    <th className="px-3 py-2.5 text-right whitespace-nowrap">Range Abs Error</th>
                    <th className="px-3 py-2.5 text-right whitespace-nowrap">Range % Error</th>
                    {onDeleteEntry && <th className="px-3 py-2.5 text-right whitespace-nowrap">Remove</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800 tabular-nums">
                  {crossComparisonRows.map((row) => (
                    <tr
                      key={row.entry.id}
                      onClick={() => {
                        setSelectedId(row.entry.id);
                        setViewMode('single');
                      }}
                      className="hover:bg-sky-500/5 cursor-pointer transition-colors"
                    >
                      <td className="px-3 py-2.5 font-sans font-semibold text-sky-600 dark:text-sky-400 whitespace-nowrap">
                        {row.entry.title}
                      </td>
                      <td className="px-3 py-2.5 font-sans text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {formatMethodLabel(row.entry.solverMethod)} ·{' '}
                        {row.isDrag ? 'Air Drag' : 'Ideal'}
                      </td>
                      <td className="px-3 py-2.5 text-right">{row.entry.config.initialVelocity}</td>
                      <td className="px-3 py-2.5 text-right">{row.entry.config.launchAngleDeg}</td>
                      <td className="px-3 py-2.5 text-right">
                        {row.entry.config.gravity.toFixed(2)}
                      </td>
                      <td className="px-3 py-2.5 text-right">{row.entry.config.timeStep}</td>
                      <td className="px-3 py-2.5 text-right text-amber-600 dark:text-yellow-400 font-medium">
                        {row.H.toFixed(3)}
                      </td>
                      <td className="px-3 py-2.5 text-right">{row.T.toFixed(3)}</td>
                      <td className="px-3 py-2.5 text-right text-emerald-600 dark:text-emerald-400 font-semibold">
                        {row.R.toFixed(3)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-sky-600 dark:text-sky-400">
                        {row.rangeAbsErr.toExponential(2)} m
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">
                        {row.rangePctErr !== null ? `${row.rangePctErr.toExponential(2)}%` : '—'}
                      </td>
                      {onDeleteEntry && (
                        <td className="px-3 py-2.5 text-right">
                          <button
                            type="button"
                            disabled={deletingId === row.entry.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleRemoveEntry(row.entry);
                            }}
                            aria-label={`Remove ${row.entry.title}`}
                            className="p-1.5 rounded-lg border border-red-500/30 text-red-500 hover:bg-red-500/10 disabled:opacity-40 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-4">
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Range &amp; Max Height Across Unique Test Cases
            </h3>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={crossComparisonRows.slice(0, 12).map((r) => ({
                    name: r.entry.title.slice(0, 18),
                    range: Number(r.R.toFixed(2)),
                    height: Number(r.H.toFixed(2)),
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" />
                  <XAxis dataKey="name" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0b0f14',
                      borderColor: '#38bdf8',
                      color: '#f8fafc',
                      fontSize: 12,
                    }}
                  />
                  <Legend />
                  <Bar dataKey="range" name="Horizontal Range R (m)" fill="#38bdf8" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="height" name="Max Height H (m)" fill="#22c55e" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      ) : (
        /* Master-Detail View: Clickable Unique Title List (Left) + Full Analysis (Right) */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Master List of Unique Titles */}
          <aside className="lg:col-span-4 glass-card rounded-2xl p-3.5 space-y-2.5 lg:sticky lg:top-20 max-h-[760px] flex flex-col">
            <div className="px-1.5 flex items-center justify-between gap-2 text-xs">
              <span className="font-display font-semibold text-slate-900 dark:text-white">
                Simulation Test Cases
              </span>
              <div className="flex items-center gap-2">
                <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                  {filteredEntries.length} shown
                </span>
                {onClearSessionRuns && sessionRuns.length > 0 && (
                  <button
                    type="button"
                    onClick={onClearSessionRuns}
                    className="text-[11px] font-medium text-red-500 hover:underline cursor-pointer"
                  >
                    Clear Unsaved
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-1.5 overflow-y-auto pr-0.5 flex-1">
              {filteredEntries.length === 0 ? (
                <div className="p-4 text-xs text-slate-500 dark:text-slate-400 text-center">
                  No test cases match your search filter.
                </div>
              ) : (
                filteredEntries.map((entry) => {
                  const selected = entry.id === activeEntry?.id;
                  const isDrag = entry.config.physicsModel !== 'ideal';
                  const rangeVal =
                    entry.output?.summary.horizontal_range ??
                    computeTrajectoryWithMethod(
                      configToCanvasParams(entry.config),
                      entry.config.timeStep || 0.05,
                      entry.solverMethod,
                    ).landingPoint.x;
                  return (
                    <div
                      key={entry.id}
                      className={`w-full rounded-xl border transition-colors flex items-start gap-2 p-3 ${
                        selected
                          ? 'bg-sky-500/12 border-sky-400 text-slate-900 dark:text-white'
                          : 'bg-white/70 dark:bg-[#070a0f] border-slate-200/80 dark:border-slate-800 hover:border-sky-500/40 text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedId(entry.id)}
                        className="flex-1 min-w-0 text-left cursor-pointer space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-xs sm:text-sm truncate">
                            {entry.title}
                          </span>
                          <span className="text-[11px] font-semibold tabular-nums text-emerald-600 dark:text-emerald-400 shrink-0">
                            R: {rangeVal.toFixed(2)} m
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-1.5 tabular-nums">
                          <span className="capitalize">
                            {entry.config.projectileType === 'rocket' ? 'Rocket' : 'Ball'}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{isDrag ? 'Air Drag' : 'Ideal'}</span>
                          <span aria-hidden="true">·</span>
                          <span>{formatMethodLabel(entry.solverMethod)}</span>
                          <span aria-hidden="true">·</span>
                          <span>v₀ {entry.config.initialVelocity}</span>
                          <span aria-hidden="true">·</span>
                          <span>θ {entry.config.launchAngleDeg}°</span>
                          <span aria-hidden="true">·</span>
                          <span>h {entry.config.timeStep}s</span>
                        </div>
                      </button>
                      {onDeleteEntry && (
                        <button
                          type="button"
                          disabled={deletingId === entry.id}
                          onClick={() => void handleRemoveEntry(entry)}
                          aria-label={`Remove ${entry.title}`}
                          title={`Remove ${entry.title}`}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-500/10 disabled:opacity-40 cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </aside>

          {/* Right Detailed Analysis Panel */}
          <div className="lg:col-span-8 space-y-5 min-w-0">
            {/* Run Header */}
            <div className="glass-card rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-medium text-sky-600 dark:text-sky-400 flex flex-wrap items-center gap-x-2">
                  <span>{activeEntry!.source === 'saved' ? 'Saved Database Run' : 'Simulator Test Case'}</span>
                  <span aria-hidden="true">·</span>
                  <span>Method: {formatMethodLabel(activeEntry!.solverMethod)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{activeIsDrag ? 'Air Resistance Enabled' : 'Ideal Motion (No Drag)'}</span>
                </div>
                <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white truncate mt-0.5">
                  {activeEntry!.title}
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {onDeleteEntry && (
                  <button
                    type="button"
                    disabled={deletingId === activeEntry!.id}
                    onClick={() => void handleRemoveEntry(activeEntry!)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-red-500/35 text-red-600 dark:text-red-400 hover:bg-red-500/10 disabled:opacity-40 cursor-pointer whitespace-nowrap"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{deletingId === activeEntry!.id ? 'Removing...' : 'Remove'}</span>
                  </button>
                )}
                {onOpenInSimulator && (
                  <button
                    type="button"
                    onClick={() => onOpenInSimulator(activeEntry!)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-sky-500 to-emerald-500 text-slate-950 shrink-0 cursor-pointer whitespace-nowrap"
                  >
                    <span>Open &amp; Edit in Simulator</span>
                    <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>

            {/* 1. Required Inputs: Core Mandatory + Drag Parameters */}
            <section className="glass-card rounded-2xl p-5 space-y-4">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                1. Simulation Inputs
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Core Inputs (Mandatory) */}
                <div className="p-4 rounded-xl bg-slate-50/90 dark:bg-[#070a0f] border border-slate-200 dark:border-slate-800 space-y-2.5">
                  <div className="text-xs font-semibold text-sky-600 dark:text-sky-400">
                    Core Inputs (Mandatory)
                  </div>
                  <dl className="grid grid-cols-2 gap-y-2 gap-x-3 text-xs tabular-nums">
                    <dt className="text-slate-500 dark:text-slate-400">Initial Velocity (v₀)</dt>
                    <dd className="text-right font-semibold text-slate-900 dark:text-white">
                      {activeConfig.initialVelocity} m/s
                    </dd>
                    <dt className="text-slate-500 dark:text-slate-400">Launch Angle (θ)</dt>
                    <dd className="text-right font-semibold text-slate-900 dark:text-white">
                      {activeConfig.launchAngleDeg}° (0° &lt; θ &lt; 90°)
                    </dd>
                    <dt className="text-slate-500 dark:text-slate-400">Gravity (g)</dt>
                    <dd className="text-right font-semibold text-slate-900 dark:text-white">
                      {activeConfig.gravity.toFixed(2)} m/s²
                    </dd>
                    <dt className="text-slate-500 dark:text-slate-400">Time Step (h)</dt>
                    <dd className="text-right font-semibold text-slate-900 dark:text-white">
                      {activeConfig.timeStep} s{' '}
                      <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                        ({activeConfig.timeStep <= 0.1 ? 'h ≤ 0.1 ok' : 'h > 0.1'})
                      </span>
                    </dd>
                    <dt className="text-slate-500 dark:text-slate-400">Launch Height (y₀)</dt>
                    <dd className="text-right font-semibold text-slate-900 dark:text-white">
                      {activeConfig.initialHeight} m
                    </dd>
                  </dl>
                </div>

                {/* Drag Parameters (Air Resistance Mode) */}
                <div className="p-4 rounded-xl bg-slate-50/90 dark:bg-[#070a0f] border border-slate-200 dark:border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      Drag Parameters (Air Resistance)
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {activeIsDrag ? 'Active in run' : 'Disabled (Ideal mode)'}
                    </span>
                  </div>
                  {activeIsDrag ? (
                    <dl className="grid grid-cols-2 gap-y-2 gap-x-3 text-xs tabular-nums">
                      <dt className="text-slate-500 dark:text-slate-400">Air Density (ρ)</dt>
                      <dd className="text-right font-semibold text-slate-900 dark:text-white">
                        {activeConfig.airDensity} kg/m³
                      </dd>
                      <dt className="text-slate-500 dark:text-slate-400">Drag Coefficient (Cd)</dt>
                      <dd className="text-right font-semibold text-slate-900 dark:text-white">
                        {activeConfig.dragCoefficient}
                      </dd>
                      <dt className="text-slate-500 dark:text-slate-400">Cross-Sectional Area (A)</dt>
                      <dd className="text-right font-semibold text-slate-900 dark:text-white">
                        {activeConfig.crossSectionalArea} m²
                      </dd>
                      <dt className="text-slate-500 dark:text-slate-400">Projectile Mass (m)</dt>
                      <dd className="text-right font-semibold text-slate-900 dark:text-white">
                        {activeConfig.mass} kg
                      </dd>
                    </dl>
                  ) : (
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed pt-1">
                      Air Resistance is disabled for this Ideal Motion run. Aerodynamic drag
                      parameters (ρ, Cd, A, m) are not applied.
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* 2A. Generated Outputs: Key Metrics + Analytical & Multi-Method Comparison */}
            <section className="glass-card rounded-2xl p-5 space-y-5">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                2. Generated Outputs &amp; Method Comparison
              </h3>

              {/* Key Trajectory Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#070a0f] border border-slate-200 dark:border-slate-800">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Maximum Height (H)</div>
                  <div className="text-2xl font-bold tabular-nums text-amber-600 dark:text-yellow-400 mt-1">
                    {activeSummary.maximum_height.toFixed(4)} m
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#070a0f] border border-slate-200 dark:border-slate-800">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Time of Flight (T)</div>
                  <div className="text-2xl font-bold tabular-nums text-sky-600 dark:text-sky-400 mt-1">
                    {activeSummary.flight_time.toFixed(4)} s
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#070a0f] border border-slate-200 dark:border-slate-800">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Horizontal Range (R)</div>
                  <div className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">
                    {activeSummary.horizontal_range.toFixed(4)} m
                  </div>
                </div>
              </div>

              {/* Ideal Motion: Numerical (RK4) vs Analytical (Closed-Form) with Abs & Pct Error */}
              {methodReport && (
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {activeIsDrag
                        ? 'Air-Resistance RK4 Output vs. Ideal No-Drag Analytical Benchmark'
                        : 'Numerical (RK4) vs. Analytical (Closed-Form Ideal) Error Table'}
                    </h4>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {activeIsDrag
                        ? 'Shows aerodynamic compression relative to vacuum'
                        : 'Closed-form benchmark validation'}
                    </span>
                  </div>

                  <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 dark:bg-[#070a0f] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="px-3.5 py-2.5">Metric</th>
                          <th className="px-3.5 py-2.5 text-right">RK4 Numerical</th>
                          <th className="px-3.5 py-2.5 text-right">
                            {activeIsDrag ? 'Ideal Closed-Form' : 'Analytical Exact'}
                          </th>
                          <th className="px-3.5 py-2.5 text-right">Absolute Error / Δ</th>
                          <th className="px-3.5 py-2.5 text-right">Percentage Error / Δ%</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800 tabular-nums">
                        {(() => {
                          const idealAna = methodReport.methods[0].trajectory.analytical;
                          const rk4Num = rk4Row!;
                          const rows = [
                            {
                              label: 'Maximum Height H (m)',
                              num: rk4Num.maxHeight,
                              ana: idealAna.maxHeight,
                            },
                            {
                              label: 'Time of Flight T (s)',
                              num: rk4Num.flightTime,
                              ana: idealAna.flightTime,
                            },
                            {
                              label: 'Horizontal Range R (m)',
                              num: rk4Num.horizontalRange,
                              ana: idealAna.horizontalRange,
                            },
                            {
                              label: 'Final Speed v_f (m/s)',
                              num: rk4Num.finalVelocity,
                              ana: idealAna.finalVelocity,
                            },
                          ];
                          return rows.map((r) => {
                            const absDiff = Math.abs(r.num - r.ana);
                            const pctDiff = r.ana > 1e-12 ? (absDiff / r.ana) * 100 : null;
                            return (
                              <tr key={r.label}>
                                <td className="px-3.5 py-2 font-sans font-medium text-slate-700 dark:text-slate-300">
                                  {r.label}
                                </td>
                                <td className="px-3.5 py-2 text-right font-semibold">
                                  {r.num.toFixed(6)}
                                </td>
                                <td className="px-3.5 py-2 text-right">{r.ana.toFixed(6)}</td>
                                <td className="px-3.5 py-2 text-right font-mono text-sky-600 dark:text-sky-400">
                                  {activeIsDrag ? absDiff.toFixed(4) : absDiff.toExponential(3)}
                                </td>
                                <td className="px-3.5 py-2 text-right font-mono">
                                  {pctDiff !== null
                                    ? activeIsDrag
                                      ? `${pctDiff.toFixed(2)}%`
                                      : `${pctDiff.toExponential(3)}%`
                                    : 'N/A'}
                                </td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Other Numerical Methods Comparison (RK4 vs Modified Euler vs Euler) */}
              {methodReport && (
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Numerical Method Comparison on Same Inputs (h = {activeConfig.timeStep} s)
                    </h4>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Reference:{' '}
                      {methodReport.referenceSource === 'analytical'
                        ? 'Exact Analytical'
                        : 'Fine-step RK4 (h/8)'}
                    </span>
                  </div>

                  <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 dark:bg-[#070a0f] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="px-3.5 py-2.5">Method</th>
                          <th className="px-3.5 py-2.5">Order</th>
                          <th className="px-3.5 py-2.5 text-right">Max Height H (m)</th>
                          <th className="px-3.5 py-2.5 text-right">Flight Time T (s)</th>
                          <th className="px-3.5 py-2.5 text-right">Range R (m)</th>
                          <th className="px-3.5 py-2.5 text-right">Range Abs Error</th>
                          <th className="px-3.5 py-2.5 text-right">Range % Error</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800 tabular-nums">
                        {methodReport.methods.map((m) => {
                          const usedHere = m.method === activeEntry!.solverMethod;
                          return (
                            <tr
                              key={m.method}
                              className={usedHere ? 'bg-sky-500/8' : undefined}
                            >
                              <td className="px-3.5 py-2 font-sans font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                                {m.label}
                                {usedHere && (
                                  <span className="ml-2 text-[10px] font-medium text-sky-600 dark:text-sky-400">
                                    (Selected Run)
                                  </span>
                                )}
                              </td>
                              <td className="px-3.5 py-2 font-mono text-slate-500 dark:text-slate-400">
                                {m.orderLabel}
                              </td>
                              <td className="px-3.5 py-2 text-right">{m.maxHeight.toFixed(4)}</td>
                              <td className="px-3.5 py-2 text-right">{m.flightTime.toFixed(4)}</td>
                              <td className="px-3.5 py-2 text-right font-semibold">
                                {m.horizontalRange.toFixed(4)}
                              </td>
                              <td className="px-3.5 py-2 text-right font-mono text-sky-600 dark:text-sky-400">
                                {m.rangeAbsError.toExponential(3)} m
                              </td>
                              <td className="px-3.5 py-2 text-right font-mono">
                                {m.rangePctError !== null
                                  ? `${m.rangePctError.toExponential(3)}%`
                                  : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>

            {/* 3. Trajectory Visualizations: y vs x & Comparative Ideal vs Drag Overlay */}
            <section className="glass-card rounded-2xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                    3. Trajectory Visualization (y vs. x) &amp; Ideal vs. Air-Resistance Overlay
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Compares the symmetric ideal parabola against the compressed, asymmetric path
                    caused by aerodynamic drag (ρ={activeConfig.airDensity}, Cd=
                    {activeConfig.dragCoefficient}, A={activeConfig.crossSectionalArea}, m=
                    {activeConfig.mass}).
                  </p>
                </div>

                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showAllMethodsOverlay}
                    onChange={(e) => setShowAllMethodsOverlay(e.target.checked)}
                    className="accent-sky-500 cursor-pointer"
                  />
                  <span>Overlay Euler &amp; Mod Euler</span>
                </label>
              </div>

              {idealVsDragDelta && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs tabular-nums">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#070a0f] border border-slate-200 dark:border-slate-800">
                    <span className="text-slate-500 dark:text-slate-400">Ideal Parabolic Range: </span>
                    <strong className="text-amber-600 dark:text-yellow-400">
                      {idealVsDragDelta.idealRange.toFixed(2)} m
                    </strong>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#070a0f] border border-slate-200 dark:border-slate-800">
                    <span className="text-slate-500 dark:text-slate-400">Air-Drag Range: </span>
                    <strong className="text-emerald-600 dark:text-emerald-400">
                      {idealVsDragDelta.dragRange.toFixed(2)} m
                    </strong>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#070a0f] border border-slate-200 dark:border-slate-800">
                    <span className="text-slate-500 dark:text-slate-400">Drag Compression ΔR: </span>
                    <strong className="text-sky-600 dark:text-sky-400">
                      −{idealVsDragDelta.rangeReduction.toFixed(2)} m
                    </strong>
                  </div>
                </div>
              )}

              <div className="h-[310px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={overlayChartData} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" />
                    <XAxis
                      dataKey="x"
                      type="number"
                      domain={[0, 'auto']}
                      stroke="#94a3b8"
                      tick={{ fontSize: 11 }}
                      label={{
                        value: 'Horizontal Distance x (m)',
                        position: 'insideBottom',
                        offset: -12,
                        fill: '#94a3b8',
                        fontSize: 11,
                      }}
                    />
                    <YAxis
                      stroke="#94a3b8"
                      tick={{ fontSize: 11 }}
                      label={{
                        value: 'Elevation y (m)',
                        angle: -90,
                        position: 'insideLeft',
                        fill: '#94a3b8',
                        fontSize: 11,
                      }}
                    />
                    <Tooltip
                      formatter={(val) =>
                        typeof val === 'number' ? `${val.toFixed(3)} m` : '—'
                      }
                      contentStyle={{
                        backgroundColor: '#0b0f14',
                        borderColor: '#38bdf8',
                        color: '#f8fafc',
                        fontSize: 12,
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="idealY"
                      name="Ideal Parabolic Path y(x)"
                      stroke="#eab308"
                      strokeWidth={2.2}
                      strokeDasharray="6 4"
                      dot={false}
                      connectNulls={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="dragY"
                      name="Air-Resistance Path y(x)"
                      stroke="#22c55e"
                      strokeWidth={2.6}
                      dot={false}
                      connectNulls={false}
                    />
                    {showAllMethodsOverlay && (
                      <>
                        <Line
                          type="monotone"
                          dataKey="modEulerY"
                          name="Modified Euler Path"
                          stroke="#38bdf8"
                          strokeWidth={1.8}
                          dot={false}
                          connectNulls={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="eulerY"
                          name="Forward Euler Path"
                          stroke="#f97316"
                          strokeWidth={1.8}
                          strokeDasharray="3 3"
                          dot={false}
                          connectNulls={false}
                        />
                      </>
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* 4. Error Analysis Plot: Error vs Step Size (h) verifying O(h^4) */}
            <section className="glass-card rounded-2xl p-5 space-y-4">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  4. Error Analysis Plot: Error vs. Step Size (h) — Verifying O(h⁴) Accuracy
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Log₁₀ global range error across varying time steps h, demonstrating fourth-order
                  O(h⁴) convergence of RK4 compared with Modified Euler O(h²) and Euler O(h).
                </p>
              </div>

              <div className="h-[290px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={convergenceRows.map((r) => ({
                      hLabel: `${r.h}s`,
                      logRk4: Number(Math.log10(r.rk4RangeError).toFixed(2)),
                      logModEuler: Number(Math.log10(r.modEulerRangeError).toFixed(2)),
                      logEuler: Number(Math.log10(r.eulerRangeError).toFixed(2)),
                      rk4Raw: r.rk4RangeError,
                      modRaw: r.modEulerRangeError,
                      eulRaw: r.eulerRangeError,
                    }))}
                    margin={{ top: 10, right: 20, left: 10, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" />
                    <XAxis
                      dataKey="hLabel"
                      stroke="#94a3b8"
                      tick={{ fontSize: 11 }}
                      label={{
                        value: 'Step Size h (s)',
                        position: 'insideBottom',
                        offset: -12,
                        fill: '#94a3b8',
                        fontSize: 11,
                      }}
                    />
                    <YAxis
                      stroke="#94a3b8"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v: number) => `10^${v}`}
                      label={{
                        value: 'Log₁₀ Range Error (m)',
                        angle: -90,
                        position: 'insideLeft',
                        fill: '#94a3b8',
                        fontSize: 11,
                      }}
                    />
                    <Tooltip
                      formatter={(_val, name, item) => {
                        const p = item?.payload;
                        if (name === 'RK4 O(h⁴)' && p) return `${p.rk4Raw.toExponential(3)} m`;
                        if (name === 'Modified Euler O(h²)' && p) return `${p.modRaw.toExponential(3)} m`;
                        if (name === 'Euler O(h)' && p) return `${p.eulRaw.toExponential(3)} m`;
                        return String(_val ?? '');
                      }}
                      contentStyle={{
                        backgroundColor: '#0b0f14',
                        borderColor: '#38bdf8',
                        color: '#f8fafc',
                        fontSize: 12,
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="logRk4"
                      name="RK4 O(h⁴)"
                      stroke="#38bdf8"
                      strokeWidth={2.6}
                      dot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="logModEuler"
                      name="Modified Euler O(h²)"
                      stroke="#22c55e"
                      strokeWidth={2}
                      dot={{ r: 3.5 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="logEuler"
                      name="Euler O(h)"
                      stroke="#eab308"
                      strokeWidth={2}
                      dot={{ r: 3.5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 dark:bg-[#070a0f] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-3.5 py-2.5">Step Size h (s)</th>
                      <th className="px-3.5 py-2.5 text-right">Steps</th>
                      <th className="px-3.5 py-2.5 text-right">RK4 Range R (m)</th>
                      <th className="px-3.5 py-2.5 text-right">RK4 Range Error (m)</th>
                      <th className="px-3.5 py-2.5 text-right">Euler Error (m)</th>
                      <th className="px-3.5 py-2.5 text-right">Observed RK4 Order p</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 tabular-nums">
                    {convergenceRows.map((c) => (
                      <tr key={c.h}>
                        <td className="px-3.5 py-2 font-mono">{c.h}</td>
                        <td className="px-3.5 py-2 text-right">{c.steps}</td>
                        <td className="px-3.5 py-2 text-right">{c.rk4Range.toFixed(6)}</td>
                        <td className="px-3.5 py-2 text-right font-mono text-sky-600 dark:text-sky-400">
                          {c.rk4RangeError.toExponential(3)}
                        </td>
                        <td className="px-3.5 py-2 text-right font-mono text-amber-600 dark:text-yellow-400">
                          {c.eulerRangeError.toExponential(3)}
                        </td>
                        <td className="px-3.5 py-2 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                          {c.rk4ObservedOrder !== null ? c.rk4ObservedOrder.toFixed(2) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* 5. Iteration-wise Numerical Data Table (tn, x, y, vx, vy, k1..k4, Yn+1) */}
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    5. Iteration-wise Step Table Method:
                  </span>
                  <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#070a0f] border border-sky-500/20">
                    {(
                      [
                        { id: 'rk4', label: 'RK4 (k₁–k₄)' },
                        { id: 'modified_euler', label: 'Modified Euler' },
                        { id: 'euler', label: 'Euler' },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setTableMethod(m.id);
                          setSelectedIteration(0);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer whitespace-nowrap ${
                          tableMethod === m.id
                            ? 'bg-sky-500 text-slate-950'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  {loadingStepsId === activeEntry!.id && (
                    <span className="text-[11px] text-sky-600 dark:text-sky-400">
                      Loading stored steps...
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => downloadStepsCsv(activeEntry!.title, tableStepsData.steps)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-sky-500/30 bg-white dark:bg-[#0b0f14] text-slate-700 dark:text-slate-200 hover:border-sky-400 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Export Steps CSV</span>
                </button>
              </div>

              <Rk4IterationExplorer
                steps={tableStepsData.steps}
                timeStep={tableStepsData.timeStep}
                selectedIteration={selectedIteration}
                onSelectIteration={setSelectedIteration}
              />
            </section>
          </div>
        </div>
      )}
    </motion.div>
  );
}
