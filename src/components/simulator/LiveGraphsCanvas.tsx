import { MouseEvent, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  AnalyticalBenchmark,
  PhysicsState,
  TrajectoryComputation,
} from '../../physics/rk4CanvasEngine';

interface LiveGraphsCanvasProps {
  theme: 'dark' | 'light';
  trajectory: TrajectoryComputation;
  analytical: AnalyticalBenchmark;
  dragEnabled: boolean;
  currentState: PhysicsState;
  hasLaunched: boolean;
}

interface PlotConfig {
  title: string;
  xLabel: string;
  yLabel: string;
  xUnit: string;
  yUnit: string;
  color: string;
  secondaryColor?: string;
  points: { x: number; y: number }[];
  fullDomainPoints: { x: number; y: number }[];
  secondaryPoints?: { x: number; y: number }[];
  currentDot?: { x: number; y: number };
}

function SingleCanvasPlot({
  config,
  theme,
}: {
  config: PlotConfig;
  theme: 'dark' | 'light';
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoverPoint, setHoverPoint] = useState<{
    x: number;
    y: number;
    px: number;
    py: number;
  } | null>(null);

  const boundsRef = useRef({
    padL: 52,
    padR: 18,
    padT: 26,
    padB: 32,
    pw: 200,
    ph: 150,
    maxX: 1,
    maxY: 1,
    minY: 0,
    spanY: 1,
  });

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const draw = () => {
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const w = Math.max(240, wrap.clientWidth);
      const h = 225;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const isDark = theme === 'dark';
      const padL = 52;
      const padR = 18;
      const padT = 26;
      const padB = 32;
      const pw = Math.max(60, w - padL - padR);
      const ph = Math.max(50, h - padT - padB);

      // Compute domain bounds across full trajectory so axes stay rock-steady as curve draws
      let maxX = 1e-3;
      let maxY = 1e-3;
      let minY = 0;
      for (const pt of config.fullDomainPoints) {
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y > maxY) maxY = pt.y;
        if (pt.y < minY) minY = pt.y;
      }
      if (config.secondaryPoints) {
        for (const pt of config.secondaryPoints) {
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y > maxY) maxY = pt.y;
        }
      }
      maxX *= 1.06;
      maxY *= 1.14;
      const spanY = Math.max(1e-3, maxY - minY);

      boundsRef.current = { padL, padR, padT, padB, pw, ph, maxX, maxY, minY, spanY };

      const toX = (vx: number) => padL + (vx / maxX) * pw;
      const toY = (vy: number) => h - padB - ((vy - minY) / spanY) * ph;

      // Grid lines
      ctx.strokeStyle = isDark ? 'rgba(34, 211, 238, 0.1)' : 'rgba(15, 23, 42, 0.08)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i += 1) {
        const gy = padT + (ph * i) / 4;
        ctx.beginPath();
        ctx.moveTo(padL, gy);
        ctx.lineTo(w - padR, gy);
        ctx.stroke();

        const gx = padL + (pw * i) / 4;
        ctx.beginPath();
        ctx.moveTo(gx, padT);
        ctx.lineTo(gx, h - padB);
        ctx.stroke();
      }

      // Axes
      ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.45)' : 'rgba(51, 65, 85, 0.45)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(padL, padT);
      ctx.lineTo(padL, h - padB);
      ctx.lineTo(w - padR, h - padB);
      ctx.stroke();

      // Axis ticks
      ctx.fillStyle = isDark ? '#94a3b8' : '#475569';
      ctx.font = '500 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      for (let i = 0; i <= 2; i += 1) {
        const val = minY + (spanY * (2 - i)) / 2;
        const gy = padT + (ph * i) / 2;
        ctx.fillText(val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val.toFixed(1), padL - 6, gy + 3);
      }
      ctx.textAlign = 'center';
      for (let i = 0; i <= 2; i += 1) {
        const val = (maxX * i) / 2;
        const gx = padL + (pw * i) / 2;
        ctx.fillText(val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val.toFixed(1), gx, h - padB + 14);
      }

      // Faint preview of full curve
      if (config.fullDomainPoints.length > 1) {
        ctx.save();
        ctx.strokeStyle = config.color;
        ctx.globalAlpha = 0.18;
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        config.fullDomainPoints.forEach((pt, idx) => {
          const px = toX(pt.x);
          const py = toY(pt.y);
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
        ctx.restore();
      }

      // Secondary analytical dashed overlay (when drag is active)
      if (config.secondaryPoints && config.secondaryPoints.length > 1) {
        ctx.save();
        ctx.strokeStyle = config.secondaryColor || '#facc15';
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 1.7;
        ctx.beginPath();
        config.secondaryPoints.forEach((pt, idx) => {
          const px = toX(pt.x);
          const py = toY(pt.y);
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
        ctx.restore();
      }

      // Primary live progressive curve + subtle area fill
      if (config.points.length > 1) {
        ctx.save();
        const fillGrad = ctx.createLinearGradient(0, padT, 0, h - padB);
        fillGrad.addColorStop(0, `${config.color}33`);
        fillGrad.addColorStop(1, `${config.color}03`);
        ctx.fillStyle = fillGrad;
        ctx.beginPath();
        config.points.forEach((pt, idx) => {
          const px = toX(pt.x);
          const py = toY(pt.y);
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        const lastPt = config.points[config.points.length - 1];
        const firstPt = config.points[0];
        ctx.lineTo(toX(lastPt.x), h - padB);
        ctx.lineTo(toX(firstPt.x), h - padB);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = config.color;
        ctx.lineWidth = 2.6;
        ctx.lineCap = 'round';
        ctx.shadowColor = config.color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        config.points.forEach((pt, idx) => {
          const px = toX(pt.x);
          const py = toY(pt.y);
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
        ctx.restore();
      }

      // Current animated marker dot synced with projectile
      if (config.currentDot) {
        const dx = toX(config.currentDot.x);
        const dy = toY(config.currentDot.y);
        ctx.save();
        ctx.fillStyle = `${config.color}44`;
        ctx.beginPath();
        ctx.arc(dx, dy, 9, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = config.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(dx, dy, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // Hover crosshair + dot
      if (hoverPoint) {
        ctx.save();
        ctx.strokeStyle = isDark ? 'rgba(226, 232, 240, 0.45)' : 'rgba(51, 65, 85, 0.4)';
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(hoverPoint.px, padT);
        ctx.lineTo(hoverPoint.px, h - padB);
        ctx.moveTo(padL, hoverPoint.py);
        ctx.lineTo(w - padR, hoverPoint.py);
        ctx.stroke();

        ctx.fillStyle = config.color;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(hoverPoint.px, hoverPoint.py, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // Axis labels
      ctx.fillStyle = isDark ? '#cbd5e1' : '#1e293b';
      ctx.font = '600 10px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(config.xLabel, w - padR, h - 6);
      ctx.textAlign = 'left';
      ctx.fillText(config.yLabel, padL + 6, padT - 8);
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    window.addEventListener('resize', draw);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', draw);
    };
  }, [config, theme, hoverPoint]);

  const handleMouseMove = (e: MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || config.fullDomainPoints.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const { padL, pw, maxX, minY, spanY, padB } = boundsRef.current;
    const h = 225;
    const ph = boundsRef.current.ph;
    const targetX = Math.max(0, Math.min(maxX, ((mx - padL) / pw) * maxX));

    // Find closest sample point on curve
    let best = config.fullDomainPoints[0];
    let bestDist = Math.abs(best.x - targetX);
    for (const pt of config.fullDomainPoints) {
      const d = Math.abs(pt.x - targetX);
      if (d < bestDist) {
        best = pt;
        bestDist = d;
      }
    }

    const px = padL + (best.x / maxX) * pw;
    const py = h - padB - ((best.y - minY) / spanY) * ph;
    setHoverPoint({ x: best.x, y: best.y, px, py });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      ref={wrapRef}
      className="relative glass-card rounded-2xl p-3.5 space-y-1.5"
    >
      <div className="flex items-center justify-between px-1">
        <span className="font-display text-xs font-semibold text-slate-900 dark:text-white">
          {config.title}
        </span>
        {config.secondaryPoints ? (
          <span className="text-[10px] text-amber-600 dark:text-amber-300">
            Dashed: No-Drag Ideal
          </span>
        ) : (
          <span className="text-[10px] text-slate-400">Hover curve to inspect</span>
        )}
      </div>

      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverPoint(null)}
        className="block w-full h-[225px] cursor-crosshair"
      />

      {hoverPoint && (
        <div
          style={{
            left: Math.min(200, Math.max(12, hoverPoint.px - 45)),
            top: Math.max(32, hoverPoint.py - 36),
          }}
          className="pointer-events-none absolute z-20 px-2.5 py-1 rounded-lg bg-[#05070a]/95 text-white border border-sky-400/40 text-[10px] tabular-nums shadow-md whitespace-nowrap"
        >
          <span>
            { hoverPoint.x.toFixed(2) } {config.xUnit} →{' '}
            <strong className="text-sky-300">
              {hoverPoint.y.toFixed(2)} {config.yUnit}
            </strong>
          </span>
        </div>
      )}
    </motion.div>
  );
}

/**
 * Tab 2: Live HTML5 Canvas plots for x-t, y-t, v-t, and y-x with moving dot & hover tooltip.
 */
export function LiveGraphsCanvas({
  theme,
  trajectory,
  analytical,
  dragEnabled,
  currentState,
  hasLaunched,
}: LiveGraphsCanvasProps) {
  const activePts = hasLaunched
    ? [...trajectory.points.filter((pt) => pt.t <= currentState.t), currentState]
    : trajectory.points;

  const currentSpeed = Math.hypot(currentState.vx, currentState.vy);

  const plots: PlotConfig[] = [
    {
      title: 'Horizontal Position vs. Time (x - t)',
      xLabel: 'Time t (s)',
      yLabel: 'x (m)',
      xUnit: 's',
      yUnit: 'm',
      color: '#38bdf8',
      points: activePts.map((pt) => ({ x: pt.t, y: pt.x })),
      fullDomainPoints: trajectory.points.map((pt) => ({ x: pt.t, y: pt.x })),
      currentDot: { x: currentState.t, y: currentState.x },
    },
    {
      title: 'Vertical Height vs. Time (y - t)',
      xLabel: 'Time t (s)',
      yLabel: 'y (m)',
      xUnit: 's',
      yUnit: 'm',
      color: '#22c55e',
      points: activePts.map((pt) => ({ x: pt.t, y: pt.y })),
      fullDomainPoints: trajectory.points.map((pt) => ({ x: pt.t, y: pt.y })),
      currentDot: { x: currentState.t, y: currentState.y },
    },
    {
      title: 'Resultant Speed vs. Time (v - t)',
      xLabel: 'Time t (s)',
      yLabel: 'Speed (m/s)',
      xUnit: 's',
      yUnit: 'm/s',
      color: '#facc15',
      points: activePts.map((pt) => ({ x: pt.t, y: Math.hypot(pt.vx, pt.vy) })),
      fullDomainPoints: trajectory.points.map((pt) => ({ x: pt.t, y: Math.hypot(pt.vx, pt.vy) })),
      currentDot: { x: currentState.t, y: currentSpeed },
    },
    {
      title: 'Trajectory Profile (y - x)',
      xLabel: 'Distance x (m)',
      yLabel: 'Height y (m)',
      xUnit: 'm',
      yUnit: 'm',
      color: '#0ea5e9',
      secondaryColor: '#facc15',
      points: activePts.map((pt) => ({ x: pt.x, y: pt.y })),
      fullDomainPoints: trajectory.points.map((pt) => ({ x: pt.x, y: pt.y })),
      secondaryPoints: dragEnabled ? analytical.samplePoints : undefined,
      currentDot: { x: currentState.x, y: currentState.y },
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {plots.map((cfg) => (
        <SingleCanvasPlot key={cfg.title} config={cfg} theme={theme} />
      ))}
    </div>
  );
}
