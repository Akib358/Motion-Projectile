import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowUpDown,
  GitCompare,
  PlayCircle,
  Search,
  Trash2,
} from 'lucide-react';
import { SavedSimulationRecord } from '../types/simulation';

interface HistoryViewProps {
  simulations: SavedSimulationRecord[];
  loading: boolean;
  onOpenSimulation: (sim: SavedSimulationRecord) => void;
  onDeleteSimulation: (simId: string) => Promise<void>;
  onStartNew: () => void;
}

export function HistoryView({
  simulations,
  loading,
  onOpenSimulation,
  onDeleteSimulation,
  onStartNew,
}: HistoryViewProps) {
  const [search, setSearch] = useState('');
  const [projectileFilter, setProjectileFilter] = useState<string>('all');
  const [modelFilter, setModelFilter] = useState<string>('all');
  const [sortAsc, setSortAsc] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return simulations
      .filter((s) => {
        if (q && !s.simulationName.toLowerCase().includes(q)) return false;
        if (projectileFilter !== 'all' && s.projectileType !== projectileFilter) return false;
        if (modelFilter !== 'all' && s.physicsModel !== modelFilter) return false;
        return true;
      })
      .sort((a, b) =>
        sortAsc
          ? a.createdAt.localeCompare(b.createdAt)
          : b.createdAt.localeCompare(a.createdAt),
      );
  }, [simulations, search, projectileFilter, modelFilter, sortAsc]);

  const comparedSims = useMemo(
    () => simulations.filter((s) => compareIds.includes(s.id)),
    [simulations, compareIds],
  );

  const toggleCompare = (id: string) => {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 4 ? [...prev, id] : prev,
    );
  };

  if (loading) {
    return (
      <div className="p-8 glass-card rounded-2xl text-sm text-slate-500 dark:text-slate-300">
        Loading your saved simulation history...
      </div>
    );
  }

  if (simulations.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-8 sm:p-10 glass-card rounded-2xl text-center space-y-4"
      >
        <h2 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
          No Saved Simulations Yet
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          Launch a projectile trajectory and save it to inspect, replay, or compare your runs here.
        </p>
        <motion.button
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.98 }}
          type="button"
          onClick={onStartNew}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-emerald-500 text-slate-950 text-sm font-bold cursor-pointer"
        >
          <PlayCircle className="w-4 h-4" aria-hidden="true" />
          <span>Run First Simulation</span>
        </motion.button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-5"
    >
      {/* Search & Filter Controls */}
      <div className="glass-card rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
            aria-hidden="true"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search saved simulations..."
            aria-label="Search saved simulations"
            className="w-full pl-9 pr-3 py-2 text-xs bg-white dark:bg-[#070a0f] border border-sky-500/25 rounded-lg text-slate-900 dark:text-white"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filter by projectile"
            value={projectileFilter}
            onChange={(e) => setProjectileFilter(e.target.value)}
            className="px-3 py-2 text-xs bg-white dark:bg-[#070a0f] border border-sky-500/25 rounded-lg text-slate-800 dark:text-slate-100"
          >
            <option value="all">All Projectiles</option>
            <option value="ball">Ball</option>
            <option value="rocket">Rocket</option>
            <option value="airplane">Airplane</option>
          </select>

          <select
            aria-label="Filter by physics model"
            value={modelFilter}
            onChange={(e) => setModelFilter(e.target.value)}
            className="px-3 py-2 text-xs bg-white dark:bg-[#070a0f] border border-sky-500/25 rounded-lg text-slate-800 dark:text-slate-100"
          >
            <option value="all">All Models</option>
            <option value="ideal">Model A: Ideal</option>
            <option value="quadratic_drag">Model B: Quadratic Drag</option>
          </select>

          <button
            type="button"
            onClick={() => setSortAsc((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs bg-white dark:bg-[#070a0f] border border-sky-500/25 rounded-lg cursor-pointer"
          >
            <ArrowUpDown className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{sortAsc ? 'Oldest First' : 'Newest First'}</span>
          </button>
        </div>
      </div>

      {/* Side-by-Side Comparison Panel */}
      {comparedSims.length >= 2 && (
        <div className="glass-card border-sky-400/50 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-sky-600 dark:text-sky-400">
              <GitCompare className="w-4 h-4" aria-hidden="true" />
              <span>Side-by-Side Comparison ({comparedSims.length})</span>
            </div>
            <button
              type="button"
              onClick={() => setCompareIds([])}
              className="text-xs text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
            >
              Clear
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-slate-500 border-b border-sky-500/20">
                <tr>
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 px-3">Model</th>
                  <th className="py-2 px-3 text-right">v₀ / θ</th>
                  <th className="py-2 px-3 text-right">Flight Time</th>
                  <th className="py-2 px-3 text-right">Max Height</th>
                  <th className="py-2 pl-3 text-right">Range</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800 tabular-nums">
                {comparedSims.map((sim) => (
                  <tr key={sim.id}>
                    <td className="py-2 pr-4 font-sans font-medium">{sim.simulationName}</td>
                    <td className="py-2 px-3">{sim.physicsModel}</td>
                    <td className="py-2 px-3 text-right">
                      {sim.initialVelocity}m/s @ {sim.launchAngleDeg}°
                    </td>
                    <td className="py-2 px-3 text-right">{sim.flightTime.toFixed(3)} s</td>
                    <td className="py-2 px-3 text-right">{sim.maximumHeight.toFixed(3)} m</td>
                    <td className="py-2 pl-3 text-right text-emerald-600 dark:text-emerald-400 font-semibold">
                      {sim.horizontalRange.toFixed(3)} m
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Simulations List */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-[#070a0f] text-slate-500 dark:text-slate-400 border-b border-sky-500/20">
              <tr>
                <th className="px-4 py-3">Compare</th>
                <th className="px-4 py-3">Simulation</th>
                <th className="px-4 py-3">Object · Model</th>
                <th className="px-4 py-3 text-right">Flight Time</th>
                <th className="px-4 py-3 text-right">Max Height</th>
                <th className="px-4 py-3 text-right">Range</th>
                <th className="px-4 py-3 text-right">Date</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
              {filtered.map((sim) => (
                <tr key={sim.id} className="hover:bg-sky-500/5 transition-colors">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Select ${sim.simulationName} for comparison`}
                      checked={compareIds.includes(sim.id)}
                      onChange={() => toggleCompare(sim.id)}
                      className="accent-sky-500 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                    {sim.simulationName}
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                    {sim.projectileType} · {sim.physicsModel}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {sim.flightTime.toFixed(3)} s
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {sim.maximumHeight.toFixed(3)} m
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-sky-600 dark:text-sky-400 font-semibold">
                    {sim.horizontalRange.toFixed(3)} m
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-500">
                    {new Date(sim.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenSimulation(sim)}
                        className="px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-sky-500 to-emerald-500 text-slate-950 font-bold cursor-pointer"
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(sim.id)}
                        aria-label={`Delete ${sim.simulationName}`}
                        className="p-1.5 rounded-lg border border-red-500/30 text-red-500 hover:bg-red-500/10 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {confirmDeleteId && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="max-w-sm w-full glass-card rounded-2xl p-6 space-y-4 shadow-xl">
            <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
              Delete Simulation?
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-300">
              This permanently removes the saved simulation record from your history.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 text-xs font-medium rounded-lg border border-sky-500/25 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const id = confirmDeleteId;
                  setConfirmDeleteId(null);
                  await onDeleteSimulation(id);
                }}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-red-600 hover:bg-red-500 text-white cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
