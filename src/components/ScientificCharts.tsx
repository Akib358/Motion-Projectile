import { useMemo, useRef, useState } from 'react';
import {
  Brush,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Download } from 'lucide-react';
import {
  ConvergenceOutput,
  SimulationOutput,
} from '../types/simulation';

export type ChartTabId =
  | 'trajectory'
  | 'x_time'
  | 'y_time'
  | 'vx_time'
  | 'vy_time'
  | 'speed_time'
  | 'num_vs_ana'
  | 'abs_error'
  | 'convergence';

interface ChartMeta {
  id: ChartTabId;
  shortTitle: string;
  title: string;
  xLabel: string;
  yLabel: string;
  explanation: string;
}

export const CHART_DEFS: ChartMeta[] = [
  {
    id: 'trajectory',
    shortTitle: '1. Trajectory (y vs x)',
    title: 'Trajectory: Horizontal Distance vs. Vertical Height',
    xLabel: 'Horizontal Distance x (m)',
    yLabel: 'Vertical Height y (m)',
    explanation: 'Spatial flight path computed at each RK4 step from launch to ground impact.',
  },
  {
    id: 'x_time',
    shortTitle: '2. x(t) vs Time',
    title: 'Horizontal Position x(t) vs. Time',
    xLabel: 'Time t (s)',
    yLabel: 'Horizontal Position x (m)',
    explanation: 'Linear growth under ideal motion; decelerating slope when aerodynamic drag is active.',
  },
  {
    id: 'y_time',
    shortTitle: '3. y(t) vs Time',
    title: 'Vertical Position y(t) vs. Time',
    xLabel: 'Time t (s)',
    yLabel: 'Altitude y (m)',
    explanation: 'Vertical ascent to apogee (vy = 0) followed by gravitational descent.',
  },
  {
    id: 'vx_time',
    shortTitle: '4. vx(t) vs Time',
    title: 'Horizontal Velocity vx(t) vs. Time',
    xLabel: 'Time t (s)',
    yLabel: 'vx (m/s)',
    explanation: 'Constant in ideal vacuum; decays nonlinearly under quadratic drag or climbs during burn.',
  },
  {
    id: 'vy_time',
    shortTitle: '5. vy(t) vs Time',
    title: 'Vertical Velocity vy(t) vs. Time',
    xLabel: 'Time t (s)',
    yLabel: 'vy (m/s)',
    explanation: 'Crosses zero at maximum height before becoming negative on descent.',
  },
  {
    id: 'speed_time',
    shortTitle: '6. Speed v(t) vs Time',
    title: 'Resultant Speed v(t) vs. Time',
    xLabel: 'Time t (s)',
    yLabel: 'Speed v (m/s)',
    explanation: 'Magnitude sqrt(vx² + vy²) reaching its minimum near apogee.',
  },
  {
    id: 'num_vs_ana',
    shortTitle: '7. Numerical vs Analytical',
    title: 'Numerical RK4 vs. Analytical Reference Trajectory',
    xLabel: 'Horizontal Distance x (m)',
    yLabel: 'Vertical Height y (m)',
    explanation: 'Direct overlay of RK4 trajectory against closed-form analytical ideal solution.',
  },
  {
    id: 'abs_error',
    shortTitle: '8. Absolute Error vs Time',
    title: 'Absolute Position & Velocity Error vs. Time',
    xLabel: 'Time t (s)',
    yLabel: 'Absolute Error',
    explanation: 'Instantaneous Euclidean error |Y_numerical - Y_analytical| across integration steps.',
  },
  {
    id: 'convergence',
    shortTitle: '9. Convergence (h, h/2, h/4)',
    title: 'Step-Size Convergence Comparison (h, h/2, h/4)',
    xLabel: 'Time Step h (s)',
    yLabel: 'Range Error (m)',
    explanation: 'Verifies fourth-order O(h⁴) error reduction when halving time step h.',
  },
];

interface ScientificChartsProps {
  output: SimulationOutput;
  convergence: ConvergenceOutput | null;
  convergenceLoading: boolean;
  onRunConvergence: () => void;
  activeChart: ChartTabId;
  onChangeChart: (id: ChartTabId) => void;
  selectedIteration: number | null;
  onSelectIteration?: (iteration: number) => void;
}

export function ScientificCharts({
  output,
  convergence,
  convergenceLoading,
  onRunConvergence,
  activeChart,
  onChangeChart,
  selectedIteration,
  onSelectIteration,
}: ScientificChartsProps) {
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const [hiddenSeries, setHiddenSeries] = useState<Record<string, boolean>>({});
  const [timeSlicePct, setTimeSlicePct] = useState<[number, number]>([0, 100]);

  const meta = CHART_DEFS.find((c) => c.id === activeChart) ?? CHART_DEFS[0];

  const slicedData = useMemo(() => {
    const steps = output.steps;
    if (steps.length === 0) return [];
    const startIdx = Math.floor((timeSlicePct[0] / 100) * (steps.length - 1));
    const endIdx = Math.max(startIdx + 1, Math.ceil((timeSlicePct[1] / 100) * steps.length));
    return steps.slice(startIdx, endIdx).map((s) => ({
      iteration: s.iteration,
      t: Number(s.t.toFixed(4)),
      x: Number(s.x.toFixed(4)),
      y: Number(s.y.toFixed(4)),
      vx: Number(s.vx.toFixed(4)),
      vy: Number(s.vy.toFixed(4)),
      speed: Number(s.speed.toFixed(4)),
      ana_x: s.analytical ? Number(s.analytical.x.toFixed(4)) : null,
      ana_y: s.analytical ? Number(s.analytical.y.toFixed(4)) : null,
      pos_err: s.position_error !== undefined ? Number(s.position_error.toExponential(4)) : null,
      vel_err: s.velocity_error !== undefined ? Number(s.velocity_error.toExponential(4)) : null,
    }));
  }, [output.steps, timeSlicePct]);

  const selectedPoint = useMemo(() => {
    if (selectedIteration === null) return null;
    return slicedData.find((d) => d.iteration === selectedIteration) ?? null;
  }, [slicedData, selectedIteration]);

  const toggleSeries = (key: string) => {
    setHiddenSeries((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleDownloadPng = () => {
    const container = chartContainerRef.current;
    if (!container) return;
    const svgEl = container.querySelector('svg.recharts-surface');
    if (!svgEl) return;

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgEl);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const isDark = document.documentElement.classList.contains('dark');
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const rect = svgEl.getBoundingClientRect();
      canvas.width = Math.max(800, rect.width * 2);
      canvas.height = Math.max(420, rect.height * 2);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = isDark ? '#161920' : '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const pngUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = pngUrl;
        link.download = `projectile_lab_${activeChart}.png`;
        link.click();
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const hasAnalytical = Boolean(output.analytical);

  return (
    <div className="bg-white dark:bg-[#0b0f14] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
      {/* Chart Selector Tabs */}
      <div className="p-3.5 sm:p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap gap-1.5 bg-slate-50/80 dark:bg-[#070a0f]">
        {CHART_DEFS.map((c) => {
          const active = c.id === activeChart;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onChangeChart(c.id);
                if (c.id === 'convergence' && !convergence && !convergenceLoading) {
                  onRunConvergence();
                }
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                active
                  ? 'bg-sky-500 text-slate-950 font-semibold shadow-xs'
                  : 'bg-white dark:bg-[#0b0f14] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:border-sky-500/50'
              }`}
            >
              {c.shortTitle}
            </button>
          );
        })}
      </div>

      {/* Chart Header & Controls */}
      <div className="p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-base sm:text-lg font-semibold text-slate-900 dark:text-zinc-100">
              {meta.title}
            </h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
              {meta.explanation}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {activeChart === 'convergence' && (
              <button
                type="button"
                onClick={onRunConvergence}
                disabled={convergenceLoading}
                className="px-3 py-1.5 text-xs font-semibold bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 rounded-lg cursor-pointer"
              >
                {convergenceLoading ? 'Running h, h/2, h/4...' : 'Recompute Convergence'}
              </button>
            )}
            <button
              type="button"
              onClick={handleDownloadPng}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-800 rounded-lg cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Export PNG</span>
            </button>
          </div>
        </div>

        {/* Time Window Range Filter (for step-based charts) */}
        {activeChart !== 'convergence' && (
          <div className="flex flex-wrap items-center justify-between gap-4 text-xs bg-slate-50 dark:bg-[#070a0f] border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-slate-500 dark:text-slate-400">Time Window:</span>
              <label className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                <span>Start</span>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, timeSlicePct[1] - 5)}
                  value={timeSlicePct[0]}
                  onChange={(e) => setTimeSlicePct([Number(e.target.value), timeSlicePct[1]])}
                  className="w-24 accent-sky-500"
                />
              </label>
              <label className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                <span>End</span>
                <input
                  type="range"
                  min={Math.min(100, timeSlicePct[0] + 5)}
                  max={100}
                  value={timeSlicePct[1]}
                  onChange={(e) => setTimeSlicePct([timeSlicePct[0], Number(e.target.value)])}
                  className="w-24 accent-sky-500"
                />
              </label>
              <span className="font-semibold tabular-nums text-sky-600 dark:text-sky-400">
                {slicedData[0]?.t.toFixed(2) ?? '0.00'}s –{' '}
                {slicedData[slicedData.length - 1]?.t.toFixed(2) ?? '0.00'}s
              </span>
            </div>

            {selectedPoint && (
              <span className="font-medium text-amber-600 dark:text-yellow-400 tabular-nums">
                Highlighted Step #{selectedPoint.iteration} (t={selectedPoint.t}s)
              </span>
            )}
          </div>
        )}

        {/* Main Interactive Recharts Canvas */}
        <div ref={chartContainerRef} className="w-full h-[360px]">
          {activeChart === 'convergence' ? (
            convergence ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={convergence.entries} margin={{ top: 12, right: 24, left: 16, bottom: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="h"
                    stroke="#64748b"
                    tick={{ fontSize: 11 }}
                    label={{ value: 'Time Step h (s)', position: 'insideBottom', offset: -12, fill: '#64748b', fontSize: 12 }}
                  />
                  <YAxis
                    stroke="#64748b"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(val: number) => val.toExponential(2)}
                    label={{ value: 'Error (m)', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 12 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      borderColor: '#cbd5e1',
                      borderRadius: 10,
                      fontSize: 12,
                      color: '#0f172a',
                    }}
                    formatter={(val) => (typeof val === 'number' ? val.toExponential(4) : String(val ?? ''))}
                  />
                  <Legend onClick={(e) => toggleSeries(String(e.dataKey))} />
                  <Line
                    type="monotone"
                    dataKey="range_error"
                    name="Range Error (m)"
                    stroke="#0284c7"
                    strokeWidth={2.5}
                    dot={{ r: 5 }}
                    hide={hiddenSeries['range_error']}
                  />
                  <Line
                    type="monotone"
                    dataKey="height_error"
                    name="Height Error (m)"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    hide={hiddenSeries['height_error']}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-sm text-slate-500 dark:text-slate-400 gap-3 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl">
                <p>Run step-halving convergence across h, h/2, and h/4 to evaluate O(h⁴) scaling.</p>
                <button
                  type="button"
                  onClick={onRunConvergence}
                  className="px-4 py-2 text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-lg cursor-pointer"
                >
                  Run Step-Halving Convergence
                </button>
              </div>
            )
          ) : (activeChart === 'num_vs_ana' || activeChart === 'abs_error') && !hasAnalytical ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl space-y-2">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                No closed-form analytical solution exists for{' '}
                <span className="text-sky-600 dark:text-sky-400">{output.physics_model}</span>.
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md">
                As specified by the numerical methods model, non-ideal trajectories with quadratic
                drag or thrust are verified using Step-Halving Convergence (Chart 9) rather than
                ideal analytical equations.
              </p>
              <button
                type="button"
                onClick={() => {
                  onChangeChart('convergence');
                  if (!convergence) onRunConvergence();
                }}
                className="mt-2 px-4 py-2 text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-lg cursor-pointer"
              >
                Open Convergence Comparison (h, h/2, h/4)
              </button>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={slicedData}
                margin={{ top: 12, right: 24, left: 16, bottom: 24 }}
                onClick={(state) => {
                  const idx = state?.activeTooltipIndex;
                  if (typeof idx === 'number' && slicedData[idx] && onSelectIteration) {
                    onSelectIteration(slicedData[idx].iteration);
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey={activeChart === 'trajectory' || activeChart === 'num_vs_ana' ? 'x' : 't'}
                  type="number"
                  domain={['auto', 'auto']}
                  stroke="#64748b"
                  tick={{ fontSize: 11 }}
                  label={{
                    value: meta.xLabel,
                    position: 'insideBottom',
                    offset: -12,
                    fill: '#64748b',
                    fontSize: 12,
                  }}
                />
                <YAxis
                  stroke="#64748b"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(val: number) =>
                    activeChart === 'abs_error' ? val.toExponential(1) : String(val)
                  }
                  label={{
                    value: meta.yLabel,
                    angle: -90,
                    position: 'insideLeft',
                    fill: '#64748b',
                    fontSize: 12,
                  }}
                />
                <Tooltip
                  formatter={(val) =>
                    typeof val === 'number' && activeChart === 'abs_error'
                      ? val.toExponential(3)
                      : typeof val === 'number'
                        ? val.toFixed(4)
                        : String(val ?? '')
                  }
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    borderColor: '#cbd5e1',
                    borderRadius: 10,
                    fontSize: 12,
                    color: '#0f172a',
                    boxShadow: '0 8px 20px rgba(15, 23, 42, 0.08)',
                  }}
                />
                <Legend onClick={(e) => toggleSeries(String(e.dataKey))} />

                {activeChart === 'trajectory' && (
                  <Line
                    type="monotone"
                    dataKey="y"
                    name="Altitude y (m)"
                    stroke="#0284c7"
                    strokeWidth={2.5}
                    dot={false}
                    hide={hiddenSeries['y']}
                  />
                )}
                {activeChart === 'x_time' && (
                  <Line
                    type="monotone"
                    dataKey="x"
                    name="Horizontal x(t) (m)"
                    stroke="#0284c7"
                    strokeWidth={2.5}
                    dot={false}
                    hide={hiddenSeries['x']}
                  />
                )}
                {activeChart === 'y_time' && (
                  <Line
                    type="monotone"
                    dataKey="y"
                    name="Vertical y(t) (m)"
                    stroke="#22c55e"
                    strokeWidth={2.5}
                    dot={false}
                    hide={hiddenSeries['y']}
                  />
                )}
                {activeChart === 'vx_time' && (
                  <Line
                    type="monotone"
                    dataKey="vx"
                    name="Horizontal Velocity vx (m/s)"
                    stroke="#0284c7"
                    strokeWidth={2.5}
                    dot={false}
                    hide={hiddenSeries['vx']}
                  />
                )}
                {activeChart === 'vy_time' && (
                  <Line
                    type="monotone"
                    dataKey="vy"
                    name="Vertical Velocity vy (m/s)"
                    stroke="#eab308"
                    strokeWidth={2.5}
                    dot={false}
                    hide={hiddenSeries['vy']}
                  />
                )}
                {activeChart === 'speed_time' && (
                  <Line
                    type="monotone"
                    dataKey="speed"
                    name="Resultant Speed v (m/s)"
                    stroke="#22c55e"
                    strokeWidth={2.5}
                    dot={false}
                    hide={hiddenSeries['speed']}
                  />
                )}
                {activeChart === 'num_vs_ana' && (
                  <>
                    <Line
                      type="monotone"
                      dataKey="y"
                      name="RK4 Numerical y (m)"
                      stroke="#0284c7"
                      strokeWidth={2.5}
                      dot={false}
                      hide={hiddenSeries['y']}
                    />
                    <Line
                      type="monotone"
                      dataKey="ana_y"
                      name="Analytical Ideal y (m)"
                      stroke="#eab308"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      dot={false}
                      hide={hiddenSeries['ana_y']}
                    />
                  </>
                )}
                {activeChart === 'abs_error' && (
                  <>
                    <Line
                      type="monotone"
                      dataKey="pos_err"
                      name="Position Error |Δr| (m)"
                      stroke="#0284c7"
                      strokeWidth={2}
                      dot={false}
                      hide={hiddenSeries['pos_err']}
                    />
                    <Line
                      type="monotone"
                      dataKey="vel_err"
                      name="Velocity Error |Δv| (m/s)"
                      stroke="#eab308"
                      strokeWidth={2}
                      dot={false}
                      hide={hiddenSeries['vel_err']}
                    />
                  </>
                )}

                {selectedPoint && activeChart !== 'abs_error' && (
                  <ReferenceDot
                    x={
                      activeChart === 'trajectory' || activeChart === 'num_vs_ana'
                        ? selectedPoint.x
                        : selectedPoint.t
                    }
                    y={
                      activeChart === 'x_time'
                        ? selectedPoint.x
                        : activeChart === 'vx_time'
                          ? selectedPoint.vx
                          : activeChart === 'vy_time'
                            ? selectedPoint.vy
                            : activeChart === 'speed_time'
                              ? selectedPoint.speed
                              : selectedPoint.y
                    }
                    r={6}
                    fill="#eab308"
                    stroke="#ffffff"
                    strokeWidth={2}
                  />
                )}

                <Brush
                  dataKey={activeChart === 'trajectory' || activeChart === 'num_vs_ana' ? 'x' : 't'}
                  height={20}
                  stroke="#0284c7"
                  fill="#f8fafc"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Convergence Data Table when Chart 9 active */}
        {activeChart === 'convergence' && convergence && (
          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-[#070a0f] text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-2.5">Step Size h (s)</th>
                  <th className="px-4 py-2.5">Iterations</th>
                  <th className="px-4 py-2.5 text-right">Range R (m)</th>
                  <th className="px-4 py-2.5 text-right">Max Height H (m)</th>
                  <th className="px-4 py-2.5 text-right">Range Error (m)</th>
                  <th className="px-4 py-2.5 text-right">Observed Order p</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 tabular-nums">
                {convergence.entries.map((entry) => (
                  <tr key={entry.h} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                    <td className="px-4 py-2.5">{entry.h}</td>
                    <td className="px-4 py-2.5">{entry.steps}</td>
                    <td className="px-4 py-2.5 text-right">{entry.horizontal_range.toFixed(6)}</td>
                    <td className="px-4 py-2.5 text-right">{entry.maximum_height.toFixed(6)}</td>
                    <td className="px-4 py-2.5 text-right text-sky-600 dark:text-sky-400">
                      {entry.range_error.toExponential(4)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {entry.observed_order !== null ? entry.observed_order.toFixed(3) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
