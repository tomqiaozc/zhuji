import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type ViewName = 'dashboard' | 'node' | 'purchase' | 'timeline' | 'settings'

interface AppState {
  currentProjectId: string | null
  view: ViewName
  activeNodeId: string | null
  purchaseStageFilter: string | null
  setProject: (id: string | null) => void
  setView: (v: ViewName) => void
  setActiveNode: (id: string | null) => void
  setPurchaseStageFilter: (s: string | null) => void
  jumpToPurchasesByStage: (stage: string) => void
  /**
   * Wipe persisted UI state. Call on logout / 401 — leaving the previous
   * user's `currentProjectId` behind makes the next account boot land on
   * "loading…" forever (the project belongs to a different user, so
   * `useLiveQuery` never resolves a row).
   */
  reset: () => void
}

const INITIAL: Pick<
  AppState,
  'currentProjectId' | 'view' | 'activeNodeId' | 'purchaseStageFilter'
> = {
  currentProjectId: null,
  view: 'dashboard',
  activeNodeId: null,
  purchaseStageFilter: null,
}

export const useApp = create<AppState>()(
  persist(
    (set) => ({
      ...INITIAL,
      setProject: (id) => set({ currentProjectId: id, activeNodeId: null }),
      setView: (v) => set({ view: v }),
      setActiveNode: (id) => set({ activeNodeId: id }),
      setPurchaseStageFilter: (s) => set({ purchaseStageFilter: s }),
      jumpToPurchasesByStage: (stage) => set({ view: 'purchase', purchaseStageFilter: stage }),
      reset: () => set({ ...INITIAL }),
    }),
    { name: 'zhuji-app-state' },
  ),
)
