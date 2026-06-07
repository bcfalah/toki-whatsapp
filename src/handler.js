import Anthropic from '@anthropic-ai/sdk';
import fetch from 'node-fetch';
import { createEvent, listEvents, deleteEvent } from './calendar.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Sos Toki, un asistente de agenda por WhatsApp que habla en español rioplatense (vos/te/tu).
Ayudás a gestionar el calendario del usuario de forma conversacional, rápida y amigable.
Hoy es: ${new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.
Hora actual: ${new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}.

Cuando el usuario quiera agendar, ver o borrar eventos, respondé SIEMPRE con un JSON en este formato exacto (sin texto extra):

Para crear evento:
{"action":"create","title":"Nombre del evento","date":"YYYY-MM-DD","time":"HH:MM","duration":60,"description":"descripción opcional"}

Para listar eventos:
{"action":"list","date":"YYYY-MM-DD"}

Para listar la semana:
{"action":"list_week","date":"YYYY-MM-DD"}

Para borrar evento:
{"action":"delete","eventId":"id_del_evento"}

Para responder sin acción de calendario (saludar, confirmar, aclarar algo):
{"action":"reply","message":"tu mensaje acá"}

Si el usuario manda una imagen con info de un evento (flyer, screenshot, invitación), extraé los datos y creá el evento.
Si falta información para crear el evento (como la fecha), pedila en el campo message usando action:reply.
Fechas relativas como "mañana", "el jueves", "la semana que viene" convertílas a YYYY-MM-DD.
Si el usuario dice solo "agenda" o "mis eventos" sin fecha, usá la fecha de hoy.
Duraciones por defecto: 60 minutos si no se especifica.`;

export async function handleMessage({ from, body, mediaUrl, mediaType }) {
  const messages = [];

  if (mediaUrl && mediaType && mediaType.startsWith('image/')) {
    const imageBuffer = await fetchImageAsBase64(mediaUrl);
    messages.push({
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: imageBuffer },
        },
        {
          type: 'text',
          text: body || 'Agendá esto por favor.',
        },
      ],
    });
  } else {
    messages.push({ role: 'user', content: body });
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages,
  });

  const rawText = response.content[0].text.trim();

  let parsed;
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
  } catch {
    return rawText;
  }

  switch (parsed.action) {
    case 'create': {
      const event = await createEvent(parsed);
      return `Evento creado\n\n*${event.summary}*\n${formatDate(event.start.dateTime)}\nLink: ${event.htmlLink}`;
    }
    case 'list': {
      const events = await listEvents(parsed.date, parsed.date);
      return formatEventList(events, 'hoy');
    }
    case 'list_week': {
      const endDate = addDays(parsed.date, 6);
      const events = await listEvents(parsed.date, endDate);
      return formatEventList(events, 'esta semana');
    }
    case 'delete': {
      await deleteEvent(parsed.eventId);
      return 'Evento eliminado.';
    }
    case 'reply':
    default:
      return parsed.message || rawText;
  }
}

async function fetchImageAsBase64(url) {
  const authHeader = Buffer.from(
    `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
  ).toString('base64');
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${authHeader}` },
  });
  const buffer = await res.buffer();
  return buffer.toString('base64');
}

function formatDate(isoString) {
  return new Date(isoString).toLocaleString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatEventList(events, label) {
  if (!events.length) return `No tenés eventos para ${label}.`;
  const lines = events.map(e => {
    const time = e.start.dateTime
      ? new Date(e.start.dateTime).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
      : 'todo el día';
    return `• *${e.summary}* — ${time}`;
  });
  return `Tus eventos para ${label}:\n\n${lines.join('\n')}`;
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}
