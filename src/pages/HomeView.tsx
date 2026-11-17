import { motion } from 'motion/react';
import { ArrowRight, History, PlayCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PROJECTILE_OPTIONS } from '../data/catalog';
import { AppPage, ProjectileType, SavedSimulationRecord } from '../types/simulation';
import { ProjectilePreviewThumb } from '../components/ProjectilePreviewThumb';

interface HomeViewProps {
  simulations: SavedSimulationRecord[];
  loadingHistory: boolean;
  onNavigate: (page: AppPage) => void;
  onStartWithProjectile: (projectile: ProjectileType) => void;
  onOpenSaved: (sim: SavedSimulationRecord) => void;
}

export function HomeView({
  simulations,
  loadingHistory,
  onNavigate,
  onStartWithProjectile,
  onOpenSaved,
}: HomeViewProps) {
  const { profile } = useAuth();
  const recent = simulations.slice(0, 4);
  const presets = PROJECTILE_OPTIONS.filter((p) => p.id === 'ball' || p.id === 'rocket');

  return (
    <div className="space-y-5">
      {/* Minimal Hero Card */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="glass-card rounded-2xl p-5 sm:p-7 flex flex-col lg:flex-row lg:items-center justify-between gap-5"
      >
        <div className="space-y-2 max-w-2xl">
          <div className="text-xs font-semibold text-sky-600 dark:text-sky-400">
            Interactive RK4 Projectile Studio
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Welcome, {profile?.displayName || 'Researcher'}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Launch a ball or rocket on the live physics canvas, explore kinematic
            graphs, or test your aim in Target Challenge.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.98 }}
            type="button"
            onClick={() => onNavigate('new-simulation')}
            className="inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-emerald-500 hover:opacity-95 text-slate-950 text-sm font-bold transition-all shadow-sm whitespace-nowrap cursor-pointer"
          >
            <PlayCircle className="w-4 h-4" aria-hidden="true" />
            <span>Open Simulator</span>
          </motion.button>

          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.98 }}
            type="button"
            onClick={() => onNavigate('history')}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl bg-white dark:bg-[#080c11] hover:border-sky-400 border border-sky-500/25 text-sm font-medium text-slate-800 dark:text-slate-200 transition-colors whitespace-nowrap cursor-pointer"
          >
            <History className="w-4 h-4" aria-hidden="true" />
            <span>Saved Runs</span>
          </motion.button>
        </div>
      </motion.section>

      {/* Quick Launch Vehicle Presets: Ball / Rocket */}
      <section className="space-y-3">
        <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
          Choose Projectile
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {presets.map((obj) => (
            <motion.button
              key={obj.id}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.985 }}
              type="button"
              onClick={() => onStartWithProjectile(obj.id)}
              className="glass-card p-4 text-left rounded-2xl hover:border-sky-400 transition-all flex items-center gap-3.5 cursor-pointer"
            >
              <ProjectilePreviewThumb type={obj.id} className="w-11 h-11 shrink-0" />
              <div className="min-w-0">
                <div className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                  {obj.name}
                </div>
                <div className="text-xs text-sky-600 dark:text-sky-400 truncate mt-0.5">
                  {obj.subtitle}
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      </section>

      {/* Recent Simulations */}
      <section className="glass-card rounded-2xl p-5 space-y-3.5">
        <div className="flex items-center justify-between gap-4">
          <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            Recent Simulations
          </h3>
          {simulations.length > 0 && (
            <button
              type="button"
              onClick={() => onNavigate('history')}
              className="text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <span>View all ({simulations.length})</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        {loadingHistory ? (
          <div className="py-6 text-sm text-slate-500 dark:text-slate-400">
            Loading saved simulations...
          </div>
        ) : recent.length === 0 ? (
          <div className="p-6 rounded-xl border border-dashed border-sky-500/30 bg-slate-50/70 dark:bg-[#070a0f] text-center space-y-3">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              You have no saved simulations yet.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('new-simulation')}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold bg-gradient-to-r from-sky-500 to-emerald-500 text-slate-950 rounded-lg cursor-pointer"
            >
              <PlayCircle className="w-4 h-4" aria-hidden="true" />
              <span>Launch First Simulation</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {recent.map((sim) => (
              <button
                key={sim.id}
                type="button"
                onClick={() => onOpenSaved(sim)}
                className="p-4 text-left rounded-xl border border-sky-500/20 hover:border-sky-400 bg-slate-50/80 dark:bg-[#070a0f] transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm text-slate-900 dark:text-white truncate">
                    {sim.simulationName}
                  </span>
                  <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                    {sim.physicsModel}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs font-medium tabular-nums text-slate-600 dark:text-slate-300">
                  <div>R: {sim.horizontalRange.toFixed(2)} m</div>
                  <div>H: {sim.maximumHeight.toFixed(2)} m</div>
                  <div>T: {sim.flightTime.toFixed(2)} s</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
