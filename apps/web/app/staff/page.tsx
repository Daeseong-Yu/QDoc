"use client";

import {
  authErrorSchema,
  currentUserSchema,
  otpRequestInputSchema,
  otpVerifyInputSchema,
  staffMapSettingsInputSchema,
  staffMapSettingsResponseSchema,
  staffMembershipInputSchema,
  staffMembershipRoleInputSchema,
  staffMembershipSummarySchema,
  staffQueueResponseSchema,
  staffQueueSettingsInputSchema,
  staffQueueSummarySchema,
  staffSiteOpsResponseSchema,
  staffSiteSettingsInputSchema,
  staffSiteSettingsSchema,
  staffTicketResponseSchema,
  type CurrentUser,
  type MapProvider,
  type MembershipRole,
  type StaffMapSettingsResponse,
  type StaffSiteOpsResponse,
  type StaffQueueResponse,
  type StaffSiteSettings,
  type TicketStatus,
} from "@qdoc/contracts";
import {
  Activity,
  Bell,
  Check,
  ClipboardList,
  Loader2,
  LogOut,
  Mail,
  MapPinned,
  RefreshCcw,
  Save,
  Settings,
  ShieldCheck,
  Stethoscope,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

type RequestState = "idle" | "loading" | "success" | "error";
type AuthStep = "email" | "code";
type StaffTicketAction = "call" | "start-service" | "complete" | "delay" | "restore" | "cancel";
type StaffBoardTicket = StaffQueueResponse["tickets"][number];
type StaffMembership = CurrentUser["memberships"][number];
type SiteSettingsForm = {
  name: string;
  distanceKm: string;
  notificationAheadCount: string;
  addressLine1: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  latitude: string;
  longitude: string;
};
type MapSettingsForm = {
  provider: MapProvider | "";
  isEnabled: boolean;
  hardStopEnabled: boolean;
  monthlyMapLoadLimit: string;
  monthlyPlacesSearchLimit: string;
};

type ApiError = {
  status: number;
  error: string;
  retryAfterSeconds?: number;
};

const siteSettingsResponseSchema = z.object({
  site: staffSiteSettingsSchema,
});
const queueSettingsResponseSchema = z.object({
  queue: staffQueueSummarySchema,
});
const membershipResponseSchema = z.object({
  membership: staffMembershipSummarySchema,
});
const mapSettingsResponseEnvelopeSchema = z.object({
  mapSettings: staffMapSettingsResponseSchema,
});

const emptySiteSettingsForm: SiteSettingsForm = {
  name: "",
  distanceKm: "0",
  notificationAheadCount: "2",
  addressLine1: "",
  city: "",
  region: "",
  postalCode: "",
  country: "",
  latitude: "",
  longitude: "",
};

const emptyMapSettingsForm: MapSettingsForm = {
  provider: "",
  isEnabled: false,
  hardStopEnabled: true,
  monthlyMapLoadLimit: "0",
  monthlyPlacesSearchLimit: "0",
};

const boardStatuses: Array<{ status: TicketStatus; label: string }> = [
  { status: "waiting", label: "Waiting" },
  { status: "called", label: "Called" },
  { status: "in_service", label: "In service" },
  { status: "delay", label: "Delayed" },
];

const ticketStatusLabels: Record<TicketStatus, string> = {
  waiting: "Waiting",
  called: "Called",
  in_service: "In service",
  completed: "Completed",
  delay: "Delayed",
  cancelled: "Cancelled",
};

const ticketStatusStyles: Record<TicketStatus, string> = {
  waiting: "bg-amber-50 text-amber-800 ring-amber-200",
  called: "bg-sky-50 text-sky-800 ring-sky-200",
  in_service: "bg-violet-50 text-violet-800 ring-violet-200",
  completed: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  delay: "bg-orange-50 text-orange-800 ring-orange-200",
  cancelled: "bg-slate-100 text-slate-700 ring-slate-200",
};

const emptyStatusMessages: Record<TicketStatus, string> = {
  waiting: "No patients waiting.",
  called: "No called patients.",
  in_service: "No patients in service.",
  completed: "No completed tickets.",
  delay: "No delayed patients.",
  cancelled: "No cancelled tickets.",
};

async function readApiResponse<T>(response: Response, schema: z.ZodSchema<T>) {
  const data: unknown = await response.json();

  if (!response.ok) {
    const parsedError = authErrorSchema.safeParse(data);
    const error = new Error(parsedError.success ? parsedError.data.error : "request_failed") as Error & ApiError;
    error.status = response.status;
    error.error = parsedError.success ? parsedError.data.error : "request_failed";
    error.retryAfterSeconds = parsedError.success ? parsedError.data.retryAfterSeconds : undefined;
    throw error;
  }

  return schema.parse(data);
}

function isApiError(error: unknown): error is ApiError {
  return error instanceof Error && "status" in error && "error" in error;
}

function formatRetryAfter(seconds: number) {
  if (seconds < 60) {
    return `${seconds} seconds`;
  }

  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

function getMessage(error: unknown) {
  if (!isApiError(error)) {
    return "Request failed. Try again.";
  }

  if (error.error === "unauthorized") {
    return "Sign in with a staff account.";
  }

  if (error.error === "forbidden") {
    return "This account does not have access to the selected site.";
  }

  if (error.error === "invalid_transition") {
    return "That ticket can no longer move to the requested status.";
  }

  if (error.error === "conflict") {
    return "That change conflicts with the current state. Keep at least one site admin.";
  }

  if (error.error === "otp_delivery_unavailable") {
    return "We could not send a code right now. Try again later or contact the clinic.";
  }

  if (error.error === "invalid_otp") {
    return "Enter the latest 6-digit verification code.";
  }

  if (error.error === "rate_limited") {
    return error.retryAfterSeconds
      ? `Too many attempts. Try again in ${formatRetryAfter(error.retryAfterSeconds)}.`
      : "Too many attempts. Wait a few minutes before trying again.";
  }

  return "Request failed. Try again.";
}

function getActions(ticket: StaffBoardTicket): Array<{ action: StaffTicketAction; label: string }> {
  if (ticket.status === "waiting") {
    return [
      { action: "call", label: "Call" },
      { action: "cancel", label: "Cancel" },
    ];
  }

  if (ticket.status === "called") {
    return [
      { action: "start-service", label: "Start" },
      { action: "delay", label: "Delay" },
      { action: "cancel", label: "Cancel" },
    ];
  }

  if (ticket.status === "in_service") {
    return [{ action: "complete", label: "Complete" }];
  }

  if (ticket.status === "delay") {
    return [
      { action: "restore", label: "Restore" },
      { action: "cancel", label: "Cancel" },
    ];
  }

  return [];
}

function getMembershipWaitingCount(membership: StaffMembership, activeQueueBoard: StaffQueueResponse | null) {
  if (activeQueueBoard?.siteId !== membership.siteId) {
    return membership.waitingTicketCount;
  }

  return activeQueueBoard.tickets.filter((ticket) => ticket.status === "waiting").length;
}

function siteSettingsToForm(site: StaffSiteSettings): SiteSettingsForm {
  return {
    name: site.name,
    distanceKm: String(site.distanceKm),
    notificationAheadCount: String(site.notificationAheadCount),
    addressLine1: site.addressLine1 ?? "",
    city: site.city ?? "",
    region: site.region ?? "",
    postalCode: site.postalCode ?? "",
    country: site.country ?? "",
    latitude: site.latitude === null ? "" : String(site.latitude),
    longitude: site.longitude === null ? "" : String(site.longitude),
  };
}

function mapSettingsToForm(mapSettings: StaffMapSettingsResponse | null): MapSettingsForm {
  if (!mapSettings?.provider) {
    return emptyMapSettingsForm;
  }

  return {
    provider: mapSettings.provider,
    isEnabled: mapSettings.isEnabled,
    hardStopEnabled: mapSettings.hardStopEnabled,
    monthlyMapLoadLimit: String(mapSettings.monthlyMapLoadLimit),
    monthlyPlacesSearchLimit: String(mapSettings.monthlyPlacesSearchLimit),
  };
}

function optionalText(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function optionalNumber(value: string) {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : null;
}

export default function StaffPage() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [queueBoard, setQueueBoard] = useState<StaffQueueResponse | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [authStep, setAuthStep] = useState<AuthStep>("email");
  const [authState, setAuthState] = useState<RequestState>("idle");
  const [boardState, setBoardState] = useState<RequestState>("idle");
  const [opsState, setOpsState] = useState<RequestState>("idle");
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [activeOpsAction, setActiveOpsAction] = useState<string | null>(null);
  const [ops, setOps] = useState<StaffSiteOpsResponse | null>(null);
  const [siteForm, setSiteForm] = useState<SiteSettingsForm>(emptySiteSettingsForm);
  const [membershipEmail, setMembershipEmail] = useState("");
  const [membershipRole, setMembershipRole] = useState<MembershipRole>("staff");
  const [mapForm, setMapForm] = useState<MapSettingsForm>(emptyMapSettingsForm);
  const [message, setMessage] = useState("");
  const boardRequestId = useRef(0);
  const opsRequestId = useRef(0);

  const staffMemberships = useMemo(() => {
    return currentUser?.memberships.filter((membership) => membership.role === "staff" || membership.role === "admin") ?? [];
  }, [currentUser]);

  const selectedMembership = useMemo(() => {
    return staffMemberships.find((membership) => membership.siteId === selectedSiteId) ?? null;
  }, [selectedSiteId, staffMemberships]);

  const activeQueueBoard = queueBoard?.siteId === selectedSiteId ? queueBoard : null;
  const opsQueues = ops?.queues ?? activeQueueBoard?.queues ?? [];
  const canManageSiteOps = ops?.role === "admin";
  const canManageMapSettings = canManageSiteOps && ops?.canManageMapSettings === true;

  const ticketsByStatus = useMemo(() => {
    return Object.fromEntries(
      boardStatuses.map(({ status }) => [status, activeQueueBoard?.tickets.filter((ticket) => ticket.status === status) ?? []]),
    ) as Record<TicketStatus, StaffBoardTicket[]>;
  }, [activeQueueBoard]);

  const clearStaffSession = useCallback(() => {
    boardRequestId.current += 1;
    opsRequestId.current += 1;
    setCurrentUser(null);
    setQueueBoard(null);
    setOps(null);
    setSelectedSiteId("");
    setAuthStep("email");
    setAuthState("idle");
    setCode("");
    setBoardState("idle");
    setOpsState("idle");
    setSiteForm(emptySiteSettingsForm);
    setMapForm(emptyMapSettingsForm);
    setMembershipEmail("");
    setMembershipRole("staff");
  }, []);

  const loadBoard = useCallback(async () => {
    if (!selectedSiteId || !currentUser) {
      return;
    }

    const requestSiteId = selectedSiteId;
    const requestId = boardRequestId.current + 1;
    boardRequestId.current = requestId;

    try {
      const response = await fetch(`/api/staff/sites/${requestSiteId}/queue`, { cache: "no-store" });
      const data = await readApiResponse(response, staffQueueResponseSchema);

      if (boardRequestId.current !== requestId || data.siteId !== requestSiteId) {
        return false;
      }

      setQueueBoard(data);
      return true;
    } catch (error) {
      if (boardRequestId.current !== requestId) {
        return false;
      }

      if (isApiError(error) && error.status === 401) {
        clearStaffSession();
      } else {
        setQueueBoard(null);
      }

      throw error;
    }
  }, [clearStaffSession, currentUser, selectedSiteId]);

  const loadOps = useCallback(async () => {
    if (!selectedSiteId || !currentUser) {
      return;
    }

    const requestSiteId = selectedSiteId;
    const requestId = opsRequestId.current + 1;
    opsRequestId.current = requestId;

    try {
      const response = await fetch(`/api/staff/sites/${requestSiteId}/ops`, { cache: "no-store" });
      const data = await readApiResponse(response, staffSiteOpsResponseSchema);

      if (opsRequestId.current !== requestId) {
        return false;
      }

      setOps(data);
      setSiteForm(siteSettingsToForm(data.site));
      setMapForm(mapSettingsToForm(data.mapSettings));
      return true;
    } catch (error) {
      if (opsRequestId.current !== requestId) {
        return false;
      }

      if (isApiError(error) && error.status === 401) {
        clearStaffSession();
      } else {
        setOps(null);
      }

      throw error;
    }
  }, [clearStaffSession, currentUser, selectedSiteId]);

  const refreshBoard = useCallback(
    async (showLoading = true) => {
      if (!currentUser || !selectedSiteId) {
        return;
      }

      if (showLoading) {
        setBoardState("loading");
      }

      try {
        const applied = await loadBoard();

        if (applied) {
          setBoardState("success");
        }
      } catch (error) {
        setBoardState("error");
        setMessage(getMessage(error));
      }
    },
    [currentUser, loadBoard, selectedSiteId],
  );

  const refreshOps = useCallback(
    async (showLoading = true) => {
      if (!currentUser || !selectedSiteId) {
        return;
      }

      if (showLoading) {
        setOpsState("loading");
      }

      try {
        const applied = await loadOps();

        if (applied) {
          setOpsState("success");
        }
      } catch (error) {
        setOpsState("error");
        setMessage(getMessage(error));
      }
    },
    [currentUser, loadOps, selectedSiteId],
  );

  const loadCurrentUser = useCallback(async () => {
    const response = await fetch("/api/me", { cache: "no-store" });

    if (response.status === 401) {
      clearStaffSession();
      return;
    }

    const user = await readApiResponse(response, currentUserSchema);
    setCurrentUser(user);
    const firstStaffSite = user.memberships.find((membership) => membership.role === "staff" || membership.role === "admin");
    setSelectedSiteId(firstStaffSite?.siteId || "");
  }, [clearStaffSession]);

  useEffect(() => {
    loadCurrentUser().catch((error: unknown) => {
      clearStaffSession();
      setMessage(getMessage(error));
    });
  }, [clearStaffSession, loadCurrentUser]);

  useEffect(() => {
    if (!currentUser || !selectedSiteId) {
      return;
    }

    setQueueBoard(null);
    setOps(null);
    void refreshBoard();
    void refreshOps();
  }, [currentUser, refreshBoard, refreshOps, selectedSiteId]);

  useEffect(() => {
    if (!currentUser || !selectedSiteId) {
      return;
    }

    const requestSiteId = selectedSiteId;
    let fallbackTimer: number | null = null;
    const startFallback = () => {
      if (fallbackTimer !== null) {
        return;
      }

      fallbackTimer = window.setInterval(() => {
        void refreshBoard(false);
      }, 4000);
    };
    const events = new EventSource(`/api/staff/sites/${requestSiteId}/queue/events`);

    events.addEventListener("snapshot", (event) => {
      try {
        const data = staffQueueResponseSchema.parse(JSON.parse((event as MessageEvent).data));

        if (data.siteId !== requestSiteId) {
          return;
        }

        setQueueBoard(data);
        setBoardState("success");
      } catch {
        startFallback();
      }
    });

    events.onerror = () => {
      events.close();
      startFallback();
    };

    return () => {
      events.close();
      if (fallbackTimer !== null) {
        window.clearInterval(fallbackTimer);
      }
    };
  }, [currentUser, refreshBoard, selectedSiteId]);

  async function requestOtp() {
    setMessage("");
    setAuthState("loading");

    const input = otpRequestInputSchema.safeParse({ email });

    if (!input.success) {
      setAuthState("error");
      setMessage("Enter a valid email address.");
      return;
    }

    try {
      const response = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input.data),
      });

      await readApiResponse(response, z.object({ ok: z.literal(true) }));
      setAuthStep("code");
      setAuthState("success");
      setMessage("Enter the verification code sent to your email.");
    } catch (error) {
      setAuthState("error");
      setMessage(getMessage(error));
    }
  }

  async function verifyOtp() {
    setMessage("");
    setAuthState("loading");

    const input = otpVerifyInputSchema.safeParse({ email, code });

    if (!input.success) {
      setAuthState("error");
      setMessage("Enter the 6-digit verification code.");
      return;
    }

    try {
      const response = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input.data),
      });

      const user = await readApiResponse(response, currentUserSchema);
      const firstStaffSite = user.memberships.find((membership) => membership.role === "staff" || membership.role === "admin");

      setCurrentUser(user);
      setSelectedSiteId(firstStaffSite?.siteId || "");
      setAuthState("success");
      setMessage(firstStaffSite ? "Signed in." : "This account does not have staff access.");
    } catch (error) {
      setAuthState("error");
      setMessage(getMessage(error));
    }
  }

  async function applyAction(ticketId: string, action: StaffTicketAction) {
    const ticket = activeQueueBoard?.tickets.find((item) => item.id === ticketId);

    if (!ticket || ticket.siteId !== selectedSiteId) {
      setMessage("Refresh the board before changing this ticket.");
      return;
    }

    const actionKey = `${ticketId}:${action}`;
    setActiveAction(actionKey);
    setMessage("");

    try {
      const response = await fetch(`/api/staff/tickets/${ticketId}/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteId: selectedSiteId }),
      });
      await readApiResponse(response, staffTicketResponseSchema);
      const applied = await loadBoard();

      if (applied) {
        setBoardState("success");
      }
    } catch (error) {
      setMessage(getMessage(error));
    } finally {
      setActiveAction(null);
    }
  }

  async function updateQueueOpen(queueId: string, queueName: string, isOpen: boolean) {
    const input = staffQueueSettingsInputSchema.safeParse({ isOpen });

    if (!input.success) {
      setMessage("Invalid queue setting.");
      return;
    }

    const actionKey = `queue:${queueId}`;
    setActiveOpsAction(actionKey);
    setMessage("");

    try {
      const response = await fetch(`/api/staff/sites/${selectedSiteId}/queues/${queueId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input.data),
      });
      await readApiResponse(response, queueSettingsResponseSchema);
      await Promise.all([loadBoard(), loadOps()]);
      setBoardState("success");
      setOpsState("success");
      setMessage(`${queueName} is now ${isOpen ? "open" : "closed"}.`);
    } catch (error) {
      setMessage(getMessage(error));
    } finally {
      setActiveOpsAction(null);
    }
  }

  async function applySiteSettings() {
    const input = staffSiteSettingsInputSchema.safeParse({
      name: siteForm.name,
      distanceKm: Number(siteForm.distanceKm),
      notificationAheadCount: Number.parseInt(siteForm.notificationAheadCount, 10),
      addressLine1: optionalText(siteForm.addressLine1),
      city: optionalText(siteForm.city),
      region: optionalText(siteForm.region),
      postalCode: optionalText(siteForm.postalCode),
      country: optionalText(siteForm.country),
      latitude: optionalNumber(siteForm.latitude),
      longitude: optionalNumber(siteForm.longitude),
    });

    if (!input.success) {
      setMessage("Check the site settings before saving.");
      return;
    }

    setActiveOpsAction("site-settings");
    setMessage("");

    try {
      const response = await fetch(`/api/staff/sites/${selectedSiteId}/settings`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input.data),
      });
      const data = await readApiResponse(response, siteSettingsResponseSchema);
      setSiteForm(siteSettingsToForm(data.site));
      await Promise.all([loadCurrentUser(), loadOps()]);
      setOpsState("success");
      setMessage("Site settings saved.");
    } catch (error) {
      setMessage(getMessage(error));
    } finally {
      setActiveOpsAction(null);
    }
  }

  async function createMembership() {
    const input = staffMembershipInputSchema.safeParse({
      email: membershipEmail,
      role: membershipRole,
    });

    if (!input.success) {
      setMessage("Enter a valid staff email.");
      return;
    }

    setActiveOpsAction("membership:create");
    setMessage("");

    try {
      const response = await fetch(`/api/staff/sites/${selectedSiteId}/memberships`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input.data),
      });
      await readApiResponse(response, membershipResponseSchema);
      setMembershipEmail("");
      await Promise.all([loadCurrentUser(), loadOps()]);
      setOpsState("success");
      setMessage("Staff membership saved.");
    } catch (error) {
      setMessage(getMessage(error));
    } finally {
      setActiveOpsAction(null);
    }
  }

  async function updateMembershipRole(membershipId: string, role: MembershipRole) {
    const input = staffMembershipRoleInputSchema.safeParse({ role });

    if (!input.success) {
      setMessage("Invalid membership role.");
      return;
    }

    setActiveOpsAction(`membership:${membershipId}`);
    setMessage("");

    try {
      const response = await fetch(`/api/staff/sites/${selectedSiteId}/memberships/${membershipId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input.data),
      });
      await readApiResponse(response, membershipResponseSchema);
      await Promise.all([loadCurrentUser(), loadOps()]);
      setOpsState("success");
      setMessage("Staff role updated.");
    } catch (error) {
      setMessage(getMessage(error));
    } finally {
      setActiveOpsAction(null);
    }
  }

  async function deleteMembership(membershipId: string) {
    setActiveOpsAction(`membership:${membershipId}`);
    setMessage("");

    try {
      const response = await fetch(`/api/staff/sites/${selectedSiteId}/memberships/${membershipId}`, {
        method: "DELETE",
      });
      await readApiResponse(response, z.object({ ok: z.literal(true) }));
      await Promise.all([loadCurrentUser(), loadOps()]);
      setOpsState("success");
      setMessage("Staff membership removed.");
    } catch (error) {
      setMessage(getMessage(error));
    } finally {
      setActiveOpsAction(null);
    }
  }

  async function applyMapSettings() {
    const input = staffMapSettingsInputSchema.safeParse({
      provider: mapForm.provider,
      isEnabled: mapForm.isEnabled,
      hardStopEnabled: mapForm.hardStopEnabled,
      monthlyMapLoadLimit: Number.parseInt(mapForm.monthlyMapLoadLimit, 10),
      monthlyPlacesSearchLimit: Number.parseInt(mapForm.monthlyPlacesSearchLimit, 10),
    });

    if (!input.success) {
      setMessage("Check the map budget settings before saving.");
      return;
    }

    setActiveOpsAction("map-settings");
    setMessage("");

    try {
      const response = await fetch("/api/staff/map-settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input.data),
      });
      const data = await readApiResponse(response, mapSettingsResponseEnvelopeSchema);
      setMapForm(mapSettingsToForm(data.mapSettings));
      await loadOps();
      setOpsState("success");
      setMessage("Map budget settings saved.");
    } catch (error) {
      setMessage(getMessage(error));
    } finally {
      setActiveOpsAction(null);
    }
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    clearStaffSession();
    setMessage("");
  }

  return (
    <main className="min-h-screen bg-[#f4fbfb] px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-[#10b9c4] text-white">
              <Stethoscope size={22} aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-medium uppercase text-slate-500">QDoc</p>
              <h1 className="text-2xl font-semibold text-slate-950 sm:text-3xl">Staff queue board</h1>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              void refreshBoard();
            }}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-[#b9eaee] bg-white px-3 text-sm font-medium text-[#087884] shadow-sm hover:bg-[#eefbfc] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!currentUser || !selectedSiteId}
          >
            {boardState === "loading" ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <RefreshCcw size={16} aria-hidden="true" />}
            Refresh
          </button>
        </header>

        {message ? (
          <div className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
            {message}
          </div>
        ) : null}

        <section className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="flex flex-col gap-5">
            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">Staff session</h2>
                  <p className="text-sm text-slate-600">{currentUser ? currentUser.email : "Sign in with email OTP."}</p>
                </div>
                {currentUser ? (
                  <button
                    type="button"
                    onClick={() => {
                      void signOut();
                    }}
                    className="inline-flex size-9 items-center justify-center rounded-md border border-[#b9eaee] text-[#087884] hover:bg-[#eefbfc]"
                    aria-label="Sign out"
                  >
                    <LogOut size={17} aria-hidden="true" />
                  </button>
                ) : (
                  <Mail size={21} className="text-[#0a8f9c]" aria-hidden="true" />
                )}
              </div>

              {!currentUser ? (
                <div className="grid gap-3">
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="Staff email"
                    className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#10b9c4]"
                  />
                  {authStep === "code" ? (
                    <input
                      type="text"
                      inputMode="numeric"
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                      placeholder="6-digit code"
                      className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#10b9c4]"
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      void (authStep === "email" ? requestOtp() : verifyOtp());
                    }}
                    disabled={authState === "loading"}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#10b9c4] px-4 text-sm font-semibold text-white hover:bg-[#0ea5b2] disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {authState === "loading" ? <Loader2 className="animate-spin" size={17} aria-hidden="true" /> : null}
                    {authStep === "email" ? "Send code" : "Sign in"}
                  </button>
                </div>
              ) : null}
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <ClipboardList size={21} className="text-[#0a8f9c]" aria-hidden="true" />
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">Sites</h2>
                  <p className="text-sm text-slate-600">Choose a staffed location.</p>
                </div>
              </div>
              {staffMemberships.length === 0 ? (
                <p className="text-sm text-slate-500">No staff memberships. Ask a site admin to add this email.</p>
              ) : null}
              <div className="grid gap-2">
                {staffMemberships.map((membership) => (
                  <button
                    key={membership.siteId}
                    type="button"
                    onClick={() => {
                      if (membership.siteId === selectedSiteId) {
                        void refreshBoard();
                        return;
                      }

                      boardRequestId.current += 1;
                      opsRequestId.current += 1;
                      setQueueBoard(null);
                      setOps(null);
                      setBoardState("loading");
                      setOpsState("loading");
                      setSelectedSiteId(membership.siteId);
                    }}
                    className={`rounded-md border px-3 py-3 text-left text-sm font-medium ${
                      selectedSiteId === membership.siteId ? "border-[#10b9c4] bg-[#eefbfc]" : "border-slate-200 bg-white"
                    }`}
                  >
                    <span className="block text-slate-950">{membership.siteName}</span>
                    <span className="text-xs uppercase text-slate-500">
                      {getMembershipWaitingCount(membership, activeQueueBoard)} waiting · {membership.role}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </aside>

          <section className="flex flex-col gap-4">
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-slate-950">{activeQueueBoard?.siteName ?? selectedMembership?.siteName ?? "Queue board"}</h2>
                  <p className="text-sm text-slate-600">Live queue status.</p>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Activity size={17} aria-hidden="true" />
                  {boardState === "loading" ? "Loading" : `${activeQueueBoard?.tickets.length ?? 0} active tickets`}
                </div>
              </div>
              {boardState === "error" ? (
                <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  <p>Queue board could not refresh. Existing ticket actions are paused until the board reloads.</p>
                  <button
                    type="button"
                    onClick={() => {
                      void refreshBoard();
                    }}
                    className="mt-3 inline-flex h-9 items-center gap-2 rounded-md border border-[#b9eaee] bg-white px-3 text-sm font-medium text-[#087884] hover:bg-[#eefbfc]"
                  >
                    <RefreshCcw size={15} aria-hidden="true" />
                    Retry board
                  </button>
                </div>
              ) : null}
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Settings size={20} className="text-[#0a8f9c]" aria-hidden="true" />
                  <div>
                    <h2 className="text-lg font-semibold text-slate-950">Operations</h2>
                    <p className="text-sm text-slate-600">
                      {opsState === "loading" ? "Loading controls." : canManageSiteOps ? "Admin controls enabled." : "Queue controls enabled."}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void refreshOps();
                  }}
                  disabled={!currentUser || !selectedSiteId || opsState === "loading"}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-[#b9eaee] bg-white px-3 text-sm font-medium text-[#087884] hover:bg-[#eefbfc] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {opsState === "loading" ? <Loader2 className="animate-spin" size={15} aria-hidden="true" /> : <RefreshCcw size={15} aria-hidden="true" />}
                  Reload
                </button>
              </div>

              {!selectedSiteId ? <p className="text-sm text-slate-500">Select a site to manage operations.</p> : null}
              {selectedSiteId && opsState === "error" ? (
                <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  <p>Operations controls could not load. Queue actions remain available from the board.</p>
                  <button
                    type="button"
                    onClick={() => {
                      void refreshOps();
                    }}
                    className="mt-3 inline-flex h-9 items-center gap-2 rounded-md border border-[#b9eaee] bg-white px-3 text-sm font-medium text-[#087884] hover:bg-[#eefbfc]"
                  >
                    <RefreshCcw size={15} aria-hidden="true" />
                    Retry operations
                  </button>
                </div>
              ) : null}

              {selectedSiteId ? (
                <div className="grid gap-5">
                  <section className="border-t border-slate-200 pt-4">
                    <div className="mb-3 flex items-center gap-2">
                      <ShieldCheck size={18} className="text-[#0a8f9c]" aria-hidden="true" />
                      <h3 className="font-semibold text-slate-950">Queue availability</h3>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      {opsQueues.map((queue) => (
                        <div key={queue.id} className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-950">{queue.name}</p>
                            <p className={`text-xs font-medium ${queue.isOpen ? "text-emerald-700" : "text-slate-500"}`}>
                              {queue.isOpen ? "Open to check-ins" : "Closed to check-ins"}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              void updateQueueOpen(queue.id, queue.name, !queue.isOpen);
                            }}
                            disabled={Boolean(activeOpsAction)}
                            className={`inline-flex h-9 shrink-0 items-center justify-center rounded-md px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${
                              queue.isOpen
                                ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                                : "bg-[#10b9c4] text-white hover:bg-[#0ea5b2]"
                            }`}
                          >
                            {activeOpsAction === `queue:${queue.id}` ? (
                              <Loader2 className="animate-spin" size={15} aria-hidden="true" />
                            ) : queue.isOpen ? (
                              "Close"
                            ) : (
                              "Open"
                            )}
                          </button>
                        </div>
                      ))}
                      {opsQueues.length === 0 ? <p className="text-sm text-slate-500">No queues configured.</p> : null}
                    </div>
                  </section>

                  <section className="border-t border-slate-200 pt-4">
                    <div className="mb-3 flex items-center gap-2">
                      <Bell size={18} className="text-[#0a8f9c]" aria-hidden="true" />
                      <h3 className="font-semibold text-slate-950">Notification health</h3>
                    </div>
                    {ops?.notificationHealth ? (
                      <div className="grid gap-3">
                        <div className="grid gap-2 md:grid-cols-3">
                          <div className="rounded-md border border-slate-200 px-3 py-3">
                            <p className="text-xs font-medium uppercase text-slate-500">Pending</p>
                            <p className="mt-1 text-xl font-semibold text-slate-950">{ops.notificationHealth.pendingOutboxCount}</p>
                          </div>
                          <div className="rounded-md border border-slate-200 px-3 py-3">
                            <p className="text-xs font-medium uppercase text-slate-500">Processing</p>
                            <p className="mt-1 text-xl font-semibold text-slate-950">{ops.notificationHealth.processingOutboxCount}</p>
                          </div>
                          <div className="rounded-md border border-slate-200 px-3 py-3">
                            <p className="text-xs font-medium uppercase text-slate-500">Failed</p>
                            <p className="mt-1 text-xl font-semibold text-slate-950">{ops.notificationHealth.failedOutboxCount}</p>
                          </div>
                        </div>
                        <div className="grid gap-2">
                          {ops.notificationHealth.recentFailures.length ? (
                            ops.notificationHealth.recentFailures.map((failure) => (
                              <div key={failure.id} className="rounded-md border border-slate-200 px-3 py-2 text-sm">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="font-semibold text-slate-950">{failure.type}</span>
                                  <span className="text-xs text-slate-500">{new Date(failure.updatedAt).toLocaleString()}</span>
                                </div>
                                <p className="mt-1 text-xs uppercase text-slate-500">
                                  {failure.status} · {failure.attempts} attempts · {failure.id.slice(0, 8)}
                                </p>
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-slate-500">No failed notification jobs.</p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">Loading notification health.</p>
                    )}
                  </section>

                  {canManageSiteOps ? (
                    <section className="border-t border-slate-200 pt-4">
                      <div className="mb-3 flex items-center gap-2">
                        <Save size={18} className="text-[#0a8f9c]" aria-hidden="true" />
                        <h3 className="font-semibold text-slate-950">Site settings</h3>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <input
                          type="text"
                          value={siteForm.name}
                          onChange={(event) => setSiteForm((value) => ({ ...value, name: event.target.value }))}
                          placeholder="Site name"
                          className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-[#10b9c4]"
                        />
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={siteForm.distanceKm}
                          onChange={(event) => setSiteForm((value) => ({ ...value, distanceKm: event.target.value }))}
                          placeholder="Distance km"
                          className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-[#10b9c4]"
                        />
                        <input
                          type="number"
                          min="0"
                          max="10"
                          step="1"
                          value={siteForm.notificationAheadCount}
                          onChange={(event) => setSiteForm((value) => ({ ...value, notificationAheadCount: event.target.value }))}
                          placeholder="Notification ahead count"
                          className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-[#10b9c4]"
                        />
                        <input
                          type="text"
                          value={siteForm.addressLine1}
                          onChange={(event) => setSiteForm((value) => ({ ...value, addressLine1: event.target.value }))}
                          placeholder="Address"
                          className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-[#10b9c4]"
                        />
                        <input
                          type="text"
                          value={siteForm.city}
                          onChange={(event) => setSiteForm((value) => ({ ...value, city: event.target.value }))}
                          placeholder="City"
                          className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-[#10b9c4]"
                        />
                        <input
                          type="text"
                          value={siteForm.region}
                          onChange={(event) => setSiteForm((value) => ({ ...value, region: event.target.value }))}
                          placeholder="Region"
                          className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-[#10b9c4]"
                        />
                        <input
                          type="text"
                          value={siteForm.postalCode}
                          onChange={(event) => setSiteForm((value) => ({ ...value, postalCode: event.target.value }))}
                          placeholder="Postal code"
                          className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-[#10b9c4]"
                        />
                        <input
                          type="text"
                          value={siteForm.country}
                          onChange={(event) => setSiteForm((value) => ({ ...value, country: event.target.value }))}
                          placeholder="Country"
                          className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-[#10b9c4]"
                        />
                        <div className="grid gap-3 sm:grid-cols-2">
                          <input
                            type="number"
                            step="0.000001"
                            value={siteForm.latitude}
                            onChange={(event) => setSiteForm((value) => ({ ...value, latitude: event.target.value }))}
                            placeholder="Latitude"
                            className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-[#10b9c4]"
                          />
                          <input
                            type="number"
                            step="0.000001"
                            value={siteForm.longitude}
                            onChange={(event) => setSiteForm((value) => ({ ...value, longitude: event.target.value }))}
                            placeholder="Longitude"
                            className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-[#10b9c4]"
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          void applySiteSettings();
                        }}
                        disabled={Boolean(activeOpsAction)}
                        className="mt-3 inline-flex h-10 items-center gap-2 rounded-md bg-[#10b9c4] px-4 text-sm font-semibold text-white hover:bg-[#0ea5b2] disabled:cursor-not-allowed disabled:bg-slate-400"
                      >
                        {activeOpsAction === "site-settings" ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
                        Save site
                      </button>
                    </section>
                  ) : null}

                  {canManageSiteOps ? (
                    <section className="grid gap-5 border-t border-slate-200 pt-4 xl:grid-cols-2">
                      <div>
                        <div className="mb-3 flex items-center gap-2">
                          <Users size={18} className="text-[#0a8f9c]" aria-hidden="true" />
                          <h3 className="font-semibold text-slate-950">Staff membership</h3>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px_auto]">
                          <input
                            type="email"
                            value={membershipEmail}
                            onChange={(event) => setMembershipEmail(event.target.value)}
                            placeholder="Staff email"
                            className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-[#10b9c4]"
                          />
                          <select
                            value={membershipRole}
                            onChange={(event) => setMembershipRole(event.target.value as MembershipRole)}
                            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#10b9c4]"
                          >
                            <option value="staff">Staff</option>
                            <option value="admin">Admin</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => {
                              void createMembership();
                            }}
                            disabled={Boolean(activeOpsAction)}
                            className="inline-flex h-10 items-center justify-center rounded-md bg-[#10b9c4] px-4 text-sm font-semibold text-white hover:bg-[#0ea5b2] disabled:cursor-not-allowed disabled:bg-slate-400"
                          >
                            Add
                          </button>
                        </div>
                        <div className="mt-3 grid gap-2">
                          {ops?.memberships.map((membership) => (
                            <div key={membership.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2">
                              <div className="min-w-0">
                                <p className="break-all text-sm font-semibold text-slate-950">{membership.email}</p>
                                <p className="text-xs uppercase text-slate-500">{membership.role}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    void updateMembershipRole(membership.id, membership.role === "admin" ? "staff" : "admin");
                                  }}
                                  disabled={Boolean(activeOpsAction)}
                                  className="h-8 rounded-md border border-[#b9eaee] px-3 text-xs font-semibold text-[#087884] hover:bg-[#eefbfc] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {membership.role === "admin" ? "Make staff" : "Make admin"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void deleteMembership(membership.id);
                                  }}
                                  disabled={Boolean(activeOpsAction)}
                                  className="inline-flex size-8 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                  aria-label={`Remove ${membership.email}`}
                                >
                                  {activeOpsAction === `membership:${membership.id}` ? <Loader2 className="animate-spin" size={14} aria-hidden="true" /> : <Trash2 size={14} aria-hidden="true" />}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {canManageMapSettings ? (
                        <div>
                          <div className="mb-3 flex items-center gap-2">
                            <MapPinned size={18} className="text-[#0a8f9c]" aria-hidden="true" />
                            <h3 className="font-semibold text-slate-950">Map budget</h3>
                          </div>
                          <div className="grid gap-3">
                            <div className="grid gap-2 sm:grid-cols-2">
                              <input
                                type="text"
                                value={mapForm.provider}
                                readOnly
                                placeholder="No provider"
                                className="h-10 rounded-md border border-slate-300 bg-slate-50 px-3 text-sm text-slate-700 outline-none"
                              />
                              <input
                                type="number"
                                min="0"
                                value={mapForm.monthlyMapLoadLimit}
                                onChange={(event) => setMapForm((value) => ({ ...value, monthlyMapLoadLimit: event.target.value }))}
                                placeholder="Monthly map loads"
                                className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-[#10b9c4]"
                              />
                              <input
                                type="number"
                                min="0"
                                value={mapForm.monthlyPlacesSearchLimit}
                                onChange={(event) =>
                                  setMapForm((value) => ({ ...value, monthlyPlacesSearchLimit: event.target.value }))
                                }
                                placeholder="Monthly place searches"
                                className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-[#10b9c4] sm:col-start-2"
                              />
                            </div>
                            <label className="flex items-center gap-2 text-sm text-slate-700">
                              <input
                                type="checkbox"
                                checked={mapForm.isEnabled}
                                onChange={(event) => setMapForm((value) => ({ ...value, isEnabled: event.target.checked }))}
                                className="size-4 rounded border-slate-300"
                              />
                              Provider enabled
                            </label>
                            <label className="flex items-center gap-2 text-sm text-slate-700">
                              <input
                                type="checkbox"
                                checked={mapForm.hardStopEnabled}
                                onChange={(event) => setMapForm((value) => ({ ...value, hardStopEnabled: event.target.checked }))}
                                className="size-4 rounded border-slate-300"
                              />
                              Hard stop before overage
                            </label>
                            {ops?.mapSettings ? (
                              <p className="text-sm text-slate-600">
                                Loads {ops.mapSettings.usedMapLoads} used / {ops.mapSettings.remainingMapLoads} remaining · Searches{" "}
                                {ops.mapSettings.usedPlacesSearches} used / {ops.mapSettings.remainingPlacesSearches} remaining ·{" "}
                                {ops.mapSettings.reason}
                              </p>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => {
                                void applyMapSettings();
                              }}
                              disabled={Boolean(activeOpsAction) || !mapForm.provider}
                              className="inline-flex h-10 w-fit items-center gap-2 rounded-md bg-[#10b9c4] px-4 text-sm font-semibold text-white hover:bg-[#0ea5b2] disabled:cursor-not-allowed disabled:bg-slate-400"
                            >
                              {activeOpsAction === "map-settings" ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
                              Save budget
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </section>
                  ) : null}

                  {canManageSiteOps ? (
                    <section className="border-t border-slate-200 pt-4">
                      <h3 className="mb-3 font-semibold text-slate-950">Audit log</h3>
                      <div className="grid gap-2">
                        {ops?.auditLogs.length ? (
                          ops.auditLogs.map((log) => (
                            <div key={log.id} className="rounded-md border border-slate-200 px-3 py-2 text-sm">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-semibold text-slate-950">{log.action}</span>
                                <span className="text-xs text-slate-500">{new Date(log.createdAt).toLocaleString()}</span>
                              </div>
                              <p className="mt-1 break-all text-xs text-slate-500">{log.actorEmail ?? "system"}</p>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-slate-500">No site audit entries yet.</p>
                        )}
                      </div>
                    </section>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="grid gap-4 xl:grid-cols-4">
              {boardStatuses.map(({ status, label }) => (
                <section key={status} className="min-h-[320px] rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-950">{label}</h3>
                      <p className="text-sm text-slate-500">{ticketsByStatus[status].length} tickets</p>
                    </div>
                    <Bell size={19} className="text-[#7ccfd6]" aria-hidden="true" />
                  </div>

                  <div className="grid gap-3">
                    {ticketsByStatus[status].length === 0 ? (
                      <p className="rounded-md border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                        {emptyStatusMessages[status]}
                      </p>
                    ) : null}

                    {ticketsByStatus[status].map((ticket) => (
                      <article key={ticket.id} className="min-w-0 rounded-md border border-slate-200 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h4 className="font-semibold text-slate-950">{ticket.queueName}</h4>
                            <p className="mt-1 break-all text-sm text-slate-600">{ticket.patientEmail}</p>
                            <p className="mt-1 text-xs text-slate-500">Checked in {new Date(ticket.createdAt).toLocaleTimeString()}</p>
                          </div>
                          <span className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold ring-1 ${ticketStatusStyles[ticket.status]}`}>
                            {ticketStatusLabels[ticket.status]}
                          </span>
                        </div>

                        <div className="mt-4 grid min-w-0 gap-2">
                          {getActions(ticket).map(({ action, label: actionLabel }) => {
                            const actionKey = `${ticket.id}:${action}`;
                            const isBusy = activeAction === actionKey;
                            const isCancel = action === "cancel" || action === "delay";

                            return (
                              <button
                                key={action}
                                type="button"
                                onClick={() => {
                                  void applyAction(ticket.id, action);
                                }}
                                disabled={Boolean(activeAction)}
                                className={`inline-flex min-h-9 w-full min-w-0 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold leading-tight disabled:cursor-not-allowed disabled:opacity-60 ${
                                  isCancel
                                    ? "border border-[#b9eaee] bg-white text-[#087884] hover:bg-[#eefbfc]"
                                    : "bg-[#10b9c4] text-white hover:bg-[#0ea5b2]"
                                }`}
                              >
                                {isBusy ? (
                                  <Loader2 className="animate-spin" size={15} aria-hidden="true" />
                                ) : isCancel ? (
                                  <X size={15} aria-hidden="true" />
                                ) : (
                                  <Check size={15} aria-hidden="true" />
                                )}
                                {actionLabel}
                              </button>
                            );
                          })}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
