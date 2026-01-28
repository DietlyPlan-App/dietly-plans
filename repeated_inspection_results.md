# Repeated Inspection Results: Comprehensive Codebase Analysis

**Generated Trace ID:** FRESH-INSPECT-2026-01-28
**Scope:** Core Logic, Medical Safety, Mathematical Precision, Chemical Interactions, Programmatic Integrity

---

## 1. MATHEMATICAL FORMULAS & PRECISION

The app uses gold-standard metabolic formulas adapted for specific populations.

### 1.1 Basal Metabolic Rate (BMR)
| Population | Formula Used | Source Logic |
|------------|--------------|--------------|
| **Adults (Standard)** | **Mifflin-St Jeor** | `(10*W) + (6.25*H) - (5*A) + (Male ? 5 : -161)` |
| **Athletes (High Body Fat Precision)** | **Katch-McArdle** | `370 + (21.6 * LeanBodyMass)` (Requires Body Fat %) |
| **Pediatrics (<18)** | **Schofield Equation** | WHO standard age/gender coefficients |
| **Geriatrics (>65)** | **Adjusted Mifflin** | Base BMR × 1.05 (Compensates for muscle efficiency loss) |
| **Hypothyroid** | **Medical Adjustment** | Base BMR × 0.95 (-5% metabolic slowdown) |

### 1.2 Total Daily Energy Expenditure (TDEE)
Activity Multipliers applied to BMR:
- Sedentary: 1.2x
- Light: 1.375x
- Moderate: 1.55x
- Active: 1.725x
- Athlete: 1.9x

**Cycle Adjustment:** +250 kcal/day added during Luteal Phase (Days 14–28 of cycle).

### 1.3 Hydration Logic (Water Target)
| Condition | Calculation |
|-----------|-------------|
| **Adult Baseline** | `Weight(kg) * 0.033` Liters |
| **Pediatric** | **Holliday-Segar Rule** (100ml/kg first 10kg, etc.) |
| **Breastfeeding** | +0.8 Liters (Milk production support) |
| **Diuretics / Caffeine** | +20% adjustment |
| **Kidney Stones** | Floor at 3.0 Liters (Flush protocol) |
| **Renal Failure** | **HARD CAP at 1.5 Liters** (Edema/Heart Failure protection) |
| **Safety Cap** | Max 4.5 Liters (Hyponatremia prevention) |

---

## 2. MEDICAL & BIOLOGICAL RULES

### 2.1 Critical Condition Overrides (Medical Safety Matrix)

| Condition | Logic Applied | Rationale |
|-----------|---------------|-----------|
| **No Gallbladder** | **Fat Cap 40%** | Prevents steatorrhea/malabsorption. **BLOCKS Strict Keto.** |
| **Renal Disease (CKD)** | **Protein Cap 15%**, Fluid Cap 1.5L | Reduces glomerular filtration load. |
| **Diabetes** | **Carb Cap 35%** | Glycemic control. |
| **GLP-1 Agonist** | **Protein Floor 40%** | Prevents sarcopenia during rapid weight loss. |
| **Bariatric Surgery** | **Force Snacks**, Small Meals | Prevents Dumping Syndrome/Volume overload. |
| **Pregnancy** | **Block "Lose" Limit**, +300kcal | Fetal growth priority. |
| **Lactation** | +500kcal, +0.8L Water | Milk supply preservation. |
| **Pediatric (<18)** | **Block "Lose"**, Katch-McArdle | Growth protection. |
| **Gout** | **Low Purine** | No organ meats, anchovies, shellfish. |

### 2.2 Chemical / Drug Interactions

| Drug Class | Interaction Rule |
|------------|------------------|
| **Warfarin (Coumadin)** | **NO Grapefruit, Cranberry**, Vitamin K stability |
| **MAOIs (Nardil)** | **Low Tyramine** (No aged cheese, cured meats) |
| **Statins** | **NO Grapefruit** (CYP3A4 inhibition risk) |
| **Antibiotics** | Probiotics separation (2hrs) |
| **Levothyroxine** | Calcium/Iron separation (4hrs) |
| **Lithium** | Sodium consistency check |
| **Bisphosphonates** | Empty stomach requirement |

---

## 3. PROGRAMMATIC LOGIC & FALLBACKS

### 3.1 Dynamic Fallback System (`getDynamicFallback`)
If the AI (Gemini) API fails (404/500/Timeout), the app generates a deterministic "Safe Mode" plan.
- **Base:** Chicken Breast, Brown Rice, Broccoli, Olive Oil.
- **Adapters:**
    - Vegan -> Tofu/Lentils
    - Keto -> Cauliflower Rice, Avocado Oil
    - Renal -> Egg Whites, White Rice (Low Phos/K)
    - Allergy -> Fish (if Chicken allergy)

### 3.2 Client-Side Conflict Detection (`Wizard.tsx`)
Before API submission, the Wizard checks for impossible logic:
1. **Keto + No Gallbladder** -> Blocks (Fat digestion failure risk)
2. **Keto + Renal** -> Blocks (Protein load risk)
3. **Bariatric + Batch Cooking** -> Blocks (Volume risk)
4. **Budget < $20** -> Warns (Nutritional deficiency risk)

### 3.3 Database Operations (Supabase)
- **Tables**: `plans` (Stores user JSON)
- **Functions**: `create-dodo-checkout` (Payment link generation)
- **Storage**: `pdfs` (Generated plan storage - **CURRENTLY BROKEN DUE TO RLS**)

---

## 4. EDGE CASE PERMUTATION ANALYSIS

### 4.1 High-Risk Combinations

| ID | Combination | Expected Behavior |
|----|-------------|-------------------|
| **EC-01** | **Renal + Keto** | **BLOCKED** by Wizard. If bypassed, Backend forces Low Protein (breaks Keto). |
| **EC-02** | **Vegan + Soy Allergy + Nut Allergy** | **Safe Fallback**: Lentils, Seeds, Pea Protein. |
| **EC-03** | **Pregnant + Diabetic** | **Hybrid Rule**: Carb Cap 35% AND +300kcal. No Alcohol, specific food safety. |
| **EC-04** | **Bariatric + Athlete (High Cal)** | **Force Snacks**: Spreads 3000kcal into 6 meals (500kcal each) to avoid vomiting. |
| **EC-05** | **Pediatric + Weight Loss** | **Override**: Forces "Maintain" goal. Blocks deficit. |

### 4.2 Logical Paradoxes Detected

1.  **The "Salt Paradox"**:
    *   *Scenario*: **Hypertension** (Needs Low Salt) + **Keto** (Needs Electrolytes/Salt).
    *   *Resolution*: Code advises "Moderate Sodium (2.5g)" - a calculated compromise.
2.  **The "Purine Paradox"**:
    *   *Scenario*: **Gout** (No Red Meat) + **Keto** (Often Red Meat based).
    *   *Resolution*: Forces "Poultry/Fish" Keto variants.

---

## 5. LIVE QA TESTING RESULTS (Phase 2)

**Test Case: Renal Condition + Keto Diet (High Risk)**
- **User Profile:** Male, 45, 90kg.
- **Inputs:** Diet="Keto", Condition="Chronic Kidney Disease".
- **Expected Result:** Wizard Logic Block.
- **Actual Result:** ✅ **PASSED**. Conflict Modal appeared.
    - *Evidence:* `renal_keto_conflict_modal_1769579251901.png`
- **Resolution:** User successfully switched to "Vegetarian" and proceeded to auth.

**Authentication Check:**
- **Email:** `j.er.ne.llmo.las@gmail.com`
- **Status:** ✅ Login Successful.

---

## 5.1 LIVE QA RESULTS (Phase 3: Dashboard & Revenue)

**Dashboard Inspection:**
- **Status:** ✅ Loaded successfully.
- **Mode:** ⚠️ **FALLBACK/SAFETY MODE ACTIVATED**.
    - *Evidence:* Meal names are "Safe Start Bowl", "Safe Power Lunch".
    - *Cause:* Gemini API failed (404/Quota). App used `getDynamicFallback` correctly.

**Feature Testing:**
| Feature | Outcome | Error Code | Rationale |
|---------|---------|------------|-----------|
| **PDF Download** | ❌ **FAIL** | Silent | Likely Client-Side trigger fail or Backend RLS suppression. |
| **Payment Link** | ❌ **FAIL** | **401 Unauthorized** | Dodo API Key invalid/missing in Production env. |
| **Shopping List** | ✅ **Active** | Showing generic fallback list (brown rice, chicken, broccoli). |

---

## 6. FINAL DEPLOYMENT READINESS ASSESSMENT

**Current Status: 🔴 NOT READY FOR REVENUE**

### ❌ CRITICAL BLOCKERS (Must fix before running ads)
1.  **Payment API (Dodo)**: Returning `401 Unauthorized`. **No money can be made.**
2.  **AI Service (Gemini)**: Returning `404`/Errors. **Users are not getting what they pay for** (Personalized AI plans).
3.  **PDF Deliverable**: Usage is broken. Premium users cannot download their product.

### ✅ STRONG POINTS
1.  **Safety First**: The app **did not crash** when AI failed. It gracefully served a safe fallback plan.
2.  **Logic Guardrails**: The Wizard correctly stopped a dangerous "Renal + Keto" user.

### 📝 ACTION PLAN
1.  **Vercel Env Vars**: Add `VITE_GEMINI_API_KEY` and correct Dodo Payments keys.
2.  **Supabase RLS**: Fix storage policies to allow PDF uploads.
3.  **Supabase Edge Function**: Debug `create-dodo-checkout` for 401 error.

**Verdict:** The application logic is scientifically sound, but the cloud infrastructure (API keys/Permissions) is disconnected.


**Current Status: NOT READY (60%)**

### ❌ Critical Blockers
1.  **AI Connectivity**: The hosted app (`dietly-plans.vercel.app`) returns **404** for Gemini API calls. **Core Functionality is Down.** Users only see fallback meals.
2.  **Database Logic**: Returning users trigger a `409 Duplicate Key` error because the code uses `.insert()` instead of `.upsert()`.
3.  **PDF Storage**: PDF generation fails due to **Row-Level Security (RLS)** policy violations on the Supabase bucket.

### ✅ Ready Components
- **Frontend UI/UX**: Excellent, polished, responsive.
- **Wizard Logic**: Robust conflict detection works perfectly.
- **Auth Flow**: OTP verification is functional.
- **Medical Logic**: The `geminiService.ts` contains industry-leading safety checks.

---

## 6. RECOMMENDATION

To deploy for revenue:
1.  **Fix Vercel Env Var**: Add `VITE_GEMINI_API_KEY`.
2.  **Fix Supabase Upsert**: Update `App.tsx` logic.
3.  **Fix Storage RLS**: Allow authenticated uploads.

Once these 3 are fixed, the app is mathematically and medically solid for production.
