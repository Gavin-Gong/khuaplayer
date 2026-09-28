// The site's recurring demo footage: "kyoto-by-night", a painted night scene shared by the
// Quick Look, Brightness+ and Turbo illustrations. Children render on top of the painting.
export function KyotoScene({ className = "", clouds = false, children, style }) {
  return (
    <div className={`kyoto ${className}`} style={style}>
      {clouds ? (
        <>
          <span className="kyoto-cloud kyoto-cloud-a" />
          <span className="kyoto-cloud kyoto-cloud-b" />
        </>
      ) : null}
      <span className="kyoto-moon" />
      <span className="kyoto-hills" />
      <span className="kyoto-town" />
      <span className="kyoto-lights" />
      {children}
    </div>
  );
}

export default KyotoScene;
