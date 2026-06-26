export type ReportType =
  | "trapped_person"
  | "missing_last_seen"
  | "voices_or_hits"
  | "collapsed_building_unknown";

export type EventType =
  | "create_report"
  | "add_info"
  | "nearby_help"
  | "duplicate_claim"
  | "resolution_claim"
  | "reopen_claim"
  | "abuse_flag"
  | "risk_update"
  | "new_signs_of_life"
  | "owner_add_info"
  | "owner_resolved"
  | "owner_reopened"
  | "owner_contact_update";

export type PublicAction =
  | "create_report"
  | "add_info"
  | "nearby_help"
  | "duplicate_claim"
  | "resolution_claim"
  | "reopen_claim"
  | "abuse_flag"
  | "risk_update"
  | "new_signs_of_life"
  | "owner_event"
  | "maps_token";

export type LocationAccuracy = "exact" | "approximate" | "zone_only";
export type PeopleCount = "1" | "2-5" | "more_than_5" | "unknown";
export type Priority = "P1" | "P2" | "P3";
export type DerivedStatus =
  | "open"
  | "confirmed"
  | "help_nearby"
  | "maybe_resolved"
  | "resolved_owner"
  | "resolved_community"
  | "reopened"
  | "hidden_abuse";

export interface Actor {
  hasOwnerToken: boolean;
  ipHash?: string;
  deviceHash?: string;
  contactHash?: string | null;
  userAgentHash?: string;
}

export interface ReportEvent {
  id: string;
  reportId: string;
  reportCode: string;
  type: EventType;
  message?: string;
  reason?: string | null;
  public: boolean;
  actor: Actor;
  abuseScore: number;
  createdAt: string;
}

export interface GeoPoint {
  type: "Point";
  coordinates: [number, number];
}

export interface Report {
  id: string;
  code: string;
  areaKey: string;
  geoCell: string;
  location?: GeoPoint;
  locationUnknown?: boolean;
  locationAccuracy: LocationAccuracy;
  addressText: string;
  landmark?: string;
  city?: string;
  area?: string;
  type: ReportType;
  derivedStatus: DerivedStatus;
  priority: Priority;
  priorityScore: number;
  confirmationScore: number;
  abuseScore: number;
  peopleCount: PeopleCount;
  personDescriptionPublic?: string;
  lastContactText?: string;
  lastContactAt?: string;
  knownInfoPublic: string;
  signsOfLife: boolean;
  riskFlags: string[];
  sourceType?: string;
  reporterNamePublic?: string;
  publishContact: boolean;
  reporterContactEncrypted?: string;
  contactHash?: string;
  ownerTokenHash: string;
  possibleDuplicateCodes: string[];
  counters: {
    updates: number;
    nearbyHelp: number;
    resolutionClaims: number;
    reopenClaims: number;
    abuseFlags: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ChallengeEnvelope {
  nonce: string;
  issuedAt: string;
  action: PublicAction;
  difficulty: number;
  signature: string;
}

export interface ChallengeSubmission {
  challenge: ChallengeEnvelope;
  solution: string;
}

export interface AllowedBbox {
  name: string;
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

export interface CreateReportInput {
  location?: GeoPoint;
  locationUnknown?: boolean;
  locationAccuracy: LocationAccuracy;
  addressText: string;
  landmark?: string;
  city?: string;
  area?: string;
  type: ReportType;
  peopleCount: PeopleCount;
  personDescriptionPublic?: string;
  lastContactText?: string;
  lastContactAt?: string;
  knownInfoPublic: string;
  signsOfLife: boolean;
  riskFlags: string[];
  sourceType?: string;
  reporterNamePublic?: string;
  reporterContact?: string;
  publishContact?: boolean;
  deviceId?: string;
  website?: string;
  company?: string;
  middleName?: string;
  challenge: ChallengeSubmission;
}
