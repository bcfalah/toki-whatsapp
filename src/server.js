import express from 'express';
import twilio from 'twilio';
import { handleMessage } from './handler.js';
import { checkAndSendReminders } from './reminders.js';

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

app.get('/', (req, res) => res.send('Toki WhatsApp bot running'));

app.post('/webhook', async (req, res) => {
  const from = req.body.From;
  const body = req.body.Body || '';
  const mediaUrl = req.body.MediaUrl0 || null;
  const mediaType = req.body.MediaContentType0 || null;
  const to = req.body.To;

  res.status(200).send('<Response></Response>');

  try {
    const reply = await handleMessage({ from, body, mediaUrl, mediaType });
    await client.messages.create({ from: to, to: from, body: reply });
  } catch (err) {
    console.error('Error handling message:', err);
    try {
      await client.messages.create({
        from: to,
        to: from,
        body: 'Hubo un error procesando tu mensaje. Intentá de nuevo.',
      });
    } catch (twilioErr) {
      console.error('Error sending Twilio fallback:', twilioErr);
    }
  }
});

console.log('GEMINI_API_KEY set:', !!process.env.GEMINI_API_KEY, '| length:', process.env.GEMINI_API_KEY?.length);
console.log('TWILIO_ACCOUNT_SID set:', !!process.env.TWILIO_ACCOUNT_SID);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  // Check RW reminders every 5 minutes
  setInterval(async () => {
    try { await checkAndSendReminders(); }
    catch (err) { console.error('Reminder check error:', err.message); }
  }, 5 * 60 * 1000);
});
