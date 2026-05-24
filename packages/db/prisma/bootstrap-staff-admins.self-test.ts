import assert from "node:assert/strict";

import {
  BootstrapInputError,
  getStaffAdminEmails,
  isPlaceholderStaffEmail,
  isProductionLikeBootstrap,
  parseBootstrapList,
  resolveStaffAdminBootstrapConfig,
  type StaffAdminBootstrapEnv,
} from "./bootstrap-staff-admins-core.js";

function expectBootstrapStatus(status: string, env: StaffAdminBootstrapEnv) {
  assert.throws(
    () => resolveStaffAdminBootstrapConfig(env),
    (error: unknown) => error instanceof BootstrapInputError && error.status === status,
  );
}

assert.deepEqual(parseBootstrapList(" Admin@Clinic.test, staff@clinic.test, admin@clinic.test ,, "), [
  "admin@clinic.test",
  "staff@clinic.test",
]);

assert.equal(isProductionLikeBootstrap({ APP_ENV: "staging" }), true);
assert.equal(isProductionLikeBootstrap({ APP_ENV: "production" }), true);
assert.equal(isProductionLikeBootstrap({ NODE_ENV: "production" }), true);
assert.equal(isProductionLikeBootstrap({ APP_ENV: "development", NODE_ENV: "test" }), false);

assert.equal(isPlaceholderStaffEmail("staff@example.com"), true);
assert.equal(isPlaceholderStaffEmail("admin@example.org"), true);
assert.equal(isPlaceholderStaffEmail("admin@clinic.test"), false);

expectBootstrapStatus("staff_admin_emails_required", {});
expectBootstrapStatus("invalid_staff_admin_email_entries", {
  QDOC_BOOTSTRAP_STAFF_ADMIN_EMAILS: "not-an-email",
});
expectBootstrapStatus("placeholder_staff_admin_emails_forbidden", {
  APP_ENV: "staging",
  QDOC_BOOTSTRAP_STAFF_ADMIN_EMAILS: "staff@example.com",
});
expectBootstrapStatus("staff_admin_bootstrap_apply_confirmation_required", {
  APP_ENV: "staging",
  QDOC_BOOTSTRAP_STAFF_ADMIN_EMAILS: "admin@clinic.test",
});

assert.deepEqual(getStaffAdminEmails({ QDOC_SEED_STAFF_ADMIN_EMAILS: "Seed@Clinic.test" }), ["seed@clinic.test"]);

assert.deepEqual(
  resolveStaffAdminBootstrapConfig({
    APP_ENV: "staging",
    QDOC_BOOTSTRAP_STAFF_DRY_RUN: "true",
    QDOC_BOOTSTRAP_STAFF_ADMIN_EMAILS: "Admin@Clinic.test, staff@clinic.test, admin@clinic.test",
    QDOC_ADMIN_DATA_EXPECT_SITE_IDS: "site-waterloo,site-kitchener",
  }),
  {
    emails: ["admin@clinic.test", "staff@clinic.test"],
    requestedSiteIds: ["site-waterloo", "site-kitchener"],
    dryRun: true,
  },
);

assert.deepEqual(
  resolveStaffAdminBootstrapConfig({
    APP_ENV: "staging",
    QDOC_BOOTSTRAP_STAFF_CONFIRM: "apply",
    QDOC_BOOTSTRAP_STAFF_ADMIN_EMAILS: "admin@clinic.test",
    QDOC_BOOTSTRAP_STAFF_SITE_IDS: "site-university",
    QDOC_ADMIN_DATA_EXPECT_SITE_IDS: "site-waterloo",
  }),
  {
    emails: ["admin@clinic.test"],
    requestedSiteIds: ["site-university"],
    dryRun: false,
  },
);

assert.deepEqual(resolveStaffAdminBootstrapConfig({ QDOC_BOOTSTRAP_STAFF_ADMIN_EMAILS: "admin@clinic.test" }), {
  emails: ["admin@clinic.test"],
  requestedSiteIds: [],
  dryRun: false,
});

console.log("staff-admin bootstrap self-test: passed");
