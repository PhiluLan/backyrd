"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";

export function SearchBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get("q") ?? "");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const q = value.trim();

    if (!q) {
      router.push("/");
      return;
    }

    router.push(`/?q=${encodeURIComponent(q)}`);
  }

  return (
    <form onSubmit={onSubmit} className="w-full">
      <div className="flex h-14 w-full items-center rounded-full border border-white/10 bg-white/5 px-5 backdrop-blur-xl">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="z. B. cozy bar, rooftop, date night..."
          className="w-full bg-transparent text-base text-white outline-none placeholder:text-white/45"
        />
        <button
          type="submit"
          className="ml-4 rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition hover:opacity-90"
        >
          Suchen
        </button>
      </div>
    </form>
  );
}