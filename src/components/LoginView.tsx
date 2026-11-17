import { motion } from 'motion/react';
import { AlertCircle, Compass, LineChart, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { MathFormula } from './MathFormula';

export function LoginView() {
  const { signInWithGoogle, authBusy, authError, clearAuthError } = useAuth();

  return (
    <div className="min-h-screen bg-[#040608] text-slate-100 flex flex-col justify-between relative overflow-hidden">
      {/* Animated SVG ballistic trajectories in Sky Blue, Green & Yellow */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none opacity-80"
        viewBox="0 0 1200 700"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="trajGradSkyGreen" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.12" />
            <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0.25" />
          </linearGradient>
        </defs>
        <motion.path
          d="M 80 620 Q 520 80 1120 620"
          fill="none"
          stroke="url(#trajGradSkyGreen)"
          strokeWidth="3"
          strokeDasharray="8 6"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
        />
        <motion.path
          d="M 80 620 Q 430 190 890 620"
          fill="none"
          stroke="#facc15"
          strokeWidth="2"
          strokeOpacity="0.32"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>

      <header className="relative z-10 max-w-6xl w-full mx-auto px-5 sm:px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-white border border-sky-400/40 flex items-center justify-center shadow-sm overflow-hidden p-0.5">
            <img
              src="/assets/aistudio/images_7db888d9.jpg"
              alt="PROJECTILE LAB logo"
              className="w-full h-full object-contain"
            />
          </div>
          <span className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap">
            PROJECTILE LAB
          </span>
        </div>
        <span className="text-xs font-medium text-sky-400 hidden sm:inline">
          Interactive RK4 Trajectory Platform
        </span>
      </header>

      <main className="relative z-10 max-w-6xl w-full mx-auto px-5 sm:px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="lg:col-span-7 space-y-6"
        >
          <div className="text-xs font-semibold text-sky-400 tracking-wide">
            Classical 4th-Order Runge-Kutta Physics Studio
          </div>
          <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-white leading-[1.1]">
            Interactive projectile motion, live canvas physics, and numerical analysis.
          </h1>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl">
            Launch balls, rockets, and aircraft on an interactive HTML5 canvas, inspect real-time
            kinematic graphs, and review clean numerical method theory.
          </p>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.12 }}
            className="p-4 sm:p-5 bg-[#0b0f14]/90 backdrop-blur-xl border border-sky-400/25 rounded-2xl max-w-xl"
          >
            <div className="text-xs text-sky-300 mb-2 font-semibold">Core RK4 Integrator</div>
            <div className="text-sm text-white overflow-x-auto">
              <MathFormula
                latex={String.raw`Y_{n+1} = Y_n + \frac{h}{6}\left(k_1 + 2k_2 + 2k_3 + k_4\right)`}
                displayMode
              />
            </div>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1 text-xs text-slate-300">
            <div className="flex items-start gap-2.5">
              <Compass className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" aria-hidden="true" />
              <span>Animated Ball &amp; Rocket trajectories</span>
            </div>
            <div className="flex items-start gap-2.5">
              <LineChart className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
              <span>Live x-t, y-t, v-t, y-x plots &amp; target challenge</span>
            </div>
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" aria-hidden="true" />
              <span>Private workspace via Google Sign-In</span>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="lg:col-span-5"
        >
          <div className="bg-[#0b0f14]/95 backdrop-blur-xl border border-sky-400/25 rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xl">
            <div className="space-y-2">
              <h2 className="font-display text-2xl font-bold text-white">
                Sign in to continue
              </h2>
              <p className="text-sm text-slate-400 leading-relaxed">
                Sign in with Google to run trajectories, save your experiments, and explore
                numerical methods.
              </p>
            </div>

            {authError && (
              <div
                role="alert"
                className="p-3.5 rounded-xl bg-red-500/15 border border-red-500/35 text-xs text-red-200 flex items-start justify-between gap-3"
              >
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{authError}</span>
                </div>
                <button
                  type="button"
                  onClick={clearAuthError}
                  className="text-red-200 font-medium underline shrink-0 cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            )}

            <motion.button
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.985 }}
              type="button"
              disabled={authBusy}
              onClick={signInWithGoogle}
              className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-gradient-to-r from-sky-400 to-emerald-400 hover:opacity-95 disabled:opacity-60 text-slate-950 font-bold text-sm flex items-center justify-center gap-3 transition-all shadow-md cursor-pointer"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-8.97z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
                />
              </svg>
              <span>{authBusy ? 'Signing in...' : 'Continue with Google'}</span>
            </motion.button>
          </div>
        </motion.div>
      </main>

      <footer className="relative z-10 max-w-6xl w-full mx-auto px-5 sm:px-6 py-4 text-xs text-slate-500 flex flex-wrap justify-between gap-4 border-t border-sky-500/15">
        <span>PROJECTILE LAB · Interactive Physics &amp; Numerical Methods</span>
        <span>RK4 Solver · Google Authentication</span>
      </footer>
    </div>
  );
}
