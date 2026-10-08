const { GoogleGenerativeAI } = require('@google/generative-ai');

// Inicializar Gemini con la variable de entorno de Vercel
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const MAX_INTENTOS = 3;      // numero total de intentos
const ESPERA_BASE_MS = 1500; // espera entre intentos: 1.5s, 3s...

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Decide si un error es temporal (merece reintento) o definitivo
function esErrorTemporal(error) {
    const msg = String(error && error.message ? error.message : error);
    return (
        /\b(429|500|502|503|504)\b/.test(msg) ||
        /high demand|overloaded|try again later|unavailable|timeout|fetch failed/i.test(msg)
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

    const model = genAI.getGenerativeModel({
        model: "gemini-flash-latest",
        generationConfig: { responseMimeType: "application/json" }
    });

    const imageParts = [{
        inlineData: {
            data: image,
            mimeType: mimeType || 'image/jpeg'
        }
    }];

    const prompt = "Extract the invoice number and total price from this receipt. Return ONLY a valid JSON object with exactly two keys: 'invoiceNumber' (string) and 'totalPrice' (number).";

    let ultimoError = null;

    for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
        try {
            const result = await model.generateContent([prompt, ...imageParts]);
            const responseText = result.response.text();

            // Por si acaso el modelo mete etiquetas markdown
            const limpio = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            const extractedData = JSON.parse(limpio);

            return res.status(200).json({ ...extractedData, intentos: intento });

        } catch (error) {
            ultimoError = error;
            console.log(`Intento ${intento}/${MAX_INTENTOS} fallido:`, error.message);

            // Si el error no es temporal (clave invalida, etc.) o es el ultimo intento, salir
            if (!esErrorTemporal(error) || intento === MAX_INTENTOS) break;

            await esperar(ESPERA_BASE_MS * intento);
        }
    }

    return res.status(500).json({
        error: 'Failed to process receipt',
        detalle: ultimoError ? ultimoError.message : 'Error desconocido'
    });
};
