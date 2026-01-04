
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

/**
 * Inicializa a instÃ¢ncia do GoogleGenAI usando a chave de API 
 * proveniente das variÃ¡veis de ambiente.
 */
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || 'FAKE_API_KEY_FOR_DEVELOPMENT' });

export const generateRaffleDescription = async (prizeName: string, customInstruction?: string) => {
  try {
    const basePrompt = `Escreva uma descriÃ§Ã£o empolgante e vendedora para uma rifa cujo prÃªmio principal Ã© "${prizeName}". Destaque o valor de 1 milhÃ£o de nÃºmeros e a chance de ganhar. Use emojis.`;
    const finalPrompt = customInstruction 
      ? `${basePrompt}\n\nInstruÃ§Ã£o adicional: ${customInstruction}`
      : basePrompt;

    // Explicitly typing the response as GenerateContentResponse to align with SDK best practices.
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: finalPrompt,
    });
    // The extracted string output is accessed via the .text property.
    return response.text || "DescriÃ§Ã£o nÃ£o disponÃ­vel no momento.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Participe da nossa grande rifa e concorra a prÃªmios incrÃ­veis! Milhares de chances de ganhar.";
  }
};

export const generatePrizeImage = async (prizeName: string) => {
  try {
    const prompt = `A professional product photography of ${prizeName}. High quality, cinematic lighting, 16:9 aspect ratio, clean background, luxury feel.`;
    
    // Explicitly typing the response as GenerateContentResponse.
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      // Using the standard contents object format with parts.
      contents: { parts: [{ text: prompt }] },
      config: {
        imageConfig: {
          aspectRatio: "16:9"
        }
      }
    });

    // Iterate through candidates and parts to find the image part, as per Gemini API guidelines.
    if (response.candidates && response.candidates.length > 0) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
    }
    return null;
  } catch (error) {
    console.error("Gemini Image Error:", error);
    return null;
  }
};

export const announceWinner = async (winnerName: string, prizeName: string, number: number) => {
  try {
    // Explicitly typing the response as GenerateContentResponse.
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Escreva um anÃºncio de vencedor para uma rifa. O vencedor Ã© "${winnerName}", o prÃªmio Ã© "${prizeName}" e o nÃºmero sorteado foi "${number.toString().padStart(6, '0')}". Seja festivo e use emojis!`,
    });
    // The extracted string output is accessed via the .text property.
    return response.text || `ParabÃ©ns ao grande ganhador ${winnerName}!`;
  } catch (error) {
    console.error("Gemini Error:", error);
    return `ParabÃ©ns ao ganhador ${winnerName} com o nÃºmero ${number.toString().padStart(6, '0')}!`;
  }
};
