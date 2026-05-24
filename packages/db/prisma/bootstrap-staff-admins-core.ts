export const defaultStaffAdminEmail = "staff@example.com";

const productionLikeAppEnvs = new Set(["staging", "production"]);

export type StaffAdminBootstrapEnv = Record<string, string | undefined>;

export type StaffAdminBootstrapConfig = {
  emails: string[];
  requestedSiteIds: string[];
  dryRun: boolean;
};

export type StaffAdminBootstrapMembership = {
  id: string;
  role: string;
  user: {
    email: string;
  };
};

export type StaffAdminBootstrapSite = {
  id: string;
  memberships: StaffAdminBootstrapMembership[];
};

export type StaffAdminBootstrapPlanItem = {
  siteId: string;
  created: number;
  promoted: number;
  unchanged: number;
};

export type StaffAdminBootstrapSuccessOutput = {
  ok: true;
  dryRun: boolean;
  emailCount: number;
  siteCount: number;
  requestedSiteCount: number;
  changes: {
    created: number;
    promoted: number;
    unchanged: number;
  };
  sites: StaffAdminBootstrapPlanItem[];
};

export class BootstrapInputError extends Error {
  constructor(public readonly status: string) {
    super(status);
    this.name = "BootstrapInputError";
  }
}

export function parseBootstrapList(value: string | undefined) {
  return [
    ...new Set(
      (value ?? "")
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

function isEmailLike(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isProductionLikeBootstrap(env: StaffAdminBootstrapEnv = process.env) {
  return env.NODE_ENV === "production" || productionLikeAppEnvs.has((env.APP_ENV ?? "").toLowerCase());
}

export function isPlaceholderStaffEmail(value: string) {
  return value === defaultStaffAdminEmail || /@(example\.com|example\.org|example\.net)$/i.test(value);
}

export function getStaffAdminEmails(env: StaffAdminBootstrapEnv = process.env) {
  const emails = parseBootstrapList(env.QDOC_BOOTSTRAP_STAFF_ADMIN_EMAILS ?? env.QDOC_SEED_STAFF_ADMIN_EMAILS);

  if (emails.length === 0) {
    throw new BootstrapInputError("staff_admin_emails_required");
  }

  if (emails.some((email) => !isEmailLike(email))) {
    throw new BootstrapInputError("invalid_staff_admin_email_entries");
  }

  if (isProductionLikeBootstrap(env) && emails.some(isPlaceholderStaffEmail)) {
    throw new BootstrapInputError("placeholder_staff_admin_emails_forbidden");
  }

  return emails;
}

export function getRequestedSiteIds(env: StaffAdminBootstrapEnv = process.env) {
  return parseBootstrapList(env.QDOC_BOOTSTRAP_STAFF_SITE_IDS ?? env.QDOC_ADMIN_DATA_EXPECT_SITE_IDS);
}

export function isStaffAdminBootstrapDryRun(env: StaffAdminBootstrapEnv = process.env) {
  return env.QDOC_BOOTSTRAP_STAFF_DRY_RUN === "true";
}

export function assertStaffAdminBootstrapApplyConfirmed(dryRun: boolean, env: StaffAdminBootstrapEnv = process.env) {
  if (dryRun || !isProductionLikeBootstrap(env)) {
    return;
  }

  if (env.QDOC_BOOTSTRAP_STAFF_CONFIRM !== "apply") {
    throw new BootstrapInputError("staff_admin_bootstrap_apply_confirmation_required");
  }
}

export function resolveStaffAdminBootstrapConfig(env: StaffAdminBootstrapEnv = process.env): StaffAdminBootstrapConfig {
  const emails = getStaffAdminEmails(env);
  const requestedSiteIds = getRequestedSiteIds(env);
  const dryRun = isStaffAdminBootstrapDryRun(env);
  assertStaffAdminBootstrapApplyConfirmed(dryRun, env);

  return {
    emails,
    requestedSiteIds,
    dryRun,
  };
}

export function indexStaffAdminMembershipsBySiteAndEmail(sites: StaffAdminBootstrapSite[]) {
  const existingBySiteAndEmail = new Map<string, { id: string; role: string }>();

  for (const site of sites) {
    for (const membership of site.memberships) {
      existingBySiteAndEmail.set(`${site.id}:${membership.user.email.toLowerCase()}`, {
        id: membership.id,
        role: membership.role,
      });
    }
  }

  return existingBySiteAndEmail;
}

export function buildStaffAdminBootstrapPlan(sites: StaffAdminBootstrapSite[], emails: string[]) {
  const existingBySiteAndEmail = indexStaffAdminMembershipsBySiteAndEmail(sites);

  return sites.map((site) => {
    const created = emails.filter((email) => !existingBySiteAndEmail.has(`${site.id}:${email}`)).length;
    const promoted = emails.filter((email) => existingBySiteAndEmail.get(`${site.id}:${email}`)?.role === "staff").length;
    const unchanged = emails.filter((email) => existingBySiteAndEmail.get(`${site.id}:${email}`)?.role === "admin").length;

    return {
      siteId: site.id,
      created,
      promoted,
      unchanged,
    };
  });
}

export function buildStaffAdminBootstrapSuccessOutput(input: {
  dryRun: boolean;
  emailCount: number;
  requestedSiteCount: number;
  plan: StaffAdminBootstrapPlanItem[];
}): StaffAdminBootstrapSuccessOutput {
  return {
    ok: true,
    dryRun: input.dryRun,
    emailCount: input.emailCount,
    siteCount: input.plan.length,
    requestedSiteCount: input.requestedSiteCount,
    changes: {
      created: input.plan.reduce((total, item) => total + item.created, 0),
      promoted: input.plan.reduce((total, item) => total + item.promoted, 0),
      unchanged: input.plan.reduce((total, item) => total + item.unchanged, 0),
    },
    sites: input.plan,
  };
}
