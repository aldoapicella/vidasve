import { useState } from "react";
import { createReport } from "../api/client";
import type { PublicConfig, ReportType } from "../types";

export interface CreatedReport {
  code: string;
  publicUrl: string;
  ownerEditUrl: string;
}

const TYPES: Array<[ReportType, string, string]> = [
  ["trapped_person", "Persona atrapada", "Hay alguien que podria necesitar rescate."],
  ["voices_or_hits", "Se escuchan senales", "Voces, golpes o indicios de vida."],
  ["missing_last_seen", "Ultima ubicacion", "Alguien fue visto por ultima vez aqui."],
  ["collapsed_building_unknown", "Estructura colapsada", "No se sabe cuantas personas hay."]
];

const RISKS = [
  ["gas", "Gas"],
  ["fire", "Fuego"],
  ["cables", "Cables"],
  ["water", "Agua"],
  ["unstable_structure", "Estructura inestable"],
  ["blocked_street", "Calle bloqueada"]
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
  const [step, setStep] = useState(1);
  const [type, setType] = useState<ReportType>("trapped_person");
  const [addressText, setAddressText] = useState("");
  const [knownInfoPublic, setKnownInfoPublic] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationUnknown, setLocationUnknown] = useState(!defaultLocation);
  const [defaultLat, defaultLng] = config.defaultCenter;
  const [lng, lat] = defaultLocation ?? [defaultLng, defaultLat];

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step === 1) {
      setStep(2);
      return;
    }

    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const result = await createReport({
        website: form.get("website"),
        company: form.get("company"),
        middleName: form.get("middleName"),
        location: locationUnknown ? undefined : { type: "Point", coordinates: [Number(form.get("lng")), Number(form.get("lat"))] },
        locationUnknown,
        locationAccuracy: locationUnknown ? "zone_only" : "approximate",
        addressText: form.get("addressText"),
        landmark: form.get("landmark"),
        type,
        peopleCount: form.get("peopleCount"),
        personDescriptionPublic: form.get("personDescriptionPublic"),
        lastContactText: form.get("lastContactText"),
        knownInfoPublic: form.get("knownInfoPublic"),
        signsOfLife: form.get("signsOfLife") === "on",
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

  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-labelledby="create-title">
      <form className="modal reportForm quickReport" onSubmit={submit}>
        <header>
          <div>
            <span className="eyebrow">Nuevo reporte</span>
            <h1 id="create-title">Reportar emergencia</h1>
            <p className="helperText">Confirma el punto, agrega contexto publico y envia.</p>
          </div>
          <button className="iconButton" type="button" aria-label="Cerrar" onClick={onClose}>
            <span aria-hidden="true">&times;</span>
          </button>
        </header>

        <div className="stepper" aria-label="Progreso">
          <span className={step === 1 ? "active" : ""}>1. Ubicacion</span>
          <span className={step === 2 ? "active" : ""}>2. Prioridad</span>
        </div>

        <input className="trap" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
        <input className="trap" name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" />
        <input className="trap" name="middleName" tabIndex={-1} autoComplete="off" aria-hidden="true" />
        <input type="hidden" name="lng" value={lng} />
        <input type="hidden" name="lat" value={lat} />
        {step === 2 ? (
          <>
            <input type="hidden" name="addressText" value={addressText} />
            <input type="hidden" name="knownInfoPublic" value={knownInfoPublic} />
          </>
        ) : null}

        {step === 1 ? (
          <section className="reportStep">
            <div className="selectedPlace">
              <span>{locationUnknown ? "Sin punto exacto" : "Punto del mapa"}</span>
              <strong>{locationUnknown ? "Usare la referencia escrita" : `${lat.toFixed(5)}, ${lng.toFixed(5)}`}</strong>
              <label className="checkRow">
                <input type="checkbox" checked={locationUnknown} onChange={(event) => setLocationUnknown(event.target.checked)} />
                No tengo el punto exacto
              </label>
            </div>

            <label>
              Ubicacion o referencia
              <input
                name="addressText"
                required
                maxLength={240}
                value={addressText}
                onChange={(event) => setAddressText(event.target.value)}
                placeholder="Edificio, calle, plaza, piso o punto cercano"
              />
            </label>

            <label>
              Que esta pasando
              <textarea
                name="knownInfoPublic"
                required
                maxLength={900}
                rows={4}
                value={knownInfoPublic}
                onChange={(event) => setKnownInfoPublic(event.target.value)}
                placeholder="Describe solo informacion publica y verificable."
              />
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
          </section>
        ) : (
          <section className="reportStep">
            <label className="lifeToggle">
              <input name="signsOfLife" type="checkbox" />
              <span>
                <strong>Hay senales de vida</strong>
                <small>Sube la prioridad del reporte.</small>
              </span>
            </label>

            <div className="inlineFields">
              <label>
                Personas estimadas
                <select name="peopleCount" defaultValue="unknown">
                  <option value="1">1</option>
                  <option value="2-5">2-5</option>
                  <option value="more_than_5">Mas de 5</option>
                  <option value="unknown">No se sabe</option>
                </select>
              </label>
              <label>
                Ultimo contacto
                <input name="lastContactText" maxLength={160} placeholder="Hoy 8:30 a.m., ayer en la noche..." />
              </label>
            </div>

            <details className="optionalDetails">
              <summary>Agregar detalles opcionales</summary>
              <label>
                Punto de referencia
                <input name="landmark" maxLength={120} placeholder="Panaderia, escuela, esquina..." />
              </label>
              <label>
                Persona o grupo
                <input name="personDescriptionPublic" maxLength={240} />
              </label>
              <div className="checks" aria-label="Riesgos">
                {RISKS.map(([risk, label]) => (
                  <label key={risk}>
                    <input type="checkbox" name="riskFlags" value={risk} />
                    {label}
                  </label>
                ))}
              </div>
            </details>

            <details className="optionalDetails">
              <summary>Contacto privado</summary>
              <label>
                Relacion
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
                Nombre publico opcional
                <input name="reporterNamePublic" maxLength={80} />
              </label>
              <label>
                Telefono, WhatsApp o email
                <input name="reporterContact" maxLength={160} autoComplete="tel" />
              </label>
              <p className="helperText">Tu contacto no sera publico.</p>
            </details>
          </section>
        )}

        {error ? <p className="formError" role="alert">{error}</p> : null}
        <div className="actions stickyActions">
          {step === 2 ? (
            <button className="ghost" type="button" onClick={() => setStep(1)}>
              Atras
            </button>
          ) : null}
          <button type="submit" disabled={busy}>
            {busy ? "Enviando..." : step === 1 ? "Continuar" : "Enviar reporte"}
          </button>
          <button className="ghost" type="button" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
