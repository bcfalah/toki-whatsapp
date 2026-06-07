# Toki WhatsApp — Guía de setup completa

## Qué hace esta app
Recibe mensajes de WhatsApp (texto o imágenes), los procesa con Claude y crea/lista/borra eventos en Google Calendar. Exactamente como Toki.

---

## Paso 1 — Twilio (número de WhatsApp)

1. Creá cuenta en https://www.twilio.com (gratis)
2. En el panel, andá a **Messaging → Try it out → Send a WhatsApp message**
3. Vas a ver un número sandbox (ej: `+1 415 523 8886`) y un código para activarlo
4. Desde tu WhatsApp, mandá el código al número de Twilio para activar el sandbox
5. Guardá tu **Account SID** y **Auth Token** del panel principal

---

## Paso 2 — Google Calendar (Service Account)

1. Andá a https://console.cloud.google.com
2. Creá un proyecto nuevo (ej: "toki-bot")
3. Activá la **Google Calendar API** (APIs & Services → Enable APIs)
4. Creá una **Service Account** (IAM & Admin → Service Accounts → Create)
5. Generá una clave JSON (Actions → Manage keys → Add key → JSON) — descargá el archivo
6. En Google Calendar, abrí la configuración de tu calendario → **Compartir con personas específicas**
7. Agregá el email de la service account (ej: `toki-bot@tu-proyecto.iam.gserviceaccount.com`) con permisos de **edición**

El contenido del JSON descargado va en la variable `GOOGLE_SERVICE_ACCOUNT_JSON` (todo en una sola línea).

---

## Paso 3 — Deploy en Railway

1. Subí este proyecto a GitHub
2. Andá a https://railway.app → New Project → Deploy from GitHub
3. Seleccioná el repo
4. En **Variables**, cargá todas las del archivo `.env.example` con tus valores reales
5. Railway te da una URL pública tipo `https://toki-whatsapp-production.up.railway.app`

---

## Paso 4 — Conectar el webhook en Twilio

1. En Twilio, andá a **Messaging → Settings → WhatsApp Sandbox Settings**
2. En "When a message comes in", pegá tu URL + `/webhook`:
   ```
   https://toki-whatsapp-production.up.railway.app/webhook
   ```
3. Método: **HTTP POST**
4. Guardá

---

## Paso 5 — Probar

Mandá al número de Twilio desde WhatsApp:
- `Hola` → debería responder
- `Reunión con el equipo el martes a las 10` → crea el evento
- `Qué tengo mañana?` → lista eventos
- [Foto de un flyer/invitación] → extrae datos y agenda

---

## Variables de entorno necesarias

| Variable | Dónde obtenerla |
|----------|----------------|
| `TWILIO_ACCOUNT_SID` | Panel de Twilio |
| `TWILIO_AUTH_TOKEN` | Panel de Twilio |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Archivo JSON de la service account (todo en una línea) |
| `GOOGLE_CALENDAR_ID` | `primary` para tu calendario principal, o el ID específico |

---

## Pasar a producción (número propio)

Cuando quieras un número real (no sandbox):
1. En Twilio comprás un número con capacidad WhatsApp (~$1/mes)
2. Solicitás acceso a la API de WhatsApp Business desde Twilio
3. El webhook y el código son idénticos, solo cambia el número emisor

---

## Estructura del proyecto

```
toki-whatsapp/
├── src/
│   ├── server.js     → servidor Express, recibe webhooks de Twilio
│   ├── handler.js    → llama a Claude, interpreta la respuesta
│   └── calendar.js   → crea/lista/borra eventos en Google Calendar
├── package.json
├── railway.toml      → config de deploy
└── .env.example      → variables necesarias
```
