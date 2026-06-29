import { useEffect, useMemo, useState, type FormEvent } from "react";
import { listAdminQueue, moderateAdminEvent, moderateAdminReport, removeAdminReport, type AdminQueueItem, type AdminQueueStatus } from "../api/admin";

const TOKEN_KEY = "vidasve_admin_token";
const STATUSES: AdminQueueStatus[] = ["flagged", "hidden", "queued", "removed", "public"];

export function AdminModerationPage() {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) ?? "");
  const [draftToken, setDraftToken] = useState("");
  const [status, setStatus] = useState<AdminQueueStatus>("flagged");
  const [items, setItems] = useState<AdminQueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const counts = useMemo(() => ({ total: items.length, reports: items.filter((item) => item.kind === "report").length }), [items]);

  useEffect(() => {
    if (!token) return;
    void refresh();
  }, [token, status]);

  function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = draftToken.trim();
    if (!next) return;
    sessionStorage.setItem(TOKEN_KEY, next);
    setToken(next);
    setDraftToken("");
  }

  function logout() {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken("");
    setItems([]);
  }

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      setItems(await listAdminQueue(token, status));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la cola.");
    } finally {
      setLoading(false);
    }
  }

  async function act(key: string, label: string, fn: (reason: string) => Promise<void>) {
    const reason = window.prompt("Motivo operativo", label);
    if (!reason?.trim()) return;
    setBusyKey(key);
    setError(null);
    try {
      await fn(reason.trim());
      setNotice("Acción aplicada.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo aplicar la acción.");
    } finally {
      setBusyKey("");
    }
  }

  if (!token) {
    return (
      <main className="adminShell">
        <section className="adminLogin">
          <h1>Moderación VidasVE</h1>
          <form onSubmit={login}>
            <label>
              Token admin
              <input value={draftToken} onChange={(event) => setDraftToken(event.target.value)} type="password" autoComplete="off" autoFocus />
            </label>
            <button type="submit">Entrar</button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="adminShell">
      <header className="adminHeader">
        <div>
          <a href="/">VidasVE</a>
          <h1>Cola de moderación</h1>
          <p>{counts.total} elementos · {counts.reports} reportes</p>
        </div>
        <div className="adminHeaderActions">
          <button type="button" onClick={() => void refresh()} disabled={loading}>Actualizar</button>
          <button type="button" className="ghost" onClick={logout}>Salir</button>
        </div>
      </header>

      <nav className="adminTabs" aria-label="Estados">
        {STATUSES.map((item) => (
          <button key={item} type="button" className={item === status ? "active" : ""} onClick={() => setStatus(item)}>
            {statusLabel(item)}
          </button>
        ))}
      </nav>

      {error ? <p className="adminError" role="alert">{error}</p> : null}
      {notice ? <p className="adminNotice" role="status">{notice}</p> : null}
      {loading ? <p className="adminEmpty">Cargando cola...</p> : null}
      {!loading && !items.length ? <p className="adminEmpty">No hay elementos en este estado.</p> : null}

      <section className="adminQueue">
        {items.map((item) => {
          const key = item.kind === "report" ? `report-${item.report.code}` : `event-${item.event.id}`;
          return item.kind === "report" ? (
            <article className="adminItem" key={key}>
              <div>
                <span>{item.kind}</span>
                <h2>{item.report.code}</h2>
                <p>{item.report.addressText}</p>
                <small>{item.report.knownInfoPublic}</small>
              </div>
              <AdminActions
                busy={busyKey === key}
                onHide={() => void act(key, "admin_hide", (reason) => moderateAdminReport(token, item.report.code, "hidden", reason))}
                onShow={() => void act(key, "admin_restore", (reason) => moderateAdminReport(token, item.report.code, "public", reason))}
                onRemove={() => void act(key, "admin_remove", (reason) => removeAdminReport(token, item.report.code, reason))}
              />
            </article>
          ) : (
            <article className="adminItem" key={key}>
              <div>
                <span>{item.event.type}</span>
                <h2>{item.event.reportCode}</h2>
                <p>{item.event.message || "Sin texto"}</p>
                <small>{item.report?.addressText ?? item.event.id}</small>
              </div>
              <AdminActions
                busy={busyKey === key}
                onHide={() => void act(key, "admin_hide_event", (reason) => moderateAdminEvent(token, item.event.reportCode, item.event.id, "hidden", reason))}
                onShow={() => void act(key, "admin_restore_event", (reason) => moderateAdminEvent(token, item.event.reportCode, item.event.id, "public", reason))}
              />
            </article>
          );
        })}
      </section>
    </main>
  );
}

function AdminActions({
  busy,
  onHide,
  onShow,
  onRemove
}: {
  busy: boolean;
  onHide: () => void;
  onShow: () => void;
  onRemove?: () => void;
}) {
  return (
    <div className="adminActions">
      <button type="button" disabled={busy} onClick={onHide}>Ocultar</button>
      <button type="button" disabled={busy} onClick={onShow}>Restaurar</button>
      {onRemove ? <button className="dangerAction" type="button" disabled={busy} onClick={onRemove}>Retirar datos</button> : null}
    </div>
  );
}

function statusLabel(status: AdminQueueStatus): string {
  const labels: Record<AdminQueueStatus, string> = {
    flagged: "Marcados",
    public: "Públicos",
    queued: "En cola",
    hidden: "Ocultos",
    removed: "Retirados"
  };
  return labels[status];
}
