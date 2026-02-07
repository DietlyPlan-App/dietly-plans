
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { UserStats, AIResponse, DailyPlan, MonthPlan, Meal, MacroSplit } from "../types";
import { supabase } from "./supabaseClient";

// --- PRODUCTION-SAFE LOGGING ---
const isDev = import.meta.env.DEV;
const devLog = (...args: any[]) => isDev && console.log(...args);
const devError = (...args: any[]) => isDev && console.error(...args);

// --- OWNER CONFIGURATION ---
const OWNER_CONFIG = {
    modelName: "gemini-1.5-flash",
    apiKey: import.meta.env.VITE_GEMINI_API_KEY,
    // In production, use Edge Function; in dev, use direct API (for testing)
    useEdgeFunction: !isDev
};

// Only log in development
devLog("🚀 Gemini Service Initialized", { useEdgeFunction: OWNER_CONFIG.useEdgeFunction });

// --- EDGE FUNCTION CALLER (Secure Server-Side API Key) ---
const callGeminiViaEdge = async (prompt: string, schema?: any): Promise<string> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Not authenticated");

    const { data, error } = await supabase.functions.invoke('gemini-proxy', {
        body: { prompt, schema, maxTokens: 60000 }
    });

    if (error) throw new Error(`Edge Function Error: ${error.message}`);
    if (!data?.text) throw new Error("No response from AI");

    return data.text;
};

// --- MATH HELPERS (Advanced) ---
export const calculateBaseWater = (weightKg: number, activity: string, isBreastfeeding: boolean, age: number): number => {
    let base = 0;

    // 1. PEDIATRIC WATER (Holliday-Segar Rule) - Age < 18
    if (age < 18) {
        if (weightKg <= 10) {
            base = weightKg * 100; // 100ml/kg for first 10kg
        } else if (weightKg <= 20) {
            base = 1000 + ((weightKg - 10) * 50); // 50ml/kg for next 10kg
        } else {
            base = 1500 + ((weightKg - 20) * 20); // 20ml/kg for remaining
        }
        base = base / 1000; // Convert to Litres
    }
    // 2. ADULT WATER
    else {
        base = weightKg * 0.033;
    }

    const activityMultipliers: Record<string, number> = {
        'sedentary': 1.0, 'light': 1.1, 'moderate': 1.25, 'active': 1.4, 'athlete': 1.6
    };

    base = base * (activityMultipliers[activity] || 1.0);

    if (isBreastfeeding) base += 0.8;

    // SAFETY CAP: Prevent Hyponatremia risk
    return Math.min(parseFloat(base.toFixed(1)), 4.5);
};

export const calculateBMR = (weightKg: number, heightCm: number, age: number, gender: string, meds: string): number => {
    // MIFFLIN-ST JEOR (Gold Standard)
    let base = (10 * weightKg) + (6.25 * heightCm) - (5 * age);
    const adjustment = gender === 'male' ? 5 : -161;
    base += adjustment;

    // GERIATRIC ADJUSTMENT (Age > 65)
    // 1.05x multiplier to prevent underfeeding due to equation inaccuracy in elderly.
    if (age > 65) base = base * 1.05;

    return Math.round(base);
};

// SCHOFIELD EQUATION (WHO Standard for Pediatrics < 18)
export const calculatePediatricBMR = (weightKg: number, age: number, gender: string): number => {
    if (gender === 'male') {
        if (age < 3) return (60.9 * weightKg) - 54;
        if (age < 10) return (22.7 * weightKg) + 495;
        return (17.5 * weightKg) + 651;
    } else {
        if (age < 3) return (61.0 * weightKg) - 51;
        if (age < 10) return (22.5 * weightKg) + 499;
        return (12.2 * weightKg) + 746;
    }
};

const calculateTDEE = (bmr: number, activity: string, age: number = 30): number => {
    // P2 FIX BUG-017: ELDERLY ACTIVITY MULTIPLIER CAP
    // Elderly users (65+, 75+) have lower actual energy expenditure even at same activity level
    let multipliers: Record<string, number>;

    if (age >= 75) {
        // 75+ severe cap - prevent overestimation for very elderly
        multipliers = {
            'sedentary': 1.2, 'light': 1.3, 'moderate': 1.4, 'active': 1.5, 'athlete': 1.55
        };
    } else if (age >= 65) {
        // 65-74 moderate cap
        multipliers = {
            'sedentary': 1.2, 'light': 1.35, 'moderate': 1.5, 'active': 1.6, 'athlete': 1.7
        };
    } else {
        // Standard multipliers for <65
        multipliers = {
            'sedentary': 1.2, 'light': 1.375, 'moderate': 1.55, 'active': 1.725, 'athlete': 1.9
        };
    }

    return Math.round(bmr * (multipliers[activity] || 1.2));
};

// --- BIOLOGICAL MACRO CALCULATOR ---
export const calculateOptimalMacros = (stats: UserStats, targetCalories: number, overrides: {
    isRenal: boolean,
    isGeriatric: boolean,
    isNoGallbladder: boolean,
    isDiabetic: boolean,
    isGLP1: boolean,
    isDialysis?: boolean,
    isPKU?: boolean,
    isPCOS?: boolean,
    isMenopauseAge?: boolean,
    isGestationalDiabetes?: boolean
}): MacroSplit => {
    // 1. MACRO SPLIT STRATEGY (Percentage Based)
    let pSplit = 0.30;
    let fSplit = 0.30;
    let cSplit = 0.40;

    // DIET BASELINES
    if (stats.dietType === 'Keto') {
        pSplit = 0.25; fSplit = 0.70; cSplit = 0.05;
    } else if (stats.dietType === 'Low Carb') {
        pSplit = 0.40; fSplit = 0.40; cSplit = 0.20;
    } else if (stats.dietType === 'High Protein') {
        pSplit = 0.45; fSplit = 0.25; cSplit = 0.30;
    } else if (stats.dietType === 'Vegan' || stats.dietType === 'Vegetarian') {
        pSplit = 0.25; fSplit = 0.25; cSplit = 0.50;
    }

    // --- BIOAVAILABILITY CORRECTION (PDCAAS) ---
    // Plant protein is ~10-20% less bioavailable. Vegans need MORE protein to match animal amino acid profile.
    if (stats.dietType === 'Vegan' || stats.dietType === 'Vegetarian') {
        const pBoost = pSplit * 0.15; // +15% relative increase (PDCAAS Correction)
        pSplit += pBoost;
        // Balance the equation: Remove from Carbs/Fats
        fSplit -= (pBoost / 2);
        cSplit -= (pBoost / 2);
    }

    // 2. MEDICAL OVERRIDES (CONFLICT RESOLUTION MATRIX)

    // CRITICAL: PKU (Phenylketonuria) - MUST BE FIRST (Prevalence: 1 in 24,000)
    // PKU patients CANNOT metabolize phenylalanine - high protein is DEADLY
    if (overrides.isPKU) {
        pSplit = 0.10; // STRICT 10% protein cap - all from Phe-free sources
        cSplit = 0.55; // Higher carbs from low-Phe sources
        fSplit = 0.35;
        // Note: This OVERRIDES all other protein adjustments
        console.warn("⚠️ CRITICAL: PKU detected. Enforcing 10% protein maximum.");
    }

    // A. GALLBLADDER vs KETO
    if (!overrides.isPKU && overrides.isNoGallbladder && fSplit > 0.40) {
        // Force cap fat at 40% to prevent malabsorption
        const fatExcess = fSplit - 0.40;
        fSplit = 0.40;
        pSplit += (fatExcess * 0.5);
        cSplit += (fatExcess * 0.5);
    }

    // B. RENAL vs KETO/HIGH PROTEIN/GERIATRIC
    // Renal Safety Trumps ALL (except PKU which is already handled).
    if (overrides.isRenal && !overrides.isPKU) {
        pSplit = Math.min(pSplit, 0.15); // Strict 15% Cap
        if (cSplit < 0.35) cSplit = 0.35; // Minimum 35% Carb for metabolic stability
        fSplit = 1.0 - (pSplit + cSplit);
    }

    // B2. DIALYSIS EXCEPTION (Safety Audit Fix #1)
    // Dialysis patients require HIGH protein (1.2g/kg) due to filtration losses.
    // This MUST override the standard "Renal Low Protein" rule above.
    if (overrides.isDialysis && !overrides.isPKU) {
        // Force minimum 30% Protein (High Protein mode)
        pSplit = Math.max(pSplit, 0.30);
        // Ensure balance
        if (pSplit + fSplit + cSplit > 1.0) {
            cSplit = 1.0 - (pSplit + fSplit);
        }
    }
    // C. GERIATRIC (Only if NOT Renal and NOT PKU) - SARCOPENIA PREVENTION
    else if (overrides.isGeriatric && !overrides.isPKU) {
        // Elderly need higher protein (1.0-1.2g/kg) to prevent muscle loss
        // Research: At least 25-30% protein for sarcopenia prevention
        if (pSplit < 0.30) {
            pSplit = 0.30; // Minimum 30% protein for sarcopenia prevention
        }
        if (pSplit + fSplit + cSplit > 1.0) {
            cSplit = 1.0 - (pSplit + fSplit);
        }
    }

    // D. PCOS (Polycystic Ovary Syndrome) - LOW GLYCEMIC INDEX
    // Affects 8-13% of women - insulin resistance requires lower carbs
    if (overrides.isPCOS && !overrides.isPKU && !overrides.isRenal) {
        if (cSplit > 0.35) {
            const carbExcess = cSplit - 0.35;
            cSplit = 0.35; // Cap at 35% carbs for insulin sensitivity
            pSplit += (carbExcess * 0.6); // Increase protein
            fSplit += (carbExcess * 0.4); // Increase healthy fats
        }
    }

    // E. DIABETES / INSULIN RESISTANCE (New Remediation)
    if (overrides.isDiabetic && !overrides.isPKU) {
        if (cSplit > 0.35) {
            const carbExcess = cSplit - 0.35;
            cSplit = 0.35; // Cap at 35%
            pSplit += (carbExcess * 0.6); // Push most to protein
            fSplit += (carbExcess * 0.4);
        }
    }

    // F. GESTATIONAL DIABETES - STRICTER THAN REGULAR DIABETES
    if (overrides.isGestationalDiabetes && !overrides.isPKU) {
        if (cSplit > 0.30) {
            const carbExcess = cSplit - 0.30;
            cSplit = 0.30; // Stricter 30% cap for pregnancy
            pSplit += (carbExcess * 0.7); // Higher protein for fetal development
            fSplit += (carbExcess * 0.3);
        }
    }

    // G. GLP-1 AGONIST (Ozempic/Wegovy) Safety
    if (overrides.isGLP1 && !overrides.isPKU) {
        pSplit = Math.max(pSplit, 0.40); // Force VERY HIGH Protein (40%) to prevent muscle wasting
        if (pSplit + fSplit + cSplit > 1.0) {
            // Reduce carbs/fat proportionally
            const remainder = 1.0 - pSplit;
            fSplit = remainder * 0.5;
            cSplit = remainder * 0.5;
        }
    }

    // 3. FINAL NORMALIZATION (FLOAT SAFETY)
    // Ensures splits sum to exactly 1.0 (Fixes 0.33 + 0.33 + 0.33 = 0.99 bug)
    const total = pSplit + fSplit + cSplit;
    if (Math.abs(total - 1.0) > Number.EPSILON) {
        pSplit = pSplit / total;
        fSplit = fSplit / total;
        cSplit = cSplit / total;
    }

    // 4. CALCULATE GRAMS
    let proteinGrams = Math.round((targetCalories * pSplit) / 4);
    let fatGrams = Math.round((targetCalories * fSplit) / 9);
    let carbGrams = Math.round((targetCalories * cSplit) / 4);

    return {
        protein: proteinGrams,
        fats: fatGrams,
        carbs: carbGrams,
        calories: targetCalories,
        fiber: 25 + (stats.gender === 'male' ? 10 : 0),
        sugar: 25 // Default safe cap
    };
};

const ALLERGY_MAP: Record<string, string[]> = {
    'gluten': ['wheat', 'rye', 'barley', 'malt', 'seitan', 'soy sauce', 'bread', 'pasta', 'flour', 'beer'],
    // Separate Lactose (intolerance) from true Dairy Allergy
    'dairy': ['milk', 'cheese', 'yogurt', 'butter', 'cream', 'whey', 'casein', 'ghee', 'lactose'],
    'lactose': ['milk', 'cream', 'ice cream', 'soft cheese', 'ricotta', 'mozzarella', 'fresh cheese'],
    'nut': ['peanut', 'almond', 'cashew', 'walnut', 'pecan', 'pistachio', 'macadamia', 'hazelnut'],
    'peanut': ['satay', 'arachis'],
    'egg': ['albumin', 'mayonnaise', 'meringue'],
    'soy': ['tofu', 'tempeh', 'edamame', 'miso', 'soya', 'tamari'],
    'shellfish': ['shrimp', 'crab', 'lobster', 'prawn', 'mussel', 'oyster', 'clam', 'scallop'],
    'seafood': ['fish', 'tuna', 'salmon', 'cod', 'tilapia', 'shrimp', 'crab', 'lobster'],

    // P1 FIX BUG-010: EXPANDED ALLERGEN LIST (EU/FDA Standard Top Allergens)
    'sesame': ['tahini', 'hummus', 'halva', 'sesame oil', 'benne seeds', 'gingelly', 'sesame seeds'],
    'mustard': ['dijon', 'mustard seed', 'mustard oil', 'mustard greens', 'mustard powder'],
    'celery': ['celeriac', 'celery salt', 'celery seed', 'lovage'],
    'lupin': ['lupin flour', 'lupini beans', 'lupin protein'],
    'coconut': ['coconut oil', 'coconut milk', 'coconut cream', 'copra', 'desiccated coconut', 'coconut water'],
    'corn': ['maize', 'cornstarch', 'corn syrup', 'polenta', 'hominy', 'masa', 'dextrose', 'maltodextrin'],
    'nightshade': ['tomato', 'potato', 'eggplant', 'bell pepper', 'chili', 'paprika', 'goji', 'cayenne'],
    'allium': ['onion', 'garlic', 'leek', 'shallot', 'chives', 'scallion', 'spring onion'],
    'sulfite': ['wine', 'dried fruit', 'pickled foods', 'vinegar', 'processed meats', 'molasses'],
    'histamine': ['aged cheese', 'wine', 'sauerkraut', 'fermented foods', 'smoked fish', 'avocado', 'spinach', 'tomato', 'vinegar', 'alcohol'],
};

export const runSafetyWatchdog = (meal: Meal, allergies: string): Meal => {
    if (!allergies || allergies.length < 3) return meal;

    const userAllergies = allergies.toLowerCase().split(/,|;/).map(s => s.trim()).filter(s => s.length > 2);

    // TOTAL SPECTRUM SCAN: Concatenate ALL text fields
    const scanTarget = [
        meal.name,
        meal.description || "",
        meal.ingredients.join(" "),
        meal.instructions.join(" "),
        meal.sideDish || "",
        meal.warning || ""
    ].join(" ").toLowerCase();

    let violation = null;

    for (const allergen of userAllergies) {
        const regex = new RegExp(`\\b${allergen}\\b`, 'i');
        if (regex.test(scanTarget)) {
            violation = `CRITICAL WARNING: Contains '${allergen}' detected in meal text.`;
            break;
        }
        if (ALLERGY_MAP[allergen]) {
            for (const hidden of ALLERGY_MAP[allergen]) {
                const hiddenRegex = new RegExp(`\\b${hidden}\\b`, 'i');
                if (hiddenRegex.test(scanTarget)) {
                    violation = `CRITICAL WARNING: Contains '${hidden}' (Hidden ${allergen} source).`;
                    break;
                }
            }
        }
        if (violation) break;
    }

    if (violation) {
        return { ...meal, warning: violation };
    }
    return meal;
};

// --- DYNAMIC FALLBACK SYSTEM (SAFE MODE) ---
export const getDynamicFallback = (stats: UserStats, calories: number, macros: MacroSplit): any => {
    const diet = stats.dietType.toLowerCase();
    const allergies = (stats.allergies + " " + stats.medications).toLowerCase();

    let baseProtein = "Chicken Breast";
    let baseCarb = "Brown Rice";
    let baseFat = "Olive Oil";
    let baseVeg = "Steamed Broccoli";

    // 1. VEGAN / VEGETARIAN SAFEGUARD
    if (diet.includes('vegan') || diet.includes('vegetarian')) {
        baseProtein = "Tofu";
        if (allergies.includes('soy')) {
            baseProtein = "Lentils";
            // FALLBACK FOR "IMPOSSIBLE COMPATIBILITY" (No Soy + No Legumes)
            if (allergies.includes('legume') || allergies.includes('bean') || allergies.includes('lentil')) {
                baseProtein = "Pea Protein Isolate & Hemp Seeds";
            }
            // P1 FIX: THE IMPOSSIBLE VEGAN (No Soy, No Gluten, No Nuts, No Legumes)
            if (
                (allergies.includes('legume') || allergies.includes('bean') || allergies.includes('pea')) &&
                (allergies.includes('nut') || allergies.includes('almond')) &&
                (allergies.includes('gluten') || allergies.includes('wheat'))
            ) {
                baseProtein = "Rice Protein Powder & Hemp Hearts";
            }
        }
    }

    // 2. KETO SAFEGUARD
    if (diet.includes('keto')) {
        baseCarb = "Cauliflower Rice";
        baseFat = "Avocado Oil";
    }

    // 3. RENAL SAFEGUARD (CRITICAL)
    if (stats.medications.toLowerCase().includes('renal') || stats.medications.toLowerCase().includes('kidney')) {
        baseProtein = "Egg Whites"; // Lower phosphorus than chicken
        baseCarb = "White Rice"; // Lower phosphorus than brown rice
        baseVeg = "Green Beans"; // Low potassium
    }

    // 4. ALLERGY SAFEGUARD
    // FIXME: [CRITICAL LOGIC FRAGILITY] - This logic is vulnerable to "Double Anaphylaxis" (Chicken+Fish Allergy).
    // Swapping Chicken->Fish without checking Fish Allergy is dangerous.
    // However, fixing it blindly risks breaking the RENAL Safe-Path (Egg Whites).
    // DO NOT TOUCH THIS LOGIC WITHOUT A FULL REWRITE OF THE PRIORITY MATRIX (RENAL > ALLERGY).
    if (allergies.includes('chicken') && !diet.includes('vegan')) baseProtein = "White Fish";
    if (allergies.includes('rice') && !diet.includes('keto')) baseCarb = "Quinoa";
    if (allergies.includes('egg') && baseProtein === "Egg Whites") baseProtein = "Chicken Breast";

    const fallbackMeal = (name: string, cal: number) => ({
        name: name,
        ingredients: [baseCarb, baseProtein, baseFat, baseVeg],
        instructions: ["Cook simple ingredients.", "Season with herbs.", "Combine."],
        calories: cal,
        macros: { p: Math.round(cal * 0.3 / 4), c: Math.round(cal * 0.4 / 4), f: Math.round(cal * 0.3 / 9) }
    });

    return {
        safetyVerification: "FALLBACK PROTOCOL: AI Service Down. Generated Diet-Safe Emergency Plan.",
        medicationAnalysis: "Consult Physician.",
        climateAnalysis: { isHot: false, advice: "Hydrate." },
        budgetStrategy: "Essentials Only.",
        pantryTips: `${baseProtein}, ${baseCarb}, ${baseVeg}`,
        phaseName: "Safety Mode",
        weekTemplate: Array(7).fill(0).map((_, i) => ({
            dayIndex: i,
            meals: {
                breakfast: fallbackMeal("Safe Start Bowl", Math.round(calories * 0.25)),
                lunch: fallbackMeal("Safe Power Lunch", Math.round(calories * 0.35)),
                dinner: fallbackMeal("Safe Light Dinner", Math.round(calories * 0.30)),
                snack: fallbackMeal("Safe Snack", Math.round(calories * 0.10))
            },
            dailyMacros: { ...macros, calories: calories }
        })),
        shoppingList: [{ category: "Emergency Essentials", items: [baseProtein, baseCarb, baseVeg, baseFat] }]
    };
};

const macroSchema: Schema = {
    type: Type.OBJECT,
    properties: {
        p: { type: Type.NUMBER },
        c: { type: Type.NUMBER },
        f: { type: Type.NUMBER },
        fiber: { type: Type.NUMBER },
        sugar: { type: Type.NUMBER },
        sodium: { type: Type.NUMBER },
    },
    required: ["p", "c", "f"],
};

const mealSchema: Schema = {
    type: Type.OBJECT,
    properties: {
        name: { type: Type.STRING },
        description: { type: Type.STRING },
        ingredients: { type: Type.ARRAY, items: { type: Type.STRING } },
        instructions: { type: Type.ARRAY, items: { type: Type.STRING } },
        calories: { type: Type.NUMBER },
        macros: macroSchema,
        sideDish: { type: Type.STRING },
        warning: { type: Type.STRING }
    },
    required: ["name", "ingredients", "instructions", "calories", "macros"],
};

const dailyMacroSchema: Schema = {
    type: Type.OBJECT,
    properties: {
        protein: { type: Type.NUMBER },
        carbs: { type: Type.NUMBER },
        fats: { type: Type.NUMBER },
        fiber: { type: Type.NUMBER },
        calories: { type: Type.NUMBER },
    },
    required: ["protein", "carbs", "fats", "calories"]
};

const daySchema: Schema = {
    type: Type.OBJECT,
    properties: {
        dayIndex: { type: Type.INTEGER },
        meals: {
            type: Type.OBJECT,
            properties: {
                breakfast: mealSchema,
                lunch: mealSchema,
                dinner: mealSchema,
                snack: mealSchema,
            },
            required: ["breakfast", "lunch", "dinner"]
        },
        dailyMacros: dailyMacroSchema
    },
    required: ["meals", "dailyMacros", "dayIndex"]
};

const shoppingCategorySchema: Schema = {
    type: Type.OBJECT,
    properties: {
        category: { type: Type.STRING },
        items: { type: Type.ARRAY, items: { type: Type.STRING } }
    },
    required: ["category", "items"]
};

const batch1Schema: Schema = {
    type: Type.OBJECT,
    properties: {
        safetyVerification: { type: Type.STRING },
        medicationAnalysis: { type: Type.STRING },
        climateAnalysis: {
            type: Type.OBJECT,
            properties: { isHot: { type: Type.BOOLEAN }, advice: { type: Type.STRING } },
            required: ["isHot", "advice"]
        },
        budgetStrategy: { type: Type.STRING },
        pantryTips: { type: Type.STRING },
        phaseName: { type: Type.STRING },
        planTitle: { type: Type.STRING, description: "A creative, short title for this plan, e.g. 'Keto Shred v1' or 'Vegan Muscle Builder'. Max 4 words." },
        weekTemplate: { type: Type.ARRAY, items: daySchema },
        shoppingList: { type: Type.ARRAY, items: shoppingCategorySchema }
    },
    required: ["safetyVerification", "planTitle", "phaseName", "weekTemplate", "shoppingList", "climateAnalysis", "budgetStrategy"]
};

const batchNextSchema: Schema = {
    type: Type.OBJECT,
    properties: {
        phaseName: { type: Type.STRING },
        weekTemplate: { type: Type.ARRAY, items: daySchema },
        shoppingList: { type: Type.ARRAY, items: shoppingCategorySchema }
    },
    required: ["phaseName", "weekTemplate", "shoppingList"]
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const cleanJson = (text: string | undefined | null): string => {
    if (!text) return "{}"; // Safety Fallback
    let cleaned = text.replace(/```json\n?|\n?```/g, "");
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }
    return cleaned;
};

const validateFoodPhysics = (meal: Meal): Meal => {
    const p = meal.macros.p;
    const f = meal.macros.f;
    const c = meal.macros.c;
    const fiber = meal.macros.fiber || 0;

    const netCarbs = Math.max(0, c - fiber);
    const calculatedCals = (p * 4) + (f * 9) + (netCarbs * 4) + (fiber * 2);

    const diff = Math.abs(meal.calories - calculatedCals);

    if (diff > (meal.calories * 0.15)) {
        return {
            ...meal,
            calories: Math.round(calculatedCals)
        };
    }
    return meal;
};

export const generateMealPlan = async (stats: UserStats, onProgress?: (msg: string) => void): Promise<AIResponse> => {
    if (!OWNER_CONFIG.apiKey) {
        devError("❌ GEMINI SERVICE ERROR: API Key is missing in OWNER_CONFIG");
        throw new Error("API Key is missing.");
    }
    devLog("✅ GEMINI SERVICE: API Key detected (length: " + OWNER_CONFIG.apiKey.length + ")");

    const ai = new GoogleGenAI({ apiKey: OWNER_CONFIG.apiKey });

    let bmr: number;
    const metabolicLog: string[] = [];
    const logAdjustment = (msg: string) => {
        metabolicLog.push(msg);
        if (onProgress) onProgress(msg);
    };

    // 1. KATCH-McARDLE (Gold Standard for Athletes/Body Comp)
    if (stats.bodyFat !== undefined && stats.bodyFat > 0) {
        const leanBodyMassKg = stats.weight * (1 - (stats.bodyFat / 100));
        bmr = 370 + (21.6 * leanBodyMassKg);
        logAdjustment(`Biometrics: Using Katch-McArdle Formula (LBM: ${leanBodyMassKg.toFixed(1)}kg)`);
    }
    // 2. PEDIATRIC (<18)
    else if (stats.age < 18) {
        bmr = calculatePediatricBMR(stats.weight, stats.age, stats.gender);
    }
    // 3. MIFFLIN-ST JEOR (Standard)
    else {
        bmr = calculateBMR(stats.weight, stats.height, stats.age, stats.gender, stats.medications);
    }

    // --- THYROID CORRECTION ---
    // Hypothyroidism often lowers BMR by 5-10% even when treated.
    const combinedHealthCheck = (stats.medications + " " + stats.allergies).toLowerCase();
    const isThyroidDetection = /thyroid|levothyroxine|hypothyroid|hashimoto/i.test(combinedHealthCheck);

    if (stats.isThyroid || isThyroidDetection) {
        bmr = Math.round(bmr * 0.95);
        logAdjustment("Medical Adjustment: -5% BMR reduction applied for Thyroid condition context.");
    }

    let tdee = calculateTDEE(bmr, stats.activity, stats.age);

    // --- DIURETIC / CHEMICAL HYDRATION FACTOR ---
    const isDiureticUser = /coffee|caffeine|spironolactone|furosemide|lasix/i.test(combinedHealthCheck);
    let waterFactor = 1.0;
    if (isDiureticUser) {
        waterFactor = 1.2; // +20% Water for Diuretics
        logAdjustment("Chemical Balance: Diuretic usage detected (Caffeine/Meds). Increasing Hydration Target by 20%.");
    }

    const baseWater = calculateBaseWater(stats.weight, stats.activity, stats.isBreastfeeding, stats.age) * waterFactor;

    // ROUND 8: RENAL FLUID RESTRICTION (LETHAL RISK FIX)
    // Renal Cap Logic moved to 'safeWater' calculation below to ensure 'isRenal' is defined.

    const bmi = parseFloat((stats.weight / ((stats.height / 100) ** 2)).toFixed(1));

    // BUG-002 FIX: Eating Disorder Risk Screening
    // Detects high-risk patterns that may indicate eating disorder vulnerability
    // This is not a block - UI will show resources modal and allow proceeding after acknowledgment
    const isHighRiskEDPattern = (
        bmi < 18.5 &&
        stats.goal === 'lose' &&
        stats.age >= 14 &&
        stats.age <= 35 &&
        !stats.isPregnant // Pregnancy overrides concern
    );
    if (isHighRiskEDPattern) {
        throw new Error("EATING_DISORDER_SCREENING: Your current BMI is already in the underweight range. We cannot in good conscience generate a weight loss plan. If you are struggling with your relationship with food, please reach out: National Eating Disorders Association: 1-800-931-2237 | Crisis Text Line: Text 'NEDA' to 741741");
    }

    // --- MENSTRUAL CYCLE ADJUSTMENT (LUTEAL PHASE) ---
    let cycleCalorieBuffer = 0;
    if (stats.lastPeriodStart) {
        const lastPeriod = new Date(stats.lastPeriodStart);
        const today = new Date();
        const diffDays = Math.floor((today.getTime() - lastPeriod.getTime()) / (1000 * 3600 * 24));

        // Luteal Phase is approx Day 15 to Day 28
        if (diffDays >= 14 && diffDays <= 28) {
            cycleCalorieBuffer = 250; // +250kcal for progesterone metabolic increase
            logAdjustment(`Biological Cycle: Luteal Phase detected (Day ${diffDays}). Adding +250kcal buffer to prevent hunger crashes.`);
        }
    }

    // INPUT SANITIZATION (SEC-001 STRENGTHENED)
    const sanitize = (str: string) => str
        .replace(/[{}[\]]/g, "")
        .replace(/System:/gi, "")
        .replace(/Instructions?:/gi, "")
        .replace(/ignore (previous|above|prior)/gi, "")
        .replace(/you are now/gi, "")
        .replace(/forget everything/gi, "")
        .slice(0, 500); // Max 500 chars to limit attack surface
    stats.allergies = sanitize(stats.allergies);
    stats.medications = sanitize(stats.medications);
    // ROUND 8: Prevent Prompt Injection via Name
    stats.name = sanitize(stats.name || "").replace(/[^a-zA-Z0-9 ]/g, "");

    // --- SAFETY WATCHDOG ---
    // --- SAFETY WATCHDOG ---
    const combinedHealthText = (stats.medications + " " + stats.allergies + " " + (stats.conditions || "")).toLowerCase();

    // DEBUG: Log the health text to ensure inputs are arriving
    devLog("🚑 GEMINI SERVICE: Scanning Health Text:", combinedHealthText);

    // HELPER: Context-Aware Detection (Negation Handling + Word Boundaries)
    // Returns true if 'term' is found BUT NOT preceded by "no", "not", "without".
    const containsCondition = (text: string, regex: RegExp): boolean => {
        const match = text.match(regex);
        if (!match) return false;

        // Simple Negation Check (Look behind 20 chars for "no ", "negative for ", etc)
        const index = match.index || 0;
        const lookbehind = text.substring(Math.max(0, index - 25), index);
        if (/no\b|not\b|negative|without/i.test(lookbehind)) {
            devLog(`ℹ️ Negation Detected: Found '${match[0]}' but ignored due to context ('${lookbehind.trim()}').`);
            return false;
        }
        return true;
    };

    // 1. RENAL FAILURE (CRITICAL REFACTOR)
    // Must distinguish from "Adrenal" match and "Kidney Stones".
    // "Renal" must be its own word, not part of "Adrenal".
    // "Kidney" implies failure ONLY if context suggests failure (CKD, Dialysis) OR if generic "Kidney" is used without "Stone".

    // Regex Explain:
    // \bckd\b : 'ckd'
    // \bdialysis\b : 'dialysis'
    // \brenal\b : word 'renal' (excludes 'adrenal')
    // kidney failure|kidney disease : explicit
    const isRenalFailureRegex = /\bckd\b|\bdialysis\b|\brenal failure\b|\brenal disease\b|\bkidney failure\b|\bkidney disease\b/i;

    // Legacy support: "Renal" or "Kidney" alone might imply failure, but we must protect against "Kidney Stone".
    // We'll set a base flag, then refine it.
    let isRenal = containsCondition(combinedHealthText, isRenalFailureRegex);

    if (!isRenal) {
        // Check for loose "renal" or "kidney" but EXCLUDE specific false positives
        // Exclude: "Adrenal", "Kidney Stone", "Kidney Bean"
        if (/\brenal\b/i.test(combinedHealthText) && !/adrenal/i.test(combinedHealthText)) isRenal = true;
        if (/\bkidney\b/i.test(combinedHealthText) && !/stone|bean/i.test(combinedHealthText)) isRenal = true;
    }

    // 2. DIABETES (Negation Aware)
    const isDiabetes = containsCondition(combinedHealthText, /\bdiabetes\b|\bdiabetic\b|\binsulin\b|\bmetformin\b/i);

    // P0 FIX BUG-003: TYPE 1 vs TYPE 2 DIABETES DIFFERENTIATION
    // Type 1 = Insulin-dependent, cannot metabolize carbs, HIGH DKA RISK with Keto
    // Type 2 = Often Metformin-controlled, CAN safely do Keto under supervision
    const isType1Diabetes = containsCondition(combinedHealthText, /type.?1|t1d|insulin.?dependent|juvenile.?diabetes|iddm/i) &&
        !containsCondition(combinedHealthText, /type.?2|t2d|metformin|glipizide|januvia|ozempic/i);
    const isType2Diabetes = containsCondition(combinedHealthText, /type.?2|t2d|metformin|glipizide|januvia|jardiance|farxiga|invokana|ozempic|wegovy/i) ||
        (isDiabetes && !isType1Diabetes); // Default to Type 2 if generic "diabetes" mentioned

    // CRITICAL SAFETY: Type 1 + Keto = Diabetic Ketoacidosis (DKA) Risk
    if (isType1Diabetes && stats.dietType.toLowerCase().includes('keto')) {
        console.error("⛔ CRITICAL SAFETY: Type 1 Diabetes + Keto = DKA RISK. Overriding to Low-Glycemic Balanced.");
        stats.dietType = 'Low Carb'; // Force safer alternative
        if (onProgress) onProgress("⚠️ Medical Override: Type 1 Diabetes detected. Keto is contraindicated (DKA risk). Switching to Low-Carb Balanced diet.");
    }

    const isHistamineIntolerant = containsCondition(combinedHealthText, /histamine|dao|mast cell|mcas/i);
    const isNoGallbladder = containsCondition(combinedHealthText, /gallbladder|cholecystectomy|bile/i);

    if (isRenal) console.warn("⚠️ CRITICAL: RENAL CONDITION DETECTED. ACTIVATING SAFETY LOCKS.");

    const isGeriatric = stats.age > 65;
    const isGout = containsCondition(combinedHealthText, /gout|uric|hyperuricemia/i);
    const isHypertension = containsCondition(combinedHealthText, /pressure|hypertension|dash|blood pressure/i);

    // NEW CONDITIONS
    const isBariatric = containsCondition(combinedHealthText, /sleeve|gastric|bypass|bariatric/i);
    const isCirrhosis = containsCondition(combinedHealthText, /cirrhosis|ascites|liver failure|hepatic|varices|esophageal varices/i);
    const isEncephalopathy = containsCondition(combinedHealthText, /encephalopathy|confusion|ammonia|lactulose/i);
    const isGastroparesis = containsCondition(combinedHealthText, /gastroparesis|delayed gastric emptying/i);
    const isKidneyStones = containsCondition(combinedHealthText, /stone|oxalate|nephrolithiasis/i); // Specific Stone Check
    const isThyroid = containsCondition(combinedHealthText, /thyroid|hypothyroid|hashimoto/i);
    const isCeliac = containsCondition(combinedHealthText, /celiac|gluten|wheat/i);
    const isPKU = containsCondition(combinedHealthText, /pku|phenylketonuria|phenylalanine/i);
    const isG6PD = containsCondition(combinedHealthText, /g6pd|favism/i);

    // P1 FIX: PKU SAFETY INJECTION (The "Food Inspector")
    // Explicitly add these to the allergy list so runSafetyWatchdog catches them even if AI suggests them.
    if (isPKU) {
        logAdjustment("Medical Safety: PKU Detected. Injecting strict anti-phenylalanine blockers into safety watchdog.");
        if (!stats.allergies) stats.allergies = "";
        stats.allergies += ", aspartame, nutrasweet, soy, tofu, steak, beef, pork, chicken, turkey, fish, tuna, salmon, eggs, dairy, milk, cheese, yogurt, nuts, seeds, beans, lentils, legumes, wheat, flour, gelatin, msg";
    }

    // ROUND 8: ANTIBIOTIC + PROBIOTIC
    const isAntibiotic = containsCondition(combinedHealthText, /antibiotic|amoxicillin|doxycycline|cipro|penicillin|azithromycin/i);

    // ROUND 11: CHEMICAL DRUG INTERACTIONS (FINAL AUDIT)
    const isWarfarin = containsCondition(combinedHealthText, /warfarin|coumadin|jantoven|blood thinner/i);
    const isMAOI = containsCondition(combinedHealthText, /maoi|nardil|parnate|marplan|selegiline/i);
    const isGrapefruitSensitive = containsCondition(combinedHealthText, /statin|lipitor|zocor|simvastatin|atorvastatin|transplant|cyclosporine|tacrolimus|prograf|sirolimus|rapamune|nifedipine|buspirone|carbamazepine/i);
    const isBisphosphonate = containsCondition(combinedHealthText, /fosamax|alendronate|boniva/i);
    const isNSAID = containsCondition(combinedHealthText, /nsaid|aspirin|ibuprofen|advil|motrin|naproxen|aleve/i);

    // REMEDIATION: ADVANCED DRUG DETECTION
    const isDiabetic = isDiabetes; // Alias for consistency
    const isGLP1 = containsCondition(combinedHealthText, /ozempic|wegovy|mounjaro|semaglutide|saxenda/i);
    const isLithium = containsCondition(combinedHealthText, /lithium|lithobid/i);
    const isShiftWorker = containsCondition(combinedHealthText, /shift|night|graveyard|rotation/i);

    // EDGE CASE FIX: Additional Condition Detections
    // PCOS (Polycystic Ovary Syndrome) - Affects 8-13% of women
    const isPCOS = containsCondition(combinedHealthText, /pcos|polycystic|ovarian syndrome/i);

    // ACE Inhibitors - Risk of hyperkalemia (11% of patients)
    const isACEInhibitor = containsCondition(combinedHealthText, /lisinopril|enalapril|ramipril|benazepril|captopril|perindopril|quinapril|ace inhibitor|\bace\s*-?\s*i\b/i);

    // DOACs (Modern Blood Thinners) - Different from Warfarin
    const isDOAC = containsCondition(combinedHealthText, /eliquis|apixaban|xarelto|rivaroxaban|pradaxa|dabigatran|edoxaban|savaysa/i);

    // Menopause/Perimenopause detection (for women 45-60)
    const isMenopauseAge = stats.gender === 'female' && stats.age >= 45 && stats.age <= 60 && !stats.isPregnant && !stats.isBreastfeeding;

    // RULE 1: HISTAMINE OVERRIDES LEFTOVERS
    if (isHistamineIntolerant && stats.mealStrategy === 'leftovers') {
        stats.mealStrategy = 'fresh';
        if (onProgress) onProgress("Medical Override: Histamine Intolerance detected. Disabling 'Leftovers' to prevent anaphylaxis risk.");
    }

    // Fix absoluteFloor Scope
    const absoluteFloor = stats.gender === 'male' ? 1500 : 1200;

    // ROUND 8: LATE BINDING RENAL CAP & KIDNEY STONE FLUSH
    let safeWater = baseWater;

    // A. KIDNEY STONE PROTOCOL (High Fluid Volume)
    // Stones require dilution (3-4L/day). We aim for 3.0L minimum if detected.
    if (isKidneyStones) {
        if (safeWater < 3.0) {
            safeWater = 3.0;
            logAdjustment("Clinical Adjustment: Kidney Stone risk detected. Increasing hydration target to 3.0L to prevent crystallization.");
        }
    }

    // B. RENAL FAILURE PROTOCOL (Fluid Restriction)
    // Safety Priority: Renal Failure (Edema/Heart Failure Risk) > Kidney Stones.
    // If user has BOTH, we MUST cap at 1.5L and rely on meds/diet for stones, not volume.
    if (isRenal) {
        safeWater = Math.min(safeWater, 1.5); // Hard Cap 1.5L
        logAdjustment("CRITICAL SAFETY: Renal Condition detected. Hard-capping fluid intake to 1.5L.");
    }

    let calorieTarget = tdee;
    const isUnderweight = bmi < 18.5;

    // Apply Cycle Buffer to TDEE baseline
    tdee += cycleCalorieBuffer;
    calorieTarget += cycleCalorieBuffer;

    if (stats.age < 18) {
        if (stats.goal === 'lose') {
            calorieTarget = tdee;
            logAdjustment("Safety Alert: Pediatric User (<18). Overriding 'Lose' goal to 'Maintain' to protect growth.");
        } else if (stats.goal === 'gain') {
            calorieTarget = Math.round(tdee * 1.10);
        }
    }
    else if (stats.isPregnant || stats.isBreastfeeding) {
        // EDGE-001 FIX: Combined pregnancy+breastfeeding uses +600kcal (not additive +800)
        // This handles rare tandem nursing scenario with medically appropriate calorie boost
        if (stats.isPregnant && stats.isBreastfeeding) {
            calorieTarget = tdee + 600;
            logAdjustment("Medical Notice: Pregnancy + Breastfeeding detected. Adding +600kcal (combined, not additive).");
            if (stats.goal === 'lose') {
                logAdjustment("Notice: Overriding 'Lose' goal to 'Maintain' for maternal health.");
            }
        } else if (stats.isPregnant) {
            // PHASE 2 FIX: Trimester-Specific Calories (ACOG Guidelines)
            let pregnancyBonus = 300; // Fallback "Safety Net"
            if (stats.trimester === 1) pregnancyBonus = 0; // Maintenance
            else if (stats.trimester === 2) pregnancyBonus = 340; // Growth
            else if (stats.trimester === 3) pregnancyBonus = 452; // Peak Growth

            calorieTarget = stats.goal === 'gain' ? Math.round(tdee + pregnancyBonus) : tdee + (stats.trimester === 1 ? 0 : pregnancyBonus);

            // Log for debugging/transparency
            logAdjustment(`Medical Notice: Pregnancy (Trimester ${stats.trimester || 'Unknown'}) detected. Added +${pregnancyBonus}kcal.`);

            if (stats.goal === 'lose') {
                logAdjustment("Notice: Pregnancy detected. Overriding 'Lose' goal to 'Maintain'.");
            }
        }
        else if (stats.isBreastfeeding) {
            calorieTarget = tdee + 500;
            logAdjustment("Medical Notice: Lactation detected. Adding +500kcal/day for milk supply.");
        }
    }
    else if (isUnderweight) {
        if (bmi < 16) {
            throw new Error("SAFETY BLOCK: BMI < 16 indicates critical underweight status requiring medical supervision. Please consult a doctor immediately.");
        }
        calorieTarget = tdee;
        if (onProgress) onProgress("Medical Notice: Underweight. Setting Safe Maintenance Target (No Surplus) to prevent Refeeding Syndrome.");
    }
    else {
        if (stats.goal === 'lose') calorieTarget = Math.round(tdee * 0.80);
        if (stats.goal === 'gain') calorieTarget = Math.round(tdee * 1.10);

        if (stats.goal === 'lose' && calorieTarget < absoluteFloor) {
            calorieTarget = absoluteFloor;
        }
    }

    // --- IMPOSSIBLE PHYSICS SAFEGUARD (BARIATRIC + HIGH CALORIE) ---
    // If user needs high calories but has no stomach volume, we must spread meals.
    if (isBariatric && calorieTarget > 2000) {
        if (!stats.includeSnacks) {
            stats.includeSnacks = true;
            logAdjustment("Medical Override: Bariatric Status + High Calories detected. Forcing 'Snacks' to spread food volume and prevent Dumping Syndrome.");
        }
    }

    // Detect gestational diabetes (pregnant + diabetic)
    const isGestationalDiabetes = stats.isPregnant && isDiabetic;

    const macroTargets = calculateOptimalMacros(stats, calorieTarget, {
        isRenal, isGeriatric, isNoGallbladder, isDiabetic, isGLP1,
        isPKU, isPCOS, isMenopauseAge, isGestationalDiabetes
    });

    if (isNoGallbladder && stats.dietType === 'Keto' && onProgress) {
        onProgress("Medical Override: Gallbladder removal detected. Soft-blocking Keto (70% Fat) -> Low Carb (40% Fat).");
    }
    if (isRenal && stats.dietType === 'Keto' && onProgress) {
        onProgress("Medical Override: Renal Condition detected. Soft-blocking Keto. Prioritizing Kidney-Safe protein/acid load.");
    }

    const m1Cal = calorieTarget;
    const m2Cal = (stats.isPregnant || stats.isBreastfeeding || stats.age < 18) ? calorieTarget : (stats.goal === 'lose' ? Math.round(calorieTarget * 0.95) : Math.round(calorieTarget * 1.05));
    const m3Cal = (stats.isPregnant || stats.isBreastfeeding || stats.age < 18) ? calorieTarget : (stats.goal === 'lose' ? Math.round(calorieTarget * 0.90) : Math.round(calorieTarget * 1.10));

    const getSafetyProfile = (currentCalories: number, macros: MacroSplit) => {
        let safetyDirectives = "";

        // 1. DRUG-FOOD INTERACTIONS
        // 1. DRUG-FOOD INTERACTIONS (FLAW-004: Expanded Brand/Generic Aliases)
        // WARFARIN aliases
        if (/warfarin|coumadin|jantoven|marevan/i.test(combinedHealthText)) {
            safetyDirectives += "CRITICAL WARNING: PATIENT ON WARFARIN. NO GRAPEFRUIT, CRANBERRY, or DRASTIC VITAMIN K FLUCTUATIONS. ";
        }
        // STATIN aliases (common generics and brands)
        if (/statin|lipitor|atorvastatin|zocor|simvastatin|crestor|rosuvastatin|pravachol|pravastatin/i.test(combinedHealthText)) {
            safetyDirectives += "CRITICAL WARNING: PATIENT ON STATINS. NO GRAPEFRUIT. ";
        }
        // MAOI aliases
        if (/maoi|nardil|phenelzine|parnate|tranylcypromine|marplan|isocarboxazid|emsam|selegiline/i.test(combinedHealthText)) {
            safetyDirectives += "CRITICAL WARNING: PATIENT ON MAOIs. LOW TYRAMINE DIET REQUIRED (No Aged Cheese, Cured Meats, Fermented Foods). ";

            // P0 FIX BUG-006: MAOI + KETO = TYRAMINE CRISIS RISK
            // Keto relies heavily on aged cheese, avocados, fermented foods - ALL high tyramine
            if (stats.dietType.toLowerCase().includes('keto')) {
                safetyDirectives += "⛔ DIET OVERRIDE REQUIRED: KETO IS INCOMPATIBLE WITH MAOI MEDICATION. Keto relies on aged cheese, avocados, and fermented foods which are HIGH TYRAMINE. HYPERTENSIVE CRISIS RISK. Generating HIGH-PROTEIN BALANCED diet instead. ";
                stats.dietType = 'High Protein'; // Force override
                if (onProgress) onProgress("⚠️ Safety Override: MAOI + Keto is dangerous. Switching to High-Protein Balanced diet.");
            }
        }

        // 2. RENAL
        if (isRenal) {
            safetyDirectives += "CRITICAL RENAL DIET: RESTRICT POTASSIUM (No Bananas, Potatoes, Tomatoes, Avocados) & PHOSPHORUS. LOW SODIUM. ";
        }

        // P0 FIX BUG-005: ACE INHIBITOR + HIGH POTASSIUM DIET = HYPERKALEMIA RISK
        // ACE inhibitors reduce aldosterone → potassium retention
        // DASH diet = 4700mg potassium/day → combined risk of hyperkalemia (cardiac arrhythmia)
        if (isACEInhibitor) {
            const isHighPotassiumDiet = /dash/i.test(stats.dietType) ||
                containsCondition(combinedHealthText, /high.?potassium|hypertension|blood.?pressure/i);

            if (isHighPotassiumDiet) {
                safetyDirectives += "⚠️ POTASSIUM MONITORING REQUIRED: ACE Inhibitor + High-Potassium Diet detected. ACE inhibitors cause potassium retention. MODERATE potassium intake (target 3000-3500mg/day, NOT 4700mg standard DASH). AVOID: Salt substitutes (KCl), potassium supplements. LIMIT: Bananas, oranges, potatoes, tomatoes to 1 serving each per day. Must have serum potassium monitored by physician. ";

                if (isRenal) {
                    safetyDirectives += "⛔ HIGH RISK: Renal issues + ACE medication. Further limit potassium to 2000-2500mg/day. This is a MEDICAL DIETITIAN case - recommend physician oversight. ";
                }
            }
        }

        // 3. IBD/IBS (FODMAP)
        if (/ibs|fodmap|irritable/i.test(combinedHealthText)) {
            safetyDirectives += "MEDICAL DIET: STRICT LOW FODMAP. NO ONION, GARLIC, WHEAT, HIGH FRUCTOSE FRUIT, LEGUMES. ";
            if (stats.dietType.includes('Vegan')) {
                safetyDirectives += "CONFLICT DETECTED (VEGAN + IBS): USE TOFU, TEMPEH, QUINOA for protein. DO NOT USE BEANS/LENTILS. ";
            }
        }

        // ROUND 8: WOMEN'S HEALTH (MENSTRUAL IRON)
        // Check if cycle logic detected Luteal/Menstrual phase
        if (stats.lastPeriodStart) {
            const lastPeriod = new Date(stats.lastPeriodStart);
            const today = new Date();
            const diffDays = Math.floor((today.getTime() - lastPeriod.getTime()) / (1000 * 3600 * 24));
            if (diffDays >= 0 && diffDays <= 5) {
                safetyDirectives += "MENSTRUAL PHASE (DAYS 1-5): BLOOD LOSS DETECTED. HIGH PRIORITY: IRON-RICH FOODS (Red Meat, Spinach+Vit C, Lentils). ";
            }
        }

        // 4. GOUT
        if (isGout) {
            safetyDirectives += "GOUT DIET: LOW PURINE. NO ORGAN MEATS, ANCHOVIES, SHELLFISH, ASPARAGUS. LIMIT RED MEAT. HYDRATE WELL. ";
        }

        if (isG6PD) {
            safetyDirectives += "GENETIC ENZYME DEFECT: G6PD DEFICIENCY. DANGER: NO FAVA BEANS (BROAD BEANS). NO LEGUMES/RED WINE/SOY if trigger. AVOID BLUEBERRIES. ";
        }

        // --- REPEATED INSPECTION FIXES (SAFETY GAPS) ---

        // GAP-002: THYROID & GOITROGENS
        // Goitrogens (cruciferous veg) interfere with iodine uptake if eaten RAW. Cooking degrades goitrogens.
        if (isThyroid) {
            safetyDirectives += "THYROID SAFETY: AVOID RAW BRASSICAS (Kale, Broccoli, Brussels Sprouts) due to Goitrogens. MUST BE COOKED THOROUGHLY. Ensure adequate Selenium/Zinc. Allow 4-hour window separate from Levothyroxine medication. ";
        }

        // GAP-003: VEGAN BIOAVAILABILITY (Iron Pairing)
        if (stats.dietType.includes('Vegan') || stats.dietType.includes('Vegetarian')) {
            safetyDirectives += "BIOAVAILABILITY RULE: NON-HEME IRON ABSORPTION. AUTOMATICALLY PAIR iron-rich foods (Spinach, Lentils) with Vitamin-C sources (Citrus, Peppers, Tomatoes) in every meal. AVOID Tea/Coffee within 1 hour of meals (Tannins block absorption). ";
        }

        // --- P1 FIXES: ADDITIONAL DRUG INTERACTIONS & CONDITIONS ---

        // P1 FIX BUG-007: LITHIUM + LOW SODIUM = TOXICITY
        // Lithium is renally excreted. Low sodium causes increased lithium reabsorption → toxicity
        if (isLithium) {
            const isLowSodiumIntent = /dash|low.?sodium|salt.?restricted/i.test(stats.dietType + combinedHealthText);
            if (isLowSodiumIntent) {
                safetyDirectives += "⛔ LITHIUM SAFETY ALERT: Low-sodium diets cause lithium toxicity (increased reabsorption). MAINTAIN normal sodium intake (2300-3000mg/day, NOT <1500mg). Ensure CONSISTENT sodium intake day-to-day. Symptoms of toxicity: tremor, confusion, vomiting - seek emergency care immediately. ";
            }
        }

        // P1 FIX BUG-008: INSULIN TIMING GUIDANCE
        // Rapid-acting insulin peaks in 30-60 minutes. Food must be eaten to prevent hypoglycemia.
        const isOnInsulin = /insulin|humalog|novolog|apidra|fiasp|lantus|levemir|tresiba|toujeo|basaglar/i.test(combinedHealthText);
        if (isOnInsulin) {
            safetyDirectives += "⏰ INSULIN TIMING CRITICAL: Eat within 15-30 minutes of rapid-acting insulin injection. ALWAYS have fast-acting glucose available (juice, glucose tablets). Include 15-20g carbs at each meal for insulin matching. Night snack REQUIRED if taking long-acting insulin at bedtime. ";
        }

        // P1 FIX BUG-009: GASTROPARESIS MEAL STRUCTURE
        // 5-8 small meals, low fiber, low fat, upright position recommended
        if (isGastroparesis) {
            // Force snacks on for gastroparesis patients
            stats.includeSnacks = true;
            safetyDirectives += "🍽️ GASTROPARESIS MEAL STRUCTURE: GENERATE 6 small meals/snacks per day (FORCED - ignore user meal count preference). PORTION: Each meal = 1-1.5 cup maximum. TEXTURE: Soft, well-cooked, or pureed foods preferred. AVOID: Raw vegetables, high-fiber, fatty foods, carbonation. TIMING: Space meals 2-3 hours apart. POSITION: Recommend remaining upright 1-2 hours after eating. ";
            if (onProgress) onProgress("Medical Override: Gastroparesis detected. Forcing 6 small meals for proper gastric emptying.");
        }

        // P1 FIX BUG-011: PKU + VEGAN CRITICAL WARNING
        // Vegan proteins (soy, legumes, seitan) are HIGH in phenylalanine. PKU requires Phe-free formula.
        if (isPKU && (stats.dietType.includes('Vegan') || stats.dietType.includes('Vegetarian'))) {
            safetyDirectives += "⛔ PKU + VEGAN CRITICAL WARNING: Standard vegan proteins (soy, legumes, seitan, nuts) are HIGH in phenylalanine. User MUST be using PKU-specific protein formula (Phe-free). Allowed: Low-protein specialty foods, fruits, most vegetables, tapioca, cassava. AVOID: Soy, tempeh, seitan, legumes, nuts, aspartame. This diet REQUIRES metabolic dietitian supervision. Daily Phe intake must stay under 300-500mg (varies by tolerance). ";
        }

        // P1 FIX BUG-012: GLP-1 + VEGAN PROTEIN STRATEGIES
        // GLP-1 agonists require high protein (1.2-1.5g/kg) to prevent muscle loss
        if (isGLP1 && (stats.dietType.includes('Vegan') || stats.dietType.includes('Vegetarian'))) {
            safetyDirectives += "💪 GLP-1 + VEGAN PROTEIN STRATEGY: Target 1.2-1.5g protein per kg body weight (higher than standard vegan). PRIORITIZE: Pea protein isolate, soy (tofu, tempeh, edamame), seitan, hemp seeds. EACH MEAL: Must include 25-30g protein minimum. Spacing: Protein with every meal and snack. SUPPLEMENT: Consider vegan protein powder (pea + rice blend). Monitor: Muscle mass and strength - report any weakness to doctor. ";
        }

        // P1 FIX BUG-015: POLYPHARMACY WARNING (5+ Medications)
        const countMedications = (meds: string): number => {
            if (!meds) return 0;
            const medList = meds.split(/[,;|\n]/).filter(m => m.trim().length > 2);
            return medList.length;
        };
        const medicationCount = countMedications(stats.medications);
        if (medicationCount >= 5) {
            safetyDirectives += `⚠️ POLYPHARMACY DETECTED (${medicationCount}+ medications): Complex drug-food interactions likely. This plan may not account for all interactions. STRONGLY RECOMMEND: Consult pharmacist for food-drug timing review. Grapefruit and green leafy vegetables affect MANY medications. When in doubt, keep diet consistent day-to-day. `;
        }

        // --- ROUND 13: PARADOX RESOLUTION (CONSTRAINT COLLISIONS) ---

        // 1. KETO + HYPERTENSION (The "Salt Paradox")
        // Standard DASH = Low Sodium. Keto = Needs Electrolytes.
        // Compromise: MODERATE Sodium (2500-3000mg) + WARNING.
        if (stats.dietType.includes('Keto') && isHypertension) {
            safetyDirectives += "MEDICAL CONFLICT (KETO + HYPERTENSION): STANDARD KETO REQUIRES HIGH SALT. HYPERTENSION REQUIRES LOW SALT. compromise: TARGET MODERATE SODIUM (2.5g). FOCUS ON POTASSIUM/MAGNESIUM FROM FOOD TO LOWER BP. MONITOR BP DAILY. ";
        }

        // 2. GOUT + KETO (The "Purine Paradox")
        // Standard Keto = Red Meat. Gout = No Red Meat.
        // Resolution: FORCE "POULTRY/FISH/EGG" KETO.
        if (stats.dietType.includes('Keto') && isGout) {
            safetyDirectives += "MEDICAL CONFLICT (GOUT + KETO): RED MEAT IS BANNED. YOU MUST GENERATE A 'POULTRY & FISH' KETO PLAN. RELY ON EGGS, SALMON, CHICKEN, OLIVE OIL, AVOCADO. NO BEEF/PORK. ";
        }

        // 3. PEDIATRIC SAFETY (The "Growth Paradox")
        if (stats.age < 18 && (stats.dietType.includes('Keto') || stats.dietType.includes('Paleo'))) {
            safetyDirectives += "PEDIATRIC SAFETY WARNING: USER IS UNDER 18. STRICT KETO/PALEO CAN STUNT GROWTH WITHOUT SUPERVISION. ENSURE CALCIUM & ADEQUATE PROTEIN. DO NOT ALLOW EXTREME CALORIC DEFICITS. ";
        }

        // 4. WINTER VITAMIN D (Climate Logic)
        // If climate is "Cold" or "Winter", suggest Vitamin D.
        if (batch1Schema.properties.climateAnalysis) {
            // (We don't have the AI's climate analysis yet, but we can infer from Region/Date if we had it.
            // For now, we add a general advisory if Region suggests high latitude or user mentions 'Winter').
            if (stats.region.match(/UK|Canada|Sweden|Norway|Finland|Russia|Alaska/i) || stats.region.match(/Winter|Cold/i)) {
                safetyDirectives += "CLIMATE HEALTH: HIGH LATITUDE/WINTER REGION DETECTED. LOW SUNLIGHT. ADVISE VITAMIN D RICH FOODS (Fatty Fish, Egg Yolks, Fortified Mushrooms). ";
            }
        }

        // --- ROUND 14: TOXICOLOGY & BIOCHEMISTRY (FINAL) ---

        // 1. PREGNANCY/DIABETES & ALCOHOL
        if (stats.isPregnant) {
            safetyDirectives += "PREGNANCY TOXICOLOGY: NO ALCOHOL. NO RAW MEAT/SUSHI. LIMIT CAFFEINE < 200mg. ";
        } else if (isDiabetic) {
            safetyDirectives += "DIABETES SAFETY: ALCOHOL CAUSES HYPOGLYCEMIA. IF ALCOHOL IS CONSUMED, IT MUST BE WITH FOOD. NEVER ON EMPTY STOMACH. ";
        }

        // 2. HYPERTENSION & LICORICE
        if (isHypertension) {
            safetyDirectives += "HYPertension TOXICOLOGY: NO LIQUORICE ROOT (GLYCYRRHIZIN). IT RAISES BLOOD PRESSURE. ";
        }

        // 3. SSRI/MEDS & ST JOHN'S WORT
        if (combinedHealthText.match(/depression|anxiety|ssri|zoloft|lexapro|prozac|paxil|celexa/i)) {
            safetyDirectives += "DRUG INTERACTION: SEROTONIN SYNDROME RISK. NO ST JOHN'S WORT SUPPLEMENTS OR TEAS. ";
        }

        // 5. BARIATRIC (ROUND 9 + 10)
        if (isBariatric) {
            safetyDirectives += "BARIATRIC SURGERY DETECTED: STRICT VOLUME LIMIT. MEALS MUST BE < 200g. HIGH PROTEIN DENSITY. NO LIQUIDS WITH MEALS (DUMPING SYNDROME RISK). ";
            if (currentCalories > 2000) {
                safetyDirectives += "IMPOSSIBLE PHYSICS WARNING: Calorie target is high for stomach capacity. MUST PERSCRIBE LIQUID PROTEIN SHAKES *BETWEEN* MEALS (NOT WITH MEALS). ";
            }
        }

        // 6. KIDNEY STONES (ROUND 9)
        if (isKidneyStones) {
            safetyDirectives += "KIDNEY STONE RISK: LOW OXALATE DIET. STRICTLY AVOID SPINACH, ALMONDS, BEETS, RHUBARB. PAIR CALCIUM WITH MEALS. ";
        }

        // 7. THYROID (ROUND 9)
        if (isThyroid) {
            safetyDirectives += "THYROID HEALTH: DO NOT SERVE RAW CRUCIFEROUS VEGETABLES (GOITROGENS). ALL KALE/BROCCOLI MUST BE COOKED. ";
        }

        if (isGeriatric && !isRenal) {
            safetyDirectives += "GERIATRIC PROTECTION (SARCOPENIA): ENSURE 30g HIGH QUALITY PROTEIN PER MEAL (Leucine Rich). ";
        }

        // PREGNANCY
        // PREGNANCY
        if (stats.isPregnant) {
            safetyDirectives += "PREGNANCY SAFETY: NO UNHEATED DELI MEATS (Listeria). NO SOFT UNPASTEURIZED CHEESE. COOK ALL EGGS FULLY. NO LIVER/PATE (VITAMIN A TOXICITY). ";
        }

        // CONDITIONS
        if (isHistamineIntolerant) {
            safetyDirectives += "HISTAMINE WARNING: FORCE FRESH INGREDIENTS. NO LEFTOVERS. NO FERMENTED FOODS. FREEZE IMMEDIATELY. ";
        }

        // ROUND 8: ANTIBIOTIC RECOVERY
        if (isAntibiotic) {
            safetyDirectives += "MICROBIOME RESTORATION: ANTIBIOTICS DETECTED. PRESCRIBE PROBIOTIC-RICH FOODS (YOGURT, KEFIR) *MINIMUM 2 HOURS* AFTER MEDICATION DOSE. ";
        }

        // --- ROUND 15: EDGE CASE & PERMUTATION REMEDIATION ---

        // 1. BARIATRIC vs. FASTING / OMAD
        // Impossible Physics: Small Stomach (200g) cannot fit 1500kcal in short window.
        // We infer Fasting from context or just apply general volume safety rule.
        if (isBariatric) {
            safetyDirectives += "PHYSICS CONFLICT: BARIATRIC PATIENT. DO NOT ALLOW 'ONE MEAL A DAY' OR SHORT EATING WINDOWS. STOMACH VOLUME IS TOO SMALL. MUST PRESCRIBE 5-6 SMALL MEALS. ";
        }

        // 2. THE "IMPOSSIBLE VEGAN" (Vegan + Soy + Gluten + Nut Allergies)
        const isVegan = stats.dietType.includes('Vegan') || stats.dietType.includes('Vegetarian');
        const allergyText = stats.allergies.toLowerCase(); // Fix Scope
        const hasSoy = allergyText.includes('soy');
        const hasGluten = allergyText.includes('gluten') || isCeliac;
        const hasNut = allergyText.includes('nut');

        if (isVegan && hasSoy && hasGluten && hasNut) {
            safetyDirectives += "EXTREME RESTRICTION WARNING: VEGAN + NO SOY/GLUTEN/NUTS DETECTED. PROTEIN SOURCES ARE CRITICALLY LIMITED. YOU MUST PRESCRIBE 'PEA PROTEIN ISOLATE', 'HEMP SEEDS' OR 'RICE PROTEIN POWDER' IN EVERY MEAL TO HIT TARGETS. DO NOT FAIL. ";
        }

        // 3. EXTREME POVERTY CHECK
        if (stats.budgetAmount < 30) {
            if (isRenal) {
                safetyDirectives += "BUDGET EMERGENCY (RENAL MODE): EXTREMELY LOW BUDGET. DO NOT USE BEANS/POTATOES (High K/Phos). RELY ON WHITE RICE, PASTA, EGG WHITES, FROZEN VEG. ";
            }
            else if (stats.budgetAmount < 20) {
                safetyDirectives += "SURVIVAL MODE (ULTRA-LOW BUDGET): BUDGET < $20. IGNORE TASTE/VARIETY. FOCUS PURELY ON CALORIC SURVIVAL. USE OIL, RICE, DRIED BEANS, OATS ONLY. LIMIT VEGETABLES TO FROZEN SPINACH/PEAS. ";
            }
            else {
                safetyDirectives += "BUDGET EMERGENCY: USER HAS EXTREMELY LOW BUDGET (< $30). RELY HEAVILY ON DRIED BEANS, RICE, OATS, POTATOES. LIMIT MEAT COMPLETELY. ";
            }
        }

        // ROUND 8: SHIFT WORK (INSULIN RESISTANCE)
        if (isShiftWorker) {
            safetyDirectives += "CHRONOBIOLOGY: SHIFT WORKER. REVERSE CARB TIMING. LOW CARB DURING NIGHT SHIFT to manage insulin resistance. CARB LOADING BEFORE SLEEP. ";
        }

        if (isNoGallbladder) {
            safetyDirectives += "DIGESTIVE AID: NO GALLBLADDER. SPREAD FATS evenly. Use MCT OIL if possible. Avoid huge greasy meals. ";
        }

        // RATIONS
        if (stats.budgetAmount < 60 && /keto|paleo|steak/i.test(stats.dietType)) {
            safetyDirectives += "ECONOMIC ENGINEERING: LOW BUDGET DETECTED. SUBSTITUTE Expensive Meat with EGGS, CANNED FISH, GROUND BEEF. ";
        }
        if (stats.mealStrategy === 'batch') {
            safetyDirectives += "PHYSICS CHECK: BATCH COOKING MODE. DO NOT SUGGEST SALADS OR CRISPY FOODS (They get soggy). Use Stews/Curries/Roasts. ";
        }

        // METFORMIN (B12 DEPLETION)
        if (combinedHealthText.includes('metformin')) {
            safetyDirectives += "DRUG INTERACTION: METFORMIN USAGE. RISK OF B12 DEFICIENCY. ENSURE B12 RICH FOODS (Eggs, Meat, Nutritional Yeast) ARE INCLUDED DAILY. ";
        }

        // STEROIDS / PREDNISONE
        if (combinedHealthText.match(/prednisone|steroid|corticosteroid/i)) {
            safetyDirectives += "DRUG INTERACTION: STEROID USE. HIGH RISK OF FLUID RETENTION & SUGAR SPIKES. STRICT LOW SODIUM (<2000mg) AND LOW SUGAR. INCREASES APPETITE: USE HIGH VOLUME VEGETABLES. ";
        }

        // RENAL + MUSCLE GAIN CONFLICT EXPLANATION
        if (isRenal && stats.goal === 'gain') {
            safetyDirectives += "MEDICAL CONFLICT: USER WANTS TO BUILD MUSCLE BUT HAS KIDNEY DISEASE. SAFETY PRIORITY: KIDNEYS. PROTEIN IS CAPPED. EXPLAIN TO USER: 'Protein limited to preserve renal function'. ";
        }

        // LITHIUM SAFETY
        if (isLithium) {
            safetyDirectives += "DRUG INTERACTION: LITHIUM DETECTED. DO NOT RESTRICT SODIUM. KEEP SALT INTAKE CONSISTENT / NORMAL. ";
        }

        // GLP-1 SAFETY
        if (isGLP1) {
            safetyDirectives += "GLP-1 AGONIST: APPETITE IS SUPPRESSED. FORCE HIGH PROTEIN DENSITY. SMALL VOLUME MEALS. NO 'VOLUMETRIC EATING' (Salads fill stomach too fast). ";
            // EDGE-003 FIX: GLP-1 + Low Budget conflict resolution
            if (stats.budgetAmount < 40) {
                safetyDirectives += "BUDGET CONSTRAINT (GLP-1): HIGH PROTEIN REQUIRED BUT LOW BUDGET. FOCUS ON CHEAP PROTEIN: EGGS, CANNED TUNA/SARDINES, COTTAGE CHEESE, GREEK YOGURT, CHICKEN THIGHS, LENTILS. AVOID EXPENSIVE CUTS. ";
            }
        }

        // LEFTOVER LOGIC
        if (stats.mealStrategy === 'leftovers') {
            safetyDirectives += "LEFTOVER STRATEGY ACTIVE: For every DINNER, you MUST instruct to 'Cook Double Portion'. The LUNCH for the NEXT DAY will be the leftovers. (e.g. Day 1 Dinner = Day 2 Lunch). ";
        }

        // SHIFT WORK CIRCADIAN SAFETY
        if (/shift|night|graveyard|rotation/i.test(stats.medications + " " + stats.allergies)) {
            safetyDirectives += "CIRCADIAN RHYTHM DISRUPTION DETECTED (SHIFT WORK): TIMING IS CRITICAL. Focus on High Protein/Fat before shift start. LOW CARB at end of shift (to prevent insulin spike before sleep). ";
        }

        // --- ROUND 16: DRUG-NUTRIENT DEPLETION (SAFETY AUDIT FIX) ---

        // STATINS (CoQ10)
        if (combinedHealthText.match(/statin|lipitor|crestor|zocor/i)) {
            safetyDirectives += "DRUG DEPLETION: STATIN DETECTED. DEPLETES COQ10. ADVISE COQ10 RICH FOODS (Heart, Liver, Fatty Fish, Pistachios, Sesame Seeds). ";
        }

        // ORAL CONTRACEPTIVES (B-Vitamins, Magnesium)
        if (combinedHealthText.match(/birth control|contraceptive|estrogen|progesterone|pill/i)) {
            safetyDirectives += "DRUG DEPLETION: ORAL CONTRACEPTIVES. DEPLETES B6, B12, FOLATE & MAGNESIUM. ENSURE LEAFY GREENS, LEGUMES, CITRUS & UNREFINED GRAINS. ";
        }

        // PPIs (Magnesium, B12)
        if (combinedHealthText.match(/omeprazole|nexium|pantoprazole|prilosec|acid reflux|gerd/i)) {
            safetyDirectives += "DRUG DEPLETION: PPI (ACID REDUCER). DEPLETES MAGNESIUM, B12 & CALCIUM. RECOMMEND FOODS RICH IN MAGNESIUM (Pumpkin Seeds, Spinach, Almonds). ";
        }

        const isPotassiumSparing = /spironolactone|aldactone|triamterene|amiloride/i.test(combinedHealthText);
        const isDialysis = /dialysis/i.test(combinedHealthText); // Safety Audit Fix #1

        // LIVER CIRRHOSIS SAFETY
        if (isCirrhosis) {
            if (isEncephalopathy) {
                safetyDirectives += "⚠️ CRITICAL HEPATIC ENCEPHALOPATHY: TEMPORARY PROTEIN RESTRICTION MAY BE REQUIRED (Consult Doctor). FOCUS ON VEGETABLE/DAIRY PROTEINS (BCAA rich). AVOID RED MEAT (Ammonia genic). TREAT CONSTIPATION AGGRESSIVELY (Fiber + Hydration). ";
            } else {
                safetyDirectives += "LIVER CIRRHOSIS PROTOCOL (COMPENSATED): HIGH PROTEIN (1.2-1.5g/kg) PREVENTS MORTALITY. DO NOT RESTRICT PROTEIN. ";
            }
            safetyDirectives += "ASCITES MANAGEMENT: STRICT LOW SODIUM (<2000mg). LATE EVENING SNACK (Complex Carb + Protein) MANDATORY to prevent overnight starvation state. NO RAW SHELLFISH/OYSTERS (Vibrio Rule). AVOID ALCOHOL COMPLETELY. ";
        }

        // GASTROPARESIS SAFETY
        if (isGastroparesis) {
            safetyDirectives += "GASTROPARESIS PROTOCOL: CRITICAL. STOMACH PARALYSIS DETECTED. DIET MUST BE: 1) LOW FAT (<40g/day). 2) LOW FIBER (<15g/day). 3) SMALL FREQUENT MEALS (6x/day). NO RAW VEGETABLES. COOK VEGETABLES TO MUSH. BLENDERIZED/LIQUID MEALS PREFERRED. AVOID SKINS/SEEDS. ";
        }

        // ROUND 12: HYPERTENSION PROTOCOL (DASH) - UPDATED FOR SPIRONOLACTONE
        if (isHypertension) {
            if (isPotassiumSparing || isRenal) {
                safetyDirectives += "HYPERTENSION PROTOCOL (MODIFIED): RESTRICT SODIUM < 2300mg/day. **DO NOT INCREASE POTASSIUM** (Medication Conflict/Renal Risk). MAINTAIN NORMAL LEVELS. AVOID PROCESSED MEATS. ";
            } else {
                safetyDirectives += "HYPERTENSION PROTOCOL (DASH): RESTRICT SODIUM < 2300mg/day. INCREASE POTASSIUM (Leafy Greens, Bananas, Yogurt). AVOID PROCESSED MEATS/CANNED SOUP. ";
            }
        }

        // --- EDGE CASE FIX: NEW SAFETY DIRECTIVES ---

        // CRITICAL: PKU (Phenylketonuria)
        if (isPKU) {
            safetyDirectives += "⚠️ CRITICAL PKU PROTOCOL: STRICT LOW-PHENYLALANINE DIET. NO meat, fish, eggs, dairy, nuts, seeds, legumes, wheat, oats, soy, or aspartame (Equal, NutraSweet). ALL PROTEIN MUST COME FROM PHE-FREE MEDICAL FORMULA. Use PKU-approved low-protein specialty foods only. ";
        }

        // PCOS (Polycystic Ovary Syndrome) - 8-13% of women
        if (isPCOS) {
            safetyDirectives += "PCOS PROTOCOL: LOW GLYCEMIC INDEX FOODS ESSENTIAL for insulin sensitivity. AVOID white bread, white rice, sugary drinks, processed snacks. PRIORITIZE whole grains (quinoa, oats), legumes, lean proteins, leafy greens. ANTI-INFLAMMATORY focus (omega-3, turmeric). LIMIT dairy if hormone-sensitive. ";
        }



        // Warfarin logic (Critical Interaction)
        if (isWarfarin) {
            safetyDirectives += "DRUG INTERACTION: WARFARIN DETECTED. MAINTAIN CONSISTENT VITAMIN K INTAKE (Do not drastically increase/decrease greens). ";
            if (isNSAID) {
                safetyDirectives += "⚠️ CRITICAL: WARFARIN + NSAID (Aspirin/Ibuprofen) DETECTED. HIGH BLEEDING RISK. CONSULT DOCTOR IMMEDIATELY. ";
            }
        }

        // ACE Inhibitors - Risk of Hyperkalemia (11% of patients)
        if (isACEInhibitor) {
            safetyDirectives += "⚠️ ACE INHIBITOR DETECTED (Lisinopril/Enalapril/etc): MODERATE POTASSIUM INTAKE to prevent hyperkalemia. LIMIT bananas, oranges, potatoes, tomatoes, avocados, spinach to 1 serving/day maximum. AVOID potassium supplements and salt substitutes (KCl). Monitor for muscle weakness, irregular heartbeat. ";
        }

        // DOACs (Modern Blood Thinners - Different from Warfarin)
        if (isDOAC) {
            safetyDirectives += "DOAC ANTICOAGULANT (Eliquis/Xarelto): Unlike Warfarin, Vitamin K is NOT a concern - eat green vegetables freely. HOWEVER: AVOID grapefruit, pomelo, Seville oranges (increase drug levels → bleeding risk). AVOID large amounts of ginger, garlic, or turmeric supplements. TAKE medication WITH FOOD for better absorption. ";
        }

        // Gestational Diabetes (8.3% of US pregnancies)
        if (isGestationalDiabetes) {
            safetyDirectives += "⚠️ GESTATIONAL DIABETES PROTOCOL: STRICT BLOOD SUGAR CONTROL for fetal safety. NO simple sugars, fruit juice, refined carbs, high-GI breakfast cereals. EAT protein with EVERY meal to slow glucose absorption. SMALL frequent meals (3 meals + 2-3 snacks). Monitor blood glucose after eating. LOW-GI carbs only (whole grains, legumes). ";
        }

        // Vegan + Pregnant = B12 Critical
        const isVeganDiet = stats.dietType?.toLowerCase().includes('vegan');
        if (stats.isPregnant && isVeganDiet) {
            safetyDirectives += "⚠️ CRITICAL: VEGAN PREGNANCY - B12 SUPPLEMENTATION IS MANDATORY (2.6mcg/day minimum). B12 deficiency causes neural tube defects and developmental issues. Consider algae-based DHA/EPA for fetal brain development. IRON absorption is lower from plant sources - pair iron-rich foods with Vitamin C. ";
        }

        // Elderly Sarcopenia Prevention (65+)
        if (isGeriatric && !isRenal) {
            safetyDirectives += "SARCOPENIA PREVENTION PROTOCOL (65+): Higher protein required (1.0-1.2g/kg) to prevent muscle loss. TARGET 25-30g HIGH-QUALITY PROTEIN per meal. Leucine-rich foods critical (eggs, dairy, chicken, fish). EVEN distribution of protein throughout day. Vitamin D supplementation recommended. ";
        }

        // Menopause/Perimenopause (Women 45-60)
        if (isMenopauseAge) {
            safetyDirectives += "MENOPAUSE NUTRITION: Metabolism naturally decreases (-5% BMR). CALCIUM critical (1200mg/day) for bone density - emphasize dairy, fortified foods, leafy greens. VITAMIN D (600-800 IU/day) required for calcium absorption. REDUCE refined carbs for insulin sensitivity. PHYTOESTROGEN foods may help (soy, flaxseed). ";
        }

        // Enhanced Celiac Warning
        if (isCeliac) {
            safetyDirectives += "CELIAC PROTOCOL ENHANCED: ABSOLUTE ZERO GLUTEN - even trace amounts cause intestinal damage. CHECK ALL LABELS for hidden gluten: 'modified food starch', 'malt', 'hydrolyzed wheat protein', 'soy sauce', beer. OATS must be CERTIFIED gluten-free (cross-contamination common). NO shared cooking surfaces, toasters, or cutting boards. ";
        }

        // Adolescent Growth Spurt (10-16)
        if (stats.age >= 10 && stats.age <= 16) {
            safetyDirectives += "ADOLESCENT GROWTH PHASE: Additional calories allocated for development. CALCIUM and VITAMIN D critical for bone growth. IRON important (especially for females). Adequate protein for muscle development. DO NOT allow extreme caloric restriction. ";
        }

        // Thyroid Medication Timing
        if (isThyroid) {
            safetyDirectives += "THYROID MEDICATION TIMING: Take Levothyroxine on EMPTY STOMACH (30-60 min before food). SEPARATE calcium, iron, antacids, coffee by 4 HOURS to prevent absorption interference. CONSISTENCY in soy intake (affects thyroid levels). ";
        }

        // ... (Other conditions)

        return `
    ACT AS: Michelin Nutritionist & Clinical Dietitian.
    DAILY CALORIES: ${currentCalories} kcal
    MACRO TARGETS: Protein ${macros.protein}g | Fats ${macros.fats}g | Carbs ${macros.carbs}g
    DIET: ${stats.dietType} | CUISINE: ${stats.cuisine}
    ALLERGIES: ${stats.allergies || "None"} | MEDICATIONS: ${stats.medications || "None"}
    REGION: ${stats.region || "Unknown"} | BUDGET: ${stats.budgetAmount} ${stats.currency}
    STRATEGY: ${stats.mealStrategy} | SNACKS: ${stats.includeSnacks}
    UNIT SYSTEM: ${stats.unit.toUpperCase()} ${stats.unit === 'metric' ? "(STRICTLY GRAMS/ML. NO CUPS/OUNCES)" : ""}

    SAFETY DIRECTIVES (MUST FOLLOW): ${safetyDirectives}

    MANDATORY MICRONUTRIENT ADVISORIES (APPEND TO PLAN):
    ${stats.dietType.includes('Vegan') ? "- VEGAN ESSENTIAL: Supplement Vitamin B12 daily." : ""}
    ${isBariatric ? "- BARIATRIC ESSENTIAL: Daily Chewable Multivitamin + Calcium Citrate required." : ""}
    ${stats.isPregnant ? "- PRENATAL ESSENTIAL: Daily Prenatal Vitamin with Folic Acid required." : ""}
    ${combinedHealthText.includes("antibiotic") || combinedHealthText.includes("doxycycline") || combinedHealthText.includes("tetracycline") ? "- MEDICATION SAFETY: SEPARATE DAIRY/CALCIUM FROM ANTIBIOTICS BY 2 HOURS." : ""}
    ${isThyroid ? "- MEDICATION SAFETY: Take Levothyroxine on empty stomach. SEPARATE FROM CALCIUM/IRON SUPPLEMENTS BY 4 HOURS." : ""}
    - MICRONUTRIENT CHECKSUM: Verify IRON (>18mg for women) and CALCIUM (>1000mg). If Vegan, DOUBLE-CHECK IRON sources (Lentils/Spinach + Vitamin C for absorption).

    FORMATTING RULES:
    1. CONSOLIDATE SHOPPING LIST: Do not list "2 Apples" and "3 Apples" separately. Combine them into "5 Apples".
    2. PHYSICS COMPLIANCE: You MUST label every ingredient with "(Raw Weight)" or "(Cooked Weight)". Example: "150g Chicken Breast (Raw Weight)".
    3. SKILL ADAPTION: User has skill level '${stats.cookingSkill || 'beginner'}'. Adjust recipe complexity accordingly.
    4. SAFETY - BIOAVAILABILITY: Do NOT pair high-calcium dairy (milk, cheese) with Iron-rich sources (spinach, steak) in the same meal if possible.
    5. SAFETY - TOXICOLOGY: Limit High-Mercury Fish (Tuna/Swordfish) to maximum 2 times per week.`;
    };

    try {
        if (onProgress) onProgress("Designing Month 1 (Ignition)...");
        const m1Result = await callGemini(ai, getSafetyProfile(m1Cal, macroTargets) + "\nGenerate MONTH 1 (Week 1 Template).", batch1Schema, 60000);

        if (onProgress) onProgress("Evolving to Month 2 (Momentum)...");
        // ADAPTIVE THERMOGENESIS: Project 1.5% Weight Loss -> Re-calculate BMR/TDEE
        const projectedWeightM2 = stats.weight * 0.985;
        const bmrM2 = calculateBMR(projectedWeightM2, stats.height, stats.age, stats.gender, stats.medications);
        const tdeeM2 = calculateTDEE(bmrM2, stats.activity, stats.age) + cycleCalorieBuffer;
        let m2CalTarget = (stats.goal === 'lose' ? Math.round(tdeeM2 * 0.95) : Math.round(tdeeM2 * 1.05));
        // Safety Floors
        if (stats.goal === 'lose' && m2CalTarget < absoluteFloor) m2CalTarget = absoluteFloor;

        const m2Macros = calculateOptimalMacros(stats, m2CalTarget, {
            isRenal, isGeriatric, isNoGallbladder, isDiabetic, isGLP1,
            isPKU, isPCOS, isMenopauseAge, isGestationalDiabetes
        });
        const m2Result = await callGemini(ai, getSafetyProfile(m2CalTarget, m2Macros) + "\nGenerate MONTH 2 (Week 1 Template).", batchNextSchema, 60000);

        if (onProgress) onProgress("Finalizing Month 3 (Peak)...");
        // ADAPTIVE THERMOGENESIS: Project 3% Total Weight Loss
        const projectedWeightM3 = stats.weight * 0.97;
        const bmrM3 = calculateBMR(projectedWeightM3, stats.height, stats.age, stats.gender, stats.medications);
        const tdeeM3 = calculateTDEE(bmrM3, stats.activity, stats.age) + cycleCalorieBuffer;
        let m3CalTarget = (stats.goal === 'lose' ? Math.round(tdeeM3 * 0.90) : Math.round(tdeeM3 * 1.10));
        // Safety Floors
        if (stats.goal === 'lose' && m3CalTarget < absoluteFloor) m3CalTarget = absoluteFloor;

        const m3Macros = calculateOptimalMacros(stats, m3CalTarget, {
            isRenal, isGeriatric, isNoGallbladder, isDiabetic, isGLP1,
            isPKU, isPCOS, isMenopauseAge, isGestationalDiabetes
        });
        const m3Result = await callGemini(ai, getSafetyProfile(m3CalTarget, m3Macros) + "\nGenerate MONTH 3 (Week 1 Template).", batchNextSchema, 60000);

        // ROUND 8: USE SAFE WATER
        let finalWater = safeWater;
        if (m1Result.climateAnalysis?.isHot && !isRenal) finalWater += 0.3; // Don't add heat water if Renal

        // --- RENAL HARD LOCK (FINAL LINE OF DEFENSE) ---
        // Force 1.5L Cap regardless of heat, activity, or anything else if Renal is detected.
        let finalTargetLitres = Math.min(parseFloat(finalWater.toFixed(1)), isRenal ? 1.5 : 5.5);

        if (isRenal && finalTargetLitres > 1.5) {
            devError("⛔ SAFETY INTERVENTION: Resetting Water to 1.5L for Renal Safety.");
            finalTargetLitres = 1.5;
        }

        // REMEDIATION: ELECTROLYTE BLIND SPOT
        // Trigger if High Volume (>3L) OR if Athlete/Active in Heat (even if volume is lower)
        const needsElectrolytes = finalTargetLitres > 3.0 || stats.activity === 'athlete' || (stats.activity === 'active' && m1Result.climateAnalysis?.isHot);

        return {
            userStats: { ...stats, bmr, tdee, bmi, waterTargetLitres: finalTargetLitres, needsElectrolytes },
            safetyVerification: m1Result.safetyVerification,
            metabolicLog: metabolicLog,
            medicationAnalysis: m1Result.medicationAnalysis,
            climateAnalysis: m1Result.climateAnalysis,
            budgetStrategy: m1Result.budgetStrategy,
            pantryTips: m1Result.pantryTips,
            roadmap: {
                month1: expandMonth(1, m1Result, m1Cal, finalTargetLitres, stats.includeSnacks, stats.mealStrategy, stats.allergies),
                month2: expandMonth(2, m2Result, m2CalTarget, finalTargetLitres, stats.includeSnacks, stats.mealStrategy, stats.allergies),
                month3: expandMonth(3, m3Result, m3CalTarget, finalTargetLitres, stats.includeSnacks, stats.mealStrategy, stats.allergies)
            }
        };
    } catch (e) {
        devError("AI FAILED. ACTIVATING DYNAMIC FALLBACK PROTOCOL.");
        if (onProgress) onProgress("AI Service Unreachable. Activating Diet-Aware Emergency Fallback...");

        const fallback = getDynamicFallback(stats, calorieTarget, macroTargets);

        return {
            userStats: { ...stats, bmr, tdee, bmi, waterTargetLitres: safeWater, needsElectrolytes: false },
            safetyVerification: fallback.safetyVerification,
            medicationAnalysis: fallback.medicationAnalysis,
            climateAnalysis: fallback.climateAnalysis,
            budgetStrategy: fallback.budgetStrategy,
            pantryTips: fallback.pantryTips,
            roadmap: {
                month1: expandMonth(1, fallback, calorieTarget, baseWater, stats.includeSnacks, "fresh", ""),
                month2: expandMonth(2, fallback, calorieTarget, baseWater, stats.includeSnacks, "fresh", ""),
                month3: expandMonth(3, fallback, calorieTarget, baseWater, stats.includeSnacks, "fresh", "")
            }
        };
    }
};

async function callGemini(ai: GoogleGenAI, prompt: string, schema: Schema, tokens: number) {
    let attempt = 0;
    while (attempt < 3) {
        try {
            const response = await ai.models.generateContent({
                model: OWNER_CONFIG.modelName,
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                config: {
                    responseMimeType: "application/json",
                    responseSchema: schema,
                    maxOutputTokens: tokens,
                }
            });
            return JSON.parse(cleanJson(response.text || ""));
        } catch (e) {
            attempt++;
            await delay(2000 * attempt);
        }
    }
    throw new Error("AI Generation Failed");
}

function expandMonth(index: number, data: any, targetCal: number, water: number, includeSnacks: boolean, strategy: string, userAllergies: string): MonthPlan {
    const fullMonthDays: DailyPlan[] = [];
    for (let week = 0; week < 4; week++) {
        for (let d = 0; d < 7; d++) {
            const templateDay = data.weekTemplate[d] || data.weekTemplate[0];
            const meals = JSON.parse(JSON.stringify(templateDay.meals));

            if (!includeSnacks) delete meals.snack;

            meals.breakfast = validateFoodPhysics(meals.breakfast);
            meals.lunch = validateFoodPhysics(meals.lunch);
            meals.dinner = validateFoodPhysics(meals.dinner);
            if (meals.snack) meals.snack = validateFoodPhysics(meals.snack);

            meals.breakfast = runSafetyWatchdog(meals.breakfast, userAllergies);
            meals.lunch = runSafetyWatchdog(meals.lunch, userAllergies);
            meals.dinner = runSafetyWatchdog(meals.dinner, userAllergies);
            if (meals.snack) meals.snack = runSafetyWatchdog(meals.snack, userAllergies);



            fullMonthDays.push({
                day: (week * 7) + d + 1,
                meals,
                dailyMacros: { ...templateDay.dailyMacros, calories: meals.breakfast.calories + meals.lunch.calories + meals.dinner.calories + (meals.snack?.calories || 0) },
                waterTarget: water
            });
        }
    }
    return { monthIndex: index, phaseName: data.phaseName || `Phase ${index} `, targetCalories: targetCal, dailyPlan: fullMonthDays, groceries: { week1: data.shoppingList, week2: data.shoppingList, week3: data.shoppingList, week4: data.shoppingList } };
}
