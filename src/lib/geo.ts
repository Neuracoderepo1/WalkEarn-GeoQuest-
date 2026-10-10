import { useCallback, useEffect, useRef, useState } from 'react';
import type { GeoFix } from './types';

const num = (v: unknown, fallback: number) => { const n = Number(v); return Number.isFinite(n) && v !== '' && v != null ? n : fallback; };
/** Map center used until the player shares a location. Override per pilot with VITE_MAP_CENTER_LAT / _LNG. */
export const DEFAULT_CENTER = {
  lat: num(import.meta.env.VITE_MAP_CENTER_LAT, 5.6037),
  lng: num(import.meta.env.VITE_MAP_CENTER_LNG, -0.187),
};
export const DEFAULT_AREA_LABEL = (import.meta.env.VITE_MAP_AREA_LABEL as string | undefined) || 'the pilot area';

export function formatDistance(m: number | undefined): string {
  if (m == null) return 'Walk to location';
  if (m < 950) return `${Math.max(10, Math.round(m / 10) * 10)} m walk`;
  return `${(m / 1000).toFixed(1)} km away`;
}

const LEVELS = ['Neighborhood Scout', 'Trail Finder', 'Street Cartographer', 'Local Legend'];
export function levelFor(xp: number) {
  const level = Math.floor(Math.max(0, xp) / 1000) + 1;
  return { level, title: LEVELS[Math.min(level - 1, LEVELS.length - 1)], into: xp % 1000, next: 1000, pct: Math.round(((xp % 1000) / 1000) * 100) };
}

export type GeoStatus = 'idle' | 'locating' | 'ready' | 'denied' | 'unavailable';

/**
 * Location is requested only when the player asks (or has already granted permission),
 * never on a cold page load. A fresh single fix is used for every claim.
 */
export function useGeolocation() {
  const [fix, setFix] = useState<GeoFix | null>(null);
  const [status, setStatus] = useState<GeoStatus>('idle');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const locate = useCallback((): Promise<GeoFix | null> => new Promise(resolve => {
    if (!('geolocation' in navigator)) { setStatus('unavailable'); resolve(null); return; }
    setStatus('locating');
    navigator.geolocation.getCurrentPosition(
      p => {
        const next = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
        if (mounted.current) { setFix(next); setStatus('ready'); }
        resolve(next);
      },
      err => { if (mounted.current) setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'); resolve(null); },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  }), []);

  useEffect(() => {
    if (!('permissions' in navigator)) return;
    navigator.permissions.query({ name: 'geolocation' as PermissionName })
      .then(s => { if (s.state === 'granted') void locate(); }).catch(() => undefined);
  }, [locate]);

  return { fix, status, locate };
}

export function distanceBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000, rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
