"use client";

import { useMemo, useState } from "react";

type Props = {
  path: string;
  alt: string;
  className?: string;
};

function buildCandidates(path: string): string[] {
  const clean = path.trim();
  if (!clean) return [];

  if (
    clean.startsWith("http://") ||
    clean.startsWith("https://") ||
    clean.startsWith("data:")
  ) {
    return [clean];
  }

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!base) return [clean];

  const normalized = clean.replace(/^\/+/, "");
  const buckets = [
    "review-photos",
    "review-images",
    "reviews",
    "moments",
    "spot-photos",
  ];

  return [
    clean,
    ...buckets.map(
      (bucket) =>
        `${base}/storage/v1/object/public/${bucket}/${normalized}`
    ),
  ];
}

export function PublicMomentImage({
  path,
  alt,
  className,
}: Props) {
  const candidates = useMemo(() => buildCandidates(path), [path]);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  if (failed || candidates.length === 0) return null;

  return (
    <img
      src={candidates[index]}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => {
        const next = index + 1;
        if (next < candidates.length) {
          setIndex(next);
        } else {
          setFailed(true);
        }
      }}
    />
  );
}
