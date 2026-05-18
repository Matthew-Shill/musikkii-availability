const ical = require("node-ical");

const DEFAULT_CACHE_TTL_MS = 2 * 60 * 1000;
const DEFAULT_FETCH_TIMEOUT_MS = 15 * 1000;
const STUDIO_TIME_ZONE = "America/Denver";

function pad2(value) {
  return String(value).padStart(2, "0");
}

function getTimeZoneParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  const parts = formatter.formatToParts(date);
  const map = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second)
  };
}

function getTimeZoneOffsetMilliseconds(date, timeZone) {
  const parts = getTimeZoneParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );

  return asUtc - date.getTime();
}

function zonedTimeToUtc({ year, month, day, hour, minute = 0, second = 0 }, timeZone) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);

  let date = new Date(utcGuess);
  let offset = getTimeZoneOffsetMilliseconds(date, timeZone);
  let corrected = utcGuess - offset;

  date = new Date(corrected);
  offset = getTimeZoneOffsetMilliseconds(date, timeZone);
  corrected = utcGuess - offset;

  return new Date(corrected);
}

function applyStudioWallTimeToOccurrence(occurrenceDate, templateStart, timeZone) {
  const templateParts = getTimeZoneParts(templateStart, timeZone);
  const occurrenceParts = getTimeZoneParts(occurrenceDate, timeZone);

  return zonedTimeToUtc(
    {
      year: occurrenceParts.year,
      month: occurrenceParts.month,
      day: occurrenceParts.day,
      hour: templateParts.hour,
      minute: templateParts.minute,
      second: 0
    },
    timeZone
  );
}

let cachedEvents = null;
let cachedAt = 0;
let inflightFetch = null;

function getCalendarUrl() {
  return (
    process.env.MMS_ICAL_URL ||
    process.env.MY_MUSIC_STAFF_ICAL_URL ||
    process.env.CALENDAR_ICAL_URL ||
    ""
  ).trim();
}

function normalizeCalendarUrl(url) {
  if (url.startsWith("webcal://")) {
    return `https://${url.slice("webcal://".length)}`;
  }
  if (url.startsWith("webcals://")) {
    return `https://${url.slice("webcals://".length)}`;
  }
  return url;
}

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function eventDurationMs(event) {
  const start = toDate(event.start);
  const end = toDate(event.end);
  if (!start) return 0;
  if (end && end > start) return end.getTime() - start.getTime();
  return 60 * 60 * 1000;
}

function isExcludedInstance(event, instanceStart) {
  if (!event.exdate || !instanceStart) return false;

  const excluded = Array.isArray(event.exdate)
    ? event.exdate
    : typeof event.exdate === "object"
      ? Object.values(event.exdate)
      : [event.exdate];

  return excluded.some(exdate => {
    const ex = toDate(exdate);
    return ex && ex.getTime() === instanceStart.getTime();
  });
}

function expandEvent(event, rangeStart, rangeEnd, timeZone = STUDIO_TIME_ZONE) {
  if (event.type !== "VEVENT") return [];
  if (event.status === "CANCELLED") return [];

  const instances = [];
  const templateStart = toDate(event.start);

  if (event.recurrences && typeof event.recurrences === "object") {
    for (const recurrence of Object.values(event.recurrences)) {
      if (!recurrence || recurrence.status === "CANCELLED") continue;

      const start = toDate(recurrence.start);
      const end = toDate(recurrence.end);
      if (!start) continue;

      const instanceEnd = end || new Date(start.getTime() + eventDurationMs(event));
      if (instanceEnd <= rangeStart || start >= rangeEnd) continue;

      instances.push({ start, end: instanceEnd, summary: recurrence.summary || event.summary });
    }

    return instances;
  }

  const durationMs = eventDurationMs(event);

  if (event.rrule && templateStart) {
    const occurrences = event.rrule.between(rangeStart, rangeEnd, true);
    const rruleTimeZone = event.rrule.origOptions?.tzid || timeZone;

    for (const rawOccurrence of occurrences) {
      const occurrenceStart = applyStudioWallTimeToOccurrence(
        rawOccurrence,
        templateStart,
        rruleTimeZone
      );

      if (isExcludedInstance(event, occurrenceStart)) continue;

      const occurrenceEnd = new Date(occurrenceStart.getTime() + durationMs);
      if (occurrenceEnd <= rangeStart || occurrenceStart >= rangeEnd) continue;

      instances.push({
        start: occurrenceStart,
        end: occurrenceEnd,
        summary: event.summary
      });
    }

    return instances;
  }

  const start = toDate(event.start);
  const end = toDate(event.end) || (start ? new Date(start.getTime() + durationMs) : null);
  if (!start || !end) return [];
  if (end <= rangeStart || start >= rangeEnd) return [];

  instances.push({ start, end, summary: event.summary });
  return instances;
}

function expandCalendarToBusyEvents(parsedCalendar, rangeStart, rangeEnd, timeZone = STUDIO_TIME_ZONE) {
  const busy = [];

  for (const component of Object.values(parsedCalendar || {})) {
    busy.push(...expandEvent(component, rangeStart, rangeEnd, timeZone));
  }

  busy.sort((a, b) => a.start - b.start);
  return busy;
}

function getRangeBounds(days, timeZone, zonedTimeToUtc) {
  const now = new Date();
  const rangeStart = now;

  const endProbe = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const endParts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(endProbe);

  const partMap = Object.fromEntries(
    endParts.filter(p => p.type !== "literal").map(p => [p.type, Number(p.value)])
  );

  const rangeEnd = zonedTimeToUtc(
    {
      year: partMap.year,
      month: partMap.month,
      day: partMap.day,
      hour: 23,
      minute: 59,
      second: 59
    },
    timeZone
  );

  return { rangeStart, rangeEnd };
}

async function fetchCalendarParsed(url) {
  const normalizedUrl = normalizeCalendarUrl(url);
  const timeoutMs = Number(process.env.CALENDAR_FETCH_TIMEOUT_MS || DEFAULT_FETCH_TIMEOUT_MS);

  return ical.async.fromURL(normalizedUrl, {
    timeout: timeoutMs,
    headers: {
      "User-Agent": "musikkii-availability/1.0",
      Accept: "text/calendar"
    }
  });
}

async function refreshCalendarCache(url, rangeStart, rangeEnd, timeZone) {
  const parsed = await fetchCalendarParsed(url);
  const events = expandCalendarToBusyEvents(parsed, rangeStart, rangeEnd, timeZone);

  cachedEvents = events;
  cachedAt = Date.now();

  return {
    events,
    fetchedAt: cachedAt,
    fromCache: false,
    configured: true
  };
}

async function getCalendarBusyEvents({ forceRefresh = false, days = 42, timeZone, zonedTimeToUtc }) {
  const url = getCalendarUrl();
  if (!url) {
    return { events: [], fetchedAt: null, fromCache: false, configured: false };
  }

  const fetchDays = Math.min(Math.max(days, 42), 90);
  const { rangeStart, rangeEnd } = getRangeBounds(fetchDays, timeZone, zonedTimeToUtc);
  const ttlMs = Number(process.env.CALENDAR_CACHE_TTL_MS || DEFAULT_CACHE_TTL_MS);
  const cacheIsFresh =
    !forceRefresh && cachedEvents && Date.now() - cachedAt < ttlMs;

  if (cacheIsFresh) {
    return {
      events: cachedEvents,
      fetchedAt: cachedAt,
      fromCache: true,
      configured: true
    };
  }

  if (forceRefresh) {
    inflightFetch = null;
  }

  if (!inflightFetch) {
    inflightFetch = refreshCalendarCache(url, rangeStart, rangeEnd, timeZone)
      .catch(error => {
        if (cachedEvents) {
          console.error("calendar refresh failed, using stale cache:", error.message);
          return {
            events: cachedEvents,
            fetchedAt: cachedAt,
            fromCache: true,
            stale: true,
            configured: true
          };
        }
        throw error;
      })
      .finally(() => {
        inflightFetch = null;
      });
  }

  return inflightFetch;
}

function slotOverlapsBusyEvent(slotStartUtc, slotEndUtc, busyEvents) {
  const slotStart = slotStartUtc.getTime();
  const slotEnd = slotEndUtc.getTime();

  return busyEvents.some(event => {
    const busyStart = event.start.getTime();
    const busyEnd = event.end.getTime();
    return slotStart < busyEnd && busyStart < slotEnd;
  });
}

module.exports = {
  getCalendarBusyEvents,
  slotOverlapsBusyEvent,
  getCalendarUrl,
  expandCalendarToBusyEvents
};
