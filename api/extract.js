const { GoogleGenerativeAI } = require('@google/generative-ai');

// Inicializar Gemini con variable de entorno de Vercel
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const imageParts = [{
            inlineData: {
                data: image,
                mimeType: mimeType
            }
        }];

        const prompt = "Extract the invoice number and total price from this receipt. Return ONLY a valid JSON object with exactly two keys: 'invoiceNumber' (string) and 'totalPrice' (number). Do not use markdown formatting.";

        const result = await model.generateContent([prompt, ...imageParts]);
        const responseText = result.response.text();
        
        const extractedData = JSON.parse(responseText);

        return res.status(200).json(extractedData);

    } catch (error) {
        return res.status(500).json({ error: 'Failed to process receipt' });
    }
};