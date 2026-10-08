// Recibe los datos desde la app y los reenvia al Apps Script de la hoja.
// La URL y el token viven solo en Vercel (variables SHEET_URL y SHEET_TOKEN),
// nunca llegan al navegador.

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const url = process.env.SHEET_URL;
    const token = process.env.SHEET_TOKEN;

    if (!url || !token) {
        return res.status(500).json({ error: 'Faltan las variables SHEET_URL o SHEET_TOKEN en Vercel' });
    }

    const { fecha, establecimiento, factura, gasto, nombreFoto } = req.body || {};

    try {
        const respuesta = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, fecha, establecimiento, factura, gasto, nombreFoto }),
            redirect: 'follow' // Apps Script responde con una redireccion
        });

        const texto = await respuesta.text();

        let data;
        try {
            data = JSON.parse(texto);
        } catch (e) {
            return res.status(502).json({
                error: 'Respuesta inesperada de Google (revisa que el despliegue sea "Cualquier persona")',
                detalle: texto.substring(0, 200)
            });
        }

        if (!data.ok) {
            return res.status(502).json({ error: data.error || 'Error al escribir en la hoja' });
        }

        return res.status(200).json({ ok: true });

    } catch (error) {
        return res.status(500).json({
            error: 'No se pudo contactar con Google Sheets',
            detalle: error.message
        });
    }
};
