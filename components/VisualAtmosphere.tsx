export function VisualAtmosphere() {
  return (
    <div
      className="visual-atmosphere"
      data-renderer="local-css"
      aria-hidden="true"
    >
      <div className="visual-atmosphere__glow" />
      <div className="visual-atmosphere__mesh visual-atmosphere__mesh--far" />
      <div className="visual-atmosphere__mesh visual-atmosphere__mesh--near" />
      <div className="visual-atmosphere__particles" />
    </div>
  );
}
