export function OfflineBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="offline" role="status">
      <span>{message}</span>
      <button type="button" onClick={onRetry}>
        Reintentar
      </button>
    </div>
  );
}
