import { useState } from "react";
import { createReport } from "../api/client";
import type { PublicConfig, ReportType } from "../types";

export interface CreatedReport {
  code: string;
  publicUrl: string;
  ownerEditUrl: string;
}

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

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const lng = Number(form.get("lng"));
    const lat = Number(form.get("lat"));
    try {
      const result = await createReport({
        website: form.get("website"),
        company: form.get("company"),
        middleName: form.get("middleName"),
        location: locationUnknown ? undefined : { type: "Point", coordinates: [lng, lat] },
        locationUnknown,
        locationAccuracy: form.get("locationAccuracy"),
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
        reporterContact: form.get("reporterContact"),
        publishContact: form.get("publishContact") === "on"
      });
      onCreated({ code: result.code, publicUrl: result.publicUrl, ownerEditUrl: result.ownerEditUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el reporte.");
    } finally {
      setBusy(false);
    }
  }

  const [defaultLat, defaultLng] = config.defaultCenter;
  const [pickedLng, pickedLat] = defaultLocation ?? [defaultLng, defaultLat];

  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-labelledby="create-title">
      <form className="modal reportForm" onSubmit={submit}>
        <header>
          <h1 id="create-title">Reportar ubicacion</h1>
          <button className="iconButton" type="button" aria-label="Cerrar" onClick={onClose}>
            x
          </button>
        </header>

        <input className="trap" name="website" tabIndex={-1} autoComplete="off" />
        <input className="trap" name="company" tabIndex={-1} autoComplete="off" />
        <input className="trap" name="middleName" tabIndex={-1} autoComplete="off" />

        <fieldset>
          <legend>Ubicacion</legend>
          <label>
            Referencia obligatoria
            <input name="addressText" required maxLength={240} placeholder="Edificio, calle, plaza o punto cercano" />
          </label>
          <label>
            Punto de referencia
            <input name="landmark" maxLength={120} placeholder="Panaderia, escuela, esquina..." />
          </label>
          <div className="inlineFields">
            <label>
              Longitud
              <input name="lng" type="number" step="0.000001" defaultValue={pickedLng} disabled={locationUnknown} />
            </label>
            <label>
              Latitud
              <input name="lat" type="number" step="0.000001" defaultValue={pickedLat} disabled={locationUnknown} />
            </label>
          </div>
          <label className="checkRow">
            <input type="checkbox" checked={locationUnknown} onChange={(event) => setLocationUnknown(event.target.checked)} />
            No tengo coordenadas exactas
          </label>
          <label>
            Precision
            <select name="locationAccuracy" defaultValue="approximate">
              <option value="exact">Exacta</option>
              <option value="approximate">Aproximada</option>
              <option value="zone_only">Solo zona</option>
            </select>
          </label>
        </fieldset>

        <fieldset>
          <legend>Situacion</legend>
          <label>
            Tipo
            <select value={type} onChange={(event) => setType(event.target.value as ReportType)}>
              <option value="trapped_person">Persona posiblemente atrapada</option>
              <option value="missing_last_seen">Desaparecido / ultima ubicacion</option>
              <option value="voices_or_hits">Se escuchan voces o golpes</option>
              <option value="collapsed_building_unknown">Edificio colapsado, cantidad desconocida</option>
            </select>
          </label>
          <label>
            Descripcion publica
            <textarea name="knownInfoPublic" required maxLength={900} rows={4} />
          </label>
          <label>
            Persona o grupo
            <input name="personDescriptionPublic" maxLength={240} />
          </label>
          <label>
            Cantidad estimada
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
          <label className="checkRow">
            <input name="signsOfLife" type="checkbox" />
            Hay senales de vida
          </label>
          <div className="checks" aria-label="Riesgos">
            {["gas", "fire", "cables", "water", "unstable_structure", "blocked_street"].map((risk) => (
              <label key={risk}>
                <input type="checkbox" name="riskFlags" value={risk} />
                {risk.replace(/_/g, " ")}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>Contacto privado</legend>
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
          <label className="checkRow">
            <input name="publishContact" type="checkbox" />
            Publicar contacto
          </label>
        </fieldset>

        {error ? <p className="formError" role="alert">{error}</p> : null}
        <div className="actions stickyActions">
          <button type="submit" disabled={busy}>
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
