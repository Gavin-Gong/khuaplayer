import { useEffect, useMemo, useRef } from 'react'

const TAU = Math.PI * 2
const DPR_CAP = 2
const MOBILE_DPR_CAP = 1.5
// One particle field runs through the whole page. Each section is a local shape of it:
//   hero      particles stream out of the app icon
//   silicon   they burst from the chip core
//   ambient   a sparse drift that carries the field through the demo sections
//   strands   parallel threads, one per format
//   compact   everything converges to a single point
//   privacy   held inside a circular boundary
//   open      released outward in every direction
//   vortex    drawn back into the app icon at the close
const PARAMETRIC_MODES = new Set(['privacy'])
const VALID_MODES = new Set(['hero', 'silicon', 'ambient', 'strands', 'compact', 'privacy', 'open', 'vortex'])

const MODE_SETTINGS = {
  hero: { particles: 900, speed: 0.9, alpha: 1 },
  silicon: { particles: 520, speed: 0.95, alpha: 1 },
  ambient: { particles: 240, speed: 0.8, alpha: 0.62 },
  strands: { particles: 560, speed: 0.9, alpha: 0.9 },
  compact: { particles: 420, speed: 1.1, alpha: 1 },
  privacy: { particles: 420, speed: 0.68, alpha: 1 },
  open: { particles: 560, speed: 0.8, alpha: 1 },
  vortex: { particles: 820, speed: 0.8, alpha: 1 },
}

// Where the hero stream starts: the app icon's position in the hero.
const HERO_SOURCE = [0.87, 0.66]
const STRAND_COUNT = 7

// Rendering: three depth layers, a life envelope, speed-linked brightness, tapered tails,
// and soft round heads drawn from pre-rendered sprites.
const DEPTHS = [
  // far: small, faint, soft, slow, drifts down slightly as the page scrolls
  { share: 0.5, speed: 0.55, size: 0.75, alpha: 0.34, tail: 0.75, glow: 3.4, scroll: 0.05, pointer: 3 },
  // mid: the body of the field
  { share: 0.38, speed: 1, size: 1, alpha: 0.72, tail: 1.05, glow: 2.3, scroll: -0.05, pointer: 8 },
  // near: few, large, bright, fast, rises quickly as the page scrolls
  { share: 0.12, speed: 1.5, size: 1.75, alpha: 0.95, tail: 1.45, glow: 2.6, scroll: -0.12, pointer: 18 },
]
const LIGHT_RAMP = [[0, 46, 235], [0, 118, 255], [0, 196, 255]]
// Dark and blue sections draw additively, so the ramp runs brighter: periwinkle to cyan to ice.
const DARK_RAMP = [[120, 150, 255], [60, 205, 255], [205, 248, 255]]
const RAMP_STEPS = 12
const ACCENT_RED = [255, 66, 51]

function rampColor(ramp, t) {
  const scaled = clamp(t, 0, 1) * (ramp.length - 1)
  const index = Math.min(ramp.length - 2, Math.floor(scaled))
  const local = scaled - index
  return ramp[index].map((value, channel) => Math.round(value + (ramp[index + 1][channel] - value) * local))
}

function buildSprites(dark, dpr) {
  const ramp = dark ? DARK_RAMP : LIGHT_RAMP
  const colors = []
  for (let step = 0; step < RAMP_STEPS; step += 1) colors.push(rampColor(ramp, step / (RAMP_STEPS - 1)))
  colors.push(ACCENT_RED)
  const size = Math.round(40 * dpr)
  return colors.map(([r, g, b]) => {
    const sprite = document.createElement('canvas')
    sprite.width = size
    sprite.height = size
    const context = sprite.getContext('2d')
    const half = size / 2
    const gradient = context.createRadialGradient(half, half, 0, half, half, half)
    gradient.addColorStop(0, `rgba(${r},${g},${b},1)`)
    gradient.addColorStop(0.16, `rgba(${r},${g},${b},0.92)`)
    gradient.addColorStop(0.42, `rgba(${r},${g},${b},0.26)`)
    gradient.addColorStop(1, `rgba(${r},${g},${b},0)`)
    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)
    return { image: sprite, stroke: `rgb(${r},${g},${b})` }
  })
}

const smoothstep = (value) => {
  const t = clamp(value, 0, 1)
  return t * t * (3 - 2 * t)
}

const TAIL_SCALE = { compact: 3.2, silicon: 2.4 }

function drawParticles(context, state, view, opacity = 1) {
  const { sprites, width, scrollY, pointerX, pointerY } = view
  const tailScale = TAIL_SCALE[view.mode] ?? 2.1
  // On dark grounds the same particle reads far weaker, so it is brighter, larger and longer-tailed.
  const boost = view.dark ? 1.55 : 1
  const glowScale = view.dark ? 1.3 : 1
  const tailBack = view.dark ? 0.32 : 0.2
  const tailFront = view.dark ? 0.8 : 0.55
  const speedRef = Math.max(1, width * 0.0042)
  context.save()
  context.lineCap = 'round'
  if (view.dark) context.globalCompositeOperation = 'lighter'
  let lastStroke = ''
  const order = state.order
  for (let k = 0; k < order.length; k += 1) {
    const index = order[k]
    if (state.age[index] < 0.035) continue
    const depth = DEPTHS[state.depth[index]]
    const envelope = smoothstep(state.age[index] / 0.9)
      * smoothstep((state.life[index] - state.age[index]) / 1.3)
    if (envelope <= 0.01) continue
    const dx = state.x[index] - state.previousX[index]
    const dy = state.y[index] - state.previousY[index]
    const speed = clamp(Math.hypot(dx, dy) / speedRef, 0, 1.4)
    const alpha = Math.min(1, opacity * view.alphaScale * envelope * depth.alpha * boost * (0.5 + 0.5 * Math.min(1, speed)))
    if (alpha <= 0.01) continue

    const offsetX = pointerX * depth.pointer
    const offsetY = scrollY * depth.scroll + pointerY * depth.pointer
    const x = state.x[index] + offsetX
    const y = state.y[index] + offsetY
    const size = state.size[index] * depth.size
    const sprite = sprites[state.color[index]]

    // Tapered tail: a faint back half and a stronger front half.
    const extension = (tailScale + state.size[index] * 0.8) * depth.tail
    const tailX = x - dx * extension
    const tailY = y - dy * extension
    const midX = (x + tailX) / 2
    const midY = (y + tailY) / 2
    if (sprite.stroke !== lastStroke) {
      context.strokeStyle = sprite.stroke
      lastStroke = sprite.stroke
    }
    context.lineWidth = Math.max(0.4, size * 0.55)
    context.globalAlpha = alpha * tailBack
    context.beginPath()
    context.moveTo(tailX, tailY)
    context.lineTo(midX, midY)
    context.stroke()
    context.globalAlpha = alpha * tailFront
    context.beginPath()
    context.moveTo(midX, midY)
    context.lineTo(x, y)
    context.stroke()

    // Soft round head.
    const radius = size * depth.glow * glowScale * (0.85 + 0.25 * Math.min(1, speed))
    context.globalAlpha = alpha
    context.drawImage(sprite.image, x - radius, y - radius, radius * 2, radius * 2)
  }
  context.restore()
}

const DEFAULT_ACCENTS = [[0.055, 0.12], [0.945, 0.88]]
const COMPACT_ACCENTS = [[0.055, 0.18], [0.945, 0.82]]
const VORTEX_ACCENTS = [[0.045, 0.12], [0.955, 0.86], [0.5, 0.92]]

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function hashString(value) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function mulberry32(seed) {
  let value = seed >>> 0
  return () => {
    value += 0x6d2b79f5
    let result = value
    result = Math.imul(result ^ (result >>> 15), result | 1)
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61)
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296
  }
}

// Only the privacy field follows a fixed path: concentric circles held inside a boundary.
function pathPoint(mode, phase, lane, auxiliary, width, height, output) {
  const radius = Math.min(width, height) * 0.36 * (0.55 + lane * 0.5)
    * (1 + Math.sin(phase * 3 + auxiliary) * 0.03)
  output[0] = width * 0.5 + Math.cos(phase) * radius * 1.12
  output[1] = height * 0.5 + Math.sin(phase) * radius
}

function createParticleState(mode, count, width, height, seed) {
  const random = mulberry32(seed)
  const state = {
    count,
    x: new Float32Array(count),
    y: new Float32Array(count),
    previousX: new Float32Array(count),
    previousY: new Float32Array(count),
    age: new Float32Array(count),
    life: new Float32Array(count),
    speed: new Float32Array(count),
    phase: new Float32Array(count),
    lane: new Float32Array(count),
    auxiliary: new Float32Array(count),
    size: new Float32Array(count),
    tint: new Uint8Array(count),
    fieldScratch: new Float32Array(2),
    targetScratch: new Float32Array(2),
    depth: new Uint8Array(count),
    color: new Uint8Array(count),
    order: null,
    random,
  }

  for (let index = 0; index < count; index += 1) {
    const colorChoice = random()
    state.tint[index] = colorChoice < 0.72
      ? 0
      : colorChoice < 0.91
        ? 1
        : colorChoice < 0.985
          ? 2
          : 3
    state.size[index] = 0.45 + random() * 1.15
    const depthRoll = random()
    state.depth[index] = depthRoll < DEPTHS[0].share ? 0 : depthRoll < DEPTHS[0].share + DEPTHS[1].share ? 1 : 2
    // Mostly cobalt, thinning toward cyan; the rare vermilion accents stay.
    state.color[index] = state.tint[index] === 3
      ? RAMP_STEPS
      : Math.min(RAMP_STEPS - 1, Math.floor(Math.pow(random(), 1.35) * RAMP_STEPS))
    state.speed[index] = 0.64 + random() * 0.82
    state.life[index] = 5.5 + random() * 10
    state.phase[index] = random() * TAU
    state.auxiliary[index] = random() * TAU

    state.lane[index] = mode === 'privacy' ? 0.16 + random() * 0.88 : random()

    resetParticle(state, index, mode, width, height, true)
  }

  // Far layers first, grouped by color so stroke state changes rarely.
  state.order = Array.from({ length: count }, (_, index) => index)
    .sort((a, b) => state.depth[a] - state.depth[b] || state.color[a] - state.color[b])

  return state
}

function resetParticle(state, index, mode, width, height, initial = false) {
  const random = state.random
  const minDimension = Math.min(width, height)
  let x = 0
  let y = 0

  if (PARAMETRIC_MODES.has(mode)) {
    if (!initial) {
      state.phase[index] = random() * TAU
      state.auxiliary[index] = random() * TAU
    }
    const point = [0, 0]
    pathPoint(
      mode,
      state.phase[index],
      state.lane[index],
      state.auxiliary[index],
      width,
      height,
      point,
    )
    x = point[0] + (random() - 0.5) * minDimension * 0.012
    y = point[1] + (random() - 0.5) * minDimension * 0.012
  } else if (mode === 'silicon') {
    const angle = random() * TAU
    const radius = initial
      ? minDimension * (0.07 + random() * 0.56)
      : minDimension * (0.055 + random() * 0.075)
    x = width * 0.55 + Math.cos(angle) * radius
    y = height * 0.52 + Math.sin(angle) * radius
  } else if (mode === 'compact') {
    x = initial ? random() * width * 0.84 : -width * (0.02 + random() * 0.08)
    const spread = (1 - clamp(x / (width * 0.86), 0, 1)) * height * 0.42
    y = height * 0.5 + (random() - 0.5) * spread * 2
  } else if (mode === 'hero' || mode === 'open') {
    const [sx, sy] = mode === 'hero' ? HERO_SOURCE : [0.5, 0.5]
    const angle = random() * TAU
    const radius = initial
      ? Math.max(width, height) * Math.sqrt(random()) * 0.8
      : minDimension * (0.02 + random() * 0.07)
    x = width * sx + Math.cos(angle) * radius
    y = height * sy + Math.sin(angle) * radius * 0.8
  } else if (mode === 'vortex') {
    const angle = random() * TAU
    const radius = Math.max(width, height) * (initial ? 0.08 + random() * 0.6 : 0.62 + random() * 0.1)
    x = width * 0.5 + Math.cos(angle) * radius
    y = height * 0.5 + Math.sin(angle) * radius * 0.7
  } else if (mode === 'strands') {
    const strand = Math.floor(state.lane[index] * STRAND_COUNT) % STRAND_COUNT
    x = initial ? random() * width : -width * (0.02 + random() * 0.06)
    y = height * (0.16 + (strand / (STRAND_COUNT - 1)) * 0.68) + (random() - 0.5) * height * 0.018
  } else if (initial) {
    x = random() * width
    y = random() * height
  } else if (mode === 'ambient') {
    x = -width * (0.01 + random() * 0.05)
    y = random() * height
  } else {
    const edge = random()
    if (edge < 0.54) {
      x = -width * 0.04
      y = random() * height
    } else if (edge < 0.78) {
      x = random() * width
      y = -height * 0.04
    } else {
      x = width * (0.2 + random() * 0.8)
      y = height * 1.04
    }
  }

  state.x[index] = x
  state.y[index] = y
  state.previousX[index] = x
  state.previousY[index] = y
  state.age[index] = initial ? random() * state.life[index] : 0
}

function addVortex(nx, ny, centerX, centerY, strength, output) {
  const dx = nx - centerX
  const dy = ny - centerY
  const denominator = 0.024 + dx * dx + dy * dy
  output[0] += (-dy * strength) / denominator
  output[1] += (dx * strength) / denominator
}

function sampleVectorField(mode, x, y, width, height, time, output) {
  const nx = x / width
  const ny = y / height
  output[0] = 0
  output[1] = 0

  if (mode === 'silicon') {
    const centerX = width * 0.55
    const centerY = height * 0.52
    const dx = x - centerX
    const dy = y - centerY
    const distance = Math.max(8, Math.hypot(dx, dy))
    const pulse = 1 + Math.sin(time * 1.6 + distance * 0.018) * 0.08
    const speed = Math.min(width, height) * (0.085 + 18 / (distance + 120)) * pulse
    output[0] = (dx / distance) * speed
    output[1] = (dy / distance) * speed
    return
  }

  if (mode === 'compact') {
    const targetY = height * 0.5
    output[0] = width * (0.18 + (1 - clamp(nx, 0, 1)) * 0.12)
    output[1] = (targetY - y) * 1.32
    return
  }

  if (mode === 'hero' || mode === 'open') {
    const [sx, sy] = mode === 'hero' ? HERO_SOURCE : [0.5, 0.5]
    const dx = x - width * sx
    const dy = (y - height * sy) / 0.8
    const distance = Math.max(6, Math.hypot(dx, dy))
    const base = Math.min(width, height) * (mode === 'hero' ? 0.1 : 0.075)
    const swirl = mode === 'hero' ? 0.42 : 0.18
    output[0] = (dx / distance - (dy / distance) * swirl) * base
    output[1] = (dy / distance + (dx / distance) * swirl) * base * 0.8
    return
  }

  if (mode === 'vortex') {
    const dx = x - width * 0.5
    const dy = (y - height * 0.5) / 0.7
    const distance = Math.max(6, Math.hypot(dx, dy))
    const base = Math.min(width, height) * (0.05 + (distance / Math.max(width, height)) * 0.16)
    output[0] = (-dx / distance * 0.55 - dy / distance) * base
    output[1] = (-dy / distance * 0.55 + dx / distance) * base * 0.7
    return
  }

  if (mode === 'strands') {
    output[0] = width * 0.07
    output[1] = Math.sin(time * 0.6 + nx * 7 + ny * 13) * height * 0.012
    return
  }

  if (mode === 'ambient') {
    output[0] = width * 0.035
    output[1] = Math.sin(time * 0.25 + nx * 4 + ny * 3) * height * 0.012
    return
  }

  output[0] = 0.055
  output[1] = Math.sin(time * 0.28 + nx * 5) * 0.004
  addVortex(nx, ny, 0.67, 0.43, 0.019, output)
  addVortex(nx, ny, 0.42, 0.78, -0.011, output)
  output[0] = (output[0] + (0.52 - ny) * 0.018) * width
  output[1] = (output[1] + (nx - 0.35) * 0.004) * height
}

function applyPointerForce(state, index, pointer, width, height, delta) {
  if (!pointer.active) return
  const dx = state.x[index] - pointer.x
  const dy = state.y[index] - pointer.y
  const minDimension = Math.min(width, height)
  const radius = clamp(minDimension * 0.24, 72, 168)
  const distanceSquared = dx * dx + dy * dy
  if (distanceSquared >= radius * radius || distanceSquared < 0.01) return

  const distance = Math.sqrt(distanceSquared)
  const force = 1 - distance / radius
  const push = minDimension * 0.82 * force * force * delta
  const swirl = minDimension * 0.2 * force * delta
  state.x[index] += (dx / distance) * push - (dy / distance) * swirl
  state.y[index] += (dy / distance) * push + (dx / distance) * swirl
}

function advanceParticles(state, mode, width, height, delta, elapsed, pointer) {
  const field = state.fieldScratch
  const target = state.targetScratch
  const setting = MODE_SETTINGS[mode]
  const isParametric = PARAMETRIC_MODES.has(mode)

  for (let index = 0; index < state.count; index += 1) {
    state.previousX[index] = state.x[index]
    state.previousY[index] = state.y[index]
    state.age[index] += delta

    if (isParametric) {
      const direction = index % 11 === 0 ? -1 : 1
      const pathRate = 0.32
      state.phase[index] += delta * state.speed[index] * pathRate * direction * DEPTHS[state.depth[index]].speed
      pathPoint(
        mode,
        state.phase[index],
        state.lane[index],
        state.auxiliary[index],
        width,
        height,
        target,
      )
      const follow = clamp(delta * 12, 0, 1)
      state.x[index] += (target[0] - state.x[index]) * follow
      state.y[index] += (target[1] - state.y[index]) * follow
    } else {
      sampleVectorField(mode, state.x[index], state.y[index], width, height, elapsed, field)
      const depthSpeed = DEPTHS[state.depth[index]].speed
      state.x[index] += field[0] * delta * state.speed[index] * setting.speed * depthSpeed
      state.y[index] += field[1] * delta * state.speed[index] * setting.speed * depthSpeed
    }

    applyPointerForce(state, index, pointer, width, height, delta)

    if (isParametric) continue

    const margin = Math.max(28, Math.min(width, height) * 0.08)
    const outOfBounds = state.x[index] < -margin
      || state.x[index] > width + margin
      || state.y[index] < -margin
      || state.y[index] > height + margin
    const reachedCompactFocus = mode === 'compact' && state.x[index] > width * 0.875
    const reachedVortexCenter = mode === 'vortex'
      && Math.hypot(state.x[index] - width * 0.5, state.y[index] - height * 0.5) < Math.min(width, height) * 0.04
    const farFromSilicon = mode === 'silicon'
      && Math.hypot(state.x[index] - width * 0.55, state.y[index] - height * 0.52)
        > Math.max(width, height) * 0.78

    if (
      outOfBounds
      || reachedCompactFocus
      || reachedVortexCenter
      || farFromSilicon
      || state.age[index] > state.life[index]
    ) {
      resetParticle(state, index, mode, width, height)
    }
  }
}

// The only pre-drawn elements left are the two focal glows; every shape is drawn by particles.
function drawBackdrop(context, mode, width, height, dark) {
  const minDimension = Math.min(width, height)
  context.save()
  if (mode === 'silicon') {
    const centerX = width * 0.55
    const centerY = height * 0.52
    const coreSize = minDimension * 0.15
    const glow = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, coreSize * 0.72)
    glow.addColorStop(0, 'rgba(255,255,255,0.95)')
    glow.addColorStop(0.22, 'rgba(0,226,255,0.72)')
    glow.addColorStop(0.62, 'rgba(0,55,255,0.26)')
    glow.addColorStop(1, 'rgba(0,55,255,0)')
    context.fillStyle = glow
    context.fillRect(centerX - coreSize, centerY - coreSize, coreSize * 2, coreSize * 2)
  } else if (mode === 'compact') {
    const focusX = width * 0.87
    const focusY = height * 0.5
    const glow = context.createRadialGradient(focusX, focusY, 0, focusX, focusY, 18)
    glow.addColorStop(0, dark ? '#ffffff' : '#0037ff')
    glow.addColorStop(0.25, '#00dcff')
    glow.addColorStop(1, 'rgba(0,55,255,0)')
    context.fillStyle = glow
    context.beginPath()
    context.arc(focusX, focusY, 18, 0, TAU)
    context.fill()
  }
  context.restore()
}

function drawRegistrationAccents(context, mode, width, height, dark) {
  const positions = mode === 'compact'
    ? COMPACT_ACCENTS
    : mode === 'vortex'
      ? VORTEX_ACCENTS
      : DEFAULT_ACCENTS

  context.save()
  context.strokeStyle = dark ? 'rgba(255, 86, 68, 0.9)' : 'rgba(255, 66, 51, 0.72)'
  context.fillStyle = context.strokeStyle
  context.lineWidth = 0.72

  for (const [xRatio, yRatio] of positions) {
    const x = width * xRatio
    const y = height * yRatio
    const radius = Math.max(3, Math.min(width, height) * 0.009)
    context.beginPath()
    context.moveTo(x - radius, y)
    context.lineTo(x + radius, y)
    context.moveTo(x, y - radius)
    context.lineTo(x, y + radius)
    context.stroke()
    context.fillRect(x - 0.75, y - 0.75, 1.5, 1.5)
  }

  context.restore()
}

function buildBackdrop(mode, width, height, dpr, dark) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * dpr))
  canvas.height = Math.max(1, Math.round(height * dpr))
  const context = canvas.getContext('2d', { alpha: true })
  if (!context) return null
  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  context.clearRect(0, 0, width, height)
  drawBackdrop(context, mode, width, height, dark)
  return canvas
}

/**
 * Decorative, responsive Canvas2D velocity field used throughout the Khua site.
 * The parent element controls layout; the canvas fills its available box.
 */
export function ParticleField({
  mode = 'hero',
  dark = false,
  paused = false,
  className = '',
  style,
}) {
  const canvasRef = useRef(null)
  const resolvedMode = VALID_MODES.has(mode) ? mode : 'hero'
  const canvasStyle = useMemo(() => ({
    display: 'block',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    ...style,
  }), [style])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const context = canvas.getContext('2d', {
      alpha: true,
      desynchronized: true,
    })
    if (!context) return undefined

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const coarsePointerQuery = window.matchMedia('(pointer: coarse)')
    const runtime = {
      width: 0,
      height: 0,
      dpr: 1,
      particles: null,
      backdrop: null,
      reducedMotion: motionQuery.matches,
      paused,
      intersecting: false,
      documentVisible: !document.hidden,
      animationFrame: 0,
      running: false,
      lastFrame: performance.now(),
      elapsed: 0,
      sprites: null,
      parallax: { x: 0, y: 0 },
      pointer: {
        active: false,
        x: 0,
        y: 0,
        targetX: 0,
        targetY: 0,
      },
    }

    // Scroll and pointer offsets for the depth layers; the pointer offset eases back to rest.
    const particleView = () => {
      const pointer = runtime.pointer
      const tx = pointer.active ? pointer.x / runtime.width - 0.5 : 0
      const ty = pointer.active ? pointer.y / runtime.height - 0.5 : 0
      runtime.parallax.x += (tx - runtime.parallax.x) * 0.06
      runtime.parallax.y += (ty - runtime.parallax.y) * 0.06
      return {
        sprites: runtime.sprites,
        dark,
        width: runtime.width,
        mode: resolvedMode,
        alphaScale: MODE_SETTINGS[resolvedMode].alpha,
        scrollY: runtime.reducedMotion || runtime.paused
          ? 0
          : clamp(-canvas.getBoundingClientRect().top, -window.innerHeight, runtime.height),
        pointerX: runtime.parallax.x,
        pointerY: runtime.parallax.y,
      }
    }

    const renderFrame = (opacity = 1) => {
      if (!runtime.particles || runtime.width <= 0 || runtime.height <= 0) return
      context.clearRect(0, 0, runtime.width, runtime.height)
      if (runtime.backdrop) {
        context.drawImage(
          runtime.backdrop,
          0,
          0,
          runtime.backdrop.width,
          runtime.backdrop.height,
          0,
          0,
          runtime.width,
          runtime.height,
        )
      }
      drawParticles(context, runtime.particles, particleView(), opacity)
      if (resolvedMode !== 'ambient') drawRegistrationAccents(context, resolvedMode, runtime.width, runtime.height, dark)
    }

    const renderStatic = () => {
      if (!runtime.particles) return
      context.clearRect(0, 0, runtime.width, runtime.height)
      if (runtime.backdrop) {
        context.drawImage(
          runtime.backdrop,
          0,
          0,
          runtime.backdrop.width,
          runtime.backdrop.height,
          0,
          0,
          runtime.width,
          runtime.height,
        )
      }
      const staticPointer = { active: false, x: 0, y: 0 }
      for (let pass = 0; pass < 18; pass += 1) {
        runtime.elapsed += 0.04
        advanceParticles(runtime.particles, resolvedMode, runtime.width, runtime.height, 0.04, runtime.elapsed, staticPointer)
      }
      drawParticles(context, runtime.particles, particleView())
      if (resolvedMode !== 'ambient') drawRegistrationAccents(context, resolvedMode, runtime.width, runtime.height, dark)
    }

    const stop = () => {
      runtime.running = false
      if (runtime.animationFrame) cancelAnimationFrame(runtime.animationFrame)
      runtime.animationFrame = 0
    }

    const canAnimate = () => !runtime.reducedMotion
      && !runtime.paused
      && runtime.intersecting
      && runtime.documentVisible
      && runtime.particles

    const tick = (now) => {
      if (!canAnimate()) {
        runtime.running = false
        runtime.animationFrame = 0
        return
      }

      const delta = clamp((now - runtime.lastFrame) / 1000, 0.001, 0.034)
      runtime.lastFrame = now
      runtime.elapsed += delta
      runtime.pointer.x += (runtime.pointer.targetX - runtime.pointer.x) * 0.18
      runtime.pointer.y += (runtime.pointer.targetY - runtime.pointer.y) * 0.18

      advanceParticles(
        runtime.particles,
        resolvedMode,
        runtime.width,
        runtime.height,
        delta,
        runtime.elapsed,
        runtime.pointer,
      )
      renderFrame()
      runtime.animationFrame = requestAnimationFrame(tick)
    }

    const start = () => {
      if (!canAnimate() || runtime.running) return
      runtime.running = true
      runtime.lastFrame = performance.now()
      runtime.animationFrame = requestAnimationFrame(tick)
    }

    const resize = () => {
      const bounds = canvas.getBoundingClientRect()
      const width = Math.max(1, Math.round(bounds.width))
      const height = Math.max(1, Math.round(bounds.height))
      const mobile = width < 680 || coarsePointerQuery.matches
      const dpr = Math.min(
        window.devicePixelRatio || 1,
        mobile ? MOBILE_DPR_CAP : DPR_CAP,
      )

      if (
        runtime.width === width
        && runtime.height === height
        && runtime.dpr === dpr
      ) return

      runtime.width = width
      runtime.height = height
      runtime.dpr = dpr
      canvas.width = Math.max(1, Math.round(width * dpr))
      canvas.height = Math.max(1, Math.round(height * dpr))
      context.setTransform(dpr, 0, 0, dpr, 0, 0)

      const areaScale = clamp(
        Math.sqrt((width * height) / (980 * 620)),
        0.62,
        1.34,
      )
      const particleCount = clamp(
        Math.round(MODE_SETTINGS[resolvedMode].particles * areaScale * (mobile ? 0.52 : 1)),
        120,
        1100,
      )
      const seed = hashString(`${resolvedMode}:${Math.round(width / 24)}:${Math.round(height / 24)}`)
      runtime.particles = createParticleState(
        resolvedMode,
        particleCount,
        width,
        height,
        seed,
      )
      runtime.backdrop = buildBackdrop(resolvedMode, width, height, dpr, dark)
      runtime.sprites = buildSprites(dark, dpr)
      runtime.pointer.x = width * 0.5
      runtime.pointer.y = height * 0.5
      runtime.pointer.targetX = runtime.pointer.x
      runtime.pointer.targetY = runtime.pointer.y

      if (runtime.reducedMotion || runtime.paused) {
        renderStatic()
      } else {
        const idlePointer = { active: false, x: 0, y: 0 }
        for (let pass = 0; pass < 5; pass += 1) {
          advanceParticles(
            runtime.particles,
            resolvedMode,
            width,
            height,
            0.028,
            runtime.elapsed,
            idlePointer,
          )
        }
        renderFrame()
        start()
      }
    }

    const handlePointerMove = (event) => {
      if (runtime.reducedMotion || runtime.paused || !runtime.intersecting) {
        runtime.pointer.active = false
        return
      }
      const bounds = canvas.getBoundingClientRect()
      const inside = event.clientX >= bounds.left
        && event.clientX <= bounds.right
        && event.clientY >= bounds.top
        && event.clientY <= bounds.bottom
      runtime.pointer.active = inside
      if (!inside) return
      runtime.pointer.targetX = event.clientX - bounds.left
      runtime.pointer.targetY = event.clientY - bounds.top
    }

    const deactivatePointer = () => {
      runtime.pointer.active = false
    }

    const handleMotionPreference = (event) => {
      runtime.reducedMotion = event.matches
      if (runtime.reducedMotion) {
        stop()
        renderStatic()
      } else {
        renderFrame()
        start()
      }
    }

    const handleVisibility = () => {
      runtime.documentVisible = !document.hidden
      if (runtime.documentVisible) start()
      else stop()
    }

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)

    const intersectionObserver = new IntersectionObserver((entries) => {
      runtime.intersecting = entries.some((entry) => entry.isIntersecting)
      if (runtime.intersecting) start()
      else stop()
    }, { rootMargin: '120px 0px', threshold: 0.01 })
    intersectionObserver.observe(canvas)

    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    window.addEventListener('pointercancel', deactivatePointer, { passive: true })
    window.addEventListener('blur', deactivatePointer)
    document.addEventListener('visibilitychange', handleVisibility)
    if (motionQuery.addEventListener) motionQuery.addEventListener('change', handleMotionPreference)
    else motionQuery.addListener(handleMotionPreference)

    resize()

    return () => {
      stop()
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointercancel', deactivatePointer)
      window.removeEventListener('blur', deactivatePointer)
      document.removeEventListener('visibilitychange', handleVisibility)
      if (motionQuery.removeEventListener) motionQuery.removeEventListener('change', handleMotionPreference)
      else motionQuery.removeListener(handleMotionPreference)
    }
  }, [resolvedMode, dark, paused])

  return (
    <canvas
      ref={canvasRef}
      className={`particle-field ${className}`.trim()}
      style={canvasStyle}
      data-particle-mode={resolvedMode}
      aria-hidden="true"
    />
  )
}

export default ParticleField
