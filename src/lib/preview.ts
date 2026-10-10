import { DEFAULT_CENTER } from './geo';
import type { Quest } from './types';

// Illustrative content for when no backend is connected. Preview quests never issue XP or rewards.
const at = (dLat: number, dLng: number) => ({ latitude: DEFAULT_CENTER.lat + dLat, longitude: DEFAULT_CENTER.lng + dLng, geofence_radius_m: 80 });
export const previewQuests: Quest[] = [
  { id: 'q1', title: 'The Cornerstone', description: 'Find a local favorite and discover a new corner of your neighborhood.', category: 'Explore', xp_reward: 120, distance_label: '450 m walk', location_name: 'Main Street', merchant_name: 'Sample Coffee Co.', reward_label: 'Free size upgrade', ...at(0.0035, 0.002) },
  { id: 'q2', title: 'Green Pause', description: 'Take the scenic route. Find a calm spot, pause, and collect your daily discovery.', category: 'Collect', xp_reward: 80, distance_label: '650 m walk', location_name: 'Community Garden', reward_label: '80 XP', ...at(-0.0025, 0.005) },
  { id: 'q3', title: 'Local Legend', description: 'Visit a participating neighborhood business and unlock a local reward.', category: 'Local', xp_reward: 180, distance_label: '800 m walk', location_name: 'Market Row', merchant_name: 'Sample Bowl Kitchen', reward_label: '10% off your order', ...at(0.006, -0.003) },
];
