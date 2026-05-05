import { useState } from 'react'

export function useOptimisticUpdate<T>() {
  const [pendingUpdates, setPendingUpdates] = useState<Map<string, T>>(new Map())
  
  const updateOptimistically = (key: string, value: T) => {
    setPendingUpdates(prev => new Map(prev).set(key, value))
  }
  
  const confirmUpdate = (key: string, serverValue: T) => {
    setPendingUpdates(prev => {
      const next = new Map(prev)
      next.delete(key)
      return next
    })
    return serverValue
  }
  
  const rollbackUpdate = (key: string) => {
    setPendingUpdates(prev => {
      const next = new Map(prev)
      next.delete(key)
      return next
    })
  }
  
  const getValue = (key: string, currentValue: T) => {
    return pendingUpdates.get(key) ?? currentValue
  }
  
  return {
    updateOptimistically,
    confirmUpdate,
    rollbackUpdate,
    getValue,
    hasPending: (key: string) => pendingUpdates.has(key),
    clearAll: () => setPendingUpdates(new Map()),
  }
}