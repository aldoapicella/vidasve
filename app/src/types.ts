export type ReportType =
  | "trapped_person"
  | "missing_last_seen"
  | "voices_or_hits"
  | "collapsed_building_unknown";

export type EventType =
  | "add_info"
  | "nearby_help"
  | "duplicate_claim"
  | "resolution_claim"
  | "reopen_claim"
  | "abuse_flag"
  | "risk_update"
  | "new_signs_of_life"
  | "owner_resolved"
  | "owner_reopened";

export interface PublicConfig {
  defaultCenter: [number, number];
  defaultZoom: number;
  allowedBboxes: Array<{ name: string; minLng: number; minLat: number; maxLng: number; maxLat: number }>;
  azureMapsClientId?: string;
  features: { mediaUploads: boolean; geocoding: boolean };
}

export type PersonStatus = "trapped" | "missing" | "signals_of_life" | "found" | "needs_verification";

export interface PublicPerson {
  id: string;
  displayName: string;
  age?: number;
  photoUrl?: string;
  description?: string;
  lastContactText?: string;
  lastKnownPlace?: string;
  floorOrUnit?: string;
  status: PersonStatus;
  publicContactName?: string;
  publicContactPhone?: string;
  publicContactRelationship?: string;
}

export interface PublicReport {
  id: string;
  code: string;
  location?: { type: "Point"; coordinates: [number, number] };
  locationUnknown?: boolean;
  locationAccuracy: "exact" | "approximate" | "zone_only";
  addressText: string;
  landmark?: string;
  city?: string;
  area?: string;
  type: ReportType;
  derivedStatus: string;
  priority: "P1" | "P2" | "P3";
  priorityScore: number;
  peopleCount: string;
  persons?: PublicPerson[];
  personDescriptionPublic?: string;
  lastContactText?: string;
  knownInfoPublic: string;
  signsOfLife: boolean;
  riskFlags: string[];
  sourceType?: string;
  reporterNamePublic?: string;
  publishContact: boolean;
  possibleDuplicateCodes: string[];
  counters: { updates: number; nearbyHelp: number; resolutionClaims: number; reopenClaims: number; abuseFlags: number };
  updatedAt: string;
}

export interface PublicEvent {
  id: string;
  reportId: string;
  reportCode: string;
  type: EventType;
  message?: string;
  reason?: string | null;
  public: boolean;
  abuseScore: number;
  createdAt: string;
}
