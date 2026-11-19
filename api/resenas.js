// Reseñas de "¿Sin plan?": cada reseña se guarda como un archivo JSON en Vercel Blob.
// GET  /api/resenas  → últimas reseñas, de la más nueva a la más vieja
// POST /api/resenas  → publica una reseña { nombre, lugar, pelicula, experiencia }
import { put, list } from '@vercel/blob';

const PREFIJO = 'resenas/';
const MAX_LISTA = 60;
const LIMITES = { nombre: [1, 60], lugar: [1, 100], pelicula: [1, 100], experiencia: [10, 1200] };

const limpiar = (v) => String(v ?? '')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  .replace(/[ \t]+/g, ' ')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

async function leer(res) {
  const { blobs } = await list({ prefix: PREFIJO, limit: 1000 });
  const recientes = blobs
    .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
    .slice(0, MAX_LISTA);
  const resenas = (await Promise.all(recientes.map(async (b) => {
    try { const r = await fetch(b.url); return r.ok ? await r.json() : null; } catch { return null; }
  }))).filter(Boolean);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ resenas });
}

async function publicar(req, res) {
  let datos = req.body;
  if (typeof datos === 'string') { try { datos = JSON.parse(datos); } catch { datos = null; } }
  if (!datos || typeof datos !== 'object') return res.status(400).json({ error: 'No pudimos leer tu reseña.' });
  if (datos.web) return res.status(200).json({ resena: null }); // trampa para bots

  const resena = {};
  for (const [campo, [min, max]] of Object.entries(LIMITES)) {
    const v = limpiar(datos[campo]);
    if (v.length < min) return res.status(400).json({ error: campo === 'experiencia' ? 'Cuéntanos un poco más de tu experiencia.' : 'Revisa que todos los campos estén llenos.' });
    resena[campo] = v.slice(0, max);
  }
  resena.fecha = new Date().toISOString();

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  await put(`${PREFIJO}${id}.json`, JSON.stringify(resena), {
    access: 'public', contentType: 'application/json', addRandomSuffix: false,
  });
  return res.status(201).json({ resena });
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') return await leer(res);
    if (req.method === 'POST') return await publicar(req, res);
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Método no permitido.' });
  } catch (e) {
    console.error('resenas', e);
    return res.status(500).json({ error: 'No pudimos guardar tu reseña en este momento. Intenta de nuevo.' });
  }
}
