import { useEffect, useState } from "react";
import { createReport, searchPlaces } from "../api/client";
import type { PersonStatus, PlaceSuggestion, PublicConfig, PublicPerson, ReportType } from "../types";

export interface CreatedReport {
  code: string;
  publicUrl: string;
  ownerEditUrl: string;
}

interface DraftPerson {
  id: string;
  displayName: string;
  age: string;
  description: string;
  lastContactText: string;
  lastKnownPlace: string;
  floorOrUnit: string;
  status: PersonStatus;
  publicContactName: string;
  publicContactPhone: string;
  publicContactRelationship: string;
}

const TYPES: Array<[ReportType, string, string]> = [
  ["trapped_person", "Persona atrapada", "Necesita rescate o verificación urgente."],
  ["voices_or_hits", "Se escuchan señales", "Voces, golpes o indicios de vida."],
  ["missing_last_seen", "Última ubicación", "Fue visto por última vez en este punto."],
  ["collapsed_building_unknown", "Estructura colapsada", "No se sabe cuántas personas hay."]
];

const RISKS = [
  ["gas", "Gas"],
  ["fire", "Fuego"],
  ["cables", "Cables"],
  ["water", "Agua"],
  ["unstable_structure", "Estructura inestable"],
  ["blocked_street", "Calle bloqueada"]
];

const PERSON_STATUS_OPTIONS: Array<[PersonStatus, string]> = [
  ["needs_verification", "Necesita verificación"],
  ["trapped", "Posiblemente atrapada"],
  ["signals_of_life", "Con señales de vida"],
  ["missing", "No localizada"],
  ["found", "Encontrada"]
];

export function CreateReportModal({
  defaultLocation,
  config,
  onClose,
  onCreated
}: {
  defaultLocation?: [number, number];
  config: PublicConfig;
  onClose: () => void;
  onCreated: (result: CreatedReport) => void;
}) {
  const [type, setType] = useState<ReportType>("trapped_person");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationUnknown, setLocationUnknown] = useState(!defaultLocation);
  const [location, setLocation] = useState<[number, number] | undefined>(defaultLocation);
  const [addressText, setAddressText] = useState("");
  const [places, setPlaces] = useState<PlaceSuggestion[]>([]);
  const [persons, setPersons] = useState<DraftPerson[]>([newPerson()]);
  const pointOutsideZone = location && !locationUnknown && !pointInAllowedZones(location, config.allowedBboxes);

  useEffect(() => {
    if (!config.features.geocoding || addressText.trim().length < 3) {
      setPlaces([]);
      return;
    }
    const timeout = window.setTimeout(() => {
      searchPlaces(addressText).then((result) => setPlaces(result.items)).catch(() => setPlaces([]));
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [addressText, config.features.geocoding]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pointOutsideZone) {
      setError("El punto está fuera de las zonas activas.");
      return;
    }

    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const publicPersons = persons.map(personToPayload).filter(Boolean) as PublicPerson[];
    const peopleCount = countFromPersons(publicPersons.length, String(form.get("peopleCount") ?? "unknown"));
    const lastContactAt = String(form.get("lastContactAt") ?? "");
    try {
      const result = await createReport({
        website: form.get("website"),
        company: form.get("company"),
        middleName: form.get("middleName"),
        captchaText: form.get("captchaText"),
        location: locationUnknown || !location ? undefined : { type: "Point", coordinates: location },
        locationUnknown,
        locationAccuracy: locationUnknown ? "zone_only" : "approximate",
        addressText,
        landmark: form.get("landmark"),
        type,
        peopleCount,
        persons: publicPersons,
        personDescriptionPublic: summarizePeople(publicPersons),
        lastContactText: publicPersons.find((person) => person.lastContactText)?.lastContactText ?? formatLastContact(lastContactAt),
        lastContactAt,
        knownInfoPublic: form.get("knownInfoPublic"),
        signsOfLife: type === "voices_or_hits" || publicPersons.some((person) => person.status === "signals_of_life") || form.get("signsOfLife") === "on",
        riskFlags: form.getAll("riskFlags"),
        sourceType: form.get("sourceType"),
        reporterNamePublic: form.get("reporterNamePublic"),
        reporterContact: form.get("reporterContact")
      });
      onCreated({ code: result.code, publicUrl: result.publicUrl, ownerEditUrl: result.ownerEditUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el reporte.");
    } finally {
      setBusy(false);
    }
  }

  function useBrowserLocation() {
    if (!navigator.geolocation) {
      setError("Este navegador no permite obtener ubicación.");
      return;
    }
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation([position.coords.longitude, position.coords.latitude]);
        setLocationUnknown(false);
      },
      () => setError("No se pudo obtener tu ubicación.")
    );
  }

  function updatePerson(id: string, patch: Partial<DraftPerson>) {
    setPersons((current) => current.map((person) => person.id === id ? { ...person, ...patch } : person));
  }

  function usePlace(place: PlaceSuggestion) {
    setAddressText(place.label);
    setLocation(place.coordinates);
    setLocationUnknown(false);
    setPlaces([]);
  }

  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-labelledby="create-title">
      <form className="modal reportForm quickReport" onSubmit={submit}>
        <header>
          <div>
            <span className="eyebrow">Nuevo reporte</span>
            <h1 id="create-title">Reportar en el mapa</h1>
          </div>
          <button className="iconButton" type="button" aria-label="Cerrar" onClick={onClose}>
            <span aria-hidden="true">&times;</span>
          </button>
        </header>

        <input className="trap" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
        <input className="trap" name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" />
        <input className="trap" name="middleName" tabIndex={-1} autoComplete="off" aria-hidden="true" />

        <section className={pointOutsideZone ? "selectedPlace selectedPlaceError" : "selectedPlace"}>
          <div>
            <span>{locationUnknown ? "Referencia escrita" : "Punto seleccionado"}</span>
            <strong>{locationUnknown || !location ? "Sin punto exacto" : formatLocation(location)}</strong>
            {pointOutsideZone ? <small>Fuera de las zonas activas configuradas.</small> : null}
          </div>
          <div className="locationActions">
            <button className="ghost" type="button" onClick={useBrowserLocation}>Usar mi ubicación</button>
            <label className="checkRow">
              <input type="checkbox" checked={locationUnknown} onChange={(event) => setLocationUnknown(event.target.checked)} />
              No tengo punto exacto
            </label>
          </div>
        </section>

        <div className="fieldGroup">
          <label htmlFor="addressText">Ubicación o referencia</label>
          <input
            id="addressText"
            name="addressText"
            required
            maxLength={240}
            placeholder="Buscar edificio, calle, plaza o punto cercano"
            value={addressText}
            onChange={(event) => setAddressText(event.target.value)}
            autoComplete="off"
          />
          {places.length ? (
            <div className="placeSuggestList" role="listbox" aria-label="Sugerencias de ubicación">
              {places.map((place) => (
                <button key={place.id} type="button" onClick={() => usePlace(place)}>
                  <strong>{place.label}</strong>
                  {place.detail ? <span>{place.detail}</span> : null}
                </button>
              ))}
            </div>
          ) : config.features.geocoding ? <small>Busca y elige un resultado dentro de Caracas, La Guaira o zonas activas.</small> : null}
        </div>

        <label>
          Qué ocurre
          <textarea name="knownInfoPublic" required maxLength={900} rows={3} placeholder="Información pública y verificable." />
        </label>

        <div className="typeGrid" role="radiogroup" aria-label="Tipo de emergencia">
          {TYPES.map(([id, label, helper]) => (
            <button
              key={id}
              type="button"
              className={type === id ? "typeCard active" : "typeCard"}
              onClick={() => setType(id)}
              aria-pressed={type === id}
            >
              <strong>{label}</strong>
              <span>{helper}</span>
            </button>
          ))}
        </div>

        <div className="inlineFields">
          <label>
            Personas estimadas
            <select name="peopleCount" defaultValue="unknown">
              <option value="1">1</option>
              <option value="2-5">2-5</option>
              <option value="more_than_5">Más de 5</option>
              <option value="unknown">No se sabe</option>
            </select>
          </label>
          <label>
            Último contacto general
            <input name="lastContactAt" type="datetime-local" />
          </label>
        </div>

        <section className="peopleEditor" aria-label="Personas relacionadas">
          <div className="sectionHeader">
            <div>
              <h2>Personas relacionadas</h2>
              <p>Agrega nombres, piso, último contacto o contacto público familiar si ya fue autorizado.</p>
            </div>
            <button className="ghost" type="button" onClick={() => setPersons((current) => [...current, newPerson()])}>
              Agregar persona
            </button>
          </div>
          {persons.map((person, index) => (
            <article className="personEditor" key={person.id}>
              <div className="personEditorTitle">
                <strong>Persona {index + 1}</strong>
                {persons.length > 1 ? (
                  <button className="textDanger" type="button" onClick={() => setPersons((current) => current.filter((item) => item.id !== person.id))}>
                    Quitar
                  </button>
                ) : null}
              </div>
              <div className="inlineFields">
                <label>
                  Nombre público
                  <input value={person.displayName} maxLength={120} onChange={(event) => updatePerson(person.id, { displayName: event.target.value })} />
                </label>
                <label>
                  Edad
                  <input value={person.age} inputMode="numeric" maxLength={3} onChange={(event) => updatePerson(person.id, { age: event.target.value })} />
                </label>
              </div>
              <div className="inlineFields">
                <label>
                  Estado
                  <select value={person.status} onChange={(event) => updatePerson(person.id, { status: event.target.value as PersonStatus })}>
                    {PERSON_STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label>
                  Piso/apto o último lugar
                  <input value={person.lastKnownPlace} maxLength={160} onChange={(event) => updatePerson(person.id, { lastKnownPlace: event.target.value })} />
                </label>
              </div>
              <label>
                Detalle público
                <input value={person.description} maxLength={240} onChange={(event) => updatePerson(person.id, { description: event.target.value })} />
              </label>
              <details>
                <summary>Contacto público autorizado</summary>
                <div className="inlineFields">
                  <label>
                    Nombre
                    <input value={person.publicContactName} maxLength={100} onChange={(event) => updatePerson(person.id, { publicContactName: event.target.value })} />
                  </label>
                  <label>
                    Teléfono o WhatsApp
                    <input value={person.publicContactPhone} maxLength={80} onChange={(event) => updatePerson(person.id, { publicContactPhone: event.target.value })} />
                  </label>
                </div>
                <label>
                  Relación
                  <input value={person.publicContactRelationship} maxLength={80} onChange={(event) => updatePerson(person.id, { publicContactRelationship: event.target.value })} />
                </label>
              </details>
            </article>
          ))}
        </section>

        <details className="optionalDetails">
          <summary>Riesgos y contacto privado</summary>
          <label className="lifeToggle">
            <input name="signsOfLife" type="checkbox" />
            <span>
              <strong>Hay señales de vida</strong>
              <small>Sube la prioridad del reporte.</small>
            </span>
          </label>
          <label>
            Punto de referencia
            <input name="landmark" maxLength={120} placeholder="Panadería, escuela, esquina..." />
          </label>
          <div className="checks" aria-label="Riesgos">
            {RISKS.map(([risk, label]) => (
              <label key={risk}>
                <input type="checkbox" name="riskFlags" value={risk} />
                {label}
              </label>
            ))}
          </div>
          <div className="inlineFields">
            <label>
              Relación
              <select name="sourceType" defaultValue="witness">
                <option value="family">Familiar</option>
                <option value="friend">Amigo</option>
                <option value="neighbor">Vecino</option>
                <option value="witness">Testigo</option>
                <option value="social_media">Redes</option>
                <option value="other">Otro</option>
              </select>
            </label>
            <label>
              Nombre público opcional
              <input name="reporterNamePublic" maxLength={80} />
            </label>
          </div>
          <label>
            Teléfono, WhatsApp o email privado
            <input name="reporterContact" maxLength={160} autoComplete="tel" />
          </label>
          <p className="helperText">El contacto privado del reportante no se publica.</p>
        </details>

        <label className="captchaField">
          Verificación humana
          <input name="captchaText" required autoComplete="off" inputMode="text" pattern="[Vv][Ii][Dd][Aa]" placeholder="Escribe VIDA" />
          <small>Escribe VIDA para confirmar que este reporte fue enviado por una persona.</small>
        </label>

        {error ? <p className="formError" role="alert">{error}</p> : null}
        <div className="actions stickyActions">
          <button type="submit" disabled={busy || Boolean(pointOutsideZone)}>
            {busy ? "Enviando..." : "Enviar reporte"}
          </button>
          <button className="ghost" type="button" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

function newPerson(): DraftPerson {
  return {
    id: crypto.randomUUID(),
    displayName: "",
    age: "",
    description: "",
    lastContactText: "",
    lastKnownPlace: "",
    floorOrUnit: "",
    status: "needs_verification",
    publicContactName: "",
    publicContactPhone: "",
    publicContactRelationship: ""
  };
}

function personToPayload(person: DraftPerson): PublicPerson | undefined {
  const age = Number(person.age);
  const payload: PublicPerson = {
    id: person.id,
    displayName: person.displayName.trim() || "Persona sin identificar",
    ...(Number.isInteger(age) && age >= 0 && age <= 120 ? { age } : {}),
    description: person.description.trim(),
    lastContactText: person.lastContactText.trim(),
    lastKnownPlace: person.lastKnownPlace.trim(),
    floorOrUnit: person.floorOrUnit.trim(),
    status: person.status,
    publicContactName: person.publicContactName.trim(),
    publicContactPhone: person.publicContactPhone.trim(),
    publicContactRelationship: person.publicContactRelationship.trim()
  };
  const hasPublicData = [
    person.displayName,
    person.description,
    person.lastContactText,
    person.lastKnownPlace,
    person.floorOrUnit,
    person.publicContactName,
    person.publicContactPhone
  ].some((value) => value.trim());
  return hasPublicData ? payload : undefined;
}

function summarizePeople(persons: PublicPerson[]): string {
  return persons
    .map((person) => [person.displayName, person.age ? `${person.age} años` : undefined, person.lastKnownPlace].filter(Boolean).join(", "))
    .join("; ")
    .slice(0, 240);
}

function countFromPersons(personCount: number, fallback: string): string {
  if (personCount === 1) return "1";
  if (personCount >= 2 && personCount <= 5) return "2-5";
  if (personCount > 5) return "more_than_5";
  return fallback;
}

function formatLastContact(value: string): string {
  if (!value) return "";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "";
  return new Intl.DateTimeFormat("es-VE", { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
}

function pointInAllowedZones([lng, lat]: [number, number], zones: PublicConfig["allowedBboxes"]): boolean {
  return !zones.length || zones.some((zone) => lng >= zone.minLng && lng <= zone.maxLng && lat >= zone.minLat && lat <= zone.maxLat);
}

function formatLocation([lng, lat]: [number, number]): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}
