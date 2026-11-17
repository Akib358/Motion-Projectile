import { BookOpen, Calculator } from 'lucide-react';
import { MathFormula } from '../MathFormula';

/**
 * Formulas panel + "About this physics" educational breakdown.
 */
export function PhysicsFormulasAndAbout({ dragEnabled }: { dragEnabled: boolean }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* Kinematic Formulas Panel */}
      <section className="lg:col-span-5 glass-card rounded-2xl p-5 space-y-3.5">
        <div className="flex items-center gap-2 text-sky-600 dark:text-sky-400">
          <Calculator className="w-4 h-4" aria-hidden="true" />
          <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            Core Projectile Formulas
          </h3>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          For vacuum launches starting from ground level (<MathFormula latex="y_0 = 0" />):
        </p>

        <div className="space-y-2.5 text-sm">
          <div className="p-3 rounded-xl bg-slate-50/90 dark:bg-[#070a0f] border border-sky-500/20 flex items-center justify-between gap-3 overflow-x-auto">
            <span className="text-xs font-semibold text-sky-700 dark:text-sky-400 shrink-0">
              Range (R)
            </span>
            <MathFormula latex={String.raw`R = \frac{v^2 \sin(2\theta)}{g}`} />
          </div>

          <div className="p-3 rounded-xl bg-slate-50/90 dark:bg-[#070a0f] border border-emerald-500/25 flex items-center justify-between gap-3 overflow-x-auto">
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
              Max Height (H)
            </span>
            <MathFormula latex={String.raw`H = \frac{v^2 \sin^2\theta}{2g}`} />
          </div>

          <div className="p-3 rounded-xl bg-slate-50/90 dark:bg-[#070a0f] border border-yellow-500/25 flex items-center justify-between gap-3 overflow-x-auto">
            <span className="text-xs font-semibold text-amber-700 dark:text-yellow-400 shrink-0">
              Flight Time (T)
            </span>
            <MathFormula latex={String.raw`T = \frac{2v \sin\theta}{g}`} />
          </div>
        </div>
      </section>

      {/* About This Physics Section */}
      <section className="lg:col-span-7 glass-card rounded-2xl p-5 space-y-3.5">
        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
          <BookOpen className="w-4 h-4" aria-hidden="true" />
          <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            About This Physics
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          <div className="p-3.5 rounded-xl bg-slate-50/85 dark:bg-[#070a0f] border border-slate-200/80 dark:border-sky-500/20 space-y-1.5">
            <div className="font-semibold text-slate-900 dark:text-sky-300">
              Independent Horizontal &amp; Vertical Motion
            </div>
            <p>
              Without air resistance, horizontal velocity remains constant at{' '}
              <MathFormula latex="v_x = v_0 \cos\theta" />, while vertical velocity decreases
              linearly under gravity: <MathFormula latex="v_y(t) = v_0 \sin\theta - g t" />.
              Together they trace a symmetric parabola.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50/85 dark:bg-[#070a0f] border border-slate-200/80 dark:border-emerald-500/20 space-y-1.5">
            <div className="font-semibold text-slate-900 dark:text-emerald-300">
              {dragEnabled ? 'Quadratic Air Drag (Active)' : 'Why RK4 Numerical Integration?'}
            </div>
            <p>
              When air drag is enabled, drag opposes velocity proportionally to{' '}
              <MathFormula latex="v^2" /> (<MathFormula latex="\vec{a}_d = -c|\vec{v}|\vec{v}" />),
              coupling <MathFormula latex="v_x" /> and <MathFormula latex="v_y" /> so no simple
              closed-form formula exists. Our simulator solves the ODEs at every small step using
              Classical 4th-Order Runge-Kutta (RK4).
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
