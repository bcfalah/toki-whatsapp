import { google } from 'googleapis';

const TZ = 'America/Argentina/Buenos_Aires';

function getCalendarClient() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
  return google.calendar({ version: 'v3', auth });
}

const DEFAULT_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary';
const RW_CALENDAR_ID = process.env.RW_CALENDAR_ID;

export async function createEvent({ title, date, time, duration, description = '', location = '', isRW = false }) {
  duration = (duration && duration > 0 && duration <= 480) ? duration : 15;
  const calendar = getCalendarClient();
  const calendarId = isRW ? RW_CALENDAR_ID : DEFAULT_CALENDAR_ID;

  const startStr = `${date}T${time || '09:00'}:00`;
  const startMs = new Date(`${startStr}-03:00`).getTime();
  const endMs = startMs + duration * 60000;
  const endLocal = new Date(endMs + 3 * 60 * 60 * 1000);
  const p = n => String(n).padStart(2, '0');
  const endStr = `${endLocal.getUTCFullYear()}-${p(endLocal.getUTCMonth() + 1)}-${p(endLocal.getUTCDate())}T${p(endLocal.getUTCHours())}:${p(endLocal.getUTCMinutes())}:00`;

  const reminders = isRW
    ? { useDefault: false, overrides: [{ method: 'popup', minutes: 60 }, { method: 'email', minutes: 60 }] }
    : { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }, { method: 'email', minutes: 30 }, { method: 'popup', minutes: 1440 }, { method: 'email', minutes: 1440 }] };

  const event = {
    summary: title,
    description,
    location: location || undefined,
    start: { dateTime: startStr, timeZone: TZ },
    end: { dateTime: endStr, timeZone: TZ },
    reminders,
    ...(isRW && {
      extendedProperties: {
        private: { whatsappNotify1h: 'pending', whatsappNotifyNow: 'pending' },
      },
    }),
  };

  const res = await calendar.events.insert({ calendarId, resource: event });
  return res.data;
}

export async function listEvents(startDate, endDate) {
  const calendar = getCalendarClient();
  const timeMin = new Date(`${startDate}T00:00:00-03:00`).toISOString();
  const timeMax = new Date(`${endDate}T23:59:59-03:00`).toISOString();
  const res = await calendar.events.list({
    calendarId: DEFAULT_CALENDAR_ID,
    timeMin, timeMax,
    singleEvents: true,
    orderBy: 'startTime',
  });
  return res.data.items || [];
}

export async function listEventsInTimeRange(timeMin, timeMax) {
  const calendar = getCalendarClient();
  const res = await calendar.events.list({
    calendarId: RW_CALENDAR_ID,
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });
  return res.data.items || [];
}

export async function patchEventProperty(eventId, privateProps) {
  const calendar = getCalendarClient();
  await calendar.events.patch({
    calendarId: RW_CALENDAR_ID,
    eventId,
    resource: { extendedProperties: { private: privateProps } },
  });
}

export async function deleteEvent(eventId) {
  const calendar = getCalendarClient();
  await calendar.events.delete({ calendarId: DEFAULT_CALENDAR_ID, eventId });
}
