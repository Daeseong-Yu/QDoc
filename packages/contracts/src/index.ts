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
