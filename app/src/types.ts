export type ReportType =
  | "trapped_person"
  | "missing_last_seen"
  | "voices_or_hits"
  | "collapsed_building_unknown";

export type EventType =
  | "add_info"
  | "add_person"
  | "nearby_help"
  | "duplicate_claim"
  | "resolution_claim"
  | "reopen_claim"
  | "abuse_flag"
  | "risk_update"
  | "new_signs_of_life"
  | "owner_resolved"
  | "owner_reopened"
  | "public_post";

export interface PublicConfig {
  defaultCenter: [number, number];
  defaultZoom: number;
  allowedBboxes: Array<{ name: string; minLng: number; minLat: number; maxLng: number; maxLat: number }>;
  azureMapsClientId?: string;
  features: { mediaUploads: boolean; geocoding: boolean };
  captcha?: { provider: "text" | "turnstile"; siteKey?: string };
}

export interface PlaceSuggestion {
  id: string;
  label: string;
  detail?: string;
  coordinates: [number, number];
}

export type PersonStatus = "trapped" | "missing" | "signals_of_life" | "found" | "needs_verification";
export type PublicPostType = "story" | "photo" | "flyer" | "screenshot" | "pdf" | "update";

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
  lastContactAt?: string;
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
  postType?: PublicPostType;
  personId?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  tags?: string[];
  public: boolean;
  abuseScore: number;
  createdAt: string;
}

export interface PublicPost {
  id: string;
  reportCode: string;
  reportId: string;
  personId?: string;
  text: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  type: PublicPostType;
  tags: string[];
  createdAt: string;
  report: {
    code: string;
    addressText: string;
    priority: "P1" | "P2" | "P3";
    derivedStatus: string;
  };
}

export interface PublicSearchResponse {
  reports: PublicReport[];
  people: Array<{
    reportCode: string;
    reportPriority: PublicReport["priority"];
    reportAddress: string;
    person: PublicPerson;
  }>;
  posts: PublicPost[];
  locations: Array<{
    code: string;
    addressText: string;
    landmark?: string;
    area?: string;
    city?: string;
    priority: PublicReport["priority"];
  }>;
}
