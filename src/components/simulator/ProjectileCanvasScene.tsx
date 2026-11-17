import { useEffect, useRef } from 'react';
import {
  AnalyticalBenchmark,
  ComparisonTrajectoryItem,
  interpolateTrajectoryAtTime,
  PhysicsState,
  TrajectoryComputation,
} from '../../physics/rk4CanvasEngine';
import { ProjectileType } from '../../types/simulation';

export type EffectsQuality = 'low' | 'medium' | 'high';
export type EnvironmentPlanet = 'earth' | 'moon' | 'mars' | 'jupiter' | 'custom';

export interface GhostTrail {
  id: string;
  label: string;
  color: string;
  points: { x: number; y: number }[];
  range: number;
  maxHeight: number;
}

interface DustParticle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

interface SmokeParticle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

interface ConfettiParticle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vRot: number;
  color: string;
  size: number;
  life: number;
}

interface ImpactRing {
  x: number;
  bornAt: number;
  color: string;
}

interface ProjectileCanvasSceneProps {
  theme: 'dark' | 'light';
  environmentPlanet: EnvironmentPlanet;
  projectileType: ProjectileType;
  onChangeProjectileType?: (next: 'ball' | 'rocket') => void;
  angleDeg: number;
  launchHeight: number;
  initialVelocity: number;
  windSpeed: number;
  dragEnabled: boolean;
  trajectory: TrajectoryComputation;
  analytical: AnalyticalBenchmark;
  currentState: PhysicsState;
  hasLaunched: boolean;
  isPlaying: boolean;
  hasLanded: boolean;
  isPausedAtApex: boolean;
  onResumeFromApex?: () => void;
  launchJustOccurred: number;
  landingJustOccurred: number;
  nearMissTrigger: number;
  nearMissDelta: number | null;
  countdownValue: number | null;
  isNearApexSlowMo: boolean;
  showVelocityVectors: boolean;
  showPredictedPath: boolean;
  showGhostTrails: boolean;
  showStroboscopic: boolean;
  showRulers: boolean;
  compareDragGap: boolean;
  angleCompareMode: boolean;
  angleComparisonSet: ComparisonTrajectoryItem[];
  gravityCompareMode: boolean;
  gravityComparisonSet: ComparisonTrajectoryItem[];
  autoCamera: boolean;
  effectsQuality: EffectsQuality;
  ghostTrails: GhostTrail[];
  challengeMode: boolean;
  challengeTargetX: number | null;
  challengeTargetRadius: number;
  confettiTrigger: number;
}

const CONFETTI_COLORS = ['#38bdf8', '#22c55e', '#facc15', '#0ea5e9', '#4ade80', '#fde047'];

function formatAxisMeters(meters: number): string {
  if (meters >= 10000) return `${(meters / 1000).toFixed(0)}km`;
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)}km`;
  return `${Math.round(meters)}m`;
}

/**
 * Maps normalized speed [0..1] to Sky Blue -> Emerald Green -> Bright Yellow.
 */
function speedToColor(normSpeed: number): string {
  const t = Math.max(0, Math.min(1, normSpeed));
  if (t < 0.5) {
    const u = t * 2;
    const r = Math.round(56 + u * (34 - 56));
    const g = Math.round(189 + u * (197 - 189));
    const b = Math.round(248 + u * (94 - 248));
    return `rgb(${r}, ${g}, ${b})`;
  }
  const u = (t - 0.5) * 2;
  const r = Math.round(34 + u * (250 - 34));
  const g = Math.round(197 + u * (204 - 197));
  const b = Math.round(94 + u * (21 - 94));
  return `rgb(${r}, ${g}, ${b})`;
}

export function ProjectileCanvasScene(props: ProjectileCanvasSceneProps) {
  const {
    theme,
    environmentPlanet,
    projectileType,
    onChangeProjectileType,
    currentState,
    trajectory,
    isPausedAtApex,
    onResumeFromApex,
    countdownValue,
    isNearApexSlowMo,
    gravityCompareMode,
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const dustPoolRef = useRef<DustParticle[]>(
    Array.from({ length: 64 }, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 1,
      size: 3,
      color: '',
    })),
  );
  const smokePoolRef = useRef<SmokeParticle[]>(
    Array.from({ length: 96 }, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 1,
      size: 6,
    })),
  );
  const lastRocketSmokeEmitRef = useRef<number>(0);
  const confettiPoolRef = useRef<ConfettiParticle[]>(
    Array.from({ length: 100 }, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      rot: 0,
      vRot: 0,
      color: '#38bdf8',
      size: 6,
      life: 0,
    })),
  );

  const impactRingsRef = useRef<ImpactRing[]>([]);
  const launchTimeRef = useRef<number>(-999);
  const bounceStartRef = useRef<number>(-999);
  const shakeRef = useRef<number>(0);
  const spinAngleRef = useRef<number>(0);
  const camRef = useRef({ minX: -15, maxX: 120, minY: -8, maxY: 75 });
  const cloudOffsetRef = useRef(0);
  const windOffsetRef = useRef(0);
  const reducedMotionRef = useRef(false);

  const lastLaunchTriggerRef = useRef(0);
  const lastLandingTriggerRef = useRef(0);
  const lastConfettiTriggerRef = useRef(0);
  const lastNearMissTriggerRef = useRef(0);

  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    reducedMotionRef.current = Boolean(mq?.matches);
    const listener = (e: MediaQueryListEvent) => {
      reducedMotionRef.current = e.matches;
    };
    mq?.addEventListener?.('change', listener);
    return () => mq?.removeEventListener?.('change', listener);
  }, []);

  // Trigger Thrower Follow-Through / Rocket Launch Pad Smoke
  useEffect(() => {
    if (props.launchJustOccurred > lastLaunchTriggerRef.current) {
      lastLaunchTriggerRef.current = props.launchJustOccurred;
      launchTimeRef.current = performance.now();
      lastRocketSmokeEmitRef.current = 0;

      if (!reducedMotionRef.current && props.effectsQuality !== 'low') {
        const isBall = props.projectileType === 'ball';
        shakeRef.current = isBall ? 1.5 : props.effectsQuality === 'high' ? 4.0 : 2.2;
        const count = isBall ? 0 : props.effectsQuality === 'high' ? 24 : 14;
        const padSpanScale = Math.max(1.5, props.trajectory.landingPoint.x * 0.025);
        const pool = smokePoolRef.current;
        let spawned = 0;
        for (let i = 0; i < pool.length && spawned < count; i += 1) {
          if (!pool[i].active) {
            const sideDir = (Math.random() - 0.5) * 2;
            pool[i].active = true;
            pool[i].x = sideDir * 0.5;
            pool[i].y = Math.max(0.1, props.launchHeight + Math.random() * 0.4);
            pool[i].vx = sideDir * (0.8 + Math.random() * 1.4) * padSpanScale;
            pool[i].vy = (0.3 + Math.random() * 0.7) * padSpanScale;
            pool[i].life = 0;
            pool[i].maxLife = 0.7 + Math.random() * 0.55;
            pool[i].size = 6 + Math.random() * 8;
            spawned += 1;
          }
        }
      }
    }
  }, [
    props.launchJustOccurred,
    props.launchHeight,
    props.trajectory.landingPoint.x,
    props.effectsQuality,
    props.projectileType,
  ]);

  useEffect(() => {
    if (!props.hasLaunched) {
      for (const sm of smokePoolRef.current) {
        sm.active = false;
      }
    }
  }, [props.hasLaunched]);

  // Trigger Landing Impact Ring + Dust + Bounce
  useEffect(() => {
    if (props.landingJustOccurred > lastLandingTriggerRef.current) {
      lastLandingTriggerRef.current = props.landingJustOccurred;
      bounceStartRef.current = performance.now();
      const landX = props.trajectory.landingPoint.x;

      impactRingsRef.current = [
        ...impactRingsRef.current.slice(-4),
        { x: landX, bornAt: performance.now(), color: '#22c55e' },
      ];

      if (!reducedMotionRef.current && props.effectsQuality !== 'low') {
        shakeRef.current = Math.max(shakeRef.current, props.effectsQuality === 'high' ? 4.5 : 2.5);
        const count = props.effectsQuality === 'high' ? 24 : 12;
        const spreadScale = Math.max(1, Math.min(25, landX * 0.012));
        const pool = dustPoolRef.current;
        let spawned = 0;
        for (let i = 0; i < pool.length && spawned < count; i += 1) {
          if (!pool[i].active) {
            const angle = Math.PI * (0.08 + 0.84 * Math.random());
            const speed = (0.5 + Math.random() * 2.0) * spreadScale;
            pool[i].active = true;
            pool[i].x = landX;
            pool[i].y = 0.15;
            pool[i].vx = Math.cos(angle) * speed * (Math.random() > 0.5 ? 1 : -1);
            pool[i].vy = Math.abs(Math.sin(angle) * speed) * 0.85;
            pool[i].life = 0;
            pool[i].maxLife = 0.65 + Math.random() * 0.5;
            pool[i].size = 2.5 + Math.random() * 4;
            pool[i].color =
              props.environmentPlanet === 'jupiter'
                ? 'rgba(251, 191, 36, 0.8)'
                : props.environmentPlanet === 'mars'
                  ? 'rgba(249, 115, 22, 0.8)'
                  : props.theme === 'dark'
                    ? 'rgba(74, 222, 128, 0.8)'
                    : 'rgba(22, 163, 74, 0.65)';
            spawned += 1;
          }
        }
      }
    }
  }, [
    props.landingJustOccurred,
    props.trajectory.landingPoint.x,
    props.theme,
    props.effectsQuality,
    props.environmentPlanet,
  ]);

  // Trigger Near-Miss Shake
  useEffect(() => {
    if (props.nearMissTrigger > lastNearMissTriggerRef.current) {
      lastNearMissTriggerRef.current = props.nearMissTrigger;
      if (!reducedMotionRef.current && props.effectsQuality !== 'low') {
        shakeRef.current = 7.5;
      }
    }
  }, [props.nearMissTrigger, props.effectsQuality]);

  // Trigger Confetti on Challenge Target Hit
  useEffect(() => {
    if (props.confettiTrigger > lastConfettiTriggerRef.current && props.challengeTargetX !== null) {
      lastConfettiTriggerRef.current = props.confettiTrigger;
      if (reducedMotionRef.current) return;
      const canvas = canvasRef.current;
      const w = canvas ? canvas.clientWidth : 800;
      const h = canvas ? canvas.clientHeight : 460;
      const maxCount =
        props.effectsQuality === 'high' ? 95 : props.effectsQuality === 'medium' ? 50 : 20;
      const pool = confettiPoolRef.current;
      for (let i = 0; i < pool.length; i += 1) {
        if (i < maxCount) {
          const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
          const spd = 170 + Math.random() * 360;
          pool[i].active = true;
          pool[i].x = w * 0.55 + (Math.random() - 0.5) * 120;
          pool[i].y = h * 0.72;
          pool[i].vx = Math.cos(angle) * spd;
          pool[i].vy = Math.sin(angle) * spd;
          pool[i].rot = Math.random() * Math.PI * 2;
          pool[i].vRot = (Math.random() - 0.5) * 11;
          pool[i].color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
          pool[i].size = 5 + Math.random() * 5.5;
          pool[i].life = 0;
        } else {
          pool[i].active = false;
        }
      }
    }
  }, [props.confettiTrigger, props.challengeTargetX, props.effectsQuality]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let dpr = Math.max(1, window.devicePixelRatio || 1);
    let viewW = container.clientWidth || 800;
    let viewH = container.clientHeight || 500;

    const resizeCanvas = () => {
      dpr = Math.max(1, window.devicePixelRatio || 1);
      viewW = Math.max(300, container.clientWidth);
      viewH = Math.max(300, container.clientHeight);
      canvas.width = Math.round(viewW * dpr);
      canvas.height = Math.round(viewH * dpr);
    };

    resizeCanvas();
    const ro = new ResizeObserver(resizeCanvas);
    ro.observe(container);
    window.addEventListener('resize', resizeCanvas);

    let rafId = 0;
    let prevNow = performance.now();

    const drawArrow = (
      ctx: CanvasRenderingContext2D,
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      color: string,
      label?: string,
    ) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy);
      if (len < 3) return;
      const angle = Math.atan2(dy, dx);
      const headLen = Math.min(11, Math.max(6, len * 0.25));

      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(
        x2 - headLen * Math.cos(angle - Math.PI / 6),
        y2 - headLen * Math.sin(angle - Math.PI / 6),
      );
      ctx.lineTo(
        x2 - headLen * Math.cos(angle + Math.PI / 6),
        y2 - headLen * Math.sin(angle + Math.PI / 6),
      );
      ctx.closePath();
      ctx.fill();

      if (label) {
        ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(label, x2 + 6, y2 - 4);
      }
      ctx.restore();
    };

    /**
     * Draws an animated leafy tree anchored on groundPy.
     */
    const drawAnimatedTree = (
      ctx: CanvasRenderingContext2D,
      x: number,
      groundPy: number,
      scale: number,
      sway: number,
      isDark: boolean,
      kind: 'oak' | 'pine',
    ) => {
      ctx.save();
      ctx.translate(x, groundPy);
      ctx.scale(scale, scale);

      if (kind === 'pine') {
        ctx.fillStyle = isDark ? '#3f2e21' : '#78350f';
        ctx.fillRect(-3.5, -18, 7, 18);

        ctx.translate(0, -14);
        ctx.rotate(sway * 0.035);
        const layers = [
          { w: 22, h: 24, y: 0, fill: isDark ? '#14532d' : '#15803d' },
          { w: 18, h: 22, y: -14, fill: isDark ? '#166534' : '#16a34a' },
          { w: 13, h: 18, y: -27, fill: isDark ? '#15803d' : '#22c55e' },
        ];
        for (const l of layers) {
          ctx.fillStyle = l.fill;
          ctx.beginPath();
          ctx.moveTo(0, l.y - l.h);
          ctx.lineTo(-l.w, l.y);
          ctx.lineTo(l.w, l.y);
          ctx.closePath();
          ctx.fill();
        }
      } else {
        ctx.fillStyle = isDark ? '#452c1e' : '#7c4a28';
        ctx.beginPath();
        ctx.roundRect(-4, -26, 8, 26, 2);
        ctx.fill();

        ctx.translate(0, -26);
        ctx.rotate(sway * 0.025);
        ctx.fillStyle = isDark ? '#14532d' : '#16a34a';
        ctx.beginPath();
        ctx.arc(-11, -6, 13, 0, Math.PI * 2);
        ctx.arc(11, -5, 12, 0, Math.PI * 2);
        ctx.arc(0, -16, 16, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = isDark ? '#166534' : '#22c55e';
        ctx.beginPath();
        ctx.arc(-4, -14, 11, 0, Math.PI * 2);
        ctx.arc(6, -12, 9, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };

    /**
     * Draws an Earth house / cottage anchored on groundPy with animated chimney smoke.
     */
    const drawAnimatedHouse = (
      ctx: CanvasRenderingContext2D,
      x: number,
      groundPy: number,
      scale: number,
      now: number,
      isDark: boolean,
      reduced: boolean,
    ) => {
      ctx.save();
      ctx.translate(x, groundPy);
      ctx.scale(scale, scale);

      // Chimney
      ctx.fillStyle = isDark ? '#334155' : '#94a3b8';
      ctx.fillRect(14, -52, 7, 18);

      // Animated chimney smoke puffs
      if (!reduced) {
        for (let s = 0; s < 3; s += 1) {
          const phase = ((now * 0.0007 + s * 0.33) % 1);
          const sx = 17 + Math.sin(now * 0.002 + s * 2) * 5 + phase * 10;
          const sy = -56 - phase * 24;
          const alpha = (1 - phase) * (isDark ? 0.32 : 0.45);
          ctx.fillStyle = `rgba(226, 232, 240, ${alpha.toFixed(2)})`;
          ctx.beginPath();
          ctx.arc(sx, sy, 3.5 + phase * 4.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // House walls
      ctx.fillStyle = isDark ? '#1e293b' : '#f8fafc';
      ctx.strokeStyle = isDark ? '#334155' : '#cbd5e1';
      ctx.lineWidth = 1.4;
      ctx.fillRect(-26, -34, 52, 34);
      ctx.strokeRect(-26, -34, 52, 34);

      // Sloped roof
      ctx.fillStyle = isDark ? '#0369a1' : '#0284c7';
      ctx.beginPath();
      ctx.moveTo(-31, -33);
      ctx.lineTo(0, -56);
      ctx.lineTo(31, -33);
      ctx.closePath();
      ctx.fill();

      // Door
      ctx.fillStyle = isDark ? '#0f172a' : '#78350f';
      ctx.beginPath();
      ctx.roundRect(-5, -18, 10, 18, [3, 3, 0, 0]);
      ctx.fill();

      // Windows (warm amber glow in dark mode, sky reflection in day)
      const winColor = isDark ? '#fde047' : '#bae6fd';
      ctx.fillStyle = winColor;
      ctx.fillRect(-20, -24, 10, 9);
      ctx.fillRect(10, -24, 10, 9);
      if (isDark) {
        ctx.fillStyle = 'rgba(250, 204, 21, 0.16)';
        ctx.beginPath();
        ctx.arc(-15, -19, 10, 0, Math.PI * 2);
        ctx.arc(15, -19, 10, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };

    /**
     * Renders realistic animated planetary environment backdrops (Earth, Jupiter, Mars, Moon, Custom).
     */
    const drawEnvironmentBackground = (
      ctx: CanvasRenderingContext2D,
      planet: EnvironmentPlanet,
      groundPy: number,
      now: number,
      isDark: boolean,
      reduced: boolean,
      windSpeed: number,
    ) => {
      const breeze = reduced ? 0 : Math.sin(now * 0.0022 + windSpeed * 0.1);

      if (planet === 'jupiter') {
        // 1. Deep Jovian Atmosphere Sky Bands
        const jupSky = ctx.createLinearGradient(0, 0, 0, groundPy);
        if (isDark) {
          jupSky.addColorStop(0, '#070403');
          jupSky.addColorStop(0.32, '#1f1007');
          jupSky.addColorStop(0.68, '#3b1d0a');
          jupSky.addColorStop(1, '#582c10');
        } else {
          jupSky.addColorStop(0, '#7c2d12');
          jupSky.addColorStop(0.38, '#c2410c');
          jupSky.addColorStop(0.75, '#f59e0b');
          jupSky.addColorStop(1, '#fde68a');
        }
        ctx.fillStyle = jupSky;
        ctx.fillRect(-10, -10, viewW + 20, groundPy + 16);

        // High-altitude faint stars + Galilean moons
        const moonDefs = [
          { x: viewW * 0.16, y: groundPy * 0.16, r: 9, color: '#fef08a' }, // Io
          { x: viewW * 0.28, y: groundPy * 0.11, r: 6.5, color: '#e0f2fe' }, // Europa
          { x: viewW * 0.78, y: groundPy * 0.18, r: 11, color: '#cbd5e1' }, // Ganymede
        ];
        for (let m = 0; m < moonDefs.length; m += 1) {
          const md = moonDefs[m];
          if (md.y >= groundPy - 40) continue;
          const drift = reduced ? 0 : Math.sin(now * 0.00025 + m) * 6;
          ctx.save();
          ctx.fillStyle = md.color;
          ctx.beginPath();
          ctx.arc(md.x + drift, md.y, md.r, 0, Math.PI * 2);
          ctx.fill();
          // Crescent shadow
          ctx.fillStyle = isDark ? 'rgba(7, 4, 3, 0.55)' : 'rgba(124, 45, 18, 0.35)';
          ctx.beginPath();
          ctx.arc(md.x + drift + md.r * 0.35, md.y - md.r * 0.1, md.r * 0.92, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // Swirling Horizontal Jovian Cloud Bands
        const bandSpecs = [
          { yFrac: 0.28, h: 18, speed: 18, color: isDark ? 'rgba(245, 158, 11, 0.14)' : 'rgba(255, 251, 235, 0.35)' },
          { yFrac: 0.44, h: 24, speed: -14, color: isDark ? 'rgba(180, 83, 9, 0.22)' : 'rgba(154, 52, 18, 0.24)' },
          { yFrac: 0.62, h: 20, speed: 22, color: isDark ? 'rgba(251, 191, 36, 0.14)' : 'rgba(254, 243, 199, 0.32)' },
          { yFrac: 0.79, h: 16, speed: -12, color: isDark ? 'rgba(217, 119, 6, 0.18)' : 'rgba(180, 83, 9, 0.22)' },
        ];
        ctx.save();
        for (let b = 0; b < bandSpecs.length; b += 1) {
          const band = bandSpecs[b];
          const by = groundPy * band.yFrac;
          if (by > groundPy - 20) continue;
          const phase = reduced ? 0 : (now * 0.001 * band.speed) % 160;
          ctx.fillStyle = band.color;
          ctx.beginPath();
          ctx.moveTo(0, by);
          for (let x = 0; x <= viewW + 40; x += 40) {
            const wave = Math.sin((x + phase) * 0.02 + b) * 6;
            ctx.lineTo(x, by + wave);
          }
          for (let x = viewW + 40; x >= 0; x -= 40) {
            const wave = Math.sin((x + phase) * 0.02 + b) * 6;
            ctx.lineTo(x, by + band.h + wave);
          }
          ctx.closePath();
          ctx.fill();
        }

        // Animated Great Red Spot Cyclone Vortex in background sky
        const vortexX = viewW * 0.72 + (reduced ? 0 : Math.sin(now * 0.0003) * 14);
        const vortexY = groundPy * 0.48;
        if (vortexY > 36 && vortexY < groundPy - 36) {
          ctx.translate(vortexX, vortexY);
          ctx.scale(1.65, 0.75);
          const rot = reduced ? 0 : now * 0.0006;
          for (let ring = 3; ring >= 1; ring -= 1) {
            ctx.save();
            ctx.rotate(rot * (ring % 2 === 0 ? 1 : -1.2));
            ctx.strokeStyle =
              ring === 1
                ? isDark
                  ? 'rgba(248, 113, 113, 0.42)'
                  : 'rgba(185, 28, 28, 0.45)'
                : isDark
                  ? 'rgba(251, 146, 60, 0.26)'
                  : 'rgba(234, 88, 12, 0.35)';
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.arc(0, 0, ring * 14, 0.2, Math.PI * 1.75);
            ctx.stroke();
            ctx.restore();
          }
        }
        ctx.restore();
      } else if (planet === 'mars') {
        // Mars Dusty Butterscotch Sky + Moons + Red Mesas + Research Outpost
        const marsSky = ctx.createLinearGradient(0, 0, 0, groundPy);
        if (isDark) {
          marsSky.addColorStop(0, '#090404');
          marsSky.addColorStop(0.55, '#1d0c08');
          marsSky.addColorStop(1, '#3b180e');
        } else {
          marsSky.addColorStop(0, '#fdba74');
          marsSky.addColorStop(0.55, '#fed7aa');
          marsSky.addColorStop(1, '#ffedd5');
        }
        ctx.fillStyle = marsSky;
        ctx.fillRect(-10, -10, viewW + 20, groundPy + 16);

        if (isDark) {
          const starCount = pCount(propsRef.current.effectsQuality);
          for (let s = 0; s < starCount; s += 1) {
            const sx = (s * 173 + 29) % viewW;
            const sy = (s * 97 + 19) % Math.max(60, groundPy * 0.62);
            ctx.fillStyle = 'rgba(254, 215, 170, 0.5)';
            ctx.fillRect(sx, sy, 1.4, 1.4);
          }
        }

        // Pale sunlit sun + Phobos/Deimos
        ctx.save();
        ctx.fillStyle = isDark ? 'rgba(254, 215, 170, 0.45)' : 'rgba(255, 255, 255, 0.72)';
        ctx.beginPath();
        ctx.arc(viewW * 0.82, Math.max(44, groundPy * 0.22), 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Distant Red Canyon Mesas along groundPy
        ctx.save();
        ctx.fillStyle = isDark ? 'rgba(124, 45, 18, 0.45)' : 'rgba(194, 65, 12, 0.24)';
        ctx.beginPath();
        ctx.moveTo(0, groundPy);
        ctx.lineTo(viewW * 0.12, groundPy - 42);
        ctx.lineTo(viewW * 0.24, groundPy - 42);
        ctx.lineTo(viewW * 0.34, groundPy - 16);
        ctx.lineTo(viewW * 0.56, groundPy - 56);
        ctx.lineTo(viewW * 0.68, groundPy - 56);
        ctx.lineTo(viewW * 0.78, groundPy - 20);
        ctx.lineTo(viewW, groundPy - 36);
        ctx.lineTo(viewW, groundPy);
        ctx.closePath();
        ctx.fill();

        // Small Martian Research Dome + Solar Panel on far ground
        const domeX = viewW * 0.78;
        ctx.fillStyle = isDark ? '#334155' : '#f8fafc';
        ctx.strokeStyle = '#fb923c';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(domeX, groundPy, 22, Math.PI, 0);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      } else if (planet === 'moon') {
        // Moon Starry Cosmos + Earthrise + Craters + Lunar Outpost
        const moonSky = ctx.createLinearGradient(0, 0, 0, groundPy);
        if (isDark) {
          moonSky.addColorStop(0, '#010204');
          moonSky.addColorStop(1, '#090d14');
        } else {
          moonSky.addColorStop(0, '#0f172a');
          moonSky.addColorStop(1, '#1e293b');
        }
        ctx.fillStyle = moonSky;
        ctx.fillRect(-10, -10, viewW + 20, groundPy + 16);

        // Crisp Stars
        const starCount = pCount(propsRef.current.effectsQuality) + 12;
        for (let s = 0; s < starCount; s += 1) {
          const sx = (s * 167 + 41) % viewW;
          const sy = (s * 89 + 23) % Math.max(70, groundPy * 0.75);
          const twinkle = reduced ? 0.65 : 0.35 + 0.65 * Math.abs(Math.sin(now * 0.002 + s));
          ctx.fillStyle = `rgba(226, 232, 240, ${twinkle.toFixed(2)})`;
          ctx.beginPath();
          ctx.arc(sx, sy, s % 4 === 0 ? 1.5 : 0.9, 0, Math.PI * 2);
          ctx.fill();
        }

        // Earthrise Sphere in upper-right sky
        const ex = viewW * 0.82;
        const ey = Math.max(46, groundPy * 0.24);
        if (ey < groundPy - 40) {
          ctx.save();
          const eGlow = ctx.createRadialGradient(ex, ey, 14, ex, ey, 34);
          eGlow.addColorStop(0, 'rgba(56, 189, 248, 0.35)');
          eGlow.addColorStop(1, 'rgba(56, 189, 248, 0)');
          ctx.fillStyle = eGlow;
          ctx.beginPath();
          ctx.arc(ex, ey, 34, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#0284c7';
          ctx.beginPath();
          ctx.arc(ex, ey, 20, 0, Math.PI * 2);
          ctx.fill();

          // Continents + cloud wisps
          ctx.fillStyle = '#22c55e';
          ctx.beginPath();
          ctx.arc(ex - 6, ey - 3, 7, 0, Math.PI * 2);
          ctx.arc(ex + 5, ey + 4, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
          ctx.fillRect(ex - 14, ey - 8, 16, 2.5);
          ctx.fillRect(ex - 4, ey + 6, 14, 2.5);
          ctx.restore();
        }

        // Lunar jagged horizon hills
        ctx.save();
        ctx.fillStyle = isDark ? 'rgba(51, 65, 85, 0.45)' : 'rgba(100, 116, 139, 0.5)';
        ctx.beginPath();
        ctx.moveTo(0, groundPy);
        ctx.lineTo(viewW * 0.15, groundPy - 24);
        ctx.lineTo(viewW * 0.32, groundPy - 12);
        ctx.lineTo(viewW * 0.54, groundPy - 34);
        ctx.lineTo(viewW * 0.75, groundPy - 15);
        ctx.lineTo(viewW, groundPy - 28);
        ctx.lineTo(viewW, groundPy);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        // EARTH (and default Custom): Bright Sky, Sun/Moon, Clouds, Rolling Hills, Trees & Houses
        const skyShift = reduced ? 0 : Math.sin(now * 0.0004) * 12;
        const skyGrad = ctx.createLinearGradient(0, 0, viewW * 0.25 + skyShift, groundPy);
        if (isDark) {
          skyGrad.addColorStop(0, '#020408');
          skyGrad.addColorStop(0.55, '#070e17');
          skyGrad.addColorStop(1, '#0d1b2a');
        } else {
          skyGrad.addColorStop(0, '#38bdf8');
          skyGrad.addColorStop(0.55, '#bae6fd');
          skyGrad.addColorStop(1, '#f0f9ff');
        }
        ctx.fillStyle = skyGrad;
        ctx.fillRect(-10, -10, viewW + 20, groundPy + 16);

        if (isDark) {
          const starCount = pCount(propsRef.current.effectsQuality);
          for (let s = 0; s < starCount; s += 1) {
            const sx = (s * 173 + 29) % viewW;
            const sy = (s * 97 + 19) % Math.max(60, groundPy * 0.68);
            const twinkle = reduced ? 0.5 : 0.25 + 0.65 * Math.abs(Math.sin(now * 0.002 + s * 1.7));
            ctx.fillStyle = `rgba(186, 230, 253, ${twinkle.toFixed(2)})`;
            ctx.beginPath();
            ctx.arc(sx, sy, s % 3 === 0 ? 1.5 : 0.95, 0, Math.PI * 2);
            ctx.fill();
          }
          // Glowing Crescent Moon
          const moonY = Math.max(40, groundPy * 0.22);
          if (moonY < groundPy - 30) {
            ctx.fillStyle = '#fef08a';
            ctx.beginPath();
            ctx.arc(viewW * 0.84, moonY, 15, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#070e17';
            ctx.beginPath();
            ctx.arc(viewW * 0.84 + 6, moonY - 3, 13, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          // Warm Sun Glow in Daylight
          const sunX = viewW * 0.84;
          const sunY = Math.max(42, groundPy * 0.22);
          if (sunY < groundPy - 30) {
            const sunGlow = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 46);
            sunGlow.addColorStop(0, 'rgba(254, 240, 138, 0.95)');
            sunGlow.addColorStop(0.45, 'rgba(250, 204, 21, 0.45)');
            sunGlow.addColorStop(1, 'rgba(250, 204, 21, 0)');
            ctx.fillStyle = sunGlow;
            ctx.beginPath();
            ctx.arc(sunX, sunY, 46, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#fef08a';
            ctx.beginPath();
            ctx.arc(sunX, sunY, 16, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Slow Parallax Clouds
        const clouds = [
          { base: 90, y: groundPy * 0.22, scale: 1.0, speed: 0.7 },
          { base: 350, y: groundPy * 0.34, scale: 0.78, speed: 0.45 },
          { base: 650, y: groundPy * 0.18, scale: 1.15, speed: 0.9 },
          { base: 930, y: groundPy * 0.3, scale: 0.88, speed: 0.55 },
        ];
        for (const cl of clouds) {
          const cx = ((cl.base + cloudOffsetRef.current * cl.speed) % (viewW + 260)) - 130;
          if (cl.y < groundPy - 45 && cl.y > 24) {
            ctx.save();
            ctx.translate(cx, cl.y);
            ctx.scale(cl.scale, cl.scale);
            ctx.fillStyle = isDark ? 'rgba(56, 189, 248, 0.08)' : 'rgba(255, 255, 255, 0.85)';
            ctx.beginPath();
            ctx.arc(0, 0, 20, 0, Math.PI * 2);
            ctx.arc(20, -5, 24, 0, Math.PI * 2);
            ctx.arc(44, 0, 18, 0, Math.PI * 2);
            ctx.arc(22, 6, 20, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }

        // Distant Rolling Earth Hills
        ctx.save();
        ctx.fillStyle = isDark ? 'rgba(16, 46, 36, 0.55)' : 'rgba(74, 222, 128, 0.32)';
        ctx.beginPath();
        ctx.moveTo(0, groundPy);
        ctx.quadraticCurveTo(viewW * 0.18, groundPy - 48, viewW * 0.38, groundPy - 18);
        ctx.quadraticCurveTo(viewW * 0.62, groundPy - 58, viewW * 0.84, groundPy - 20);
        ctx.quadraticCurveTo(viewW * 0.94, groundPy - 36, viewW, groundPy - 18);
        ctx.lineTo(viewW, groundPy);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Foreground Earth Scenery: Swaying Trees & Cozy House (positioned gently behind the playfield)
        if (groundPy > 110) {
          drawAnimatedTree(ctx, viewW * 0.22, groundPy, 0.95, breeze, isDark, 'oak');
          drawAnimatedTree(ctx, viewW * 0.31, groundPy, 0.78, breeze * 0.9, isDark, 'pine');
          drawAnimatedHouse(ctx, viewW * 0.52, groundPy, 0.9, now, isDark, reduced);
          drawAnimatedTree(ctx, viewW * 0.64, groundPy, 0.85, breeze * 1.1, isDark, 'oak');
          drawAnimatedTree(ctx, viewW * 0.86, groundPy, 1.0, breeze * 0.85, isDark, 'pine');
        }
      }
    };

    const pCount = (q: EffectsQuality) => (q === 'low' ? 16 : q === 'medium' ? 28 : 42);

    const renderGravityComparisonLanes = (
      ctx: CanvasRenderingContext2D,
      p: ProjectileCanvasSceneProps,
      now: number,
    ) => {
      const isDark = p.theme === 'dark';
      const lanes = p.gravityComparisonSet;
      const laneH = viewH / 3;

      let maxRange = 40;
      let maxHeight = 20;
      for (const item of lanes) {
        maxRange = Math.max(maxRange, item.trajectory.landingPoint.x);
        maxHeight = Math.max(maxHeight, item.trajectory.peakPoint.y);
      }
      maxRange *= 1.12;
      maxHeight *= 1.25;

      const padL = 56;
      const padR = 28;
      const plotW = Math.max(100, viewW - padL - padR);

      lanes.forEach((lane, idx) => {
        const topY = idx * laneH;
        const botY = (idx + 1) * laneH;
        const groundY = botY - 26;
        const usableH = Math.max(40, groundY - (topY + 26));

        const bgGrad = ctx.createLinearGradient(0, topY, 0, botY);
        if (idx === 0) {
          bgGrad.addColorStop(0, isDark ? '#030609' : '#dcfce7');
          bgGrad.addColorStop(1, isDark ? '#0a141d' : '#f0fdf4');
        } else if (idx === 1) {
          bgGrad.addColorStop(0, isDark ? '#05070a' : '#e0f2fe');
          bgGrad.addColorStop(1, isDark ? '#0f141b' : '#f8fafc');
        } else {
          bgGrad.addColorStop(0, isDark ? '#090703' : '#fef9c3');
          bgGrad.addColorStop(1, isDark ? '#181408' : '#fefce8');
        }
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, topY, viewW, laneH);

        ctx.fillStyle = isDark ? 'rgba(15, 23, 42, 0.7)' : 'rgba(148, 163, 184, 0.4)';
        ctx.fillRect(0, groundY, viewW, botY - groundY);
        ctx.strokeStyle = lane.color;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(0, groundY);
        ctx.lineTo(viewW, groundY);
        ctx.stroke();

        const toX = (wx: number) => padL + (wx / maxRange) * plotW;
        const toY = (wy: number) => groundY - (wy / maxHeight) * usableH;

        ctx.save();
        ctx.strokeStyle = `${lane.color}55`;
        ctx.setLineDash([6, 5]);
        ctx.lineDashOffset = -(now * 0.03);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        lane.trajectory.points.forEach((pt, i) => {
          const px = toX(pt.x);
          const py = toY(pt.y);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
        ctx.restore();

        const laneState = p.hasLaunched
          ? interpolateTrajectoryAtTime(lane.trajectory.points, p.currentState.t)
          : lane.trajectory.points[0];

        if (p.hasLaunched) {
          ctx.save();
          ctx.strokeStyle = lane.color;
          ctx.lineWidth = 2.8;
          ctx.shadowColor = lane.color;
          ctx.shadowBlur = 8;
          ctx.beginPath();
          for (let i = 0; i < lane.trajectory.points.length; i += 1) {
            const pt = lane.trajectory.points[i];
            if (pt.t > p.currentState.t) break;
            const px = toX(pt.x);
            const py = toY(pt.y);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.lineTo(toX(laneState.x), toY(laneState.y));
          ctx.stroke();
          ctx.restore();
        }

        const px = toX(laneState.x);
        const py = toY(laneState.y);
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = lane.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(px, py, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.font = '700 12px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = lane.color;
        ctx.textAlign = 'left';
        ctx.fillText(lane.label, 14, topY + 20);
        ctx.font = '600 11px "JetBrains Mono", monospace';
        ctx.fillStyle = isDark ? '#e2e8f0' : '#1e293b';
        ctx.fillText(
          `Range: ${lane.trajectory.landingPoint.x.toFixed(1)}m   Max H: ${lane.trajectory.peakPoint.y.toFixed(1)}m   Flight T: ${lane.trajectory.landingPoint.t.toFixed(2)}s`,
          210,
          topY + 20,
        );
        ctx.restore();
      });
    };

    const renderFrame = (now: number) => {
      const p = propsRef.current;
      const rawDt = Math.min(0.05, Math.max(0.001, (now - prevNow) / 1000));
      prevNow = now;
      const animDt = p.hasLaunched && !p.isPlaying && !p.hasLanded ? 0 : rawDt;
      const isDark = p.theme === 'dark';
      const reduced = reducedMotionRef.current || p.effectsQuality === 'low';

      if (!reduced) {
        cloudOffsetRef.current = (cloudOffsetRef.current + animDt * 14) % (viewW + 400);
        windOffsetRef.current = (windOffsetRef.current + animDt * (35 + p.windSpeed * 2.2)) % viewW;
      }

      if (p.hasLaunched && p.isPlaying) {
        const spd = Math.hypot(p.currentState.vx, p.currentState.vy);
        spinAngleRef.current += animDt * Math.max(4, Math.min(26, spd * 0.25));
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, viewW, viewH);

      if (p.gravityCompareMode && p.gravityComparisonSet.length === 3) {
        renderGravityComparisonLanes(ctx, p, now);
        rafId = requestAnimationFrame(renderFrame);
        return;
      }

      let shakeX = 0;
      let shakeY = 0;
      if (shakeRef.current > 0.1 && !reduced) {
        shakeX = (Math.random() - 0.5) * shakeRef.current * 2;
        shakeY = (Math.random() - 0.5) * shakeRef.current * 2;
        shakeRef.current *= Math.exp(-9 * rawDt);
      } else {
        shakeRef.current = 0;
      }

      ctx.save();
      ctx.translate(shakeX, shakeY);

      // 1. Dynamic Camera Bounds
      let fullMaxX = Math.max(
        40,
        p.trajectory.landingPoint.x,
        p.dragEnabled || p.compareDragGap ? p.analytical.horizontalRange : 0,
        p.challengeMode && p.challengeTargetX ? p.challengeTargetX + 20 : 0,
      );
      let fullMaxY = Math.max(
        22,
        p.launchHeight + 12,
        p.trajectory.peakPoint.y,
        p.dragEnabled || p.compareDragGap ? p.analytical.maxHeight : 0,
      );

      if (p.angleCompareMode) {
        for (const item of p.angleComparisonSet) {
          fullMaxX = Math.max(fullMaxX, item.trajectory.landingPoint.x);
          fullMaxY = Math.max(fullMaxY, item.trajectory.peakPoint.y);
        }
      }

      if (p.showGhostTrails) {
        for (const ghost of p.ghostTrails) {
          fullMaxX = Math.max(fullMaxX, ghost.range);
          fullMaxY = Math.max(fullMaxY, ghost.maxHeight);
        }
      }

      let targetWorldMaxX = fullMaxX;
      let targetWorldMaxY = fullMaxY;
      if (p.hasLaunched && p.isPlaying && !p.hasLanded && !p.angleCompareMode && !p.challengeMode) {
        const progress = Math.min(1, p.currentState.t / Math.max(0.1, p.trajectory.landingPoint.t));
        const followWeight = Math.sin(progress * Math.PI) * 0.28;
        const liveX = Math.max(fullMaxX * 0.52, p.currentState.x * 1.45 + 20);
        const liveY = Math.max(fullMaxY * 0.55, p.currentState.y * 1.45 + 15);
        targetWorldMaxX = fullMaxX * (1 - followWeight) + liveX * followWeight;
        targetWorldMaxY = fullMaxY * (1 - followWeight) + liveY * followWeight;
      }

      const targetSpanX = targetWorldMaxX * 1.18 + 12;
      const targetSpanY = targetWorldMaxY * 1.32 + 8;

      const padLeft = 58;
      const padRight = 32;
      const padTop = 44;
      const padBottom = 56;
      const plotW = Math.max(100, viewW - padLeft - padRight);
      const plotH = Math.max(100, viewH - padTop - padBottom);

      const scaleX = plotW / targetSpanX;
      const scaleY = plotH / targetSpanY;
      const targetScale = Math.min(scaleX, scaleY);

      const desiredMinX = -Math.max(6, targetSpanX * 0.06);
      const desiredMaxX = desiredMinX + plotW / targetScale;
      const desiredMinY = 0;
      const desiredMaxY = plotH / targetScale;

      if (p.autoCamera) {
        const lerp = 1 - Math.exp(-7.5 * rawDt);
        camRef.current.minX += (desiredMinX - camRef.current.minX) * lerp;
        camRef.current.maxX += (desiredMaxX - camRef.current.maxX) * lerp;
        camRef.current.minY += (desiredMinY - camRef.current.minY) * lerp;
        camRef.current.maxY += (desiredMaxY - camRef.current.maxY) * lerp;
      }

      const cam = camRef.current;
      const spanX = Math.max(1, cam.maxX - cam.minX);
      const spanY = Math.max(1, cam.maxY - cam.minY);
      const pxPerMeterX = plotW / spanX;
      const pxPerMeterY = plotH / spanY;

      const toPxX = (wx: number) => padLeft + (wx - cam.minX) * pxPerMeterX;
      const toPxY = (wy: number) => viewH - padBottom - (wy - cam.minY) * pxPerMeterY;
      const groundPy = toPxY(0);

      // 2. Realistic Animated Planet / Environment Background
      drawEnvironmentBackground(
        ctx,
        p.environmentPlanet,
        groundPy,
        now,
        isDark,
        reduced,
        p.windSpeed,
      );

      // 3. Subtle Wind Stream Lines when Drag is ON
      if (p.dragEnabled && !reduced) {
        ctx.save();
        const windDir = p.windSpeed >= 0 ? -1 : 1;
        const streamColor = isDark ? 'rgba(56, 189, 248, 0.2)' : 'rgba(2, 132, 199, 0.22)';
        ctx.strokeStyle = streamColor;
        ctx.fillStyle = streamColor;
        ctx.lineWidth = 1.3;

        for (let wIdx = 0; wIdx < 8; wIdx += 1) {
          const wy = 56 + ((wIdx * 43) % Math.max(60, groundPy - 80));
          const rawWx =
            (wIdx * 137 + windOffsetRef.current * (p.windSpeed !== 0 ? Math.sign(p.windSpeed) : -1)) %
            viewW;
          const wx = rawWx < 0 ? rawWx + viewW : rawWx;
          ctx.beginPath();
          ctx.moveTo(wx, wy);
          ctx.lineTo(wx + 24 * windDir, wy);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 4. Clean Coordinate Grid
      const niceSteps = [
        10, 20, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 500000,
      ];
      const minLabelPx = 72;
      let gridStep = 10;
      for (const st of niceSteps) {
        if (st * pxPerMeterX >= minLabelPx) {
          gridStep = st;
          break;
        }
      }
      const showFine10m = 10 * pxPerMeterX >= 8;

      ctx.save();
      ctx.strokeStyle =
        p.environmentPlanet === 'jupiter'
          ? 'rgba(253, 224, 71, 0.08)'
          : p.environmentPlanet === 'mars'
            ? 'rgba(251, 146, 60, 0.09)'
            : isDark
              ? 'rgba(56, 189, 248, 0.08)'
              : 'rgba(15, 23, 42, 0.07)';
      ctx.lineWidth = 1;

      const startGridX = Math.max(0, Math.floor(cam.minX / gridStep) * gridStep);
      for (let gx = startGridX; gx <= cam.maxX; gx += gridStep) {
        const px = toPxX(gx);
        ctx.beginPath();
        ctx.moveTo(px, padTop * 0.3);
        ctx.lineTo(px, groundPy);
        ctx.stroke();
      }

      for (let gy = gridStep; gy <= cam.maxY; gy += gridStep) {
        const py = toPxY(gy);
        if (py < 12) break;
        ctx.beginPath();
        ctx.moveTo(padLeft * 0.5, py);
        ctx.lineTo(viewW, py);
        ctx.stroke();
      }
      ctx.restore();

      // 5. Planet-Themed Ground Slab + Metric Markers
      const groundGrad = ctx.createLinearGradient(0, groundPy, 0, viewH);
      if (p.environmentPlanet === 'jupiter') {
        if (isDark) {
          groundGrad.addColorStop(0, '#451a03');
          groundGrad.addColorStop(1, '#1c0a02');
        } else {
          groundGrad.addColorStop(0, '#d97706');
          groundGrad.addColorStop(1, '#92400e');
        }
      } else if (p.environmentPlanet === 'mars') {
        if (isDark) {
          groundGrad.addColorStop(0, '#431407');
          groundGrad.addColorStop(1, '#1c0803');
        } else {
          groundGrad.addColorStop(0, '#ea580c');
          groundGrad.addColorStop(1, '#9a3412');
        }
      } else if (p.environmentPlanet === 'moon') {
        groundGrad.addColorStop(0, isDark ? '#1e293b' : '#94a3b8');
        groundGrad.addColorStop(1, isDark ? '#090d14' : '#64748b');
      } else {
        if (isDark) {
          groundGrad.addColorStop(0, '#0a1f16');
          groundGrad.addColorStop(1, '#020604');
        } else {
          groundGrad.addColorStop(0, '#86efac');
          groundGrad.addColorStop(1, '#22c55e');
        }
      }
      ctx.fillStyle = groundGrad;
      ctx.fillRect(0, groundPy, viewW, viewH - groundPy);

      const groundBorderColor =
        p.environmentPlanet === 'jupiter'
          ? '#fbbf24'
          : p.environmentPlanet === 'mars'
            ? '#fb923c'
            : p.environmentPlanet === 'moon'
              ? '#cbd5e1'
              : isDark
                ? '#22c55e'
                : '#15803d';
      ctx.strokeStyle = groundBorderColor;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(0, groundPy);
      ctx.lineTo(viewW, groundPy);
      ctx.stroke();

      if (showFine10m) {
        ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(15, 23, 42, 0.2)';
        ctx.lineWidth = 1;
        for (let gx = 0; gx <= cam.maxX; gx += 10) {
          const px = toPxX(gx);
          ctx.beginPath();
          ctx.moveTo(px, groundPy);
          ctx.lineTo(px, groundPy + 5);
          ctx.stroke();
        }
      }

      ctx.fillStyle =
        p.environmentPlanet === 'jupiter' || p.environmentPlanet === 'mars' || p.environmentPlanet === 'moon'
          ? '#f8fafc'
          : isDark
            ? '#cbd5e1'
            : '#064e3b';
      ctx.font = '600 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      for (let gx = startGridX; gx <= cam.maxX; gx += gridStep) {
        const px = toPxX(gx);
        ctx.strokeStyle = groundBorderColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(px, groundPy);
        ctx.lineTo(px, groundPy + 9);
        ctx.stroke();
        ctx.fillText(formatAxisMeters(gx), px, groundPy + 24);
      }

      ctx.fillStyle =
        p.environmentPlanet === 'moon' || isDark
          ? '#cbd5e1'
          : p.environmentPlanet === 'jupiter' || p.environmentPlanet === 'mars'
            ? '#451a03'
            : '#0f172a';
      ctx.textAlign = 'right';
      for (let gy = 0; gy <= cam.maxY; gy += gridStep) {
        const py = toPxY(gy);
        if (py < 24 || py > groundPy - 8) continue;
        ctx.fillText(formatAxisMeters(gy), padLeft - 8, py + 4);
      }

      // 6. Ghost Trails (last 5 launches)
      if (p.showGhostTrails) {
        for (const ghost of p.ghostTrails) {
          if (ghost.points.length < 2) continue;
          ctx.save();
          ctx.strokeStyle = ghost.color;
          ctx.globalAlpha = 0.38;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ghost.points.forEach((pt, idx) => {
            const px = toPxX(pt.x);
            const py = toPxY(pt.y);
            if (idx === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });
          ctx.stroke();
          ctx.restore();
        }
      }

      // 7. Drag vs Ideal Gap Comparison
      if (
        (p.dragEnabled || p.compareDragGap) &&
        p.analytical.samplePoints.length > 1 &&
        p.trajectory.points.length > 1
      ) {
        ctx.save();
        const gapGrad = ctx.createLinearGradient(
          toPxX(0),
          toPxY(p.analytical.maxHeight),
          toPxX(p.analytical.horizontalRange),
          groundPy,
        );
        const pulseAlpha = 0.1 + 0.05 * Math.sin(now * 0.004);
        gapGrad.addColorStop(0, `rgba(250, 204, 21, ${pulseAlpha.toFixed(3)})`);
        gapGrad.addColorStop(1, `rgba(34, 197, 94, ${(pulseAlpha * 0.85).toFixed(3)})`);

        ctx.fillStyle = gapGrad;
        ctx.beginPath();
        p.analytical.samplePoints.forEach((pt, idx) => {
          const px = toPxX(pt.x);
          const py = toPxY(pt.y);
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        for (let i = p.trajectory.points.length - 1; i >= 0; i -= 1) {
          const pt = p.trajectory.points[i];
          ctx.lineTo(toPxX(pt.x), toPxY(pt.y));
        }
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = isDark ? 'rgba(250, 204, 21, 0.65)' : 'rgba(217, 119, 6, 0.72)';
        ctx.setLineDash([5, 5]);
        ctx.lineDashOffset = -(now * 0.025);
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        p.analytical.samplePoints.forEach((pt, idx) => {
          const px = toPxX(pt.x);
          const py = toPxY(pt.y);
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
        ctx.restore();
      }

      // 8. Angle Comparison Mode
      if (p.angleCompareMode && p.angleComparisonSet.length > 0) {
        for (const item of p.angleComparisonSet) {
          const pts = item.trajectory.points;
          if (pts.length < 2) continue;
          ctx.save();
          ctx.strokeStyle = item.color;
          ctx.globalAlpha = 0.35;
          ctx.setLineDash([5, 5]);
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          pts.forEach((pt, i) => {
            const px = toPxX(pt.x);
            const py = toPxY(pt.y);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });
          ctx.stroke();

          const subState = p.hasLaunched
            ? interpolateTrajectoryAtTime(pts, p.currentState.t)
            : pts[0];
          if (p.hasLaunched) {
            ctx.globalAlpha = 0.85;
            ctx.setLineDash([]);
            ctx.lineWidth = 2.4;
            ctx.beginPath();
            for (let i = 0; i < pts.length; i += 1) {
              if (pts[i].t > p.currentState.t) break;
              const px = toPxX(pts[i].x);
              const py = toPxY(pts[i].y);
              if (i === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }
            ctx.lineTo(toPxX(subState.x), toPxY(subState.y));
            ctx.stroke();
          }

          const spx = toPxX(subState.x);
          const spy = toPxY(subState.y);
          ctx.globalAlpha = 1;
          ctx.fillStyle = item.color;
          ctx.beginPath();
          ctx.arc(spx, spy, 4.5, 0, Math.PI * 2);
          ctx.fill();

          const landPx = toPxX(item.trajectory.landingPoint.x);
          ctx.font = '600 10px "Plus Jakarta Sans", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(
            `${item.angleDeg}° (${item.trajectory.landingPoint.x.toFixed(0)}m)`,
            landPx,
            groundPy - 8,
          );
          ctx.restore();
        }
      }

      // 9. Predicted Trajectory with Marching Dashes
      if (p.showPredictedPath && p.trajectory.points.length > 1) {
        ctx.save();
        ctx.strokeStyle = p.hasLaunched
          ? isDark
            ? 'rgba(56, 189, 248, 0.25)'
            : 'rgba(2, 132, 199, 0.25)'
          : isDark
            ? 'rgba(56, 189, 248, 0.82)'
            : 'rgba(2, 132, 199, 0.82)';
        ctx.setLineDash([8, 6]);
        ctx.lineDashOffset = reduced ? 0 : -(now * 0.04);
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        p.trajectory.points.forEach((pt, idx) => {
          const px = toPxX(pt.x);
          const py = toPxY(pt.y);
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
        ctx.restore();
      }

      // 9b. Destination Flag & Landing Zone Pad (always marks predicted or reached destination cleanly)
      if (!p.challengeMode && p.trajectory.landingPoint.x > 0.5) {
        const destPx = toPxX(p.trajectory.landingPoint.x);
        const flagWave = reduced ? 0 : Math.sin(now * 0.008) * 2.5;
        ctx.save();
        ctx.fillStyle = p.hasLanded ? 'rgba(34, 197, 94, 0.35)' : 'rgba(56, 189, 248, 0.22)';
        ctx.beginPath();
        ctx.ellipse(destPx, groundPy, 13, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Pole
        ctx.strokeStyle = isDark ? '#e2e8f0' : '#0f172a';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(destPx, groundPy);
        ctx.lineTo(destPx, groundPy - 26);
        ctx.stroke();

        // Flag pennant
        ctx.fillStyle = p.hasLanded ? '#22c55e' : '#facc15';
        ctx.beginPath();
        ctx.moveTo(destPx, groundPy - 26);
        ctx.lineTo(destPx + 15, groundPy - 21 + flagWave);
        ctx.lineTo(destPx, groundPy - 15);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // 10. Animated Height & Range Measurement Rulers
      if (p.showRulers && p.trajectory.landingPoint.x > 0.5) {
        const revealProgress = p.hasLaunched
          ? Math.min(1, p.currentState.t / Math.max(0.05, p.trajectory.landingPoint.t))
          : 1;
        const pkX = toPxX(p.trajectory.peakPoint.x);
        const pkY = toPxY(p.trajectory.peakPoint.y);
        const endRx = toPxX(p.trajectory.landingPoint.x * revealProgress);

        ctx.save();
        ctx.strokeStyle = isDark ? 'rgba(52, 211, 153, 0.65)' : 'rgba(5, 150, 105, 0.72)';
        ctx.fillStyle = isDark ? '#6ee7b7' : '#065f46';
        ctx.lineWidth = 1.4;
        ctx.setLineDash([3, 3]);

        ctx.beginPath();
        ctx.moveTo(pkX, groundPy);
        ctx.lineTo(pkX, pkY);
        ctx.stroke();

        ctx.setLineDash([]);
        for (let frac = 0.25; frac <= 0.75; frac += 0.25) {
          const ty = groundPy - (groundPy - pkY) * frac;
          ctx.beginPath();
          ctx.moveTo(pkX - 4, ty);
          ctx.lineTo(pkX + 4, ty);
          ctx.stroke();
        }
        ctx.font = '600 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`H = ${p.trajectory.peakPoint.y.toFixed(1)}m`, pkX + 7, (groundPy + pkY) / 2);

        const rulerY = groundPy + 38;
        if (rulerY < viewH - 6) {
          ctx.beginPath();
          ctx.moveTo(toPxX(0), rulerY);
          ctx.lineTo(endRx, rulerY);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(toPxX(0), rulerY - 4);
          ctx.lineTo(toPxX(0), rulerY + 4);
          ctx.moveTo(endRx, rulerY - 4);
          ctx.lineTo(endRx, rulerY + 4);
          ctx.stroke();
          ctx.textAlign = 'center';
          ctx.fillText(
            `R = ${(p.trajectory.landingPoint.x * revealProgress).toFixed(1)}m`,
            (toPxX(0) + endRx) / 2,
            rulerY - 5,
          );
        }
        ctx.restore();
      }

      // 11. Challenge Target Bullseye
      if (p.challengeMode && p.challengeTargetX !== null) {
        const tx = toPxX(p.challengeTargetX);
        const pulseScale = 1 + 0.12 * Math.sin(now * 0.006);
        const radiusPx = Math.max(14, Math.min(34, p.challengeTargetRadius * pxPerMeterX));
        ctx.save();
        ctx.fillStyle = 'rgba(34, 197, 94, 0.25)';
        ctx.beginPath();
        ctx.ellipse(tx, groundPy, radiusPx * 1.25 * pulseScale, 8 * pulseScale, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.ellipse(tx, groundPy, radiusPx * 0.82, 5.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.ellipse(tx, groundPy, radiusPx * 0.45, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.ellipse(tx, groundPy, radiusPx * 0.2, 1.8, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = isDark ? '#facc15' : '#15803d';
        ctx.font = '700 11px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`TARGET ${p.challengeTargetX.toFixed(1)}m`, tx, groundPy - 14);
        ctx.restore();
      }

      // 12. Progressive Traversed 2D Path
      const maxSpeedRef = Math.max(
        10,
        p.initialVelocity,
        Math.hypot(p.trajectory.landingPoint.vx, p.trajectory.landingPoint.vy),
      );

      if (p.hasLaunched && p.trajectory.points.length > 1) {
        const activePoints: PhysicsState[] = [];
        for (const pt of p.trajectory.points) {
          if (pt.t <= p.currentState.t) activePoints.push(pt);
          else break;
        }
        activePoints.push(p.currentState);

        if (activePoints.length > 1) {
          ctx.save();
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          for (let i = 1; i < activePoints.length; i += 1) {
            const p0 = activePoints[i - 1];
            const p1 = activePoints[i];
            const segSpd = Math.hypot(p1.vx, p1.vy);
            const normSpd = Math.min(1, segSpd / maxSpeedRef);
            const ageRatio = Math.max(
              0.3,
              1 - (p.currentState.t - p1.t) / Math.max(0.5, p.trajectory.landingPoint.t * 0.65),
            );
            ctx.strokeStyle = speedToColor(normSpd);
            ctx.globalAlpha = 0.38 + 0.62 * ageRatio;
            ctx.lineWidth = 1.8 + 2.8 * ageRatio;
            ctx.beginPath();
            ctx.moveTo(toPxX(p0.x), toPxY(p0.y));
            ctx.lineTo(toPxX(p1.x), toPxY(p1.y));
            ctx.stroke();
          }
          ctx.restore();
        }
      }

      // 13. Stroboscopic Multi-Flash Mode
      if (p.showStroboscopic && p.trajectory.points.length > 2) {
        const totalT = Math.max(0.1, p.trajectory.landingPoint.t);
        const flashCount = 10;
        const dtStrobe = totalT / flashCount;
        const maxTimeShown = p.hasLaunched ? p.currentState.t : totalT;

        ctx.save();
        for (let k = 1; k < flashCount; k += 1) {
          const tk = k * dtStrobe;
          if (tk > maxTimeShown) break;
          const st = interpolateTrajectoryAtTime(p.trajectory.points, tk);
          const sx = toPxX(st.x);
          const sy = toPxY(st.y);

          ctx.fillStyle = isDark ? 'rgba(56, 189, 248, 0.25)' : 'rgba(2, 132, 199, 0.25)';
          ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.65)' : 'rgba(15, 23, 42, 0.55)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(sx, sy, 4.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          if (k % 2 === 0) {
            ctx.fillStyle = isDark ? '#bae6fd' : '#0369a1';
            ctx.font = '500 9px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`${tk.toFixed(1)}s`, sx, sy - 9);
          }
        }
        ctx.restore();
      }

      // 14. Launch Vector Angle Triangle
      if (p.showVelocityVectors && p.initialVelocity > 0) {
        const origX = toPxX(0);
        const origY = toPxY(p.launchHeight);
        const rad = (p.angleDeg * Math.PI) / 180;
        const triLen = 54;
        const tx = origX + Math.cos(rad) * triLen;
        const ty = origY - Math.sin(rad) * triLen;

        ctx.save();
        ctx.fillStyle = isDark ? 'rgba(56, 189, 248, 0.1)' : 'rgba(2, 132, 199, 0.1)';
        ctx.beginPath();
        ctx.moveTo(origX, origY);
        ctx.lineTo(tx, origY);
        ctx.lineTo(tx, ty);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
        ctx.setLineDash([2, 2]);
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(origX, origY);
        ctx.lineTo(tx, origY);
        ctx.lineTo(tx, ty);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.strokeStyle = '#facc15';
        ctx.beginPath();
        ctx.arc(origX, origY, 20, -rad, 0);
        ctx.stroke();
        ctx.fillStyle = isDark ? '#fde047' : '#b45309';
        ctx.font = '600 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`${p.angleDeg.toFixed(0)}°`, origX + 23, origY - 4);
        ctx.restore();
      }

      // 15. Peak Height Marker (suppressed while apex popup card handles the apex callout)
      const peakReached = p.hasLaunched && p.currentState.t >= p.trajectory.peakPoint.t;
      if (peakReached && p.trajectory.peakPoint.y > 0.1) {
        const pkX = toPxX(p.trajectory.peakPoint.x);
        const pkY = toPxY(p.trajectory.peakPoint.y);
        const pulseR = 6 + 4 * Math.abs(Math.sin(now * 0.005));

        ctx.save();
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.7)';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(pkX, pkY, pulseR, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#facc15';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pkX, pkY, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        if (!p.isPausedAtApex) {
          const labelText = `Max height: ${p.trajectory.peakPoint.y.toFixed(1)} m`;
          ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
          const tw = ctx.measureText(labelText).width;
          ctx.fillStyle = isDark ? 'rgba(5, 7, 10, 0.92)' : 'rgba(255, 255, 255, 0.94)';
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(pkX - tw / 2 - 8, pkY - 32, tw + 16, 20, 6);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = isDark ? '#7dd3fc' : '#0369a1';
          ctx.textAlign = 'center';
          ctx.fillText(labelText, pkX, pkY - 18);
        }
        ctx.restore();
      }

      // 16. Impact Footprint Rings & Destination Landing Badge
      if (impactRingsRef.current.length > 0) {
        const aliveRings: ImpactRing[] = [];
        for (const ring of impactRingsRef.current) {
          const age = (now - ring.bornAt) / 1000;
          if (age < 2.2) {
            const rx = toPxX(ring.x);
            const alpha = Math.max(0, 1 - age / 2.2);
            const radX = 8 + age * 28;
            ctx.save();
            ctx.strokeStyle = `rgba(34, 197, 94, ${alpha.toFixed(2)})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(rx, groundPy, radX, Math.max(2, radX * 0.24), 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
            aliveRings.push(ring);
          }
        }
        impactRingsRef.current = aliveRings;
      }

      if (p.hasLaunched && p.hasLanded) {
        const lx = toPxX(p.trajectory.landingPoint.x);
        const sinceLand = Math.max(0, (now - bounceStartRef.current) / 1000);
        const springScale =
          sinceLand < 0.6
            ? 1 + 0.28 * Math.cos(sinceLand * 18) * Math.exp(-sinceLand * 6)
            : 1;

        ctx.save();
        ctx.fillStyle = isDark ? 'rgba(34, 197, 94, 0.25)' : 'rgba(22, 163, 74, 0.22)';
        ctx.beginPath();
        ctx.ellipse(lx, groundPy + 1, 14, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#22c55e';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(lx, groundPy, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        const landText = `Destination: ${p.trajectory.landingPoint.x.toFixed(1)} m`;
        ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
        const tw = ctx.measureText(landText).width;
        const boxCenterX = Math.min(viewW - tw / 2 - 16, Math.max(tw / 2 + 16, lx));
        ctx.translate(boxCenterX, groundPy - 34);
        ctx.scale(springScale, springScale);
        ctx.fillStyle = isDark ? 'rgba(5, 7, 10, 0.92)' : 'rgba(255, 255, 255, 0.95)';
        ctx.strokeStyle = 'rgba(34, 197, 94, 0.8)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(-tw / 2 - 8, -10, tw + 16, 20, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = isDark ? '#4ade80' : '#15803d';
        ctx.textAlign = 'center';
        ctx.fillText(landText, 0, 4);
        ctx.restore();
      }

      // 17. Launch Platform / 2D Person Thrower (Ball) / Rocket Launch Pad
      const originPxX = toPxX(0);
      const originPxY = toPxY(p.launchHeight);
      if (p.launchHeight > 0.2) {
        ctx.save();
        ctx.fillStyle = isDark ? '#0f172a' : '#cbd5e1';
        ctx.strokeStyle = isDark ? '#38bdf8' : '#475569';
        ctx.lineWidth = 1.5;
        ctx.fillRect(originPxX - 24, originPxY, 34, groundPy - originPxY);
        ctx.strokeRect(originPxX - 24, originPxY, 34, groundPy - originPxY);
        ctx.restore();
      }

      const sinceLaunch = (now - launchTimeRef.current) / 1000;
      const rad = (p.angleDeg * Math.PI) / 180;

      if (p.projectileType === 'ball') {
        // Draw 2D Athlete Thrower standing with feet at originPxY (or on platform if y0 > 0)
        // Release hand aligns right with (originPxX, originPxY)
        const feetY = p.launchHeight > 0.2 ? originPxY : groundPy;
        const hipX = originPxX - 15;
        const hipY = feetY - 22;
        const shoulderX = hipX + (p.hasLaunched && sinceLaunch < 0.5 ? 4 : -1);
        const shoulderY = hipY - 19;

        // Idle windup vs vigorous follow-through swing on throw
        const throwProgress = p.hasLaunched ? Math.min(1, Math.max(0, sinceLaunch / 0.34)) : 0;
        const idleBreath = !p.hasLaunched && !reduced ? Math.sin(now * 0.004) * 0.06 : 0;
        const releaseArmAngle = -rad;
        const followThroughAngle = -rad + 0.55;
        const armAngle = !p.hasLaunched
          ? releaseArmAngle - 0.85 + idleBreath
          : releaseArmAngle * (1 - throwProgress) + followThroughAngle * throwProgress;

        ctx.save();
        // Back leg + Front leg in athletic throwing stance
        ctx.strokeStyle = isDark ? '#38bdf8' : '#0f172a';
        ctx.lineCap = 'round';
        ctx.lineWidth = 4.5;
        ctx.beginPath();
        ctx.moveTo(hipX, hipY);
        ctx.lineTo(hipX - 9, feetY - 9);
        ctx.lineTo(hipX - 12, feetY);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(hipX, hipY);
        ctx.lineTo(hipX + 8, feetY - 10);
        ctx.lineTo(hipX + 12, feetY);
        ctx.stroke();

        // Shoes
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.ellipse(hipX - 10, feetY - 1, 5, 2.5, 0, 0, Math.PI * 2);
        ctx.ellipse(hipX + 14, feetY - 1, 5, 2.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Torso jersey (Sky Blue + Green stripe)
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 9;
        ctx.beginPath();
        ctx.moveTo(hipX, hipY);
        ctx.lineTo(shoulderX, shoulderY);
        ctx.stroke();

        // Non-throwing balance arm
        ctx.strokeStyle = isDark ? '#fde047' : '#eab308';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(shoulderX, shoulderY + 2);
        ctx.lineTo(shoulderX - 10, shoulderY + 11);
        ctx.stroke();

        // Head + Cap facing forward toward target
        const headX = shoulderX + 1;
        const headY = shoulderY - 9;
        ctx.fillStyle = '#fde68a';
        ctx.strokeStyle = isDark ? '#0f172a' : '#78350f';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(headX, headY, 6.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Sport cap
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(headX, headY - 1.5, 6.5, Math.PI, 0);
        ctx.fill();
        ctx.fillRect(headX, headY - 3, 9.5, 2.4);

        // Throwing Arm & Hand
        const handX = p.hasLaunched
          ? shoulderX + Math.cos(armAngle) * 18
          : originPxX;
        const handY = p.hasLaunched
          ? shoulderY + Math.sin(armAngle) * 18
          : originPxY;
        const elbowX = (shoulderX + handX) * 0.5 - 3;
        const elbowY = (shoulderY + handY) * 0.5 - 3;

        ctx.strokeStyle = isDark ? '#facc15' : '#ca8a04';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(shoulderX, shoulderY);
        ctx.lineTo(elbowX, elbowY);
        ctx.lineTo(handX, handY);
        ctx.stroke();

        ctx.fillStyle = '#fde68a';
        ctx.beginPath();
        ctx.arc(handX, handY, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        // Minimal Rocket Launch Pad (no cannon barrel or wheel)
        const padBaseY = p.launchHeight > 0.2 ? originPxY : groundPy;
        ctx.save();
        ctx.translate(originPxX, padBaseY);

        // Support blast deflector plate
        const padGrad = ctx.createLinearGradient(-16, -4, 16, 4);
        padGrad.addColorStop(0, isDark ? '#0f172a' : '#64748b');
        padGrad.addColorStop(0.5, isDark ? '#1e293b' : '#94a3b8');
        padGrad.addColorStop(1, isDark ? '#0f172a' : '#475569');
        ctx.fillStyle = padGrad;
        ctx.strokeStyle = isDark ? '#38bdf8' : '#0284c7';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.roundRect(-16, -4, 32, 6, 2);
        ctx.fill();
        ctx.stroke();

        // Low-profile side guide clamps
        ctx.strokeStyle = isDark ? '#94a3b8' : '#334155';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-10, -4);
        ctx.lineTo(-7, -13);
        ctx.moveTo(10, -4);
        ctx.lineTo(7, -13);
        ctx.stroke();

        // Pad status LED
        ctx.fillStyle = p.hasLaunched ? '#22c55e' : '#38bdf8';
        ctx.beginPath();
        ctx.arc(0, -1, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 17b. Continuous Rocket Exhaust Smoke (world-space)
      const instSpeed = Math.hypot(p.currentState.vx, p.currentState.vy);
      if (
        p.projectileType === 'rocket' &&
        p.hasLaunched &&
        p.isPlaying &&
        !p.hasLanded &&
        !reduced
      ) {
        const emitIntervalMs = p.effectsQuality === 'high' ? 22 : 36;
        if (now - lastRocketSmokeEmitRef.current >= emitIntervalMs) {
          lastRocketSmokeEmitRef.current = now;
          const worldVelAngle =
            instSpeed > 0.2 ? Math.atan2(p.currentState.vy, p.currentState.vx) : rad;
          const nozzleWorldX =
            p.currentState.x - (Math.cos(worldVelAngle) * 15) / Math.max(0.01, pxPerMeterX);
          const nozzleWorldY = Math.max(
            0.05,
            p.currentState.y - (Math.sin(worldVelAngle) * 15) / Math.max(0.01, pxPerMeterY),
          );
          const smokeScale = Math.max(1.2, spanX * 0.02);
          const puffsPerEmit = p.effectsQuality === 'high' ? 2 : 1;
          const pool = smokePoolRef.current;
          let emitted = 0;

          for (let i = 0; i < pool.length && emitted < puffsPerEmit; i += 1) {
            if (!pool[i].active) {
              const jitterAngle = worldVelAngle + Math.PI + (Math.random() - 0.5) * 0.75;
              const driftSpeed = (0.7 + Math.random() * 0.85) * smokeScale;
              pool[i].active = true;
              pool[i].x = nozzleWorldX;
              pool[i].y = nozzleWorldY;
              pool[i].vx = Math.cos(jitterAngle) * driftSpeed + (p.windSpeed || 0) * 0.12;
              pool[i].vy = Math.sin(jitterAngle) * driftSpeed + 0.18 * smokeScale;
              pool[i].life = 0;
              pool[i].maxLife = 0.75 + Math.random() * 0.55;
              pool[i].size = (p.currentState.vy >= 0 ? 5.5 : 4.2) + Math.random() * 4.5;
              emitted += 1;
            }
          }
        }
      }

      for (const sm of smokePoolRef.current) {
        if (!sm.active) continue;
        sm.life += animDt;
        if (sm.life >= sm.maxLife) {
          sm.active = false;
          continue;
        }
        sm.x += sm.vx * animDt;
        sm.y = Math.max(0.05, sm.y + sm.vy * animDt);
        sm.vx *= Math.exp(-2.2 * animDt);
        sm.vy *= Math.exp(-1.6 * animDt);

        const progress = sm.life / sm.maxLife;
        const alpha = (1 - progress) * 0.52;
        const smPxX = toPxX(sm.x);
        const smPxY = toPxY(sm.y);
        const radius = sm.size * (1 + progress * 1.9);

        const sGrad = ctx.createRadialGradient(smPxX, smPxY, radius * 0.15, smPxX, smPxY, radius);
        if (isDark) {
          sGrad.addColorStop(0, `rgba(241, 245, 249, ${alpha.toFixed(3)})`);
          sGrad.addColorStop(0.55, `rgba(148, 163, 184, ${(alpha * 0.75).toFixed(3)})`);
          sGrad.addColorStop(1, 'rgba(100, 116, 139, 0)');
        } else {
          sGrad.addColorStop(0, `rgba(255, 255, 255, ${(alpha * 1.15).toFixed(3)})`);
          sGrad.addColorStop(0.55, `rgba(148, 163, 184, ${(alpha * 0.8).toFixed(3)})`);
          sGrad.addColorStop(1, 'rgba(100, 116, 139, 0)');
        }
        ctx.fillStyle = sGrad;
        ctx.beginPath();
        ctx.arc(smPxX, smPxY, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // 18. Projectile in 2D View
      let bounceOffsetPx = 0;
      if (p.hasLanded && bounceStartRef.current > 0) {
        const elapsedBounce = (now - bounceStartRef.current) / 1000;
        if (elapsedBounce < 0.85) {
          bounceOffsetPx =
            Math.abs(Math.sin(elapsedBounce * Math.PI * 3.6)) *
            16 *
            Math.exp(-elapsedBounce * 4.2);
        }
      }

      const projPxX = toPxX(p.currentState.x);
      const projPxY = toPxY(p.currentState.y) - bounceOffsetPx;

      // Ground shadow under projectile
      const heightRatio = Math.max(0.22, 1 - p.currentState.y / Math.max(40, targetWorldMaxY));
      ctx.save();
      ctx.fillStyle = isDark ? 'rgba(2, 6, 23, 0.55)' : 'rgba(15, 23, 42, 0.22)';
      ctx.beginPath();
      ctx.ellipse(
        projPxX,
        groundPy + 2,
        11 * heightRatio + 3,
        3 * heightRatio + 1,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.restore();

      const normInstSpeed = Math.min(1, instSpeed / maxSpeedRef);
      const hotColor = speedToColor(normInstSpeed);
      const velAngle = Math.atan2(-p.currentState.vy, p.currentState.vx);

      ctx.save();
      ctx.translate(projPxX, projPxY);

      if (p.hasLaunched && !p.hasLanded && instSpeed > 0.5 && !reduced) {
        ctx.save();
        ctx.rotate(velAngle);
        const streakLen = Math.min(26, 8 + normInstSpeed * 18);
        const blurGrad = ctx.createLinearGradient(-streakLen, 0, 4, 0);
        blurGrad.addColorStop(0, 'rgba(56, 189, 248, 0)');
        blurGrad.addColorStop(1, hotColor);
        ctx.fillStyle = blurGrad;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.ellipse(-streakLen * 0.45, 0, streakLen * 0.65, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, 20);
      glow.addColorStop(0, '#ffffff');
      glow.addColorStop(0.35, hotColor);
      glow.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.fill();

      const orientationAngle = instSpeed > 0.2 ? velAngle : -rad;

      if (p.projectileType === 'rocket') {
        ctx.rotate(orientationAngle);
        if (p.hasLaunched && !p.hasLanded && !reduced) {
          const flicker = 10 + 7 * Math.abs(Math.sin(now * 0.04));
          ctx.fillStyle = '#facc15';
          ctx.beginPath();
          ctx.moveTo(-12, -3.5);
          ctx.lineTo(-12 - flicker, 0);
          ctx.lineTo(-12, 3.5);
          ctx.closePath();
          ctx.fill();
        }
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.moveTo(-11, -4);
        ctx.lineTo(-16, -9);
        ctx.lineTo(-6, -4);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-11, 4);
        ctx.lineTo(-16, 9);
        ctx.lineTo(-6, 4);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#f8fafc';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(-12, -4.5, 19, 9, 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.moveTo(7, -4.5);
        ctx.lineTo(17, 0);
        ctx.lineTo(7, 4.5);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Spinning Sports / Calibration Ball
        ctx.rotate(spinAngleRef.current);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = hotColor;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = isDark ? '#05070a' : '#0f172a';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(-5, 0);
        ctx.lineTo(5, 0);
        ctx.moveTo(0, -5);
        ctx.lineTo(0, 5);
        ctx.stroke();
      }
      ctx.restore();

      // 19. Velocity Vectors
      if (p.showVelocityVectors && (p.hasLaunched || !p.hasLanded)) {
        if (instSpeed > 0.05) {
          const maxArrowPx = 74;
          const refSpeed = Math.max(
            10,
            Math.hypot(
              p.trajectory.points[0]?.vx ?? 30,
              p.trajectory.points[0]?.vy ?? 30,
            ),
          );
          const arrowScale = maxArrowPx / refSpeed;
          const ax = Math.max(-95, Math.min(95, p.currentState.vx * arrowScale));
          const ay = Math.max(-95, Math.min(95, -p.currentState.vy * arrowScale));

          drawArrow(ctx, projPxX, projPxY, projPxX + ax, projPxY, '#38bdf8', 'vx');
          drawArrow(ctx, projPxX, projPxY, projPxX, projPxY + ay, '#22c55e', 'vy');
          drawArrow(
            ctx,
            projPxX,
            projPxY,
            projPxX + ax,
            projPxY + ay,
            isDark ? '#facc15' : '#ca8a04',
            'v',
          );
        }
      }

      // 20. Pooled Landing Dust Particles
      for (const d of dustPoolRef.current) {
        if (!d.active) continue;
        d.life += animDt;
        if (d.life >= d.maxLife) {
          d.active = false;
          continue;
        }
        d.x += d.vx * animDt;
        d.y = Math.max(0, d.y + d.vy * animDt);
        d.vy -= 9.81 * animDt * 0.55;
        const alpha = 1 - d.life / d.maxLife;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.arc(toPxX(d.x), toPxY(d.y), d.size * (0.7 + alpha * 0.5), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 21. Pooled Challenge Confetti
      for (const c of confettiPoolRef.current) {
        if (!c.active) continue;
        c.life += rawDt;
        if (c.life >= 2.8) {
          c.active = false;
          continue;
        }
        c.x += c.vx * rawDt;
        c.y += c.vy * rawDt;
        c.vy += 420 * rawDt;
        c.rot += c.vRot * rawDt;
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.rot);
        ctx.globalAlpha = Math.max(0, 1 - c.life / 2.8);
        ctx.fillStyle = c.color;
        ctx.fillRect(-c.size / 2, -c.size / 3, c.size, c.size * 0.65);
        ctx.restore();
      }

      ctx.restore();
      rafId = requestAnimationFrame(renderFrame);
    };

    rafId = requestAnimationFrame(renderFrame);
    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);

  const speed = Math.hypot(currentState.vx, currentState.vy);
  const subjectLabel = projectileType === 'rocket' ? 'Rocket' : 'Ball';

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[320px] sm:h-[440px] lg:h-[520px] rounded-2xl overflow-hidden border border-sky-500/30 dark:border-sky-400/25 shadow-md select-none"
    >
      <canvas
        ref={canvasRef}
        aria-label="Interactive projectile motion trajectory canvas"
        className="block w-full h-full"
      />

      {/* Minimal Single-Line Telemetry Strip (Top-Left, Unobstructive) */}
      {!gravityCompareMode && (
        <div className="pointer-events-none absolute top-2.5 left-2.5 flex items-center gap-2.5 px-3 py-1 rounded-xl bg-white/88 dark:bg-[#05070a]/88 backdrop-blur-md border border-sky-500/25 text-[11px] tabular-nums">
          <span>
            <span className="text-slate-500 dark:text-slate-400">t </span>
            <strong className="text-sky-600 dark:text-sky-400">{currentState.t.toFixed(2)}s</strong>
          </span>
          <span className="text-slate-300 dark:text-slate-700">·</span>
          <span>
            <span className="text-slate-500 dark:text-slate-400">x </span>
            <strong className="text-slate-900 dark:text-white">{currentState.x.toFixed(1)}m</strong>
          </span>
          <span className="text-slate-300 dark:text-slate-700">·</span>
          <span>
            <span className="text-slate-500 dark:text-slate-400">y </span>
            <strong className="text-slate-900 dark:text-white">{currentState.y.toFixed(1)}m</strong>
          </span>
          <span className="hidden sm:inline text-slate-300 dark:text-slate-700">·</span>
          <span className="hidden sm:inline">
            <span className="text-slate-500 dark:text-slate-400">v </span>
            <strong className="text-emerald-600 dark:text-yellow-400">{speed.toFixed(1)}m/s</strong>
          </span>
          {isNearApexSlowMo && !isPausedAtApex && (
            <span className="text-[10px] font-bold text-amber-600 dark:text-yellow-300">
              · APEX
            </span>
          )}
        </div>
      )}

      {/* Canvas Quick Object Selector: Ball / Rocket (Top-Right) */}
      {onChangeProjectileType && (
        <div
          role="group"
          aria-label="Select projectile object"
          className="absolute top-2.5 right-2.5 z-20 flex items-center gap-0.5 p-1 rounded-xl bg-white/90 dark:bg-[#05070a]/90 backdrop-blur-md border border-sky-500/30 shadow-sm"
        >
          {(
            [
              { id: 'ball', label: 'Ball' },
              { id: 'rocket', label: 'Rocket' },
            ] as const
          ).map((item) => {
            const active = projectileType === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onChangeProjectileType(item.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-gradient-to-r from-sky-500 to-emerald-500 text-slate-950'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-sky-500/10'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Highest Point Pause Pop-Up Banner */}
      {isPausedAtApex && (
        <div
          role="status"
          aria-live="polite"
          className="absolute top-14 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-white/96 dark:bg-[#05070a]/96 backdrop-blur-md border-2 border-yellow-400 shadow-[0_8px_28px_rgba(0,0,0,0.28)] max-w-[92%]"
        >
          <div className="min-w-0">
            <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-yellow-300 whitespace-nowrap">
              {subjectLabel} is at highest point
            </div>
            <div className="text-[11px] text-slate-600 dark:text-slate-300 tabular-nums truncate">
              Max Height: {trajectory.peakPoint.y.toFixed(2)} m · Continuing to destination...
            </div>
          </div>
          {onResumeFromApex && (
            <button
              type="button"
              onClick={onResumeFromApex}
              className="px-3 py-1.5 rounded-xl text-[11px] font-bold bg-gradient-to-r from-sky-500 to-emerald-500 text-slate-950 shrink-0 cursor-pointer whitespace-nowrap"
            >
              Continue →
            </button>
          )}
        </div>
      )}

      {/* 3-2-1 Countdown Overlay */}
      {countdownValue !== null && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
          <div
            key={countdownValue}
            className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-gradient-to-br from-sky-500/30 to-emerald-500/30 border-2 border-sky-400 flex items-center justify-center shadow-[0_0_36px_rgba(56,189,248,0.45)] animate-bounce"
          >
            <span className="font-display text-4xl sm:text-5xl font-extrabold text-white drop-shadow">
              {countdownValue}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
