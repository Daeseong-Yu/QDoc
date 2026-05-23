import { z } from "zod";

export const ticketStatusSchema = z.enum([
  "waiting",
  "called",
  "in_service",
  "completed",
  "delay",
  "cancelled",
]);

export type TicketStatus = z.infer<typeof ticketStatusSchema>;

export const activeTicketStatuses: TicketStatus[] = ["waiting", "called", "in_service", "delay"];

export const siteSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  queueName: z.string(),
  estimatedWaitLabel: z.string(),
});

export type SiteSummary = z.infer<typeof siteSummarySchema>;

export const emailSchema = z.string().trim().email().toLowerCase();

export const membershipRoleSchema = z.enum(["staff", "admin"]);

export type MembershipRole = z.infer<typeof membershipRoleSchema>;

export const otpRequestInputSchema = z.object({
  email: emailSchema,
});

export type OtpRequestInput = z.infer<typeof otpRequestInputSchema>;

export const otpVerifyInputSchema = z.object({
  email: emailSchema,
  code: z.string().trim().regex(/^\d{6}$/),
});

export type OtpVerifyInput = z.infer<typeof otpVerifyInputSchema>;

export const membershipSummarySchema = z.object({
  siteId: z.string(),
  siteName: z.string(),
  role: membershipRoleSchema,
  waitingTicketCount: z.number().int().nonnegative(),
});

export const currentUserSchema = z.object({
  id: z.string(),
  email: emailSchema,
  memberships: membershipSummarySchema.array(),
});

export type CurrentUser = z.infer<typeof currentUserSchema>;

export const authErrorSchema = z.object({
  error: z.enum([
    "conflict",
    "forbidden",
    "invalid_request",
    "invalid_otp",
    "invalid_transition",
    "internal_error",
    "map_budget_exhausted",
    "map_provider_disabled",
    "otp_delivery_unavailable",
    "queue_closed",
    "rate_limited",
    "unauthorized",
    "not_found",
  ]),
  retryAfterSeconds: z.number().int().positive().optional(),
});

export type AuthError = z.infer<typeof authErrorSchema>;

export const staffQueueSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  isOpen: z.boolean(),
});

export const staffQueueResponseSchema = z.object({
  siteId: z.string(),
  siteName: z.string(),
  queues: staffQueueSummarySchema.array(),
  tickets: z
    .object({
      id: z.string(),
      siteId: z.string(),
      siteName: z.string(),
      queueId: z.string(),
      queueName: z.string(),
      patientEmail: z.string().min(1),
      status: ticketStatusSchema,
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
    })
    .array(),
});

export type StaffQueueResponse = z.infer<typeof staffQueueResponseSchema>;

export const staffTicketSummarySchema = z.object({
  id: z.string(),
  siteId: z.string(),
  siteName: z.string(),
  queueId: z.string(),
  queueName: z.string(),
  patientEmail: z.string().min(1),
  status: ticketStatusSchema,
  updatedAt: z.string().datetime(),
});

export type StaffTicketSummary = z.infer<typeof staffTicketSummarySchema>;

export const staffTicketResponseSchema = z.object({
  ticket: staffTicketSummarySchema,
});

export type StaffTicketResponse = z.infer<typeof staffTicketResponseSchema>;

export const staffTicketActionInputSchema = z.object({
  siteId: z.string().min(1),
});

export type StaffTicketActionInput = z.infer<typeof staffTicketActionInputSchema>;

const optionalNullableStringSchema = z.string().trim().max(120).nullable().optional();

export const staffSiteSettingsSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  distanceKm: z.number().nonnegative(),
  notificationAheadCount: z.number().int().min(0).max(10),
  addressLine1: z.string().nullable(),
  city: z.string().nullable(),
  region: z.string().nullable(),
  postalCode: z.string().nullable(),
  country: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
});

export type StaffSiteSettings = z.infer<typeof staffSiteSettingsSchema>;

export const staffSiteSettingsInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    distanceKm: z.number().nonnegative().optional(),
    notificationAheadCount: z.number().int().min(0).max(10).optional(),
    addressLine1: optionalNullableStringSchema,
    city: optionalNullableStringSchema,
    region: optionalNullableStringSchema,
    postalCode: optionalNullableStringSchema,
    country: optionalNullableStringSchema,
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0);

export type StaffSiteSettingsInput = z.infer<typeof staffSiteSettingsInputSchema>;

export const staffQueueSettingsInputSchema = z.object({
  isOpen: z.boolean(),
});

export type StaffQueueSettingsInput = z.infer<typeof staffQueueSettingsInputSchema>;

export const staffMembershipSummarySchema = z.object({
  id: z.string(),
  userId: z.string(),
  email: emailSchema,
  role: membershipRoleSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type StaffMembershipSummary = z.infer<typeof staffMembershipSummarySchema>;

export const staffMembershipInputSchema = z.object({
  email: emailSchema,
  role: membershipRoleSchema,
});

export type StaffMembershipInput = z.infer<typeof staffMembershipInputSchema>;

export const staffMembershipRoleInputSchema = z.object({
  role: membershipRoleSchema,
});

export type StaffMembershipRoleInput = z.infer<typeof staffMembershipRoleInputSchema>;

export const staffAuditLogSummarySchema = z.object({
  id: z.string(),
  action: z.string(),
  actorEmail: emailSchema.nullable(),
  metadata: z.unknown().nullable(),
  createdAt: z.string().datetime(),
});

export type StaffAuditLogSummary = z.infer<typeof staffAuditLogSummarySchema>;

export const siteLocationSchema = z.object({
  addressLine1: z.string().nullable(),
  city: z.string().nullable(),
  region: z.string().nullable(),
  postalCode: z.string().nullable(),
  country: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
});

export type SiteLocation = z.infer<typeof siteLocationSchema>;

export const patientSiteSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  waitingTicketCount: z.number().int().nonnegative(),
  distanceKm: z.number().nonnegative(),
  location: siteLocationSchema,
});

export type PatientSiteSummary = z.infer<typeof patientSiteSummarySchema>;

export const patientSitesResponseSchema = z.object({
  sites: patientSiteSummarySchema.array(),
});

export type PatientSitesResponse = z.infer<typeof patientSitesResponseSchema>;

export const patientQueueSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  isOpen: z.boolean(),
});

export type PatientQueueSummary = z.infer<typeof patientQueueSummarySchema>;

export const patientQueuesResponseSchema = z.object({
  siteId: z.string(),
  siteName: z.string(),
  queues: patientQueueSummarySchema.array(),
});

export type PatientQueuesResponse = z.infer<typeof patientQueuesResponseSchema>;

export const checkInInputSchema = z.object({
  queueId: z.string().min(1),
});

export type CheckInInput = z.infer<typeof checkInInputSchema>;

export const patientNotificationSummarySchema = z.object({
  id: z.string(),
  channel: z.string(),
  message: z.string(),
  createdAt: z.string().datetime(),
});

export type PatientNotificationSummary = z.infer<typeof patientNotificationSummarySchema>;

export const patientNotificationPreferencesSchema = z.object({
  emailNotificationsEnabled: z.boolean(),
});

export type PatientNotificationPreferences = z.infer<typeof patientNotificationPreferencesSchema>;

export const patientNotificationPreferencesInputSchema = z.object({
  emailNotificationsEnabled: z.boolean(),
});

export type PatientNotificationPreferencesInput = z.infer<typeof patientNotificationPreferencesInputSchema>;

export const patientNotificationPreferencesResponseSchema = z.object({
  preferences: patientNotificationPreferencesSchema,
});

export type PatientNotificationPreferencesResponse = z.infer<typeof patientNotificationPreferencesResponseSchema>;

export const patientTicketSummarySchema = z.object({
  id: z.string(),
  siteId: z.string(),
  siteName: z.string(),
  queueId: z.string(),
  queueName: z.string(),
  status: ticketStatusSchema,
  createdAt: z.string().datetime(),
  notifications: patientNotificationSummarySchema.array(),
});

export type PatientTicketSummary = z.infer<typeof patientTicketSummarySchema>;

export const checkInResponseSchema = z.object({
  ticket: patientTicketSummarySchema,
});

export type CheckInResponse = z.infer<typeof checkInResponseSchema>;

export const activeTicketsResponseSchema = z.object({
  tickets: patientTicketSummarySchema.array(),
});

export type ActiveTicketsResponse = z.infer<typeof activeTicketsResponseSchema>;

export const mapProviderSchema = z.enum(["mapbox", "google"]);

export type MapProvider = z.infer<typeof mapProviderSchema>;

export const mapUsageTypeSchema = z.enum(["map_load", "places_search"]);

export type MapUsageType = z.infer<typeof mapUsageTypeSchema>;

export const mapConfigResponseSchema = z.object({
  provider: mapProviderSchema.nullable(),
  isEnabled: z.boolean(),
  canLoad: z.boolean(),
  publicToken: z.string().nullable(),
  remainingMapLoads: z.number().int().nonnegative(),
  resetAt: z.string().datetime(),
  reason: z.enum(["provider_disabled", "token_missing", "budget_exhausted", "available"]),
});

export type MapConfigResponse = z.infer<typeof mapConfigResponseSchema>;

export const mapUsageInputSchema = z.object({
  usageType: mapUsageTypeSchema.default("map_load"),
});

export type MapUsageInput = z.infer<typeof mapUsageInputSchema>;

export const mapUsageResponseSchema = z.object({
  provider: mapProviderSchema,
  usageType: mapUsageTypeSchema,
  accepted: z.literal(true),
  publicToken: z.string(),
  remainingMapLoads: z.number().int().nonnegative(),
  resetAt: z.string().datetime(),
});

export type MapUsageResponse = z.infer<typeof mapUsageResponseSchema>;

export const nearbyHealthcareInputSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusMeters: z.number().int().min(500).max(10_000).default(5_000),
});

export type NearbyHealthcareInput = z.infer<typeof nearbyHealthcareInputSchema>;

export const nearbyHealthcarePlaceSchema = z.object({
  id: z.string(),
  providerPlaceId: z.string(),
  name: z.string(),
  address: z.string().nullable(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  qdocSiteId: z.string().nullable(),
});

export type NearbyHealthcarePlace = z.infer<typeof nearbyHealthcarePlaceSchema>;

export const nearbyHealthcareResponseSchema = z.object({
  provider: mapProviderSchema.nullable(),
  places: nearbyHealthcarePlaceSchema.array(),
  source: z.enum(["cache", "provider", "unavailable"]),
  radiusMeters: z.number().int().nonnegative(),
});

export type NearbyHealthcareResponse = z.infer<typeof nearbyHealthcareResponseSchema>;

export const staffMapSettingsResponseSchema = z.object({
  provider: mapProviderSchema.nullable(),
  isConfigured: z.boolean(),
  isEnabled: z.boolean(),
  hardStopEnabled: z.boolean(),
  monthlyMapLoadLimit: z.number().int().nonnegative(),
  monthlyPlacesSearchLimit: z.number().int().nonnegative(),
  usedMapLoads: z.number().int().nonnegative(),
  usedPlacesSearches: z.number().int().nonnegative(),
  remainingMapLoads: z.number().int().nonnegative(),
  remainingPlacesSearches: z.number().int().nonnegative(),
  resetAt: z.string().datetime(),
  reason: z.enum(["provider_disabled", "token_missing", "budget_exhausted", "available"]),
});

export type StaffMapSettingsResponse = z.infer<typeof staffMapSettingsResponseSchema>;

export const staffMapSettingsInputSchema = z.object({
  provider: mapProviderSchema,
  isEnabled: z.boolean(),
  hardStopEnabled: z.boolean(),
  monthlyMapLoadLimit: z.number().int().min(0).max(1_000_000),
  monthlyPlacesSearchLimit: z.number().int().min(0).max(1_000_000),
});

export type StaffMapSettingsInput = z.infer<typeof staffMapSettingsInputSchema>;

export const staffNotificationFailureSummarySchema = z.object({
  id: z.string(),
  type: z.string(),
  status: z.string(),
  attempts: z.number().int().nonnegative(),
  availableAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type StaffNotificationFailureSummary = z.infer<typeof staffNotificationFailureSummarySchema>;

export const staffNotificationHealthSchema = z.object({
  pendingOutboxCount: z.number().int().nonnegative(),
  processingOutboxCount: z.number().int().nonnegative(),
  failedOutboxCount: z.number().int().nonnegative(),
  recentFailures: staffNotificationFailureSummarySchema.array(),
});

export type StaffNotificationHealth = z.infer<typeof staffNotificationHealthSchema>;

export const staffSiteOpsResponseSchema = z.object({
  role: membershipRoleSchema,
  canManageMapSettings: z.boolean(),
  site: staffSiteSettingsSchema,
  queues: staffQueueSummarySchema.array(),
  memberships: staffMembershipSummarySchema.array(),
  mapSettings: staffMapSettingsResponseSchema.nullable(),
  notificationHealth: staffNotificationHealthSchema,
  auditLogs: staffAuditLogSummarySchema.array(),
});

export type StaffSiteOpsResponse = z.infer<typeof staffSiteOpsResponseSchema>;
