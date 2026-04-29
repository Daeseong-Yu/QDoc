import { z } from "zod";

export const ticketStatusSchema = z.enum([
  "waiting",
  "called",
  "in_service",
  "completed",
  "no_show",
  "cancelled",
]);

export type TicketStatus = z.infer<typeof ticketStatusSchema>;

export const activeTicketStatuses: TicketStatus[] = ["waiting", "called", "in_service"];

export const siteSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  queueName: z.string(),
  estimatedWaitLabel: z.string(),
});

export type SiteSummary = z.infer<typeof siteSummarySchema>;

export const emailSchema = z.string().trim().email().toLowerCase();

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
  role: z.enum(["staff", "admin"]),
});

export const currentUserSchema = z.object({
  id: z.string(),
  email: emailSchema,
  memberships: membershipSummarySchema.array(),
});

export type CurrentUser = z.infer<typeof currentUserSchema>;

export const authErrorSchema = z.object({
  error: z.enum([
    "invalid_request",
    "invalid_otp",
    "otp_delivery_unavailable",
    "rate_limited",
    "unauthorized",
    "not_found",
  ]),
});

export type AuthError = z.infer<typeof authErrorSchema>;
