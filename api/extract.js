const { GoogleGenerativeAI } = require('@google/generative-ai');

// Inicializar Gemini con la variable de entorno de Vercel
const genAI = new GoogleGenerativeAI(process.env.FacturasOCR);

module.exports = async function handler(req, res) {
    // Solo aceptar metodos POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { image, mimeType } = req.body;

        if (!image) {
            return res.status(400).json({ error: 'No image provided' });
        }

        // gemini-flash-latest apunta siempre al modelo Flash vigente
        // (gemini-1.5-flash ya fue dado de baja y devuelve 404)
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

        const result = await model.generateContent([prompt, ...imageParts]);
        const responseText = result.response.text();

        // Por si acaso el modelo mete etiquetas markdown
        const limpio = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        const extractedData = JSON.parse(limpio);

        return res.status(200).json(extractedData);

    } catch (error) {
        // Enviar el error exacto al frontend para saber que esta pasando
        return res.status(500).json({
            error: 'Failed to process receipt',
            detalle: error.message
        });
    }
};
