export type ReportType =
  | "trapped_person"
  | "missing_last_seen"
  | "voices_or_hits"
  | "collapsed_building_unknown";

export type EventType =
  | "create_report"
  | "add_info"
  | "add_person"
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
  | "owner_contact_update"
  | "public_post";

export type PublicAction =
  | "create_report"
  | "add_info"
  | "add_person"
  | "nearby_help"
  | "duplicate_claim"
  | "resolution_claim"
  | "reopen_claim"
  | "abuse_flag"
  | "risk_update"
  | "new_signs_of_life"
  | "owner_event"
  | "maps_token"
  | "places_search"
  | "public_post";

export type LocationAccuracy = "exact" | "approximate" | "zone_only";
export type PeopleCount = "1" | "2-5" | "more_than_5" | "unknown";
export type Priority = "P1" | "P2" | "P3";
export type PersonStatus = "trapped" | "missing" | "signals_of_life" | "found" | "needs_verification";
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
  postType?: PublicPostType;
  personId?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  tags?: string[];
  public: boolean;
  actor: Actor;
  abuseScore: number;
  createdAt: string;
}

export interface GeoPoint {
  type: "Point";
  coordinates: [number, number];
}

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

export type PublicPostType = "story" | "photo" | "flyer" | "screenshot" | "pdf" | "update";

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
    priority: Priority;
    derivedStatus: DerivedStatus;
  };
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
  persons?: PublicPerson[];
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
  captchaText?: string;
  captchaToken?: string;
  website?: string;
  company?: string;
  middleName?: string;
  challenge: ChallengeSubmission;
}
