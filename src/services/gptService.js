const OpenAI = require('openai');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.GPT_KEY,
});

/**
 * Determines fuel type from extracted text using GPT
 * @param {string} fuelTypeText - The extracted fuel type text from the webpage
 * @returns {Promise<string>} - Returns one of: 'Diesel', 'Gasoline', or 'Hybrid'
 */
async function determineFuelType(fuelTypeText) {
  try {
    if (!fuelTypeText || fuelTypeText.trim() === '') {
      console.log('No fuel type text provided, returning null');
      return null;
    }

    console.log(`Analyzing fuel type text: "${fuelTypeText}"`);

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `You are a fuel type classifier. Given a fuel type description from a car listing, determine if it's Diesel, Gasoline, or Hybrid. 
          
          Rules:
          - Diesel: Any diesel fuel, diesel engine, or diesel-related terms
          - Gasoline: Any petrol, gasoline, or gas engine terms
          - Hybrid: Any hybrid, electric-hybrid, or plug-in hybrid terms
          
          Return ONLY one of these three words: Diesel, Gasoline, or Hybrid.
          If the text is unclear or doesn't match any category, return "Unknown".`
        },
        {
          role: "user",
          content: `Classify this fuel type: "${fuelTypeText}"`
        }
      ],
      max_tokens: 10,
      temperature: 0.1
    });

    const result = response.choices[0].message.content.trim();
    console.log(`GPT classified fuel type as: ${result}`);
    
    return result;
  } catch (error) {
    console.error('Error calling GPT API for fuel type classification:', error.message);
    // Fallback to original text if GPT fails
    return fuelTypeText || 'Unknown';
  }
}

module.exports = {
  determineFuelType
}; 