import twilio from 'twilio';
import { listEventsInTimeRange, patchEventProperty } from './calendar.js';

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const TO = process.env.USER_WHATSAPP_NUMBER;   // whatsapp:+5491132359574
const FROM = process.env.TWILIO_WHATSAPP_FROM; // whatsapp:+14155238886

function formatEventTime(event) {
  const dt = event.start.dateTime;
  if (!dt) return '';
  return new Date(dt).toLocaleTimeString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit', minute: '2-digit',
  });
}

async function sendWhatsApp(body) {
  await client.messages.create({ from: FROM, to: TO, body });
}

export async function checkAndSendReminders() {
  if (!process.env.RW_CALENDAR_ID) return;

  const now = new Date();
  const in65 = new Date(now.getTime() + 65 * 60000);
  const minus5 = new Date(now.getTime() - 5 * 60000);

  const events = await listEventsInTimeRange(minus5, in65);

  for (const event of events) {
    const start = new Date(event.start.dateTime || event.start.date);
    const props = event.extendedProperties?.private || {};
    const time = formatEventTime(event);
    const title = event.summary || 'Evento';
    const location = event.location ? `\n📍 ${event.location}` : '';

    // 1-hour reminder
    const diffMin = (start - now) / 60000;
    if (diffMin >= 55 && diffMin <= 65 && props.whatsappNotify1h !== 'sent') {
      await sendWhatsApp(`⏰ *Recordatorio — en 1 hora*\n\n*${title}*\nA las ${time}${location}`);
      await patchEventProperty(event.id, { whatsappNotify1h: 'sent' });
    }

    // At-event reminder
    if (diffMin >= -5 && diffMin <= 5 && props.whatsappNotifyNow !== 'sent') {
      await sendWhatsApp(`🔔 *¡Ahora!*\n\n*${title}*\nA las ${time}${location}`);
      await patchEventProperty(event.id, { whatsappNotifyNow: 'sent' });
    }
  }
}
