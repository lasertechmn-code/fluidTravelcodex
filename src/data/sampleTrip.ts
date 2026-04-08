import type { TimelineEvent, Trip } from '../types';
import { makeUtcIso, minutesToMs } from '../utils/time';
import { rescheduleTrip } from '../utils/scheduler';

let idCounter = 0;

function nextId() {
  idCounter += 1;
  return `event-${idCounter}`;
}

function createEvent(input: Omit<TimelineEvent, 'id' | 'endUtc'>) {
  return {
    ...input,
    id: nextId(),
    endUtc: new Date(new Date(input.startUtc).getTime() + minutesToMs(input.durationMin)).toISOString(),
  };
}

export function createDemoTrip(): Trip {
  idCounter = 0;

  const trip: Trip = {
    id: 'trip-kyoto',
    title: 'Kyoto Drift',
    subtitle: 'A fluid travel board where plans settle into place like buoyant glass.',
    startUtc: makeUtcIso(2026, 4, 12, 6, 0),
    endUtc: makeUtcIso(2026, 4, 17, 23, 0),
    displayTimezone: 'America/Chicago',
    events: [
      createEvent({
        title: 'Arrival Flight',
        notes: 'Hard anchor. Lands the whole trip and sets the rhythm for the first day.',
        location: 'Osaka Kansai',
        color: '#ff8a5b',
        kind: 'hard',
        lane: 'top',
        durationMin: 150,
        startUtc: makeUtcIso(2026, 4, 12, 7, 0),
      }),
      createEvent({
        title: 'Hotel Check-in',
        notes: 'Front desk opens the room window right after noon.',
        location: 'Gion',
        color: '#3db7a7',
        kind: 'hard',
        lane: 'bottom',
        durationMin: 60,
        startUtc: makeUtcIso(2026, 4, 12, 13, 30),
      }),
      createEvent({
        title: 'Lantern Alley Walk',
        notes: 'Flexible golden-hour wander for photos and a slow reset.',
        location: 'Pontocho',
        color: '#ffcc66',
        kind: 'flexible',
        lane: 'top',
        durationMin: 95,
        startUtc: makeUtcIso(2026, 4, 12, 16, 0),
        preferredStartUtc: makeUtcIso(2026, 4, 12, 16, 0),
      }),
      createEvent({
        title: 'Tea House Pause',
        notes: 'Quiet pocket for tea, sketching, and decompressing.',
        location: 'Higashiyama',
        color: '#8fd694',
        kind: 'flexible',
        lane: 'bottom',
        durationMin: 70,
        startUtc: makeUtcIso(2026, 4, 13, 2, 0),
        preferredStartUtc: makeUtcIso(2026, 4, 13, 2, 0),
      }),
      createEvent({
        title: 'Chef Counter Dinner',
        notes: 'Hard reservation with almost no wiggle room.',
        location: 'Gion',
        color: '#ff6f91',
        kind: 'hard',
        lane: 'top',
        durationMin: 110,
        startUtc: makeUtcIso(2026, 4, 13, 10, 30),
      }),
      createEvent({
        title: 'Temple Texture Hunt',
        notes: 'A flexible visual scavenger hunt for details, shadows, and stone patterns.',
        location: 'Kiyomizu-dera',
        color: '#7ea7ff',
        kind: 'flexible',
        lane: 'top',
        durationMin: 120,
        startUtc: makeUtcIso(2026, 4, 13, 5, 0),
        preferredStartUtc: makeUtcIso(2026, 4, 13, 5, 0),
      }),
      createEvent({
        title: 'Market Color Sweep',
        notes: 'Collect flavors, textures, and quick gifts.',
        location: 'Nishiki Market',
        color: '#ff9f1c',
        kind: 'flexible',
        lane: 'bottom',
        durationMin: 80,
        startUtc: makeUtcIso(2026, 4, 14, 3, 30),
        preferredStartUtc: makeUtcIso(2026, 4, 14, 3, 30),
      }),
      createEvent({
        title: 'Riverbank Portrait Session',
        notes: 'Soft portrait window when the light gets silver and calm.',
        location: 'Kamogawa',
        color: '#4cc9f0',
        kind: 'flexible',
        lane: 'top',
        durationMin: 90,
        startUtc: makeUtcIso(2026, 4, 14, 9, 30),
        preferredStartUtc: makeUtcIso(2026, 4, 14, 9, 30),
      }),
      createEvent({
        title: 'Night Garden Entry',
        notes: 'Timed ticket. Strong anchor, dreamy payoff.',
        location: 'Shoren-in',
        color: '#f25f5c',
        kind: 'hard',
        lane: 'bottom',
        durationMin: 75,
        startUtc: makeUtcIso(2026, 4, 15, 11, 0),
      }),
      createEvent({
        title: 'Indigo Paper Workshop',
        notes: 'A tactile making block that can drift around the anchors.',
        location: 'Northern Kyoto',
        color: '#5dd39e',
        kind: 'flexible',
        lane: 'bottom',
        durationMin: 105,
        startUtc: makeUtcIso(2026, 4, 15, 6, 0),
        preferredStartUtc: makeUtcIso(2026, 4, 15, 6, 0),
      }),
      createEvent({
        title: 'Slow Breakfast Window',
        notes: 'A deliberately spacious morning bubble.',
        location: 'Hotel Lounge',
        color: '#ffd166',
        kind: 'flexible',
        lane: 'top',
        durationMin: 60,
        startUtc: makeUtcIso(2026, 4, 16, 0, 30),
        preferredStartUtc: makeUtcIso(2026, 4, 16, 0, 30),
      }),
    ],
  };

  return rescheduleTrip(trip);
}
