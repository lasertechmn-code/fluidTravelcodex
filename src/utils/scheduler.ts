import type { TimelineEvent, Trip } from '../types';
import { clamp, minutesToMs } from './time';

export type TripDiagnostics = {
  overlappingPairs: Array<{
    firstId: string;
    secondId: string;
    overlapMinutes: number;
  }>;
  conflictingEventIds: string[];
  crowdedPairs: number;
};

function getEventStartMs(event: TimelineEvent) {
  return new Date(event.startUtc).getTime();
}

function getEventEndMs(event: TimelineEvent) {
  return new Date(event.endUtc).getTime();
}

function sortByStart(a: TimelineEvent, b: TimelineEvent) {
  return getEventStartMs(a) - getEventStartMs(b);
}

function createSeededRandom(seed: number) {
  let state = seed >>> 0;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function shuffleWithSeed<T>(items: T[], seed: number) {
  const nextItems = items.slice();
  const random = createSeededRandom(seed);

  for (let index = nextItems.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [nextItems[index], nextItems[swapIndex]] = [nextItems[swapIndex], nextItems[index]];
  }

  return nextItems;
}

function overlapsInTime(a: TimelineEvent, b: TimelineEvent) {
  return getEventStartMs(a) < getEventEndMs(b) && getEventEndMs(a) > getEventStartMs(b);
}

function findNextFreeSlot(
  desiredStart: number,
  durationMs: number,
  placed: TimelineEvent[],
  tripStartMs: number,
  tripEndMs: number,
) {
  let candidate = clamp(desiredStart, tripStartMs, tripEndMs - durationMs);

  while (candidate + durationMs <= tripEndMs) {
    const blocker = placed
      .slice()
      .sort(sortByStart)
      .find((event) => candidate < getEventEndMs(event) && candidate + durationMs > getEventStartMs(event));

    if (!blocker) {
      return candidate;
    }

    candidate = getEventEndMs(blocker);
  }

  return tripEndMs - durationMs;
}

export function rescheduleTrip(trip: Trip): Trip {
  const tripStartMs = new Date(trip.startUtc).getTime();
  const tripEndMs = new Date(trip.endUtc).getTime();

  const hardEvents = trip.events
    .filter((event) => event.kind === 'hard')
    .map((event) => ({
      ...event,
      endUtc: new Date(new Date(event.startUtc).getTime() + minutesToMs(event.durationMin)).toISOString(),
      preferredStartUtc: undefined,
    }))
    .sort(sortByStart);

  const flexibleEvents = trip.events
    .filter((event) => event.kind === 'flexible')
    .slice()
    .sort((a, b) => {
      const aPreferred = new Date(a.preferredStartUtc ?? a.startUtc).getTime();
      const bPreferred = new Date(b.preferredStartUtc ?? b.startUtc).getTime();

      if (aPreferred === bPreferred) {
        return a.title.localeCompare(b.title);
      }

      return aPreferred - bPreferred;
    });

  const placed: TimelineEvent[] = [...hardEvents];
  const scheduledFlexible = flexibleEvents.map((event) => {
    const durationMs = minutesToMs(event.durationMin);
    const preferredStart = new Date(event.preferredStartUtc ?? event.startUtc).getTime();
    const nextStart = findNextFreeSlot(preferredStart, durationMs, placed, tripStartMs, tripEndMs);

    const scheduledEvent: TimelineEvent = {
      ...event,
      startUtc: new Date(nextStart).toISOString(),
      endUtc: new Date(nextStart + durationMs).toISOString(),
      preferredStartUtc: event.preferredStartUtc ?? new Date(nextStart).toISOString(),
    };

    placed.push(scheduledEvent);
    return scheduledEvent;
  });

  return {
    ...trip,
    events: [...hardEvents, ...scheduledFlexible].sort(sortByStart),
  };
}

export function moveFlexibleEvent(trip: Trip, eventId: string, nextStartMs: number, lane: TimelineEvent['lane']) {
  const nextTrip: Trip = {
    ...trip,
    events: trip.events.map((event) => {
      if (event.id !== eventId || event.kind !== 'flexible') {
        return event;
      }

      const durationMs = minutesToMs(event.durationMin);
      return {
        ...event,
        lane,
        preferredStartUtc: new Date(nextStartMs).toISOString(),
        startUtc: new Date(nextStartMs).toISOString(),
        endUtc: new Date(nextStartMs + durationMs).toISOString(),
      };
    }),
  };

  return rescheduleTrip(nextTrip);
}

export function updateEventInTrip(trip: Trip, eventId: string, patch: Partial<TimelineEvent>) {
  const nextTrip = {
    ...trip,
    events: trip.events.map((event) => {
      if (event.id !== eventId) {
        return event;
      }

      const nextEvent = {
        ...event,
        ...patch,
      };

      return {
        ...nextEvent,
        endUtc: new Date(new Date(nextEvent.startUtc).getTime() + minutesToMs(nextEvent.durationMin)).toISOString(),
      };
    }),
  };

  return rescheduleTrip(nextTrip);
}

export function makeItWorkTrip(trip: Trip, variant: number) {
  const attempts = 40;
  const currentTrip = rescheduleTrip(trip);
  const currentSignature = getTripSignature(currentTrip);
  let bestTrip = currentTrip;
  let bestScore = scoreTripLayout(currentTrip);
  let bestDifferentTrip: Trip | null = null;
  let bestDifferentScore = Number.POSITIVE_INFINITY;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const candidate = makeVariantTrip(trip, variant * 101 + attempt);
    const score = scoreTripLayout(candidate);
    const signature = getTripSignature(candidate);

    if (signature !== currentSignature && score < bestDifferentScore) {
      bestDifferentTrip = candidate;
      bestDifferentScore = score;
    }

    if (score < bestScore) {
      bestTrip = candidate;
      bestScore = score;
    }
  }

  return bestTrip === currentTrip && bestDifferentTrip ? bestDifferentTrip : bestTrip;
}

function makeVariantTrip(trip: Trip, variant: number) {
  const tripStartMs = new Date(trip.startUtc).getTime();
  const tripEndMs = new Date(trip.endUtc).getTime();
  const flexEvents = trip.events.filter((event) => event.kind === 'flexible');

  if (flexEvents.length === 0) {
    return rescheduleTrip(trip);
  }

  const random = createSeededRandom(variant * 7919 + flexEvents.length * 97);
  const shuffledIds = shuffleWithSeed(
    flexEvents.map((event) => event.id),
    variant * 6151 + 17,
  );
  const orderIndex = new Map(shuffledIds.map((eventId, index) => [eventId, index]));
  const slotCount = flexEvents.length + 1;
  const usableSpan = Math.max(tripEndMs - tripStartMs, minutesToMs(30));

  const nextTrip: Trip = {
    ...trip,
    events: trip.events.map((event) => {
      if (event.kind !== 'flexible') {
        return event;
      }

      const index = orderIndex.get(event.id) ?? 0;
      const slotStart = tripStartMs + (usableSpan * (index + 1)) / slotCount;
      const jitterWindow = Math.min(minutesToMs(180), usableSpan / Math.max(slotCount, 2));
      const jitter = (random() - 0.5) * jitterWindow;
      const preferredStartMs = slotStart + jitter - minutesToMs(event.durationMin) / 2;
      const lane: TimelineEvent['lane'] = (index + variant) % 2 === 0 ? 'top' : 'bottom';

      return {
        ...event,
        lane,
        preferredStartUtc: new Date(preferredStartMs).toISOString(),
        startUtc: new Date(preferredStartMs).toISOString(),
        endUtc: new Date(preferredStartMs + minutesToMs(event.durationMin)).toISOString(),
      };
    }),
  };

  return rescheduleTrip(nextTrip);
}

function scoreTripLayout(trip: Trip) {
  const events = trip.events.slice().sort(sortByStart);
  let score = 0;

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const start = getEventStartMs(event);
    const end = getEventEndMs(event);

    for (let compareIndex = index + 1; compareIndex < events.length; compareIndex += 1) {
      const compareEvent = events[compareIndex];
      const compareStart = getEventStartMs(compareEvent);

      if (compareStart >= end) {
        break;
      }

      if (overlapsInTime(event, compareEvent)) {
        const overlapMs = Math.min(end, getEventEndMs(compareEvent)) - Math.max(start, compareStart);
        score += overlapMs / 60000 * 1000;
      }
    }
  }

  const flexEvents = events.filter((event) => event.kind === 'flexible');
  for (let index = 0; index < flexEvents.length; index += 1) {
    const event = flexEvents[index];
    const preferred = new Date(event.preferredStartUtc ?? event.startUtc).getTime();
    const actual = getEventStartMs(event);
    score += Math.abs(actual - preferred) / 60000;

    for (let compareIndex = index + 1; compareIndex < flexEvents.length; compareIndex += 1) {
      const compareEvent = flexEvents[compareIndex];
      const distanceMinutes = Math.abs(getEventStartMs(compareEvent) - actual) / 60000;
      if (distanceMinutes < 90 && event.lane === compareEvent.lane) {
        score += 220 - distanceMinutes * 2;
      }
    }
  }

  const tripEndMs = new Date(trip.endUtc).getTime();
  for (const event of flexEvents) {
    if (getEventEndMs(event) > tripEndMs) {
      score += 50000;
    }
  }

  return score;
}

function getTripSignature(trip: Trip) {
  return trip.events
    .filter((event) => event.kind === 'flexible')
    .map((event) => `${event.id}:${event.startUtc}:${event.lane}`)
    .join('|');
}

export function getTripDiagnostics(trip: Trip): TripDiagnostics {
  const events = trip.events.slice().sort(sortByStart);
  const overlappingPairs: TripDiagnostics['overlappingPairs'] = [];
  const conflictingEventIds = new Set<string>();
  let crowdedPairs = 0;

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const start = getEventStartMs(event);
    const end = getEventEndMs(event);

    for (let compareIndex = index + 1; compareIndex < events.length; compareIndex += 1) {
      const compareEvent = events[compareIndex];
      const compareStart = getEventStartMs(compareEvent);

      if (compareStart >= end) {
        break;
      }

      if (overlapsInTime(event, compareEvent)) {
        const overlapMinutes = Math.round(
          (Math.min(end, getEventEndMs(compareEvent)) - Math.max(start, compareStart)) / 60000,
        );
        overlappingPairs.push({
          firstId: event.id,
          secondId: compareEvent.id,
          overlapMinutes,
        });
        conflictingEventIds.add(event.id);
        conflictingEventIds.add(compareEvent.id);
      }
    }
  }

  const flexEvents = events.filter((event) => event.kind === 'flexible');
  for (let index = 0; index < flexEvents.length; index += 1) {
    const event = flexEvents[index];
    for (let compareIndex = index + 1; compareIndex < flexEvents.length; compareIndex += 1) {
      const compareEvent = flexEvents[compareIndex];
      const distanceMinutes = Math.abs(getEventStartMs(compareEvent) - getEventStartMs(event)) / 60000;
      if (distanceMinutes < 90 && event.lane === compareEvent.lane) {
        crowdedPairs += 1;
      }
    }
  }

  return {
    overlappingPairs,
    conflictingEventIds: [...conflictingEventIds],
    crowdedPairs,
  };
}
