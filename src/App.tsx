/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { AppShell } from './components/AppShell';
import { AppLogo } from './components/AppLogo';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoginView } from './components/LoginView';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DEFAULT_SIMULATION_CONFIG, PROJECTILE_OPTIONS } from './data/catalog';
import { AnalyticsView } from './pages/AnalyticsView';
import { HistoryView } from './pages/HistoryView';
import { HomeView } from './pages/HomeView';
import { LearnRk4View } from './pages/LearnRk4View';
import { ProfileView, SettingsView } from './pages/ProfileAndSettingsViews';
import { SimulationStudioView } from './pages/SimulationStudioView';
import {
  deleteUserSimulation,
  listUserSimulations,
  loadSimulationSteps,
} from './services/simulationService';
import {
  AnalyzedSimulationEntry,
  AppPage,
  ProjectileType,
  SavedSimulationRecord,
  SimulationConfig,
  SimulationOutput,
  SolverMethod,
} from './types/simulation';

function buildConfigFromSaved(sim: SavedSimulationRecord): SimulationConfig {
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

function isSameRunParameters(
  a: SimulationConfig,
  aMethod: SolverMethod,
  b: SimulationConfig,
  bMethod: SolverMethod,
): boolean {
  return (
    aMethod === bMethod &&
    a.projectileType === b.projectileType &&
    a.physicsModel === b.physicsModel &&
    Math.abs(a.initialVelocity - b.initialVelocity) < 1e-6 &&
    Math.abs(a.launchAngleDeg - b.launchAngleDeg) < 1e-6 &&
    Math.abs(a.gravity - b.gravity) < 1e-6 &&
    Math.abs(a.timeStep - b.timeStep) < 1e-6 &&
    Math.abs(a.initialHeight - b.initialHeight) < 1e-6 &&
    Math.abs(a.airDensity - b.airDensity) < 1e-6 &&
    Math.abs(a.dragCoefficient - b.dragCoefficient) < 1e-6 &&
    Math.abs(a.crossSectionalArea - b.crossSectionalArea) < 1e-6 &&
    Math.abs(a.mass - b.mass) < 1e-6
  );
}

function ProjectileLabApp() {
  const { firebaseUser, loading, getIdToken } = useAuth();
  const [activePage, setActivePage] = useState<AppPage>('home');
  const [simulations, setSimulations] = useState<SavedSimulationRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [config, setConfig] = useState<SimulationConfig>(DEFAULT_SIMULATION_CONFIG);
  const [solverMethod, setSolverMethod] = useState<SolverMethod>('rk4');
  const [output, setOutput] = useState<SimulationOutput | null>(null);
  const [loadedSavedId, setLoadedSavedId] = useState<string | null>(null);
  const [sessionRuns, setSessionRuns] = useState<AnalyzedSimulationEntry[]>([]);
  const [actionBanner, setActionBanner] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseUser?.uid) {
      setSessionRuns([]);
      return;
    }
    try {
      const raw = window.localStorage.getItem(`projectile_lab_runs_${firebaseUser.uid}`);
      if (raw) {
        const parsed = JSON.parse(raw) as AnalyzedSimulationEntry[];
        if (Array.isArray(parsed)) {
          const valid = parsed.filter(
            (item) =>
              item &&
              typeof item.id === 'string' &&
              typeof item.title === 'string' &&
              item.config &&
              typeof item.config.initialVelocity === 'number',
          );
          setSessionRuns(valid.slice(0, 40));
        }
      } else {
        setSessionRuns([]);
      }
    } catch {
      setSessionRuns([]);
    }
  }, [firebaseUser?.uid]);

  useEffect(() => {
    if (!firebaseUser?.uid) return;
    try {
      // Trim steps when persisting to localStorage to keep storage lightweight; steps re-compute cleanly if needed
      const compact = sessionRuns.slice(0, 30).map((entry) => ({
        ...entry,
        output: entry.output
          ? {
              ...entry.output,
              steps: entry.output.steps.slice(0, 400),
            }
          : null,
      }));
      window.localStorage.setItem(
        `projectile_lab_runs_${firebaseUser.uid}`,
        JSON.stringify(compact),
      );
    } catch {
      // Ignore storage quota errors safely
    }
  }, [sessionRuns, firebaseUser?.uid]);

  const refreshHistory = useCallback(async () => {
    if (!firebaseUser) {
      setSimulations([]);
      return;
    }
    setLoadingHistory(true);
    try {
      const token = await getIdToken();
      const items = await listUserSimulations(token);
      setSimulations(items);
    } catch (error) {
      setActionBanner(
        error instanceof Error ? error.message : 'Unable to load saved simulations.',
      );
    } finally {
      setLoadingHistory(false);
    }
  }, [firebaseUser, getIdToken]);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  const handleRecordRun = useCallback(
    (runConfig: SimulationConfig, runOutput: SimulationOutput, method: SolverMethod) => {
      setSessionRuns((prev) => {
        const rawTitle = runConfig.simulationName.trim() || 'Projectile Test Case';
        const existingMatchIdx = prev.findIndex(
          (item) =>
            item.title === rawTitle &&
            isSameRunParameters(item.config, item.solverMethod, runConfig, method),
        );
        if (existingMatchIdx >= 0) {
          const updated = [...prev];
          updated[existingMatchIdx] = {
            ...updated[existingMatchIdx],
            config: { ...runConfig, simulationName: rawTitle },
            solverMethod: method,
            output: runOutput,
            createdAt: new Date().toISOString(),
          };
          return updated;
        }

        const takenTitles = new Set([
          ...prev.map((p) => p.title),
          ...simulations.map((s) => s.simulationName),
        ]);
        let uniqueTitle = rawTitle;
        if (takenTitles.has(uniqueTitle)) {
          let idx = 2;
          while (takenTitles.has(`${rawTitle} #${idx}`)) {
            idx += 1;
          }
          uniqueTitle = `${rawTitle} #${idx}`;
        }

        const nextEntry: AnalyzedSimulationEntry = {
          id: `run_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          title: uniqueTitle,
          source: 'simulator',
          solverMethod: method,
          config: { ...runConfig, simulationName: uniqueTitle },
          output: runOutput,
          savedId: null,
          createdAt: new Date().toISOString(),
        };
        return [nextEntry, ...prev].slice(0, 40);
      });
    },
    [simulations],
  );

  const handleStartWithProjectile = (projectile: ProjectileType) => {
    const meta = PROJECTILE_OPTIONS.find((p) => p.id === projectile);
    setConfig((prev) => ({
      ...prev,
      projectileType: projectile,
      mass: meta?.defaultMass ?? prev.mass,
      dragCoefficient: meta?.defaultCd ?? prev.dragCoefficient,
      crossSectionalArea: meta?.defaultArea ?? prev.crossSectionalArea,
      dryMass: meta ? Number((meta.defaultMass * 0.62).toFixed(2)) : prev.dryMass,
    }));
    setOutput(null);
    setLoadedSavedId(null);
    setActivePage('new-simulation');
  };

  const handleOpenSaved = async (sim: SavedSimulationRecord) => {
    if (!firebaseUser) return;
    setActionBanner(null);
    try {
      const token = await getIdToken();
      const steps = await loadSimulationSteps(token, sim.id);
      const lastStep = steps[steps.length - 1];
      const reconstructed: SimulationOutput = {
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
          vx: lastStep ? lastStep.next_state[2] : 0,
          vy: lastStep ? lastStep.next_state[3] : 0,
          speed: sim.finalVelocity,
        },
        analytical: sim.analyticalSummary,
        errors: sim.errorsSummary,
        steps,
      };
      setConfig(buildConfigFromSaved(sim));
      setSolverMethod('rk4');
      setOutput(reconstructed);
      setLoadedSavedId(sim.id);
      setActivePage('new-simulation');
    } catch (error) {
      setActionBanner(
        error instanceof Error ? error.message : 'Unable to load saved simulation steps.',
      );
    }
  };

  const handleOpenAnalyzedEntry = (entry: AnalyzedSimulationEntry) => {
    setConfig({ ...entry.config });
    setSolverMethod(entry.solverMethod);
    setOutput(entry.output);
    setLoadedSavedId(entry.savedId ?? null);
    setActivePage('new-simulation');
  };

  const handleDeleteSimulation = async (simId: string) => {
    if (!firebaseUser) return;
    const token = await getIdToken();
    await deleteUserSimulation(token, simId);
    setSimulations((prev) => prev.filter((item) => item.id !== simId));
    setSessionRuns((prev) => prev.filter((item) => item.savedId !== simId));
    if (loadedSavedId === simId) {
      setLoadedSavedId(null);
    }
  };

  const handleDeleteAnalyzedEntry = async (entry: AnalyzedSimulationEntry) => {
    if (entry.savedId && firebaseUser) {
      await handleDeleteSimulation(entry.savedId);
    }
    setSessionRuns((prev) => prev.filter((item) => item.id !== entry.id));
  };

  const handleClearSessionRuns = () => {
    setSessionRuns([]);
  };

  if (loading) {
    return (
      <div className="min-h-screen lab-grid-surface text-slate-900 dark:text-slate-100 flex flex-col items-center justify-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white p-0.5 object-contain border border-sky-400/40 flex items-center justify-center overflow-hidden">
            <AppLogo className="w-full h-full" size={28} />
          </div>
          <span className="font-display text-lg font-bold tracking-tight">PROJECTILE LAB</span>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-sky-700 dark:text-sky-300">
          <Loader2 className="w-4 h-4 animate-spin text-emerald-500 dark:text-yellow-400" aria-hidden="true" />
          <span>Initializing Projectile Lab...</span>
        </div>
      </div>
    );
  }

  if (!firebaseUser) {
    return <LoginView />;
  }

  return (
    <AppShell activePage={activePage} onNavigate={setActivePage}>
      {actionBanner && (
        <div
          role="alert"
          className="mb-6 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/35 text-xs text-amber-700 dark:text-yellow-300 flex items-center justify-between gap-4"
        >
          <span>{actionBanner}</span>
          <button
            type="button"
            onClick={() => setActionBanner(null)}
            className="text-xs underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={activePage}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        >
          {activePage === 'home' && (
            <HomeView
              simulations={simulations}
              loadingHistory={loadingHistory}
              onNavigate={setActivePage}
              onStartWithProjectile={handleStartWithProjectile}
              onOpenSaved={handleOpenSaved}
            />
          )}

          {activePage === 'new-simulation' && (
            <SimulationStudioView
              config={config}
              output={output}
              loadedSavedId={loadedSavedId}
              solverMethod={solverMethod}
              onChangeSolverMethod={setSolverMethod}
              onRecordRun={handleRecordRun}
              onChangeConfig={setConfig}
              onOutputChange={setOutput}
              onSavedSuccess={(simId) => {
                setLoadedSavedId(simId);
                refreshHistory();
              }}
            />
          )}

          {activePage === 'history' && (
            <HistoryView
              simulations={simulations}
              loading={loadingHistory}
              onOpenSimulation={handleOpenSaved}
              onDeleteSimulation={handleDeleteSimulation}
              onStartNew={() => {
                setOutput(null);
                setLoadedSavedId(null);
                setActivePage('new-simulation');
              }}
            />
          )}

          {activePage === 'analytics' && (
            <AnalyticsView
              simulations={simulations}
              sessionRuns={sessionRuns}
              onOpenInSimulator={handleOpenAnalyzedEntry}
              onDeleteEntry={handleDeleteAnalyzedEntry}
              onClearSessionRuns={handleClearSessionRuns}
              onStartNew={() => {
                setOutput(null);
                setLoadedSavedId(null);
                setActivePage('new-simulation');
              }}
            />
          )}

          {activePage === 'learn-rk4' && <LearnRk4View />}

          {activePage === 'profile' && <ProfileView simulationCount={simulations.length} />}

          {activePage === 'settings' && <SettingsView />}
        </motion.div>
      </AnimatePresence>
    </AppShell>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ProjectileLabApp />
      </AuthProvider>
    </ErrorBoundary>
  );
}
