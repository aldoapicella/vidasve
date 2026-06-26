import { useEffect, useRef, useState } from "react";
import * as atlas from "azure-maps-control";
import { getMapToken } from "../api/client";
import type { PublicConfig, PublicReport } from "../types";

export function MapView({
  config,
  reports,
  selectedCode,
  pickedLocation,
  onBoundsChange,
  onReportSelect,
  onMapClick
}: {
  config: PublicConfig;
  reports: PublicReport[];
  selectedCode?: string;
  pickedLocation?: [number, number];
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
  const [mapFailed, setMapFailed] = useState(false);

  useEffect(() => {
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
      const source = new atlas.source.DataSource(undefined, { cluster: true, clusterRadius: 42 });
      sourceRef.current = source;
      mapRef.current = map;
      map.events.add("ready", () => {
        if (activeBounds) map.setCamera({ bounds: activeBounds, maxBounds: activeBounds, padding: 48, maxZoom: config.defaultZoom });
        const reportsLayer = new atlas.layer.BubbleLayer(source, "reports", {
          filter: ["!", ["has", "point_count"]],
          color: ["match", ["get", "priority"], "P1", "#b91c1c", "P2", "#b45309", "#155e75"],
          radius: ["case", ["==", ["get", "code"], selectedCode ?? ""], 15, 10],
          strokeColor: "#ffffff",
          strokeWidth: 2,
          blur: 0.08
        });
        reportsLayerRef.current = reportsLayer;
        map.sources.add(source);
        map.layers.add([
          new atlas.layer.BubbleLayer(source, "clusters", {
            filter: ["has", "point_count"],
            color: "#0f172a",
            radius: 22,
            strokeColor: "#ffffff",
            strokeWidth: 2
          }),
          new atlas.layer.SymbolLayer(source, "cluster-count", {
            filter: ["has", "point_count"],
            textOptions: { textField: ["get", "point_count_abbreviated"], color: "#ffffff", size: 13 }
          }),
          reportsLayer
        ]);
        map.events.add("moveend", () => onBoundsChange(bounds(map)));
        map.events.add("click", reportsLayer, (event) => {
          const report = reportFromShape(event.shapes?.[0]);
          if (report) onReportSelect(report);
        });
        map.events.add("click", (event) => {
          const position = event.position ? [event.position[0], event.position[1]] as [number, number] : undefined;
          if (position && pointInAllowedZones(position, config.allowedBboxes)) onMapClick(position);
        });
        onBoundsChange(bounds(map));
      });
    } catch {
      setMapFailed(true);
      onBoundsChange();
    }
  }, [config, onBoundsChange, onMapClick, selectedCode]);

  useEffect(() => {
    const source = sourceRef.current;
    if (!source) return;
    source.clear();
    source.add(
      reports
        .filter((report) => report.location && pointInAllowedZones(report.location.coordinates, config.allowedBboxes))
        .map((report) => new atlas.data.Feature(new atlas.data.Point(report.location!.coordinates), report))
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

  if (mapFailed || !config.azureMapsClientId) {
    return (
      <section className="fallbackMap" aria-label="Lista de reportes">
        <div>
          <h1>MapaRescate Venezuela</h1>
          <p>Mapa no disponible. Se muestra la lista publica por zona.</p>
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

  return <div ref={containerRef} className="mapCanvas" aria-label="Mapa de reportes" />;
}

function reportFromShape(shape?: atlas.data.Feature<atlas.data.Geometry, PublicReport> | atlas.Shape): PublicReport | undefined {
  if (!shape) return undefined;
  return "getProperties" in shape ? (shape.getProperties() as PublicReport) : shape.properties;
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
