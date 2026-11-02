"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { api, errMsg } from "@/lib/client/api";
import { Alert, Badge, Button, Card, Empty, Input, PremiumBadge, Spinner } from "@/components/ui";
import { CompareTable } from "@/components/CompareTable";
import type { ResultRow } from "@/lib/client/types";

function ComparePageInner() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const [premium, setPremium] = useState(false);
  const [options, setOptions] = useState<ResultRow[]>([]);
  const [ids, setIds] = useState<string[]>(sp.get("ids")?.split(",").filter(Boolean) ?? []);
  const [rows, setRows] = useState<ResultRow[] | null>(null);
  const [topN, setTopN] = useState("3");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ rows: ResultRow[]; premium: boolean; state: string }>(`/api/projects/${id}/results?view=ranked&sort=score`).then((r) => {
      setOptions(r.rows);
      setPremium(r.premium);
      if (ids.length === 0) setIds(r.rows.slice(0, 3).map((x) => x.id));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const run = useCallback(async () => {
    if (ids.length === 0) return setRows([]);
    setError(null);
    try {
      const r = await api<{ rows: ResultRow[] }>(`/api/projects/${id}/compare`, { method: "POST", json: { optionIds: ids } });
      setRows(r.rows);
    } catch (e) {
      setError(errMsg(e));
    }
  }, [id, ids]);
  useEffect(() => {
    run();
  }, [run]);

  async function useTop() {
    const n = Math.max(1, Math.min(200, Number(topN) || 3));
    const r = await api<{ ids: string[]; premium: boolean }>(`/api/projects/${id}/compare?top=${n}`);
    setIds(r.ids);
  }
  const limit = premium ? 200 : 3;
  return (
    <div className="space-y-5">
      <Card title="Choose options to compare">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="topn" className="block text-xs text-navy-700">Top N accessible options</label>
            <div className="flex gap-2">
              <Input id="topn" type="number" min={1} max={limit} value={topN} onChange={(e) => setTopN(e.target.value)} className="w-24" />
              <Button variant="secondary" onClick={useTop}>Use top {topN || "N"}</Button>
            </div>
          </div>
          {!premium && Number(topN) > 3 && <span className="flex items-center gap-2 text-sm"><PremiumBadge /> Free accounts compare up to their 3 preview options.</span>}
        </div>
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-teal-800">Pick options manually ({ids.length} selected)</summary>
          <ul className="mt-2 max-h-72 space-y-1 overflow-auto rounded-lg border border-navy-100 p-2">
            {options.map((o) => (
              <li key={o.id}>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={ids.includes(o.id)}
                    disabled={!ids.includes(o.id) && ids.length >= limit}
                    onChange={() => setIds(ids.includes(o.id) ? ids.filter((x) => x !== o.id) : [...ids, o.id])}
                  />
                  {o.systemRank && <Badge>#{o.systemRank}</Badge>} {o.institution} — {o.designation}
                </label>
              </li>
            ))}
          </ul>
        </details>
      </Card>
      {error && <Alert tone="error">{error}</Alert>}
      {rows == null ? <Spinner /> : rows.length === 0 ? <Empty title="Select at least one option" /> : (
        <>
          <p className="text-xs text-navy-700">Best values in each row are highlighted. “Unknown” means no evidence — it is never treated as zero.</p>
          <CompareTable rows={rows} />
        </>
      )}
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense>
      <ComparePageInner />
    </Suspense>
  );
}
