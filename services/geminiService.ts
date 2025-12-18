
import { GoogleGenAI, Type } from "@google/genai";
import { Job, DailyBriefing, SmartPricing, CompanySettings, MoveLogistics } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * AI 3-Tier Pricing Engine (LOCKED MVP LOGIC + FEES)
 */
export const calculate3TierPricing = async (logistics: Partial<MoveLogistics>, settings: CompanySettings): Promise<SmartPricing> => {
  const schema = {
    type: Type.OBJECT,
    properties: {
      tiers: {
        type: Type.OBJECT,
        properties: {
          minimal: {
            type: Type.OBJECT,
            properties: {
              label: { type: Type.STRING },
              price: { type: Type.NUMBER },
              margin: { type: Type.NUMBER },
              description: { type: Type.STRING },
              depositDue: { type: Type.NUMBER },
              processingFee: { type: Type.NUMBER },
              totalWithFees: { type: Type.NUMBER }
            },
            required: ["label", "price", "margin", "depositDue", "processingFee", "totalWithFees"]
          },
          recommended: {
            type: Type.OBJECT,
            properties: {
              label: { type: Type.STRING },
              price: { type: Type.NUMBER },
              margin: { type: Type.NUMBER },
              description: { type: Type.STRING },
              depositDue: { type: Type.NUMBER },
              processingFee: { type: Type.NUMBER },
              totalWithFees: { type: Type.NUMBER }
            },
            required: ["label", "price", "margin", "depositDue", "processingFee", "totalWithFees"]
          },
          winTheJob: {
            type: Type.OBJECT,
            properties: {
              label: { type: Type.STRING },
              price: { type: Type.NUMBER },
              margin: { type: Type.NUMBER },
              description: { type: Type.STRING },
              depositDue: { type: Type.NUMBER },
              processingFee: { type: Type.NUMBER },
              totalWithFees: { type: Type.NUMBER }
            },
            required: ["label", "price", "margin", "depositDue", "processingFee", "totalWithFees"]
          }
        },
        required: ["minimal", "recommended", "winTheJob"]
      },
      breakdown: {
        type: Type.OBJECT,
        properties: {
          laborRevenue: { type: Type.NUMBER },
          truckFee: { type: Type.NUMBER },
          mileageCharge: { type: Type.NUMBER },
          fuelFee: { type: Type.NUMBER },
          complexityMultiplier: { type: Type.NUMBER },
          estimatedHours: { type: Type.NUMBER },
          baseSubtotal: { type: Type.NUMBER }
        },
        required: ["laborRevenue", "truckFee", "mileageCharge", "fuelFee", "complexityMultiplier", "estimatedHours", "baseSubtotal"]
      },
      surchargeReasons: { type: Type.ARRAY, items: { type: Type.STRING } }
    },
    required: ["tiers", "breakdown", "surchargeReasons"]
  };

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `
      Act as a high-precision moving industry pricing calculator. Apply the following LOCKED MVP LOGIC.

      LOGISTICS: ${JSON.stringify(logistics)}
      COMPANY SETTINGS: ${JSON.stringify(settings)}
      
      FEES RULE:
      - Credit Card Fee: If useCreditCard is true, add a 2.9% (0.029) processing fee to the total of each tier.
      - Agreement Requirement: Every quote must explicitly mention that a Moving Services Agreement is required and must be signed before the move.

      MVP PRICING RECAP:
      1. Labor: 2($150), 3($225), 4($300) per hour.
      2. Fixed: Truck $100, Mileage $0.99/mi.
      3. Fuel: Tiers (0-15:$0, 16-30:$25, 31-50:$45, 51-75:$65, 76-100:$85, 100+:$150).
      4. Multiplier: Stairs(+0.05/flt, cap 0.3), Walk(S:0, M:+0.08, L:+0.15), Heavy(+0.03 ea, cap 0.2), Packing(N:0, P:+0.15, F:+0.30), Same-day(+0.20), Weekend(+0.10), Month-end(+0.10).
      5. Tiers: Min(Base*Mult), Rec(Min*1.12), Win(Max(Min, Rec*0.95)).
      6. Deposit: 25% of Min, range [$150, $500].

      TIMELINE ADJUSTMENT:
      - If durationDays > 1, add a +0.10 complexity multiplier per additional day for logistics overhead.
      - Factor in timelineNotes to identify constraints that might require more labor.

      OUTPUT:
      - Tiers with processingFee and totalWithFees (totalWithFees = price + processingFee).
      - Breakdown including baseSubtotal (Labor + Truck + Mileage + Fuel).
      - Surcharge reasons.
    `,
    config: { responseMimeType: "application/json", responseSchema: schema }
  });

  return JSON.parse(response.text || "{}");
};

/**
 * AI Morning Briefing
 */
export const generateMorningBriefing = async (jobs: Job[], rankings: any): Promise<DailyBriefing> => {
  const schema = {
    type: Type.OBJECT,
    properties: {
      summary: { type: Type.STRING },
      alerts: { type: Type.ARRAY, items: { type: Type.STRING } },
      seoTask: { type: Type.STRING }
    },
    required: ["summary", "alerts", "seoTask"]
  };

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: `Analyze these moving jobs: ${JSON.stringify(jobs)}. Focus on underpriced jobs, high-risk cancellations, and mention dollar amounts. Rankings: ${JSON.stringify(rankings)}.`,
    config: { responseMimeType: "application/json", responseSchema: schema }
  });

  return JSON.parse(response.text || "{}");
};
