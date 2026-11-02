"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowDown, ArrowUp, X, Search } from "lucide-react";
import { api } from "@/lib/client/api";
import { usePrefs } from "@/lib/client/usePrefs";
import { StepPage, Question } from "@/components/StepPage";
import { Alert, Empty, Input, Spinner, cx } from "@/components/ui";
import { normalizeText } from "@/lib/scoring";

type Designation = { name: string; rows: number; vacancies: number };

/** Points shown to the user for each chosen post (same rule the scoring uses). */
function pointsFor(i: number, ps: { firstChoice: number; stepDown: number; floor: number }) {
  return Math.max(ps.floor, ps.firstChoice - ps.stepDown * i);
}

export default function PostsStep() {
  const { id } = useParams<{ id: string }>();
  const { prefs, update, errors, save, saving, otherStepProblem, loadError } = usePrefs(id, "posts");
  const [list, setList] = useState<Designation[] | null>(null);
  const [imported, setImported] = useState(true);
  const [q, setQ] = useState("");
  useEffect(() => {
    api<{ imported: boolean; designations: Designation[] }>(`/api/projects/${id}/designations`).then((r) => {
      setList(r.designations);
      setImported(r.imported);
    });
  }, [id]);
  const chosen = prefs?.posts ?? [];
  const isChosen = (name: string) => chosen.some((c) => normalizeText(c) === normalizeText(name));
  const filtered = useMemo(() => (list ?? []).filter((d) => !q || normalizeText(d.name).includes(normalizeText(q))), [list, q]);
  if (loadError) return <Alert tone="error">{loadError}</Alert>;
  if (!prefs || !list) return <Spinner />;
  const setPosts = (posts: string[]) => update({ posts });
  const toggle = (name: string) => setPosts(isChosen(name) ? chosen.filter((c) => normalizeText(c) !== normalizeText(name)) : [...chosen, name]);
  const move = (i: number, d: number) => {
    const n = [...chosen];
    const j = i + d;
    if (j < 0 || j >= n.length) return;
    [n[i], n[j]] = [n[j], n[i]];
    setPosts(n);
  };
  return (
    <StepPage projectId={id} step="posts" title="Which posts would you like?" intro="Pick from the posts in your vacancy list, then put them in order — your favourite first." onNext={save} busy={saving} problem={otherStepProblem}>
      {!imported ? (
        <Empty title="Upload your vacancy list first">
          The posts are taken from your list. <Link className="font-semibold text-teal-800 underline" href={`/projects/${id}/import`}>Upload your list</Link>
        </Empty>
      ) : (
        <>
          <Question field="posts" title="1. Tick the posts you want" hint={`${list.length} different posts were found in your list.`} error={errors.posts}>
            {list.length > 8 && (
              <label className="relative mb-3 block">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-700" aria-hidden />
                <Input aria-label="Search posts" placeholder="Search posts" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
              </label>
            )}
            <ul className="grid max-h-96 gap-2 overflow-y-auto sm:grid-cols-2">
              {filtered.map((d) => {
                const on = isChosen(d.name);
                return (
                  <li key={d.name}>
                    <label className={cx("flex cursor-pointer items-start gap-3 rounded-xl border-2 px-3 py-2.5", on ? "border-teal-700 bg-teal-50" : "border-navy-100 hover:border-teal-500")}>
                      <input type="checkbox" className="mt-1 h-4 w-4 accent-teal-700" checked={on} onChange={() => toggle(d.name)} />
                      <span>
                        <span className="block font-medium text-navy-950">{d.name}</span>
                        <span className="text-xs text-navy-700">
                          {d.rows} place{d.rows === 1 ? "" : "s"}
                          {d.vacancies ? ` · ${d.vacancies} vacancies` : ""}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
              {filtered.length === 0 && <li className="text-sm text-navy-700">No posts match “{q}”.</li>}
            </ul>
          </Question>

          {chosen.length > 0 && (
            <Question field="postOrder" title="2. Put them in order" hint="Your first choice gets the most points. Use the arrows to move a post up or down.">
              <ol className="space-y-2">
                {chosen.map((p, i) => (
                  <li key={p} className="flex items-center gap-3 rounded-xl border border-navy-100 bg-white px-3 py-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-700 text-sm font-bold text-white">{i + 1}</span>
                    <span className="min-w-0 flex-1 font-medium">{p}</span>
                    <span className="tabular hidden text-sm font-semibold text-teal-800 sm:inline">{pointsFor(i, prefs.postScoring)} points</span>
                    <button type="button" className="rounded-lg p-2 hover:bg-navy-50 disabled:opacity-30" aria-label={`Move ${p} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                      <ArrowUp size={16} />
                    </button>
                    <button type="button" className="rounded-lg p-2 hover:bg-navy-50 disabled:opacity-30" aria-label={`Move ${p} down`} disabled={i === chosen.length - 1} onClick={() => move(i, 1)}>
                      <ArrowDown size={16} />
                    </button>
                    <button type="button" className="rounded-lg p-2 text-red-700 hover:bg-red-50" aria-label={`Remove ${p}`} onClick={() => toggle(p)}>
                      <X size={16} />
                    </button>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-sm text-navy-700">Posts you didn&apos;t pick get 0 points but still appear in your results. NextPlace never decides whether you are eligible for a post.</p>
            </Question>
          )}
        </>
      )}
    </StepPage>
  );
}
