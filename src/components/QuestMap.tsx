import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { GeoFix, Quest } from '../lib/types';

const TILE_URL = (import.meta.env.VITE_MAP_TILE_URL as string | undefined) || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const COLORS = { quest: '#b2f27d', merchant: '#f5c967', done: '#6f7d72', you: '#6fc3ff' };

type Props = {
  center: { lat: number; lng: number }; player: GeoFix | null; quests: Quest[];
  selectedId?: string | null; onSelect?: (id: string) => void; interactive?: boolean; className?: string; fit?: boolean;
};

export default function QuestMap({ center, player, quests, selectedId, onSelect, interactive = true, className = '', fit = true }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const lastSig = useRef('');
  const select = useRef(onSelect);
  select.current = onSelect;

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { center: [center.lat, center.lng], zoom: 15, zoomControl: interactive, dragging: interactive, scrollWheelZoom: false, doubleClickZoom: interactive, touchZoom: interactive, boxZoom: false, keyboard: interactive });
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    const t = window.setTimeout(() => m.invalidateSize(), 60);
    return () => { window.clearTimeout(t); m.remove(); map.current = null; layer.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive]);

  const placed = quests.filter(q => q.latitude != null && q.longitude != null);
  const signature = placed.map(q => q.id + (q.claimed ? 'c' : '')).join('|') + (player ? `@${player.lat.toFixed(4)},${player.lng.toFixed(4)}` : '') + `~${center.lat.toFixed(3)},${center.lng.toFixed(3)}`;

  useEffect(() => {
    const m = map.current, g = layer.current; if (!m || !g) return;
    g.clearLayers();
    const points: L.LatLngExpression[] = [];
    placed.forEach(q => {
      const ll: L.LatLngExpression = [q.latitude!, q.longitude!];
      points.push(ll);
      const color = q.claimed ? COLORS.done : q.merchant_name ? COLORS.merchant : COLORS.quest;
      L.circle(ll, { radius: q.geofence_radius_m ?? 80, color, weight: 1, opacity: 0.55, fillColor: color, fillOpacity: selectedId === q.id ? 0.22 : 0.08, interactive: false }).addTo(g);
      const dot = L.circleMarker(ll, { radius: selectedId === q.id ? 12 : 8, color: '#101411', weight: 3, fillColor: color, fillOpacity: 1 }).addTo(g);
      dot.bindTooltip(q.title, { direction: 'top', offset: [0, -8] });
      dot.on('click', () => select.current?.(q.id));
    });
    if (player) {
      L.circle([player.lat, player.lng], { radius: Math.max(player.accuracy, 8), color: COLORS.you, weight: 1, fillColor: COLORS.you, fillOpacity: 0.12, interactive: false }).addTo(g);
      L.circleMarker([player.lat, player.lng], { radius: 7, color: '#fff', weight: 3, fillColor: COLORS.you, fillOpacity: 1, interactive: false }).addTo(g);
      points.push([player.lat, player.lng]);
    }
    const refit = lastSig.current !== signature;
    lastSig.current = signature;
    if (refit) {
      if (fit && points.length > 1) m.fitBounds(L.latLngBounds(points), { padding: [34, 34], maxZoom: 17 });
      else if (points.length === 1) m.setView(points[0], 16);
      else m.setView([center.lat, center.lng], 15);
    }
    // selecting a quest restyles markers but must not move the viewport
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, selectedId, fit]);

  return <div ref={el} className={`quest-map ${className}`} role="region" aria-label="Map of nearby quests. The same quests are listed below the map."/>;
}
