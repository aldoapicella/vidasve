export function OfflineBanner({
  message,
  detail,
  retryLabel = "Reintentar",
  onRetry,
  onDiscard
}: {
  message: string;
  detail?: string;
  retryLabel?: string;
  onRetry: () => void;
  onDiscard?: () => void;
}) {
  return (
    <div className="offline" role="status">
      <span>{message}{detail ? <small>{detail}</small> : null}</span>
      <button type="button" onClick={onRetry}>
        {retryLabel}
      </button>
      {onDiscard ? <button type="button" onClick={onDiscard}>Descartar</button> : null}
    </div>
  );
}
