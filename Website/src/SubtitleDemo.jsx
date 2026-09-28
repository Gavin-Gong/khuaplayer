import { useEffect, useRef, useState } from "react";

// A painted video frame showing bilingual subtitles the way Khua lays them out:
// the translation above the original line, with the app's own progress wording.
const CUE_MS = 3400;
const TOTAL_SECONDS = 2538;
const READY_START = 1068;
const READY_STEP = 23;
const READY_STEPS = 24;

function clock(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function SubtitleDemo({ demo, paused }) {
  const [tick, setTick] = useState(0);
  const [visible, setVisible] = useState(false);
  const ref = useRef(null);
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const active = visible && !paused && !reduced;
  const cues = demo.cues;

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      threshold: 0.2,
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    const id = window.setInterval(() => setTick((current) => current + 1), CUE_MS);
    return () => window.clearInterval(id);
  }, [active]);

  const cue = cues[tick % cues.length];
  const ready = READY_START + (tick % READY_STEPS) * READY_STEP;
  const percent = Math.round((ready / TOTAL_SECONDS) * 100);
  const status = demo.status.replace("{p}", String(percent)).replace("{t}", clock(ready));

  return (
    <figure aria-label={demo.label} className="subtitle-frame" data-reveal ref={ref} role="img">
      <div aria-hidden="true" className="subtitle-scene">
        <span className="scene-sun" />
        <span className="scene-ridge scene-ridge-far" />
        <span className="scene-ridge scene-ridge-near" />
        <span className="scene-vignette" />
      </div>
      <div aria-hidden="true" className={`subtitle-status ${active ? "is-live" : ""}`}>
        <span className="status-bars">
          <i />
          <i />
          <i />
          <i />
        </span>
        <span>{status}</span>
      </div>
      <div aria-hidden="true" className="subtitle-cue" key={tick}>
        <span className="cue-translation">{cue.translation}</span>
        <span className="cue-original">{cue.original}</span>
      </div>
    </figure>
  );
}

export default SubtitleDemo;
