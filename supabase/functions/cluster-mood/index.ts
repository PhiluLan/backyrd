const retired = () => new Response(
  JSON.stringify({ ok: false, error: "endpoint_retired" }),
  {
    status: 410,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  },
);

Deno.serve(retired);
