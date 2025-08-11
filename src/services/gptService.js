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
      model: 'gpt-4o-mini',
      messages: [
        {
          role: "system",
          content: `You are a fuel type classifier. Given a fuel type description from a car listing, determine if it's Diesel, Gasoline, or Hybrid. 
          
          Rules:
          - Diesel: Any diesel fuel, diesel engine, or diesel-related terms
          - Gasoline: Any petrol, gasoline, or gas engine terms
          - Hybrid: Any hybrid, electric-hybrid, or plug-in hybrid terms
          
          Return ONLY one of these three words: Diesel, Gasoline, or Hybrid.
          if its Electric/Gasoline it is hybrid , more than one fuel type is hybrid
          If the text is unclear or doesn't match any category, return one word version of the fuel type or the closest match.`
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

/**
 * Determines power in HP format from extracted text using GPT
 * @param {string} powerText - The extracted power text from the webpage
 * @returns {Promise<string>} - Returns power in format "xxx hp" or null if not found
 */
async function determinePowerHP(powerText) {
  try {
    if (!powerText || powerText.trim() === '') {
      console.log('No power text provided, returning null');
      return null;
    }

    console.log(`Analyzing power text: "${powerText}"`);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: "system",
          content: `You are a power converter. Given a power description from a car listing, extract the horsepower (HP) value.

          Rules:
          - If the hp value is in the text, return the value directly
          - Convert any power unit to HP (horsepower)
          - Common conversions: 1 kW = 1.34 HP, 1 PS = 0.986 HP
          - Extract only the numeric value and add "hp" suffix
          - Format: "xxx hp" (e.g., "150 hp", "200 hp")
          - If no power information is found, return "Unknown"
          - Round to nearest whole number
          
          Examples:
          - "150 kW" → "201 hp"
          - "200 PS" → "197 hp" 
          - "180 HP" → "180 hp"
          - "120 kW (163 PS)" → "163 hp"
          - "No power info" → "Unknown"
          
          Return ONLY the formatted power in "xxx hp" format or "Unknown".`
        },
        {
          role: "user",
          content: `Extract power in HP from: "${powerText}"`
        }
      ],
      max_tokens: 15,
      temperature: 0.1
    });

    const result = response.choices[0].message.content.trim();
    console.log(`GPT extracted power as: ${result}`);
    
    return result;
  } catch (error) {
    console.error('Error calling GPT API for power extraction:', error.message);
    // Fallback to original text if GPT fails
    return powerText || 'Unknown';
  }
}

/**
 * Determines mileage from extracted text using GPT
 * @param {string} mileageText - The extracted mileage text from the webpage
 * @returns {Promise<string>} - Returns mileage in format "xxx km" or null if not found
 */
async function determineMileage(mileageText) {
  try {
    if (!mileageText || mileageText.trim() === '') {
      console.log('No mileage text provided, returning null');
      return null;
    }

    console.log(`Analyzing mileage text: "${mileageText}"`);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: "system",
          content: `You are a mileage extractor. Given a mileage description from a car listing, extract the first valid mileage value.

          Rules:
          - If multiple mileage values are present, take only the first one
          - Keep the original unit (km or mi)
          - Format should be "xxx km" or "xxx mi"
          - Remove any commas and spaces between numbers
          - If no valid mileage is found, return "Unknown"
          
          Examples:
          - "55,000km10,000km" → "55000 km"
          - "10000 km" → "10000 km"
          - "5,500 mi" → "5500 mi"
          - "No mileage info" → "Unknown"
          
          Return ONLY the formatted mileage or "Unknown".`
        },
        {
          role: "user",
          content: `Extract mileage from: "${mileageText}"`
        }
      ],
      max_tokens: 15,
      temperature: 0.1
    });

    const result = response.choices[0].message.content.trim();
    console.log(`GPT extracted mileage as: ${result}`);
    
    return result;
  } catch (error) {
    console.error('Error calling GPT API for mileage extraction:', error.message);
    // Fallback to original text if GPT fails
    return mileageText || 'Unknown';
  }
}

module.exports = {
  determineFuelType,
  determinePowerHP,
  determineMileage
}; 