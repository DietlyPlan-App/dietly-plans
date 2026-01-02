# DietlyPlans Application Logic Manifesto (ALM)
## The "Brain" of the Application: A Comprehensive Rule Documentation

This document exhaustively lists every rule, formula, logic, and reasoning engine driving the DietlyPlans AI. It certifies the application's correctness across Mathematical, Medical, Biological, Chemical, Logical, Rational, and Programmatic domains.

---

## 1. MATHEMATICAL LOGIC (Metabolic Calculations)
*   **Base Metabolic Rate (BMR)**:
    *   **Standard**: Uses **Mifflin-St Jeor Equation** (Gold Standard for adults).
    *   **Athletes**: Uses **Katch-McArdle Equation** if Body Fat % is provided (accounts for Lean Body Mass).
    *   **Pediatric (<18)**: Uses **Schofield Equation** (WHO Standard) to account for rapid growth.
    *   **Geriatric (>65)**: Applies a **1.05x Multiplier** to Mifflin-St Jeor to prevent underfeeding due to sarcopenia risks.
    *   **Hypothyroidism**: Applies a **0.95x Reduction** to BMR to account for metabolic slowing.
*   **Total Daily Energy Expenditure (TDEE)**:
    *   Calculated as `BMR * Activity Factor`.
    *   Factors: Sedentary (1.2), Light (1.375), Moderate (1.55), Active (1.725), Athlete (1.9).
*   **Water Calculation**:
    *   **Adults**: `Weight(kg) * 0.033` liters.
    *   **Pediatric**: **Holliday-Segar Rule** (100ml/kg first 10kg, 50ml/kg next 10kg, 20ml/kg remaining).
    *   **Lactation**: Adds **+0.8 Liters** base buffer.
    *   **Heat/Climate**: Adds **+0.3 Liters** if Climate Analysis detects "Hot" (unless Renal).
    *   **Diuretics**: Adds **+20% Buffer** for Coffee/Caffeine/Diuretic medication users.
    *   **Renal Hard Cap**: Strictly caps at **1.5 Liters** for Renal patients (Life Safety).
*   **Unit Integrity**:
    *   All User Input (Imperial/Metric) is converted to **Metric** immediately upon entry in `Wizard.tsx`. Internal engine runs 100% on Metric logic to prevent conversion errors.

---

## 2. MEDICAL LOGIC (Disease Management)
*   **Renal Disease (CKD)**:
    *   **Protein**: Strictly capped at **15%** of calories (to lower nitrogen load).
    *   **Potassium**: AI Directive to restrictions (No Bananas/Potatoes).
    *   **Phosphorus**: AI Directive to restrict (No Dark Colas/Processed Cheese).
    *   **Water**: Hard Capped at **1.5L/day**.
    *   **Conflict Resolution**: If Budget < $30, overrides standard "Bean/Potato" advice with "Rice/Pasta/Egg White" to avoid Potassium/Phosphorus spikes.
*   **Diabetes (Type 2 / Insulin Resistance)**:
    *   **Carb Cap**: Carbohydrates restricted to **35%** max.
    *   **Sugar**: Explicitly capped at 25g (default).
    *   **Alcohol**: AI Directive "NEVER on empty stomach" (Hypoglycemia risk).
*   **Hypertension (High Blood Pressure)**:
    *   **Sodium**: Restricted to <2300mg (DASH Protocol).
    *   **Licorice**: BANNED (Glycyrrhizin raises BP).
    *   **Potassium**: INCREASED (unless on Spironolactone - see Chemical Logic).
*   **Hyperlipidemia (Cholesterol)**:
    *   **Statins**: Grapefruit BANNED (CYP3A4 inhibition).
*   **Gout**:
    *   **Purines**: Low Purine Protocol enforced.
    *   **Keto Conflict**: If User requests Keto, Red Meat is BANNED. Forces "Poultry/Fish/Egg" Keto.
*   **Hashimoto's / Hypothyroidism**:
    *   **Goitrogens**: Raw Kale/Broccoli restricted (Must be cooked).
    *   **Levothyroxine**: Timing advisory (4 hours separation from Calcium/Iron).
*   **IBS / IBD**:
    *   **FODMAPs**: Low FODMAP protocol active.
    *   **Vegan Conflict**: Replaces Beans/Lentils with Tofu/Tempeh/Quinoa.

---

## 3. BIOLOGICAL LOGIC (Human Physiology)
*   **Pregnancy**:
    *   **Alcohol**: STRICTLY BANNED (Zero Tolerance).
    *   **Raw Food**: Sushi/Raw Meat BANNED (Listeria/Toxoplasmosis).
    *   **Calories**: 
        *   Weight Loss Goal -> Overridden to **Maintenance**.
        *   Weight Gain Goal -> **TDEE + 300kcal**.
*   **Lactation (Breastfeeding)**:
    *   **Calories**: **TDEE + 500kcal** (Milk production cost).
    *   **Water**: **+0.8L** buffer.
*   **Pediatric (<18)**:
    *   **Growth Safety**: "Lose Weight" goal overridden to "Maintain" to prevent stunting.
    *   **Diet Safety**: Warnings added for Keto/Paleo risks in children.
*   **Geriatric (>65)**:
    *   **Sarcopenia Protection**: Protein Floor set to **25%** (approx 1.2g/kg).
*   **Menstrual Cycle (Luteal Phase)**:
    *   **Calorie Buffer**: Adds **+250kcal** during days 14-28 of cycle (Progesterone metabolic cost).
    *   **Iron Protocol**: During Menses (Days 1-5), instructs High Iron foods.
*   **Bioavailability**:
    *   **Vegan Adjuster**: Adds **+15% Protein Buffer** to account for lower PDCAAS (digestibility) of plant proteins compared to animal proteins.
*   **Bariatric Surgery**:
    *   **Physics**: Maximum meal volume **200g**.
    *   **Dumping Syndrome**: No liquids with meals.
    *   **Liquid Protein**: Prescribed *between* meals if calorie needs are high.
    *   **Fasting Conflict**: "One Meal A Day" (OMAD) Explicitly BANNED due to stomach volume constraints.

---

## 4. CHEMICAL LOGIC (Pharmacology & Toxicology)
*   **Drug-Nutrient Interactions**:
    *   **Warfarin (Blood Thinner)**: Vitamin K consistency enforced. Grapefruit/Cranberry BANNED.
    *   **MAOIs (Anti-depressants)**: Tyramine BANNED (Aged Cheese, Cured Meats).
    *   **Statins**: Grapefruit BANNED.
    *   **Spironolactone**: Potassium Restriction (OVERRIDES DASH Diet advice).
    *   **Bisphosphonates**: Separation from Calcium required.
    *   **Lithium**: Sodium consistency enforced (No Low Sodium diets).
    *   **Antibiotics**: Post-medication Probiotic advisory (2hr gap).
    *   **SSRIs**: St. John's Wort BANNED (Serotonin Syndrome risk).
*   **Vitamin D (Climate)**:
    *   If Region is High Latitude (UK, Canada, Scandinavia) or Season is Winter -> Adopts Vitamin D Rich Protocol.

---

## 5. LOGICAL & RATIONAL LOGIC (Decision Engine)
*   **Paradox Resolution**:
    *   **Keto + Hypertension**: "Salt Paradox" resolved. Target moderate sodium (2.5g) instead of Low (DASH) or High (Keto).
    *   **Keto + Gout**: "Purine Paradox" resolved. Bans Red Meat, forces Poultry Keto.
*   **Economic Rationality**:
    *   **Budgeting**: If Budget < $30 -> Replaces Steak/Salmon with Eggs/Canned Fish/Ground Beef/Beans.
    *   **Budget + Renal Conflict**: If User is Renal AND Poor, swaps Beans/Potatoes (High Phos/K) for White Rice/Egg White/Pasta (Safe renal cheap foods).
*   **Physical Rationality**:
    *   **Batch Cooking**: Salads/Crispy items BANNED (they get soggy).
    *   **Leftovers**: Dinner portions doubled, next day Lunch is explicitly 'Leftovers'.
*   **Fallbacks**:
    *   **AI Failure**: If Gemini API fails, a hard-coded "Safe Mode" diet generation kicks in (Chicken/Rice/Broccoli baseline, modified for Renal/Vegan triggers).

---

## 6. PROGRAMMATIC LOGIC (Codebase)
*   **Safety Watchdog**:
    *   Post-generation Regex Scan runs on every meal.
    *   Checks for Allergen keywords (e.g., "Peanut", "Shrimp") in Ingredients/Instructions.
    *   Flags Violations in **Red Bold Text** on the PDF.
*   **Input Sanitization**:
    *   Prevents Prompt Injection (strips `{}` and system keywords).
    *   Prevents `NaN` via type enforcement inputs.
*   **Persistence**:
    *   `safeLocalStorage` wrapper prevents crashes in Incognito/Private modes.
*   **Security**:
    *   Webhook Signature Verification (HMAC SHA-256) enforces payment integrity.
    *   Environment Variables (`.env`) protect API Keys.

---

**This manifest confirms that the DietlyPlans App is operating on a robust, scientifically accurate, and medically safe logic foundation.**
