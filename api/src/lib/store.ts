import { CosmosClient, type Container, type SqlParameter } from "@azure/cosmos";
import { randomUUID } from "node:crypto";
import { DefaultAzureCredential } from "@azure/identity";
import type { RateLimitStore } from "./rateLimit.js";
import { InMemoryRateLimitStore } from "./rateLimit.js";
import { reportSearchText } from "./reportLogic.js";
import { isPublicEvent, isPublicReport, publicMapReport } from "./sanitize.js";
import type { MediaAsset, Report, ReportEvent, ReportMapItem, Visibility } from "./types.js";
import { bboxToPolygon } from "./geo.js";

export interface ReportStore extends RateLimitStore {
  createReport(report: Report): Promise<void>;
  updateReport(report: Report): Promise<void>;
  getReportByCode(code: string): Promise<Report | undefined>;
  getReportByClientMutationId(clientMutationId: string): Promise<Report | undefined>;
  getReportsByCodes(codes: string[]): Promise<Report[]>;
  listReports(options: ListReportsOptions): Promise<Report[]>;
  listMapReports(options: ListReportsOptions): Promise<ReportMapItem[]>;
  searchReports(query: string, limit: number): Promise<Report[]>;
  addEvent(event: ReportEvent): Promise<void>;
  updateEvent(event: ReportEvent): Promise<void>;
  listEvents(reportId: string): Promise<ReportEvent[]>;
  listPublicPostEvents(limit: number): Promise<PostEventRecord[]>;
  searchPublicPostEvents(query: string, limit: number): Promise<PostEventRecord[]>;
  listModerationQueue(options: ModerationQueueOptions): Promise<ModerationQueueItem[]>;
  createMediaAsset(asset: MediaAsset): Promise<void>;
  updateMediaAsset(asset: MediaAsset): Promise<void>;
  getMediaAsset(id: string): Promise<MediaAsset | undefined>;
  listMediaAssetsForReport(reportId: string): Promise<MediaAsset[]>;
  removeReportData(code: string, values: { reason: string; moderatedAt: string; moderatedByHash: string }): Promise<Report | undefined>;
  logSecurityEvent(event: Record<string, unknown>): Promise<void>;
}

export interface ListReportsOptions {
  bbox?: [number, number, number, number];
  priorities?: string[];
  statuses?: string[];
  since?: string;
  limit?: number;
}

export interface PostEventRecord {
  event: ReportEvent;
  report: Report;
}

export interface ModerationQueueOptions {
  status?: Visibility | "flagged";
  limit?: number;
}

export type ModerationQueueItem =
  | { kind: "report"; report: Report; createdAt: string }
  | { kind: "event"; event: ReportEvent; report?: Report; createdAt: string };

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
  private media = new Map<string, MediaAsset>();
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

  async getReportByClientMutationId(clientMutationId: string): Promise<Report | undefined> {
    return [...this.reports.values()].find((report) => report.clientMutationId === clientMutationId);
  }

  async getReportsByCodes(codes: string[]): Promise<Report[]> {
    const wanted = new Set(codes.map((code) => code.toUpperCase()));
    return [...this.reports.values()].filter((report) => wanted.has(report.code));
  }

  async listReports(options: ListReportsOptions): Promise<Report[]> {
    return [...this.reports.values()]
      .filter((report) => !options.priorities?.length || options.priorities.includes(report.priority))
      .filter((report) => !options.statuses?.length || options.statuses.includes(report.derivedStatus))
      .filter((report) => !options.since || report.updatedAt >= options.since)
      .filter((report) => !options.bbox || pointInBbox(report, options.bbox))
      .slice(0, options.limit ?? 500);
  }

  async listMapReports(options: ListReportsOptions): Promise<ReportMapItem[]> {
    return (await this.listReports(options))
      .filter(isPublicReport)
      .map(publicMapReport);
  }

  async searchReports(query: string, limit: number): Promise<Report[]> {
    const normalized = normalizeSearch(query);
    return [...this.reports.values()]
      .filter(isPublicReport)
      .filter((report) => (report.searchText || reportSearchText(report)).includes(normalized))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit);
  }

  async addEvent(event: ReportEvent): Promise<void> {
    this.events.set(event.reportId, [...(this.events.get(event.reportId) ?? []), event]);
  }

  async updateEvent(event: ReportEvent): Promise<void> {
    this.events.set(event.reportId, (this.events.get(event.reportId) ?? []).map((item) => item.id === event.id ? event : item));
  }

  async listEvents(reportId: string): Promise<ReportEvent[]> {
    return this.events.get(reportId) ?? [];
  }

  async listPublicPostEvents(limit: number): Promise<PostEventRecord[]> {
    return this.postEventRecords()
      .filter(({ event, report }) => event.type === "public_post" && isPublicEvent(event) && isPublicReport(report))
      .sort((a, b) => b.event.createdAt.localeCompare(a.event.createdAt))
      .slice(0, limit);
  }

  async searchPublicPostEvents(query: string, limit: number): Promise<PostEventRecord[]> {
    const normalized = normalizeSearch(query);
    return this.postEventRecords()
      .filter(({ event, report }) => event.type === "public_post" && isPublicEvent(event) && isPublicReport(report))
      .filter(({ event }) => (event.searchText || normalizeSearch(event.message ?? "")).includes(normalized))
      .sort((a, b) => b.event.createdAt.localeCompare(a.event.createdAt))
      .slice(0, limit);
  }

  async listModerationQueue(options: ModerationQueueOptions): Promise<ModerationQueueItem[]> {
    const status = options.status ?? "flagged";
    const reportItems: ModerationQueueItem[] = [...this.reports.values()]
      .filter((report) => status === "flagged" ? report.derivedStatus === "hidden_abuse" && report.visibility !== "removed" : report.visibility === status)
      .map((report) => ({ kind: "report", report, createdAt: report.updatedAt }));
    const eventItems: ModerationQueueItem[] = [...this.events.values()].flat()
      .filter((event) => status === "flagged" ? event.type === "abuse_flag" && event.visibility !== "removed" : event.visibility === status)
      .map((event) => ({ kind: "event", event, report: [...this.reports.values()].find((report) => report.id === event.reportId), createdAt: event.createdAt }));
    return [...reportItems, ...eventItems]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, options.limit ?? 50);
  }

  async createMediaAsset(asset: MediaAsset): Promise<void> {
    this.media.set(asset.id, asset);
  }

  async updateMediaAsset(asset: MediaAsset): Promise<void> {
    this.media.set(asset.id, asset);
  }

  async getMediaAsset(id: string): Promise<MediaAsset | undefined> {
    return this.media.get(id);
  }

  async listMediaAssetsForReport(reportId: string): Promise<MediaAsset[]> {
    return [...this.media.values()].filter((asset) => asset.reportId === reportId);
  }

  async removeReportData(code: string, values: { reason: string; moderatedAt: string; moderatedByHash: string }): Promise<Report | undefined> {
    const report = await this.getReportByCode(code);
    if (!report) return undefined;
    const removed = removedReport(report, values);
    await this.updateReport(removed);
    for (const event of await this.listEvents(report.id)) {
      await this.updateEvent(removedEvent(event, values));
    }
    for (const asset of await this.listMediaAssetsForReport(report.id)) {
      await this.updateMediaAsset({ ...asset, visibility: "removed", moderationReason: values.reason, moderatedAt: values.moderatedAt, moderatedByHash: values.moderatedByHash });
    }
    await this.logSecurityEvent({ type: "admin_remove_report", reportCode: report.code, reason: values.reason });
    return removed;
  }

  async logSecurityEvent(event: Record<string, unknown>): Promise<void> {
    this.securityEvents.push(event);
  }

  private postEventRecords(): PostEventRecord[] {
    return [...this.events.values()].flatMap((events) => events.flatMap((event) => {
      const report = [...this.reports.values()].find((item) => item.id === event.reportId);
      return report ? [{ event, report }] : [];
    }));
  }
}

class CosmosReportStore implements ReportStore {
  private reports: Container;
  private events: Container;
  private rateLimits: Container;
  private securityEvents: Container;
  private media: Container;

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
    this.media = database.container("media");
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

  async getReportByClientMutationId(clientMutationId: string): Promise<Report | undefined> {
    const query = {
      query: "SELECT TOP 1 * FROM c WHERE c.clientMutationId = @clientMutationId",
      parameters: [{ name: "@clientMutationId", value: clientMutationId }]
    };
    const { resources } = await this.reports.items.query<Report>(query, { maxItemCount: 1 }).fetchAll();
    return resources[0];
  }

  async getReportsByCodes(codes: string[]): Promise<Report[]> {
    const normalized = [...new Set(codes.map((code) => code.toUpperCase()).filter(Boolean))];
    if (!normalized.length) return [];
    const query = {
      query: "SELECT * FROM c WHERE ARRAY_CONTAINS(@codes, c.code)",
      parameters: [{ name: "@codes", value: normalized }]
    };
    const { resources } = await this.reports.items.query<Report>(query, { maxItemCount: normalized.length }).fetchAll();
    return resources;
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

  async listMapReports(options: ListReportsOptions): Promise<ReportMapItem[]> {
    const clauses = [publicReportWhere("c")];
    const parameters: SqlParameter[] = [];
    const limit = Math.min(options.limit ?? 500, 500);
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
      query: `SELECT TOP ${limit}
        c.id, c.code, c.location, c.locationUnknown, c.locationAccuracy,
        c.addressText, c.landmark, c.city, c.area, c.type,
        c.derivedStatus, c.priority, c.peopleCount, c.signsOfLife,
        c.sourceType, c.counters, c.updatedAt
        FROM c WHERE ${clauses.join(" AND ")} ORDER BY c.updatedAt DESC`,
      parameters
    };
    const { resources } = await this.reports.items.query<ReportMapItem>(query, { maxItemCount: limit }).fetchAll();
    return resources;
  }

  async searchReports(queryText: string, limit: number): Promise<Report[]> {
    const query = {
      query: `SELECT TOP ${Math.min(limit, 100)} * FROM c
        WHERE ${publicReportWhere("c")}
        AND (
          (IS_DEFINED(c.searchText) AND CONTAINS(c.searchText, @query))
          OR (IS_DEFINED(c.code) AND CONTAINS(LOWER(c.code), @query))
          OR (IS_DEFINED(c.addressText) AND CONTAINS(LOWER(c.addressText), @query))
          OR (IS_DEFINED(c.landmark) AND CONTAINS(LOWER(c.landmark), @query))
          OR (IS_DEFINED(c.city) AND CONTAINS(LOWER(c.city), @query))
          OR (IS_DEFINED(c.area) AND CONTAINS(LOWER(c.area), @query))
          OR (IS_DEFINED(c.knownInfoPublic) AND CONTAINS(LOWER(c.knownInfoPublic), @query))
        )
        ORDER BY c.updatedAt DESC`,
      parameters: [{ name: "@query", value: normalizeSearch(queryText) }]
    };
    const { resources } = await this.reports.items.query<Report>(query, { maxItemCount: limit }).fetchAll();
    return resources;
  }

  async addEvent(event: ReportEvent): Promise<void> {
    await this.events.items.create(event);
  }

  async updateEvent(event: ReportEvent): Promise<void> {
    await this.events.item(event.id, event.reportId).replace(event);
  }

  async listEvents(reportId: string): Promise<ReportEvent[]> {
    const query = {
      query: "SELECT * FROM c WHERE c.reportId = @reportId ORDER BY c.createdAt ASC",
      parameters: [{ name: "@reportId", value: reportId }]
    };
    const { resources } = await this.events.items.query<ReportEvent>(query, { partitionKey: reportId }).fetchAll();
    return resources;
  }

  async listPublicPostEvents(limit: number): Promise<PostEventRecord[]> {
    const events = await this.queryPostEvents(undefined, limit);
    return this.joinPostEvents(events);
  }

  async searchPublicPostEvents(queryText: string, limit: number): Promise<PostEventRecord[]> {
    const events = await this.queryPostEvents(normalizeSearch(queryText), limit);
    return this.joinPostEvents(events);
  }

  async listModerationQueue(options: ModerationQueueOptions): Promise<ModerationQueueItem[]> {
    const limit = Math.min(options.limit ?? 50, 100);
    const status = options.status ?? "flagged";
    const reportQuery = {
      query: `SELECT TOP ${limit} * FROM c WHERE ${status === "flagged" ? "c.derivedStatus = 'hidden_abuse' AND (NOT IS_DEFINED(c.visibility) OR c.visibility != 'removed')" : "c.visibility = @status"} ORDER BY c.updatedAt DESC`,
      parameters: status === "flagged" ? [] : [{ name: "@status", value: status }]
    };
    const eventQuery = {
      query: `SELECT TOP ${limit} * FROM c WHERE ${status === "flagged" ? "c.type = 'abuse_flag' AND (NOT IS_DEFINED(c.visibility) OR c.visibility != 'removed')" : "c.visibility = @status"} ORDER BY c.createdAt DESC`,
      parameters: status === "flagged" ? [] : [{ name: "@status", value: status }]
    };
    const [{ resources: reports }, { resources: events }] = await Promise.all([
      this.reports.items.query<Report>(reportQuery, { maxItemCount: limit }).fetchAll(),
      this.events.items.query<ReportEvent>(eventQuery, { maxItemCount: limit }).fetchAll()
    ]);
    const reportsByCode = new Map((await this.getReportsByCodes(events.map((event) => event.reportCode))).map((report) => [report.code, report]));
    return [
      ...reports.map((report): ModerationQueueItem => ({ kind: "report", report, createdAt: report.updatedAt })),
      ...events.map((event): ModerationQueueItem => ({ kind: "event", event, report: reportsByCode.get(event.reportCode), createdAt: event.createdAt }))
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  }

  async createMediaAsset(asset: MediaAsset): Promise<void> {
    await this.media.items.create(asset);
  }

  async updateMediaAsset(asset: MediaAsset): Promise<void> {
    await this.media.item(asset.id, asset.reportId).replace(asset);
  }

  async getMediaAsset(id: string): Promise<MediaAsset | undefined> {
    const query = {
      query: "SELECT TOP 1 * FROM c WHERE c.id = @id",
      parameters: [{ name: "@id", value: id }]
    };
    try {
      const { resources } = await this.media.items.query<MediaAsset>(query, { maxItemCount: 1 }).fetchAll();
      return resources[0];
    } catch (err) {
      if (isNotFound(err)) return undefined;
      throw err;
    }
  }

  async listMediaAssetsForReport(reportId: string): Promise<MediaAsset[]> {
    const query = {
      query: "SELECT * FROM c WHERE c.reportId = @reportId",
      parameters: [{ name: "@reportId", value: reportId }]
    };
    try {
      const { resources } = await this.media.items.query<MediaAsset>(query, { partitionKey: reportId }).fetchAll();
      return resources;
    } catch (err) {
      if (isNotFound(err)) return [];
      throw err;
    }
  }

  async removeReportData(code: string, values: { reason: string; moderatedAt: string; moderatedByHash: string }): Promise<Report | undefined> {
    const report = await this.getReportByCode(code);
    if (!report) return undefined;
    const removed = removedReport(report, values);
    await this.updateReport(removed);
    for (const event of await this.listEvents(report.id)) {
      await this.updateEvent(removedEvent(event, values));
    }
    for (const asset of await this.listMediaAssetsForReport(report.id)) {
      await this.updateMediaAsset({ ...asset, visibility: "removed", moderationReason: values.reason, moderatedAt: values.moderatedAt, moderatedByHash: values.moderatedByHash });
    }
    await this.logSecurityEvent({ type: "admin_remove_report", reportCode: report.code, reason: values.reason });
    return removed;
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

  private async queryPostEvents(queryText: string | undefined, limit: number): Promise<ReportEvent[]> {
    const where = [
      "c.type = 'public_post'",
      "c.public = true",
      publicEventWhere("c"),
      queryText ? "((IS_DEFINED(c.searchText) AND CONTAINS(c.searchText, @query)) OR (IS_DEFINED(c.message) AND CONTAINS(LOWER(c.message), @query)))" : ""
    ].filter(Boolean).join(" AND ");
    const query = {
      query: `SELECT TOP ${Math.min(limit, 100)} * FROM c WHERE ${where} ORDER BY c.createdAt DESC`,
      parameters: queryText ? [{ name: "@query", value: queryText }] : []
    };
    const { resources } = await this.events.items.query<ReportEvent>(query, { maxItemCount: limit }).fetchAll();
    return resources;
  }

  private async joinPostEvents(events: ReportEvent[]): Promise<PostEventRecord[]> {
    const reports = new Map((await this.getReportsByCodes(events.map((event) => event.reportCode))).map((report) => [report.code, report]));
    return events.flatMap((event) => {
      const report = reports.get(event.reportCode);
      return report && isPublicReport(report) ? [{ event, report }] : [];
    });
  }
}

function isConflict(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: number | string; statusCode?: number }).code;
  return code === 409 || code === "Conflict" || (err as { statusCode?: number }).statusCode === 409;
}

function isNotFound(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: number | string; statusCode?: number }).code;
  return code === 404 || code === "NotFound" || (err as { statusCode?: number }).statusCode === 404;
}

function publicReportWhere(alias: string): string {
  return `(NOT IS_DEFINED(${alias}.visibility) OR ${alias}.visibility = 'public') AND ${alias}.derivedStatus != 'hidden_abuse'`;
}

function publicEventWhere(alias: string): string {
  return `(NOT IS_DEFINED(${alias}.visibility) OR ${alias}.visibility = 'public')`;
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function removedReport(report: Report, values: { reason: string; moderatedAt: string; moderatedByHash: string }): Report {
  const updated: Report = {
    ...report,
    clientMutationId: undefined,
    visibility: "removed",
    moderationReason: values.reason,
    moderatedAt: values.moderatedAt,
    moderatedByHash: values.moderatedByHash,
    derivedStatus: "hidden_abuse",
    priority: "P3",
    priorityScore: 0,
    confirmationScore: 0,
    abuseScore: 0,
    addressText: `Reporte removido ${report.code}`,
    landmark: undefined,
    city: undefined,
    area: undefined,
    location: undefined,
    locationUnknown: true,
    persons: [],
    personDescriptionPublic: "",
    lastContactText: "",
    lastContactAt: "",
    knownInfoPublic: "Contenido removido por moderación.",
    riskFlags: [],
    sourceType: undefined,
    reporterNamePublic: undefined,
    reporterContactEncrypted: undefined,
    contactHash: undefined,
    ownerTokenHash: "",
    possibleDuplicateCodes: [],
    updatedAt: values.moderatedAt
  };
  return { ...updated, searchText: reportSearchText(updated) };
}

function removedEvent(event: ReportEvent, values: { reason: string; moderatedAt: string; moderatedByHash: string }): ReportEvent {
  return {
    ...event,
    clientMutationId: undefined,
    visibility: "removed",
    moderationReason: values.reason,
    moderatedAt: values.moderatedAt,
    moderatedByHash: values.moderatedByHash,
    public: false,
    message: "Contenido removido por moderación.",
    reason: null,
    postType: undefined,
    personId: undefined,
    mediaUrl: undefined,
    thumbnailUrl: undefined,
    mediaId: undefined,
    thumbnailMediaId: undefined,
    tags: [],
    actor: { hasOwnerToken: false },
    abuseScore: 0,
    searchText: ""
  };
}

function pointInBbox(report: Report, bbox: [number, number, number, number]): boolean {
  if (!report.location) return false;
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const [lng, lat] = report.location.coordinates;
  return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat;
}
