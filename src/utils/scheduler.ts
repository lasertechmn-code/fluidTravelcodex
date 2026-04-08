import type { TimelineEvent, Trip } from '../types';
import { clamp, minutesToMs } from './time';

function getEventStartMs(event: TimelineEvent) {
  return new Date(event.startUtc).getTime();
}

function getEventEndMs(event: TimelineEvent) {
  return new Date(event.endUtc).getTime();
}

function sortByStart(a: TimelineEvent, b: TimelineEvent) {
  return getEventStartMs(a) - getEventStartMs(b);
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
      preferredStartUtc: new Date(nextStart).toISOString(),
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
