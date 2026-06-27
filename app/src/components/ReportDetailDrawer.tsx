import { useState } from "react";
import type { EventType, PublicEvent, PublicReport } from "../types";

export function ReportDetailDrawer({
  report,
  events,
  ownerToken,
  onClose,
  onEvent
}: {
  report: PublicReport;
  events: PublicEvent[];
  ownerToken?: string;
  onClose: () => void;
  onEvent: (type: EventType, message: string, reason?: string) => Promise<void>;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<EventType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  async function submit(type: EventType, fallback: string, reason?: string) {
    setBusy(type);
    setError(null);
    try {
      await onEvent(type, message || fallback, reason);
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar la actualización.");
    } finally {
      setBusy(null);
    }
  }

  async function shareReport() {
    try {
      if (navigator.share) {
        await navigator.share({ title: report.code, url: location.href });
        return;
      }
      await navigator.clipboard.writeText(location.href);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 2000);
    } catch {
      setError("No se pudo compartir el enlace.");
    }
  }

  function reportAbuse() {
    const reason = window.prompt("Motivo del abuso: falso, spam, datos personales, ubicación peligrosa u otro.");
    if (!reason?.trim()) return;
    void submit("abuse_flag", reason, reason);
  }

  function reportRisk() {
    const reason = window.prompt("Riesgo observado: gas, fuego, cables, agua, estructura inestable u otro.");
    if (!reason?.trim()) return;
    void submit("risk_update", reason, reason);
  }

  return (
    <aside className="detailDrawer" aria-label={`Reporte ${report.code}`}>
      <header>
        <div>
          <span className={`priority ${report.priority.toLowerCase()}`}>{report.priority}</span>
          <h1>{labelForType(report.type)}</h1>
          <p>Código: {report.code}</p>
        </div>
        <button className="iconButton" type="button" aria-label="Cerrar detalle" onClick={onClose}>
          <span aria-hidden="true">&times;</span>
        </button>
      </header>

      <section>
          <h2>Ubicación</h2>
        <p>{report.addressText}</p>
        <p>Precisión: {accuracyLabel(report.locationAccuracy)}</p>
      </section>

      <section>
        <h2>Información</h2>
        <p>{report.knownInfoPublic}</p>
        {report.lastContactText ? <p>Último contacto: {report.lastContactText}</p> : null}
        <p>Estado: {statusLabel(report.derivedStatus)}</p>
        {report.signsOfLife ? <p className="lifeSignal">Tiene señales de vida reportadas</p> : null}
        {report.possibleDuplicateCodes?.length ? (
          <p>Posibles duplicados: {report.possibleDuplicateCodes.join(", ")}</p>
        ) : null}
      </section>

      {report.persons?.length ? (
        <section>
          <h2>Personas reportadas</h2>
          <div className="detailPeopleList">
            {report.persons.map((person) => (
              <article key={person.id} className="detailPerson">
                <div>
                  <strong><a href={`/persona/${person.id}`}>{person.displayName}</a></strong>
                  <span>{person.age ? `${person.age} años · ` : ""}{personStatusLabel(person.status)}</span>
                </div>
                {person.lastKnownPlace ? <p>{person.lastKnownPlace}</p> : null}
                {person.description ? <p>{person.description}</p> : null}
                {person.lastContactText ? <p>Último contacto: {person.lastContactText}</p> : null}
                {person.publicContactName || person.publicContactPhone ? (
                  <p className="publicContactLine">
                    Contacto público: {[person.publicContactName, person.publicContactRelationship, person.publicContactPhone].filter(Boolean).join(" · ")}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <p className="safetyNote">
        No entres a estructuras inestables. Ayuda confirmando ubicación, avisando a vecinos o llevando el reporte a personas con equipo.
      </p>

      <section>
        <h2>Actualizar</h2>
        <label>
          Nueva información
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={3} maxLength={900} />
        </label>
        {error ? <p className="formError" role="alert">{error}</p> : null}
        <div className="eventGrid">
          <button type="button" disabled={busy !== null} onClick={() => void submit("add_info", "Tengo información nueva.")}>
            Tengo información
          </button>
          <button type="button" disabled={busy !== null} onClick={() => void submit("nearby_help", "Estoy cerca o llevando ayuda.")}>
            Estoy cerca
          </button>
          <button type="button" disabled={busy !== null} onClick={() => void submit("new_signs_of_life", "Hay señales de vida nuevas.")}>
            Hay señales de vida ahora
          </button>
          <button type="button" disabled={busy !== null} onClick={() => void submit("duplicate_claim", "Puede ser duplicado.")}>
            Posible duplicado
          </button>
          <button type="button" disabled={busy !== null} onClick={reportRisk}>
            Riesgo: gas/fuego/cables/agua
          </button>
          <button type="button" disabled={busy !== null} onClick={() => void submit("resolution_claim", "Creo que fue resuelto.")}>
            Informar posible resuelto
          </button>
          <button type="button" disabled={busy !== null} onClick={() => void submit("reopen_claim", "Hay información nueva para reabrir.")}>
            Reabrir con información
          </button>
          <button type="button" disabled={busy !== null} onClick={() => void shareReport()}>
            {shareCopied ? "Enlace copiado" : "Compartir"}
          </button>
          <button className="dangerAction" type="button" disabled={busy !== null} onClick={reportAbuse}>
            Abuso / información falsa
          </button>
        </div>
        {ownerToken ? (
          <div className="ownerBox">
            <strong>Enlace privado activo</strong>
            <button type="button" disabled={busy !== null} onClick={() => void submit("owner_resolved", "Marcado como resuelto por el creador.", "found_alive")}>
              Marcar resuelto como dueño
            </button>
            <button type="button" disabled={busy !== null} onClick={() => void submit("owner_reopened", "Reabierto por el creador.")}>
              Reabrir como dueño
            </button>
          </div>
        ) : null}
      </section>

      <section>
        <h2>Historial público</h2>
        <ol className="timeline">
          {events.map((event) => (
            <li key={event.id}>
              <span>{eventTypeLabel(event.type)}</span>
              <p>{event.message}</p>
              <time>{new Date(event.createdAt).toLocaleString()}</time>
            </li>
          ))}
        </ol>
      </section>
    </aside>
  );
}

function labelForType(type: PublicReport["type"]): string {
  const labels: Record<PublicReport["type"], string> = {
    trapped_person: "Persona posiblemente atrapada",
    missing_last_seen: "Desaparecido / última ubicación",
    voices_or_hits: "Se escuchan voces o golpes",
    collapsed_building_unknown: "Edificio colapsado"
  };
  return labels[type];
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    open: "Abierto",
    confirmed: "Confirmado",
    help_nearby: "Ayuda cerca",
    maybe_resolved: "Posiblemente resuelto",
    resolved_owner: "Resuelto por propietario",
    resolved_community: "Resuelto por comunidad",
    reopened: "Reabierto",
    hidden_abuse: "Oculto por abuso"
  };
  return labels[status] ?? status.replace(/_/g, " ");
}

function accuracyLabel(accuracy: string): string {
  const labels: Record<string, string> = {
    exact: "Exacta",
    approximate: "Aproximada",
    zone_only: "Solo zona"
  };
  return labels[accuracy] ?? accuracy;
}

function eventTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    create_report: "Reporte creado",
    add_info: "Nueva información",
    nearby_help: "Ayuda cercana",
    duplicate_claim: "Posible duplicado",
    resolution_claim: "Posible resolución",
    reopen_claim: "Solicitud de reapertura",
    abuse_flag: "Abuso reportado",
    risk_update: "Riesgo actualizado",
    new_signs_of_life: "Señales de vida",
    owner_add_info: "Información del propietario",
    owner_resolved: "Resuelto por propietario",
    owner_reopened: "Reabierto por propietario",
    owner_contact_update: "Contacto actualizado",
    public_post: "Publicación"
  };
  return labels[type] ?? type.replace(/_/g, " ");
}

function personStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    trapped: "Posiblemente atrapada",
    missing: "No localizada",
    signals_of_life: "Con señales de vida",
    found: "Encontrada",
    needs_verification: "Necesita verificación"
  };
  return labels[status] ?? statusLabel(status);
}
