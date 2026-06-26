import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createEvent, createPost, getConfig, getReport, listPosts, listReports } from "./api/client";
import { CreateReportModal, type CreatedReport } from "./components/CreateReportModal";
import { MapView } from "./components/MapView";
import { OfflineBanner } from "./components/OfflineBanner";
import { ReportDetailDrawer } from "./components/ReportDetailDrawer";
import type { PublicConfig, PublicEvent, PublicPost, PublicPostType, PublicReport } from "./types";

const DEFAULT_AFFECTED_ZONES: PublicConfig["allowedBboxes"] = [
  { name: "Caracas", minLng: -67.24, minLat: 10.34, maxLng: -66.72, maxLat: 10.62 },
  { name: "La Guaira", minLng: -67.36, minLat: 10.43, maxLng: -66.72, maxLat: 10.76 },
  { name: "Altos Mirandinos", minLng: -67.18, minLat: 10.24, maxLng: -66.82, maxLat: 10.48 },
  { name: "Guarenas-Guatire", minLng: -66.78, minLat: 10.34, maxLng: -66.46, maxLat: 10.57 }
];

const DEFAULT_CONFIG: PublicConfig = {
  defaultCenter: [10.6031, -66.9334],
  defaultZoom: 11,
  allowedBboxes: DEFAULT_AFFECTED_ZONES,
  azureMapsClientId: "",
  features: { mediaUploads: false, geocoding: false }
};

const APP_NAME = "VidasVE";
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";

const DEMO_CASE = {
  code: "VE-ATLANTICO",
  title: "Edificio Atlantico, La Guaira",
  subtitle: "Av. La Playa, Urb. La Atlantida, Catia La Mar, La Guaira",
  reference: "Frente al Hotel Catimar, al lado de la Panaderia Atlantico",
  coords: "10.6026, -66.8772",
  peopleCount: 4,
  posts: 8,
  updates: 12
};

const DEMO_PEOPLE = [
  ["Valeria R.", "28 anos", "Estudiante de Medicina", "10 May, 11:30 a. m.", "ALTO RIESGO", "VR", "#f6c7b4", "Hermana: contacto privado verificado"],
  ["Luis R.", "54 anos", "Ingeniero Electricista", "10 May, 11:15 a. m.", "ALTO RIESGO", "LR", "#d4a27e", "Hijo: contacto privado verificado"],
  ["Santiago R.", "16 anos", "Estudiante 4to ano", "10 May, 11:20 a. m.", "MEDIO RIESGO", "SR", "#d2b48f", "Tia: contacto privado verificado"],
  ["Maria R.", "62 anos", "Ama de casa", "10 May, 11:10 a. m.", "MEDIO RIESGO", "MR", "#c48f78", "Hija: contacto privado verificado"]
];

const DEMO_POSTS = [
  {
    author: "Ana de Garcia",
    role: "Familiar",
    time: "Hoy, 8:15 a. m.",
    person: "Maria Rodriguez",
    initials: "MR",
    text: "Mi mama Maria Rodriguez fue vista por ultima vez en el lobby del Edificio Atlantico el 10/05 a las 11:20 a. m. Vestia blusa azul y pantalon gris.",
    place: "Edificio Atlantico, Piso 4",
    risk: "ALTO RIESGO"
  },
  {
    author: "Carlos Rodriguez",
    role: "Familiar",
    time: "Ayer, 6:40 p. m.",
    person: "Luis Rodriguez",
    initials: "LR",
    text: "Luis no ha respondido desde el sismo. Si alguien lo ha visto, por favor avisen.",
    place: "Residencias Parque Caribe, Torre B",
    risk: "RIESGO MEDIO"
  },
  {
    author: "Sofia Martinez",
    role: "Amiga",
    time: "Ayer, 5:10 p. m.",
    person: "Santiago R.",
    initials: "SR",
    text: "Busco a mi amigo Santiago R. Estudiamos juntos. Puede estar cerca de Catia La Mar.",
    place: "Catia La Mar",
    risk: "NECESITA VERIFICACION"
  }
];

const DEMO_MEDIA = ["Valeria Rodriguez", "Luis Rodriguez", "Santiago Rodriguez", "Maria Rodriguez"];

const DEMO_UPDATES = [
  "Hoy 12:45 p. m. — Vecino reporto sonidos de golpes en el piso 3, lado este del edificio.",
  "Hoy 11:20 a. m. — Familiar confirmo que 4 personas estaban en el apartamento 3B.",
  "Ayer 6:30 p. m. — Se reporto perdida de comunicacion en la zona."
];

const DEMO_REPORTS: PublicReport[] = [
  demoReport("DEMO-18", -67.05, 10.60, "P1", "Edificio Atlantico, La Guaira", "4 personas vinculadas"),
  demoReport("DEMO-14", -67.09, 10.49, "P1", "Torre Miramar, Caracas", "Senales de vida recientes"),
  demoReport("DEMO-09", -66.93, 10.55, "P2", "Macuto", "Atrapados sin confirmar"),
  demoReport("DEMO-06", -66.90, 10.44, "P2", "Petare", "Riesgo medio"),
  demoReport("DEMO-05", -67.14, 10.53, "P3", "La Guaira", "Informacion incompleta")
];

const DEMO_PINS = [
  ["red", "18", 24, 38],
  ["red", "14", 24, 62],
  ["orange", "9", 58, 51],
  ["orange", "7", 12, 50],
  ["orange", "11", 22, 75],
  ["yellow", "5", 45, 56],
  ["yellow", "5", 72, 50],
  ["yellow", "3", 14, 66],
  ["purple", "", 76, 39],
  ["heart", "", 37, 40],
  ["heart", "", 53, 72]
] as const;

const FILTER_CHIPS = [
  { label: "Todos", value: "all", tone: "plain" },
  { label: "Señales de vida", value: "signals", tone: "red" },
  { label: "Atrapados", value: "trapped", tone: "orange" },
  { label: "Voces/Golpes", value: "voices", tone: "yellow" },
  { label: "P1", value: "P1", tone: "purple" }
] as const;

export function App() {
  const [config, setConfig] = useState<PublicConfig>(DEFAULT_CONFIG);
  const [reports, setReports] = useState<PublicReport[]>([]);
  const [filter, setFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selected, setSelected] = useState<PublicReport | null>(null);
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [feedPosts, setFeedPosts] = useState<PublicPost[]>([]);
  const [reportsTruncated, setReportsTruncated] = useState(false);
  const [reportsLimit, setReportsLimit] = useState(500);
  const [createOpen, setCreateOpen] = useState(location.pathname === "/reportar");
  const [pickedLocation, setPickedLocation] = useState<[number, number] | undefined>();
  const [pickHint, setPickHint] = useState(false);
  const [created, setCreated] = useState<CreatedReport | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const filterRef = useRef(filter);
  const showFeed = location.pathname === "/feed";
  const privateAccess = useMemo(() => {
    const match = location.pathname.match(/^\/r\/([^/]+)/);
    const token =
      new URLSearchParams(location.hash.slice(1)).get("ownerToken") ??
      new URLSearchParams(location.search).get("ownerToken");
    return match && token ? { code: decodeURIComponent(match[1]).toUpperCase(), token } : undefined;
  }, []);
  const scopedReports = useMemo(() => reports.filter((report) => reportInAllowedZones(report, config.allowedBboxes)), [reports, config.allowedBboxes]);
  const filteredReports = useMemo(() => applyReportFilter(scopedReports, filter), [scopedReports, filter]);
  const visibleReports = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) return filteredReports;
    return filteredReports.filter((report) =>
      reportSearchValues(report)
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    );
  }, [filteredReports, searchTerm]);
  const mapReports = DEMO_MODE && !visibleReports.length && !searchTerm.trim() ? DEMO_REPORTS : visibleReports;
  const selectedOwnerToken =
    privateAccess && selected?.code.toUpperCase() === privateAccess.code ? privateAccess.token : undefined;
  const zoneNames = config.allowedBboxes.map((zone) => zone.name).join(", ");
  const searchResults = useMemo(() => searchPublicContent(searchTerm, scopedReports, feedPosts), [feedPosts, searchTerm, scopedReports]);

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

  const refreshPosts = useCallback(async () => {
    try {
      setFeedPosts((await listPosts()).items);
    } catch {
      setFeedPosts([]);
    }
  }, []);

  useEffect(() => {
    void refreshPosts();
  }, [refreshPosts]);

  useEffect(() => {
    if (!showFeed) return;
    void refreshReports(undefined, filter);
    void refreshPosts();
  }, [filter, refreshPosts, refreshReports, showFeed]);

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

  async function publishPost(code: string, payload: Record<string, unknown>) {
    await createPost(code, payload);
    await refreshPosts();
    showToast("Publicacion guardada.");
  }

  const handleMapClick = useCallback((location: [number, number]) => {
    if (!pointInAllowedZones(location, config.allowedBboxes)) {
      showToast("Ese punto esta fuera de las zonas activas.");
      return;
    }
    setPickedLocation(location);
    setPickHint(false);
  }, [config.allowedBboxes]);

  async function openReportFromSearch(code: string) {
    const found = scopedReports.find((report) => report.code === code);
    if (found) {
      await selectReport(found);
      return;
    }
    try {
      const data = await getReport(code);
      setSelected(data.report);
      setEvents(data.events);
      history.replaceState(null, "", `/r/${code}`);
    } catch {
      setError("No se pudo cargar el detalle.");
    }
  }

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 4200);
  }

  function closeDetail() {
    setSelected(null);
    setEvents([]);
    history.replaceState(null, "", "/");
  }

  if (showFeed) {
    return (
      <main className="signalShell feedShell" aria-label={APP_NAME}>
        <SignalHeader searchTerm={searchTerm} setSearchTerm={setSearchTerm} onReport={() => setCreateOpen(true)} />
        {searchTerm.trim() ? <SearchOverlay results={searchResults} onOpenReport={(code) => { window.location.href = `/r/${code}`; }} /> : null}
        <PublicFeed
          reports={visibleReports}
          posts={feedPosts}
          mediaUploadsEnabled={config.features.mediaUploads}
          onUpload={() => setUploadOpen(true)}
          onReport={() => setCreateOpen(true)}
        />
        <BottomNav active="feed" onReport={() => setCreateOpen(true)} />
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
        {uploadOpen ? (
          <UploadPublicationModal
            enabled={config.features.mediaUploads}
            reports={visibleReports}
            onClose={() => setUploadOpen(false)}
            onSubmit={publishPost}
          />
        ) : null}
        {created ? <CreatedReportDialog created={created} onClose={() => setCreated(null)} /> : null}
        {toast ? <Toast message={toast} /> : null}
      </main>
    );
  }

  return (
    <main className={selected ? "signalShell detailOpen" : "signalShell"} aria-label={APP_NAME}>
      <MapView
        config={config}
        reports={mapReports}
        selectedCode={selected?.code}
        pickedLocation={pickedLocation}
        onBoundsChange={refreshReports}
        onReportSelect={selectReport}
        onMapClick={handleMapClick}
      />

      <SignalHeader searchTerm={searchTerm} setSearchTerm={setSearchTerm} onReport={() => setCreateOpen(true)} />
      {searchTerm.trim() ? <SearchOverlay results={searchResults} onOpenReport={openReportFromSearch} /> : null}
      <FilterChips
        value={filter}
        reports={scopedReports}
        onChange={(next) => {
          setFilter(next);
          void refreshReports(undefined, next);
        }}
      />
      {DEMO_MODE ? <MapControls /> : null}
      {DEMO_MODE ? <DemoPins onOpenCase={() => setSelected(null)} /> : null}
      <MapStatus zoneNames={zoneNames || "Caracas, La Guaira"} />
      {!DEMO_MODE && !selected && !pickedLocation ? <MapEmptyState reports={visibleReports} searchTerm={searchTerm} /> : null}

      {reportsTruncated ? (
        <section className={pickHint && !pickedLocation ? "limitNotice abovePickHint" : "limitNotice"} role="status">
          Mostrando los {reportsLimit} reportes mas recientes. Acerca el mapa para ver una zona mas precisa.
        </section>
      ) : null}

      {!pickedLocation || selected ? (
        <div className="fabStack">
          {!pickedLocation ? (
            <button className="primaryFab" type="button" onClick={() => setCreateOpen(true)}>
              Reportar emergencia
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
      {uploadOpen ? (
        <UploadPublicationModal
          enabled={config.features.mediaUploads}
          reports={visibleReports}
          onClose={() => setUploadOpen(false)}
          onSubmit={publishPost}
        />
      ) : null}

      {selected ? (
        <ReportDetailDrawer
          report={selected}
          events={events}
          ownerToken={selectedOwnerToken}
          onClose={closeDetail}
          onEvent={(type, message, reason) => sendEvent(type, message, reason)}
        />
      ) : DEMO_MODE ? (
        <CasePreviewPanel
          onUpload={() => setUploadOpen(true)}
          onReport={() => setCreateOpen(true)}
          onNearby={() => showToast("Pista recibida: tu disponibilidad queda registrada para revision comunitaria.")}
          onLifeSignal={() => showToast("Señal de vida creada: se agrega como pista publica independiente, sin cerrar el caso.")}
          onShare={() => {
            void navigator.clipboard?.writeText(`${window.location.origin}/caso/${DEMO_CASE.code}`).catch(() => undefined);
            showToast("Enlace de ficha listo para compartir.");
          }}
          onAbuse={() => showToast("Denuncia recibida: el reporte se mantiene visible mientras se revisan señales independientes.")}
        />
      ) : null}

      <BottomNav active="map" onReport={() => setCreateOpen(true)} />
      <AppFooter />
      {toast ? <Toast message={toast} /> : null}
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

function SignalHeader({
  searchTerm,
  setSearchTerm,
  onReport
}: {
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  onReport: () => void;
}) {
  return (
    <header className="signalHeader">
      <a className="signalBrand" href="/" aria-label={`${APP_NAME} inicio`}>
        <span className="heartMark" aria-hidden="true"><HeartIcon /></span>
        <span>Vidas<span>VE</span></span>
      </a>
      <label className="signalSearch">
        <SearchIcon />
        <input
          aria-label="Buscar persona, edificio o ubicacion"
          placeholder="Buscar persona, edificio o ubicacion"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
      </label>
      <nav className="headerLinks" aria-label="Accesos">
        <a href="/feed">Feed publico</a>
        <button className="reportButton" type="button" onClick={onReport}>Reportar <span aria-hidden="true">+</span></button>
      </nav>
    </header>
  );
}

function FilterChips({
  value,
  reports,
  onChange
}: {
  value: string;
  reports: PublicReport[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="signalFilters" aria-label="Filtros del mapa">
      {FILTER_CHIPS.map(({ label, value: filterValue, tone }) => (
        <button
          key={filterValue}
          className={`signalChip ${tone} ${value === filterValue ? "active" : ""}`}
          type="button"
          onClick={() => onChange(filterValue)}
          aria-pressed={value === filterValue}
        >
          <span className="chipIcon" aria-hidden="true"><MiniIcon tone={tone} /></span>
          <span>{label}</span>
          <b>{applyReportFilter(reports, filterValue).length}</b>
        </button>
      ))}
      <a className="signalChip plain" href="/feed"><span className="chipIcon" aria-hidden="true"><LayerIcon /></span><span>Feed</span></a>
    </div>
  );
}

function MobileSearchFilters() {
  return (
    <div className="mobileSearchFilters" aria-label="Filtros de busqueda">
      {["Todos", "Personas", "Ubicaciones", "Edificios"].map((item, index) => (
        <button key={item} className={index === 0 ? "active" : ""} type="button">{item}</button>
      ))}
    </div>
  );
}

function SearchOverlay({
  results,
  onOpenReport
}: {
  results: ReturnType<typeof searchPublicContent>;
  onOpenReport: (code: string) => void | Promise<void>;
}) {
  return (
    <section className="searchOverlay" aria-label="Resultados de busqueda">
      <SearchGroup title="Personas" items={results.people} onOpenReport={onOpenReport} />
      <SearchGroup title="Reportes" items={results.reports} onOpenReport={onOpenReport} />
      <SearchGroup title="Publicaciones" items={results.posts} onOpenReport={onOpenReport} />
      <SearchGroup title="Ubicaciones" items={results.locations} onOpenReport={onOpenReport} />
      <a className="viewAllResults" href="/feed">Ver todos los resultados</a>
    </section>
  );
}

function SearchGroup({
  title,
  items,
  onOpenReport
}: {
  title: string;
  items: SearchItem[];
  onOpenReport: (code: string) => void | Promise<void>;
}) {
  return (
    <div>
      <h3>{title}</h3>
      {items.length ? items.map((item) => (
        <button key={item.key} type="button" onClick={() => void onOpenReport(item.code)}>
          <span>{item.label}</span>
          {item.detail ? <small>{item.detail}</small> : null}
        </button>
      )) : <p>No hay coincidencias.</p>}
    </div>
  );
}

function MapControls() {
  return (
    <div className="mapControls" aria-label="Controles del mapa">
      <button type="button" aria-label="Centrar mapa"><TargetIcon /></button>
      <button type="button" aria-label="Acercar">+</button>
      <button type="button" aria-label="Alejar">-</button>
      <button type="button" aria-label="Capas"><LayerIcon /></button>
    </div>
  );
}

function DemoPins({ onOpenCase }: { onOpenCase: () => void }) {
  return (
    <div className="demoPins" aria-hidden="true">
      {DEMO_PINS.map(([tone, label, left, top], index) => (
        <button
          key={`${tone}-${left}-${top}-${index}`}
          className={`demoPin ${tone}`}
          style={{ left: `${left}%`, top: `${top}%` }}
          type="button"
          onClick={onOpenCase}
          tabIndex={-1}
        >
          {tone === "heart" ? <HeartIcon /> : tone === "purple" ? <BuildingIcon /> : label}
        </button>
      ))}
    </div>
  );
}

function MapStatus({ zoneNames }: { zoneNames: string }) {
  return (
    <section className="mapStatus">
      <span></span>
      <div>
        <strong>Mapa operativo</strong>
        <p>Interaccion limitada a zonas afectadas: {zoneNames}</p>
      </div>
    </section>
  );
}

function Toast({ message }: { message: string }) {
  return <div className="toast" role="status">{message}</div>;
}

function MapEmptyState({ reports, searchTerm }: { reports: PublicReport[]; searchTerm: string }) {
  if (reports.length) return null;
  return (
    <section className="mapEmptyState" role="status">
      <strong>{searchTerm.trim() ? "Sin resultados" : "Sin reportes visibles"}</strong>
      <p>{searchTerm.trim() ? "Prueba otro nombre, codigo o referencia." : "Acerca el mapa o toca un punto dentro de la zona afectada para reportar."}</p>
    </section>
  );
}

function CasePreviewPanel({
  onUpload,
  onReport,
  onNearby,
  onLifeSignal,
  onShare,
  onAbuse
}: {
  onUpload: () => void;
  onReport: () => void;
  onNearby: () => void;
  onLifeSignal: () => void;
  onShare: () => void;
  onAbuse: () => void;
}) {
  return (
    <aside className="casePanel" aria-label="Ficha publica de caso">
      <button className="closePanel" type="button" aria-label="Cerrar ficha">×</button>
      <div className="caseHero">
        <span className="buildingBadge"><BuildingIcon /></span>
        <div>
          <span className="publicBadge">Ficha publica</span>
          <h1>{DEMO_CASE.title}</h1>
          <p>{DEMO_CASE.subtitle}</p>
          <small>Referencia: {DEMO_CASE.reference}</small>
        </div>
        <span className="riskBadge">ALTO RIESGO</span>
      </div>
      <section className="peopleSummary">
        <h2>{DEMO_CASE.peopleCount} personas reportadas en este edificio</h2>
        <p>Informacion publica compartida por familiares y comunidad</p>
      </section>
      <section>
        <h3>Personas en este edificio</h3>
        <div className="personGrid">
          {DEMO_PEOPLE.map((person) => <PersonCard key={person[0]} person={person} />)}
        </div>
        <button className="textLink" type="button">Ver detalles de las 4 personas</button>
      </section>
      <section>
        <h3>Carteles y publicaciones de familiares</h3>
        <div className="mediaStrip">
          {DEMO_MEDIA.map((name) => <FlyerCard key={name} name={name} />)}
          <button className="moreMedia" type="button" onClick={onUpload}>Ver todas<br />8 publicaciones</button>
        </div>
      </section>
      <div className="primaryActions">
        <button className="redAction" type="button" onClick={onNearby}>Estoy cerca</button>
        <button className="greenAction" type="button" onClick={onLifeSignal}>Hay señales de vida</button>
        <button className="outlineAction" type="button" onClick={onShare}>Compartir ficha</button>
        <button className="dangerLinkAction" type="button" onClick={onAbuse}>Reportar abuso / informacion falsa</button>
      </div>
      <p className="communityGuard">Una señal comunitaria crea una pista publica para revisar. No cierra ni oculta el caso por si sola.</p>
      <section>
        <h3>Actualizaciones publicas</h3>
        <ol className="publicTimeline">
          {DEMO_UPDATES.map((update) => <li key={update}>{update}</li>)}
        </ol>
      </section>
      <section className="uploadBox">
        <h3>Subir informacion familiar</h3>
        <p>Esta informacion sera visible publicamente para facilitar busqueda, ayuda y rescate.</p>
        <div>
          <button type="button" onClick={onUpload}>Cargar historia</button>
          <button type="button" onClick={onUpload}>Subir foto</button>
          <button type="button" onClick={onUpload}>Agregar flyer</button>
          <button type="button" onClick={onReport}>Publicar actualizacion</button>
        </div>
      </section>
    </aside>
  );
}

function PersonCard({ person }: { person: (typeof DEMO_PEOPLE)[number] }) {
  return (
    <article className="personCard">
      <Avatar initials={person[5]} color={person[6]} />
      <strong>{person[0]}</strong>
      <span>{person[1]}</span>
      <p>{person[2]}</p>
      <small>Ultimo contacto<br /><b>{person[3]}</b></small>
      <small className="publicContact">{person[7]}</small>
      <em className={person[4].startsWith("ALTO") ? "high" : "medium"}>{person[4]}</em>
    </article>
  );
}

function FlyerCard({ name }: { name: string }) {
  const initials = name.split(" ").map((part) => part[0]).join("").slice(0, 2);
  return (
    <article className="flyerCard">
      <strong>SE BUSCA</strong>
      <Avatar initials={initials} color="#e9c2a6" />
      <span>{name}</span>
      <small>{name.includes("Maria") ? "62 anos" : name.includes("Luis") ? "54 anos" : "28 anos"}</small>
    </article>
  );
}

function PublicFeed({
  reports,
  posts,
  mediaUploadsEnabled,
  onUpload,
  onReport
}: {
  reports: PublicReport[];
  posts: PublicPost[];
  mediaUploadsEnabled: boolean;
  onUpload: () => void;
  onReport: () => void;
}) {
  const signalCount = reports.filter((report) => report.signsOfLife).length;
  const urgentCount = reports.filter((report) => report.priority === "P1").length;
  return (
    <section className="feedPage" aria-label="Publicaciones">
      <div className="feedTitleRow">
        <div>
          <h1>Publicaciones</h1>
          <p>Informacion publica publicada por familias y comunidad.</p>
        </div>
        <select aria-label="Orden del feed" defaultValue="recent">
          <option value="recent">Mas recientes</option>
          <option value="urgent">Mas urgentes</option>
          <option value="signals">Senales de vida</option>
        </select>
      </div>
      <div className="feedComposer">
        <button type="button" onClick={onUpload}>Publicar historia/flyer</button>
        {!mediaUploadsEnabled ? <span className="uploadDisabledNote">Archivos desactivados; texto disponible</span> : null}
        <button type="button" onClick={onReport}>Reportar emergencia</button>
      </div>
      <article className="signalFeedCard">
        <span className="purpleCircle"><BookIcon /></span>
        <div>
          <h2>Señales de vida</h2>
          <p>Reportes activos dentro de la zona afectada</p>
        </div>
        <strong>{signalCount}<br /><small>con señales</small></strong>
      </article>
      <article className="buildingFeedCard">
        <span className="purpleCircle"><BuildingIcon /></span>
        <div>
          <h2>Prioridad P1</h2>
          <p>Reportes que requieren atencion inmediata</p>
        </div>
        <span className="riskBadge">{urgentCount} activos</span>
      </article>
      {posts.length ? posts.map((post) => <FeedPost key={post.id} post={post} />) : reports.length ? reports.map((report) => <ReportFeedPost key={report.code} report={report} />) : <FeedEmptyState />}
    </section>
  );
}

function FeedEmptyState() {
  return (
    <article className="feedEmptyState">
      <strong>No hay publicaciones reales todavia.</strong>
      <p>Cuando se creen reportes en las zonas activas, apareceran aqui por prioridad y fecha.</p>
    </article>
  );
}

function FeedPost({ post }: { post: PublicPost }) {
  return (
    <article className="feedPost">
      <article className="flyerCard reportBadge">
        <strong>{post.type.toUpperCase()}</strong>
        <span>{post.report.code}</span>
        <small>{post.report.priority}</small>
      </article>
      <div className="postBody">
        <header>
          <Avatar initials={post.report.code.slice(-2)} color="#f0c7b8" />
          <strong>{postLabel(post.type)}</strong>
          <span>{post.report.code}</span>
          <time>{new Date(post.createdAt).toLocaleString()}</time>
        </header>
        <p>{post.text}</p>
        <div className="postTags">
          <span>{post.report.addressText}</span>
          <b>{post.report.priority}</b>
          {post.tags.map((tag) => <b key={tag}>{tag}</b>)}
        </div>
        <footer>
          <a className="feedAction" href={`/r/${post.report.code}`}>Abrir ficha</a>
          <button type="button" onClick={() => void navigator.clipboard?.writeText(`${window.location.origin}/r/${post.report.code}`)}>Compartir</button>
        </footer>
      </div>
    </article>
  );
}

function ReportFeedPost({ report }: { report: PublicReport }) {
  const firstPerson = report.persons?.[0];
  return (
    <article className="feedPost">
      <ReportBadge report={report} />
      <div className="postBody">
        <header>
          <Avatar initials={report.code.slice(-2)} color="#f0c7b8" />
          <strong>{labelForType(report.type)}</strong>
          <span>{report.code}</span>
          <time>{new Date(report.updatedAt).toLocaleString()}</time>
        </header>
        {firstPerson ? (
          <p className="personLead">
            {firstPerson.displayName}
            {firstPerson.age ? `, ${firstPerson.age} anos` : ""} · {personStatusLabel(firstPerson.status)}
          </p>
        ) : null}
        <p>{report.knownInfoPublic}</p>
        <div className="postTags">
          <span>{report.addressText}</span>
          {report.persons?.length ? <b>{report.persons.length} persona{report.persons.length === 1 ? "" : "s"}</b> : null}
          <b>{report.priority}</b>
          {report.signsOfLife ? <b>Señales de vida</b> : null}
        </div>
        <footer>
          <a className="feedAction" href={`/r/${report.code}`}>Abrir ficha</a>
          <button type="button" onClick={() => void navigator.clipboard?.writeText(`${window.location.origin}/r/${report.code}`)}>Compartir</button>
        </footer>
      </div>
    </article>
  );
}

function ReportBadge({ report }: { report: PublicReport }) {
  const firstPerson = report.persons?.[0];
  return (
    <article className="flyerCard reportBadge">
      <strong>{report.priority}</strong>
      <span>{firstPerson?.displayName ?? report.code}</span>
      <small>{statusLabel(report.derivedStatus)}</small>
    </article>
  );
}

function UploadPublicationModal({
  enabled,
  reports,
  onClose,
  onSubmit
}: {
  enabled: boolean;
  reports: PublicReport[];
  onClose: () => void;
  onSubmit: (code: string, payload: Record<string, unknown>) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportCode, setReportCode] = useState(reports[0]?.code ?? "");
  const selectedReport = reports.find((report) => report.code === reportCode);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reportCode) return;
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await onSubmit(reportCode, {
        text: form.get("text"),
        postType: form.get("postType"),
        personId: form.get("personId") || undefined,
        tags: form.getAll("tags")
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo publicar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-labelledby="upload-title">
      <form className="modal uploadModal" onSubmit={submit}>
        <header>
          <div>
            <span className="eyebrow">Publicacion familiar</span>
            <h1 id="upload-title">Publicar historia o flyer</h1>
            <p className="helperText">{enabled ? "Publica informacion y luego asocia archivo cuando Blob este activo." : "En este ambiente se guarda texto publico; archivos siguen desactivados."}</p>
          </div>
          <button className="iconButton" type="button" aria-label="Cerrar" onClick={onClose}>×</button>
        </header>
        {reports.length ? (
          <>
            <label>
              Reporte
              <select value={reportCode} onChange={(event) => setReportCode(event.target.value)} required>
                {reports.map((report) => <option key={report.code} value={report.code}>{report.code} · {report.addressText}</option>)}
              </select>
            </label>
            <label>
              Persona relacionada
              <select name="personId" defaultValue="">
                <option value="">Reporte completo</option>
                {selectedReport?.persons?.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}
              </select>
            </label>
            <div className="inlineFields">
              <label>
                Tipo
                <select name="postType" defaultValue="story">
                  <option value="story">Historia</option>
                  <option value="flyer">Flyer</option>
                  <option value="photo">Foto</option>
                  <option value="update">Actualizacion</option>
                </select>
              </label>
              <label>
                Etiqueta
                <select name="tags" defaultValue="">
                  <option value="">Sin etiqueta</option>
                  <option value="familia">Familia</option>
                  <option value="testigo">Testigo</option>
                  <option value="senales">Senales de vida</option>
                  <option value="verificar">Necesita verificacion</option>
                </select>
              </label>
            </div>
            <label>
              Texto publico
              <textarea name="text" required rows={4} maxLength={900} placeholder="Nombre, ubicacion, contexto, ultimo contacto o texto del flyer." />
            </label>
            <p className="safetyNote">Esta informacion sera visible publicamente para facilitar busqueda, ayuda y rescate.</p>
          </>
        ) : (
          <p className="safetyNote">Crea o carga un reporte real antes de publicar historias o flyers.</p>
        )}
        {error ? <p className="formError" role="alert">{error}</p> : null}
        <div className="actions stickyActions">
          {reports.length ? <button type="submit" disabled={busy}>{busy ? "Publicando..." : "Publicar"}</button> : null}
          <button className="ghost" type="button" onClick={onClose}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}

function BottomNav({ active, onReport }: { active: "map" | "feed"; onReport: () => void }) {
  return (
    <nav className="bottomNav" aria-label="Navegacion movil">
      <a className={active === "map" ? "active" : ""} href="/">Mapa</a>
      <a href="#buscar">Buscar</a>
      <a className={active === "feed" ? "active" : ""} href="/feed">Feed</a>
      <button type="button" onClick={onReport}>Reportar</button>
    </nav>
  );
}

function AppFooter() {
  return (
    <footer className="signalFooter">
      <a href="#legal">Aviso legal</a>
      <a href="#privacidad">Privacidad</a>
      <span>Tips de seguridad</span>
      <span>Canales oficiales</span>
      <strong>{APP_NAME} Venezuela</strong>
    </footer>
  );
}

function Avatar({ initials, color }: { initials: string; color: string }) {
  return <span className="avatar" style={{ background: color }}>{initials}</span>;
}

function AvatarStack() {
  return (
    <div className="avatarStack">
      {DEMO_PEOPLE.map((person) => <Avatar key={person[0]} initials={person[5]} color={person[6]} />)}
      <span>+3</span>
    </div>
  );
}

function applyReportFilter(reports: PublicReport[], filter: string): PublicReport[] {
  if (filter === "signals") return reports.filter((report) => report.signsOfLife);
  if (filter === "trapped") return reports.filter((report) => report.type === "trapped_person" || report.type === "collapsed_building_unknown");
  if (filter === "voices") return reports.filter((report) => report.type === "voices_or_hits");
  if (filter.startsWith("P")) return reports.filter((report) => report.priority === filter);
  if (filter !== "all") return reports.filter((report) => report.derivedStatus === filter);
  return reports;
}

interface SearchItem {
  key: string;
  code: string;
  label: string;
  detail?: string;
}

function searchPublicContent(term: string, reports: PublicReport[], posts: PublicPost[] = []) {
  const needle = term.trim().toLowerCase();
  if (!needle) return { reports: [], locations: [], people: [], posts: [] };
  const includes = (value: string | undefined) => value?.toLowerCase().includes(needle);
  const matches = reports.filter((report) => reportSearchValues(report).some(includes));
  const people = matches.flatMap((report) =>
    (report.persons ?? [])
      .filter((person) => [
        person.displayName,
        person.description,
        person.lastKnownPlace,
        person.floorOrUnit,
        person.lastContactText,
        person.publicContactName,
        person.publicContactRelationship
      ].some(includes))
      .map((person) => ({
        key: `${report.code}-${person.id}`,
        code: report.code,
        label: person.displayName,
        detail: `${personStatusLabel(person.status)} · ${report.addressText}`
      }))
  );
  return {
    people: people.slice(0, 5),
    reports: matches.map((report) => ({
      key: `report-${report.code}`,
      code: report.code,
      label: `${report.code} · ${labelForType(report.type)}`,
      detail: `${report.priority} · ${statusLabel(report.derivedStatus)}`
    })).slice(0, 5),
    locations: matches.map((report) => ({
      key: `location-${report.code}`,
      code: report.code,
      label: report.addressText,
      detail: report.landmark || report.area || report.city || report.code
    })).filter((item) => item.label).slice(0, 5),
    posts: posts
      .filter((post) => [post.text, post.report.addressText, post.report.code, ...post.tags].some(includes))
      .map((post) => ({
        key: `post-${post.id}`,
        code: post.report.code,
        label: post.text,
        detail: `${postLabel(post.type)} · ${post.report.addressText}`
      }))
      .slice(0, 5)
  };
}

function reportSearchValues(report: PublicReport): string[] {
  return [
    report.code,
    report.addressText,
    report.landmark,
    report.area,
    report.city,
    report.personDescriptionPublic,
    report.knownInfoPublic,
    report.lastContactText,
    ...(report.persons ?? []).flatMap((person) => [
      person.displayName,
      person.description,
      person.lastContactText,
      person.lastKnownPlace,
      person.floorOrUnit,
      person.publicContactName,
      person.publicContactRelationship
    ])
  ].filter(Boolean) as string[];
}

function labelForType(type: PublicReport["type"]): string {
  const labels: Record<PublicReport["type"], string> = {
    trapped_person: "Persona atrapada",
    missing_last_seen: "Ultima ubicacion",
    voices_or_hits: "Voces o golpes",
    collapsed_building_unknown: "Estructura colapsada"
  };
  return labels[type];
}

function postLabel(type: PublicPostType): string {
  const labels: Record<PublicPostType, string> = {
    story: "Historia familiar",
    photo: "Foto",
    flyer: "Flyer",
    screenshot: "Captura",
    pdf: "PDF",
    update: "Actualizacion"
  };
  return labels[type];
}

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

function personStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    trapped: "Posiblemente atrapada",
    missing: "No localizada",
    signals_of_life: "Con senales de vida",
    found: "Encontrada",
    needs_verification: "Necesita verificacion"
  };
  return labels[status] ?? statusLabel(status);
}

function reportInAllowedZones(report: PublicReport, zones: PublicConfig["allowedBboxes"]): boolean {
  if (!report.location) return true;
  return pointInAllowedZones(report.location.coordinates, zones);
}

function pointInAllowedZones([lng, lat]: [number, number], zones: PublicConfig["allowedBboxes"]): boolean {
  return !zones.length || zones.some((zone) => lng >= zone.minLng && lng <= zone.maxLng && lat >= zone.minLat && lat <= zone.maxLat);
}

function demoReport(code: string, lng: number, lat: number, priority: "P1" | "P2" | "P3", addressText: string, knownInfoPublic: string): PublicReport {
  return {
    id: code,
    code,
    location: { type: "Point", coordinates: [lng, lat] },
    locationAccuracy: "approximate",
    addressText,
    type: "trapped_person",
    derivedStatus: "confirmed",
    priority,
    priorityScore: priority === "P1" ? 95 : priority === "P2" ? 70 : 40,
    peopleCount: "unknown",
    knownInfoPublic,
    signsOfLife: priority === "P1",
    riskFlags: [],
    publishContact: false,
    possibleDuplicateCodes: [],
    counters: { updates: 0, nearbyHelp: 0, resolutionClaims: 0, reopenClaims: 0, abuseFlags: 0 },
    updatedAt: new Date().toISOString()
  };
}

function HeartIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 28s-12-7.5-12-16A7 7 0 0 1 16 7a7 7 0 0 1 12 5c0 8.5-12 16-12 16Z" />
      <path d="M7 16h5l2-5 4 10 2-5h5" />
    </svg>
  );
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 21-4.3-4.3M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z" /></svg>;
}

function BellIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" /></svg>;
}

function BuildingIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4h14v17M9 8h1m4 0h1M9 12h1m4 0h1M9 16h1m4 0h1M3 21h18" /></svg>;
}

function TargetIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-14v3m0 14v3M2 12h3m14 0h3" /></svg>;
}

function LayerIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5" /></svg>;
}

function BookIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5a4 4 0 0 1 4-2h12v16H8a4 4 0 0 0-4 2V5Zm0 0v16" /></svg>;
}

function MiniIcon({ tone }: { tone: string }) {
  if (tone === "purple") return <BuildingIcon />;
  if (tone === "plain") return <LayerIcon />;
  return <HeartIcon />;
}
