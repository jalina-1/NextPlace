"use client";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { MessageCircle, PanelRightClose, X } from "lucide-react";
import { api } from "@/lib/client/api";
import { ProjectContext, type ProjectInfo } from "@/lib/client/project";
import { useShell } from "@/lib/client/shell";
import { CHAT_STEPS, type StepKey } from "@/lib/client/steps";
import { Assistant } from "@/components/Assistant";
import { cx } from "@/components/ui";

const CHAT_KEY = "np-chat-open";

export default function ProjectLayout({ children }: { children: ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const path = usePathname();
  const step = path.split("/")[3] as StepKey | undefined;
  const { setProject } = useShell();
  const [info, setInfo] = useState<ProjectInfo | null>(null);
  const [error, setError] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [mobileChat, setMobileChat] = useState(false);
  const reload = () =>
    api<ProjectInfo>(`/api/projects/${id}`)
      .then((i) => {
        setInfo(i);
        setProject({ id: i.project.id, name: i.project.name, isDemo: i.project.isDemo, premium: i.premium, previewFrozen: !!i.project.previewFrozenAt });
      })
      .catch(() => setError(true));
  useEffect(() => {
    reload();
    try {
      setChatOpen(localStorage.getItem(CHAT_KEY) !== "0");
    } catch {
      /* ignore */
    }
    return () => setProject(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const toggleChat = (v: boolean) => {
    setChatOpen(v);
    try {
      localStorage.setItem(CHAT_KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  };
  if (error)
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 text-center text-navy-800">
        Project not found. <Link className="underline" href="/dashboard">Back to my projects</Link>
      </div>
    );
  const withChat = !!step && CHAT_STEPS.includes(step);
  // Pages listen for this to reload after the user applies an assistant proposal.
  const onApplied = () => window.dispatchEvent(new Event("np-proposal-applied"));
  return (
    <ProjectContext.Provider value={{ info, reload }}>
      <div className={cx("flex min-h-full", withChat && "lg:h-[calc(100vh-61px)]")}>
        <div className={cx("min-w-0 flex-1 px-4 py-8 sm:px-8", withChat && "lg:overflow-y-auto")}>
          <div className="mx-auto max-w-5xl">{children}</div>
        </div>
        {withChat && chatOpen && (
          <aside className="hidden w-[380px] shrink-0 flex-col border-l border-navy-100 bg-white lg:flex" aria-label="Assistant">
            <div className="flex items-center justify-between border-b border-navy-100 px-4 py-3">
              <span className="eyebrow">Your assistant</span>
              <button className="rounded-lg p-1.5 hover:bg-navy-50" onClick={() => toggleChat(false)} aria-label="Hide assistant" title="Hide assistant">
                <PanelRightClose size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 p-4">
              <Assistant projectId={id} onApplied={onApplied} />
            </div>
          </aside>
        )}
      </div>
      {withChat && (
        <>
          <button
            onClick={() => (window.matchMedia("(min-width: 1024px)").matches ? toggleChat(true) : setMobileChat(true))}
            className={cx("fixed bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-teal-700 text-white shadow-lg hover:bg-teal-800", chatOpen && "lg:hidden")}
            aria-label="Open assistant"
          >
            <MessageCircle size={24} />
          </button>
          {mobileChat && (
            <div className="fixed inset-0 z-40 flex flex-col bg-white lg:hidden" role="dialog" aria-modal="true" aria-label="Assistant">
              <div className="flex items-center justify-between border-b border-navy-100 px-4 py-3">
                <span className="eyebrow">Your assistant</span>
                <button className="rounded-lg p-2 hover:bg-navy-50" onClick={() => setMobileChat(false)} aria-label="Close assistant">
                  <X size={20} />
                </button>
              </div>
              <div className="min-h-0 flex-1 p-4">
                <Assistant projectId={id} onApplied={onApplied} />
              </div>
            </div>
          )}
        </>
      )}
    </ProjectContext.Provider>
  );
}
