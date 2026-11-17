import { ReactNode, useState } from 'react';
import { motion } from 'motion/react';
import { BookOpen, ChevronRight } from 'lucide-react';
import { MathFormula } from '../components/MathFormula';

type MethodId =
  | 'analytical-vs-numerical'
  | 'bisection'
  | 'false-position'
  | 'newton-raphson'
  | 'gauss-elimination'
  | 'gauss-jordan'
  | 'euler'
  | 'modified-euler'
  | 'rk4-curriculum';

interface MethodTopic {
  id: MethodId;
  order: string;
  title: string;
  category: string;
  renderTheory: () => ReactNode;
}

const METHODS: MethodTopic[] = [
  {
    id: 'analytical-vs-numerical',
    order: '01',
    title: 'Analytical vs Numerical Method',
    category: 'Foundations',
    renderTheory: () => (
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          An <strong>analytical method</strong> yields an exact closed-form symbolic formula (such as{' '}
          <MathFormula latex="R = \frac{v_0^2 \sin 2\theta}{g}" /> in vacuum), whereas a{' '}
          <strong>numerical method</strong> computes discrete approximate values step-by-step using
          arithmetic algorithms when equations are nonlinear or coupled (such as quadratic air drag).
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-sky-500/25 text-sky-700 dark:text-sky-300">
                <th className="py-2.5 pr-4">Aspect</th>
                <th className="py-2.5 px-4">Analytical Method</th>
                <th className="py-2.5 pl-4">Numerical Method</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              <tr>
                <td className="py-2.5 pr-4 font-semibold">Output Form</td>
                <td className="py-2.5 px-4">Exact continuous formula <MathFormula latex="y(x)" /></td>
                <td className="py-2.5 pl-4">Discrete table of points <MathFormula latex="(x_n, y_n)" /></td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 font-semibold">Error Source</td>
                <td className="py-2.5 px-4">Zero mathematical truncation error</td>
                <td className="py-2.5 pl-4">Truncation error (<MathFormula latex="\mathcal{O}(h^p)" />) + rounding error</td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 font-semibold">Complex Physics</td>
                <td className="py-2.5 px-4">Often impossible for nonlinear drag or variable thrust</td>
                <td className="py-2.5 pl-4">Handles nonlinear, coupled, and piecewise forces directly</td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 font-semibold">Dependence on Step <MathFormula latex="h" /></td>
                <td className="py-2.5 px-4">Independent of step size</td>
                <td className="py-2.5 pl-4">Accuracy improves as step size <MathFormula latex="h \to 0" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    ),
  },
  {
    id: 'bisection',
    order: '02',
    title: 'Bisection Method',
    category: 'Root Finding',
    renderTheory: () => (
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          A guaranteed bracketing method for solving <MathFormula latex="f(x) = 0" /> on a continuous
          interval <MathFormula latex="[a, b]" /> where <MathFormula latex="f(a)\cdot f(b) < 0" />.
          At each iteration the interval is halved at the midpoint:
        </p>
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#070a0f] border border-sky-500/20 overflow-x-auto text-sm space-y-2">
          <MathFormula
            latex={String.raw`c_n = \frac{a_n + b_n}{2}, \quad \text{Error bound after } n \text{ steps: } |E_n| \le \frac{b_0 - a_0}{2^n}`}
            displayMode
          />
          <MathFormula
            latex={String.raw`\text{If } f(a_n)f(c_n) < 0 \Rightarrow b_{n+1} = c_n, \quad \text{else } a_{n+1} = c_n`}
            displayMode
          />
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Convergence is linear and unconditionally stable whenever the initial bracket has opposite signs at its endpoints.
        </p>
      </div>
    ),
  },
  {
    id: 'false-position',
    order: '03',
    title: 'False Position Method',
    category: 'Root Finding',
    renderTheory: () => (
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          Regula Falsi improves upon Bisection by connecting <MathFormula latex="(a, f(a))" /> and{' '}
          <MathFormula latex="(b, f(b))" /> with a straight secant line and taking its{' '}
          <MathFormula latex="x" />-intercept as the next root estimate while keeping{' '}
          <MathFormula latex="f(a)f(b) < 0" />:
        </p>
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#070a0f] border border-emerald-500/25 overflow-x-auto text-sm">
          <MathFormula
            latex={String.raw`x_r = b - \frac{f(b)(b - a)}{f(b) - f(a)} = \frac{a\,f(b) - b\,f(a)}{f(b) - f(a)}`}
            displayMode
          />
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Typically converges faster than Bisection, though one bracket endpoint can remain fixed on curved functions.
        </p>
      </div>
    ),
  },
  {
    id: 'newton-raphson',
    order: '04',
    title: 'Newton-Raphson Method',
    category: 'Root Finding',
    renderTheory: () => (
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          An open tangent-line root solver using the derivative <MathFormula latex="f'(x_n)" /> to
          project directly onto the <MathFormula latex="x" />-axis. Near a simple root it achieves
          rapid <strong>quadratic convergence</strong> (<MathFormula latex="\epsilon_{n+1} \propto \epsilon_n^2" />):
        </p>
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#070a0f] border border-yellow-500/25 overflow-x-auto text-sm">
          <MathFormula
            latex={String.raw`x_{n+1} = x_n - \frac{f(x_n)}{f'(x_n)}, \quad f'(x_n) \neq 0`}
            displayMode
          />
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Used in ballistics to solve exact landing time <MathFormula latex="y(t) = 0" /> or launch
          angle <MathFormula latex="\theta" /> for a target range when closed-form inversion is unavailable.
        </p>
      </div>
    ),
  },
  {
    id: 'gauss-elimination',
    order: '05',
    title: 'Gauss Elimination Method',
    category: 'Linear Systems',
    renderTheory: () => (
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          Solves linear systems <MathFormula latex="A\mathbf{x} = \mathbf{b}" /> in two stages:
          <strong> Forward Elimination</strong> reduces the augmented matrix{' '}
          <MathFormula latex="[A \mid \mathbf{b}]" /> to upper-triangular form{' '}
          <MathFormula latex="[U \mid \mathbf{c}]" /> using row operations{' '}
          <MathFormula latex="R_i \leftarrow R_i - \frac{a_{ik}}{a_{kk}}R_k" />, followed by{' '}
          <strong>Back Substitution</strong>:
        </p>
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#070a0f] border border-sky-500/20 overflow-x-auto text-sm">
          <MathFormula
            latex={String.raw`x_i = \frac{1}{u_{ii}}\left(c_i - \sum_{j=i+1}^{n} u_{ij}x_j\right)`}
            displayMode
          />
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Requires <MathFormula latex="\approx \frac{2}{3}n^3" /> operations; partial pivoting avoids small pivot divisors.
        </p>
      </div>
    ),
  },
  {
    id: 'gauss-jordan',
    order: '06',
    title: 'Gauss-Jordan Method',
    category: 'Linear Systems',
    renderTheory: () => (
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          Extends Gauss Elimination by normalizing every pivot row to <MathFormula latex="1" /> and
          eliminating entries both <em>below and above</em> every pivot. The augmented matrix
          transforms directly into Reduced Row Echelon Form:
        </p>
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#070a0f] border border-emerald-500/25 overflow-x-auto text-sm">
          <MathFormula
            latex={String.raw`[A \mid \mathbf{b}] \xrightarrow{\text{row ops}} [I \mid \mathbf{x}], \qquad [A \mid I] \longrightarrow [I \mid A^{-1}]`}
            displayMode
          />
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Eliminates back substitution and yields the inverse matrix <MathFormula latex="A^{-1}" /> directly.
        </p>
      </div>
    ),
  },
  {
    id: 'euler',
    order: '07',
    title: 'Euler Method',
    category: 'ODE Integration',
    renderTheory: () => (
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          The simplest explicit first-order ODE solver for{' '}
          <MathFormula latex="\frac{dy}{dt} = f(t, y)" />. Assumes the slope stays constant across
          the entire interval <MathFormula latex="[t_n, t_n + h]" />:
        </p>
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#070a0f] border border-sky-500/20 overflow-x-auto text-sm">
          <MathFormula latex={String.raw`y_{n+1} = y_n + h\, f(t_n, y_n)`} displayMode />
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Local error <MathFormula latex="\mathcal{O}(h^2)" />, global error{' '}
          <MathFormula latex="\mathcal{O}(h)" />. Halving step size <MathFormula latex="h" /> only halves accumulated drift.
        </p>
      </div>
    ),
  },
  {
    id: 'modified-euler',
    order: '08',
    title: 'Modified Euler Method',
    category: 'ODE Integration',
    renderTheory: () => (
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          Also known as Heun&apos;s Method, this two-stage predictor-corrector integrator averages
          the slope at the start and predicted end of each interval:
        </p>
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#070a0f] border border-yellow-500/25 overflow-x-auto text-sm space-y-2">
          <MathFormula
            latex={String.raw`\tilde{y}_{n+1} = y_n + h\, f(t_n, y_n) \quad \text{(Predictor)}`}
            displayMode
          />
          <MathFormula
            latex={String.raw`y_{n+1} = y_n + \frac{h}{2}\!\left[f(t_n, y_n) + f(t_{n+1}, \tilde{y}_{n+1})\right] \quad \text{(Corrector)}`}
            displayMode
          />
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Global truncation error improves to <MathFormula latex="\mathcal{O}(h^2)" /> (second-order accuracy).
        </p>
      </div>
    ),
  },
  {
    id: 'rk4-curriculum',
    order: '09',
    title: 'Classical RK4 Method',
    category: 'ODE Integration',
    renderTheory: () => (
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          Convert the second-order projectile equations into a four-component first-order ODE system{' '}
          <MathFormula latex="Y = [x, y, v_x, v_y]^T" />. Each stage{' '}
          <MathFormula latex="k_1, k_2, k_3, k_4" /> is a{' '}
          <strong>derivative slope vector</strong> <MathFormula latex="f(t, Y)" />, <em>not</em> a
          step increment <MathFormula latex="h \cdot k_i" />. Advancing from{' '}
          <MathFormula latex="t_n" /> to <MathFormula latex="t_{n+1} = t_n + h" /> takes a weighted
          average of four slopes:
        </p>
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#070a0f] border border-sky-500/20 overflow-x-auto text-sm space-y-2">
          <MathFormula
            latex={String.raw`Y = \begin{bmatrix} x \\ y \\ v_x \\ v_y \end{bmatrix}, \quad Y(0) = \begin{bmatrix} 0 \\ y_0 \\ v_0 \cos\theta \\ v_0 \sin\theta \end{bmatrix}`}
            displayMode
          />
          <MathFormula latex={String.raw`k_1 = f(t_n, Y_n)`} displayMode />
          <MathFormula
            latex={String.raw`k_2 = f\!\left(t_n + \frac{h}{2},\, Y_n + \frac{h}{2}k_1\right)`}
            displayMode
          />
          <MathFormula
            latex={String.raw`k_3 = f\!\left(t_n + \frac{h}{2},\, Y_n + \frac{h}{2}k_2\right)`}
            displayMode
          />
          <MathFormula latex={String.raw`k_4 = f(t_n + h,\, Y_n + h k_3)`} displayMode />
          <MathFormula
            latex={String.raw`Y_{n+1} = Y_n + \frac{h}{6}(k_1 + 2k_2 + 2k_3 + k_4)`}
            displayMode
          />
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Local truncation error <MathFormula latex="\mathcal{O}(h^5)" /> and global error{' '}
          <MathFormula latex="\mathcal{O}(h^4)" />: halving step size <MathFormula latex="h \to h/2" /> reduces numerical error by roughly <MathFormula latex="16\times" />.
        </p>
      </div>
    ),
  },
];

export function LearnRk4View() {
  const [selectedId, setSelectedId] = useState<MethodId>('rk4-curriculum');
  const activeMethod = METHODS.find((m) => m.id === selectedId) ?? METHODS[METHODS.length - 1];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className="space-y-5"
    >
      {/* Header */}
      <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-sky-600 dark:text-sky-400">
          <BookOpen className="w-4 h-4" aria-hidden="true" />
          <span>Numerical Methods Theory</span>
        </div>
        <h2 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
          Classical Fourth-Order Runge-Kutta (RK4) for Projectile Motion
        </h2>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
          Select any method from the list to read its mathematical formulation and core theory.
        </p>
      </div>

      {/* Minimalist Responsive Method List + Selected Theory */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Clickable Method Directory */}
        <aside className="lg:col-span-4 glass-card rounded-2xl p-2.5 space-y-1">
          {METHODS.map((method) => {
            const active = method.id === activeMethod.id;
            return (
              <button
                key={method.id}
                type="button"
                onClick={() => setSelectedId(method.id)}
                className={`w-full px-3.5 py-2.5 rounded-xl text-left flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                  active
                    ? 'bg-sky-500/15 border border-sky-400/50 text-sky-700 dark:text-sky-300'
                    : 'border border-transparent text-slate-700 dark:text-slate-300 hover:bg-sky-500/5'
                }`}
              >
                <div className="min-w-0 flex items-center gap-2.5">
                  <span
                    className={`text-[11px] font-mono font-bold tabular-nums ${
                      active ? 'text-emerald-600 dark:text-yellow-400' : 'text-slate-400'
                    }`}
                  >
                    {method.order}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-semibold truncate">{method.title}</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">
                      {method.category}
                    </div>
                  </div>
                </div>
                <ChevronRight
                  className={`w-4 h-4 shrink-0 transition-transform ${
                    active ? 'text-sky-500 translate-x-0.5' : 'text-slate-400'
                  }`}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </aside>

        {/* Focused Theory Reader */}
        <section className="lg:col-span-8 glass-card rounded-2xl p-5 sm:p-7 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-sky-500/20">
            <div>
              <div className="text-xs font-semibold text-emerald-600 dark:text-yellow-400">
                {activeMethod.order}. {activeMethod.category}
              </div>
              <h3 className="font-display text-lg sm:text-xl font-bold text-slate-900 dark:text-white mt-0.5">
                {activeMethod.title}
              </h3>
            </div>
          </div>

          <motion.div
            key={activeMethod.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {activeMethod.renderTheory()}
          </motion.div>
        </section>
      </div>
    </motion.div>
  );
}
