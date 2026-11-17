import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { RK4Step } from '../types/simulation';
import { MathFormula } from './MathFormula';

interface Rk4IterationExplorerProps {
  steps: RK4Step[];
  timeStep: number;
  selectedIteration: number | null;
  onSelectIteration: (iteration: number) => void;
}

function formatVec4(vec: [number, number, number, number]) {
  return `[${vec.map((v) => v.toFixed(4)).join(', ')}]`;
}

export function Rk4IterationExplorer({
  steps,
  timeStep,
  selectedIteration,
  onSelectIteration,
}: Rk4IterationExplorerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 12;

  const filteredSteps = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return steps;
    return steps.filter((s) => String(s.iteration).includes(q));
  }, [steps, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredSteps.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const visibleSteps = filteredSteps.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const activeStep = useMemo(() => {
    if (selectedIteration !== null) {
      return steps.find((s) => s.iteration === selectedIteration) ?? steps[0] ?? null;
    }
    return steps[0] ?? null;
  }, [steps, selectedIteration]);

  return (
    <div className="bg-white dark:bg-[#0b0f14] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
      <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">
            RK4 Iteration Explorer (k₁ – k₄ Derivative Stages)
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Inspect every stored integration step. Note that k₁–k₄ represent instantaneous slope
            derivatives <MathFormula latex={String.raw`f(t, Y)`} />, not step increments{' '}
            <MathFormula latex={String.raw`h \cdot k_i`} />.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search
              className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(0);
              }}
              placeholder="Search iteration #"
              aria-label="Search by iteration number"
              className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-[#070a0f] border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 w-40"
            />
          </div>
        </div>
      </div>

      {/* Selected Step Stage Inspector */}
      {activeStep && (
        <div className="p-5 sm:p-6 bg-slate-50/70 dark:bg-[#070a0f] border-b border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs tabular-nums text-sky-600 dark:text-sky-400 font-semibold">
              Inspecting Iteration #{activeStep.iteration} · t = {activeStep.t.toFixed(4)} s · h ={' '}
              {timeStep} s
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
              Yₙ = [{activeStep.x.toFixed(4)}, {activeStep.y.toFixed(4)},{' '}
              {activeStep.vx.toFixed(4)}, {activeStep.vy.toFixed(4)}] → Yₙ₊₁ ={' '}
              {formatVec4(activeStep.next_state)}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              {
                label: 'k₁ = f(tₙ, Yₙ)',
                role: 'Slope at start of interval',
                val: activeStep.k1,
              },
              {
                label: 'k₂ = f(tₙ + h/2, Yₙ + h·k₁/2)',
                role: 'Midpoint slope using k₁',
                val: activeStep.k2,
              },
              {
                label: 'k₃ = f(tₙ + h/2, Yₙ + h·k₂/2)',
                role: 'Corrected midpoint slope using k₂',
                val: activeStep.k3,
              },
              {
                label: 'k₄ = f(tₙ + h, Yₙ + h·k₃)',
                role: 'Endpoint slope using k₃',
                val: activeStep.k4,
              },
            ].map((stage) => (
              <motion.div
                key={stage.label}
                layout
                className="p-3.5 bg-white dark:bg-[#0b0f14] border border-slate-200 dark:border-slate-800 rounded-xl space-y-1.5 shadow-xs"
              >
                <div className="text-xs font-semibold text-sky-600 dark:text-sky-400">
                  {stage.label}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">{stage.role}</div>
                <div className="text-xs font-medium text-slate-800 dark:text-slate-200 tabular-nums break-all pt-1">
                  {formatVec4(stage.val)}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Iteration Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-50 dark:bg-[#070a0f] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="px-3 py-2.5 whitespace-nowrap">Iter</th>
              <th className="px-3 py-2.5 text-right whitespace-nowrap">tₙ (s)</th>
              <th className="px-3 py-2.5 text-right whitespace-nowrap">x (m)</th>
              <th className="px-3 py-2.5 text-right whitespace-nowrap">y (m)</th>
              <th className="px-3 py-2.5 text-right whitespace-nowrap">vx (m/s)</th>
              <th className="px-3 py-2.5 text-right whitespace-nowrap">vy (m/s)</th>
              <th className="px-3 py-2.5 whitespace-nowrap">k₁ [vx, vy, ax, ay]</th>
              <th className="px-3 py-2.5 whitespace-nowrap">k₂ [vx, vy, ax, ay]</th>
              <th className="px-3 py-2.5 whitespace-nowrap">k₃ [vx, vy, ax, ay]</th>
              <th className="px-3 py-2.5 whitespace-nowrap">k₄ [vx, vy, ax, ay]</th>
              <th className="px-3 py-2.5 whitespace-nowrap">Yₙ₊₁ [x, y, vx, vy]</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800 tabular-nums">
            {visibleSteps.map((step) => {
              const isSelected = activeStep?.iteration === step.iteration;
              return (
                <tr
                  key={step.iteration}
                  onClick={() => onSelectIteration(step.iteration)}
                  className={`cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-sky-50 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-900/60 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <td className="px-3 py-2 font-medium whitespace-nowrap">#{step.iteration}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{step.t.toFixed(3)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{step.x.toFixed(3)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{step.y.toFixed(3)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{step.vx.toFixed(3)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{step.vy.toFixed(3)}</td>
                  <td className="px-3 py-2 text-[11px] font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {formatVec4(step.k1)}
                  </td>
                  <td className="px-3 py-2 text-[11px] font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {formatVec4(step.k2)}
                  </td>
                  <td className="px-3 py-2 text-[11px] font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {formatVec4(step.k3)}
                  </td>
                  <td className="px-3 py-2 text-[11px] font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {formatVec4(step.k4)}
                  </td>
                  <td className="px-3 py-2 text-[11px] font-mono whitespace-nowrap">
                    {formatVec4(step.next_state)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span className="tabular-nums">
          Showing {visibleSteps.length} of {filteredSteps.length} stored steps
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={safePage === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-800 disabled:opacity-40 cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Prev</span>
          </button>
          <span className="font-medium tabular-nums">
            {safePage + 1} / {totalPages}
          </span>
          <button
            type="button"
            disabled={safePage >= totalPages - 1}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-800 disabled:opacity-40 cursor-pointer"
          >
            <span>Next</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
