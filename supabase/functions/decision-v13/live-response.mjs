export function jsonResponseWithFreshEntityHeaders(payload, baseResponse) {
  const headers = new Headers(baseResponse.headers);

  // The internal-live wrapper replaces the canonical v13 response body. Entity
  // headers from the original body are therefore no longer valid and can make
  // native fetch clients reject an otherwise successful response as truncated.
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.delete("etag");
  headers.set("content-type", "application/json; charset=utf-8");

  return new Response(JSON.stringify(payload), {
    status: baseResponse.status,
    statusText: baseResponse.statusText,
    headers,
  });
}
