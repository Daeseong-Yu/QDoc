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
