"use client";
import { createContext, useContext } from "react";
export type ProjectInfo = { project: { id: string; name: string; status: string; isDemo: boolean; previewFrozenAt: string | null; previewBasis: Record<string, unknown> | null; createdAt: string }; premium: boolean };
export const ProjectContext = createContext<{ info: ProjectInfo | null; reload: () => void }>({ info: null, reload: () => {} });
export const useProject = () => useContext(ProjectContext);
