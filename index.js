// index.js
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

// Sua chave (você pediu para inserir diretamente)
const OPENWEATHER_API_KEY = '335c83b8d83ce5a15dca4f3de6040bfc';

// Locais solicitados
const CITIES = [
  { id: 'sp',  label: 'São Paulo',  country: 'BR', lat: -23.55, lon: -46.63 },
  { id: 'dam', label: 'Damasco',    country: 'SY', lat: 33.51,  lon: 36.29  },
  { id: 'bd',  label: 'Bangladesh', country: 'BD', lat: 23.78,  lon: 90.41  } // Dhaka
];

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Provider 1: OpenWeather (usa chave)
async function fromOpenWeather(c) {
  const url = 'https://api.openweathermap.org/data/2.5/weather';
  const params = {
    lat: c.lat,
    lon: c.lon,
    appid: OPENWEATHER_API_KEY,
    units: 'metric',
    lang: 'pt_br'
  };
  const { data } = await axios.get(url, { params, timeout: 10000 });
  const w = Array.isArray(data.weather) && data.weather[0] ? data.weather[0] : {};
  const windMs = typeof data.wind?.speed === 'number' ? data.wind.speed : null;

  return {
    temperature: data.main?.temp ?? null,
    wind_kmh: windMs != null ? Math.round(windMs * 3.6) : null,
    condition: w.description || '',
    icon: w.icon ? `https://openweathermap.org/img/wn/${w.icon}@2x.png` : null,
    max: data.main?.temp_max ?? null,
    min: data.main?.temp_min ?? null,
    country: c.country
  };
}

// Provider 2: Open-Meteo (fallback sem chave)
async function fromOpenMeteo(c) {
  const url = 'https://api.open-meteo.com/v1/forecast';
  const params = {
    latitude: c.lat,
    longitude: c.lon,
    current: 'temperature_2m,wind_speed_10m',
    daily: 'temperature_2m_max,temperature_2m_min',
    timezone: 'auto'
  };
  const { data } = await axios.get(url, { params, timeout: 10000 });
  const current = data.current || {};
  const daily = data.daily || {};
  return {
    temperature: current.temperature_2m ?? null,
    wind_kmh: current.wind_speed_10m != null ? Math.round(Number(current.wind_speed_10m)) : null,
    condition: 'Dados via Open‑Meteo',
    icon: null,
    max: Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max[0] : null,
    min: Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min[0] : null,
    country: c.country
  };
}

async function fetchCity(c) {
  // Tenta OpenWeather primeiro; se falhar, cai para Open‑Meteo
  try {
    const ow = await fromOpenWeather(c);
    return { id: c.id, city: c.label, ...ow };
  } catch (err) {
    try {
      const om = await fromOpenMeteo(c);
      return { id: c.id, city: c.label, ...om };
    } catch (fallbackErr) {
      const msg = err.response?.data?.message || err.message || 'Erro ao buscar clima';
      return { id: c.id, city: c.label, country: c.country, error: msg };
    }
  }
}

async function fetchAll() {
  return Promise.all(CITIES.map(fetchCity));
}

app.get('/api/weather/all', async (_req, res) => {
  try {
    res.json(await fetchAll());
  } catch (e) {
    res.status(500).json({ error: e.message || 'Erro ao buscar clima' });
  }
});

app.get('/api/stream', async (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  let open = true;
  req.on('close', () => (open = false));

  const send = async () => {
    try {
      const data = await fetchAll();
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (e) {
      res.write(`data: ${JSON.stringify([{ error: e.message || 'Falha na atualização' }])}\n\n`);
    }
  };

  await send();                      // estado inicial
  const id = setInterval(send, 120000); // atualiza a cada 120s
  req.on('close', () => clearInterval(id));
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});
