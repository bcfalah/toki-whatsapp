import { GoogleGenAI } from '@google/genai';
import fetch from 'node-fetch';
import { createEvent, listEvents, deleteEvent, listConflicts } from './calendar.js';
import { checkJewishRestriction } from './jewish.js';

const AR = { timeZone: 'America/Argentina/Buenos_Aires' };

function buildSystemPrompt() {
  const now = new Date();
  return `Sos Toki, un asistente de agenda por WhatsApp que habla en español rioplatense (vos/te/tu).
Ayudás a gestionar el calendario del usuario de forma conversacional, rápida y amigable.
Hoy es: ${now.toLocaleDateString('es-AR', { ...AR, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.
Hora actual: ${now.toLocaleTimeString('es-AR', { ...AR, hour: '2-digit', minute: '2-digit' })}.

Cuando el usuario quiera agendar, ver o borrar eventos, respondé SIEMPRE con un JSON en este formato exacto (sin texto extra):

Para crear evento:
{"action":"create","title":"Nombre del evento","date":"YYYY-MM-DD","time":"HH:MM","duration":15,"description":"descripción opcional","location":"dirección o lugar opcional"}

Para listar eventos:
{"action":"list","date":"YYYY-MM-DD"}

Para listar la semana:
{"action":"list_week","date":"YYYY-MM-DD"}

Para borrar evento:
{"action":"delete","eventId":"id_del_evento"}

Para responder sin acción de calendario (saludar, confirmar, aclarar algo):
{"action":"reply","message":"tu mensaje acá"}

Si el usuario manda una imagen con info de un evento (flyer, screenshot, invitación), extraé los datos y creá el evento.
Si el usuario manda una nota de voz, transcribí lo que dice y si menciona algo para agendar, creá el evento.
Si falta información para crear el evento (como la fecha), pedila en el campo message usando action:reply.
Fechas relativas como "mañana", "el jueves", "la semana que viene", "en X minutos/horas" convertílas a fecha y hora exacta en YYYY-MM-DD y HH:MM.
Si el usuario dice solo "agenda" o "mis eventos" sin fecha, usá la fecha de hoy.
Duraciones: usá SIEMPRE 15 minutos. Solo usá más si el usuario dice explícitamente "X minutos" o "X horas" en su mensaje. No inferir por tipo de evento.`;
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Eventos pendientes de confirmación (número → datos del evento)
const pendingEvents = new Map();

function isConfirmation(text) {
  return /^\s*(s[ií]|dale|ok|bueno|claro|ya|igual|sí igual|si igual|ok igual|bueno igual|si dale|sí dale|sí, igual|si, igual|agendalo igual|agendálo igual)\s*$/i.test(text.trim());
}

export async function handleMessage({ from, body, mediaUrl, mediaType }) {
  const isRW = /^RW\s/i.test(body);
  const cleanBody = isRW ? body.slice(2).trim() : body;

  // Si hay un evento pendiente y el usuario confirma → crearlo directamente
  if (pendingEvents.has(from) && isConfirmation(cleanBody)) {
    const { parsed, isRW: pendingRW } = pendingEvents.get(from);
    pendingEvents.delete(from);
    const event = await createEvent({ ...parsed, isRW: pendingRW });
    return `Evento creado\n\n*${event.summary}*\n${formatDate(event.start.dateTime)}\nLink: ${event.htmlLink}`;
  }
  // Cualquier otro mensaje cancela el pendiente
  pendingEvents.delete(from);

  let contents;

  if (mediaUrl && mediaType && mediaType.startsWith('image/')) {
    const mediaBase64 = await fetchMediaAsBase64(mediaUrl);
    contents = [
      { role: 'user', parts: [
        { inlineData: { data: mediaBase64, mimeType: mediaType } },
        { text: cleanBody || 'Agendá esto por favor.' },
      ]},
    ];
  } else if (mediaUrl && mediaType && mediaType.startsWith('audio/')) {
    const mediaBase64 = await fetchMediaAsBase64(mediaUrl);
    const mimeType = mediaType.split(';')[0].trim(); // strip codec params (e.g. audio/ogg; codecs=opus)
    contents = [
      { role: 'user', parts: [
        { inlineData: { data: mediaBase64, mimeType } },
        { text: cleanBody || 'Transcribí este audio. Si menciona un evento o tarea para agendar, creálo.' },
      ]},
    ];
  } else {
    contents = [{ role: 'user', parts: [{ text: cleanBody }] }];
  }

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-lite',
    contents,
    config: { systemInstruction: buildSystemPrompt(), maxOutputTokens: 1024 },
  });

  const rawText = response.text.trim();

  let parsed;
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
  } catch {
    return rawText;
  }

  switch (parsed.action) {
    case 'create': {
      {
        const duration = Math.max(15, Math.min(parsed.duration || 15, 480));
        const startMs = new Date(`${parsed.date}T${parsed.time || '09:00'}:00-03:00`).getTime();
        const endMs = startMs + duration * 60000;

        // Chequeo de Shabat / Iom Tov
        const jewish = await checkJewishRestriction(parsed.date, parsed.time);
        if (jewish) {
          const emoji = jewish.type === 'shabat' ? '🕯️' : '✡️';
          pendingEvents.set(from, { parsed, isRW });
          return `${emoji} *${jewish.name}*\n\nEse horario cae durante ${jewish.name}. ¿Querés agendarlo igual?`;
        }

        // Chequeo de conflictos
        const conflicts = await listConflicts(startMs, endMs);
        if (conflicts.length > 0) {
          const lines = conflicts.map(e => {
            const time = e.start.dateTime
              ? new Date(e.start.dateTime).toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit' })
              : 'todo el día';
            return `• *${e.summary}* (${e._calendarName}) — ${time}`;
          }).join('\n');
          pendingEvents.set(from, { parsed, isRW });
          return `⚠️ *Conflicto de horario*\n\nYa tenés algo en ese momento:\n${lines}\n\n¿Querés agendarlo igual?`;
        }
      }
      const event = await createEvent({ ...parsed, isRW });
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

async function fetchMediaAsBase64(url) {
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
    timeZone: 'America/Argentina/Buenos_Aires',
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
