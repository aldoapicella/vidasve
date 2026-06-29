import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createEvent, createPost, createReport, getConfig, getReport, isNetworkError, isRetryableError, listPosts, listReports, searchPublic } from "./api/client";
import { CaptchaField, captchaFormReady, captchaPayload, captchaReady, usesTurnstile } from "./components/CaptchaField";
import { CreateReportModal, type CreatedReport } from "./components/CreateReportModal";
import { OfflineBanner } from "./components/OfflineBanner";
import { ReportDetailDrawer } from "./components/ReportDetailDrawer";
import { clearOutbox, enqueueOutbox, listOutbox, removeOutboxItem, updateOutboxItem, type OutboxItem } from "./lib/outbox";
import type { PublicConfig, PublicEvent, PublicPerson, PublicPost, PublicPostType, PublicReport, PublicSearchResponse } from "./types";

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
  features: { mediaUploads: false, geocoding: false },
  captcha: { provider: "text" }
};

const APP_NAME = "VidasVE";
const DEMO_MODE = !import.meta.env.PROD && (import.meta.env.VITE_DEMO_MODE === "true" || new URLSearchParams(location.search).get("demo") === "1");
const MapView = lazy(() => import("./components/MapView").then((module) => ({ default: module.MapView })));
const AdminModerationPage = lazy(() => import("./components/AdminModerationPage").then((module) => ({ default: module.AdminModerationPage })));
type ReportListView = "full" | "map";
type MapBbox = [number, number, number, number];

class MapErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

const DEMO_CASE = {
  code: "VE-ATLANTICO",
  title: "Edificio Atlántico, La Guaira",
  subtitle: "Av. La Playa, Urb. La Atlántida, Catia La Mar, La Guaira",
  reference: "Frente al Hotel Catimar, al lado de la Panadería Atlántico",
  coords: "10.6026, -66.8772",
  peopleCount: 4,
  posts: 8,
  updates: 12
};

const DEMO_PEOPLE = [
  ["Valeria R.", "28 años", "Estudiante de Medicina", "10 May, 11:30 a. m.", "ALTO RIESGO", "VR", "#f6c7b4", "Hermana: contacto privado verificado"],
  ["Luis R.", "54 años", "Ingeniero Electricista", "10 May, 11:15 a. m.", "ALTO RIESGO", "LR", "#d4a27e", "Hijo: contacto privado verificado"],
  ["Santiago R.", "16 años", "Estudiante 4to año", "10 May, 11:20 a. m.", "MEDIO RIESGO", "SR", "#d2b48f", "Tía: contacto privado verificado"],
  ["María R.", "62 años", "Ama de casa", "10 May, 11:10 a. m.", "MEDIO RIESGO", "MR", "#c48f78", "Hija: contacto privado verificado"]
];

const DEMO_POSTS = [
  {
    author: "Ana de García",
    role: "Familiar",
    time: "Hoy, 8:15 a. m.",
    person: "María Rodríguez",
    initials: "MR",
    text: "Mi mamá María Rodríguez fue vista por última vez en el lobby del Edificio Atlántico el 10/05 a las 11:20 a. m. Vestía blusa azul y pantalón gris.",
    place: "Edificio Atlántico, Piso 4",
    risk: "ALTO RIESGO"
  },
  {
    author: "Carlos Rodríguez",
    role: "Familiar",
    time: "Ayer, 6:40 p. m.",
    person: "Luis Rodríguez",
    initials: "LR",
    text: "Luis no ha respondido desde el sismo. Si alguien lo ha visto, por favor avisen.",
    place: "Residencias Parque Caribe, Torre B",
    risk: "RIESGO MEDIO"
  },
  {
    author: "Sofía Martínez",
    role: "Amiga",
    time: "Ayer, 5:10 p. m.",
    person: "Santiago R.",
    initials: "SR",
    text: "Busco a mi amigo Santiago R. Estudiamos juntos. Puede estar cerca de Catia La Mar.",
    place: "Catia La Mar",
    risk: "NECESITA VERIFICACIÓN"
  }
];

const DEMO_MEDIA = ["Valeria Rodríguez", "Luis Rodríguez", "Santiago Rodríguez", "María Rodríguez"];

const DEMO_UPDATES = [
  "Hoy 12:45 p. m. — Vecino reportó sonidos de golpes en el piso 3, lado este del edificio.",
  "Hoy 11:20 a. m. — Familiar confirmó que 4 personas estaban en el apartamento 3B.",
  "Ayer 6:30 p. m. — Se reportó pérdida de comunicación en la zona."
];

const DEMO_REPORTS: PublicReport[] = [
  demoReport("DEMO-18", -67.05, 10.60, "P1", "Edificio Atlántico, La Guaira", "4 personas vinculadas"),
  demoReport("DEMO-14", -67.09, 10.49, "P1", "Torre Miramar, Caracas", "Señales de vida recientes"),
  demoReport("DEMO-09", -66.93, 10.55, "P2", "Macuto", "Atrapados sin confirmar"),
  demoReport("DEMO-06", -66.90, 10.44, "P2", "Petare", "Riesgo medio"),
  demoReport("DEMO-05", -67.14, 10.53, "P3", "La Guaira", "Información incompleta")
];

const DEMO_FEED_POSTS: PublicPost[] = DEMO_POSTS.map((post, index) => ({
  id: `demo-post-${index}`,
  reportCode: DEMO_REPORTS[index % DEMO_REPORTS.length].code,
  reportId: DEMO_REPORTS[index % DEMO_REPORTS.length].id,
  personId: DEMO_REPORTS[index % DEMO_REPORTS.length].persons?.[0]?.id,
  text: post.text,
  type: "flyer",
  tags: [post.role.toLowerCase()],
  createdAt: new Date(Date.now() - index * 60 * 60 * 1000).toISOString(),
  report: {
    code: DEMO_REPORTS[index % DEMO_REPORTS.length].code,
    addressText: post.place,
    priority: DEMO_REPORTS[index % DEMO_REPORTS.length].priority,
    derivedStatus: DEMO_REPORTS[index % DEMO_REPORTS.length].derivedStatus
  }
}));

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
  { label: "Edificios", value: "buildings", tone: "purple" }
] as const;

type HelpContact = { name: string; phones: string[]; note: string; source: string };
type HelpContactGroup = { title: string; items: HelpContact[] };
type InfoPageData = {
  title: string;
  intro: string;
  sections: Array<[string, string]>;
  contactGroups?: HelpContactGroup[];
};

const HELP_CONTACT_GROUPS: HelpContactGroup[] = [
  {
    title: "Autoridades y primera respuesta",
    items: [
      { name: "VEN 9-1-1", phones: ["911"], note: "Emergencias integradas de seguridad, salud, riesgo y ambulancias.", source: "https://ven911.gob.ve/" },
      { name: "Protección Civil Nacional", phones: ["0800-724-8451"], note: "Sede nacional / 0800-PCIVIL1.", source: "https://www.pcivil.gob.ve/" },
      { name: "Protección Civil La Guaira", phones: ["0424-207-5335"], note: "Dirección estadal para desastres y riesgo.", source: "https://www.pcivil.gob.ve/la-guaira/" },
      { name: "Bomberos de Caracas", phones: ["0212-545-4545", "0212-575-3332", "0212-575-1823"], note: "Incendios, rescate y subestaciones del Distrito Capital.", source: "https://2001online.com/servicios/conozca-los-numeros-de-emergencia-para-comunicarse-en-caso-de-una-eventualidad-en-la-gran-caracas-20261511420" },
      { name: "Bomberos La Guaira", phones: ["0212-332-2165"], note: "Incendios y rescate en La Guaira.", source: "https://laverdaddevargas.com/conoce-los-numeros-de-emergencia-en-la-guaira/" },
      { name: "Seguridad La Guaira", phones: ["0412-999-4426"], note: "WhatsApp local para seguridad y denuncias.", source: "https://laverdaddevargas.com/conoce-los-numeros-de-emergencia-en-la-guaira/" }
    ]
  },
  {
    title: "Hospitales y atención médica",
    items: [
      { name: "Hospital Universitario de Caracas", phones: ["0212-606-7209", "0212-606-7821", "0212-606-7458"], note: "Emergencia adultos y pediátrica HUC/UCV.", source: "https://sanasana.ucv.ve/sanasana.php?module=numeros" },
      { name: "Hospital Dr. Miguel Pérez Carreño", phones: ["0212-407-8001", "0212-407-8002", "0212-407-8006"], note: "Centro IVSS en Distrito Capital.", source: "https://www.ivss.gov.ve/contenido/Localizacion-Centros-de-Salud-IVSS%3A-Distrito-Capital" },
      { name: "Hospital Dr. Domingo Luciani", phones: ["0212-205-6500", "0212-205-6501"], note: "Centro IVSS El Llanito, Miranda.", source: "https://www.ivss.gov.ve/contenido/Localizacion-Centros-de-Salud-IVSS%3AEstado-Miranda" },
      { name: "Hospital José María Vargas, La Guaira", phones: ["0212-331-6555", "0212-332-7394", "0212-332-9667"], note: "Hospital IVSS del litoral central.", source: "https://www.ivss.gov.ve/contenido/Localizacion-Centros-de-Salud-IVSS%3A-Vargas" },
      { name: "Bomberos UCV", phones: ["0212-605-2222", "0212-605-4930", "0212-605-4934"], note: "Apoyo universitario y respuesta en Ciudad Universitaria.", source: "https://sanasana.ucv.ve/sanasana.php?module=numeros" },
      { name: "CIATO / tóxicos UCV", phones: ["0212-605-2686", "0212-605-2660", "0800-869-4267"], note: "Información toxicológica.", source: "https://sanasana.ucv.ve/sanasana.php?module=numeros" }
    ]
  },
  {
    title: "ONGs y apoyo humanitario",
    items: [
      { name: "Cáritas Venezuela", phones: ["0212-443-3153"], note: "Asistencia humanitaria y coordinación en Montalbán.", source: "https://caritasvenezuela.org/contacto/" },
      { name: "CICR Venezuela", phones: ["0424-172-1364", "0412-636-5015"], note: "Centro de Contacto Comunitario y restablecimiento de contacto familiar.", source: "https://www.icrc.org/es/donde-trabajamos/venezuela" },
      { name: "UNICEF / Línea de Contacto ONU", phones: ["0800-242-6200", "0424-770-0048"], note: "Comentarios, reclamos, sugerencias y reporte de irregularidades.", source: "https://www.unicef.org/venezuela/" },
      { name: "Cruz Roja Venezolana / socorristas", phones: ["0212-571-4713", "0212-571-4380"], note: "Socorristas y sede Caracas.", source: "https://cruzroja.ve/" },
      { name: "Fe y Alegría Venezuela", phones: ["0212-564-7423", "0212-563-1776", "0212-564-5013", "0212-563-2048"], note: "Red educativa y apoyo comunitario.", source: "https://www.feyalegria.org/venezuela/contactanos/" },
      { name: "MSF España", phones: ["+34 933-046-100"], note: "Contacto internacional de Médicos Sin Fronteras.", source: "https://www.msf.es/territorio/venezuela" }
    ]
  }
];

const INFO_PAGES: Record<string, InfoPageData> = {
  "/como-funciona": {
    title: "Cómo funciona",
    intro: "VidasVE abre directamente el mapa y organiza reportes comunitarios sin exigir login para pedir ayuda.",
    sections: [
      ["1. Reporta el punto", "Toca Reportar, marca una ubicación como en un mapa normal o envía el reporte sin punto exacto cuando no tengas coordenadas confiables."],
      ["2. El mapa agrupa señales", "Los reportes aparecen como puntos numerados y clusters por zona. Al tocar un cluster el mapa se acerca; al tocar un punto se abre la ficha pública."],
      ["3. La comunidad aporta pistas", "Cualquier persona puede agregar información pública, señales de vida, duplicados o una solicitud de revisión. Eso no cierra ni oculta reportes."],
      ["4. Cierre protegido", "Solo el enlace privado del propietario puede resolver de inmediato. Terceros solo crean señales independientes para que el caso sea revisado."]
    ]
  },
  "/centro-ayuda": {
    title: "Centro de ayuda",
    intro: "Contactos públicos para emergencias, hospitales y organizaciones humanitarias en las zonas activas. Marca 911 primero si hay riesgo inmediato.",
    sections: [
      ["Emergencia inmediata", "Usa estos teléfonos para activar respuesta oficial. VidasVE no reemplaza llamadas a autoridades, ambulancias, bomberos ni protección civil."],
      ["Datos sujetos a cambio", "Los números vienen de fuentes públicas enlazadas. Si una línea no responde, intenta VEN 9-1-1, Protección Civil o el hospital más cercano."]
    ],
    contactGroups: HELP_CONTACT_GROUPS
  },
  "/aviso-legal": {
    title: "Aviso legal",
    intro: "VidasVE organiza reportes comunitarios para orientar búsqueda y rescate. No reemplaza canales oficiales ni servicios de emergencia.",
    sections: [
      ["Uso de la información", "La información publicada puede venir de familiares, testigos o comunidad. Debe tratarse como pista operativa pendiente de verificación."],
      ["Sin garantías", "El servicio puede tener errores, demoras o datos incompletos durante una emergencia. Confirma decisiones críticas con autoridades, rescatistas u organismos competentes."],
      ["Conducta prohibida", "No publiques información falsa, datos privados innecesarios, amenazas, doxxing ni contenido que ponga en riesgo a personas afectadas o equipos de rescate."],
      ["Reportes y cierres", "Un tercero no puede cerrar u ocultar un reporte por sí solo. Las señales comunitarias quedan como eventos públicos para revisión independiente."]
    ]
  },
  "/privacidad": {
    title: "Privacidad",
    intro: "Por defecto VidasVE minimiza datos sensibles y no expone teléfonos o contactos privados en fichas públicas.",
    sections: [
      ["Datos públicos", "Las fichas pueden mostrar ubicación aproximada, descripción pública, estado operativo, publicaciones familiares y eventos comunitarios."],
      ["Datos privados", "Los contactos directos y enlaces de propietario se tratan como privados. No compartas el token de propietario en redes sociales ni chats públicos."],
      ["Seguridad", "La API aplica proof-of-work, honeypot y límites por IP, dispositivo, contacto, reporte y zona para reducir abuso automatizado."],
      ["Retención", "Los reportes y eventos tienen retención limitada según la configuración de infraestructura. Pide correcciones si detectas información falsa o riesgosa."]
    ]
  },
  "/tips-seguridad": {
    title: "Tips de seguridad",
    intro: "Usa VidasVE para coordinar información, no para entrar en zonas de riesgo sin autorización.",
    sections: [
      ["Si estás afectado", "Reporta la ubicación más aproximada, número de personas, señales de vida, último contacto y referencias visuales útiles."],
      ["Si eres familiar", "Publica historias, fotos o flyers solo con información necesaria. Evita teléfonos personales en texto público."],
      ["Si estás cerca", "No ingreses a estructuras dañadas. Crea una pista de ayuda o señales de vida y comparte detalles verificables."],
      ["Verificación", "Prioriza reportes con ubicación clara, múltiples señales independientes y datos consistentes. Denuncia abuso sin intentar ocultar reportes legítimos."]
    ]
  }
} as const;

export function App() {
  const [config, setConfig] = useState<PublicConfig>(DEFAULT_CONFIG);
  const [configReady, setConfigReady] = useState(false);
  const [reports, setReports] = useState<PublicReport[]>([]);
  const [filter, setFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selected, setSelected] = useState<PublicReport | null>(null);
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [feedPosts, setFeedPosts] = useState<PublicPost[]>([]);
  const [reportsTruncated, setReportsTruncated] = useState(false);
  const [reportsLimit, setReportsLimit] = useState(500);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(location.pathname === "/reportar");
  const [pickedLocation, setPickedLocation] = useState<[number, number] | undefined>();
  const [pickHint, setPickHint] = useState(false);
  const [created, setCreated] = useState<CreatedReport | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [remoteSearchResults, setRemoteSearchResults] = useState<ReturnType<typeof searchPublicContent> | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outboxItems, setOutboxItems] = useState<OutboxItem[]>(() => listOutbox());
  const [outboxError, setOutboxError] = useState<string | null>(null);
  const filterRef = useRef(filter);
  const flushingOutboxRef = useRef(false);
  const lastMapBboxRef = useRef<MapBbox | undefined>();
  const reportsRequestKeyRef = useRef("");
  const showFeed = location.pathname === "/feed";
  const infoPage = INFO_PAGES[location.pathname];
  const personRouteId = location.pathname.match(/^\/persona\/([^/]+)/)?.[1];
  const privateAccess = useMemo(() => {
    const match = location.pathname.match(/^\/(?:r|caso)\/([^/]+)/);
    const token =
      new URLSearchParams(location.hash.slice(1)).get("ownerToken") ??
      new URLSearchParams(location.search).get("ownerToken");
    return match && token ? { code: decodeURIComponent(match[1]).toUpperCase(), token } : undefined;
  }, []);
  const scopedReports = useMemo(() => reports.filter((report) => reportInAllowedZones(report, config.allowedBboxes)), [reports, config.allowedBboxes]);
  const contentReports = DEMO_MODE ? DEMO_REPORTS : scopedReports;
  const contentPosts = DEMO_MODE ? DEMO_FEED_POSTS : feedPosts;
  const personRoute = useMemo(() => personRouteId ? findPerson(contentReports, decodeURIComponent(personRouteId)) : undefined, [personRouteId, contentReports]);
  const filteredReports = useMemo(() => applyReportFilter(contentReports, filter), [contentReports, filter]);
  const visibleReports = useMemo(() => {
    const needle = normalizeSearch(searchTerm);
    if (!needle) return filteredReports;
    return filteredReports.filter((report) =>
      reportSearchValues(report)
        .filter(Boolean)
        .some((value) => normalizeSearch(String(value)).includes(needle))
    );
  }, [filteredReports, searchTerm]);
  const mapReports = DEMO_MODE && !searchTerm.trim() ? DEMO_REPORTS : visibleReports;
  const selectedOwnerToken =
    privateAccess && selected?.code.toUpperCase() === privateAccess.code ? privateAccess.token : undefined;
  const zoneNames = config.allowedBboxes.map((zone) => zone.name).join(", ");
  const localSearchResults = useMemo(() => searchPublicContent(searchTerm, contentReports, contentPosts), [contentPosts, contentReports, searchTerm]);
  const searchResults = remoteSearchResults ?? localSearchResults;

  useEffect(() => {
    let active = true;
    getConfig()
      .then((next) => {
        if (!active) return;
        setConfig({ ...DEFAULT_CONFIG, ...next, features: { ...DEFAULT_CONFIG.features, ...next.features } });
        setConfigReady(true);
      })
      .catch(() => {
        if (!active) return;
        setConfigReady(true);
        setError("La configuración no está disponible. El mapa sigue en modo local.");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    filterRef.current = filter;
  }, [filter]);

  useEffect(() => {
    const match = location.pathname.match(/^\/(?:r|caso)\/([^/]+)/);
    if (!match) return;
    if (DEMO_MODE) {
      const report = DEMO_REPORTS.find((item) => item.code === decodeURIComponent(match[1]).toUpperCase());
      if (report) {
        setSelected(report);
        setEvents(demoEvents(report));
      }
      return;
    }
    getReport(match[1])
      .then((data) => {
        setSelected(data.report);
        setEvents(data.events);
      })
      .catch(() => setError("No se pudo abrir ese reporte."));
  }, []);

  const refreshReports = useCallback(async (bbox?: MapBbox, filterOverride?: string, view: ReportListView = "map") => {
    const activeFilter = filterOverride ?? filterRef.current;
    const key = `${view}:${activeFilter}:${bbox?.map((value) => value.toFixed(5)).join(",") ?? "all"}`;
    if (reportsRequestKeyRef.current === key) return;
    reportsRequestKeyRef.current = key;
    setReportsLoading(true);
    try {
      const response = await listReports(bbox, activeFilter, view);
      if (reportsRequestKeyRef.current !== key) return;
      setReports(response.items);
      setReportsTruncated(response.truncated);
      setReportsLimit(response.limit);
      setError(null);
    } catch {
      if (reportsRequestKeyRef.current === key) {
        reportsRequestKeyRef.current = "";
        setError("No se pudieron cargar reportes. Revisa la API o intenta de nuevo.");
      }
    } finally {
      if (reportsRequestKeyRef.current === key) setReportsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (personRouteId) void refreshReports(undefined, "all", "full");
  }, [personRouteId, refreshReports]);

  const refreshPosts = useCallback(async () => {
    try {
      setFeedPosts((await listPosts()).items);
    } catch {
      setFeedPosts([]);
    }
  }, []);

  const refreshOutbox = useCallback(() => {
    setOutboxItems(listOutbox());
  }, []);

  const flushOutbox = useCallback(async () => {
    const items = listOutbox();
    if (!items.length) {
      refreshOutbox();
      return;
    }
    if (flushingOutboxRef.current) return;
    flushingOutboxRef.current = true;
    setOutboxError(null);
    try {
      for (const item of items) {
        try {
          if (item.kind === "create_report") {
            if (item.payload.captchaToken) {
              removeOutboxItem(item.id);
              continue;
            }
            await createReport(item.payload);
          } else if (item.kind === "event") {
            if (item.ownerToken) {
              removeOutboxItem(item.id);
              continue;
            }
            await createEvent(item.code, item.type, item.payload, item.ownerToken);
          } else {
            await createPost(item.code, item.payload);
          }
          removeOutboxItem(item.id);
        } catch (err) {
          const next = {
            ...item,
            attempts: item.attempts + 1,
            lastError: err instanceof Error ? err.message : "No se pudo reenviar."
          };
          updateOutboxItem(next);
          setOutboxError(next.lastError ?? null);
          if (isRetryableError(err)) break;
        }
      }
      refreshOutbox();
      const tasks: Array<Promise<void>> = [
        refreshReports(showFeed ? undefined : lastMapBboxRef.current, filterRef.current, showFeed ? "full" : "map")
      ];
      if (showFeed) tasks.push(refreshPosts());
      await Promise.all(tasks);
    } finally {
      flushingOutboxRef.current = false;
    }
  }, [refreshOutbox, refreshPosts, refreshReports, showFeed]);

  useEffect(() => {
    const retry = () => void flushOutbox();
    window.addEventListener("online", retry);
    if (navigator.onLine) void flushOutbox();
    return () => window.removeEventListener("online", retry);
  }, [flushOutbox]);

  useEffect(() => {
    const query = searchTerm.trim();
    if (DEMO_MODE || query.length < 2) {
      setRemoteSearchResults(null);
      return;
    }
    let active = true;
    const timeout = window.setTimeout(() => {
      searchPublic(query)
        .then((result) => {
          if (active) setRemoteSearchResults(searchRemoteContent(result));
        })
        .catch(() => {
          if (active) setRemoteSearchResults(null);
        });
    }, 220);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [searchTerm]);

  useEffect(() => {
    if (!showFeed) return;
    void refreshReports(undefined, filter, "full");
    void refreshPosts();
  }, [filter, refreshPosts, refreshReports, showFeed]);

  async function selectReport(report: PublicReport) {
    setSelected(report);
    if (DEMO_MODE) {
      setEvents(demoEvents(report));
      history.replaceState(null, "", `/caso/${report.code}`);
      return;
    }
    try {
      const data = await getReport(report.code);
      setSelected(data.report);
      setEvents(data.events);
      history.replaceState(null, "", `/caso/${report.code}`);
    } catch {
      setError("No se pudo cargar el detalle.");
    }
  }

  async function sendEvent(type: Parameters<typeof createEvent>[1], message: string, reason?: string, captcha?: Record<string, unknown>) {
    if (!selected) return;
    const payload = { message, reason, ...captcha };
    try {
      const response = await createEvent(selected.code, type, payload, selectedOwnerToken);
      setSelected(response.report);
      if (response.event.public) setEvents((current) => [...current, response.event]);
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      if (usesTurnstile(config)) throw new Error("La verificación humana requiere conexión. Reintenta cuando vuelva la red.");
      if (selectedOwnerToken) throw new Error("La acción de propietario requiere conexión. Reintenta cuando vuelva la red.");
      enqueueOutbox({ kind: "event", code: selected.code, type, payload, ownerToken: selectedOwnerToken });
      refreshOutbox();
      showToast("Actualización guardada pendiente de conexión.");
    }
  }

  async function addPerson(person: PublicPerson, captcha?: Record<string, unknown>) {
    if (!selected) return;
    if (DEMO_MODE) {
      setSelected(addPersonToLocalReport(selected, person));
      setEvents((current) => [...current, demoEvent(selected, "add_person", `Persona agregada: ${person.displayName}`, person.id)]);
      showToast("Persona agregada en demo.");
      return;
    }
    const payload = {
      person,
      message: `Persona agregada: ${person.displayName}`,
      ...captcha
    };
    try {
      const response = await createEvent(selected.code, "add_person", payload);
      setSelected(response.report);
      if (response.event.public) setEvents((current) => [...current, response.event]);
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      if (usesTurnstile(config)) throw new Error("La verificación humana requiere conexión. Reintenta cuando vuelva la red.");
      enqueueOutbox({ kind: "event", code: selected.code, type: "add_person", payload });
      refreshOutbox();
      showToast("Persona guardada pendiente de conexión.");
    }
  }

  async function publishPost(code: string, payload: Record<string, unknown>) {
    try {
      await createPost(code, payload);
      await refreshPosts();
      showToast("Publicación guardada.");
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      if (usesTurnstile(config)) throw new Error("La verificación humana requiere conexión. Reintenta cuando vuelva la red.");
      const file = payload.file instanceof File && payload.file.size > 0 ? payload.file : undefined;
      if (file) throw new Error("El archivo requiere conexión. Publica el texto ahora o reintenta cuando tengas internet.");
      enqueueOutbox({ kind: "post", code, payload });
      refreshOutbox();
      showToast("Publicación guardada pendiente de conexión.");
    }
  }

  const handleMapClick = useCallback((location: [number, number]) => {
    if (!pointInAllowedZones(location, config.allowedBboxes)) {
      showToast("Ese punto está fuera de las zonas activas.");
      return;
    }
    setPickedLocation(location);
    setPickHint(false);
  }, [config.allowedBboxes]);

  const handleBoundsChange = useCallback((bbox?: MapBbox) => {
    lastMapBboxRef.current = bbox;
    void refreshReports(bbox, filterRef.current, "map");
  }, [refreshReports]);

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
      history.replaceState(null, "", `/caso/${code}`);
    } catch {
      setError("No se pudo cargar el detalle.");
    }
  }

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 4200);
  }

  function reportQueued() {
    setCreateOpen(false);
    refreshOutbox();
    showToast("Reporte guardado pendiente de conexión.");
  }

  function openUploadForReport() {
    setUploadOpen(true);
  }

  function discardOutbox() {
    clearOutbox();
    refreshOutbox();
    setOutboxError(null);
  }

  const outboxBanner = outboxItems.length ? (
    <OfflineBanner
      message={`${outboxItems.length} envío${outboxItems.length === 1 ? "" : "s"} pendiente${outboxItems.length === 1 ? "" : "s"}.`}
      detail={outboxError ?? outboxItems[0]?.lastError}
      retryLabel="Enviar ahora"
      onRetry={() => void flushOutbox()}
      onDiscard={discardOutbox}
    />
  ) : null;

  async function shareCaseLink(code: string) {
    const url = `${window.location.origin}/caso/${code}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `Ficha ${code}`, url });
        showToast("Ficha compartida.");
        return;
      } catch {
        // Fall back to clipboard when the native share sheet is unavailable or cancelled.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast("Enlace de ficha copiado.");
    } catch {
      showToast("No se pudo compartir el enlace.");
    }
  }

  function beginReportFlow() {
    if (pickedLocation || !config.azureMapsClientId) {
      setCreateOpen(true);
      return;
    }
    setPickHint(true);
    showToast("Toca el punto del mapa donde ocurre la emergencia.");
  }

  function closeDetail() {
    setSelected(null);
    setEvents([]);
    history.replaceState(null, "", "/");
  }

  if (location.pathname === "/admin") {
    return (
      <Suspense fallback={<main className="adminShell"><p className="adminEmpty">Cargando moderación...</p></main>}>
        <AdminModerationPage />
      </Suspense>
    );
  }

  if (infoPage) {
    return (
      <main className="signalShell pageShell" aria-label={APP_NAME}>
        <SignalHeader searchTerm={searchTerm} setSearchTerm={setSearchTerm} onReport={() => setCreateOpen(true)} />
        {searchTerm.trim() ? <SearchOverlay results={searchResults} onOpenReport={openReportFromSearch} /> : null}
        <InfoPage page={infoPage} />
        <BottomNav active="map" onReport={() => setCreateOpen(true)} />
        <AppFooter />
        {createOpen ? (
          <CreateReportModal
            config={config}
            onClose={() => setCreateOpen(false)}
            onCreated={(result) => {
              setCreated(result);
              setCreateOpen(false);
              void refreshReports(lastMapBboxRef.current, filterRef.current, "map");
            }}
            onQueued={reportQueued}
          />
        ) : null}
        {created ? <CreatedReportDialog created={created} onClose={() => setCreated(null)} /> : null}
        {outboxBanner}
        {toast ? <Toast message={toast} /> : null}
      </main>
    );
  }

  if (showFeed) {
    return (
      <main className="signalShell feedShell" aria-label={APP_NAME}>
        <SignalHeader searchTerm={searchTerm} setSearchTerm={setSearchTerm} onReport={() => setCreateOpen(true)} />
        <MobileSearchFilters />
        {searchTerm.trim() ? <SearchOverlay results={searchResults} onOpenReport={(code) => { window.location.href = `/caso/${code}`; }} /> : null}
        <PublicFeed
          reports={visibleReports}
          posts={contentPosts}
          configReady={configReady}
          loading={!configReady || reportsLoading}
          mediaUploadsEnabled={config.features.mediaUploads}
          onUpload={() => openUploadForReport()}
          onShare={(code) => void shareCaseLink(code)}
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
              void refreshReports(undefined, filterRef.current, "full");
            }}
            onQueued={reportQueued}
          />
        ) : null}
        {uploadOpen ? (
          <UploadPublicationModal
            enabled={config.features.mediaUploads}
            config={config}
            reports={contentReports}
            onClose={() => setUploadOpen(false)}
            onSubmit={publishPost}
          />
        ) : null}
        {created ? <CreatedReportDialog created={created} onClose={() => setCreated(null)} /> : null}
        {outboxBanner}
        {toast ? <Toast message={toast} /> : null}
      </main>
    );
  }

  return (
    <main className={selected || personRoute ? "signalShell detailOpen" : "signalShell"} aria-label={APP_NAME}>
      <MapErrorBoundary fallback={<div className="mapLoading"><span /><strong>No se pudo cargar el mapa.</strong><button type="button" onClick={() => setCreateOpen(true)}>Reportar sin mapa</button></div>}>
        <Suspense fallback={<div className="mapLoading"><span /><strong>Cargando mapa...</strong></div>}>
          <MapView
            config={config}
            configReady={configReady}
            reports={mapReports}
            selectedCode={selected?.code}
            pickedLocation={pickedLocation}
            isPicking={pickHint && !pickedLocation && !selected}
            onBoundsChange={handleBoundsChange}
            onReportSelect={selectReport}
            onMapClick={handleMapClick}
          />
        </Suspense>
      </MapErrorBoundary>

      <SignalHeader searchTerm={searchTerm} setSearchTerm={setSearchTerm} onReport={beginReportFlow} />
      {searchTerm.trim() ? <SearchOverlay results={searchResults} onOpenReport={openReportFromSearch} /> : null}
      {configReady ? (
        <FilterChips
          value={filter}
          reports={contentReports}
          onChange={(next) => {
            setFilter(next);
            void refreshReports(lastMapBboxRef.current, next, "map");
          }}
        />
      ) : null}
      {DEMO_MODE ? <MapControls /> : null}
      {DEMO_MODE ? <DemoPins onOpenCase={() => void selectReport(DEMO_REPORTS[0])} /> : null}
      {configReady ? <MapStatus zoneNames={zoneNames || "Caracas, La Guaira"} /> : null}
      {configReady && !DEMO_MODE && !selected && !pickedLocation ? <MapEmptyState reports={visibleReports} searchTerm={searchTerm} /> : null}

      {reportsTruncated ? (
        <section className={pickHint && !pickedLocation ? "limitNotice abovePickHint" : "limitNotice"} role="status">
          Mostrando los {reportsLimit} reportes más recientes. Acerca el mapa para ver una zona más precisa.
        </section>
      ) : null}

      {configReady && (!pickedLocation || selected) ? (
        <div className="fabStack">
          {!pickedLocation ? (
            <button className="primaryFab" type="button" onClick={beginReportFlow}>
              {pickHint ? "Toca un punto del mapa" : "Reportar emergencia"}
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
            Reportar aquí
          </button>
          <button className="ghost" type="button" onClick={() => setPickedLocation(undefined)}>
            Quitar
          </button>
        </section>
      ) : null}

      {pickHint && !pickedLocation ? (
        <section className="pickHint" role="status">
          <strong>Toca el punto exacto dentro de las zonas activas.</strong>
          <span>Luego confirma con "Reportar aquí".</span>
          <button type="button" onClick={() => {
            setPickHint(false);
            setToast(null);
            setCreateOpen(true);
          }}>Reportar sin punto exacto</button>
          <button className="ghost" type="button" onClick={() => setPickHint(false)}>Cancelar</button>
        </section>
      ) : null}

      {error ? <OfflineBanner message={error} onRetry={() => void refreshReports(lastMapBboxRef.current, filterRef.current, "map")} /> : null}
      {outboxBanner}

      {createOpen ? (
        <CreateReportModal
          defaultLocation={pickedLocation}
          config={config}
          onClose={() => setCreateOpen(false)}
          onCreated={(result) => {
            setCreated(result);
            setCreateOpen(false);
            void refreshReports(lastMapBboxRef.current, filterRef.current, "map");
          }}
          onQueued={reportQueued}
        />
      ) : null}

      {created ? <CreatedReportDialog created={created} onClose={() => setCreated(null)} /> : null}
      {uploadOpen ? (
        <UploadPublicationModal
          enabled={config.features.mediaUploads}
          config={config}
          reports={contentReports}
          onClose={() => setUploadOpen(false)}
          onSubmit={publishPost}
        />
      ) : null}

      {selected ? (
        <ReportDetailDrawer
          report={selected}
          config={config}
          events={events}
          ownerToken={selectedOwnerToken}
          onClose={closeDetail}
          onEvent={(type, message, reason, captcha) => sendEvent(type, message, reason, captcha)}
          onAddPerson={addPerson}
        />
      ) : personRoute ? (
        <PersonProfileDrawer match={personRoute} onClose={closeDetail} />
      ) : DEMO_MODE ? (
        <CasePreviewPanel
          onUpload={() => openUploadForReport()}
          onReport={() => setCreateOpen(true)}
          onLifeSignal={() => showToast("Señal de vida creada: se agrega como pista pública independiente, sin cerrar el caso.")}
          onShare={() => void shareCaseLink(DEMO_CASE.code)}
          onAbuse={() => showToast("Denuncia recibida: el reporte se mantiene visible mientras se revisan señales independientes.")}
        />
      ) : null}

      <BottomNav active="map" onReport={beginReportFlow} />
      <AppFooter />
      {toast ? <Toast message={toast} /> : null}
    </main>
  );
}

function InfoPage({ page }: { page: InfoPageData }) {
  return (
    <article className="infoPage">
      <a className="backLink" href="/">Volver al mapa</a>
      <header>
        <span className="eyebrow">VidasVE Venezuela</span>
        <h1>{page.title}</h1>
        <p>{page.intro}</p>
      </header>
      <div className="infoGrid">
        {page.sections.map(([title, body]) => (
          <section key={title}>
            <h2>{title}</h2>
            <p>{body}</p>
          </section>
        ))}
      </div>
      {page.contactGroups ? <HelpContacts groups={page.contactGroups} /> : null}
    </article>
  );
}

function HelpContacts({ groups }: { groups: HelpContactGroup[] }) {
  return (
    <div className="helpContactGrid">
      {groups.map((group) => (
        <section key={group.title} className="helpContactGroup">
          <h2>{group.title}</h2>
          <ul>
            {group.items.map((item) => (
              <li key={item.name}>
                <div>
                  <strong>{item.name}</strong>
                  <p>{item.note}</p>
                </div>
                <div className="helpPhones">
                  {item.phones.map((phone) => <a key={phone} href={`tel:${phone.replace(/[^\d+]/g, "")}`}>{phone}</a>)}
                </div>
                <a className="sourceLink" href={item.source} target="_blank" rel="noreferrer">Fuente</a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function formatLocation([lng, lat]: [number, number]): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function addPersonToLocalReport(report: PublicReport, person: PublicPerson): PublicReport {
  const persons = [...(report.persons ?? []), person];
  return {
    ...report,
    peopleCount: countFromPersons(persons.length, report.peopleCount),
    persons,
    personDescriptionPublic: persons
      .map((item) => [item.displayName, item.age ? `${item.age} años` : undefined, item.lastKnownPlace || item.floorOrUnit].filter(Boolean).join(", "))
      .join("; ")
      .slice(0, 240),
    lastContactText: report.lastContactText || person.lastContactText,
    signsOfLife: report.signsOfLife || person.status === "signals_of_life",
    updatedAt: new Date().toISOString()
  };
}

function countFromPersons(personCount: number, fallback: string): string {
  if (personCount === 1) return "1";
  if (personCount >= 2 && personCount <= 5) return "2-5";
  if (personCount > 5) return "more_than_5";
  return fallback;
}

function demoEvents(report: PublicReport): PublicEvent[] {
  return DEMO_UPDATES.map((message, index) => demoEvent(report, "add_info", message, undefined, index));
}

function demoEvent(report: PublicReport, type: PublicEvent["type"], message: string, personId?: string, index = 0): PublicEvent {
  return {
    id: `demo-event-${report.code}-${type}-${Date.now()}-${index}`,
    reportId: report.id,
    reportCode: report.code,
    type,
    message,
    personId,
    public: true,
    abuseScore: 0,
    createdAt: new Date(Date.now() - index * 60 * 60 * 1000).toISOString()
  };
}

function CreatedReportDialog({ created, onClose }: { created: CreatedReport; onClose: () => void }) {
  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-labelledby="created-title">
      <section className="modal compactModal">
        <h1 id="created-title">Reporte creado: {created.code}</h1>
        <p>
          Guarda este enlace privado. Solo con este enlace puedes marcar el reporte como resuelto de forma inmediata.
          No lo compartas públicamente.
        </p>
        <div className="copyField">{created.ownerEditUrl}</div>
        <div className="actions">
          <button type="button" onClick={() => void navigator.clipboard.writeText(created.ownerEditUrl)}>
            Copiar enlace privado
          </button>
          <a className="button secondary" href={created.publicUrl}>
            Abrir público
          </a>
          <button className="ghost" type="button" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </section>
    </div>
  );
}

function PersonProfileDrawer({
  match,
  onClose
}: {
  match: { report: PublicReport; person: NonNullable<PublicReport["persons"]>[number] };
  onClose: () => void;
}) {
  const { report, person } = match;
  return (
    <aside className="detailDrawer" aria-label={`Persona ${person.displayName}`}>
      <header>
        <div>
          <span className={`priority ${report.priority.toLowerCase()}`}>{report.priority}</span>
          <h1>{person.displayName}</h1>
          <p>{personStatusLabel(person.status)}</p>
        </div>
        <button className="iconButton" type="button" aria-label="Cerrar detalle" onClick={onClose}>
          <span aria-hidden="true">&times;</span>
        </button>
      </header>
      <section>
        <h2>Última ubicación</h2>
        <p>{person.lastKnownPlace || report.addressText}</p>
        {person.lastContactText ? <p>Último contacto: {person.lastContactText}</p> : null}
      </section>
      {person.description ? (
        <section>
          <h2>Detalle público</h2>
          <p>{person.description}</p>
        </section>
      ) : null}
      <section>
        <h2>Caso vinculado</h2>
        <p>{report.code} · {report.addressText}</p>
        <a className="button secondary" href={`/caso/${report.code}`}>Abrir caso</a>
      </section>
    </aside>
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
        <span>{APP_NAME.slice(0, -2)}<span>{APP_NAME.slice(-2)}</span></span>
      </a>
      <label className="signalSearch">
        <SearchIcon />
        <input
          aria-label="Buscar persona, edificio o ubicación"
          placeholder="Buscar persona, edificio o ubicación"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
      </label>
      <nav className="headerLinks" aria-label="Accesos">
        <a href="/como-funciona">Cómo funciona</a>
        <a href="/centro-ayuda">Centro de ayuda</a>
        <a href="/feed">Feed público</a>
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
  const chips = FILTER_CHIPS
    .map((chip) => ({ ...chip, count: applyReportFilter(reports, chip.value).length }));

  return (
    <div className="signalFilters" aria-label="Filtros del mapa">
      {chips.map(({ label, value: filterValue, tone, count }) => (
        <button
          key={filterValue}
          className={`signalChip ${tone} ${value === filterValue ? "active" : ""}`}
          type="button"
          onClick={() => onChange(filterValue)}
          aria-pressed={value === filterValue}
        >
          <span className="chipIcon" aria-hidden="true"><MiniIcon tone={tone} /></span>
          <span>{label}</span>
          <b>{count}</b>
        </button>
      ))}
      <a className="signalChip plain" href="/feed"><span className="chipIcon" aria-hidden="true"><LayerIcon /></span><span>Feed</span></a>
    </div>
  );
}

function MobileSearchFilters() {
  return (
    <div className="mobileSearchFilters" aria-label="Filtros de búsqueda">
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
    <section className="searchOverlay" aria-label="Resultados de búsqueda">
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
        <button key={item.key} type="button" onClick={() => item.href ? window.location.assign(item.href) : void onOpenReport(item.code)}>
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
        <p>Interacción limitada a zonas afectadas: {zoneNames}</p>
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
      <p>{searchTerm.trim() ? "Prueba otro nombre, código o referencia." : "Acerca el mapa o toca un punto dentro de la zona afectada para reportar."}</p>
    </section>
  );
}

function CasePreviewPanel({
  onUpload,
  onReport,
  onLifeSignal,
  onShare,
  onAbuse
}: {
  onUpload: () => void;
  onReport: () => void;
  onLifeSignal: () => void;
  onShare: () => void;
  onAbuse: () => void;
}) {
  return (
    <aside className="casePanel" aria-label="Ficha pública de caso">
      <button className="closePanel" type="button" aria-label="Cerrar ficha">×</button>
      <div className="caseHero">
        <span className="buildingBadge"><BuildingIcon /></span>
        <div>
          <span className="publicBadge">Ficha pública</span>
          <h1>{DEMO_CASE.title}</h1>
          <p>{DEMO_CASE.subtitle}</p>
          <small>Referencia: {DEMO_CASE.reference}</small>
        </div>
        <span className="riskBadge">ALTO RIESGO</span>
      </div>
      <section className="peopleSummary">
        <h2>{DEMO_CASE.peopleCount} personas reportadas en este edificio</h2>
        <p>Información pública compartida por familiares y comunidad</p>
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
        <button className="greenAction" type="button" onClick={onLifeSignal}>Hay señales de vida</button>
        <button className="outlineAction" type="button" onClick={onShare}>Compartir ficha</button>
        <button className="dangerLinkAction" type="button" onClick={onAbuse}>Reportar abuso / información falsa</button>
      </div>
      <p className="communityGuard">Una señal comunitaria crea una pista pública para revisar. No cierra ni oculta el caso por sí sola.</p>
      <section>
        <h3>Actualizaciones públicas</h3>
        <ol className="publicTimeline">
          {DEMO_UPDATES.map((update) => <li key={update}>{update}</li>)}
        </ol>
      </section>
      <section className="uploadBox">
        <h3>Subir información familiar</h3>
        <p>Esta información será visible públicamente para facilitar búsqueda, ayuda y rescate.</p>
        <div>
          <button type="button" onClick={onUpload}>Cargar historia</button>
          <button type="button" onClick={onUpload}>Subir foto</button>
          <button type="button" onClick={onUpload}>Agregar flyer</button>
          <button type="button" onClick={onReport}>Publicar actualización</button>
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
      <small>Último contacto<br /><b>{person[3]}</b></small>
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
      <small>{name.includes("Maria") ? "62 años" : name.includes("Luis") ? "54 años" : "28 años"}</small>
    </article>
  );
}

type FeedFilter = "recent" | "urgent" | "signals";

function PublicFeed({
  reports,
  posts,
  configReady,
  loading,
  mediaUploadsEnabled,
  onUpload,
  onShare
}: {
  reports: PublicReport[];
  posts: PublicPost[];
  configReady: boolean;
  loading: boolean;
  mediaUploadsEnabled: boolean;
  onUpload: () => void;
  onShare: (code: string) => void;
}) {
  const [feedFilter, setFeedFilter] = useState<FeedFilter>("recent");
  const signalReportCodes = useMemo(
    () => new Set(reports.filter((report) => report.signsOfLife).map((report) => report.code)),
    [reports]
  );
  const visibleReports = useMemo(() => filterReportsForFeed(reports, feedFilter), [reports, feedFilter]);
  const visiblePosts = useMemo(() => filterPostsForFeed(posts, feedFilter, signalReportCodes), [posts, feedFilter, signalReportCodes]);
  const signalCount = reports.filter((report) => report.signsOfLife).length;
  const urgentCount = reports.filter((report) => report.priority === "P1").length;
  return (
    <section className="feedPage" aria-label="Publicaciones">
      <div className="feedTitleRow">
        <div>
          <h1>Publicaciones</h1>
          <p>Información pública publicada por familias y comunidad.</p>
        </div>
        <select aria-label="Orden del feed" value={feedFilter} onChange={(event) => setFeedFilter(event.target.value as FeedFilter)}>
          <option value="recent">Más recientes</option>
          <option value="urgent">Más urgentes</option>
          <option value="signals">Señales de vida</option>
        </select>
      </div>
      <div className="feedComposer">
        <button type="button" onClick={onUpload}>Cargar historia</button>
        <button type="button" onClick={onUpload}>Subir foto</button>
        <button type="button" onClick={onUpload}>Publicar actualización</button>
        {configReady && !mediaUploadsEnabled ? <span className="uploadDisabledNote">Archivos desactivados; texto disponible</span> : null}
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
          <p>Reportes que requieren atención inmediata</p>
        </div>
        <span className="riskBadge">{urgentCount} activos</span>
      </article>
      {loading ? <FeedLoadingState /> : visiblePosts.length ? visiblePosts.map((post) => <FeedPost key={post.id} post={post} onShare={onShare} />) : visibleReports.length ? visibleReports.map((report) => <ReportFeedPost key={report.code} report={report} onShare={onShare} />) : <FeedEmptyState filter={feedFilter} />}
    </section>
  );
}

function filterReportsForFeed(reports: PublicReport[], filter: FeedFilter): PublicReport[] {
  const filtered = filter === "signals"
    ? reports.filter((report) => report.signsOfLife)
    : filter === "urgent"
      ? reports.filter((report) => report.priority === "P1" || report.priority === "P2")
      : reports;

  return [...filtered].sort((a, b) => {
    if (filter === "urgent") {
      const priorityDelta = priorityFeedRank(a.priority) - priorityFeedRank(b.priority);
      if (priorityDelta) return priorityDelta;
    }
    return dateFeedRank(b.updatedAt) - dateFeedRank(a.updatedAt);
  });
}

function filterPostsForFeed(posts: PublicPost[], filter: FeedFilter, signalReportCodes: Set<string>): PublicPost[] {
  const filtered = filter === "signals"
    ? posts.filter((post) => signalReportCodes.has(post.report.code) || post.tags.some(isSignalTag))
    : filter === "urgent"
      ? posts.filter((post) => post.report.priority === "P1" || post.report.priority === "P2")
      : posts;

  return [...filtered].sort((a, b) => {
    if (filter === "urgent") {
      const priorityDelta = priorityFeedRank(a.report.priority) - priorityFeedRank(b.report.priority);
      if (priorityDelta) return priorityDelta;
    }
    return dateFeedRank(b.createdAt) - dateFeedRank(a.createdAt);
  });
}

function priorityFeedRank(priority: PublicReport["priority"]): number {
  if (priority === "P1") return 0;
  if (priority === "P2") return 1;
  return 2;
}

function dateFeedRank(value: string): number {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isSignalTag(tag: string): boolean {
  const normalized = tag.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return normalized.includes("senal") || normalized.includes("vida");
}

function FeedLoadingState() {
  return (
    <article className="feedEmptyState" aria-live="polite">
      <strong>Cargando publicaciones...</strong>
      <p>Buscando reportes públicos dentro de las zonas activas.</p>
    </article>
  );
}

function FeedEmptyState({ filter }: { filter: FeedFilter }) {
  return (
    <article className="feedEmptyState">
      <strong>{filter === "recent" ? "No hay publicaciones reales todavía." : "No hay resultados para este filtro."}</strong>
      <p>{filter === "recent" ? "Cuando se creen reportes en las zonas activas, aparecerán aquí por prioridad y fecha." : "Cambia el filtro o abre el mapa para revisar todos los reportes activos."}</p>
    </article>
  );
}

function FeedPost({ post, onShare }: { post: PublicPost; onShare: (code: string) => void }) {
  return (
    <article className="feedPost">
      <article className={post.thumbnailUrl ? "flyerCard reportBadge imageBadge" : "flyerCard reportBadge"}>
        {post.thumbnailUrl ? (
          <img src={post.thumbnailUrl} alt={`Publicación ${post.report.code}`} />
        ) : (
          <>
            <strong>{post.type.toUpperCase()}</strong>
            <span>{post.report.code}</span>
            <small>{post.report.priority}</small>
          </>
        )}
      </article>
      <div className="postBody">
        <header>
          <Avatar initials={post.report.code.slice(-2)} color="#f0c7b8" />
          <div className="postMeta">
            <strong>{postLabel(post.type)}</strong>
            <time dateTime={post.createdAt}>{formatPostTime(post.createdAt)}</time>
          </div>
          <span>{post.report.code}</span>
        </header>
        <p>{post.text}</p>
        {post.mediaUrl ? <a className="mediaAttachment" href={post.mediaUrl} target="_blank" rel="noreferrer">Abrir archivo adjunto</a> : null}
        <div className="postTags">
          <span>{post.report.addressText}</span>
          <b>{post.report.priority}</b>
          {post.tags.map((tag) => <b key={tag}>{tag}</b>)}
        </div>
        <footer>
          <a className="feedAction" href={`/caso/${post.report.code}`}>Abrir ficha</a>
          <button type="button" onClick={() => onShare(post.report.code)}>Compartir</button>
        </footer>
      </div>
    </article>
  );
}

function ReportFeedPost({ report, onShare }: { report: PublicReport; onShare: (code: string) => void }) {
  const firstPerson = report.persons?.[0];
  return (
    <article className="feedPost">
      <ReportBadge report={report} />
      <div className="postBody">
        <header>
          <Avatar initials={report.code.slice(-2)} color="#f0c7b8" />
          <div className="postMeta">
            <strong>{labelForType(report.type)}</strong>
            <time dateTime={report.updatedAt}>{formatPostTime(report.updatedAt)}</time>
          </div>
          <span>{report.code}</span>
        </header>
        {firstPerson ? (
          <p className="personLead">
            {firstPerson.displayName}
            {firstPerson.age ? `, ${firstPerson.age} años` : ""} · {personStatusLabel(firstPerson.status)}
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
          <a className="feedAction" href={`/caso/${report.code}`}>Abrir ficha</a>
          <button type="button" onClick={() => onShare(report.code)}>Compartir</button>
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
  config,
  reports,
  onClose,
  onSubmit
}: {
  enabled: boolean;
  config: PublicConfig;
  reports: PublicReport[];
  onClose: () => void;
  onSubmit: (code: string, payload: Record<string, unknown>) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [reportCode, setReportCode] = useState(reports[0]?.code ?? "");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaReset, setCaptchaReset] = useState(0);
  const selectedReport = reports.find((report) => report.code === reportCode);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reportCode) return;
    const form = new FormData(event.currentTarget);
    if (!captchaFormReady(config, captchaToken, form)) {
      setError("Completa la verificación humana.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(reportCode, {
        text: form.get("text"),
        postType: form.get("postType"),
        personId: form.get("personId") || undefined,
        tags: form.getAll("tags"),
        file: form.get("file"),
        ...captchaPayload(config, captchaToken, form)
      });
      setCaptchaToken("");
      setCaptchaReset((value) => value + 1);
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
            <span className="eyebrow">Publicación familiar</span>
            <h1 id="upload-title">Publicar historia o flyer</h1>
            <p className="helperText">{enabled ? "Publica texto y archivo validado por la API." : "En este ambiente se guarda texto público; archivos siguen desactivados."}</p>
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
                  <option value="update">Actualización</option>
                </select>
              </label>
              <label>
                Etiqueta
                <select name="tags" defaultValue="">
                  <option value="">Sin etiqueta</option>
                  <option value="familia">Familia</option>
                  <option value="testigo">Testigo</option>
                  <option value="senales">Señales de vida</option>
                  <option value="verificar">Necesita verificación</option>
                </select>
              </label>
            </div>
            {enabled ? (
              <label>
                Archivo
                <span className="filePicker">
                  <input
                    name="file"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,application/pdf"
                    onChange={(event) => setFileName(event.currentTarget.files?.[0]?.name ?? "")}
                  />
                  <span>Seleccionar archivo</span>
                  <small>{fileName || "Sin archivo"}</small>
                </span>
              </label>
            ) : null}
            <label>
              Texto público
              <textarea name="text" required rows={4} maxLength={900} placeholder="Nombre, ubicación, contexto, último contacto o texto del flyer." />
            </label>
            <CaptchaField key={captchaReset} config={config} onToken={setCaptchaToken} />
            <p className="safetyNote">Esta información será visible públicamente para facilitar búsqueda, ayuda y rescate.</p>
          </>
        ) : (
          <p className="safetyNote">Crea o carga un reporte real antes de publicar historias o flyers.</p>
        )}
        {error ? <p className="formError" role="alert">{error}</p> : null}
        <div className="actions stickyActions">
          {reports.length ? <button type="submit" disabled={busy || !captchaReady(config, captchaToken)}>{busy ? "Publicando..." : "Publicar"}</button> : null}
          <button className="ghost" type="button" onClick={onClose}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}

function BottomNav({ active, onReport }: { active: "map" | "feed"; onReport: () => void }) {
  return (
    <nav className="bottomNav" aria-label="Navegación móvil">
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
      <a href="/como-funciona">Cómo funciona</a>
      <a href="/centro-ayuda">Centro de ayuda</a>
      <a href="/aviso-legal">Aviso legal</a>
      <a href="/privacidad">Privacidad</a>
      <a href="/tips-seguridad">Tips de seguridad</a>
      <span>Canales oficiales</span>
      <span className="footerChannels" aria-label="Canales sociales">WA TG IG X</span>
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
  if (filter === "missing_last_seen") return reports.filter((report) => report.type === "missing_last_seen");
  if (filter === "signals") return reports.filter((report) => report.signsOfLife);
  if (filter === "trapped") return reports.filter((report) => report.type === "trapped_person" || report.type === "collapsed_building_unknown");
  if (filter === "voices") return reports.filter((report) => report.type === "voices_or_hits");
  if (filter === "buildings") return reports.filter((report) => report.type === "collapsed_building_unknown" || (report.persons?.length ?? 0) > 1);
  if (filter.startsWith("P")) return reports.filter((report) => report.priority === filter);
  if (filter !== "all") return reports.filter((report) => report.derivedStatus === filter);
  return reports;
}

interface SearchItem {
  key: string;
  code: string;
  label: string;
  detail?: string;
  href?: string;
}

function searchPublicContent(term: string, reports: PublicReport[], posts: PublicPost[] = []) {
  const needle = normalizeSearch(term);
  if (!needle) return { reports: [], locations: [], people: [], posts: [] };
  const includes = (value: string | undefined) => normalizeSearch(value).includes(needle);
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
        detail: `${personStatusLabel(person.status)} · ${report.addressText}`,
        href: `/persona/${person.id}`
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

function searchRemoteContent(result: PublicSearchResponse): ReturnType<typeof searchPublicContent> {
  return {
    people: result.people.map((item) => ({
      key: `${item.reportCode}-${item.person.id}`,
      code: item.reportCode,
      label: item.person.displayName,
      detail: `${personStatusLabel(item.person.status)} · ${item.reportAddress}`,
      href: `/persona/${item.person.id}`
    })).slice(0, 5),
    reports: result.reports.map((report) => ({
      key: `report-${report.code}`,
      code: report.code,
      label: `${report.code} · ${labelForType(report.type)}`,
      detail: `${report.priority} · ${statusLabel(report.derivedStatus)}`
    })).slice(0, 5),
    locations: result.locations.map((location) => ({
      key: `location-${location.code}`,
      code: location.code,
      label: location.addressText,
      detail: location.landmark || location.area || location.city || location.code
    })).filter((item) => item.label).slice(0, 5),
    posts: result.posts.map((post) => ({
      key: `post-${post.id}`,
      code: post.report.code,
      label: post.text,
      detail: `${postLabel(post.type)} · ${post.report.addressText}`
    })).slice(0, 5)
  };
}

function normalizeSearch(value: string | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
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

function findPerson(reports: PublicReport[], id: string) {
  for (const report of reports) {
    const person = report.persons?.find((item) => item.id === id);
    if (person) return { report, person };
  }
  return undefined;
}

function labelForType(type: PublicReport["type"]): string {
  const labels: Record<PublicReport["type"], string> = {
    trapped_person: "Persona atrapada",
    missing_last_seen: "Última ubicación",
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
    update: "Actualización"
  };
  return labels[type];
}

function formatPostTime(value: string): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "";
  const diffMs = Date.now() - timestamp;
  const future = diffMs < 0;
  const minutes = Math.max(0, Math.round(Math.abs(diffMs) / 60000));
  if (minutes < 1) return "Ahora";
  if (minutes < 60) return future ? `En ${minutes} min` : `Hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return future ? `En ${hours} h` : `Hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 7) return future ? `En ${days} d` : `Hace ${days} d`;
  return new Intl.DateTimeFormat("es-VE", { day: "2-digit", month: "short" }).format(timestamp);
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    new: "Nuevo",
    open: "Abierto",
    confirmed: "Confirmado",
    help_nearby: "Ayuda cerca",
    maybe_resolved: "Posiblemente resuelto",
    resolved: "Resuelto",
    resolved_owner: "Resuelto por propietario",
    resolved_community: "Resuelto por comunidad",
    reopened: "Reabierto",
    hidden_abuse: "Oculto por abuso"
  };
  return labels[status] ?? status.replace(/_/g, " ");
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
