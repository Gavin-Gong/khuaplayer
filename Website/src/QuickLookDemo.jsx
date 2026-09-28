import { Pause } from "@phosphor-icons/react";
import { KyotoScene } from "./KyotoScene.jsx";

// An illustration of Quick Look on an MKV: a Finder window with the file selected, the Space
// key, and the preview panel. The panel's controls follow Apps/Mac/QuickLook/Preview/
// PreviewControlsView.swift: play, back 10, forward 10, position, slider, duration.
const THUMBS = ["night", "dusk", "sea", "forest", "city", "snow"];

function SkipIcon({ back }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d={back ? "M11 5 6 9l5 4" : "M13 5l5 4-5 4"}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d={back ? "M6.5 9H14a5 5 0 1 1 0 10h-2" : "M17.5 9H10a5 5 0 1 0 0 10h2"}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
      <text x="12" y="16.6" textAnchor="middle">10</text>
    </svg>
  );
}

export function QuickLookDemo({ demo }) {
  return (
    <figure aria-label={demo.label} className="ql-stage" data-reveal role="img">
      <div aria-hidden="true" className="ql-finder">
        <div className="ql-finder-bar">
          <span className="ql-lights">
            <i />
            <i />
            <i />
          </span>
          <strong>{demo.folder}</strong>
        </div>
        <div className="ql-finder-body">
          <ul className="ql-sidebar">
            <li className="ql-sidebar-head">{demo.sidebarTitle}</li>
            {demo.sidebar.map((item, index) => (
              <li className={index === 2 ? "is-current" : undefined} key={item}>
                {item}
              </li>
            ))}
          </ul>
          <ul className="ql-files">
            {demo.files.map((name, index) => (
              <li className={index === 0 ? "is-selected" : undefined} key={name}>
                <span className={`ql-thumb is-${THUMBS[index % THUMBS.length]}`}>
                  <em>{name.split(".").pop().toUpperCase()}</em>
                </span>
                <span className="ql-name">{name}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div aria-hidden="true" className="ql-key">
        <kbd>{demo.key}</kbd>
      </div>

      <div aria-hidden="true" className="ql-panel">
        <div className="ql-panel-bar">
          <span className="ql-lights">
            <i />
            <i />
            <i />
          </span>
          <strong>{demo.files[0]}</strong>
          <span className="ql-open">{demo.openWith}</span>
        </div>
        <KyotoScene className="ql-video">
          <div className="ql-controls">
            <Pause weight="fill" />
            <SkipIcon back />
            <SkipIcon />
            <span className="ql-time">18:24</span>
            <span className="ql-slider">
              <span />
            </span>
            <span className="ql-time">42:18</span>
          </div>
        </KyotoScene>
      </div>
    </figure>
  );
}

export default QuickLookDemo;
