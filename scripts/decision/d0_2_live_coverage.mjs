#!/usr/bin/env node

const baseUrl = process.env.D0_2_SUPABASE_URL;
const apiKey = process.env.D0_2_SUPABASE_SERVICE_KEY;
if (!baseUrl || !apiKey) throw new Error("D0_2_SUPABASE_URL and D0_2_SUPABASE_SERVICE_KEY are required");

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: apiKey,
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return response.json();
}

const select = (table, columns, query = "") =>
  request(`${table}?select=${encodeURIComponent(columns)}${query}`);
const ids = (rows) => new Set(rows.map((row) => row.spot_id ?? row.id));
const inBasel = (rows, baselIds) => new Set([...ids(rows)].filter((id) => baselIds.has(id)));

// Data minimization: only opaque IDs and embedding freshness metadata are fetched.
// Coverage for scalar Spot fields is measured with server-side filters returning IDs only.
const approvedBaselRows = await select("spots", "id", "&status=eq.approved&city=ilike.Basel&limit=1000");
const approvedAllRows = await select("spots", "id", "&status=eq.approved&limit=1000");
const allSpotRows = await select("spots", "id,status", "&limit=1000");
const nonApprovedBaselRows = await select("spots", "id", "&status=neq.approved&city=ilike.Basel&limit=1000");
const baselIds = ids(approvedBaselRows);
const approvedIds = ids(approvedAllRows);
const allSpotIds = ids(allSpotRows);

const scalarCoverageQueries = {
  category: "&category_id=not.is.null",
  address: "&address=not.is.null",
  location: "&lat=not.is.null&lng=not.is.null",
  price: "&price_level=not.is.null",
  header_or_google_photo: "&or=(header_photo_path.not.is.null,google_place_id.not.is.null)",
};
const scalarCoverage = Object.fromEntries(await Promise.all(
  Object.entries(scalarCoverageQueries).map(async ([key, filter]) => [
    key,
    ids(await select("spots", "id", `&status=eq.approved&city=ilike.Basel${filter}&limit=1000`)),
  ]),
));

const [descriptions, keywordDescriptions, hours, photos, reviews, textReviews, moodReviews, moods, intelligence, documents, embeddings, jobs] =
  await Promise.all([
    select("spot_effective_content_v1", "spot_id", "&effective_description=not.is.null&limit=1000"),
    select("spot_effective_content_v1", "spot_id", "&effective_keywords=not.eq.{}&limit=1000"),
    select("spot_hours", "spot_id", "&limit=5000"),
    select("spot_photos", "spot_id", "&limit=5000"),
    select("reviews", "spot_id", "&limit=5000"),
    select("reviews", "spot_id", "&text=not.is.null&limit=5000"),
    select("reviews", "spot_id", "&or=(mood_a_id.not.is.null,mood_b_id.not.is.null)&limit=5000"),
    select("spot_moods", "spot_id", "&mood_count=gt.0&limit=5000"),
    select("spot_intelligence_v1", "spot_id", "&limit=1000"),
    select("backyrd_spot_ml_documents_v1", "spot_id,source_hash,document_version,updated_at", "&limit=1000"),
    select("backyrd_spot_embeddings_v1", "spot_id,model_name,model_dimensions,document_version,source_hash,updated_at", "&limit=1000"),
    select("backyrd_embedding_jobs_v1", "spot_id,status", "&status=in.(pending,processing)&limit=1000"),
  ]);

const distribution = approvedBaselRows.length
  ? await request("rpc/distribution_trust_filter_entities_v1", {
      method: "POST",
      body: JSON.stringify({
        p_entity_type: "spot",
        p_entity_ids: [...baselIds],
        p_surface: "decision",
      }),
    })
  : [];

const coverage = (set) => ({
  spots: set.size,
  percent: approvedBaselRows.length ? Number(((set.size / approvedBaselRows.length) * 100).toFixed(1)) : 0,
});
const documentBySpot = new Map(documents.map((row) => [row.spot_id, row]));
const embeddingBySpot = new Map(embeddings.map((row) => [row.spot_id, row]));
const baselDocuments = inBasel(documents, baselIds);
const baselEmbeddings = inBasel(embeddings, baselIds);
const stale = new Set([...baselIds].filter((spotId) => {
  const document = documentBySpot.get(spotId);
  const embedding = embeddingBySpot.get(spotId);
  return document && embedding && (
    document.source_hash !== embedding.source_hash ||
    document.document_version !== embedding.document_version
  );
}));
const distributionPriorities = Object.fromEntries(
  [...new Set(distribution.map((row) => String(row.distribution_priority)))].sort()
    .map((priority) => [priority, distribution.filter((row) => String(row.distribution_priority) === priority).length]),
);
const baselEmbeddingRows = embeddings.filter((row) => baselIds.has(row.spot_id));
const models = Object.fromEntries(
  [...new Set(baselEmbeddingRows.map((row) => `${row.model_name}/${row.model_dimensions}/${row.document_version}`))].sort()
    .map((model) => [model, baselEmbeddingRows.filter((row) => `${row.model_name}/${row.model_dimensions}/${row.document_version}` === model).length]),
);

process.stdout.write(`${JSON.stringify({
  measured_at: new Date().toISOString(),
  access: "read-only HTTPS; IDs, server-side presence filters, and embedding freshness metadata only; no content values; no writes",
  universe: {
    all_spots: allSpotRows.length,
    approved_spots: approvedAllRows.length,
    approved_basel_spots: approvedBaselRows.length,
    basel_non_approved_spots: nonApprovedBaselRows.length,
  },
  basel_approved_coverage: {
    ...Object.fromEntries(Object.entries(scalarCoverage).map(([key, set]) => [key, coverage(set)])),
    uploaded_photo: coverage(inBasel(photos, baselIds)),
    opening_hours: coverage(inBasel(hours, baselIds)),
    effective_description: coverage(inBasel(descriptions, baselIds)),
    effective_keywords: coverage(inBasel(keywordDescriptions, baselIds)),
    review: coverage(inBasel(reviews, baselIds)),
    review_text: coverage(inBasel(textReviews, baselIds)),
    review_mood: coverage(inBasel(moodReviews, baselIds)),
    aggregated_mood: coverage(inBasel(moods, baselIds)),
    spot_intelligence: coverage(inBasel(intelligence, baselIds)),
    ml_document: coverage(baselDocuments),
    embedding: coverage(baselEmbeddings),
    distribution_evaluated: coverage(new Set(distribution.map((row) => row.entity_id))),
    distribution_eligible: coverage(new Set(distribution.filter((row) => row.eligible).map((row) => row.entity_id))),
  },
  embeddings: {
    approved_basel_with_document: baselDocuments.size,
    approved_basel_with_embedding: baselEmbeddings.size,
    approved_basel_missing_document: approvedBaselRows.length - baselDocuments.size,
    approved_basel_missing_embedding: approvedBaselRows.length - baselEmbeddings.size,
    approved_basel_stale_embedding: stale.size,
    orphan_embedding_rows: embeddings.filter((row) => !allSpotIds.has(row.spot_id)).length,
    non_approved_embedding_rows: embeddings.filter((row) => allSpotIds.has(row.spot_id) && !approvedIds.has(row.spot_id)).length,
    duplicate_embedding_rows: embeddings.length - new Set(embeddings.map((row) => row.spot_id)).size,
    model_distribution: models,
    pending_or_processing_jobs_for_approved_basel: jobs.filter((row) => baselIds.has(row.spot_id)).length,
  },
  distribution_priority_counts: distributionPriorities,
  distribution_state_note: "The public Decision filter contract exposes eligibility and priority, not the underlying effective-state label.",
  freshness: {
    latest_document_update: documents.filter((row) => baselIds.has(row.spot_id)).map((row) => row.updated_at).filter(Boolean).sort().at(-1) ?? null,
    latest_embedding_update: embeddings.filter((row) => baselIds.has(row.spot_id)).map((row) => row.updated_at).filter(Boolean).sort().at(-1) ?? null,
    semantics: "Stale means persisted ML document and embedding differ by source_hash or document_version; pending/processing jobs separately expose queued source changes.",
  },
}, null, 2)}\n`);
