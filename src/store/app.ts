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
}

export const useApp = create<AppState>()(
  persist(
    (set) => ({
      currentProjectId: null,
      view: 'dashboard',
      activeNodeId: null,
      purchaseStageFilter: null,
      setProject: (id) => set({ currentProjectId: id, activeNodeId: null }),
      setView: (v) => set({ view: v }),
      setActiveNode: (id) => set({ activeNodeId: id }),
      setPurchaseStageFilter: (s) => set({ purchaseStageFilter: s }),
      jumpToPurchasesByStage: (stage) =>
        set({ view: 'purchase', purchaseStageFilter: stage }),
    }),
    { name: 'zhuji-app-state' },
  ),
)
