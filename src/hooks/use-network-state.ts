import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { type NetworkState } from '@/types/offline-sync';

// Global singleton state so all components stay synchronized
let globalNetworkState: NetworkState = {
  isConnected: true,
  isOffline: false,
  connectionType: 'wifi',
  isInternetReachable: true,
};

let manualOfflineOverride: boolean | null = null;
const listeners = new Set<(state: NetworkState) => void>();

function notifyListeners() {
  const current = getEffectiveNetworkState();
  listeners.forEach((listener) => {
    try {
      listener(current);
    } catch {
      // Ignore listener errors
    }
  });
}

function getEffectiveNetworkState(): NetworkState {
  if (manualOfflineOverride !== null) {
    return {
      isConnected: !manualOfflineOverride,
      isOffline: manualOfflineOverride,
      connectionType: manualOfflineOverride ? 'none' : globalNetworkState.connectionType,
      isInternetReachable: !manualOfflineOverride,
    };
  }
  return globalNetworkState;
}

/**
 * Probes internet reachability using a fast lightweight endpoint.
 */
export async function probeNetworkReachability(): Promise<boolean> {
  if (manualOfflineOverride === true) {
    return false;
  }

  // Browser check if available
  if (typeof navigator !== 'undefined' && 'onLine' in navigator && !navigator.onLine) {
    return false;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    // Fast check to Supabase host or public DNS
    const targetUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
      ? `${process.env.EXPO_PUBLIC_SUPABASE_URL}/rest/v1/`
      : 'https://1.1.1.1';

    const res = await fetch(targetUrl, {
      method: 'HEAD',
      signal: controller.signal,
      cache: 'no-store',
    });

    clearTimeout(timeout);
    return res.ok || res.status === 401 || res.status === 404; // 401/404 means network is reached
  } catch {
    return false;
  }
}

/**
 * Manually force offline mode for testing or simulating degraded field operations.
 */
export function setSimulatedOffline(offline: boolean | null) {
  manualOfflineOverride = offline;
  notifyListeners();
}

/**
 * Hook providing reactive network connectivity status and offline state.
 */
export function useNetworkState() {
  const [state, setState] = useState<NetworkState>(getEffectiveNetworkState);
  const isMountedRef = useRef(true);

  const checkConnectivity = useCallback(async (): Promise<boolean> => {
    if (manualOfflineOverride === true) {
      return false;
    }
    const reachable = await probeNetworkReachability();
    if (isMountedRef.current) {
      globalNetworkState = {
        ...globalNetworkState,
        isConnected: reachable,
        isOffline: !reachable,
        isInternetReachable: reachable,
        connectionType: reachable ? 'wifi' : 'none',
      };
      notifyListeners();
    }
    return reachable;
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    listeners.add(setState);

    // Initial check
    void checkConnectivity();

    // Browser online/offline event listeners
    const handleOnline = () => {
      globalNetworkState = {
        ...globalNetworkState,
        isConnected: true,
        isOffline: false,
        isInternetReachable: true,
      };
      notifyListeners();
      void checkConnectivity();
    };

    const handleOffline = () => {
      globalNetworkState = {
        ...globalNetworkState,
        isConnected: false,
        isOffline: true,
        isInternetReachable: false,
        connectionType: 'none',
      };
      notifyListeners();
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }

    // Periodic heartbeat check (every 10s)
    const interval = setInterval(() => {
      void checkConnectivity();
    }, 10000);

    return () => {
      isMountedRef.current = false;
      listeners.delete(setState);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
      clearInterval(interval);
    };
  }, [checkConnectivity]);

  return {
    ...state,
    checkConnectivity,
    setSimulatedOffline,
    isSimulated: manualOfflineOverride !== null,
  };
}
