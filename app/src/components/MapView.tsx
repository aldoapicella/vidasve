import { useEffect, useRef, useState } from "react";
import * as atlas from "azure-maps-control";
import { getMapToken } from "../api/client";
import type { PublicConfig, PublicReport } from "../types";

export function MapView({
  config,
  reports,
  selectedCode,
  onBoundsChange,
  onReportSelect,
  onMapClick
}: {
  config: PublicConfig;
  reports: PublicReport[];
  selectedCode?: string;
  onBoundsChange: (bbox?: [number, number, number, number]) => void;
  onReportSelect: (report: PublicReport) => void;
  onMapClick: (location: [number, number]) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<atlas.Map | null>(null);
  const sourceRef = useRef<atlas.source.DataSource | null>(null);
  const reportsLayerRef = useRef<atlas.layer.BubbleLayer | null>(null);
  const [mapFailed, setMapFailed] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !config.azureMapsClientId) {
      if (!config.azureMapsClientId) onBoundsChange();
      return;
    }

    const [lat, lng] = config.defaultCenter;
    try {
      const map = new atlas.Map(containerRef.current, {
        center: [lng, lat],
        zoom: config.defaultZoom,
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
          if (event.position) onMapClick([event.position[0], event.position[1]]);
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
        .filter((report) => report.location)
        .map((report) => new atlas.data.Feature(new atlas.data.Point(report.location!.coordinates), report))
    );
  }, [reports]);

  useEffect(() => {
    reportsLayerRef.current?.setOptions({
      radius: ["case", ["==", ["get", "code"], selectedCode ?? ""], 15, 10]
    });
  }, [selectedCode]);

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
