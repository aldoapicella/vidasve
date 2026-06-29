import { useEffect, useRef, useState, type MouseEvent } from "react";
import "azure-maps-control/dist/atlas.min.css";
import * as atlas from "azure-maps-control";
import type { DataDrivenPropertyValueSpecification } from "@maplibre/maplibre-gl-style-spec";
import { getMapToken } from "../api/client";
import type { PublicConfig, PublicReport } from "../types";

export function MapView({
  config,
  configReady,
  reports,
  selectedCode,
  selectedReport,
  pickedLocation,
  isPicking,
  onBoundsChange,
  onReportSelect,
  onMapClick
}: {
  config: PublicConfig;
  configReady: boolean;
  reports: PublicReport[];
  selectedCode?: string;
  selectedReport?: PublicReport | null;
  pickedLocation?: [number, number];
  isPicking?: boolean;
  onBoundsChange: (bbox?: [number, number, number, number]) => void;
  onReportSelect: (report: PublicReport) => void;
  onMapClick: (location: [number, number]) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<atlas.Map | null>(null);
  const sourceRef = useRef<atlas.source.DataSource | null>(null);
  const reportsLayerRef = useRef<atlas.layer.BubbleLayer | null>(null);
  const reportHaloLayerRef = useRef<atlas.layer.BubbleLayer | null>(null);
  const popupRef = useRef<atlas.Popup | null>(null);
  const pickedMarkerRef = useRef<atlas.HtmlMarker | null>(null);
  const fallbackLoadedRef = useRef(false);
  const suppressNextMapClickRef = useRef(false);
  const focusedReportRef = useRef("");
  const onReportSelectRef = useRef(onReportSelect);
  const isPickingRef = useRef(Boolean(isPicking));
  const [mapFailed, setMapFailed] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    onReportSelectRef.current = onReportSelect;
  }, [onReportSelect]);

  useEffect(() => {
    isPickingRef.current = Boolean(isPicking);
  }, [isPicking]);

  useEffect(() => {
    if (!configReady) return;
    if (!containerRef.current || mapRef.current || !config.azureMapsClientId) {
      if (!config.azureMapsClientId && !fallbackLoadedRef.current) {
        fallbackLoadedRef.current = true;
        onBoundsChange();
      }
      return;
    }

    const [lat, lng] = config.defaultCenter;
    // ponytail: Azure Maps has one maxBounds box; click/report filtering still enforces each configured zone.
    const activeBounds = boundsFromAllowedZones(config.allowedBboxes);
    try {
      const map = new atlas.Map(containerRef.current, {
        center: [lng, lat],
        zoom: config.defaultZoom,
        maxBounds: activeBounds,
        view: "Auto",
        style: "road",
        authOptions: {
          authType: atlas.AuthenticationType.anonymous,
          clientId: config.azureMapsClientId,
          getToken: async (resolve) => resolve((await getMapToken()).token)
        }
      });
      const source = new atlas.source.DataSource(undefined, { cluster: true, clusterRadius: 52 });
      sourceRef.current = source;
      mapRef.current = map;

      map.events.add("ready", async () => {
        setMapReady(true);
        if (activeBounds) map.setCamera({ bounds: activeBounds, maxBounds: activeBounds, padding: 48, maxZoom: config.defaultZoom });
        await addMapIcons(map).catch(() => undefined);

        const clusterColor = expression<string>(["step", ["to-number", ["get", "point_count"], 0], "#0f766e", 10, "#2563eb", 25, "#7c3aed", 75, "#f97316", 150, "#dc2626"]);
        const reportColor = expression<string>([
          "case",
          ["==", ["get", "signsOfLife"], true],
          "#dc1f2d",
          ["==", ["get", "type"], "trapped_person"],
          "#e45c0a",
          ["==", ["get", "type"], "collapsed_building_unknown"],
          "#7c3aed",
          ["==", ["get", "type"], "voices_or_hits"],
          "#b7790e",
          ["==", ["get", "sourceType"], "localizadosvenezuela"],
          "#2b7fd3",
          ["match", ["get", "priority"], "P1", "#dc1f2d", "P2", "#e45c0a", "#0f766e"]
        ]);
        const clusterHaloLayer = new atlas.layer.BubbleLayer(source, "cluster-halo", {
          filter: ["has", "point_count"],
          color: clusterColor,
          radius: expression<number>(["step", ["to-number", ["get", "point_count"], 0], 26, 10, 31, 25, 37, 75, 45, 150, 53]),
          strokeWidth: 0,
          blur: 0.55,
          opacity: 0.24
        });
        const clusterLayer = new atlas.layer.BubbleLayer(source, "clusters", {
          filter: ["has", "point_count"],
          color: clusterColor,
          radius: expression<number>(["step", ["to-number", ["get", "point_count"], 0], 18, 10, 22, 25, 28, 75, 36, 150, 43]),
          strokeColor: "#ffffff",
          strokeWidth: 4,
          opacity: 0.97
        });
        const clusterCountLayer = new atlas.layer.SymbolLayer(source, "cluster-count", {
          filter: ["has", "point_count"],
          iconOptions: { size: 0, opacity: 0, allowOverlap: true, ignorePlacement: true },
          textOptions: {
            textField: ["get", "point_count_abbreviated"],
            color: "#ffffff",
            size: expression<number>(["step", ["to-number", ["get", "point_count"], 0], 13, 25, 15, 100, 17]),
            font: ["StandardFont-Bold"],
            allowOverlap: true,
            ignorePlacement: true,
            haloColor: "rgba(15, 23, 42, 0.35)",
            haloWidth: 1.5
          }
        });
        const reportHaloLayer = new atlas.layer.BubbleLayer(source, "report-halo", {
          filter: ["!", ["has", "point_count"]],
          color: reportColor,
          radius: expression<number>(["case", ["==", ["get", "code"], selectedCode ?? ""], 28, 22]),
          strokeWidth: 0,
          blur: 0.5,
          opacity: 0.2
        });
        const reportsLayer = new atlas.layer.BubbleLayer(source, "reports", {
          filter: ["!", ["has", "point_count"]],
          color: reportColor,
          radius: expression<number>(["case", ["==", ["get", "code"], selectedCode ?? ""], 18, 14]),
          strokeColor: "#ffffff",
          strokeWidth: 4,
          blur: 0,
          opacity: 0.98
        });
        const reportIconLayer = new atlas.layer.SymbolLayer(source, "report-icons", {
          filter: ["!", ["has", "point_count"]],
          iconOptions: {
            image: expression<string>(["get", "markerIcon"]),
            size: expression<number>(["case", ["==", ["get", "code"], selectedCode ?? ""], 0.72, 0.62]),
            allowOverlap: true,
            ignorePlacement: true
          }
        });

        reportsLayerRef.current = reportsLayer;
        reportHaloLayerRef.current = reportHaloLayer;
        map.sources.add(source);
        map.layers.add([clusterHaloLayer, clusterLayer, clusterCountLayer, reportHaloLayer, reportsLayer, reportIconLayer]);

        const suppressOneMapClick = () => {
          suppressNextMapClickRef.current = true;
          window.setTimeout(() => {
            suppressNextMapClickRef.current = false;
          }, 0);
        };
        const expandCluster = (event: atlas.MapMouseEvent) => {
          suppressOneMapClick();
          const shape = event.shapes?.[0];
          const properties = shapeProperties(shape);
          const clusterId = Number(properties?.cluster_id);
          const center = pointCoordinates(shape) ?? (event.position ? [event.position[0], event.position[1]] as [number, number] : undefined);
          if (!Number.isFinite(clusterId) || !center) return;
          source.getClusterExpansionZoom(clusterId).then((zoom) => {
            map.setCamera({ center, zoom: Math.min(zoom + 0.4, 18), type: "ease", duration: 280 });
          }).catch(() => undefined);
        };
        const openReport = (event: atlas.MapMouseEvent) => {
          suppressOneMapClick();
          const report = reportFromShape(event.shapes?.[0]);
          const center = pointCoordinates(event.shapes?.[0]) ?? (event.position ? [event.position[0], event.position[1]] as [number, number] : undefined);
          if (report && center) openReportPopup(map, report, center, containerRef.current, onReportSelectRef.current, popupRef);
        };

        map.events.add("moveend", () => onBoundsChange(bounds(map)));
        map.events.add("click", clusterLayer, expandCluster);
        map.events.add("click", clusterCountLayer, expandCluster);
        map.events.add("click", reportsLayer, openReport);
        map.events.add("click", reportIconLayer, openReport);
        map.events.add("click", (event) => {
          if (suppressNextMapClickRef.current) {
            suppressNextMapClickRef.current = false;
            return;
          }
          const position = event.position ? [event.position[0], event.position[1]] as [number, number] : undefined;
          if (isPickingRef.current && position && pointInAllowedZones(position, config.allowedBboxes)) onMapClick(position);
          else if (!isPickingRef.current) popupRef.current?.close();
        });
        onBoundsChange(bounds(map));
      });
    } catch {
      setMapFailed(true);
      onBoundsChange();
    }
  }, [config, configReady, onBoundsChange, onMapClick]);

  useEffect(() => {
    if (!configReady || !config.azureMapsClientId || mapReady || mapFailed) return;
    const timeout = window.setTimeout(() => {
      if (!mapReady) {
        setMapFailed(true);
        onBoundsChange();
      }
    }, 20000);
    return () => window.clearTimeout(timeout);
  }, [config.azureMapsClientId, configReady, mapFailed, mapReady, onBoundsChange]);

  useEffect(() => {
    const source = sourceRef.current;
    if (!source) return;
    const sourceReports = selectedReport ? [selectedReport, ...reports.filter((report) => report.code !== selectedReport.code)] : reports;
    source.clear();
    source.add(
      sourceReports
        .filter((report) => report.location && pointInAllowedZones(report.location.coordinates, config.allowedBboxes))
        .map((report) => new atlas.data.Feature(new atlas.data.Point(report.location!.coordinates), {
          ...report,
          markerIcon: markerIcon(report)
        }))
    );
  }, [reports, selectedReport, config.allowedBboxes]);

  useEffect(() => {
    const map = mapRef.current;
    const coords = selectedReport?.location?.coordinates;
    if (!map || !mapReady || !selectedReport || !coords || !pointInAllowedZones(coords, config.allowedBboxes)) return;
    const key = `${selectedReport.code}:${coords.join(",")}`;
    if (focusedReportRef.current === key) return;
    focusedReportRef.current = key;
    popupRef.current?.close();
    map.setCamera({ center: coords, zoom: zoomForAccuracy(selectedReport.locationAccuracy), type: "ease", duration: 420 });
  }, [selectedReport, mapReady, config.allowedBboxes]);

  useEffect(() => {
    const radius = expression<number>(["case", ["==", ["get", "code"], selectedCode ?? ""], 18, 14]);
    reportsLayerRef.current?.setOptions({ radius });
    reportHaloLayerRef.current?.setOptions({ radius: expression<number>(["case", ["==", ["get", "code"], selectedCode ?? ""], 28, 22]) });
  }, [selectedCode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pickedLocation) return;
    if (!pickedMarkerRef.current) {
      pickedMarkerRef.current = new atlas.HtmlMarker({
        htmlContent: '<div class="pickedMarker" aria-label="Punto seleccionado"></div>'
      });
      map.markers.add(pickedMarkerRef.current);
    }
    pickedMarkerRef.current.setOptions({ position: pickedLocation });
  }, [pickedLocation]);

  useEffect(() => {
    if (pickedLocation || !pickedMarkerRef.current || !mapRef.current) return;
    mapRef.current.markers.remove(pickedMarkerRef.current);
    pickedMarkerRef.current = null;
  }, [pickedLocation]);

  function handlePickClick(event: MouseEvent<HTMLButtonElement>) {
    const map = mapRef.current;
    const container = containerRef.current;
    if (!map || !container) return;
    const rect = container.getBoundingClientRect();
    const position = asLngLat(map.pixelsToPositions([[event.clientX - rect.left, event.clientY - rect.top]])[0]);
    if (position) onMapClick(position);
  }

  if (!configReady) {
    return <MapLoading />;
  }

  if (mapFailed || !config.azureMapsClientId) {
    return (
      <section className="fallbackMap" aria-label="Lista de reportes">
        <div>
          <h1>VidasVE</h1>
          <p>Mapa no disponible. Se muestra la lista pública por zona.</p>
        </div>
        <div className="reportList">
          {reports.map((report) => (
            <button key={report.code} type="button" onClick={() => onReportSelect(report)}>
              <strong>{report.priority}</strong>
              <span>{report.code}</span>
              <span>{report.addressText}</span>
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <>
      <div ref={containerRef} className="mapCanvas" aria-label="Mapa de reportes" />
      {isPicking && mapReady ? (
        <button
          className="mapPickCatcher"
          type="button"
          aria-label="Seleccionar ubicación en el mapa"
          onClick={handlePickClick}
        />
      ) : null}
      {!mapReady ? <MapLoading /> : null}
    </>
  );
}

function MapLoading() {
  return (
    <section className="mapLoading" role="status" aria-live="polite">
      <span aria-hidden="true"></span>
      <strong>Cargando mapa</strong>
    </section>
  );
}

function reportFromShape(shape?: atlas.data.Feature<atlas.data.Geometry, PublicReport> | atlas.Shape): PublicReport | undefined {
  if (!shape) return undefined;
  return "getProperties" in shape ? (shape.getProperties() as PublicReport) : shape.properties;
}

function openReportPopup(
  map: atlas.Map,
  report: PublicReport,
  position: [number, number],
  container: HTMLDivElement | null,
  onOpen: (report: PublicReport) => void,
  popupRef: { current: atlas.Popup | null }
) {
  const popup = popupRef.current ?? new atlas.Popup({ closeButton: false, pixelOffset: [0, -22] });
  popupRef.current = popup;
  const markerPixel = map.positionsToPixels([position])[0];
  popup.setOptions({ position, pixelOffset: markerPixel[1] < 360 ? [0, 72] : [0, -22], content: popupHtml(report) });
  popup.open(map);
  window.setTimeout(() => {
    const button = container?.querySelector<HTMLButtonElement>(".mapPopupAction");
    if (button) button.onclick = () => onOpen(report);
  }, 0);
}

function popupHtml(report: PublicReport): string {
  const [lng, lat] = report.location?.coordinates ?? [0, 0];
  const tone = popupTone(report);
  return `
    <article class="mapPopupCard ${tone}">
      <strong>${escapeHtml(report.addressText || report.code)}</strong>
      <span>${escapeHtml(popupStatus(report))}</span>
      <p>${lat.toFixed(4)}, ${lng.toFixed(4)} · Precisión ${accuracyText(report.locationAccuracy)}</p>
      <div>
        ${popupChip("Señales", POPUP_ICONS.heart, report.signsOfLife ? "1" : "0")}
        ${popupChip("Actualizaciones", POPUP_ICONS.message, compactCount(report.counters?.updates ?? 0))}
        ${popupChip("Personas", POPUP_ICONS.person, String(reportPeopleCount(report) || 1))}
        <button class="mapPopupAction" type="button">Ver detalles →</button>
      </div>
    </article>
  `;
}

function popupChip(label: string, icon: string, value: string): string {
  return `<small aria-label="${escapeHtml(label)}">${icon}${escapeHtml(value)}</small>`;
}

function popupTone(report: PublicReport): string {
  if (report.signsOfLife || report.priority === "P1") return "danger";
  if (report.type === "collapsed_building_unknown") return "purple";
  if (report.type === "voices_or_hits") return "gold";
  if (report.type === "trapped_person" || report.priority === "P2") return "orange";
  return "green";
}

function popupStatus(report: PublicReport): string {
  if (report.signsOfLife) return "ROJO · SEÑALES DE VIDA";
  if (report.type === "collapsed_building_unknown") return "MORADO · EDIFICIO REPORTADO";
  if (report.type === "voices_or_hits") return "DORADO · VOCES/GOLPES";
  if (report.type === "trapped_person") return "NARANJA · PERSONAS ATRAPADAS";
  return `${report.priority} · NECESITA VERIFICACIÓN`;
}

const MAP_ICON_IDS = {
  building: "vv-map-building",
  default: "vv-map-person",
  signs: "vv-map-heart",
  trapped: "vv-map-flame",
  urgent: "vv-map-alert",
  voices: "vv-map-radio"
} as const;

const ICON_PATHS = {
  building: '<path d="M4 21V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16"/><path d="M9 21v-4h6v4"/><path d="M8 8h2"/><path d="M14 8h2"/><path d="M8 12h2"/><path d="M14 12h2"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/><path d="M3.5 12h4l2-3 3 6 2-3h6"/>',
  flame: '<path d="M8.5 14.5A4.5 4.5 0 0 0 12 22a4.5 4.5 0 0 0 3.5-7.5c-1.7-1.9-2.1-3.6-1.2-6.5-2.8 1.3-5.2 3.1-5.8 6.5Z"/><path d="M12 22c1.4-1.4 1.7-3.1.8-5.1"/>',
  alert: '<circle cx="12" cy="12" r="10"/><path d="M12 7v6"/><path d="M12 17h.01"/>',
  radio: '<path d="M4.9 19.1a10 10 0 0 1 14.2 0"/><path d="M8.4 15.6a5 5 0 0 1 7.2 0"/><circle cx="12" cy="20" r="1"/><path d="M12 4v8"/>',
  message: '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/>'
} as const;

const MAP_ICONS: Record<string, string> = {
  [MAP_ICON_IDS.building]: iconSvg(ICON_PATHS.building, 24, "#ffffff"),
  [MAP_ICON_IDS.default]: iconSvg(ICON_PATHS.person, 24, "#ffffff"),
  [MAP_ICON_IDS.signs]: iconSvg(ICON_PATHS.heart, 24, "#ffffff"),
  [MAP_ICON_IDS.trapped]: iconSvg(ICON_PATHS.flame, 24, "#ffffff"),
  [MAP_ICON_IDS.urgent]: iconSvg(ICON_PATHS.alert, 24, "#ffffff"),
  [MAP_ICON_IDS.voices]: iconSvg(ICON_PATHS.radio, 24, "#ffffff")
};

const POPUP_ICONS = {
  heart: iconSvg(ICON_PATHS.heart, 13),
  message: iconSvg(ICON_PATHS.message, 13),
  person: iconSvg(ICON_PATHS.person, 13)
} as const;

async function addMapIcons(map: atlas.Map): Promise<void> {
  await Promise.all(Object.entries(MAP_ICONS).map(([id, svg]) => (
    map.imageSprite.hasImage(id) ? Promise.resolve() : map.imageSprite.add(id, iconDataUri(svg))
  )));
}

function markerIcon(report: PublicReport): string {
  if (report.signsOfLife) return MAP_ICON_IDS.signs;
  if (report.type === "collapsed_building_unknown") return MAP_ICON_IDS.building;
  if (report.type === "voices_or_hits") return MAP_ICON_IDS.voices;
  if (report.type === "trapped_person") return MAP_ICON_IDS.trapped;
  return report.priority === "P1" ? MAP_ICON_IDS.urgent : MAP_ICON_IDS.default;
}

function zoomForAccuracy(accuracy: PublicReport["locationAccuracy"]): number {
  if (accuracy === "exact") return 17;
  if (accuracy === "approximate") return 15;
  return 13;
}

function iconSvg(paths: string, size: number, color = "currentColor"): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

function iconDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function reportPeopleCount(report: PublicReport): number {
  const personCount = report.persons?.length;
  if (personCount) return personCount;
  const numericCount = Number(String(report.peopleCount).replace(/[^\d]/g, ""));
  return Number.isFinite(numericCount) && numericCount > 0 ? numericCount : 0;
}

function compactCount(count: number): string {
  if (count >= 1000) return `${Math.floor(count / 1000)}k`;
  if (count >= 100) return "99+";
  return String(count);
}

function expression<T>(value: unknown[]): DataDrivenPropertyValueSpecification<T> {
  return value as DataDrivenPropertyValueSpecification<T>;
}

function accuracyText(value: PublicReport["locationAccuracy"]): string {
  return value === "exact" ? "exacta" : value === "zone_only" ? "por zona" : "aproximada";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] ?? char));
}

function shapeProperties(shape?: atlas.data.Feature<atlas.data.Geometry, Record<string, unknown>> | atlas.Shape): Record<string, unknown> | undefined {
  if (!shape) return undefined;
  return "getProperties" in shape ? shape.getProperties() as Record<string, unknown> : shape.properties;
}

function pointCoordinates(shape?: atlas.data.Feature<atlas.data.Geometry, Record<string, unknown>> | atlas.Shape): [number, number] | undefined {
  if (!shape) return undefined;
  if ("getCoordinates" in shape) return asLngLat(shape.getCoordinates());
  if (shape.geometry.type === "Point") return asLngLat(shape.geometry.coordinates);
  return undefined;
}

function asLngLat(value: unknown): [number, number] | undefined {
  if (!Array.isArray(value) || value.length < 2) return undefined;
  const lng = Number(value[0]);
  const lat = Number(value[1]);
  return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : undefined;
}

function bounds(map: atlas.Map): [number, number, number, number] | undefined {
  const camera = map.getCamera();
  const box = camera.bounds;
  if (!box) return undefined;
  return [box[0], box[1], box[2], box[3]];
}

function boundsFromAllowedZones(zones: PublicConfig["allowedBboxes"]): atlas.data.BoundingBox | undefined {
  if (!zones.length) return undefined;
  return zones.reduce(
    (bounds, zone) => [
      Math.min(bounds[0], zone.minLng),
      Math.min(bounds[1], zone.minLat),
      Math.max(bounds[2], zone.maxLng),
      Math.max(bounds[3], zone.maxLat)
    ],
    [zones[0].minLng, zones[0].minLat, zones[0].maxLng, zones[0].maxLat] as atlas.data.BoundingBox
  );
}

function pointInAllowedZones([lng, lat]: [number, number], zones: PublicConfig["allowedBboxes"]): boolean {
  return !zones.length || zones.some((zone) => lng >= zone.minLng && lng <= zone.maxLng && lat >= zone.minLat && lat <= zone.maxLat);
}
