import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createEvent, getConfig, getReport, listReports } from "./api/client";
import { CreateReportModal, type CreatedReport } from "./components/CreateReportModal";
import { FiltersBar } from "./components/FiltersBar";
import { MapView } from "./components/MapView";
import { OfflineBanner } from "./components/OfflineBanner";
import { ReportDetailDrawer } from "./components/ReportDetailDrawer";
import type { PublicConfig, PublicEvent, PublicReport } from "./types";

const DEFAULT_CONFIG: PublicConfig = {
  defaultCenter: [10.6031, -66.9334],
  defaultZoom: 11,
  allowedBboxes: [],
  azureMapsClientId: "",
  features: { mediaUploads: false, geocoding: false }
};

export function App() {
  const [config, setConfig] = useState<PublicConfig>(DEFAULT_CONFIG);
  const [reports, setReports] = useState<PublicReport[]>([]);
  const [filter, setFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selected, setSelected] = useState<PublicReport | null>(null);
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [reportsTruncated, setReportsTruncated] = useState(false);
  const [reportsLimit, setReportsLimit] = useState(500);
  const [createOpen, setCreateOpen] = useState(location.pathname === "/reportar");
  const [pickedLocation, setPickedLocation] = useState<[number, number] | undefined>();
  const [pickHint, setPickHint] = useState(false);
  const [created, setCreated] = useState<CreatedReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const filterRef = useRef(filter);
  const privateAccess = useMemo(() => {
    const match = location.pathname.match(/^\/r\/([^/]+)/);
    const token =
      new URLSearchParams(location.hash.slice(1)).get("ownerToken") ??
      new URLSearchParams(location.search).get("ownerToken");
    return match && token ? { code: decodeURIComponent(match[1]).toUpperCase(), token } : undefined;
  }, []);
  const visibleReports = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) return reports;
    return reports.filter((report) =>
      [report.code, report.addressText, report.landmark, report.area, report.city, report.knownInfoPublic]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    );
  }, [reports, searchTerm]);
  const urgentCount = visibleReports.filter((report) => report.priority === "P1").length;
  const selectedOwnerToken =
    privateAccess && selected?.code.toUpperCase() === privateAccess.code ? privateAccess.token : undefined;
  const zoneNames = config.allowedBboxes.map((zone) => zone.name).join(", ");

  useEffect(() => {
    getConfig().then(setConfig).catch(() => setError("La configuracion no esta disponible. El mapa sigue en modo local."));
  }, []);

  useEffect(() => {
    filterRef.current = filter;
  }, [filter]);

  useEffect(() => {
    const match = location.pathname.match(/^\/r\/([^/]+)/);
    if (!match) return;
    getReport(match[1])
      .then((data) => {
        setSelected(data.report);
        setEvents(data.events);
      })
      .catch(() => setError("No se pudo abrir ese reporte."));
  }, []);

  const refreshReports = useCallback(async (bbox?: [number, number, number, number], filterOverride?: string) => {
    try {
      const response = await listReports(bbox, filterOverride ?? filterRef.current);
      setReports(response.items);
      setReportsTruncated(response.truncated);
      setReportsLimit(response.limit);
      setError(null);
    } catch {
      setError("No se pudieron cargar reportes. Revisa la API o intenta de nuevo.");
    }
  }, []);

  async function selectReport(report: PublicReport) {
    setSelected(report);
    try {
      const data = await getReport(report.code);
      setSelected(data.report);
      setEvents(data.events);
      history.replaceState(null, "", `/r/${report.code}`);
    } catch {
      setError("No se pudo cargar el detalle.");
    }
  }

  async function sendEvent(type: Parameters<typeof createEvent>[1], message: string, reason?: string) {
    if (!selected) return;
    const response = await createEvent(selected.code, type, { message, reason }, selectedOwnerToken);
    setSelected(response.report);
    setEvents((current) => [...current, response.event]);
  }

  const handleMapClick = useCallback((location: [number, number]) => {
    setPickedLocation(location);
    setPickHint(false);
  }, []);

  function closeDetail() {
    setSelected(null);
    setEvents([]);
    history.replaceState(null, "", "/");
  }

  return (
    <main className={selected ? "shell detailOpen" : "shell"} aria-label="MapaRescate Venezuela">
      <MapView
        config={config}
        reports={visibleReports}
        selectedCode={selected?.code}
        pickedLocation={pickedLocation}
        onBoundsChange={refreshReports}
        onReportSelect={selectReport}
        onMapClick={handleMapClick}
      />

      <div className="topbar">
        <section className="brandPanel" aria-label="Estado operativo">
          <div>
            <span className="eyebrow">MapaRescate Venezuela</span>
            <strong>Mapa operativo</strong>
            {zoneNames ? <span className="zoneScope">Zonas activas: {zoneNames}</span> : null}
          </div>
          <div className="metricStrip" aria-label="Reportes visibles">
            <span><b>{visibleReports.length}</b> visibles</span>
            <span><b>{urgentCount}</b> P1</span>
          </div>
        </section>
        <div className="searchBox">
          <label htmlFor="report-search">Buscar</label>
          <div className="searchControl">
            <input
              id="report-search"
              aria-label="Buscar reportes"
              placeholder="Codigo, zona o referencia"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
            {searchTerm ? (
              <button className="clearSearch" type="button" aria-label="Limpiar busqueda" onClick={() => setSearchTerm("")}>
                ×
              </button>
            ) : null}
          </div>
        </div>
        <FiltersBar value={filter} onChange={(next) => { setFilter(next); void refreshReports(undefined, next); }} />
      </div>

      {reportsTruncated ? (
        <section className={pickHint && !pickedLocation ? "limitNotice abovePickHint" : "limitNotice"} role="status">
          Mostrando los {reportsLimit} reportes mas recientes. Acerca el mapa para ver una zona mas precisa.
        </section>
      ) : null}

      {!pickedLocation || selected ? (
        <div className="fabStack">
          {!pickedLocation ? (
            <button className="primaryFab" type="button" onClick={() => setPickHint(true)}>
              Elegir punto en el mapa
            </button>
          ) : null}
          {selected ? (
            <button className="secondaryFab" type="button" onClick={() => void sendEvent("nearby_help", "Estoy cerca o llevando ayuda.")}>
              Estoy cerca
            </button>
          ) : null}
        </div>
      ) : null}

      {pickedLocation && !createOpen && !selected ? (
        <section className="placeSheet" aria-label="Punto seleccionado">
          <div>
            <span className="eyebrow">Punto seleccionado</span>
            <strong>{formatLocation(pickedLocation)}</strong>
          </div>
          <button type="button" onClick={() => setCreateOpen(true)}>
            Reportar aqui
          </button>
          <button className="ghost" type="button" onClick={() => setPickedLocation(undefined)}>
            Quitar
          </button>
        </section>
      ) : null}

      {pickHint && !pickedLocation ? (
        <section className="pickHint" role="status">
          Toca el punto exacto dentro de las zonas activas. Luego confirma con "Reportar aqui".
        </section>
      ) : null}

      {error ? <OfflineBanner message={error} onRetry={() => void refreshReports()} /> : null}

      {createOpen ? (
        <CreateReportModal
          defaultLocation={pickedLocation}
          config={config}
          onClose={() => setCreateOpen(false)}
          onCreated={(result) => {
            setCreated(result);
            setCreateOpen(false);
            void refreshReports();
          }}
        />
      ) : null}

      {created ? <CreatedReportDialog created={created} onClose={() => setCreated(null)} /> : null}

      {selected ? (
        <ReportDetailDrawer
          report={selected}
          events={events}
          ownerToken={selectedOwnerToken}
          onClose={closeDetail}
          onEvent={(type, message, reason) => sendEvent(type, message, reason)}
        />
      ) : null}
    </main>
  );
}

function formatLocation([lng, lat]: [number, number]): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function CreatedReportDialog({ created, onClose }: { created: CreatedReport; onClose: () => void }) {
  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-labelledby="created-title">
      <section className="modal compactModal">
        <h1 id="created-title">Reporte creado: {created.code}</h1>
        <p>
          Guarda este enlace privado. Solo con este enlace puedes marcar el reporte como resuelto de forma inmediata.
          No lo compartas publicamente.
        </p>
        <div className="copyField">{created.ownerEditUrl}</div>
        <div className="actions">
          <button type="button" onClick={() => void navigator.clipboard.writeText(created.ownerEditUrl)}>
            Copiar enlace privado
          </button>
          <a className="button secondary" href={created.publicUrl}>
            Abrir publico
          </a>
          <button className="ghost" type="button" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </section>
    </div>
  );
}
