import { useEffect, useRef, useState, type MouseEvent } from "react";
import * as atlas from "azure-maps-control";
import { getMapToken } from "../api/client";
import type { PublicConfig, PublicReport } from "../types";

export function MapView({
  config,
  configReady,
  reports,
  selectedCode,
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
  const pickedMarkerRef = useRef<atlas.HtmlMarker | null>(null);
  const fallbackLoadedRef = useRef(false);
  const suppressNextMapClickRef = useRef(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [mapReady, setMapReady] = useState(false);

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
      map.events.add("ready", () => {
        setMapReady(true);
        if (activeBounds) map.setCamera({ bounds: activeBounds, maxBounds: activeBounds, padding: 48, maxZoom: config.defaultZoom });
        const clusterLayer = new atlas.layer.BubbleLayer(source, "clusters", {
          filter: ["has", "point_count"],
          color: ["step", ["to-number", ["get", "point_count"], 0], "#0f766e", 10, "#2563eb", 25, "#7c3aed", 75, "#f97316", 150, "#dc2626"],
          radius: ["step", ["to-number", ["get", "point_count"], 0], 18, 10, 22, 25, 27, 75, 33, 150, 39],
          strokeColor: "#ffffff",
          strokeWidth: 3,
          opacity: 0.94
        });
        const clusterCountLayer = new atlas.layer.SymbolLayer(source, "cluster-count", {
          filter: ["has", "point_count"],
          iconOptions: { size: 0, opacity: 0, allowOverlap: true, ignorePlacement: true },
          textOptions: {
            textField: ["get", "point_count_abbreviated"],
            color: "#ffffff",
            size: ["step", ["to-number", ["get", "point_count"], 0], 13, 25, 15, 100, 17],
            font: ["StandardFont-Bold"],
            allowOverlap: true,
            ignorePlacement: true,
            haloColor: "#0f172a",
            haloWidth: 1
          }
        });
        const reportsLayer = new atlas.layer.BubbleLayer(source, "reports", {
          filter: ["!", ["has", "point_count"]],
          color: [
            "case",
            ["==", ["get", "type"], "trapped_person"],
            "#dc2626",
            ["==", ["get", "type"], "collapsed_building_unknown"],
            "#7c3aed",
            ["==", ["get", "type"], "voices_or_hits"],
            "#eab308",
            ["==", ["get", "sourceType"], "localizadosvenezuela"],
            "#2563eb",
            ["match", ["get", "priority"], "P1", "#dc2626", "P2", "#f97316", "#0f766e"]
          ],
          radius: ["case", ["==", ["get", "code"], selectedCode ?? ""], 17, 12],
          strokeColor: "#ffffff",
          strokeWidth: 3,
          blur: 0.04,
          opacity: 0.95
        });
        const reportLabelsLayer = new atlas.layer.SymbolLayer(source, "report-labels", {
          filter: ["!", ["has", "point_count"]],
          iconOptions: { size: 0, opacity: 0, allowOverlap: true, ignorePlacement: true },
          textOptions: {
            textField: ["get", "markerLabel"],
            color: "#ffffff",
            size: ["case", ["==", ["get", "code"], selectedCode ?? ""], 12, 11],
            font: ["StandardFont-Bold"],
            allowOverlap: true,
            ignorePlacement: true,
            haloColor: "#0f172a",
            haloWidth: 1
          }
        });
        reportsLayerRef.current = reportsLayer;
        map.sources.add(source);
        map.layers.add([clusterLayer, clusterCountLayer, reportsLayer, reportLabelsLayer]);
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
          if (report) onReportSelect(report);
        };
        map.events.add("moveend", () => onBoundsChange(bounds(map)));
        map.events.add("click", clusterLayer, expandCluster);
        map.events.add("click", clusterCountLayer, expandCluster);
        map.events.add("click", reportsLayer, openReport);
        map.events.add("click", reportLabelsLayer, openReport);
        map.events.add("click", (event) => {
          if (suppressNextMapClickRef.current) {
            suppressNextMapClickRef.current = false;
            return;
          }
          const position = event.position ? [event.position[0], event.position[1]] as [number, number] : undefined;
          if (position && pointInAllowedZones(position, config.allowedBboxes)) onMapClick(position);
        });
        onBoundsChange(bounds(map));
      });
    } catch {
      setMapFailed(true);
      onBoundsChange();
    }
  }, [config, configReady, onBoundsChange, onMapClick, selectedCode]);

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
    source.clear();
    source.add(
      reports
        .filter((report) => report.location && pointInAllowedZones(report.location.coordinates, config.allowedBboxes))
        .map((report) => new atlas.data.Feature(new atlas.data.Point(report.location!.coordinates), {
          ...report,
          markerLabel: markerLabel(report)
        }))
    );
  }, [reports, config.allowedBboxes]);

  useEffect(() => {
    reportsLayerRef.current?.setOptions({
      radius: ["case", ["==", ["get", "code"], selectedCode ?? ""], 15, 10]
    });
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

function markerLabel(report: PublicReport): string {
  const personCount = report.persons?.length;
  if (personCount) return compactCount(personCount);
  if (report.peopleCount === "2-5") return "2+";
  if (report.peopleCount === "more_than_5") return "5+";
  const numericCount = Number(String(report.peopleCount).replace(/[^\d]/g, ""));
  if (Number.isFinite(numericCount) && numericCount > 0) return compactCount(numericCount);
  return report.priority === "P1" ? "1" : report.priority === "P2" ? "2" : "3";
}

function compactCount(count: number): string {
  if (count >= 1000) return `${Math.floor(count / 1000)}k`;
  if (count >= 100) return "99+";
  return String(count);
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
