'use client'

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

// Types for the app state
export interface Notification {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
  description?: string
  timestamp: number
}

export interface TrafficStatus {
  status: 'healthy' | 'degraded' | 'down'
  bandwidth: {
    current: number
    peak: number
  }
  connections: number
}

export interface TrafficRoute {
  id: string
  path: string
  status: 'active' | 'inactive' | 'error'
  bandwidth: number
}

export interface RouteLog {
  id: string
  timestamp: number
  route: string
  method: string
  status: number
  duration: number
}

export interface WorkflowSession {
  id: string
  name: string
  status: 'active' | 'completed' | 'failed'
  createdAt: number
  updatedAt: number
}

export interface WorkflowMetrics {
  totalSessions: number
  activeSessions: number
  completedSessions: number
  failedSessions: number
  avgDuration: number
}

// Unified app state
interface AppState {
  // AI System state
  aiSystems: {
    initialized: boolean
    systems: Record<string, boolean>
    lastUpdate: number
  }
  
  // Traffic state
  traffic: {
    status: TrafficStatus | null
    routes: TrafficRoute[]
    logs: RouteLog[]
    lastUpdate: number
  }
  
  // Workflow state
  workflows: {
    activeSession: WorkflowSession | null
    recentSessions: WorkflowSession[]
    metrics: WorkflowMetrics | null
  }
  
  // UI state
  ui: {
    sidebarCollapsed: boolean
    theme: 'light' | 'dark'
    notifications: Notification[]
  }
  
  // Actions
  setAISystems: (systems: AppState['aiSystems']) => void
  setTraffic: (traffic: AppState['traffic']) => void
  setWorkflows: (workflows: AppState['workflows']) => void
  setUI: (ui: Partial<AppState['ui']>) => void
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp'>) => void
  removeNotification: (id: string) => void
  clearNotifications: () => void
}

export const useAppStore = create<AppState>()(
  subscribeWithSelector((set) => ({
    // Initial state
    aiSystems: {
      initialized: false,
      systems: {},
      lastUpdate: 0,
    },
    traffic: {
      status: null,
      routes: [],
      logs: [],
      lastUpdate: 0,
    },
    workflows: {
      activeSession: null,
      recentSessions: [],
      metrics: null,
    },
    ui: {
      sidebarCollapsed: false,
      theme: 'dark',
      notifications: [],
    },
    
    // Actions
    setAISystems: (systems) => set({ aiSystems: systems }),
    setTraffic: (traffic) => set({ traffic }),
    setWorkflows: (workflows) => set({ workflows }),
    setUI: (ui) => set((state) => ({ ui: { ...state.ui, ...ui } })),
    addNotification: (notification) => 
      set((state) => ({ 
        ui: { 
          ...state.ui, 
          notifications: [
            ...state.ui.notifications,
            {
              ...notification,
              id: crypto.randomUUID(),
              timestamp: Date.now(),
            }
          ] 
        } 
      })),
    removeNotification: (id) =>
      set((state) => ({
        ui: {
          ...state.ui,
          notifications: state.ui.notifications.filter(n => n.id !== id)
        }
      })),
    clearNotifications: () =>
      set((state) => ({
        ui: {
          ...state.ui,
          notifications: []
        }
      })),
  }))
)