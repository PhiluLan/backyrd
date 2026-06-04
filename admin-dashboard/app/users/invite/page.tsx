"use client";

import { useState } from "react";
import Link from "next/link";

export default function InviteUserPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function invite() {
    setLoading(true);
    setMsg(null);

    const res = await fetch("/api/admin/invite-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const json = await res.json();

    if (!res.ok) {
      setMsg(json.error ?? "Invite failed");
    } else {
      setMsg("Invite gesendet.");
      setEmail("");
    }

    setLoading(false);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Invite User</h1>
          <p className="text-sm text-gray-500">Einladung per Email über Supabase.</p>
        </div>
        <Link href="/users" className="text-sm text-gray-500 hover:underline">
          Zurück
        </Link>
      </div>

      <div className="max-w-md space-y-3">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@domain.com"
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/5"
        />

        <button
          disabled={loading || !email.includes("@")}
          onClick={invite}
          className="rounded-md border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60"
        >
          {loading ? "Sende…" : "Invite senden"}
        </button>

        {msg && <div className="text-sm text-gray-700">{msg}</div>}
      </div>
    </div>
  );
}
