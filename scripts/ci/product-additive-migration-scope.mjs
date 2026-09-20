// Reviewed forward-only Product migrations after the historical Founder 13.
// This is an exact prefix, not an open-ended count or a grant to apply SQL.
export const PRODUCT_ADDITIVE_MIGRATIONS = Object.freeze([
  Object.freeze({ path: "supabase/migrations/20260919205256_decision_vnext_verified_world_catalog_priority.sql", sha256: "541c15131c53efb23a5d300ef17cbd8ba3312cfc3be320e0537c1491d7547626" }),
  Object.freeze({ path: "supabase/migrations/20260920190048_bridge_product_world_knowledge_v1.sql", sha256: "f13bbb8a91ad6f3b976a6b5b95cd4e72af68750b53be6668cadf810248b6d02d" }),
]);

export function isExactProductAdditiveSet(migrations) {
  return Array.isArray(migrations)
    && migrations.length >= 1 && migrations.length <= PRODUCT_ADDITIVE_MIGRATIONS.length
    && migrations.every((row, index) => row?.path === PRODUCT_ADDITIVE_MIGRATIONS[index].path
      && row?.sha256 === PRODUCT_ADDITIVE_MIGRATIONS[index].sha256);
}

export function isExactPreappliedPriorityReceipt(receipt) {
  return receipt?.status === "READ_ONLY_PRODUCTION_STATEMENTS_MATCH"
    && receipt.projectRef === "hjgcrrzfjchzqoegcywn"
    && receipt.executionAuthorized === false
    && receipt.path === PRODUCT_ADDITIVE_MIGRATIONS[0].path
    && receipt.sha256 === PRODUCT_ADDITIVE_MIGRATIONS[0].sha256
    && JSON.stringify(receipt.statementSha256) === JSON.stringify([
      "c101dba45cc83819760539e7c468d6cb8d81729b3bc24c707b07e797396807ff",
      "c5a281ef9ad82e44ed873994a03ec3c607342b6cc87c75a41f239c2ad38d34cf",
      "e844c3da0705dd991bd221412e5bc828e4a9c60761c28cc236910cee9202083d",
    ]);
}
