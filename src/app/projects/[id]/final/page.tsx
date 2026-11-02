"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api, ApiError, errMsg } from "@/lib/client/api";
import { useProject } from "@/lib/client/project";
import { Alert, Badge, Button, ButtonLink, Card, Empty, Input, PremiumBadge, ScoreValue, Spinner, Tabs, cx } from "@/components/ui";
import { CompareTable } from "@/components/CompareTable";
import { Assistant } from "@/components/Assistant";
import type { ResultRow } from "@/lib/client/types";

type Final = { items: string[]; excluded: string[]; revision: number; status: "editing" | "finalized"; finalizedRevisionId: string | null; validation: string[]; revisions: { id: string; number: number; createdAt: string }[] };
type Snap = { items: string[]; excluded: string[] };
type SaveState = "saved" | "unsaved" | "saving" | "conflict" | "error";

const BACKUP_KEY = (id: string) => `np-final-draft-${id}`;

function Row({ id, pos, row, onMove, onMoveTo, onExclude, onPin, pinned, swapSel, onSwapSel, disabled, highlight }: {
  id: string; pos: number; row: ResultRow | undefined; onMove: (d: number) => void; onMoveTo: (n: number) => void; onExclude: () => void; onPin: () => void; pinned: boolean; swapSel: boolean; onSwapSel: () => void; disabled: boolean; highlight: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const [to, setTo] = useState("");
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cx("flex flex-wrap items-center gap-2 rounded-lg border bg-white px-2 py-2", isDragging ? "z-10 border-teal-600 shadow-lg" : "border-navy-100", highlight && "ring-2 ring-amber-300", swapSel && "border-teal-600 bg-teal-50")}>
      <button {...attributes} {...listeners} disabled={disabled} className="cursor-grab rounded px-1 text-navy-700 hover:bg-navy-50 disabled:cursor-default" aria-label={`Drag ${row?.institution ?? "entry"}. Use space then arrow keys to move.`}>⋮⋮</button>
      <span className="tabular w-10 text-right font-semibold text-teal-800" aria-label={`Preference rank ${pos}`}>{pos}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-navy-900">{row?.institution ?? "Unknown"} <span className="font-normal text-navy-700">— {row?.designation}</span></p>
        <p className="text-xs text-navy-700">INDEX {row?.index ?? "—"} · {row?.district ?? "?"} · system rank {row?.systemRank ?? "—"}</p>
      </div>
      <div className="w-24 text-right"><ScoreValue score={row?.score ?? null} status={row?.status ?? "unscored"} /></div>
      {!disabled && (
        <div className="flex flex-wrap items-center gap-1">
          <Button size="sm" variant="ghost" aria-label="Move up" onClick={() => onMove(-1)}>↑</Button>
          <Button size="sm" variant="ghost" aria-label="Move down" onClick={() => onMove(1)}>↓</Button>
          <form onSubmit={(e) => { e.preventDefault(); if (to) onMoveTo(Number(to)); setTo(""); }} className="flex items-center gap-1">
            <Input aria-label="Move to position" placeholder="#" inputMode="numeric" className="w-14 py-1" value={to} onChange={(e) => setTo(e.target.value.replace(/\D/g, ""))} />
            <Button size="sm" variant="secondary" type="submit">Go</Button>
          </form>
          <Button size="sm" variant={swapSel ? "primary" : "ghost"} aria-pressed={swapSel} onClick={onSwapSel}>Swap</Button>
          <Button size="sm" variant={pinned ? "primary" : "ghost"} aria-pressed={pinned} onClick={onPin}>Pin</Button>
          <Button size="sm" variant="ghost" className="text-red-700" onClick={onExclude}>Exclude</Button>
        </div>
      )}
    </li>
  );
}

export default function FinalPage() {
  const { id } = useParams<{ id: string }>();
  const { info } = useProject();
  const [final, setFinal] = useState<Final | null>(null);
  const [rows, setRows] = useState<Map<string, ResultRow>>(new Map());
  const [cur, setCur] = useState<Snap>({ items: [], excluded: [] });
  const [past, setPast] = useState<Snap[]>([]);
  const [future, setFuture] = useState<Snap[]>([]);
  const [save, setSave] = useState<SaveState>("saved");
  const [error, setError] = useState<string | null>(null);
  const [premiumErr, setPremiumErr] = useState(false);
  const [q, setQ] = useState("");
  const [pinned, setPinned] = useState<string[]>([]);
  const [swapA, setSwapA] = useState<string | null>(null);
  const [tab, setTab] = useState<"list" | "compare" | "assistant">("list");
  const [restore, setRestore] = useState<Snap | null>(null);
  const revisionRef = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const f = await api<Final>(`/api/projects/${id}/final`);
      const r = await api<{ rows: ResultRow[] }>(`/api/projects/${id}/results?view=all&sort=rank`);
      setRows(new Map(r.rows.map((x) => [x.id, x])));
      setFinal(f);
      revisionRef.current = f.revision;
      setCur({ items: f.items, excluded: f.excluded });
      setPast([]);
      setFuture([]);
      setSave("saved");
      setPinned((p) => (p.length ? p : f.items.slice(0, 3)));
      try {
        const raw = localStorage.getItem(BACKUP_KEY(id));
        if (raw) {
          const b = JSON.parse(raw) as Snap & { revision: number };
          if (b.revision === f.revision && JSON.stringify(b.items) !== JSON.stringify(f.items)) setRestore({ items: b.items, excluded: b.excluded });
          else localStorage.removeItem(BACKUP_KEY(id));
        }
      } catch {
        /* storage unavailable */
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 402) setPremiumErr(true);
      else setError(errMsg(e));
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  const persist = useCallback(
    async (snap: Snap) => {
      setSave("saving");
      try {
        const r = await api<{ revision: number }>(`/api/projects/${id}/final`, { method: "PUT", json: { expectedRevision: revisionRef.current, ...snap } });
        revisionRef.current = r.revision;
        setFinal((f) => (f ? { ...f, revision: r.revision } : f));
        setSave("saved");
        try { localStorage.removeItem(BACKUP_KEY(id)); } catch { /* ignore */ }
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) setSave("conflict");
        else {
          setSave("error");
          setError(errMsg(e));
        }
      }
    },
    [id],
  );

  function commit(next: Snap) {
    setPast((p) => [...p.slice(-99), cur]);
    setFuture([]);
    setCur(next);
    setSave("unsaved");
    try { localStorage.setItem(BACKUP_KEY(id), JSON.stringify({ ...next, revision: revisionRef.current })); } catch { /* ignore */ }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => persist(next), 700);
  }
  function undo() {
    const prev = past[past.length - 1];
    if (!prev) return;
    setPast(past.slice(0, -1));
    setFuture([cur, ...future]);
    setCur(prev);
    setSave("unsaved");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => persist(prev), 700);
  }
  function redo() {
    const nxt = future[0];
    if (!nxt) return;
    setFuture(future.slice(1));
    setPast([...past, cur]);
    setCur(nxt);
    setSave("unsaved");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => persist(nxt), 700);
  }
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (save === "unsaved" || save === "saving") e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [save]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const finalized = final?.status === "finalized";
  const filtering = q.trim().length > 0;
  const match = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rid: string) => {
      if (!t) return true;
      const r = rows.get(rid);
      return [r?.institution, r?.designation, r?.district, r?.index].join(" ").toLowerCase().includes(t);
    };
  }, [q, rows]);

  if (premiumErr)
    return (
      <Empty title="Final list editing is part of full access">
        <p className="mb-3">You can still review your three preview options in Results.</p>
        <div className="flex justify-center gap-2"><ButtonLink href={`/payment?project=${id}`}>Unlock full access</ButtonLink><PremiumBadge /></div>
      </Empty>
    );
  if (error && !final) return <Alert tone="error">{error}</Alert>;
  if (!final) return <Spinner />;

  const move = (rid: string, to: number) => {
    const from = cur.items.indexOf(rid);
    const t = Math.max(0, Math.min(cur.items.length - 1, to));
    if (from < 0 || from === t) return;
    commit({ ...cur, items: arrayMove(cur.items, from, t) });
  };
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    move(String(e.active.id), cur.items.indexOf(String(e.over.id)));
  };
  const doSwap = (rid: string) => {
    if (!swapA) return setSwapA(rid);
    if (swapA === rid) return setSwapA(null);
    const a = cur.items.indexOf(swapA);
    const b = cur.items.indexOf(rid);
    const items = [...cur.items];
    [items[a], items[b]] = [items[b], items[a]];
    commit({ ...cur, items });
    setSwapA(null);
  };
  async function action(a: "reset" | "finalize" | "reopen") {
    if (a === "reset" && !confirm("Replace your manual order with the current system ranking? You can undo this with Undo before leaving the page.")) return;
    if (a === "finalize" && save !== "saved") return alert("Wait until your changes are saved.");
    try {
      await api(`/api/projects/${id}/final`, { method: "POST", json: { action: a, expectedRevision: revisionRef.current } });
      await load();
    } catch (e) {
      setError(errMsg(e));
    }
  }

  const saveLabel: Record<SaveState, React.ReactNode> = {
    saved: <Badge tone="green">All changes saved</Badge>,
    unsaved: <Badge tone="amber">Unsaved changes…</Badge>,
    saving: <Badge tone="amber">Saving…</Badge>,
    conflict: <Badge tone="red">Newer version elsewhere</Badge>,
    error: <Badge tone="red">Save failed</Badge>,
  };

  const listPanel = (
    <Card className="h-full" title={<span>Final preference order <span className="text-sm font-normal text-navy-700">({cur.items.length} entries)</span></span>} actions={saveLabel[save]}>
      {save === "conflict" && <div className="mb-3"><Alert tone="error" title="This list was changed in another tab or device">Your latest change was not saved. <Button size="sm" variant="secondary" onClick={load}>Reload latest version</Button></Alert></div>}
      {restore && (
        <div className="mb-3">
          <Alert tone="warning" title="Unsaved changes found from your last visit">
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={() => { commit(restore); setRestore(null); }}>Restore them</Button>
              <Button size="sm" variant="ghost" onClick={() => { try { localStorage.removeItem(BACKUP_KEY(id)); } catch { /* ignore */ } setRestore(null); }}>Discard</Button>
            </div>
          </Alert>
        </div>
      )}
      {finalized ? (
        <Alert tone="success" title="Finalized">
          This order is locked as an immutable revision. <Link className="underline" href={`/projects/${id}/export`}>Download it</Link> or <button className="underline" onClick={() => action("reopen")}>reopen for editing</button> (creates a new editing revision; the finalized one is kept).
        </Alert>
      ) : (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={undo} disabled={!past.length}>Undo</Button>
          <Button size="sm" variant="secondary" onClick={redo} disabled={!future.length}>Redo</Button>
          <Button size="sm" variant="ghost" onClick={() => action("reset")}>Reset to system ranking</Button>
          <Input aria-label="Search the list" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} className="w-40 py-1" />
          {swapA && <Badge tone="teal">Select another entry to swap</Badge>}
        </div>
      )}
      <p className="mb-2 text-xs text-navy-700">Original INDEX values are never changed; your order is exported as a separate Preference Rank. {filtering && "Dragging is disabled while searching."}</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={cur.items} strategy={verticalListSortingStrategy}>
          <ol className="max-h-[70vh] space-y-1.5 overflow-y-auto pr-1">
            {cur.items.map((rid, i) =>
              filtering && !match(rid) ? null : (
                <Row
                  key={rid}
                  id={rid}
                  pos={i + 1}
                  row={rows.get(rid)}
                  disabled={finalized || filtering}
                  highlight={filtering && match(rid)}
                  onMove={(d) => move(rid, i + d)}
                  onMoveTo={(n) => move(rid, n - 1)}
                  onExclude={() => commit({ items: cur.items.filter((x) => x !== rid), excluded: [...cur.excluded, rid] })}
                  onPin={() => setPinned((p) => (p.includes(rid) ? p.filter((x) => x !== rid) : [...p, rid].slice(-8)))}
                  pinned={pinned.includes(rid)}
                  swapSel={swapA === rid}
                  onSwapSel={() => doSwap(rid)}
                />
              ),
            )}
          </ol>
        </SortableContext>
      </DndContext>
      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-medium text-navy-900">Excluded entries ({cur.excluded.length}) — kept for review, not in your list</summary>
        <ul className="mt-2 space-y-1">
          {cur.excluded.map((rid) => {
            const r = rows.get(rid);
            return (
              <li key={rid} className="flex items-center justify-between gap-2 rounded bg-navy-50 px-2 py-1.5 text-sm">
                <span>{r?.institution} — {r?.designation} <span className="text-xs text-navy-700">({r?.status === "excluded" ? r.exclusionReasons.join("; ") : r?.status})</span></span>
                {!finalized && <Button size="sm" variant="secondary" onClick={() => commit({ items: [...cur.items, rid], excluded: cur.excluded.filter((x) => x !== rid) })}>Include at end</Button>}
              </li>
            );
          })}
        </ul>
      </details>
    </Card>
  );
  const comparePanel = (
    <Card className="h-full" title="Pinned comparison">
      {pinned.length === 0 ? <p className="text-sm text-navy-700">Pin entries from the list to compare them here.</p> : <CompareTable compact rows={pinned.map((p) => rows.get(p)).filter((x): x is ResultRow => !!x)} />}
    </Card>
  );
  const assistantPanel = (
    <Card>
      <div className="h-[28rem]"><Assistant projectId={id} onApplied={load} /></div>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-navy-700">Revision {final.revision}{info?.project.isDemo ? " · demo project" : ""}</p>
        {!finalized && <ButtonLink href={`/projects/${id}/export`}>Review & finalize</ButtonLink>}
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="lg:hidden">
        <Tabs label="Editor panels" value={tab} onChange={setTab} items={[{ value: "list", label: "List" }, { value: "compare", label: "Compare" }, { value: "assistant", label: "Assistant" }]} />
        <div className="mt-3">{tab === "list" ? listPanel : tab === "compare" ? comparePanel : assistantPanel}</div>
      </div>
      <div className="hidden gap-4 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="space-y-4">{comparePanel}</div>
        <div>{listPanel}</div>
      </div>
      <div className="hidden lg:block">{assistantPanel}</div>
    </div>
  );
}
