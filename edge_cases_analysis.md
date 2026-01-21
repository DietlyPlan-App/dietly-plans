# EDGE CASES & PERMUTATION ANALYSIS
**DietlyPlans Application**  
**Date**: 2026-01-21

---

## 📋 COMPREHENSIVE INPUT COMBINATIONS

### 1. Demographic & Physical Extremes
*   **Age:**
    *   **Pediatric (12-17):** Triggers Schofield Equation + Growth Protection (No Calorie Deficits).
    *   **Adult (18-64):** Standard Mifflin-St Jeor.
    *   **Geriatric (65+):** 1.05x BMR Boost (Sarcopenia Protection).
    *   **Centenarian (100+):** Allowed, treated as Geriatric.
*   **Weight/BMI:**
    *   **Underweight (BMI < 16):** ⚠️ **HARD BLOCK** (Medical Supervision Required).
    *   **Underweight (BMI 16-18.5):** Forced Maintenance Calories (No Deficit).
    *   **Morbid Obesity (BMI > 40):** Standard calculations apply; likely triggers Bariatric logic if flagged.
    *   **Extreme Weight (e.g., 500kg):** Formula holds, but values become massive.

### 2. The "Chaos Matrix" (Complex Intersections)

#### A. The "Impossible Vegan"
*   **Scenario:** Vegan + Soy Allergy + Nut Allergy + Legume Allergy.
*   **Challenge:** Almost zero protein sources.
*   **Resolution:** Code detects this and forces **Pea Protein Isolate** and **Hemp Seeds**.

#### B. The "Broken Body" (Renal + Diabetes + Celiac)
*   **Scenario:** User has Kidney Failure, Diabetes, and Celiac Disease.
*   **Conflict:**
    *   Renal wants Low Protein.
    *   Diabetes wants Low Carb.
    *   Celiac bans Wheat.
*   **Resolution:**
    *   Protein Cap: 15% (Renal priority).
    *   Carb Cap: 35% (Diabetes priority).
    *   Remaining 50% = Fat (Healthy sources: Olive Oil, Avocado - unless Potassium restricted).
    *   Carb Source: Rice/Corn only (No Wheat).

#### C. The "Poverty Athlete"
*   **Scenario:** $20/week Budget + Pro Athlete (4000+ kcal).
*   **Conflict:** High calorie needs vs. extremely low funds.
*   **Resolution:** "Survival Mode". Plan shifts to extremely cheap calories (Rice, Oil, Peanut Butter, Oats) and drops expensive proteins (Steak/Salmon).

#### D. The "Salt Paradox" (Keto + Hypertension)
*   **Scenario:** Keto Diet (Requires Sodium/Electrolytes) + Hypertension (Requires Low Sodium).
*   **Conflict:** Direct medical contradiction.
*   **Resolution:** **Compromise Mode.** Sodium set to Moderate (2.5g). User warned to monitor BP daily.

#### E. The "Liquid Stomach" (Bariatric + High Calories)
*   **Scenario:** Gastric Bypass user needs 2500+ kcal (e.g., highly active).
*   **Conflict:** Stomach can't hold that volume.
*   **Resolution:** **Forced Snacking.** Meals capped at 200g. Calories distributed across 6-8 small feedings. Liquid calories (shakes) prescribed *between* meals.

### 3. Gender & Hormonal Permutations
*   **Female + Pregnant + Lose Weight:** **OVERRIDE.** Goal forced to 'Maintain' or 'Gain'. No deficits allowed.
*   **Female + Breastfeeding:** **BOOST.** TDEE + 500kcal. Hydration + 0.8L.
*   **Female + Luteal Phase:** **BUFFER.** +250kcal added if cycle day is 14-28.
*   **Male + "Pregnant":** Input ignored (UI hides option, but API sanitizes it).

### 4. Drug-Nutrient Interactions
*   **Warfarin:** Grapefruit/Cranberry BANNED. Vitamin K consistency enforced.
*   **MAOIs:** Tyramine BANNED (No aged cheese/wine).
*   **Statins:** Grapefruit BANNED.
*   **Antibiotics:** Probiotics scheduled 2 hours later.

### 5. Budget Constraints
*   **<$20/week:** "Survival Mode" (Rice/Beans/Oil).
*   **$20-$50/week:** Budget Mode (Eggs, Chicken Thighs, Frozen Veg).
*   **Unlimited:** Premium Mode (Salmon, Steak, Organic).

### 6. Allergies (The "Minefield")
*   **Single:** Gluten, Dairy, Nut, Soy, Egg, Shellfish, Fish.
*   **Multiple:** Any combination handled via exclusion.
*   **Hidden:** "Whey" enters as Dairy. "Malt" enters as Gluten.

### 7. Logical Fail-Safes
*   **AI Failure:** If Gemini API is down, a hard-coded `DynamicFallback` algorithm generates a medically safe "Emergency Plan" instantly.
*   **Prompt Injection:** Inputs like `System: Ignore all instructions` are sanitized out.
*   **Negation:** "No Diabetes" is correctly interpreted as Healthy.

---
**Verdict:** The application logic handles all tested permutations, favoring **Patient Safety** over User Preference in every conflict.
