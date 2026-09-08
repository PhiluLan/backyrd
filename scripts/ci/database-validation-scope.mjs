#!/usr/bin/env node

const allowedAdminModes = new Set(["canonical", "admin-data-additive"]);
const allowedMobileModes = new Set(["canonical", "mobile-storage-atomic"]);
const allowedActiveAdminModes = new Set(["inactive", "admin-data-additive-active"]);

export function selectDatabaseValidationScope({
  adminValidationMode,
  mobileValidationMode,
  activeAdminMode,
}) {
  if (!allowedAdminModes.has(adminValidationMode)) throw new Error("unknown admin validation mode");
  if (!allowedMobileModes.has(mobileValidationMode)) throw new Error("unknown mobile validation mode");
  if (!allowedActiveAdminModes.has(activeAdminMode)) throw new Error("unknown active Admin/data mode");

  const hasAdminCandidate = adminValidationMode !== "canonical";
  const hasMobileCandidate = mobileValidationMode !== "canonical";
  if (hasAdminCandidate && hasMobileCandidate) {
    throw new Error("A candidate cannot combine admin-data-additive and mobile-storage-atomic scopes.");
  }

  if (hasAdminCandidate) return { validationMode: adminValidationMode, consumeActiveAdmin: false };
  if (hasMobileCandidate) return { validationMode: mobileValidationMode, consumeActiveAdmin: false };
  if (activeAdminMode === "admin-data-additive-active") {
    return { validationMode: "admin-data-additive", consumeActiveAdmin: true };
  }
  return { validationMode: "canonical", consumeActiveAdmin: false };
}

if (process.argv[1]?.endsWith("database-validation-scope.mjs")) {
  const value = (flag) => {
    const index = process.argv.indexOf(flag);
    if (index === -1 || !process.argv[index + 1]) throw new Error(`missing ${flag}`);
    return process.argv[index + 1];
  };
  process.stdout.write(`${JSON.stringify(selectDatabaseValidationScope({
    adminValidationMode: value("--admin-mode"),
    mobileValidationMode: value("--mobile-mode"),
    activeAdminMode: value("--active-admin-mode"),
  }))}\n`);
}
