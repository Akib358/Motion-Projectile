import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Activity,
  AlertCircle,
  BookmarkCheck,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Flame,
  HelpCircle,
  Pause,
  Play,
  RotateCcw,
  Save,
  SkipForward,
  SlidersHorizontal,
  Target,
  Timer,
  Trophy,
  Wind,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PROJECTILE_OPTIONS } from '../data/catalog';
import { soundEngine } from '../lib/soundEngine';
import {
  buildSimulationOutputFromTrajectory,
  CanvasSimulationParams,
  computeAngleComparisonSet,
  computeEnergyBreakdown,
  computeGravityComparisonSet,
  computeTrajectoryWithMethod,
  GRAVITY_PRESETS,
  interpolateTrajectoryAtTime,
  PhysicsState,
} from '../physics/rk4CanvasEngine';
import {
  computeConvergenceApi,
  saveSimulationToDatabase,
} from '../services/simulationService';
import {
  ConvergenceOutput,
  SimulationConfig,
  SimulationOutput,
  SolverMethod,
} from '../types/simulation';
import { Rk4IterationExplorer } from '../components/Rk4IterationExplorer';
import { ChartTabId, ScientificCharts } from '../components/ScientificCharts';
import { LiveGraphsCanvas } from '../components/simulator/LiveGraphsCanvas';
import { PhysicsFormulasAndAbout } from '../components/simulator/PhysicsFormulasAndAbout';
import {
  EffectsQuality,
  EnvironmentPlanet,
  GhostTrail,
  ProjectileCanvasScene,
} from '../components/simulator/ProjectileCanvasScene';

interface SimulationStudioViewProps {
  config: SimulationConfig;
  output: SimulationOutput | null;
  loadedSavedId: string | null;
  solverMethod?: SolverMethod;
  onChangeSolverMethod?: (next: SolverMethod) => void;
  onRecordRun?: (config: SimulationConfig, output: SimulationOutput, method: SolverMethod) => void;
  onChangeConfig: (next: SimulationConfig) => void;
  onOutputChange: (next: SimulationOutput | null) => void;
  onSavedSuccess: (simId: string) => void;
}

type StudioTab = 'simulation' | 'graphs' | 'challenge';

const GHOST_COLORS = ['#38bdf8', '#22c55e', '#facc15', '#0ea5e9', '#4ade80'];

function randomTargetFor(v0: number, gravity: number): number {
  const maxEst = Math.max(40, Math.min(800, ((v0 * v0) / Math.max(1, gravity)) * 0.85));
  const minT = Math.max(15, maxEst * 0.28);
  return Math.round(minT + Math.random() * Math.max(25, maxEst - minT));
}

export function SimulationStudioView({
  config,
  output,
  loadedSavedId,
  solverMethod = 'rk4',
  onChangeSolverMethod,
  onRecordRun,
  onChangeConfig,
  onOutputChange,
  onSavedSuccess,
}: SimulationStudioViewProps) {
  const { firebaseUser, theme, getIdToken } = useAuth();
  const [localSolverMethod, setLocalSolverMethod] = useState<SolverMethod>(solverMethod);
  const activeSolverMethod = onChangeSolverMethod ? solverMethod : localSolverMethod;
  const setSolverMethod = onChangeSolverMethod ?? setLocalSolverMethod;

  // Primary 3 tabs: Simulation | Graphs | Challenge
  const [activeTab, setActiveTab] = useState<StudioTab>('simulation');

  // Physics & playback speed controls
  const dragEnabled = config.physicsModel !== 'ideal';
  const [windSpeed, setWindSpeed] = useState(0);
  const [timeScale, setTimeScale] = useState(1.0);
  const [effectsQuality, setEffectsQuality] = useState<EffectsQuality>('high');
  const [gravityMode, setGravityMode] = useState<string>(() => {
    const found = GRAVITY_PRESETS.find((p) => Math.abs(p.g - config.gravity) < 0.02);
    return found ? found.id : 'custom';
  });

  // Advanced Physics Visual & Animation Toggles (tucked in collapsible panel for clean minimal UX)
  const [showDisplayOptions, setShowDisplayOptions] = useState(false);
  const [countdownEnabled, setCountdownEnabled] = useState(false);
  const [countdownValue, setCountdownValue] = useState<number | null>(null);
  const [showVelocityVectors, setShowVelocityVectors] = useState(true);
  const [showPredictedPath, setShowPredictedPath] = useState(true);
  const [showStroboscopic, setShowStroboscopic] = useState(true);
  const [showRulers, setShowRulers] = useState(true);
  const [showEnergyHud, setShowEnergyHud] = useState(true);
  const [compareDragGap, setCompareDragGap] = useState(true);
  const [angleCompareMode, setAngleCompareMode] = useState(false);
  const [gravityCompareMode, setGravityCompareMode] = useState(false);
  const [showGhostTrails, setShowGhostTrails] = useState(true);
  const [autoCamera, setAutoCamera] = useState(true);

  // Playback & animation loop state (rAF + delta time)
  const [hasLaunched, setHasLaunched] = useState(Boolean(output));
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasLanded, setHasLanded] = useState(false);
  const [apexPauseActive, setApexPauseActive] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [launchTriggerCount, setLaunchTriggerCount] = useState(0);
  const [landingDustCount, setLandingDustCount] = useState(0);
  const [ghostTrails, setGhostTrails] = useState<GhostTrail[]>([]);
  const hasPausedAtApexRef = useRef(false);
  const apexResumeTimerRef = useRef<number | null>(null);

  // Challenge mode state
  const [targetDistance, setTargetDistance] = useState<number>(() =>
    randomTargetFor(config.initialVelocity, config.gravity),
  );
  const [targetRadius] = useState(5);
  const [score, setScore] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [challengeFeedback, setChallengeFeedback] = useState<string | null>(null);
  const [confettiCount, setConfettiCount] = useState(0);
  const [nearMissCount, setNearMissCount] = useState(0);
  const [nearMissDelta, setNearMissDelta] = useState<number | null>(null);

  // Persistence & deeper RK4 inspection state
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(loadedSavedId);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showDeepAnalysis, setShowDeepAnalysis] = useState(false);
  const [selectedIteration, setSelectedIteration] = useState<number | null>(null);
  const [activeChart, setActiveChart] = useState<ChartTabId>('trajectory');
  const [convergence, setConvergence] = useState<ConvergenceOutput | null>(null);
  const [convergenceLoading, setConvergenceLoading] = useState(false);

  const canvasParams: CanvasSimulationParams = useMemo(
    () => ({
      v0: Math.max(0, Math.min(10000, config.initialVelocity)),
      angleDeg: Math.max(0, Math.min(90, config.launchAngleDeg)),
      y0: Math.max(0, Math.min(500, config.initialHeight)),
      gravity: Math.max(0.1, config.gravity),
      dragEnabled,
      dragCoefficient: config.dragCoefficient,
      airDensity: config.airDensity,
      crossSectionalArea: config.crossSectionalArea,
      mass: config.mass,
      windSpeed: dragEnabled ? windSpeed : 0,
    }),
    [
      config.initialVelocity,
      config.launchAngleDeg,
      config.initialHeight,
      config.gravity,
      dragEnabled,
      config.dragCoefficient,
      config.airDensity,
      config.crossSectionalArea,
      config.mass,
      windSpeed,
    ],
  );

  // Live precomputed trajectory using active solver (RK4 / Modified Euler / Euler) & step size h
  const trajectory = useMemo(
    () =>
      computeTrajectoryWithMethod(
        canvasParams,
        Math.max(0.005, Math.min(0.25, config.timeStep || 0.05)),
        activeSolverMethod,
      ),
    [canvasParams, config.timeStep, activeSolverMethod],
  );

  const angleComparisonSet = useMemo(
    () => (angleCompareMode ? computeAngleComparisonSet(canvasParams) : []),
    [angleCompareMode, canvasParams],
  );

  const gravityComparisonSet = useMemo(
    () => (gravityCompareMode ? computeGravityComparisonSet(canvasParams) : []),
    [gravityCompareMode, canvasParams],
  );

  const currentState: PhysicsState = useMemo(() => {
    if (!hasLaunched) {
      const rad = (canvasParams.angleDeg * Math.PI) / 180;
      return {
        t: 0,
        x: 0,
        y: canvasParams.y0,
        vx: canvasParams.v0 * Math.cos(rad),
        vy: canvasParams.v0 * Math.sin(rad),
      };
    }
    return interpolateTrajectoryAtTime(trajectory.points, currentTime);
  }, [
    hasLaunched,
    canvasParams.angleDeg,
    canvasParams.y0,
    canvasParams.v0,
    trajectory.points,
    currentTime,
  ]);

  const energy = useMemo(
    () => computeEnergyBreakdown(currentState, canvasParams),
    [currentState, canvasParams],
  );

  const isNearApexSlowMo = useMemo(() => {
    if (!hasLaunched || !isPlaying || hasLanded) return false;
    const tPeak = trajectory.peakPoint.t;
    const totalT = trajectory.landingPoint.t;
    if (tPeak <= 0.1 || totalT <= 0.3) return false;
    return Math.abs(currentTime - tPeak) <= totalT * 0.045;
  }, [hasLaunched, isPlaying, hasLanded, trajectory.peakPoint.t, trajectory.landingPoint.t, currentTime]);

  useEffect(() => {
    setSavedId(loadedSavedId);
    if (loadedSavedId && output) {
      setHasLaunched(true);
      setIsPlaying(false);
      setHasLanded(true);
      setApexPauseActive(false);
      setCurrentTime(output.summary.flight_time);
      const found = GRAVITY_PRESETS.find((p) => Math.abs(p.g - config.gravity) < 0.02);
      setGravityMode(found ? found.id : 'custom');
    }
  }, [loadedSavedId, output, config.gravity]);

  const handleHitEvaluation = useCallback(
    (landX: number) => {
      if (activeTab !== 'challenge') return;
      setAttempts((a) => a + 1);
      const delta = landX - targetDistance;
      if (Math.abs(delta) <= targetRadius) {
        setScore((s) => s + 100);
        setConfettiCount((c) => c + 1);
        setNearMissDelta(0);
        setChallengeFeedback(
          `Direct hit! Landed at ${landX.toFixed(1)} m (within ±${targetRadius} m of ${targetDistance} m). +100 pts!`,
        );
      } else {
        setNearMissCount((c) => c + 1);
        setNearMissDelta(delta);
        const hint = delta < 0 ? 'Short' : 'Overshot';
        setChallengeFeedback(
          `${hint} by ${Math.abs(delta).toFixed(1)} m. Tune angle or speed and try again.`,
        );
      }
    },
    [activeTab, targetDistance, targetRadius],
  );

  const handleHitEvalRef = useRef(handleHitEvaluation);
  handleHitEvalRef.current = handleHitEvaluation;

  const maxFlightDuration = useMemo(() => {
    let maxT = trajectory.landingPoint.t;
    if (angleCompareMode) {
      for (const item of angleComparisonSet) {
        maxT = Math.max(maxT, item.trajectory.landingPoint.t);
      }
    }
    if (gravityCompareMode) {
      for (const item of gravityComparisonSet) {
        maxT = Math.max(maxT, item.trajectory.landingPoint.t);
      }
    }
    return Math.max(0.01, maxT);
  }, [
    trajectory.landingPoint.t,
    angleCompareMode,
    angleComparisonSet,
    gravityCompareMode,
    gravityComparisonSet,
  ]);

  // Auto-resume cleanly after brief pause at the highest point
  useEffect(() => {
    if (!apexPauseActive) return;
    apexResumeTimerRef.current = window.setTimeout(() => {
      setApexPauseActive(false);
      setIsPlaying(true);
    }, 1650);
    return () => {
      if (apexResumeTimerRef.current) {
        window.clearTimeout(apexResumeTimerRef.current);
        apexResumeTimerRef.current = null;
      }
    };
  }, [apexPauseActive]);

  const handleResumeFromApex = useCallback(() => {
    if (apexResumeTimerRef.current) {
      window.clearTimeout(apexResumeTimerRef.current);
      apexResumeTimerRef.current = null;
    }
    setApexPauseActive(false);
    setIsPlaying(true);
  }, []);

  // requestAnimationFrame delta-time playback loop
  useEffect(() => {
    if (!isPlaying) return;
    let rafId = 0;
    let prev = performance.now();
    const totalFlight = maxFlightDuration;
    const tPeak = trajectory.peakPoint.t;

    const tick = (now: number) => {
      const dtReal = Math.min(0.05, Math.max(0.001, (now - prev) / 1000));
      prev = now;

      setCurrentTime((prevT) => {
        const baseRealPace = totalFlight > 30 ? totalFlight / 12 : 1;
        const nearApex =
          !gravityCompareMode &&
          tPeak > 0.15 &&
          Math.abs(prevT - tPeak) <= totalFlight * 0.045;
        const apexFactor = nearApex ? 0.45 : 1.0;
        const nextT = prevT + dtReal * timeScale * baseRealPace * apexFactor;

        if (
          !hasPausedAtApexRef.current &&
          !gravityCompareMode &&
          tPeak > 0.08 &&
          tPeak < totalFlight - 0.06 &&
          prevT < tPeak &&
          nextT >= tPeak
        ) {
          hasPausedAtApexRef.current = true;
          setIsPlaying(false);
          setApexPauseActive(true);
          return tPeak;
        }

        if (nextT >= totalFlight) {
          setIsPlaying(false);
          setHasLanded(true);
          setLandingDustCount((c) => c + 1);
          soundEngine.playImpact(
            activeTab === 'challenge'
              ? Math.abs(trajectory.landingPoint.x - targetDistance) <= targetRadius
              : null,
          );
          handleHitEvalRef.current(trajectory.landingPoint.x);
          return totalFlight;
        }
        return nextT;
      });

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [
    isPlaying,
    timeScale,
    maxFlightDuration,
    trajectory.peakPoint.t,
    trajectory.landingPoint.x,
    gravityCompareMode,
    activeTab,
    targetDistance,
    targetRadius,
  ]);

  const executeImmediateFire = useCallback(() => {
    setSaveError(null);
    setSavedId(null);

    if (apexResumeTimerRef.current) {
      window.clearTimeout(apexResumeTimerRef.current);
      apexResumeTimerRef.current = null;
    }
    hasPausedAtApexRef.current = false;
    setApexPauseActive(false);

    if (hasLaunched) {
      setGhostTrails((prev) => {
        const nextTrail: GhostTrail = {
          id: `ghost_${Date.now()}`,
          label: `${config.initialVelocity}m/s @ ${config.launchAngleDeg}°`,
          color: GHOST_COLORS[prev.length % GHOST_COLORS.length],
          points: trajectory.points.map((pt) => ({ x: pt.x, y: pt.y })),
          range: trajectory.landingPoint.x,
          maxHeight: trajectory.peakPoint.y,
        };
        return [nextTrail, ...prev].slice(0, 5);
      });
    }

    const generatedOutput = buildSimulationOutputFromTrajectory(
      config,
      trajectory,
      activeSolverMethod,
    );
    onOutputChange(generatedOutput);
    onRecordRun?.(config, generatedOutput, activeSolverMethod);
    setHasLaunched(true);
    setHasLanded(false);
    setCurrentTime(0);
    setLaunchTriggerCount((c) => c + 1);
    setIsPlaying(true);
    soundEngine.playLaunch(config.projectileType);
  }, [hasLaunched, config, trajectory, activeSolverMethod, onOutputChange, onRecordRun]);

  const countdownTimerRef = useRef<number | null>(null);

  const handleLaunch = useCallback(() => {
    if (countdownTimerRef.current) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }

    if (!countdownEnabled) {
      setCountdownValue(null);
      executeImmediateFire();
      return;
    }

    setIsPlaying(false);
    setApexPauseActive(false);
    setCountdownValue(3);
    let current = 3;
    countdownTimerRef.current = window.setInterval(() => {
      current -= 1;
      if (current > 0) {
        setCountdownValue(current);
      } else {
        if (countdownTimerRef.current) {
          window.clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }
        setCountdownValue(null);
        executeImmediateFire();
      }
    }, 650);
  }, [countdownEnabled, executeImmediateFire]);

  const handleReset = useCallback(() => {
    if (countdownTimerRef.current) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (apexResumeTimerRef.current) {
      window.clearTimeout(apexResumeTimerRef.current);
      apexResumeTimerRef.current = null;
    }
    hasPausedAtApexRef.current = false;
    setApexPauseActive(false);
    setCountdownValue(null);
    setIsPlaying(false);
    setHasLaunched(false);
    setHasLanded(false);
    setCurrentTime(0);
    setSaveError(null);
  }, []);

  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) {
        window.clearInterval(countdownTimerRef.current);
      }
      if (apexResumeTimerRef.current) {
        window.clearTimeout(apexResumeTimerRef.current);
      }
    };
  }, []);

  const handleStep = useCallback(() => {
    if (apexResumeTimerRef.current) {
      window.clearTimeout(apexResumeTimerRef.current);
      apexResumeTimerRef.current = null;
    }
    setApexPauseActive(false);

    if (!hasLaunched) {
      hasPausedAtApexRef.current = false;
      const generatedOutput = buildSimulationOutputFromTrajectory(
        config,
        trajectory,
        activeSolverMethod,
      );
      onOutputChange(generatedOutput);
      onRecordRun?.(config, generatedOutput, activeSolverMethod);
      setHasLaunched(true);
      setHasLanded(false);
      setCurrentTime(trajectory.dtUsed);
      setIsPlaying(false);
      return;
    }
    setIsPlaying(false);
    const next = Math.min(
      maxFlightDuration,
      currentTime + Math.max(0.05, trajectory.dtUsed),
    );
    setCurrentTime(next);
    if (next >= maxFlightDuration && !hasLanded) {
      setHasLanded(true);
      setLandingDustCount((c) => c + 1);
      handleHitEvaluation(trajectory.landingPoint.x);
    }
  }, [
    hasLaunched,
    config,
    trajectory,
    onOutputChange,
    maxFlightDuration,
    currentTime,
    hasLanded,
    handleHitEvaluation,
  ]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (!hasLaunched || hasLanded) {
          handleLaunch();
        } else if (apexPauseActive) {
          handleResumeFromApex();
        } else {
          setIsPlaying((p) => !p);
        }
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        handleReset();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onChangeConfig({
          ...config,
          launchAngleDeg: Math.max(0, Math.min(90, config.launchAngleDeg - 1)),
        });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onChangeConfig({
          ...config,
          launchAngleDeg: Math.max(0, Math.min(90, config.launchAngleDeg + 1)),
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    hasLaunched,
    hasLanded,
    apexPauseActive,
    handleLaunch,
    handleResumeFromApex,
    handleReset,
    config,
    onChangeConfig,
  ]);

  const handleProjectileChange = (nextType: 'ball' | 'rocket') => {
    const meta = PROJECTILE_OPTIONS.find((p) => p.id === nextType);
    onChangeConfig({
      ...config,
      projectileType: nextType,
      mass: meta?.defaultMass ?? config.mass,
      dragCoefficient: meta?.defaultCd ?? config.dragCoefficient,
      crossSectionalArea: meta?.defaultArea ?? config.crossSectionalArea,
    });
  };

  const handleSave = async () => {
    if (!firebaseUser) return;
    setSaving(true);
    setSaveError(null);
    try {
      const saveSafeConfig: SimulationConfig = {
        ...config,
        initialVelocity: Math.max(0.5, Math.min(5000, config.initialVelocity || 1)),
        launchAngleDeg: Math.max(0.5, Math.min(89.5, config.launchAngleDeg || 45)),
        timeStep: Math.max(0.005, Math.min(2, trajectory.dtUsed || config.timeStep)),
      };
      const outToSave = output ?? buildSimulationOutputFromTrajectory(saveSafeConfig, trajectory);
      const token = await getIdToken();
      const id = await saveSimulationToDatabase(token, saveSafeConfig, outToSave);
      setSavedId(id);
      onSavedSuccess(id);
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : 'Unable to save simulation.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleRunConvergence = async () => {
    setConvergenceLoading(true);
    try {
      const token = await getIdToken();
      const conv = await computeConvergenceApi(config, token);
      setConvergence(conv);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Convergence check failed.');
    } finally {
      setConvergenceLoading(false);
    }
  };

  const handleNewTarget = () => {
    setTargetDistance(randomTargetFor(config.initialVelocity, config.gravity));
    setChallengeFeedback(null);
    setNearMissDelta(null);
    handleReset();
  };

  const activeOutput = useMemo(
    () =>
      output ??
      buildSimulationOutputFromTrajectory(config, trajectory, activeSolverMethod),
    [output, config, trajectory, activeSolverMethod],
  );

  const displayedTime = hasLaunched && !hasLanded ? currentState.t : trajectory.landingPoint.t;
  const displayedRange = hasLaunched && !hasLanded ? currentState.x : trajectory.landingPoint.x;
  const displayedPeak =
    hasLaunched && !hasLanded
      ? currentState.t >= trajectory.peakPoint.t
        ? trajectory.peakPoint.y
        : currentState.y
      : trajectory.peakPoint.y;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className="space-y-4"
    >
      {/* Clean Minimal Top Toolbar */}
      <div className="glass-card rounded-2xl px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#05070a] border border-sky-500/20 self-start">
          {(
            [
              { id: 'simulation', label: 'Simulation', icon: Flame },
              { id: 'graphs', label: 'Graphs', icon: Activity },
              { id: 'challenge', label: 'Challenge', icon: Target },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`relative px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'text-slate-950'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="studioActiveTab"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    className="absolute inset-0 rounded-lg bg-gradient-to-r from-sky-400 to-emerald-400 shadow-xs"
                  />
                )}
                <Icon className="w-3.5 h-3.5 relative z-10" aria-hidden="true" />
                <span className="relative z-10">{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <input
            aria-label="Experiment name"
            type="text"
            value={config.simulationName}
            onChange={(e) => onChangeConfig({ ...config, simulationName: e.target.value })}
            className="flex-1 sm:w-48 px-3 py-1.5 text-xs font-medium bg-white dark:bg-[#05070a] border border-sky-500/25 rounded-lg text-slate-900 dark:text-white"
            placeholder="Experiment title..."
          />

          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-500/15 hover:bg-sky-500/25 text-sky-700 dark:text-sky-300 border border-sky-500/35 transition-colors cursor-pointer whitespace-nowrap"
          >
            {savedId ? <BookmarkCheck className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
            <span>{saving ? 'Saving...' : savedId ? 'Saved' : 'Save'}</span>
          </button>
        </div>
      </div>

      {/* Main Responsive Layout: Canvas Left/Top (8 cols) + Controls Right/Bottom (4 cols) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <div className="xl:col-span-8 space-y-4">
          {activeTab === 'graphs' ? (
            <LiveGraphsCanvas
              theme={theme}
              trajectory={trajectory}
              analytical={trajectory.analytical}
              dragEnabled={dragEnabled}
              currentState={currentState}
              hasLaunched={hasLaunched}
            />
          ) : (
            <ProjectileCanvasScene
              theme={theme}
              environmentPlanet={
                (gravityMode === 'earth' ||
                gravityMode === 'moon' ||
                gravityMode === 'mars' ||
                gravityMode === 'jupiter'
                  ? gravityMode
                  : 'custom') as EnvironmentPlanet
              }
              projectileType={config.projectileType === 'rocket' ? 'rocket' : 'ball'}
              onChangeProjectileType={handleProjectileChange}
              angleDeg={canvasParams.angleDeg}
              launchHeight={canvasParams.y0}
              initialVelocity={canvasParams.v0}
              windSpeed={dragEnabled ? windSpeed : 0}
              dragEnabled={dragEnabled}
              trajectory={trajectory}
              analytical={trajectory.analytical}
              currentState={currentState}
              hasLaunched={hasLaunched}
              isPlaying={isPlaying}
              hasLanded={hasLanded}
              isPausedAtApex={apexPauseActive}
              onResumeFromApex={handleResumeFromApex}
              launchJustOccurred={launchTriggerCount}
              landingJustOccurred={landingDustCount}
              nearMissTrigger={nearMissCount}
              nearMissDelta={nearMissDelta}
              countdownValue={countdownValue}
              isNearApexSlowMo={isNearApexSlowMo}
              showVelocityVectors={showVelocityVectors}
              showPredictedPath={showPredictedPath}
              showGhostTrails={showGhostTrails}
              showStroboscopic={showStroboscopic}
              showRulers={showRulers}
              compareDragGap={compareDragGap}
              angleCompareMode={angleCompareMode}
              angleComparisonSet={angleComparisonSet}
              gravityCompareMode={gravityCompareMode}
              gravityComparisonSet={gravityComparisonSet}
              autoCamera={autoCamera}
              effectsQuality={effectsQuality}
              ghostTrails={ghostTrails}
              challengeMode={activeTab === 'challenge'}
              challengeTargetX={activeTab === 'challenge' ? targetDistance : null}
              challengeTargetRadius={targetRadius}
              confettiTrigger={confettiCount}
            />
          )}

          {/* Challenge Status Strip */}
          {activeTab === 'challenge' && (
            <div className="glass-card rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs">
                <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                  <Crosshair className="w-4 h-4" />
                  <span>
                    Target: {targetDistance} m (±{targetRadius} m)
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-sky-700 dark:text-sky-300 font-bold tabular-nums">
                  <Trophy className="w-4 h-4 text-yellow-400" />
                  <span>Score: {score}</span>
                </div>
                <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                  Attempts: {attempts}
                </span>
                {nearMissDelta !== null && nearMissDelta !== 0 && (
                  <span className="text-amber-600 dark:text-yellow-300 font-semibold tabular-nums">
                    {nearMissDelta < 0 ? 'Short' : 'Overshot'} by {Math.abs(nearMissDelta).toFixed(1)} m
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {challengeFeedback && (
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                    {challengeFeedback}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleNewTarget}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-sky-500 to-emerald-500 text-slate-950 shrink-0 cursor-pointer"
                >
                  New Target
                </button>
              </div>
            </div>
          )}

          {/* Clean Live / Final Trajectory Metrics */}
          <div className="glass-card rounded-2xl p-4 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                {hasLaunched && !hasLanded
                  ? 'Live Telemetry (RK4)'
                  : hasLaunched
                    ? 'Final Results (RK4)'
                    : 'Predicted Trajectory (RK4)'}
              </span>
              {dragEnabled && (
                <span className="text-[11px] font-medium text-amber-600 dark:text-yellow-300">
                  Air Drag ON · Ideal values shown below
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-3 text-xs">
              <MetricComparisonBox
                label="Flight Time"
                simValue={`${displayedTime.toFixed(2)} s`}
                anaValue={dragEnabled ? `${trajectory.analytical.flightTime.toFixed(2)} s` : null}
                accentClass="text-sky-600 dark:text-sky-400"
              />
              <MetricComparisonBox
                label="Max Height"
                simValue={`${displayedPeak.toFixed(2)} m`}
                anaValue={dragEnabled ? `${trajectory.analytical.maxHeight.toFixed(2)} m` : null}
                accentClass="text-amber-600 dark:text-yellow-400"
              />
              <MetricComparisonBox
                label="Range"
                simValue={`${displayedRange.toFixed(2)} m`}
                anaValue={dragEnabled ? `${trajectory.analytical.horizontalRange.toFixed(2)} m` : null}
                accentClass="text-emerald-600 dark:text-emerald-400"
              />
            </div>

            {showEnergyHud && (
              <div className="pt-2 border-t border-sky-500/15 grid grid-cols-3 gap-3 text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sky-600 dark:text-sky-400 shrink-0">KE</span>
                  <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-sky-400 transition-all duration-75"
                      style={{ width: `${energy.kineticPct}%` }}
                    />
                  </div>
                  <span className="tabular-nums text-slate-600 dark:text-slate-300">
                    {energy.kineticPct.toFixed(0)}%
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">PE</span>
                  <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-75"
                      style={{ width: `${energy.potentialPct}%` }}
                    />
                  </div>
                  <span className="tabular-nums text-slate-600 dark:text-slate-300">
                    {energy.potentialPct.toFixed(0)}%
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-amber-600 dark:text-yellow-400 shrink-0">Tot</span>
                  <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-yellow-400 transition-all duration-75"
                      style={{ width: `${energy.totalPct}%` }}
                    />
                  </div>
                  <span className="tabular-nums text-slate-600 dark:text-slate-300">
                    {energy.totalPct.toFixed(0)}%
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right / Bottom Control Panel */}
        <aside className="xl:col-span-4 glass-card rounded-2xl p-4 space-y-4">
          {/* Circular LAUNCH + Play / Step / Reset + Speed Slider */}
          <div className="flex items-center gap-3.5 pb-3 border-b border-sky-500/20">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.94 }}
              type="button"
              onClick={handleLaunch}
              aria-label="Launch projectile"
              className="pulse-launch w-18 h-18 sm:w-20 sm:h-20 rounded-full shrink-0 bg-gradient-to-br from-sky-400 via-sky-500 to-emerald-400 text-slate-950 font-display font-extrabold text-xs tracking-wider uppercase flex flex-col items-center justify-center gap-0.5 shadow-md cursor-pointer"
            >
              <Play className="w-5 h-5 fill-slate-950" aria-hidden="true" />
              <span>Launch</span>
            </motion.button>

            <div className="flex-1 space-y-2.5 min-w-0">
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  disabled={!hasLaunched || hasLanded}
                  onClick={() => {
                    if (apexPauseActive) {
                      handleResumeFromApex();
                    } else {
                      setIsPlaying((p) => !p);
                    }
                  }}
                  className="px-2 py-2 rounded-xl text-xs font-semibold border border-sky-500/30 bg-white dark:bg-[#05070a] disabled:opacity-40 text-slate-800 dark:text-white inline-flex items-center justify-center gap-1 cursor-pointer"
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{isPlaying ? 'Pause' : 'Play'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleStep}
                  className="px-2 py-2 rounded-xl text-xs font-semibold border border-sky-500/30 bg-white dark:bg-[#05070a] text-slate-800 dark:text-white inline-flex items-center justify-center gap-1 cursor-pointer"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Step</span>
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-2 py-2 rounded-xl text-xs font-semibold border border-yellow-500/35 bg-yellow-500/10 text-amber-700 dark:text-yellow-300 inline-flex items-center justify-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Reset</span>
                </button>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-medium text-slate-600 dark:text-slate-300">
                  <span>Speed</span>
                  <span className="tabular-nums font-semibold text-sky-600 dark:text-sky-400">
                    {timeScale.toFixed(1)}x
                  </span>
                </div>
                <input
                  aria-label="Slow motion time scale slider"
                  type="range"
                  min={0.1}
                  max={2.0}
                  step={0.1}
                  value={timeScale}
                  onChange={(e) => setTimeScale(Number(e.target.value))}
                  className="w-full h-1.5 accent-sky-400 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Launch Kinematics Sliders */}
          <div className="space-y-3">
            <ParamSlider
              id="sim-speed"
              label="Launch Speed (v₀)"
              tooltip="Initial speed leaving the launcher (0 to 10,000 m/s)."
              unit="m/s"
              value={config.initialVelocity}
              min={0}
              max={10000}
              step={1}
              onChange={(v) =>
                onChangeConfig({ ...config, initialVelocity: Math.max(0, Math.min(10000, v)) })
              }
            />

            <ParamSlider
              id="sim-angle"
              label="Launch Angle (θ)"
              tooltip="Elevation angle above horizontal ground (0° to 90°)."
              unit="°"
              value={config.launchAngleDeg}
              min={0}
              max={90}
              step={0.5}
              onChange={(v) =>
                onChangeConfig({ ...config, launchAngleDeg: Math.max(0, Math.min(90, v)) })
              }
            />

            <ParamSlider
              id="sim-height"
              label="Launch Height (y₀)"
              tooltip="Initial vertical height above ground (0 to 500 m)."
              unit="m"
              value={config.initialHeight}
              min={0}
              max={500}
              step={1}
              onChange={(v) =>
                onChangeConfig({ ...config, initialHeight: Math.max(0, Math.min(500, v)) })
              }
            />

            <ParamSlider
              id="sim-timestep"
              label="Time Step (h)"
              tooltip="Integration step size in seconds (recommended h ≤ 0.1 s)."
              unit="s"
              value={config.timeStep}
              min={0.005}
              max={0.25}
              step={0.005}
              onChange={(v) =>
                onChangeConfig({ ...config, timeStep: Math.max(0.005, Math.min(0.25, v)) })
              }
            />

            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  Numerical Method
                </span>
                <span className="text-[11px] font-semibold text-sky-600 dark:text-sky-400">
                  {activeSolverMethod === 'rk4'
                    ? 'RK4 O(h⁴)'
                    : activeSolverMethod === 'modified_euler'
                      ? 'Mod Euler O(h²)'
                      : 'Euler O(h)'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {(
                  [
                    { id: 'rk4', label: 'RK4' },
                    { id: 'modified_euler', label: 'Mod Euler' },
                    { id: 'euler', label: 'Euler' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSolverMethod(m.id)}
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                      activeSolverMethod === m.id
                        ? 'bg-sky-500/20 border-sky-400 text-sky-700 dark:text-sky-300'
                        : 'bg-slate-50 dark:bg-[#05070a] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Gravity Presets */}
          <div className="pt-2 border-t border-sky-500/20 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                Gravity (g)
              </span>
              <span className="tabular-nums font-semibold text-sky-600 dark:text-sky-400">
                {config.gravity.toFixed(2)} m/s²
              </span>
            </div>

            <div className="grid grid-cols-5 gap-1">
              {GRAVITY_PRESETS.map((planet) => {
                const selected = gravityMode === planet.id;
                return (
                  <button
                    key={planet.id}
                    type="button"
                    onClick={() => {
                      setGravityMode(planet.id);
                      onChangeConfig({ ...config, gravity: planet.g });
                    }}
                    className={`py-1.5 px-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                      selected
                        ? 'bg-sky-500/20 border-sky-400 text-sky-700 dark:text-sky-300'
                        : 'bg-slate-50 dark:bg-[#05070a] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {planet.name}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setGravityMode('custom')}
                className={`py-1.5 px-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                  gravityMode === 'custom'
                    ? 'bg-emerald-500/20 border-emerald-400 text-emerald-700 dark:text-emerald-300'
                    : 'bg-slate-50 dark:bg-[#05070a] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                Custom
              </button>
            </div>

            {gravityMode === 'custom' && (
              <ParamSlider
                id="sim-custom-g"
                label="Custom g"
                tooltip="Set any gravity from 0.2 to 50 m/s²."
                unit="m/s²"
                value={config.gravity}
                min={0.2}
                max={50}
                step={0.05}
                onChange={(v) => onChangeConfig({ ...config, gravity: Math.max(0.1, v) })}
              />
            )}
          </div>

          {/* Air Drag & Wind */}
          <div className="pt-2 border-t border-sky-500/20 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Wind className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Air Resistance
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={dragEnabled}
                onClick={() =>
                  onChangeConfig({
                    ...config,
                    physicsModel: dragEnabled ? 'ideal' : 'quadratic_drag',
                  })
                }
                className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                  dragEnabled
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                {dragEnabled ? 'ON' : 'OFF'}
              </button>
            </div>

            {dragEnabled && (
              <div className="space-y-3">
                <ParamSlider
                  id="sim-rho"
                  label="Air Density (ρ)"
                  tooltip="Atmospheric air density in kg/m³ (sea level default 1.225)."
                  unit="kg/m³"
                  value={config.airDensity}
                  min={0.05}
                  max={3.0}
                  step={0.005}
                  onChange={(v) => onChangeConfig({ ...config, airDensity: Math.max(0.01, v) })}
                />
                <ParamSlider
                  id="sim-cd"
                  label="Drag Coefficient (Cd)"
                  tooltip="Dimensionless aerodynamic drag coefficient."
                  unit="—"
                  value={config.dragCoefficient}
                  min={0.05}
                  max={2.0}
                  step={0.01}
                  onChange={(v) => onChangeConfig({ ...config, dragCoefficient: Math.max(0, v) })}
                />
                <ParamSlider
                  id="sim-area"
                  label="Cross-Sectional Area (A)"
                  tooltip="Frontal surface area of the projectile in m²."
                  unit="m²"
                  value={config.crossSectionalArea}
                  min={0.001}
                  max={1.0}
                  step={0.001}
                  onChange={(v) =>
                    onChangeConfig({ ...config, crossSectionalArea: Math.max(0.0005, v) })
                  }
                />
                <ParamSlider
                  id="sim-mass"
                  label="Mass (m)"
                  tooltip="Total mass of the projectile in kg."
                  unit="kg"
                  value={config.mass}
                  min={0.05}
                  max={100}
                  step={0.05}
                  onChange={(v) => onChangeConfig({ ...config, mass: Math.max(0.01, v) })}
                />
                <ParamSlider
                  id="sim-wind"
                  label="Wind Speed"
                  tooltip="Horizontal headwind (-) or tailwind (+)."
                  unit="m/s"
                  value={windSpeed}
                  min={-30}
                  max={30}
                  step={1}
                  onChange={setWindSpeed}
                />
              </div>
            )}
          </div>

          {/* Collapsible Display & Comparison Options (keeps default UI minimal) */}
          <div className="pt-2 border-t border-sky-500/20">
            <button
              type="button"
              onClick={() => setShowDisplayOptions((v) => !v)}
              className="w-full py-1.5 flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-sky-600 dark:hover:text-sky-400 cursor-pointer"
            >
              <span className="inline-flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-sky-500" aria-hidden="true" />
                <span>Display &amp; Compare Options</span>
              </span>
              {showDisplayOptions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showDisplayOptions && (
              <div className="pt-2.5 space-y-2.5">
                <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => {
                      setAngleCompareMode((v) => !v);
                      setGravityCompareMode(false);
                    }}
                    className={`px-2.5 py-1.5 rounded-lg font-semibold border cursor-pointer ${
                      angleCompareMode
                        ? 'bg-yellow-500/20 border-yellow-400 text-amber-700 dark:text-yellow-300'
                        : 'bg-slate-50 dark:bg-[#05070a] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    30° / 45° / 60°
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setGravityCompareMode((v) => !v);
                      setAngleCompareMode(false);
                    }}
                    className={`px-2.5 py-1.5 rounded-lg font-semibold border cursor-pointer ${
                      gravityCompareMode
                        ? 'bg-emerald-500/20 border-emerald-400 text-emerald-700 dark:text-emerald-300'
                        : 'bg-slate-50 dark:bg-[#05070a] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Earth · Moon · Mars
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                  {[
                    { label: 'Velocity Vectors', val: showVelocityVectors, set: setShowVelocityVectors },
                    { label: 'Predicted Path', val: showPredictedPath, set: setShowPredictedPath },
                    { label: 'Strobe Multi-Flash', val: showStroboscopic, set: setShowStroboscopic },
                    { label: 'Energy Bars', val: showEnergyHud, set: setShowEnergyHud },
                    { label: 'H & R Rulers', val: showRulers, set: setShowRulers },
                    { label: '3-2-1 Countdown', val: countdownEnabled, set: setCountdownEnabled },
                    { label: 'Ideal Drag Gap', val: compareDragGap, set: setCompareDragGap },
                    { label: 'Ghost Trails (5)', val: showGhostTrails, set: setShowGhostTrails },
                    { label: 'Auto Camera', val: autoCamera, set: setAutoCamera },
                  ].map((tog) => (
                    <label
                      key={tog.label}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-[#05070a] border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={tog.val}
                        onChange={(e) => tog.set(e.target.checked)}
                        className="accent-sky-400 cursor-pointer"
                      />
                      <span className="truncate">{tog.label}</span>
                    </label>
                  ))}
                </div>

                <div className="flex items-center justify-between text-[11px] pt-1">
                  <span className="text-slate-500 dark:text-slate-400">Effects Quality</span>
                  <div className="flex items-center gap-1">
                    {(['low', 'medium', 'high'] as const).map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setEffectsQuality(q)}
                        className={`px-2 py-0.5 rounded capitalize font-semibold cursor-pointer ${
                          effectsQuality === q
                            ? 'bg-sky-500 text-slate-950'
                            : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {saveError && (
            <div
              role="alert"
              className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/35 text-xs text-red-600 dark:text-red-300 flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{saveError}</span>
            </div>
          )}
        </aside>
      </div>

      {/* Formulas Panel + About This Physics */}
      <PhysicsFormulasAndAbout dragEnabled={dragEnabled} />

      {/* Expandable RK4 Step Table & Convergence Explorer */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowDeepAnalysis((v) => !v)}
          className="w-full px-5 py-3.5 flex items-center justify-between text-xs font-semibold text-slate-800 dark:text-sky-300 hover:bg-sky-500/5 transition-colors cursor-pointer"
        >
          <span>
            RK4 Numerical Step Table &amp; Convergence ({trajectory.steps.length} steps)
          </span>
          {showDeepAnalysis ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showDeepAnalysis && (
          <div className="p-5 pt-2 space-y-6 border-t border-sky-500/15">
            <ScientificCharts
              output={activeOutput}
              convergence={convergence}
              convergenceLoading={convergenceLoading}
              onRunConvergence={handleRunConvergence}
              activeChart={activeChart}
              onChangeChart={setActiveChart}
              selectedIteration={selectedIteration}
              onSelectIteration={setSelectedIteration}
            />
            <Rk4IterationExplorer
              steps={trajectory.steps}
              timeStep={trajectory.dtUsed}
              selectedIteration={selectedIteration}
              onSelectIteration={(iter) => {
                setSelectedIteration(iter);
                const st = trajectory.steps.find((s) => s.iteration === iter);
                if (st) {
                  setHasLaunched(true);
                  setIsPlaying(false);
                  setCurrentTime(st.t);
                }
              }}
            />
          </div>
        )}
      </div>
    </motion.div>
  );
}

function MetricComparisonBox({
  label,
  simValue,
  anaValue,
  accentClass,
}: {
  label: string;
  simValue: string;
  anaValue: string | null;
  accentClass: string;
}) {
  return (
    <motion.div
      layout
      className="p-2.5 sm:p-3 rounded-xl bg-slate-50 dark:bg-[#070a0f] border border-sky-500/20 space-y-1"
    >
      <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
        <Timer className="w-3 h-3 opacity-70 hidden sm:inline" />
        <span className="truncate">{label}</span>
      </div>
      <div className={`text-sm sm:text-lg font-bold tabular-nums ${accentClass}`}>{simValue}</div>
      {anaValue && (
        <div className="text-[10px] sm:text-[11px] text-amber-600 dark:text-yellow-400 tabular-nums">
          Ideal: {anaValue}
        </div>
      )}
    </motion.div>
  );
}

function ParamSlider({
  id,
  label,
  tooltip,
  unit,
  value,
  min,
  max,
  step,
  onChange,
}: {
  id: string;
  label: string;
  tooltip: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={id}
          title={tooltip}
          className="text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1"
        >
          <span>{label}</span>
          <HelpCircle className="w-3 h-3 text-sky-500/80" aria-hidden="true" />
        </label>
        <div className="flex items-center gap-1">
          <input
            id={id}
            type="number"
            value={Number.isFinite(value) ? value : 0}
            min={min}
            max={max}
            step={step}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-20 px-2 py-0.5 text-xs font-semibold tabular-nums text-right bg-white dark:bg-[#05070a] border border-sky-500/30 rounded-md text-slate-900 dark:text-white"
          />
          <span className="text-[11px] text-slate-500 dark:text-slate-400 w-7">{unit}</span>
        </div>
      </div>
      <input
        aria-label={`${label} slider`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.max(min, Math.min(max, Number.isFinite(value) ? value : min))}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 rounded-lg accent-sky-500 cursor-pointer"
      />
    </div>
  );
}
