import { google } from 'googleapis';

function getCalendarClient() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
  return google.calendar({ version: 'v3', auth });
}

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary';

export async function createEvent({ title, date, time, duration = 60, description = '' }) {
  const calendar = getCalendarClient();

  const startDateTime = new Date(`${date}T${time || '09:00'}:00`);
  const endDateTime = new Date(startDateTime.getTime() + duration * 60000);

  const event = {
    summary: title,
    description,
    start: { dateTime: startDateTime.toISOString(), timeZone: 'America/Argentina/Buenos_Aires' },
    end: { dateTime: endDateTime.toISOString(), timeZone: 'America/Argentina/Buenos_Aires' },
  };

  const res = await calendar.events.insert({ calendarId: CALENDAR_ID, resource: event });
  return res.data;
}

export async function listEvents(startDate, endDate) {
  const calendar = getCalendarClient();

  const timeMin = new Date(`${startDate}T00:00:00`).toISOString();
  const timeMax = new Date(`${endDate}T23:59:59`).toISOString();

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
