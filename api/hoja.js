// Devuelve el enlace a tu hoja de Google para el boton de la app.
// El enlace vive solo en la variable de entorno SHEET_LINK de Vercel,
// asi no queda escrito en el codigo (importante si compartes el proyecto).
// La hoja sigue siendo privada: solo la abre quien tenga permiso en Google.

module.exports = function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const url = (process.env.SHEET_LINK || '').trim();

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ url });
};
