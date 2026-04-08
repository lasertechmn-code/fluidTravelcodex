export type EventKind = 'hard' | 'flexible';
export type EventLane = 'top' | 'bottom';

export type TimelineEvent = {
  id: string;
  title: string;
  notes: string;
  location: string;
  color: string;
  kind: EventKind;
  lane: EventLane;
  durationMin: number;
  startUtc: string;
  endUtc: string;
  preferredStartUtc?: string;
};

export type Trip = {
  id: string;
  title: string;
  subtitle: string;
  startUtc: string;
  endUtc: string;
  displayTimezone: string;
  events: TimelineEvent[];
};

export type BubblePosition = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
};
