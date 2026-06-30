import fetch from 'node-fetch';

// Buenos Aires geoname ID (HebCal)
const GEO = 'geonameid=3435910';
// Havdalah: 50 min after sunset (common Ashkenazi/Sephardi custom)
const HAVDALAH_MIN = 50;

/**
 * Returns { type: 'shabat'|'yomtov', name: string } if the event falls
 * during Shabat or Yom Tov, or null if it doesn't.
 */
export async function checkJewishRestriction(dateStr, timeStr) {
  const eventDt = new Date(`${dateStr}T${timeStr || '12:00'}:00-03:00`);
  const [year, month, day] = dateStr.split('-').map(Number);
  const dayOfWeek = eventDt.getDay(); // 0=Sun, 5=Fri, 6=Sat

  // --- 1. Shabat check (only relevant on Fri or Sat) ---
  if (dayOfWeek === 5 || dayOfWeek === 6) {
    try {
      const res = await fetch(
        `https://www.hebcal.com/shabbat?cfg=json&${GEO}&gy=${year}&gm=${month}&gd=${day}&m=${HAVDALAH_MIN}&M=on`,
        { signal: AbortSignal.timeout(5000) }
      );
      const data = await res.json();
      let candleLighting = null;
      let havdalah = null;
      for (const item of data.items || []) {
        if (item.category === 'candles') candleLighting = new Date(item.date);
        if (item.category === 'havdalah') havdalah = new Date(item.date);
      }
      if (candleLighting && havdalah && eventDt >= candleLighting && eventDt <= havdalah) {
        return { type: 'shabat', name: 'Shabat' };
      }
    } catch {
      // Si la API falla, ignoramos y seguimos
    }
  }

  // --- 2. Yom Tov check (fiestas judías, diáspora) ---
  try {
    const res = await fetch(
      `https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&min=off&year=${year}&month=${month}&lg=s&i=off`,
      { signal: AbortSignal.timeout(5000) }
    );
    const data = await res.json();
    for (const item of data.items || []) {
      if (item.yomtov && item.date === dateStr) {
        return { type: 'yomtov', name: item.title };
      }
    }
  } catch {
    // Si la API falla, ignoramos y seguimos
  }

  return null;
}
