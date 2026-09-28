import { useCallback, useEffect, useRef, useState } from "react";
import { KyotoScene } from "./KyotoScene.jsx";

// Before/after illustrations for Motion+, Brightness+ and Turbo.
//   Motion+     a panning shot rendered twice: the original at 24 fps and Motion+ at 48 fps,
//               split like the app's own hold-C compare view ("Original" / "2× Interpolation").
//   Brightness+ the same frame with and without the extra brightness, behind a draggable divider.
//   Turbo       hold the Space keycap and the clip, the clock and the progress bar run at 2×.
// All three stop animating when off screen, under reduced motion, or when the page is paused.

const DPR_CAP = 2;

function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  );
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return undefined;
    const onChange = (event) => setReduced(event.matches);
    query.addEventListener?.("change", onChange);
    return () => query.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}

function useInView(ref) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      rootMargin: "80px 0px",
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return inView;
}

// A divider the viewer can drag; until they touch it, it sweeps gently to invite a try.
function useSplit(ref, { animate, sweep = true }) {
  const [split, setSplit] = useState(0.5);
  const touched = useRef(false);

  useEffect(() => {
    if (!animate || !sweep) return undefined;
    let frame = 0;
    const start = performance.now();
    const tick = (now) => {
      if (touched.current) return;
      setSplit(0.5 + Math.sin((now - start) / 1400) * 0.17);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animate, sweep]);

  useEffect(() => {
    if (!animate) setSplit(0.5);
  }, [animate]);

  const onPointerDown = useCallback(
    (event) => {
      const node = ref.current;
      if (!node) return;
      touched.current = true;
      const move = (e) => {
        const rect = node.getBoundingClientRect();
        setSplit(Math.min(0.94, Math.max(0.06, (e.clientX - rect.left) / rect.width)));
      };
      move(event);
      node.setPointerCapture?.(event.pointerId);
      const up = () => {
        node.removeEventListener("pointermove", move);
        node.removeEventListener("pointerup", up);
        node.removeEventListener("pointercancel", up);
      };
      node.addEventListener("pointermove", move);
      node.addEventListener("pointerup", up);
      node.addEventListener("pointercancel", up);
    },
    [ref],
  );

  return [split, onPointerDown];
}

function Divider({ split }) {
  return (
    <span aria-hidden="true" className="compare-divider" style={{ left: `${split * 100}%` }}>
      <i>
        <svg viewBox="0 0 16 16">
          <path d="M6 4 2 8l4 4M10 4l4 4-4 4" />
        </svg>
      </i>
    </span>
  );
}

/* Motion+ ---------------------------------------------------------------------------- */

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let r = Math.imul(value ^ (value >>> 15), value | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// A pan along a riverside street at night, in CSS pixels scaled to the canvas height.
function buildStreet() {
  const rnd = mulberry32(2024);
  const buildings = [];
  let x = 0;
  while (x < 1600) {
    const w = 40 + rnd() * 70;
    buildings.push({ x, w, h: 0.22 + rnd() * 0.3, lit: rnd() });
    x += w + 4 + rnd() * 10;
  }
  return { buildings, period: x };
}

const STREET = buildStreet();
const PAN = { far: 18, mid: 110, near: 430 }; // px per second at a 360px-tall frame
const POLE_GAP = 190;
const STRIP_SPEED = 330;

function drawStreet(ctx, w, h, t) {
  const k = h / 360;
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#070b1f");
  sky.addColorStop(0.55, "#17265a");
  sky.addColorStop(0.8, "#34468a");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Far hills.
  const farShift = (t * PAN.far * k) % (w * 0.5);
  ctx.fillStyle = "#1c2350";
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = -w * 0.5; x <= w * 1.5; x += 8) {
    const px = x - farShift;
    const y = h * (0.56 + 0.06 * Math.sin((x / w) * 9) + 0.03 * Math.sin((x / w) * 23));
    ctx.lineTo(px, y);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();

  // Buildings with lit windows.
  const period = STREET.period * k;
  const midShift = (t * PAN.mid * k) % period;
  for (let rep = -1; rep <= Math.ceil(w / period) + 1; rep += 1) {
    for (const b of STREET.buildings) {
      const bx = b.x * k + rep * period - midShift;
      const bw = b.w * k;
      if (bx > w || bx + bw < 0) continue;
      const bh = b.h * h;
      const by = h * 0.86 - bh;
      ctx.fillStyle = "#0d1230";
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = "rgba(255, 196, 120, 0.8)";
      const cell = 11 * k;
      for (let wy = by + cell; wy < h * 0.82; wy += cell) {
        for (let wx = bx + cell * 0.6; wx < bx + bw - cell * 0.5; wx += cell) {
          if (((wx * 7 + wy * 13 + b.lit * 97) | 0) % 5 === 0) ctx.fillRect(wx, wy, 3 * k, 4 * k);
        }
      }
    }
  }

  // Ground and the fast foreground: street lamps, where judder is easiest to see.
  ctx.fillStyle = "#070a1c";
  ctx.fillRect(0, h * 0.86, w, h * 0.14);
  const gap = POLE_GAP * k;
  const nearShift = (t * PAN.near * k) % gap;
  for (let px = -gap; px < w + gap; px += gap) {
    const x = px - nearShift;
    ctx.fillStyle = "#04060f";
    ctx.fillRect(x, h * 0.3, 7 * k, h * 0.7);
    ctx.fillRect(x, h * 0.3, 34 * k, 5 * k);
    const glow = ctx.createRadialGradient(x + 30 * k, h * 0.33, 0, x + 30 * k, h * 0.33, 34 * k);
    glow.addColorStop(0, "rgba(255, 236, 196, 0.95)");
    glow.addColorStop(0.25, "rgba(255, 200, 130, 0.45)");
    glow.addColorStop(1, "rgba(255, 180, 110, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(x - 10 * k, h * 0.33 - 34 * k, 80 * k, 68 * k);
  }
}

// Frame ticks along the bottom: every original frame in white, generated frames in cyan.
function drawFrameStrip(ctx, x0, x1, h, t, fps, k) {
  const y = h - 16 * k;
  const spacing = (STRIP_SPEED * k) / fps;
  const phase = ((t * STRIP_SPEED * k) % (spacing * 2)) ;
  const first = Math.floor(fps * t);
  let index = 0;
  for (let x = x1 + (spacing * 2 - phase); x > x0 - spacing; x -= spacing, index += 1) {
    if (x < x0 || x > x1) continue;
    const generated = fps > 24 && (first - index) % 2 !== 0;
    ctx.fillStyle = generated ? "rgba(33, 215, 228, 0.95)" : "rgba(255, 255, 255, 0.8)";
    ctx.fillRect(x - 1.25 * k, y, 2.5 * k, 8 * k);
  }
}

function MotionCompare({ demo, paused }) {
  const frameRef = useRef(null);
  const canvasRef = useRef(null);
  const reduced = useReducedMotion();
  const inView = useInView(frameRef);
  const animate = inView && !paused && !reduced;
  const [split, onPointerDown] = useSplit(frameRef, { animate });
  const splitRef = useRef(split);
  splitRef.current = split;
  const drawRef = useRef(() => {});

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let cssW = 0;
    let cssH = 0;
    const off = document.createElement("canvas");
    const offCtx = off.getContext("2d");
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(DPR_CAP, window.devicePixelRatio || 1);
      cssW = rect.width;
      cssH = rect.height;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      off.width = canvas.width;
      off.height = canvas.height;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawRef.current(lastT);
    };
    let lastT = 1.37;
    drawRef.current = (t) => {
      lastT = t;
      if (!cssW) return;
      const k = cssH / 360;
      const splitX = cssW * splitRef.current;
      // Left: the original, sampled at 24 fps.
      const t24 = Math.floor(t * 24) / 24;
      drawStreet(offCtx, cssW, cssH, t24);
      ctx.drawImage(off, 0, 0, off.width, off.height, 0, 0, cssW, cssH);
      drawFrameStrip(ctx, 0, splitX, cssH, t24, 24, k);
      // Right: Motion+, sampled at 48 fps.
      const t48 = Math.floor(t * 48) / 48;
      drawStreet(offCtx, cssW, cssH, t48);
      ctx.save();
      ctx.beginPath();
      ctx.rect(splitX, 0, cssW - splitX, cssH);
      ctx.clip();
      ctx.drawImage(off, 0, 0, off.width, off.height, 0, 0, cssW, cssH);
      drawFrameStrip(ctx, splitX, cssW, cssH, t48, 48, k);
      ctx.restore();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    drawRef.current(animate ? performance.now() / 1000 : 1.37);
    if (!animate) return undefined;
    let frame = 0;
    const tick = (now) => {
      drawRef.current(now / 1000);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animate]);

  useEffect(() => {
    if (!animate) drawRef.current(1.37);
  }, [split, animate]);

  return (
    <figure aria-label={demo.label} className="compare-frame motion-frame" ref={frameRef} role="img" onPointerDown={onPointerDown}>
      <canvas aria-hidden="true" ref={canvasRef} />
      <span aria-hidden="true" className="compare-chip" style={{ left: `${split * 50}%` }}>
        {demo.before}
        <em>24 fps</em>
      </span>
      <span aria-hidden="true" className="compare-chip is-after" style={{ left: `${50 + split * 50}%` }}>
        {demo.after}
        <em>48 fps</em>
      </span>
      <Divider split={split} />
    </figure>
  );
}

/* Brightness+ ------------------------------------------------------------------------ */

function BrightnessCompare({ demo, paused }) {
  const frameRef = useRef(null);
  const reduced = useReducedMotion();
  const inView = useInView(frameRef);
  const [split, onPointerDown] = useSplit(frameRef, { animate: inView && !paused && !reduced });
  return (
    <figure
      aria-label={demo.label}
      className="compare-frame bright-frame"
      onPointerDown={onPointerDown}
      ref={frameRef}
      role="img"
      style={{ "--split": `${split * 100}%` }}
    >
      <KyotoScene className="bright-before" />
      <KyotoScene className="bright-after">
        <span className="bright-bloom" />
      </KyotoScene>
      <span aria-hidden="true" className="compare-chip" style={{ left: `${split * 50}%` }}>
        {demo.before}
      </span>
      <span aria-hidden="true" className="compare-chip is-after" style={{ left: `${50 + split * 50}%` }}>
        {demo.after}
      </span>
      <Divider split={split} />
    </figure>
  );
}

/* Turbo ------------------------------------------------------------------------------ */

const TURBO_CLIP = 42 * 60 + 18;

function clock(seconds) {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function TurboDemo({ demo, paused }) {
  const frameRef = useRef(null);
  const timeRef = useRef(null);
  const barRef = useRef(null);
  const reduced = useReducedMotion();
  const inView = useInView(frameRef);
  const animate = inView && !paused && !reduced;
  const [held, setHeld] = useState(false);
  const [autoHeld, setAutoHeld] = useState(false);
  const userHeld = useRef(false);
  const turbo = held || autoHeld || !animate;

  // Autoplay: 2.8 s at normal speed, then 2.8 s with Space held.
  useEffect(() => {
    if (!animate) return undefined;
    const id = window.setInterval(() => {
      if (!userHeld.current) setAutoHeld((value) => !value);
    }, 2800);
    return () => window.clearInterval(id);
  }, [animate]);

  useEffect(() => {
    const scene = frameRef.current;
    let media = 18 * 60 + 24;
    const paint = () => {
      if (timeRef.current) timeRef.current.textContent = clock(media);
      if (barRef.current) barRef.current.style.width = `${(media / TURBO_CLIP) * 100}%`;
      scene?.style.setProperty("--drift", `${((media * 14) % 1400).toFixed(1)}px`);
    };
    paint();
    if (!animate) return undefined;
    let frame = 0;
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const rate = frameRef.current?.dataset.turbo === "true" ? 2 : 1;
      media += dt * rate * 6; // a sped-up clock so the change is visible within a few seconds
      if (media > TURBO_CLIP - 30) media = 18 * 60;
      paint();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animate]);

  const press = (event) => {
    event.preventDefault();
    userHeld.current = true;
    setHeld(true);
  };
  const release = () => {
    userHeld.current = false;
    setHeld(false);
    setAutoHeld(false);
  };

  return (
    <figure aria-label={demo.label} className="compare-frame turbo-frame" data-turbo={turbo} ref={frameRef} role="img">
      <KyotoScene className="turbo-scene" clouds />
      <div aria-hidden="true" className="turbo-hud">
        <span className="turbo-chevrons">
          <i />
          <i />
          <i />
        </span>
        <b>2×</b>
      </div>
      <div aria-hidden="true" className="turbo-bar">
        <span ref={timeRef} />
        <span className="turbo-track">
          <span ref={barRef} />
        </span>
        <span>{clock(TURBO_CLIP)}</span>
      </div>
      <button
        aria-label={demo.keyLabel}
        className="turbo-key"
        onPointerCancel={release}
        onPointerDown={press}
        onPointerLeave={release}
        onPointerUp={release}
        type="button"
      >
        <kbd>{demo.key}</kbd>
        <span>{demo.hint}</span>
      </button>
    </figure>
  );
}

/* Section ---------------------------------------------------------------------------- */

export function BoostDemos({ boosts, paused }) {
  const { motion, brightness, turbo } = boosts;
  return (
    <div className="boost-grid">
      <article className="boost-card is-wide" data-reveal>
        <MotionCompare demo={motion.demo} paused={paused} />
        <div className="boost-copy">
          <h3>{motion.title}</h3>
          <p>{motion.description}</p>
          <ul aria-hidden="true" className="frame-legend">
            <li>{motion.demo.legendOriginal}</li>
            <li className="is-generated">{motion.demo.legendGenerated}</li>
          </ul>
          <span className="boost-note">{motion.note}</span>
        </div>
      </article>
      <article className="boost-card" data-reveal>
        <BrightnessCompare demo={brightness.demo} paused={paused} />
        <div className="boost-copy">
          <h3>{brightness.title}</h3>
          <p>{brightness.description}</p>
          <span className="boost-note">{brightness.note}</span>
        </div>
      </article>
      <article className="boost-card" data-reveal>
        <TurboDemo demo={turbo.demo} paused={paused} />
        <div className="boost-copy">
          <h3>{turbo.title}</h3>
          <p>{turbo.description}</p>
        </div>
      </article>
    </div>
  );
}

export default BoostDemos;
