// Reviewed forward-only Product migrations after the historical Founder 13.
// This is an exact prefix, not an open-ended count or a grant to apply SQL.
export const PRODUCT_ADDITIVE_MIGRATIONS = Object.freeze([
  Object.freeze({ path: "supabase/migrations/20260919205256_decision_vnext_verified_world_catalog_priority.sql", sha256: "541c15131c53efb23a5d300ef17cbd8ba3312cfc3be320e0537c1491d7547626" }),
  Object.freeze({ path: "supabase/migrations/20260920190048_bridge_product_world_knowledge_v1.sql", sha256: "f13bbb8a91ad6f3b976a6b5b95cd4e72af68750b53be6668cadf810248b6d02d" }),
  Object.freeze({ path: "supabase/migrations/20260921173129_connect_user_intelligence_to_product_ranking_v1.sql", sha256: "24339b01a3ced8b439b6f3c2b7f5246b8cd9c6d38754fba3b8011d6010251d96" }),
  Object.freeze({ path: "supabase/migrations/20260921182331_create_user_intelligence_admin_cockpit_v1.sql", sha256: "785a53e29fcee1ee689c0491c77301b3a2f05a550a175356f7aed6fc34184ead" }),
  Object.freeze({ path: "supabase/migrations/20260922165937_founder_live_product_cockpit_v2.sql", sha256: "a3cdd90138c9fe5d956484cd5c5660d7debdd072d9322ab3895e2b68ed0abf14" }),
  Object.freeze({ path: "supabase/migrations/20260922183824_create_growth_intelligence_cockpit_v2.sql", sha256: "a87ed1583e08d9595a2b6b996ae12d655d68e1341a2d87cc6dbab75ac7fd6031" }),
  Object.freeze({ path: "supabase/migrations/20260922200527_unified_spot_knowledge_presentation_v1.sql", sha256: "49090c335022654e74be75fed4c6db11669691989f7e80336756dd849e9142cb" }),
  Object.freeze({ path: "supabase/migrations/20260923045854_unify_world_spot_authoring_projection.sql", sha256: "d48dac07ed645cfb530d28d61930b11c5dde09befca2ff1ee651a4ed63334a3b" }),
  Object.freeze({ path: "supabase/migrations/20260926120337_world_research_batch_import_v1.sql", sha256: "0623674cbe88895f51959de3e00ba723087238256b9db9c1ee83bf89c4d4fac0" }),
  Object.freeze({ path: "supabase/migrations/20260926142253_world_research_reviewed_import_v2.sql", sha256: "9dacce20ea925b5e3e506d3bb933d46af2012a8aa788e83bf72f634da8840028" }),
  Object.freeze({ path: "supabase/migrations/20260927134435_world_product_admin_research_queue_v1.sql", sha256: "ea9f5997c2f892d7c660f8637bf197d7dcc99bfbf63683e87b99c5eb5ffed7a1" }),
  Object.freeze({ path: "supabase/migrations/20260927153722_spot_detail_explanation_projection_v1.sql", sha256: "0e6941984394a20eec4ef7cbfca835245aafc7c78eb82bc6e36a3a1fb7c2b3ca" }),
  Object.freeze({ path: "supabase/migrations/20260927190000_spot_public_contact_presentation.sql", sha256: "4fe9d29b11b0535c74fcd6916206142450e8b1f5e6f418d2153d5dd7f65eaf05" }),
  Object.freeze({ path: "supabase/migrations/20260929171915_fix_safety_actor_profile_deletion.sql", sha256: "99ba56cdd4d949fe0005f65d964c6a6470f46910a59608bab297d44f528b47ed" }),
  Object.freeze({ path: "supabase/migrations/20260929193000_world_research_automation_jobs_v1.sql", sha256: "2e1dca5cf05bc11b4d3dc64965c83e73323bffdfe76bedef38adf80a6a5b2b7d" }),
  Object.freeze({ path: "supabase/migrations/20260930053440_world_research_automation_review_completion_v1.sql", sha256: "3dd624908ff9dbd2889a0eb79205fa619ba5368f915bf19aad38a48fad108100" }),
  Object.freeze({ path: "supabase/migrations/20261001202402_decision_continuous_authority_v1.sql", sha256: "e2492c42d42fe40a1893f5dd90dc41df6417ba62c786184ca5e2ae4bed295ea7" }),
  Object.freeze({ path: "supabase/migrations/20261002202705_owner_pro_stripe_billing_v1.sql", sha256: "7aa7abc64b9965c6767364c840f3f27dffd8ad6fedf4efbbcab97488a18b58f6" }),
  Object.freeze({ path: "supabase/migrations/20261003111539_decision_ai_intent_cache_v1.sql", sha256: "bb7f64fe1dfe2c99c920bae57eb3c50d1b6ccefddc63952b8560f310836c95b2" }),
  Object.freeze({ path: "supabase/migrations/20261003130322_align_decision_product_world_taxonomy.sql", sha256: "6ece7fa6f72fe5e970c8f19b242d539afa26f13efa51d0af00f43c5af9cd401a" }),
  Object.freeze({ path: "supabase/migrations/20261003160222_decision_ai_query_cache_v1.sql", sha256: "02b6a2541629fde1ec767fe9851d353fa8bd4f08c6a90bbef72033d12cf45d3b" }),
  Object.freeze({ path: "supabase/migrations/20261003160310_decision_product_context_full_city_v5.sql", sha256: "52eef471fc0ee28e6958ef00aaa037afdfb2cf1279162734166cf3692c93b403" }),
]);

export function isExactProductAdditiveSet(migrations) {
  if (!Array.isArray(migrations) || migrations.length < 1
    || migrations.length > PRODUCT_ADDITIVE_MIGRATIONS.length) return false;
  return PRODUCT_ADDITIVE_MIGRATIONS.some((_, start) =>
    start + migrations.length <= PRODUCT_ADDITIVE_MIGRATIONS.length
    && migrations.every((row, index) => {
      const expected = PRODUCT_ADDITIVE_MIGRATIONS[start + index];
      return row?.path === expected.path && row?.sha256 === expected.sha256;
    }));
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
