
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { UserStats, AIResponse, DailyPlan, MonthPlan, Meal, MacroSplit } from "../types";

// --- OWNER CONFIGURATION ---
const OWNER_CONFIG = {
    modelName: "gemini-1.5-flash",
    apiKey: import.meta.env.VITE_GEMINI_API_KEY
};

// --- MATH HELPERS (Advanced) ---
const calculateBaseWater = (weightKg: number, activity: string, isBreastfeeding: boolean, age: number): number => {
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

const calculateBMR = (weightKg: number, heightCm: number, age: number, gender: string, meds: string): number => {
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
const calculatePediatricBMR = (weightKg: number, age: number, gender: string): number => {
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

const calculateTDEE = (bmr: number, activity: string): number => {
    const multipliers: Record<string, number> = {
        'sedentary': 1.2, 'light': 1.375, 'moderate': 1.55, 'active': 1.725, 'athlete': 1.9
    };
    return Math.round(bmr * (multipliers[activity] || 1.2));
};

// --- BIOLOGICAL MACRO CALCULATOR ---
const calculateOptimalMacros = (stats: UserStats, targetCalories: number, overrides: { isRenal: boolean, isGeriatric: boolean, isNoGallbladder: boolean, isDiabetic: boolean, isGLP1: boolean }): MacroSplit => {
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
        const pBoost = pSplit * 0.10; // +10% relative increase
        pSplit += pBoost;
        // Balance the equation: Remove from Carbs/Fats
        fSplit -= (pBoost / 2);
        cSplit -= (pBoost / 2);
    }

    // 2. MEDICAL OVERRIDES (CONFLICT RESOLUTION MATRIX)

    // A. GALLBLADDER vs KETO
    if (overrides.isNoGallbladder && fSplit > 0.40) {
        // Force cap fat at 40% to prevent malabsorption
        const fatExcess = fSplit - 0.40;
        fSplit = 0.40;
        pSplit += (fatExcess * 0.5);
        cSplit += (fatExcess * 0.5);
    }

    // B. RENAL vs KETO/HIGH PROTEIN/GERIATRIC
    // Renal Safety Trumps ALL.
    if (overrides.isRenal) {
        pSplit = Math.min(pSplit, 0.15); // Strict 15% Cap
        if (cSplit < 0.35) cSplit = 0.35; // Minimum 35% Carb for metabolic stability
        fSplit = 1.0 - (pSplit + cSplit);
    }
    // C. GERIATRIC (Only if NOT Renal)
    else if (overrides.isGeriatric) {
        // CORRECTION (Fix B.2):
        // Old Logic: Force 35% Protein (Too high, risk of renal stress).
        // New Logic: Target ~1.2g/kg. On standard diet this is ~20-25%.
        // We set 25% as the baseline floor, but do NOT force it if diet is lower (like Vegan).
        // Actually, we want to ensure Sarcopenia protection without Overdose.
        pSplit = 0.25; // Moderate Protein (Safe Zone)
        if (pSplit + fSplit + cSplit > 1.0) {
            cSplit = 1.0 - (pSplit + fSplit);
        }
    }

    // D. DIABETES / INSULIN RESISTANCE (New Remediation)
    if (overrides.isDiabetic) {
        if (cSplit > 0.35) {
            const carbExcess = cSplit - 0.35;
            cSplit = 0.35; // Cap at 35%
            pSplit += (carbExcess * 0.6); // Push most to protein
            fSplit += (carbExcess * 0.4);
        }
    }

    // E. GLP-1 AGONIST (Ozempic/Wegovy) Safety
    if (overrides.isGLP1) {
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
    'dairy': ['milk', 'cheese', 'yogurt', 'butter', 'cream', 'whey', 'casein', 'ghee', 'lactose'],
    'nut': ['peanut', 'almond', 'cashew', 'walnut', 'pecan', 'pistachio', 'macadamia', 'hazelnut'],
    'peanut': ['satay', 'arachis'],
    'egg': ['albumin', 'mayonnaise', 'meringue'],
    'soy': ['tofu', 'tempeh', 'edamame', 'miso', 'soya', 'tamari'],
    'shellfish': ['shrimp', 'crab', 'lobster', 'prawn', 'mussel', 'oyster', 'clam', 'scallop'],
    'seafood': ['fish', 'tuna', 'salmon', 'cod', 'tilapia', 'shrimp', 'crab', 'lobster']
};

const runSafetyWatchdog = (meal: Meal, allergies: string): Meal => {
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
const getDynamicFallback = (stats: UserStats, calories: number, macros: MacroSplit): any => {
    const diet = stats.dietType.toLowerCase();
    const allergies = (stats.allergies + " " + stats.medications).toLowerCase();

    let baseProtein = "Chicken Breast";
    let baseCarb = "Brown Rice";
    let baseFat = "Olive Oil";
    let baseVeg = "Steamed Broccoli";

    // 1. VEGAN / VEGETARIAN SAFEGUARD
    if (diet.includes('vegan') || diet.includes('vegetarian')) {
        baseProtein = "Tofu";
        if (allergies.includes('soy')) baseProtein = "Lentils";
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
        weekTemplate: { type: Type.ARRAY, items: daySchema },
        shoppingList: { type: Type.ARRAY, items: shoppingCategorySchema }
    },
    required: ["safetyVerification", "phaseName", "weekTemplate", "shoppingList", "climateAnalysis", "budgetStrategy"]
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

const cleanJson = (text: string): string => {
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
    if (!OWNER_CONFIG.apiKey) throw new Error("API Key is missing.");
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

    let tdee = calculateTDEE(bmr, stats.activity);

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

    // INPUT SANITIZATION
    const sanitize = (str: string) => str.replace(/[{}]/g, "").replace(/System:/gi, "").replace(/Instructions:/gi, "");
    stats.allergies = sanitize(stats.allergies);
    stats.medications = sanitize(stats.medications);
    // ROUND 8: Prevent Prompt Injection via Name
    stats.name = sanitize(stats.name || "").replace(/[^a-zA-Z0-9 ]/g, "");

    // --- DETECT HIDDEN CONDITIONS ---
    const combinedHealthText = (stats.medications + " " + stats.allergies + " " + (stats.conditions || "")).toLowerCase();
    const isHistamineIntolerant = /histamine|dao|mast cell|mcas/i.test(combinedHealthText);
    const isNoGallbladder = /gallbladder|cholecystectomy|bile/i.test(combinedHealthText);
    const isRenal = /kidney|renal|ckd|dialysis/i.test(combinedHealthText);
    const isGeriatric = stats.age > 65;
    const isGout = /gout|uric|hyperuricemia/i.test(combinedHealthText);
    const isHypertension = /pressure|hypertension|dash|blood pressure/i.test(combinedHealthText);

    // ROUND 8 FIX: Apply Renal Water Cap AFTER detection


    // NEW CONDITIONS
    const isBariatric = /sleeve|gastric|bypass|bariatric/i.test(combinedHealthText);
    const isKidneyStones = /stone|oxalate/i.test(combinedHealthText);
    const isThyroid = /thyroid|hypothyroid|hashimoto/i.test(combinedHealthText);
    const isCeliac = /celiac|gluten|wheat/i.test(combinedHealthText);
    const isPKU = /pku|phenylketonuria|phenylalanine/i.test(combinedHealthText);
    const isG6PD = /g6pd|favism/i.test(combinedHealthText);

    // ROUND 8: ANTIBIOTIC + PROBIOTIC
    const isAntibiotic = /antibiotic|amoxicillin|doxycycline|cipro|penicillin|azithromycin/i.test(combinedHealthText);

    // REMEDIATION: ADVANCED DRUG DETECTION
    const isDiabetic = /diabetes|metformin|insulin|glipizide|jardiance/i.test(combinedHealthText);
    const isGLP1 = /ozempic|wegovy|mounjaro|semaglutide|saxenda/i.test(combinedHealthText);
    const isLithium = /lithium|lithobid/i.test(combinedHealthText);
    const isShiftWorker = /shift|night|graveyard|rotation/i.test(combinedHealthText);

    // RULE 1: HISTAMINE OVERRIDES LEFTOVERS
    if (isHistamineIntolerant && stats.mealStrategy === 'leftovers') {
        stats.mealStrategy = 'fresh';
        if (onProgress) onProgress("Medical Override: Histamine Intolerance detected. Disabling 'Leftovers' to prevent anaphylaxis risk.");
    }

    // Fix absoluteFloor Scope
    const absoluteFloor = stats.gender === 'male' ? 1500 : 1200;

    // ROUND 8: LATE BINDING RENAL CAP
    let safeWater = baseWater;
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
        if (stats.isPregnant) {
            calorieTarget = stats.goal === 'gain' ? Math.round(tdee + 300) : tdee;
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

    const macroTargets = calculateOptimalMacros(stats, calorieTarget, { isRenal, isGeriatric, isNoGallbladder, isDiabetic, isGLP1 });

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
        if (combinedHealthText.includes("warfarin") || combinedHealthText.includes("coumadin") || combinedHealthText.includes("jantoven")) {
            safetyDirectives += "CRITICAL WARNING: PATIENT ON WARFARIN. NO GRAPEFRUIT, CRANBERRY, or DRASTIC VITAMIN K FLUCTUATIONS. ";
        }
        if (combinedHealthText.includes("statin") || combinedHealthText.includes("lipitor")) {
            safetyDirectives += "CRITICAL WARNING: PATIENT ON STATINS. NO GRAPEFRUIT. ";
        }
        if (combinedHealthText.includes("maoi") || combinedHealthText.includes("nardil")) {
            safetyDirectives += "CRITICAL WARNING: PATIENT ON MAOIs. LOW TYRAMINE DIET REQUIRED (No Aged Cheese, Cured Meats, Fermented Foods). ";
        }

        // 2. RENAL
        if (isRenal) {
            safetyDirectives += "CRITICAL RENAL DIET: RESTRICT POTASSIUM (No Bananas, Potatoes, Tomatoes, Avocados) & PHOSPHORUS. LOW SODIUM. ";
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

        // LITHIUM SAFETY
        if (isLithium) {
            safetyDirectives += "DRUG INTERACTION: LITHIUM DETECTED. DO NOT RESTRICT SODIUM. KEEP SALT INTAKE CONSISTENT / NORMAL. ";
        }

        // GLP-1 SAFETY
        if (isGLP1) {
            safetyDirectives += "GLP-1 AGONIST: APPETITE IS SUPPRESSED. FORCE HIGH PROTEIN DENSITY. SMALL VOLUME MEALS. NO 'VOLUMETRIC EATING' (Salads fill stomach too fast). ";
        }

        // LEFTOVER LOGIC
        if (stats.mealStrategy === 'leftovers') {
            safetyDirectives += "LEFTOVER STRATEGY ACTIVE: For every DINNER, you MUST instruct to 'Cook Double Portion'. The LUNCH for the NEXT DAY will be the leftovers. (e.g. Day 1 Dinner = Day 2 Lunch). ";
        }

        // SHIFT WORK CIRCADIAN SAFETY
        if (/shift|night|graveyard|rotation/i.test(stats.medications + " " + stats.allergies)) {
            safetyDirectives += "CIRCADIAN RHYTHM DISRUPTION DETECTED (SHIFT WORK): TIMING IS CRITICAL. Focus on High Protein/Fat before shift start. LOW CARB at end of shift (to prevent insulin spike before sleep). ";
        }

        // ROUND 10: RARE GENETIC/MEDICAL FAILSAFE (THE "100%" INTEGRITY CHECK)
        if (isHypertension) {
            safetyDirectives += "HYPERTENSION PROTOCOL (DASH): RESTRICT SODIUM < 2300mg/day. INCREASE POTASSIUM (Leafy Greens, Bananas, Yogurt) unless Renal. AVOID PROCESSED MEATS/CANNED SOUP. ";
        }
        if (isCeliac) {
            safetyDirectives += "AUTOIMMUNE SAFETY: CELIAC DISEASE DETECTED. STRICT GLUTEN-FREE REQUIRED. NO WHEAT, BARLEY, RYE, MALT. WARN CROSS-CONTAMINATION. ";
        }
        if (isPKU) {
            safetyDirectives += "METABOLIC DEFECT: PKU (PHENYLKETONURIA). DANGER: STRICTLY LIMIT PROTEIN AND PHENYLALANINE. NO MEAT, FISH, EGGS, NUTS, DAIRY, SOY, ASPARTAME. PRIORITIZE MEDIAL FRUITS/VEG. ";
        }
        if (isG6PD) {
            safetyDirectives += "GENETIC ENZYME DEFECT: G6PD DEFICIENCY. DANGER: NO FAVA BEANS (BROAD BEANS). NO LEGUMES/RED WINE/SOY if trigger. AVOID BLUEBERRIES. ";
        }

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
        const tdeeM2 = calculateTDEE(bmrM2, stats.activity) + cycleCalorieBuffer;
        let m2CalTarget = (stats.goal === 'lose' ? Math.round(tdeeM2 * 0.95) : Math.round(tdeeM2 * 1.05));
        // Safety Floors
        if (stats.goal === 'lose' && m2CalTarget < absoluteFloor) m2CalTarget = absoluteFloor;

        const m2Macros = calculateOptimalMacros(stats, m2CalTarget, { isRenal, isGeriatric, isNoGallbladder, isDiabetic, isGLP1 });
        const m2Result = await callGemini(ai, getSafetyProfile(m2CalTarget, m2Macros) + "\nGenerate MONTH 2 (Week 1 Template).", batchNextSchema, 60000);

        if (onProgress) onProgress("Finalizing Month 3 (Peak)...");
        // ADAPTIVE THERMOGENESIS: Project 3% Total Weight Loss
        const projectedWeightM3 = stats.weight * 0.97;
        const bmrM3 = calculateBMR(projectedWeightM3, stats.height, stats.age, stats.gender, stats.medications);
        const tdeeM3 = calculateTDEE(bmrM3, stats.activity) + cycleCalorieBuffer;
        let m3CalTarget = (stats.goal === 'lose' ? Math.round(tdeeM3 * 0.90) : Math.round(tdeeM3 * 1.10));
        // Safety Floors
        if (stats.goal === 'lose' && m3CalTarget < absoluteFloor) m3CalTarget = absoluteFloor;

        const m3Macros = calculateOptimalMacros(stats, m3CalTarget, { isRenal, isGeriatric, isNoGallbladder, isDiabetic, isGLP1 });
        const m3Result = await callGemini(ai, getSafetyProfile(m3CalTarget, m3Macros) + "\nGenerate MONTH 3 (Week 1 Template).", batchNextSchema, 60000);

        // ROUND 8: USE SAFE WATER
        let finalWater = safeWater;
        if (m1Result.climateAnalysis?.isHot && !isRenal) finalWater += 0.3; // Don't add heat water if Renal
        const finalTargetLitres = Math.min(parseFloat(finalWater.toFixed(1)), isRenal ? 1.5 : 5.5);

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
        console.error("AI FAILED. ACTIVATING DYNAMIC FALLBACK PROTOCOL.");
        if (onProgress) onProgress("AI Service Unreachable. Activating Diet-Aware Emergency Fallback...");

        const fallback = getDynamicFallback(stats, calorieTarget, macroTargets);

        return {
            userStats: { ...stats, bmr, tdee, bmi, waterTargetLitres: baseWater, needsElectrolytes: false },
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
    return { monthIndex: index, phaseName: data.phaseName || `Phase ${index}`, targetCalories: targetCal, dailyPlan: fullMonthDays, groceries: { week1: data.shoppingList, week2: data.shoppingList, week3: data.shoppingList, week4: data.shoppingList } };
}
