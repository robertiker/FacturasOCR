const { GoogleGenerativeAI } = require('@google/generative-ai');

// Inicializar Gemini con la variable de entorno de Vercel
const genAI = new GoogleGenerativeAI(process.env.FacturasOCR);

// Modelos a probar en orden. La cuota se cuenta POR MODELO, asi que si uno
// agota su cuota (429) o ya no existe (404) se pasa al siguiente.
// Para cambiarlos sin tocar el codigo, define en Vercel la variable
// GEMINI_MODELS con nombres separados por comas, por ejemplo:
//   gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3.5-flash
const MODELOS = (process.env.GEMINI_MODELS ||
    'gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3.5-flash')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);

const INTENTOS_POR_MODELO = 2;  // solo para errores de saturacion (503...)
const ESPERA_BASE_MS = 1500;

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const textoError = (e) => String(e && e.message ? e.message : e);

// 429 = cuota agotada, 404 = modelo inexistente: reintentar el mismo modelo no sirve
function debeCambiarDeModelo(error) {
    return /\b(429|404)\b/.test(textoError(error));
}

// Saturacion temporal de Google: merece reintento en el mismo modelo
function esSaturacionTemporal(error) {
    const msg = textoError(error);
    return (
        /\b(500|502|503|504)\b/.test(msg) ||
        /high demand|overloaded|try again later|unavailable|fetch failed/i.test(msg)
    );
}

module.exports = async function handler(req, res) {
    // Solo aceptar metodos POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { image, mimeType } = req.body || {};

    if (!image) {
        return res.status(400).json({ error: 'No image provided' });
    }

    const imageParts = [{
        inlineData: {
            data: image,
            mimeType: mimeType || 'image/jpeg'
        }
    }];

    const prompt = "Extract the invoice number and total price from this receipt. Return ONLY a valid JSON object with exactly two keys: 'invoiceNumber' (string) and 'totalPrice' (number).";

    const fallos = [];

    for (const nombreModelo of MODELOS) {
        const model = genAI.getGenerativeModel({
            model: nombreModelo,
            generationConfig: { responseMimeType: "application/json" }
        });

        for (let intento = 1; intento <= INTENTOS_POR_MODELO; intento++) {
            try {
                const result = await model.generateContent([prompt, ...imageParts]);
                const responseText = result.response.text();

                // Por si acaso el modelo mete etiquetas markdown
                const limpio = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
                const extractedData = JSON.parse(limpio);

                return res.status(200).json({ ...extractedData, modelo: nombreModelo });

            } catch (error) {
                console.log(`[${nombreModelo}] intento ${intento}/${INTENTOS_POR_MODELO}:`, textoError(error));
                fallos.push(`${nombreModelo}: ${textoError(error).substring(0, 160)}`);

                // Cuota agotada o modelo inexistente: pasar al siguiente modelo
                if (debeCambiarDeModelo(error)) break;

                // Saturacion temporal: esperar y reintentar el mismo modelo
                if (esSaturacionTemporal(error) && intento < INTENTOS_POR_MODELO) {
                    await esperar(ESPERA_BASE_MS * intento);
                    continue;
                }

                // Otro error (clave invalida, etc.) o sin mas intentos: siguiente modelo
                break;
            }
        }
    }

    return res.status(500).json({
        error: 'Failed to process receipt',
        detalle: fallos.join(' || ')
    });
};
