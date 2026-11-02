"use client";
import { Badge, DemoBadge } from "./ui";
import type { Criterion, ResultRow, Source } from "@/lib/client/types";
import { formatColombo } from "@/lib/dates";

const LABEL: Record<string, string> = { post: "Post", travel: "Travel", climate: "Climate", facilities: "Facilities", location: "Preferred place" };
const KIND: Record<string, string> = { route_drive: "Driving route", route_transit: "Public transport route", climate: "Climate normals", facilities: "Nearby facilities" };

export function fmtMin(m: number | null | undefined) {
  if (m == null) return "Unknown";
  const h = Math.floor(m / 60);
  return h ? `${h} h ${Math.round(m % 60)} min` : `${Math.round(m)} min`;
}
export function fmtKm(k: number | null | undefined) {
  return k == null ? "Unknown" : `${k.toFixed(1)} km`;
}

export function Breakdown({ items }: { items: Criterion[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-navy-700">
        <tr><th className="py-1 pr-2">Criterion</th><th className="py-1 pr-2">Weight</th><th className="py-1 pr-2">Score</th><th className="py-1">Why</th></tr>
      </thead>
      <tbody>
        {items.filter((b) => b.enabled).map((b) => (
          <tr key={b.criterion} className="border-t border-navy-100 align-top">
            <td className="py-1.5 pr-2 font-medium">{LABEL[b.criterion]}</td>
            <td className="tabular py-1.5 pr-2">{b.weight}%</td>
            <td className="tabular py-1.5 pr-2">{b.score == null ? <Badge>Unknown</Badge> : b.score.toFixed(1)}{b.score != null && b.known < 1 && <span className="ml-1 text-xs text-amber-800">({Math.round(b.known * 100)}% known)</span>}</td>
            <td className="py-1.5 text-xs text-navy-700">{b.detail}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Sources({ sources, location }: { sources: Source[]; location: ResultRow["location"] }) {
  return (
    <ul className="space-y-1 text-xs text-navy-700">
      {location && (
        <li>
          <span className="font-medium text-navy-900">Location:</span> {location.label ?? "not resolved"} ({location.status === "confirmed" ? "confirmed by you" : location.status === "auto" ? "matched automatically" : location.status.replace("_", " ")}) {location.isDemo && <DemoBadge />}
        </li>
      )}
      {sources.map((s, i) => (
        <li key={i}>
          <span className="font-medium text-navy-900">{KIND[s.kind] ?? s.kind}:</span> {s.provider} · retrieved {formatColombo(s.retrievedAt)} · {s.status}
          {s.isDemo && <> <DemoBadge /></>}
          {s.sourceUrl && <> · <a className="underline" href={s.sourceUrl} target="_blank" rel="noreferrer noopener">source</a></>}
          {typeof s.value === "object" && s.value && "assumptions" in (s.value as object) && <span className="block pl-2 italic">{String((s.value as { assumptions: string }).assumptions)}</span>}
          {s.attribution && !s.isDemo && <span className="block pl-2">{s.attribution}</span>}
        </li>
      ))}
      {sources.length === 0 && !location && <li>No evidence retrieved yet.</li>}
    </ul>
  );
}
