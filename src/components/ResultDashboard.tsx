import { motion } from 'motion/react';
import { AlertTriangle, CheckCircle2, Save } from 'lucide-react';
import { PHYSICS_MODELS } from '../data/catalog';
import { SimulationConfig, SimulationOutput } from '../types/simulation';
import { ChartTabId } from './ScientificCharts';

interface ResultDashboardProps {
  config: SimulationConfig;
  output: SimulationOutput;
  saving: boolean;
  savedId: string | null;
  onSaveSimulation: () => void;
  onExportCsv?: () => void;
  onInspectChart: (chartId: ChartTabId) => void;
}

export function ResultDashboard({
  config,
  output,
  saving,
  savedId,
  onSaveSimulation,
  onInspectChart,
}: ResultDashboardProps) {
  const s = output.summary;
  const modelMeta = PHYSICS_MODELS.find((m) => m.id === config.physicsModel);

  const metricCards: {
    label: string;
    value: string;
    badge: string;
    chartTarget: ChartTabId;
  }[] = [
    {
      label: 'Total Flight Time (T)',
      value: `${s.flight_time.toFixed(4)} s`,
      badge: 'Linearly Interpolated Landing',
      chartTarget: 'y_time',
    },
    {
      label: 'Horizontal Range (R)',
      value: `${s.horizontal_range.toFixed(3)} m`,
      badge: 'Linearly Interpolated Range',
      chartTarget: 'trajectory',
    },
    {
      label: 'Maximum Height (H)',
      value: `${s.maximum_height.toFixed(4)} m`,
      badge: 'Parabolically Refined Peak',
      chartTarget: 'y_time',
    },
    {
      label: 'Initial Velocity (v₀)',
      value: `${s.initial_velocity.toFixed(2)} m/s`,
      badge: 'Configured Input',
      chartTarget: 'speed_time',
    },
    {
      label: 'Final Velocity (v_f)',
      value: `${s.final_velocity.toFixed(3)} m/s`,
      badge: 'Interpolated Impact Speed',
      chartTarget: 'speed_time',
    },
    {
      label: 'Maximum Speed (v_max)',
      value: `${s.max_speed.toFixed(3)} m/s`,
      badge: 'Calculated RK4 Peak',
      chartTarget: 'speed_time',
    },
  ];

  return (
    <div className="space-y-4">
      {/* Honest Destination Status Banner */}
      {s.destination_distance !== null && (
        <div
          className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
            s.destination_reached
              ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-800 dark:text-emerald-300'
              : 'bg-amber-500/10 border-amber-500/35 text-amber-800 dark:text-amber-300'
          }`}
        >
          <div className="flex items-start gap-3">
            {s.destination_reached ? (
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
            ) : (
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
            )}
            <div className="text-sm">
              <div className="font-semibold">
                {s.destination_reached
                  ? `Target Destination Reached (${s.destination_distance.toFixed(1)} m at h = ${s.destination_height.toFixed(1)} m)`
                  : `Selected Destination Not Reached (${s.destination_distance.toFixed(1)} m at h = ${s.destination_height.toFixed(1)} m)`}
              </div>
              <div className="text-xs opacity-90 mt-0.5 tabular-nums">
                {s.destination_reached
                  ? `Landed within ±${config.destinationTolerance} m target tolerance (Δ = ${(s.destination_delta ?? 0).toFixed(2)} m).`
                  : s.destination_delta !== null
                    ? `Trajectory missed target by ${Math.abs(s.destination_delta).toFixed(2)} m (${s.destination_delta < 0 ? 'shortfall' : 'overshoot'}).`
                    : `Calculated range ${s.horizontal_range.toFixed(2)} m did not reach ${s.destination_distance.toFixed(2)} m.`}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-zinc-100">
            Simulation Results Dashboard
          </h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400">
            {modelMeta?.code}: {modelMeta?.name} · Engine: {output.engine} · Click any card to
            inspect its graph
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.98 }}
            type="button"
            disabled={saving || Boolean(savedId)}
            onClick={onSaveSimulation}
            className="inline-flex items-center gap-2 min-h-[40px] px-4 py-2 text-xs font-bold bg-gradient-to-r from-sky-500 to-emerald-500 hover:opacity-95 disabled:opacity-60 text-slate-950 rounded-xl cursor-pointer shadow-xs transition-opacity"
          >
            <Save className="w-3.5 h-3.5" aria-hidden="true" />
            <span>
              {savedId ? 'Saved' : saving ? 'Saving...' : 'Save Simulation'}
            </span>
          </motion.button>
        </div>
      </div>

      {/* Top 6 Result Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {metricCards.map((card, idx) => (
          <motion.button
            key={card.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: idx * 0.03 }}
            whileHover={{ y: -2 }}
            type="button"
            onClick={() => onInspectChart(card.chartTarget)}
            className="p-4 text-left bg-white dark:bg-[#0b0f14] border border-slate-200 dark:border-slate-800 hover:border-sky-500/60 rounded-2xl transition-colors cursor-pointer shadow-xs"
          >
            <div className="text-xs text-slate-500 dark:text-slate-400">{card.label}</div>
            <div className="text-2xl font-bold tabular-nums text-slate-900 dark:text-sky-400 mt-1">
              {card.value}
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">
              {card.badge}
            </div>
          </motion.button>
        ))}
      </div>

      {/* Analytical Reference & Error Comparison (Model A Ideal) */}
      {output.analytical && output.errors && (
        <div className="bg-white dark:bg-[#0b0f14] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Analytical vs. Numerical RK4 Validation (Ideal Motion)
            </h3>
            <span className="text-xs font-semibold text-sky-600 dark:text-sky-400 tabular-nums">
              Max Step Position Error: {output.errors.max_step_position_error.toExponential(3)} m
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2 pr-4">Metric</th>
                  <th className="py-2 px-4 text-right">RK4 Numerical</th>
                  <th className="py-2 px-4 text-right">Analytical Exact</th>
                  <th className="py-2 px-4 text-right">Absolute Error</th>
                  <th className="py-2 pl-4 text-right">Percentage Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 tabular-nums">
                {[
                  {
                    label: 'Flight Time T (s)',
                    num: s.flight_time,
                    ana: output.analytical.flight_time,
                    err: output.errors.flight_time,
                  },
                  {
                    label: 'Maximum Height H (m)',
                    num: s.maximum_height,
                    ana: output.analytical.maximum_height,
                    err: output.errors.maximum_height,
                  },
                  {
                    label: 'Horizontal Range R (m)',
                    num: s.horizontal_range,
                    ana: output.analytical.horizontal_range,
                    err: output.errors.horizontal_range,
                  },
                  {
                    label: 'Final Speed v_f (m/s)',
                    num: s.final_velocity,
                    ana: output.analytical.final_velocity,
                    err: output.errors.final_velocity,
                  },
                ].map((row) => (
                  <tr key={row.label}>
                    <td className="py-2.5 pr-4 font-sans text-slate-700 dark:text-slate-300">
                      {row.label}
                    </td>
                    <td className="py-2.5 px-4 text-right">{row.num.toFixed(6)}</td>
                    <td className="py-2.5 px-4 text-right">{row.ana.toFixed(6)}</td>
                    <td className="py-2.5 px-4 text-right text-sky-600 dark:text-sky-400">
                      {row.err.abs.toExponential(3)}
                    </td>
                    <td className="py-2.5 pl-4 text-right">
                      {row.err.pct !== null ? `${row.err.pct.toExponential(3)}%` : 'N/A (0 denom)'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Physical Assumptions Summary */}
      <div className="bg-white dark:bg-[#0b0f14] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xs">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
          Physical Model Assumptions &amp; Parameters
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-600 dark:text-slate-300">
          <ul className="space-y-1.5 list-disc list-inside">
            {modelMeta?.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 tabular-nums">
            <dt className="text-slate-500 dark:text-slate-400">v₀ / θ</dt>
            <dd>
              {config.initialVelocity} m/s @ {config.launchAngleDeg}°
            </dd>
            <dt className="text-slate-500 dark:text-slate-400">Gravity g / Step h</dt>
            <dd>
              {config.gravity} m/s² / {config.timeStep} s
            </dd>
            <dt className="text-slate-500 dark:text-slate-400">Mass m / Cd / Area A</dt>
            <dd>
              {config.mass} kg / {config.dragCoefficient} / {config.crossSectionalArea} m²
            </dd>
            <dt className="text-slate-500 dark:text-zinc-400">Environment</dt>
            <dd>
              {config.sourceEnvironment} → {config.destinationEnvironment} ({config.environmentTime})
            </dd>
          </dl>
        </div>
      </div>
    </div>
  );
}
