import { CosmosClient, type Container, type SqlParameter } from "@azure/cosmos";
import { randomUUID } from "node:crypto";
import { DefaultAzureCredential } from "@azure/identity";
import type { RateLimitStore } from "./rateLimit.js";
import { InMemoryRateLimitStore } from "./rateLimit.js";
import type { Report, ReportEvent } from "./types.js";
import { bboxToPolygon } from "./geo.js";

export interface ReportStore extends RateLimitStore {
  createReport(report: Report): Promise<void>;
  updateReport(report: Report): Promise<void>;
  getReportByCode(code: string): Promise<Report | undefined>;
  listReports(options: ListReportsOptions): Promise<Report[]>;
  addEvent(event: ReportEvent): Promise<void>;
  listEvents(reportId: string): Promise<ReportEvent[]>;
  logSecurityEvent(event: Record<string, unknown>): Promise<void>;
}

export interface ListReportsOptions {
  bbox?: [number, number, number, number];
  priorities?: string[];
  statuses?: string[];
  since?: string;
  limit?: number;
}

let singleton: ReportStore | undefined;

export function getStore(): ReportStore {
  if (singleton) return singleton;
  if (!process.env.COSMOS_ENDPOINT || process.env.USE_IN_MEMORY_STORE === "true") {
    singleton = new MemoryReportStore();
    return singleton;
  }
  singleton = new CosmosReportStore();
  return singleton;
}

class MemoryReportStore extends InMemoryRateLimitStore implements ReportStore {
  private reports = new Map<string, Report>();
  private events = new Map<string, ReportEvent[]>();
  private securityEvents: Record<string, unknown>[] = [];

  async createReport(report: Report): Promise<void> {
    this.reports.set(report.code, report);
  }

  async updateReport(report: Report): Promise<void> {
    this.reports.set(report.code, report);
  }

  async getReportByCode(code: string): Promise<Report | undefined> {
    return this.reports.get(code.toUpperCase());
  }

  async listReports(options: ListReportsOptions): Promise<Report[]> {
    return [...this.reports.values()]
      .filter((report) => !options.priorities?.length || options.priorities.includes(report.priority))
      .filter((report) => !options.statuses?.length || options.statuses.includes(report.derivedStatus))
      .filter((report) => !options.since || report.updatedAt >= options.since)
      .filter((report) => !options.bbox || pointInBbox(report, options.bbox))
      .slice(0, options.limit ?? 500);
  }

  async addEvent(event: ReportEvent): Promise<void> {
    this.events.set(event.reportId, [...(this.events.get(event.reportId) ?? []), event]);
  }

  async listEvents(reportId: string): Promise<ReportEvent[]> {
    return this.events.get(reportId) ?? [];
  }

  async logSecurityEvent(event: Record<string, unknown>): Promise<void> {
    this.securityEvents.push(event);
  }
}

class CosmosReportStore implements ReportStore {
  private reports: Container;
  private events: Container;
  private rateLimits: Container;
  private securityEvents: Container;

  constructor() {
    const endpoint = process.env.COSMOS_ENDPOINT!;
    const databaseId = process.env.COSMOS_DATABASE || "maparescate";
    const client = process.env.COSMOS_KEY
      ? new CosmosClient({ endpoint, key: process.env.COSMOS_KEY })
      : new CosmosClient({ endpoint, aadCredentials: new DefaultAzureCredential() });
    const database = client.database(databaseId);
    this.reports = database.container("reports");
    this.events = database.container("events");
    this.rateLimits = database.container("rateLimits");
    this.securityEvents = database.container("securityEvents");
  }

  async createReport(report: Report): Promise<void> {
    await this.reports.items.create(report);
  }

  async updateReport(report: Report): Promise<void> {
    await this.reports.item(report.id, report.areaKey).replace(report);
  }

  async getReportByCode(code: string): Promise<Report | undefined> {
    const query = {
      query: "SELECT TOP 1 * FROM c WHERE c.code = @code",
      parameters: [{ name: "@code", value: code.toUpperCase() }]
    };
    const { resources } = await this.reports.items.query<Report>(query, { maxItemCount: 1 }).fetchAll();
    return resources[0];
  }

  async listReports(options: ListReportsOptions): Promise<Report[]> {
    const clauses = ["1 = 1"];
    const parameters: SqlParameter[] = [];
    if (options.bbox) {
      clauses.push("IS_DEFINED(c.location) AND ST_WITHIN(c.location, @polygon)");
      parameters.push({ name: "@polygon", value: bboxToPolygon(options.bbox) });
    }
    if (options.priorities?.length) {
      clauses.push("ARRAY_CONTAINS(@priorities, c.priority)");
      parameters.push({ name: "@priorities", value: options.priorities });
    }
    if (options.statuses?.length) {
      clauses.push("ARRAY_CONTAINS(@statuses, c.derivedStatus)");
      parameters.push({ name: "@statuses", value: options.statuses });
    }
    if (options.since) {
      clauses.push("c.updatedAt >= @since");
      parameters.push({ name: "@since", value: options.since });
    }
    const query = {
      query: `SELECT TOP ${Math.min(options.limit ?? 500, 500)} * FROM c WHERE ${clauses.join(" AND ")} ORDER BY c.updatedAt DESC`,
      parameters
    };
    const { resources } = await this.reports.items.query<Report>(query, { maxItemCount: options.limit ?? 500 }).fetchAll();
    return resources;
  }

  async addEvent(event: ReportEvent): Promise<void> {
    await this.events.items.create(event);
  }

  async listEvents(reportId: string): Promise<ReportEvent[]> {
    const query = {
      query: "SELECT * FROM c WHERE c.reportId = @reportId ORDER BY c.createdAt ASC",
      parameters: [{ name: "@reportId", value: reportId }]
    };
    const { resources } = await this.events.items.query<ReportEvent>(query, { partitionKey: reportId }).fetchAll();
    return resources;
  }

  async increment(bucket: string, windowSeconds: number, now = new Date()): Promise<number> {
    const id = bucket;
    try {
      await this.rateLimits.items.create({ id, bucket, count: 1, ttl: windowSeconds, createdAt: now.toISOString() });
      return 1;
    } catch (err) {
      if (!isConflict(err)) throw err;
      const { resource } = await this.rateLimits.item(id, bucket).patch([
        { op: "incr", path: "/count", value: 1 },
        { op: "set", path: "/ttl", value: windowSeconds }
      ]);
      return Number((resource as { count?: number } | undefined)?.count ?? 1);
    }
  }

  async claimOnce(bucket: string, windowSeconds: number, now = new Date()): Promise<boolean> {
    try {
      await this.rateLimits.items.create({ id: bucket, bucket, count: 1, ttl: windowSeconds, createdAt: now.toISOString() });
      return true;
    } catch (err) {
      if (isConflict(err)) return false;
      throw err;
    }
  }

  async logSecurityEvent(event: Record<string, unknown>): Promise<void> {
    const day = new Date().toISOString().slice(0, 10);
    await this.securityEvents.items.create({
      id: randomUUID(),
      day,
      createdAt: new Date().toISOString(),
      ...event
    });
  }
}

function isConflict(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: number | string; statusCode?: number }).code;
  return code === 409 || code === "Conflict" || (err as { statusCode?: number }).statusCode === 409;
}

function pointInBbox(report: Report, bbox: [number, number, number, number]): boolean {
  if (!report.location) return false;
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const [lng, lat] = report.location.coordinates;
  return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat;
}
