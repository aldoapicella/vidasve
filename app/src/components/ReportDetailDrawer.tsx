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
  const people = report.persons ?? [];
  const primaryPerson = people[0];
  const mediaEvents = events.filter((event) => event.thumbnailUrl);
  const publicPosts = events.filter((event) => event.type === "public_post");
  const peopleCount = people.length || countFromReport(report.peopleCount);
  const risk = riskLabel(report.priority);

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
    if (navigator.share) {
      try {
        await navigator.share({ title: report.code, url: location.href });
        confirmShared();
        return;
      } catch {
        // Fall back to clipboard when the native share sheet is unavailable or cancelled.
      }
    }
    try {
      await navigator.clipboard.writeText(location.href);
      confirmShared();
    } catch {
      setError("No se pudo compartir el enlace.");
    }
  }

  function confirmShared() {
    setShareCopied(true);
    window.setTimeout(() => setShareCopied(false), 2000);
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
    <aside className="detailDrawer publicCaseDrawer" aria-label={`Reporte ${report.code}`}>
      <button className="backPanel" type="button" onClick={onClose}>Volver al mapa</button>

      <header className="publicCaseHero">
        <span className="detailBuildingIcon" aria-hidden="true"><BuildingGlyph /></span>
        <div className="publicCaseTitle">
          <span className="publicBadge">Ficha pública</span>
          <h1>{report.addressText}</h1>
          <p>{report.landmark ? `Referencia: ${report.landmark}` : report.knownInfoPublic}</p>
          <small>{[report.area, report.city, `Código ${report.code}`].filter(Boolean).join(" · ")}</small>
        </div>
        <span className={`riskBadge ${risk.className}`}>{risk.label}</span>
        <button className="iconButton" type="button" aria-label="Cerrar detalle" onClick={onClose}>
          <span aria-hidden="true">&times;</span>
        </button>
      </header>

      <div className="publicDetailGrid">
        <section className="peopleSummary">
          <h2>{peopleCount || "Varias"} persona{peopleCount === 1 ? "" : "s"} reportada{peopleCount === 1 ? "" : "s"}</h2>
          <p>{primaryPerson ? `${primaryPerson.displayName} · ${personStatusLabel(primaryPerson.status)}` : labelForType(report.type)}</p>
          <small>{report.location ? `${formatCoordinate(report.location.coordinates[1])}, ${formatCoordinate(report.location.coordinates[0])}` : "Ubicación aproximada o por zona"} · Precisión {accuracyLabel(report.locationAccuracy).toLowerCase()}</small>
        </section>

        <section className="caseSummary">
          <h2>Resumen del reporte</h2>
          <dl>
            <div><dt>Urgencia</dt><dd>{risk.shortLabel}</dd></div>
            <div><dt>Estado</dt><dd>{statusLabel(report.derivedStatus)}</dd></div>
            <div><dt>Publicaciones</dt><dd>{publicPosts.length}</dd></div>
            <div><dt>Actualizaciones</dt><dd>{events.length}</dd></div>
            <div><dt>Última actualización</dt><dd>{formatEventTime(report.updatedAt)}</dd></div>
          </dl>
        </section>
      </div>

      {report.riskFlags.length || report.signsOfLife || report.possibleDuplicateCodes?.length ? (
        <div className="caseTags" aria-label="Etiquetas del reporte">
          {report.signsOfLife ? <span className="greenTag">Señales de vida</span> : null}
          {report.riskFlags.map((flag) => <span key={flag}>{flag}</span>)}
          {report.possibleDuplicateCodes?.map((code) => <span key={code}>Posible duplicado {code}</span>)}
        </div>
      ) : null}

      {people.length ? (
        <section className="caseSection">
          <div className="sectionTitleRow">
            <h2>Personas reportadas</h2>
            <span>{people.length} vinculada{people.length === 1 ? "" : "s"}</span>
          </div>
          <div className="publicPersonGrid">
            {people.map((person) => (
              <PersonTile
                key={person.id}
                person={person}
                risk={risk}
                imageUrl={imageForPerson(person.id, mediaEvents) ?? person.photoUrl}
                fallbackImageUrl={people.length === 1 ? mediaEvents[0]?.thumbnailUrl : undefined}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="caseSection">
        <div className="sectionTitleRow">
          <h2>Carteles y publicaciones de familiares</h2>
          <span>{mediaEvents.length || publicPosts.length} publicación{mediaEvents.length + publicPosts.length === 1 ? "" : "es"}</span>
        </div>
        {mediaEvents.length ? (
          <div className="publicMediaStrip">
            {mediaEvents.slice(0, 8).map((event) => (
              <a key={event.id} className="publicMediaCard" href={event.mediaUrl ?? event.thumbnailUrl} target="_blank" rel="noreferrer">
                <img src={event.thumbnailUrl} alt={`Publicación pública ${report.code}`} />
                <span>{eventTypeLabel(event.type)}</span>
                <small>{formatEventTime(event.createdAt)}</small>
              </a>
            ))}
          </div>
        ) : (
          <p className="emptyHint">Todavía no hay imágenes públicas cargadas para este reporte.</p>
        )}
      </section>

      <div className="primaryActions detailPrimaryActions">
        <button className="greenAction" type="button" disabled={busy !== null} onClick={() => void submit("new_signs_of_life", "Hay señales de vida nuevas.")}>
          Hay señales de vida
        </button>
        <button className="outlineAction" type="button" disabled={busy !== null} onClick={() => void shareReport()}>
          {shareCopied ? "Enlace copiado" : "Compartir ficha"}
        </button>
      </div>
      <p className="communityGuard">Estas acciones crean señales públicas para revisión. Un tercero no puede cerrar ni ocultar el reporte con un solo clic.</p>

      <section className="caseSection updateComposer">
        <h2>Agregar información pública</h2>
        <label>
          Nueva información
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={3} maxLength={900} placeholder="Qué viste, dónde, cuándo y cómo puede verificarse." />
        </label>
        {error ? <p className="formError" role="alert">{error}</p> : null}
        <div className="eventGrid">
          <button type="button" disabled={busy !== null} onClick={() => void submit("add_info", "Tengo información nueva.")}>
            Agregar información
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

      <p className="safetyNote">
        No entres a estructuras inestables. Ayuda confirmando ubicación, avisando a vecinos o llevando el reporte a personas con equipo.
      </p>

      <section className="caseSection">
        <h2>Actualizaciones públicas</h2>
        <ol className="timeline">
          {events.map((event) => (
            <li key={event.id}>
              <span>{eventTypeLabel(event.type)}</span>
              {event.thumbnailUrl ? (
                <a className="timelineMedia" href={event.mediaUrl ?? event.thumbnailUrl} target="_blank" rel="noreferrer">
                  <img src={event.thumbnailUrl} alt={`Imagen pública para ${report.code}`} />
                </a>
              ) : null}
              <p>{event.message}</p>
              <time>{formatEventTime(event.createdAt)}</time>
            </li>
          ))}
        </ol>
      </section>
    </aside>
  );
}

function PersonTile({
  person,
  risk,
  imageUrl,
  fallbackImageUrl
}: {
  person: NonNullable<PublicReport["persons"]>[number];
  risk: ReturnType<typeof riskLabel>;
  imageUrl?: string;
  fallbackImageUrl?: string;
}) {
  const photo = imageUrl ?? fallbackImageUrl;
  return (
    <article className="publicPersonCard">
      {photo ? (
        <img src={photo} alt={`Imagen pública de ${person.displayName}`} />
      ) : (
        <span className="personInitials" aria-hidden="true">{initials(person.displayName)}</span>
      )}
      <div>
        <strong><a href={`/persona/${person.id}`}>{person.displayName}</a></strong>
        <span>{person.age ? `${person.age} años` : "Edad no indicada"}</span>
        <p>{person.description || person.lastKnownPlace || personStatusLabel(person.status)}</p>
      </div>
      <small>Último contacto<br /><b>{person.lastContactText || "No indicado"}</b></small>
      {person.lastKnownPlace ? <small>Ubicación<br /><b>{person.lastKnownPlace}</b></small> : null}
      <em className={risk.className}>{risk.label}</em>
    </article>
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

function riskLabel(priority: PublicReport["priority"]): { label: string; shortLabel: string; className: string } {
  if (priority === "P1") return { label: "ALTO RIESGO", shortLabel: "ALTO", className: "high" };
  if (priority === "P2") return { label: "RIESGO MEDIO", shortLabel: "MEDIO", className: "medium" };
  return { label: "NECESITA VERIFICACIÓN", shortLabel: "VERIFICAR", className: "low" };
}

function countFromReport(value: string): number {
  const firstNumber = value.match(/\d+/)?.[0];
  return firstNumber ? Number(firstNumber) : 0;
}

function imageForPerson(personId: string, events: PublicEvent[]): string | undefined {
  return events.find((event) => event.personId === personId)?.thumbnailUrl;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatCoordinate(value: number): string {
  return value.toFixed(4);
}

function formatEventTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return new Intl.DateTimeFormat("es-VE", {
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function BuildingGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 21V4h14v17M9 8h1m4 0h1M9 12h1m4 0h1M9 16h1m4 0h1M3 21h18" />
    </svg>
  );
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
