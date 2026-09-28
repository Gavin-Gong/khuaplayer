import { useEffect, useRef } from "react";

// A Canvas port of the app's Particle Star Trail timeline (Apps/Mac/UI/SPDustLayer.swift).
// The same model drives both demos on the page:
//   film   - colors sampled from a synthetic video, density from its bitrate, pointer glow,
//            plus the Liquid and Classic styles for comparison.
//   repair - the same film, still downloading and with damaged stretches, tinted with the
//            app's amber / red / gray damage classes over the film colors.
// Geometry is written in the app's points and scaled so the band fills the canvas height.

const LAYER_PT = 30; // Band height in app points that the canvas height represents.

const T = {
  grainsPerPt: 5.5,
  spread: 6.4,
  spreadBias: 2.0,
  zone: 15,
  sizePt: 1.09,
  restA: 0.26,
  railFrac: 0.5,
  railHalf: 2.0,
  railA: 0.45,
  lift: 0.8,
  peak: 1.9,
  glowTau: 7,
  glowTail: 0.25,
  glowTailR: 20,
  hlG: 0.375,
  swell: 0.5,
  unplayedGain: 0.7,
  playedGain: 0.8,
  whitenK: 1.0,
  whitenMax: 0.7,
  haloR: 5,
  haloA: 1.35,
  emberP: 0.06,
  emberBase: 1.22,
  emberK: 2.3,
  unify: 5.0,
  crest: 2.34,
  settleA: 2.2,
  pressPk: 0.34,
  aMin: 0.62,
  aMax: 1.0,
  fogSize: 1.3,
  settleHalf: 2.0,
  settleSize: 0.25,
  gain: 0.8,
  sizeJitter: 0.6,
  haze: 0.12,
  playedWhite: 0.2,
  playedChroma: 1.45,
  colorSatMin: 0.37,
  colorSatMax: 0.95,
  colorEaseS: 0.35,
  colorBloomS: 0.8,
};

// Web-only presentation factors: particles are drawn a little finer than a straight zoom
// of the app, and the budget is raised so the band keeps the app's visual density.
const SIZE_SCALE = 0.5;
const DENSITY_SCALE = 2.4;
const DPR_CAP = 2;

const NEUTRAL = [1.0, 0.94, 0.86];
// The legend swatches (#ffa630, #ff5a4e) in linear light, so particles and legend match.
const PARTIAL = [1.0, 0.381, 0.03];
const UNAVAILABLE = [1.0, 0.102, 0.076];

// Damage classes, as in the app: 0 fluent, 1 partial, 2 none, 3 not downloaded yet.
const REPAIR_BANDS = [
  { cls: 1, from: 0.2, until: 0.27 },
  { cls: 2, from: 0.425, until: 0.465 },
];

// A synthetic film: cut points with hue, saturation, and a relative bitrate level.
const FILM_SCENES = [
  [0.0, 0.075, 0.5, 0.3],
  [0.06, 0.1, 0.7, 0.45],
  [0.13, 0.54, 0.62, 0.32],
  [0.21, 0.58, 0.55, 0.55],
  [0.285, 0.93, 0.68, 0.88],
  [0.34, 0.77, 0.6, 0.72],
  [0.41, 0.62, 0.42, 0.22],
  [0.49, 0.02, 0.84, 0.96],
  [0.56, 0.07, 0.8, 1.0],
  [0.63, 0.31, 0.48, 0.4],
  [0.71, 0.5, 0.6, 0.58],
  [0.8, 0.12, 0.62, 0.78],
  [0.88, 0.075, 0.5, 0.36],
  [0.95, 0.62, 0.3, 0.18],
];

// The resilience demo plays "kyoto-by-night": a cool night palette, so amber and red on
// its timeline can only mean damage.
const NIGHT_SCENES = [
  [0.0, 0.6, 0.55, 0.35],
  [0.08, 0.52, 0.6, 0.5],
  [0.16, 0.7, 0.5, 0.4],
  [0.27, 0.46, 0.55, 0.62],
  [0.36, 0.78, 0.5, 0.7],
  [0.47, 0.63, 0.45, 0.3],
  [0.55, 0.36, 0.45, 0.55],
  [0.64, 0.56, 0.62, 0.8],
  [0.74, 0.72, 0.55, 0.45],
  [0.84, 0.5, 0.5, 0.6],
  [0.93, 0.64, 0.4, 0.25],
];

const FILM_SECONDS = 6760; // 1:52:40
const REPAIR_SECONDS = 2538; // 42:18

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);
const smooth = (value) => value * value * (3 - 2 * value);

function srgbToLinear(x) {
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

function hsv(h, s, v) {
  const i = Math.floor(h * 6) % 6;
  const f = h * 6 - Math.floor(h * 6);
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const u = v * (1 - (1 - f) * s);
  switch (i) {
    case 0: return [v, u, p];
    case 1: return [q, v, p];
    case 2: return [p, v, u];
    case 3: return [p, q, v];
    case 4: return [u, p, v];
    default: return [v, p, q];
  }
}

// Linear light to an 8-bit sRGB code value, through a lookup table.
const ENCODE = (() => {
  const size = 4096;
  const table = new Uint8ClampedArray(size + 1);
  for (let i = 0; i <= size; i += 1) {
    const x = i / size;
    const encoded = x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
    table[i] = Math.round(encoded * 255);
  }
  return (x) => table[x >= 1 ? size : x <= 0 ? 0 : (x * size) | 0];
})();

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(r).padStart(2, "0")}`;
}

// Per-bin film data: target color (linear), bitrate rank, and particle survival.
function buildFilmBins(B, variant) {
  const color = new Float32Array(B * 3);
  const bright = new Float32Array(B);
  const alive = new Float32Array(B);
  const rnd = mulberry32(0x5eed + B);
  const scenes = variant === "repair" ? NIGHT_SCENES : FILM_SCENES;

  // Thumbnail-like samples every 1/120 of the duration, as the app's sweep produces.
  const samples = [];
  const sampleCount = 120;
  for (let i = 0; i < sampleCount; i += 1) {
    const pos = (i + 0.5) / sampleCount;
    let scene = scenes[0];
    for (const candidate of scenes) if (candidate[0] <= pos) scene = candidate;
    samples.push({ pos, hue: (scene[1] + (rnd() - 0.5) * 0.03 + 1) % 1, sat: clamp01(scene[2] + (rnd() - 0.5) * 0.12) });
  }
  const sats = samples.map((sample) => sample.sat).sort((a, b) => a - b);
  const sLo = sats[Math.floor((sats.length - 1) * 0.1)];
  const sHi = Math.max(sLo + 0.02, sats[Math.floor((sats.length - 1) * 0.9)]);
  const sigma = 1.1 / sampleCount;
  const prior = 0.02;
  for (let b = 0; b < B; b += 1) {
    const x = (b + 0.5) / B;
    let r = NEUTRAL[0] * prior;
    let g = NEUTRAL[1] * prior;
    let bl = NEUTRAL[2] * prior;
    let w = prior;
    {
      for (const sample of samples) {
        const d = (x - sample.pos) / sigma;
        if (d > 3 || d < -3) continue;
        const k = Math.exp(-d * d);
        const u = clamp01((sample.sat - sLo) / (sHi - sLo));
        const rgb = hsv(sample.hue, T.colorSatMin + (T.colorSatMax - T.colorSatMin) * u, 1);
        r += srgbToLinear(rgb[0]) * k;
        g += srgbToLinear(rgb[1]) * k;
        bl += srgbToLinear(rgb[2]) * k;
        w += k;
      }
    }
    color[b * 3] = r / w;
    color[b * 3 + 1] = g / w;
    color[b * 3 + 2] = bl / w;
  }

  // Bitrate: scene level with slow wobble and grain, then percentile-normalized to a rank.
  const rate = new Float32Array(B);
  for (let b = 0; b < B; b += 1) {
    const x = (b + 0.5) / B;
    let scene = scenes[0];
    for (const candidate of scenes) if (candidate[0] <= x) scene = candidate;
    const level = scene[3];
    rate[b] = 0.4 + level + 0.18 * Math.sin(x * 61) * Math.sin(x * 17) + (rnd() - 0.5) * 0.22;
  }
  const sorted = Array.from(rate).sort((a, b) => a - b);
  const lo = sorted[Math.floor((B - 1) * 0.05)];
  const hi = sorted[Math.floor((B - 1) * 0.95)];
  const depth = 0.85;
  for (let b = 0; b < B; b += 1) {
    const rank = hi > lo ? clamp01((rate[b] - lo) / (hi - lo)) : 0.5;
    bright[b] = rank;
    alive[b] = T.aMin + (T.aMax - T.aMin) * (0.5 + depth * (rank - 0.5));
  }
  return { color, bright, alive };
}

function createEngine(canvas, options) {
  const { variant, styleRef, pausedRef, washRef, statusRef, timeRef, downloadRef, downloadText, previewRef } = options;
  const context = canvas.getContext("2d");
  const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia("(pointer: fine)").matches;

  const s = {
    cssW: 0,
    cssH: 0,
    dpr: 1,
    k: 2,
    W: 0, // Width in app points.
    n: 0,
    B: 0,
    image: null,
    R: null, G: null, Bl: null, A: null,
    haloCol: null,
    home: null, side: null, rest: null, j2: null, j3: null, u: null, ember: null, rail: null,
    xs: null, ys: null, born: null,
    film: null,
    colorCur: null,
    coverage: 0, // Fraction of the timeline whose colors have been sampled.
    coverBorn: null,
    elapsed: 0,
    firstFrame: true,
    split: 0.12,
    target: null,
    download: variant === "repair" ? 0.52 : 1,
    px: -1e4,
    hovering: false,
    open: { value: 0, from: 0, to: 0, dur: 0.001, t: 1 },
    press: { value: 0, from: 0, to: 0, dur: 0.001, t: 1 },
    rebound: 0,
    phantom: null,
    phantomNext: 2.2,
    phantomIndex: 0,
    lastUserPointer: -1e9,
    resetFade: 1,
    resetting: 0,
    frame: 0,
    last: 0,
    visible: false,
    documentVisible: !document.hidden,
    reduced: reducedQuery.matches,
    lastSide: -1,
    status: "",
  };

  const tweenGo = (tw, to, dur) => {
    tw.from = tw.value;
    tw.to = to;
    tw.dur = Math.max(0.001, dur);
    tw.t = 0;
  };
  const tweenSet = (tw, v) => {
    tw.value = v;
    tw.from = v;
    tw.to = v;
    tw.t = tw.dur;
  };
  const tweenStep = (tw, dt) => {
    if (tw.t >= tw.dur) return;
    tw.t = Math.min(tw.dur, tw.t + dt);
    const u = tw.t / tw.dur;
    const e = 1 - (1 - u) * (1 - u) * (1 - u);
    tw.value = tw.from + (tw.to - tw.from) * e;
  };
  const tweenDone = (tw) => tw.t >= tw.dur;

  const animating = () => !s.reduced && !pausedRef.current;

  // The still frame shown under reduced motion or the page's pause control. Any
  // in-flight reset fade or phantom sweep is cleared so nothing freezes half-way.
  const staticState = () => {
    s.coverage = 1;
    s.resetting = 0;
    s.resetFade = 1;
    if (s.phantom) {
      s.phantom = null;
      s.hovering = false;
      tweenSet(s.open, 0);
    }
    // Pausing mid-play freezes where it is; a page that never animated shows a composed frame.
    if (s.elapsed > 0) return;
    if (variant === "repair") {
      s.download = 0.78;
      s.split = 0.61;
    } else {
      s.split = 0.42;
    }
  };

  const regenerate = () => {
    const rnd = mulberry32(0x9e3779b9 ^ Math.round(s.W));
    const n = Math.max(0, Math.round(T.grainsPerPt * DENSITY_SCALE * s.W));
    s.n = n;
    s.home = new Float32Array(n);
    s.side = new Float32Array(n);
    s.rest = new Float32Array(n);
    s.j2 = new Float32Array(n);
    s.j3 = new Float32Array(n);
    s.u = new Float32Array(n);
    s.ember = new Uint8Array(n);
    s.rail = new Uint8Array(n);
    s.xs = new Float32Array(n);
    s.ys = new Float32Array(n);
    s.born = new Float32Array(n);
    const rf = T.railFrac;
    for (let i = 0; i < n; i += 1) {
      s.home[i] = ((i + rnd()) / Math.max(1, n)) * s.W;
      s.side[i] = rnd() < 0.5 ? -1 : 1;
      const jj = rnd();
      s.j2[i] = jj;
      s.j3[i] = rnd();
      s.u[i] = rnd();
      const isRail = jj < rf;
      s.rail[i] = isRail ? 1 : 0;
      s.ember[i] = !isRail && rnd() < T.emberP ? 1 : 0;
      if (isRail) {
        s.rest[i] = T.railHalf * (jj / rf);
      } else {
        const q = (jj - rf) / (1 - rf);
        s.rest[i] = T.spread * (0.06 + 0.94 * Math.pow(q, T.spreadBias));
      }
    }
    s.B = Math.max(8, Math.floor(s.W / 2));
    s.film = buildFilmBins(s.B, variant);
    s.colorCur = new Float32Array(s.B * 3);
    s.coverBorn = new Float32Array(s.B).fill(-1);
    for (let b = 0; b < s.B; b += 1) {
      s.colorCur[b * 3] = NEUTRAL[0];
      s.colorCur[b * 3 + 1] = NEUTRAL[1];
      s.colorCur[b * 3 + 2] = NEUTRAL[2];
    }
    s.firstFrame = true;
  };

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rect.width));
    const cssH = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(DPR_CAP, window.devicePixelRatio || 1);
    if (cssW === s.cssW && cssH === s.cssH && dpr === s.dpr && s.image) return;
    s.cssW = cssW;
    s.cssH = cssH;
    s.dpr = dpr;
    s.k = cssH / LAYER_PT;
    s.W = cssW / s.k;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const size = canvas.width * canvas.height;
    s.image = context.createImageData(canvas.width, canvas.height);
    s.R = new Float32Array(size);
    s.G = new Float32Array(size);
    s.Bl = new Float32Array(size);
    s.A = new Float32Array(size);
    s.haloCol = new Float32Array(canvas.width * 4);
    regenerate();
    if (!animating()) staticState();
    kick();
  };

  // Pointer input, in CSS pixels relative to the canvas.
  const toPt = (event) => (event.clientX - canvas.getBoundingClientRect().left) / s.k;
  const enter = (x) => {
    s.hovering = true;
    s.px = x;
    tweenGo(s.open, 1, 0.24);
    kick();
  };
  const exit = () => {
    s.hovering = false;
    tweenGo(s.open, 0, 0.28);
    tweenSet(s.press, 0);
    s.rebound = 0;
    kick();
  };
  const seek = (x) => {
    const p = clamp01(x / s.W);
    s.split = variant === "repair" ? Math.min(p, s.download - 0.01) : Math.min(0.97, Math.max(0.02, p));
    kick();
  };
  let dragging = false;
  const onPointerEnter = (event) => {
    if (event.pointerType !== "mouse") return;
    s.phantom = null;
    s.lastUserPointer = s.elapsed;
    enter(toPt(event));
  };
  const onPointerMove = (event) => {
    if (event.pointerType === "mouse" || dragging) {
      s.phantom = null;
      s.lastUserPointer = s.elapsed;
      s.px = toPt(event);
      if (!s.hovering) enter(s.px);
      if (dragging) seek(s.px);
      kick();
    }
  };
  const onPointerLeave = (event) => {
    if (event.pointerType !== "mouse" || dragging) return;
    exit();
  };
  const onPointerDown = (event) => {
    s.phantom = null;
    s.lastUserPointer = s.elapsed;
    dragging = true;
    canvas.setPointerCapture?.(event.pointerId);
    if (!s.hovering) enter(toPt(event));
    s.px = toPt(event);
    tweenGo(s.press, s.reduced ? 0 : 1, 0.12);
    s.rebound = 0;
    seek(s.px);
  };
  const onPointerUp = (event) => {
    if (!dragging) return;
    dragging = false;
    canvas.releasePointerCapture?.(event.pointerId);
    const inside = event.pointerType === "mouse";
    if (inside && !s.reduced) {
      tweenGo(s.press, -0.2, 0.14);
      s.rebound = 1;
    } else {
      tweenGo(s.press, 0, 0.18);
    }
    if (!inside) window.setTimeout(exit, 900);
    kick();
  };

  // Autoplay: the playhead advances, the repair demo's download grows, and a phantom
  // pointer occasionally sweeps the film timeline to show the glow on any device.
  const PHANTOM_STOPS = [0.3, 0.68, 0.47, 0.84, 0.2];
  const advance = (dt) => {
    if (!animating()) return;
    s.elapsed += dt;

    if (s.coverage < 1) {
      s.coverage = Math.min(1, s.coverage + dt / 2.6);
    }

    if (s.resetting > 0) {
      s.resetting -= dt;
      s.resetFade = clamp01(Math.abs(s.resetting - 0.5) / 0.5);
      if (s.resetting <= 0.5 && s.resetting + dt > 0.5) {
        if (variant === "repair") {
          s.download = 0.52;
          s.split = 0.04;
        } else {
          s.split = 0.08;
        }
      }
      if (s.resetting <= 0) {
        s.resetting = 0;
        s.resetFade = 1;
      }
      return;
    }

    if (variant === "repair") {
      s.download = Math.min(1, s.download + dt * 0.021);
      const limit = s.download < 1 ? s.download - 0.012 : 1;
      s.split = Math.min(limit, s.split + dt * 0.042);
      if (s.split >= 0.985) s.resetting = 2.6;
    } else {
      s.split += dt / 70;
      if (s.split >= 0.96) s.resetting = 1.6;
    }

    if (variant === "film" && styleRef.current !== "starTrail") {
      if (s.phantom) {
        s.phantom = null;
        exit();
      }
    } else if (variant === "film") {
      const idle = s.elapsed - s.lastUserPointer > 5;
      if (s.phantom) {
        const p = s.phantom;
        p.t += dt;
        const u = clamp01(p.t / p.dur);
        s.px = (p.from + (p.to - p.from) * smooth(u)) * s.W;
        if (p.t >= p.dur) {
          s.phantom = null;
          exit();
          s.phantomNext = s.elapsed + 4.5;
        }
      } else if (idle && !s.hovering && s.elapsed >= s.phantomNext && s.coverage >= 1) {
        const at = PHANTOM_STOPS[s.phantomIndex % PHANTOM_STOPS.length];
        s.phantomIndex += 1;
        const dir = s.phantomIndex % 2 === 0 ? 1 : -1;
        s.phantom = { from: at - dir * 0.07, to: at + dir * 0.07, t: 0, dur: 2.8 };
        enter(s.phantom.from * s.W);
      }
    }
  };

  // Particle simulation, a direct port of SPDustHost.step. Returns true when converged.
  const stepParticles = (dt) => {
    const n = s.n;
    if (!n) return true;
    const B = s.B;
    const film = s.film;
    const O = s.open.value;
    const pk = O * (0.66 + T.pressPk * s.press.value);
    const binScale = B / Math.max(1, s.W);
    const glowNorm = 1 / (1 + T.glowTail);
    const tailInv2 = 1 / (T.glowTailR * T.glowTailR);
    const glowReach = Math.max(T.glowTau * 6, T.glowTailR * 2.2);
    const cy = LAYER_PT / 2;
    const split = s.split * s.W;
    const px = s.px;
    const rm = s.reduced;
    let maxMove = 0;
    let bornDelta = 0;

    // Colors bloom in as the "thumbnail sweep" covers each bin, then ease toward target.
    let colorDelta = 0;
    const ke = rm ? 1 : 1 - Math.exp(-dt / T.colorEaseS);
    const covered = Math.floor(s.coverage * B);
    for (let b = 0; b < B; b += 1) {
      let tr = NEUTRAL[0];
      let tg = NEUTRAL[1];
      let tb = NEUTRAL[2];
      if (b < covered) {
        if (s.coverBorn[b] < 0) s.coverBorn[b] = s.elapsed;
        const age = rm || !animating() ? 1e9 : s.elapsed - s.coverBorn[b];
        const e = age >= T.colorBloomS ? 1 : smooth(Math.max(0, age / T.colorBloomS));
        tr = NEUTRAL[0] + (film.color[b * 3] - NEUTRAL[0]) * e;
        tg = NEUTRAL[1] + (film.color[b * 3 + 1] - NEUTRAL[1]) * e;
        tb = NEUTRAL[2] + (film.color[b * 3 + 2] - NEUTRAL[2]) * e;
      }
      const c = s.colorCur;
      const dr = tr - c[b * 3];
      const dg = tg - c[b * 3 + 1];
      const db = tb - c[b * 3 + 2];
      colorDelta = Math.max(colorDelta, Math.abs(dr), Math.abs(dg), Math.abs(db));
      c[b * 3] += dr * ke;
      c[b * 3 + 1] += dg * ke;
      c[b * 3 + 2] += db * ke;
    }

    const grains = s.grains;
    for (let i = 0; i < n; i += 1) {
      const hx = s.home[i];
      const bi = Math.min(B - 1, Math.max(0, (hx * binScale) | 0));
      const pos = hx / s.W;
      const isCovered = bi < covered;
      let dv = isCovered ? film.alive[bi] : T.haze;
      const br = isCovered ? film.bright[bi] : 0.5;

      let dmg = 0;
      if (variant === "repair") {
        if (pos >= s.download) dmg = 3;
        else {
          for (const band of REPAIR_BANDS) if (pos >= band.from && pos < band.until) dmg = band.cls;
        }
      }
      if (dmg === 2) dv *= 0.12;
      else if (dmg === 3) dv *= 0.22;

      const tt = clamp01((split - hx) / T.zone + 0.5);
      const isRail = s.rail[i] === 1;
      const aliveP = isRail ? 1 : dv * (1 - tt) + tt;
      const bt = s.u[i] <= aliveP ? 1 : 0;
      if (s.firstFrame) s.born[i] = bt;
      let bn = s.born[i];
      if (bt === 0 && bn < 0.012) {
        s.born[i] = 0;
        grains[i * 8 + 3] = 0;
        continue;
      }
      const bn0 = bn;
      const lamB = rm ? 60 : bt > 0 ? 19 : 9;
      bn += (bt - bn) * (1 - Math.exp(-lamB * dt));
      s.born[i] = bn;
      bornDelta = Math.max(bornDelta, Math.abs(bt - bn));

      const dE = Math.abs(hx - px);
      const gs = dE > glowReach
        ? 0
        : (Math.exp(-dE / T.glowTau) + T.glowTail * Math.exp(-(dE * dE) * tailInv2)) * glowNorm;
      const g = pk * gs;
      const c = g * T.hlG;

      const crestD = (hx - split) / 9;
      const crest = Math.exp(-crestD * crestD);
      let ty = cy + s.side[i] * (s.rest[i] * (1 - tt) * (1 - 0.94 * c)
        + (T.settleHalf * (1 + T.swell * gs * O) * (s.j3[i] - 0.5) * 2 + T.crest * crest) * tt);
      const tx = hx + (px - hx) * c * 0.16;
      const jit = isRail ? 1 : (1 - T.sizeJitter / 2 + T.sizeJitter * s.j3[i]) * (1 + (T.fogSize - 1) * (1 - tt));
      const sz = T.sizePt * (isRail ? 1.2 : jit) * (1 + T.settleSize * tt);
      const aMul = 1 + T.settleA * tt + 1.2 * crest * tt;

      ty = cy + (ty - cy) * bn;
      if (s.firstFrame || bn0 < 0.02) {
        s.xs[i] = tx;
        s.ys[i] = ty;
      }
      maxMove = Math.max(maxMove, Math.abs(tx - s.xs[i]), Math.abs(ty - s.ys[i]));
      const lam = rm ? 70 : 13 + 24 * s.j2[i];
      const k = 1 - Math.exp(-lam * dt);
      s.xs[i] += (tx - s.xs[i]) * k;
      s.ys[i] += (ty - s.ys[i]) * k;
      const y = s.ys[i];

      const dy = Math.abs(y - cy);
      const prof = 1 - 0.42 * Math.min(1, dy / T.spread);
      let L = (isRail ? T.railA : T.restA * (0.42 + 0.58 * br)) * prof * aMul * bn;
      L *= 1 + T.lift * O;
      L *= 1 + T.peak * c;
      L *= 1 + T.unify * c * (1 - tt);
      if (s.ember[i]) L *= T.emberBase + (T.emberK - T.emberBase) * g;
      L *= T.gain;
      L *= T.unplayedGain * (1 - tt) + T.playedGain * tt;
      const cap = 1 - (1 - T.playedGain) * tt * (1 - gs * O);
      L = Math.min(cap, L);

      let r = s.colorCur[bi * 3];
      let gg = s.colorCur[bi * 3 + 1];
      let b = s.colorCur[bi * 3 + 2];
      const wmix = T.playedWhite * tt;
      r = r * (1 - wmix) + wmix;
      gg = gg * (1 - wmix) + wmix;
      b = b * (1 - wmix) + wmix;
      if (tt > 0) {
        const Y = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
        const kc = 1 + (T.playedChroma - 1) * tt;
        r = Math.max(0, Y + (r - Y) * kc);
        gg = Math.max(0, Y + (gg - Y) * kc);
        b = Math.max(0, Y + (b - Y) * kc);
        const m = Math.max(r, gg, b);
        if (m > 1) {
          r /= m;
          gg /= m;
          b /= m;
        }
      }
      // The app mixes 55% amber / 65% red over the film color; mixed in linear light that turns
      // blue scenes beige. The demo uses the tint itself, shaded by the film's brightness, and
      // lifts the dim unplayed side, so the bands read at a glance and match the legend.
      if (dmg === 1 || dmg === 2) {
        const tint = dmg === 1 ? PARTIAL : UNAVAILABLE;
        const shade = 0.82 + 0.18 * Math.min(1, 0.2126 * r + 0.7152 * gg + 0.0722 * b);
        r = tint[0] * shade;
        gg = tint[1] * shade;
        b = tint[2] * shade;
        L = Math.min(1, L * (1 + (dmg === 1 ? 1.6 : 1.8) * (1 - tt)));
      } else if (dmg === 3) {
        const Y = ((r + gg + b) / 3) * 0.6;
        r = Y;
        gg = Y;
        b = Y;
        L *= 0.38;
      }
      const w = sz * (s.ember[i] ? 1.6 : 1) * (1 + 0.22 * c) * (1 + 0.24 * T.unify * c * (1 - tt));
      const o = i * 8;
      grains[o] = s.xs[i];
      grains[o + 1] = y;
      grains[o + 2] = w;
      grains[o + 3] = L;
      grains[o + 4] = r;
      grains[o + 5] = gg;
      grains[o + 6] = b;
      grains[o + 7] = g * bn;
    }
    s.firstFrame = false;
    const tweensDone = tweenDone(s.open) && tweenDone(s.press) && s.rebound === 0;
    return maxMove < 0.02 && bornDelta < 0.01 && tweensDone && colorDelta < 0.004;
  };

  const drawParticles = () => {
    const { R, G, Bl, A, image } = s;
    const Wd = canvas.width;
    const Hd = canvas.height;
    R.fill(0);
    G.fill(0);
    Bl.fill(0);
    A.fill(0);
    const scale = s.k * s.dpr;
    const sizeScale = scale * SIZE_SCALE;
    const grains = s.grains;
    const haloCol = s.haloCol;
    haloCol.fill(0);
    const haloR = T.haloR * scale;
    const haloNorm = T.haloA / Math.max(1, T.grainsPerPt * 1.12 * T.haloR);
    let anyHalo = false;

    for (let i = 0; i < s.n; i += 1) {
      const o = i * 8;
      let lum = grains[o + 3];
      if (lum <= 0.002) continue;
      const xd = grains[o] * scale;
      const yd = grains[o + 1] * scale;
      let px = grains[o + 2] * sizeScale;
      if (px < 1) {
        lum *= px * px;
        px = 1;
      }
      const cr = grains[o + 4] * lum;
      const cg = grains[o + 5] * lum;
      const cb = grains[o + 6] * lum;
      const ca = lum > 1 ? 1 : lum;
      const size = Math.max(1, Math.round(px));
      const x0 = Math.round(xd - size / 2);
      const y0 = Math.round(yd - size / 2);
      const round = size >= 3;
      for (let yy = 0; yy < size; yy += 1) {
        const y = y0 + yy;
        if (y < 0 || y >= Hd) continue;
        const row = y * Wd;
        const edgeY = yy === 0 || yy === size - 1;
        for (let xx = 0; xx < size; xx += 1) {
          if (round && edgeY && (xx === 0 || xx === size - 1)) continue;
          const x = x0 + xx;
          if (x < 0 || x >= Wd) continue;
          const idx = row + x;
          if (cr > R[idx]) R[idx] = cr;
          if (cg > G[idx]) G[idx] = cg;
          if (cb > Bl[idx]) Bl[idx] = cb;
          if (ca > A[idx]) A[idx] = ca;
        }
      }

      // Halos: accumulate per device column; their vertical profile is added below.
      const glow = grains[o + 7];
      if (glow > 0.02) {
        anyHalo = true;
        const amp = haloNorm * glow * glow;
        const hr = grains[o + 4] * 0.45 + 0.55;
        const hg = grains[o + 5] * 0.45 + 0.55;
        const hb = grains[o + 6] * 0.45 + 0.55;
        const xa = Math.max(0, Math.floor(xd - haloR));
        const xb = Math.min(Wd - 1, Math.ceil(xd + haloR));
        for (let x = xa; x <= xb; x += 1) {
          const d = (x - xd) / haloR;
          const a = Math.exp(-d * d * 2.5) * amp;
          haloCol[x * 4] += hr * a;
          haloCol[x * 4 + 1] += hg * a;
          haloCol[x * 4 + 2] += hb * a;
          haloCol[x * 4 + 3] += a;
        }
      }
    }

    if (anyHalo) {
      const cyd = (LAYER_PT / 2) * scale;
      const ya = Math.max(0, Math.floor(cyd - haloR * 1.6));
      const yb = Math.min(Hd - 1, Math.ceil(cyd + haloR * 1.6));
      // A column's halos stack with the grains' vertical spread, so its profile is wider than one halo.
      const spreadR = haloR * 1.25;
      for (let y = ya; y <= yb; y += 1) {
        const d = (y - cyd) / spreadR;
        const vy = Math.exp(-d * d * 2.5) * 0.8;
        const row = y * Wd;
        for (let x = 0; x < Wd; x += 1) {
          const ha = haloCol[x * 4 + 3];
          if (ha <= 0.0005) continue;
          const idx = row + x;
          R[idx] += haloCol[x * 4] * vy;
          G[idx] += haloCol[x * 4 + 1] * vy;
          Bl[idx] += haloCol[x * 4 + 2] * vy;
          A[idx] += ha * vy;
        }
      }
    }

    const data = image.data;
    const fade = s.resetFade;
    for (let idx = 0, p = 0; idx < R.length; idx += 1, p += 4) {
      let a = A[idx];
      if (a <= 0.002) {
        data[p + 3] = 0;
        continue;
      }
      if (a > 1) a = 1;
      const inv = 1 / a;
      data[p] = ENCODE(R[idx] * inv);
      data[p + 1] = ENCODE(G[idx] * inv);
      data[p + 2] = ENCODE(Bl[idx] * inv);
      data[p + 3] = Math.round(a * fade * 255);
    }
    context.putImageData(image, 0, 0);
  };

  // Liquid and Classic, following SPProgressView: a capsule rail 4pt tall that grows to
  // 7pt on hover; Liquid adds a Gaussian bulge under the pointer, Classic shows the knob.
  const drawRail = (styleName) => {
    // Rails are drawn near the app's own size rather than at the particle demo's zoom.
    const scale = Math.min(s.k, 1.6) * s.dpr;
    const Wd = canvas.width;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, Wd, canvas.height);
    context.globalAlpha = s.resetFade;
    const O = s.open.value;
    const halfBase = (2 + 1.5 * O) * scale;
    const cyd = canvas.height / 2;
    const pad = 2 * s.dpr;
    const x0 = pad;
    const x1 = Wd - pad;
    const trackW = x1 - x0;
    const pxd = s.px * s.k * s.dpr;
    const sigma = 15 * scale;
    const amp = 5 * scale * O * (1 - 0.5 * Math.max(0, s.press.value));
    const halfAt = (x) => {
      let h = halfBase;
      if (styleName === "liquid") {
        const d = (x - pxd) / sigma;
        if (Math.abs(d) < 3) h += amp * Math.exp(-0.5 * d * d);
      }
      const r = halfBase;
      const lx = x - x0;
      if (lx < r) {
        const t = (r - lx) / r;
        h *= Math.sqrt(Math.max(0, 1 - t * t));
      } else if (lx > trackW - r) {
        const t = (lx - (trackW - r)) / r;
        h *= Math.sqrt(Math.max(0, 1 - t * t));
      }
      return h;
    };
    // Sample finely inside the end caps and every few pixels elsewhere.
    const samples = (from, to) => {
      const xs = [];
      const cap = halfBase;
      const capEnd = Math.min(to, x0 + cap);
      const capStart = Math.max(from, x1 - cap);
      for (let i = 0; i <= 16; i += 1) {
        const x = x0 + (cap * i) / 16;
        if (x >= from && x <= Math.min(to, capEnd)) xs.push(x);
      }
      for (let x = Math.max(from, capEnd); x < Math.min(to, capStart); x += 3 * s.dpr) xs.push(x);
      for (let i = 0; i <= 16; i += 1) {
        const x = capStart + ((x1 - capStart) * i) / 16;
        if (x >= Math.max(from, capStart) && x <= to) xs.push(x);
      }
      if (!xs.length || xs[xs.length - 1] < to) xs.push(to);
      if (xs[0] > from) xs.unshift(from);
      return xs;
    };
    const path = (from, to) => {
      const xs = samples(from, to);
      context.beginPath();
      xs.forEach((x, i) => {
        const y = cyd - halfAt(x);
        if (i === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      for (let i = xs.length - 1; i >= 0; i -= 1) context.lineTo(xs[i], cyd + halfAt(xs[i]));
      context.closePath();
    };
    const splitX = x0 + trackW * s.split;
    path(x0, x1);
    context.fillStyle = "rgba(255, 255, 255, 0.24)";
    context.fill();
    path(x0, splitX);
    context.fillStyle = "rgba(255, 255, 255, 0.94)";
    context.fill();
    if (styleName === "classic" && O > 0.01) {
      const r = 7.5 * scale * (0.6 + 0.4 * O);
      context.globalAlpha = O * s.resetFade;
      context.shadowColor = "rgba(0, 0, 0, 0.35)";
      context.shadowBlur = 6 * s.dpr;
      context.beginPath();
      context.arc(splitX, cyd, r, 0, Math.PI * 2);
      context.fillStyle = "#ffffff";
      context.fill();
      context.shadowBlur = 0;
    }
    context.globalAlpha = 1;
  };

  // Hover preview: follows the pointer like the app's thumbnail, colored by the film at that point.
  let lastPreviewText = -1;
  const writePreview = (now) => {
    const node = previewRef?.current;
    if (!node) return;
    const O = s.open.value;
    node.style.opacity = O > 0.01 ? String(Math.min(1, O * 1.15)) : "0";
    if (O <= 0.01) return;
    const x = Math.max(0, Math.min(s.W, s.px));
    node.style.setProperty("--px", `${(x * s.k).toFixed(1)}px`);
    if (now - lastPreviewText < 60) return;
    lastPreviewText = now;
    const b = Math.min(s.B - 1, Math.max(0, Math.floor((x / s.W) * s.B)));
    const covered = s.coverage * s.B > b;
    const c = covered ? [s.film.color[b * 3], s.film.color[b * 3 + 1], s.film.color[b * 3 + 2]] : NEUTRAL;
    node.style.setProperty("--pv", `rgb(${c.map((v) => ENCODE(v)).join(" ")})`);
    const label = node.lastElementChild;
    if (label) label.textContent = formatTime((x / s.W) * (variant === "repair" ? REPAIR_SECONDS : FILM_SECONDS));
  };

  // Side outputs written straight to the DOM so React does not re-render every frame.
  let lastSideWrite = -1;
  const writeSide = (now) => {
    if (now - lastSideWrite < 140) return;
    lastSideWrite = now;
    const seconds = variant === "repair" ? REPAIR_SECONDS : FILM_SECONDS;
    if (timeRef?.current) timeRef.current.textContent = formatTime(s.split * seconds);
    if (downloadRef?.current && downloadText) {
      downloadRef.current.textContent = s.download >= 1
        ? downloadText.done
        : downloadText.progress.replace("{p}", String(Math.floor(s.download * 100)));
      downloadRef.current.dataset.done = s.download >= 1 ? "true" : "false";
    }
    if (washRef?.current && s.film) {
      const b = Math.min(s.B - 1, Math.max(0, Math.floor(s.split * s.B)));
      const covered = s.coverage * s.B > b;
      const c = covered ? [s.film.color[b * 3], s.film.color[b * 3 + 1], s.film.color[b * 3 + 2]] : NEUTRAL;
      const rgb = c.map((v) => ENCODE(v)).join(" ");
      washRef.current.style.setProperty("--wash", `rgb(${rgb})`);
    }
    if (statusRef?.current && variant === "repair") {
      let state = "playing";
      if (s.download < 1 && s.split >= s.download - 0.02) state = "waiting";
      else {
        for (const band of REPAIR_BANDS) {
          if (s.split >= band.from && s.split < band.until) state = band.cls === 1 ? "partial" : "unavailable";
        }
      }
      if (state !== s.status) {
        s.status = state;
        statusRef.current.dataset.state = state;
      }
    }
  };

  s.grains = null;
  const ensureGrains = () => {
    if (!s.grains || s.grains.length !== s.n * 8) s.grains = new Float32Array(s.n * 8);
  };

  const render = (dt, now) => {
    if (!s.image || s.cssW <= 1) return true;
    ensureGrains();
    advance(dt);
    tweenStep(s.open, dt);
    tweenStep(s.press, dt);
    if (s.rebound === 1 && tweenDone(s.press)) {
      tweenGo(s.press, 0, 0.16);
      s.rebound = 0;
    }
    const styleName = variant === "film" ? styleRef.current : "starTrail";
    let converged;
    if (styleName === "starTrail") {
      converged = stepParticles(dt);
      drawParticles();
    } else {
      // Keep the particle state warm so switching back is seamless.
      converged = stepParticles(dt);
      drawRail(styleName);
      converged = converged && tweenDone(s.open) && tweenDone(s.press);
    }
    writeSide(now);
    writePreview(now);
    return converged;
  };

  const tick = (now) => {
    s.frame = 0;
    const dt = s.last ? Math.min(0.05, (now - s.last) / 1000) : 1 / 60;
    s.last = now;
    const converged = render(dt, now);
    const keepGoing = s.visible && s.documentVisible && (animating() || !converged);
    if (keepGoing) s.frame = requestAnimationFrame(tick);
    else s.last = 0;
  };

  function kick() {
    if (s.frame || !s.visible || !s.documentVisible) return;
    s.frame = requestAnimationFrame(tick);
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  const intersectionObserver = new IntersectionObserver(
    (entries) => {
      s.visible = entries.some((entry) => entry.isIntersecting);
      if (s.visible) kick();
    },
    { rootMargin: "80px 0px" },
  );
  intersectionObserver.observe(canvas);
  const onVisibility = () => {
    s.documentVisible = !document.hidden;
    if (s.documentVisible) kick();
  };
  const onMotionChange = (event) => {
    s.reduced = event.matches;
    if (!animating()) staticState();
    kick();
  };
  document.addEventListener("visibilitychange", onVisibility);
  reducedQuery.addEventListener?.("change", onMotionChange);
  canvas.addEventListener("pointerenter", onPointerEnter);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);

  resize();
  if (!finePointer) s.lastUserPointer = -1e9;

  return {
    kick,
    setPaused() {
      if (!animating()) staticState();
      kick();
    },
    destroy() {
      if (s.frame) cancelAnimationFrame(s.frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      reducedQuery.removeEventListener?.("change", onMotionChange);
      canvas.removeEventListener("pointerenter", onPointerEnter);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
    },
  };
}

export const DURATIONS = { film: FILM_SECONDS, repair: REPAIR_SECONDS };
export { formatTime };

export function StarTrail({
  variant = "film",
  timelineStyle = "starTrail",
  paused = false,
  washRef,
  statusRef,
  timeRef,
  downloadRef,
  downloadText,
  previewRef,
  label,
  className = "",
}) {
  const canvasRef = useRef(null);
  const styleRef = useRef(timelineStyle);
  const pausedRef = useRef(paused);
  const engineRef = useRef(null);

  useEffect(() => {
    styleRef.current = timelineStyle;
    engineRef.current?.kick();
  }, [timelineStyle]);

  useEffect(() => {
    pausedRef.current = paused;
    engineRef.current?.setPaused();
  }, [paused]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const engine = createEngine(canvas, {
      variant,
      styleRef,
      pausedRef,
      washRef,
      statusRef,
      timeRef,
      downloadRef,
      downloadText,
      previewRef,
    });
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [variant, washRef, statusRef, timeRef, downloadRef, downloadText, previewRef]);

  return <canvas aria-label={label} className={`star-trail ${className}`} ref={canvasRef} role="img" />;
}

export default StarTrail;
