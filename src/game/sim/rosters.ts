import type { Role } from './types';

export interface RosterEntry {
  num: string;
  name: string;
  role: Role;
  /** Kick-off formation spot (x across, z along the pitch) in the team's own half */
  x: number;
  z: number;
}

// Blue Lions, 4-3-3, defending the goal at +z. Index 0 must be the striker
// who takes kick-offs.
export const HOME_ROSTER: RosterEntry[] = [
  { num: '9', name: 'Striker', role: 'ST', x: 0, z: 6 },
  { num: '7', name: 'Left Winger', role: 'LW', x: -20, z: 8 },
  { num: '11', name: 'Right Winger', role: 'RW', x: 20, z: 8 },
  { num: '8', name: 'Playmaker', role: 'CM', x: 0, z: 22 },
  { num: '6', name: 'Left Midfielder', role: 'LM', x: -13, z: 26 },
  { num: '10', name: 'Right Midfielder', role: 'RM', x: 13, z: 26 },
  { num: '3', name: 'Left Back', role: 'LB', x: -21, z: 36 },
  { num: '4', name: 'Centre Back', role: 'CB', x: -7, z: 40 },
  { num: '5', name: 'Centre Back', role: 'CB', x: 7, z: 40 },
  { num: '2', name: 'Right Back', role: 'RB', x: 21, z: 36 },
  { num: '1', name: 'Keeper', role: 'GK', x: 0, z: 50.5 },
];

// Red Eagles, 4-4-2, defending the goal at -z (their right is world -x).
export const AWAY_ROSTER: RosterEntry[] = [
  { num: '9', name: 'Forward', role: 'ST', x: -6, z: -7 },
  { num: '10', name: 'Forward', role: 'ST', x: 6, z: -9 },
  { num: '7', name: 'Right Midfielder', role: 'RM', x: -21, z: -22 },
  { num: '6', name: 'Midfielder', role: 'CM', x: -7, z: -25 },
  { num: '8', name: 'Midfielder', role: 'CM', x: 7, z: -25 },
  { num: '11', name: 'Left Midfielder', role: 'LM', x: 21, z: -22 },
  { num: '2', name: 'Right Back', role: 'RB', x: -21, z: -36 },
  { num: '4', name: 'Centre Back', role: 'CB', x: -7, z: -40 },
  { num: '5', name: 'Centre Back', role: 'CB', x: 7, z: -40 },
  { num: '3', name: 'Left Back', role: 'LB', x: 21, z: -36 },
  { num: '1', name: 'Keeper', role: 'GK', x: 0, z: -50.5 },
];
