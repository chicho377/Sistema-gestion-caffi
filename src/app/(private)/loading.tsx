export default function Loading() {
  return (
    <div className="panel" role="status" aria-live="polite">
      <div className="skeleton" />
      <div className="skeleton short" />
      <p>Cargando tu espacio…</p>
    </div>
  );
}
