export function ProgressSpine() {
  return (
    <div aria-hidden="true" className="progress-spine">
      <div className="progress-track" />
      <div className="progress-fill" data-progress-fill />
      {[4, 30, 55, 78, 96].map((top, index) => (
        <span data-active="false" data-progress-node={index} key={top} style={{ top: `${top}%` }} />
      ))}
    </div>
  );
}
