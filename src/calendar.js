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

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary';

export async function createEvent({ title, date, time, duration = 60, description = '', location = '' }) {
  const calendar = getCalendarClient();

  // Pass local datetime string without Z so Google interprets it as AR local time
  const startStr = `${date}T${time || '09:00'}:00`;

  // Calculate end time in AR local time
  const startMs = new Date(`${startStr}-03:00`).getTime();
  const endMs = startMs + duration * 60000;
  const endLocal = new Date(endMs + 3 * 60 * 60 * 1000);
  const p = n => String(n).padStart(2, '0');
  const endStr = `${endLocal.getUTCFullYear()}-${p(endLocal.getUTCMonth() + 1)}-${p(endLocal.getUTCDate())}T${p(endLocal.getUTCHours())}:${p(endLocal.getUTCMinutes())}:00`;

  const event = {
    summary: title,
    description,
    location: location || undefined,
    start: { dateTime: startStr, timeZone: TZ },
    end: { dateTime: endStr, timeZone: TZ },
  };

  const res = await calendar.events.insert({ calendarId: CALENDAR_ID, resource: event });
  return res.data;
}

export async function listEvents(startDate, endDate) {
  const calendar = getCalendarClient();

  const timeMin = new Date(`${startDate}T00:00:00-03:00`).toISOString();
  const timeMax = new Date(`${endDate}T23:59:59-03:00`).toISOString();

  const res = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
  });

  return res.data.items || [];
}

export async function deleteEvent(eventId) {
  const calendar = getCalendarClient();
  await calendar.events.delete({ calendarId: CALENDAR_ID, eventId });
}
