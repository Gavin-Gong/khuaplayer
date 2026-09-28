import { useEffect, useState } from "react";
import { parseCatalog } from "../cloudflare/catalog.ts";
import "./releases.css";

function useReleases() {
  const [state, setState] = useState({ catalog: null, error: false });
  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    fetch("/api/releases.json", { signal: controller.signal, cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Release information unavailable");
        return response.json();
      })
      .then((value) => setState({ catalog: parseCatalog(value), error: false }))
      .catch(() => setState({ catalog: null, error: true }))
      .finally(() => window.clearTimeout(timeout));
    return () => { controller.abort(); window.clearTimeout(timeout); };
  }, []);
  return state;
}

export function ReleaseBadge({ locale }) {
  const { catalog } = useReleases();
  const latest = catalog?.releases[0];
  return (
    <a className="release-badge" href="/releases">
      {latest ? `v${latest.version} · ` : ""}{locale === "zh" ? "版本记录" : "Release history"}
    </a>
  );
}

export function Releases() {
  const [locale, setLocale] = useState(() => {
    try { return localStorage.getItem("khua-site-locale") === "zh" ? "zh" : "en"; }
    catch { return "en"; }
  });
  const { catalog, error } = useReleases();
  const zh = locale === "zh";
  useEffect(() => {
    document.title = `${zh ? "版本记录" : "Release history"} — Khua Player`;
    document.documentElement.lang = zh ? "zh-Hans" : "en";
    try { localStorage.setItem("khua-site-locale", locale); } catch { /* Storage is optional. */ }
  }, [locale, zh]);
  return (
    <div className={`releases-page locale-${locale}`}>
      <header className="releases-header">
        <a href="/" className="wordmark"><img src="/assets/khua-icon-32.png" alt="" width="32" height="32" />Khua Player</a>
        <button className="language-control" onClick={() => setLocale(zh ? "en" : "zh")} type="button">{zh ? "English" : "简体中文"}</button>
      </header>
      <main className="releases-main">
        <p className="eyebrow">Khua Player / macOS</p>
        <h1>{zh ? "版本记录。" : "Release history."}</h1>
        <p className="releases-intro">{zh
          ? "下载最新版本，或查看过往更新。每个安装包均经过 Developer ID 签名与 Apple 公证。"
          : "Get the latest version or explore previous releases. Every download is Developer ID signed and notarized by Apple."}</p>
        <p className="releases-note">{zh
          ? "0.6.0 起支持 App 内检查更新。更早的版本请先手动安装一次新版。历史版本仅供需要时使用，降级可能无法读取新版设置。"
          : "In-app updates are available starting with 0.6.0. Earlier versions require one manual installation. Older downloads are provided for reference; downgrading may not preserve newer settings."}</p>
        {!catalog && <p role="status">{error
          ? (zh ? "暂时无法获取版本信息，请稍后刷新。" : "Release information is unavailable. Please refresh in a moment.")
          : (zh ? "正在获取版本信息…" : "Loading releases…")}</p>}
        {catalog?.releases.map((release, index) => (
          <article className="release-entry" key={release.build}>
            <div className="release-title"><h2>{release.version}</h2>{index === 0 && <span className="release-latest">{zh ? "最新版" : "Latest"}</span>}</div>
            <p className="release-meta">
              {new Intl.DateTimeFormat(zh ? "zh-CN" : "en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(release.releasedAt))}
              {` · Build ${release.build} · macOS ${release.minimumSystemVersion}+ · Apple silicon · ${(release.sizeBytes / 1000000).toFixed(1)} MB`}
            </p>
            <ul className="release-notes">{release.notes[locale].map((note) => <li key={note}>{note}</li>)}</ul>
            <a className="button button-primary" href={release.url}>{zh ? "下载 Khua Player" : "Download Khua Player"} {release.version}</a>
            <details className="release-checksum"><summary>SHA-256</summary><code>{release.sha256}</code></details>
          </article>
        ))}
      </main>
      <footer className="releases-bottom"><a href="/">{zh ? "← 返回官网" : "← Back to Khua Player"}</a></footer>
    </div>
  );
}
