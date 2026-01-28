# Edge Cases Matrix

## 1. High Risk Medical Combinations
| Scenario ID | Age Group | Gender | Conditions | Diet Type | Goal | Risk / Expected Behavior |
|:---:|:---:|:---:|:---:|:---:|:---:|:---|
| **MC-01** | Geriatric (>65) | Any | **Renal Disease** | **High Protein** | Muscle Gain | **CRITICAL CONFLICT**: Renal limits protein (15%), but Muscle Gain requires high protein. **Expect**: Renal Safety Override (Cap protein, explain to user). |
| **MC-02** | Adult | Any | **Gout** | **Keto** | Loss/Maintain | **CRITICAL CONFLICT**: Keto relies on meat, Gout bans purines (red meat). **Expect**: Poultry/Fish Keto adaptation. |
| **MC-03** | Adult | Female | **Polycystic Ovary Syndrome (PCOS)** | High Carb | Loss | **Optimized**: Suggest lower carb/Low GI. (Note: Logic check if PCOS is handled). |
| **MC-04** | Adult | Any | **No Gallbladder** | **Keto** | Loss | **DIGESTIVE RISK**: Malabsorption of fat. **Expect**: Fat Cap at 40%, Warning to spread fats. |
| **MC-05** | Adult | Any | **Gastric Sleeve (Bariatric)** | Standard | Weight Gain | **PHYSICS CONFLICT**: High Calorie needs vs Tiny Stomach. **Expect**: 6+ meals/day, High density foods. |
| **MC-06** | Adult | Any | **Kidney Stones** | Any | Loss | **HYDRATION**: Must force > 3.0L Water. Low Oxalate warning (No Spinach/Almonds). |

## 2. Drug-Nutrient Interactions
| Scenario ID | Drug Class | Diet Input | Conflict | Expected Warning |
|:---:|:---:|:---:|:---:|:---|
| **DI-01** | **Warfarin** (Blood Thinner) | Healthy/Vegan | High Vitamin K (Greens) | "Consistency is key. Do not drastically change greens intake." |
| **DI-02** | **MAOI** (Antidepressant) | Charcuterie request | High Tyramine (Aged/Cured) | "NO Aged Cheese/Cured Meats. Tyramine Risk." |
| **DI-03** | **Statins** (Cholesterol) | Citrus/Fruit | Grapefruit | "NO Grapefruit." |
| **DI-04** | **Antibiotics** | Dairy/Calcium | Absorption Block | "Separate Dairy from Meds by 2 hours." |
| **DI-05** | **Ozempic/Wegovy** (GLP-1) | Low Protein | Muscle Loss Risk | "Force High Protein to prevent sarcopenia." |

## 3. Demographics & Physiology (Edge Cases)
| Scenario ID | Age | Gender | Status | Goal | Logic |
|:---:|:---:|:---:|:---:|:---:|:---|
| **DP-01** | 14 (<18) | Female | Normal | **Lose Weight** | **Safety**: Pediatric Weight Loss is risky. **Expect**: Override to 'Maintain' unless obese (BMI check). |
| **DP-02** | 25 | Female | **Pregnant** | **Lose Weight** | **CRITICAL**: Pregnancy requires surplus. **Expect**: HARD OVERRIDE to Maintain/Gain. (+300kcal). |
| **DP-03** | 28 | Female | **Breastfeeding** | Maintain | **Metabolic**: Lactation is expensive. **Expect**: +500kcal addition to TDEE. |
| **DP-04** | 28 | Female | **Pregnant + Breastfeeding** | Any | **Extreme Energy**: **Expect**: +600kcal combined. |
| **DP-05** | 19 | Male | **BMI < 16** (Anorexic range) | Lose | **FATAL RISK**: **Expect**: BLOCK Generation. Refer to doctor. |

## 4. Impossible Constraints (The "Stress Testers")
| Scenario ID | Inputs | Logic Breakdown |
|:---:|:---|:---|
| **IMP-01** | **Vegan** + Allergic to **Soy, Nuts, Gluten, Legumes** | "The Starvation Loop". Protein sources are almost nil. **Expect**: Pea Protein Isolate recommendation, Hemp seeds. |
| **IMP-02** | **Budget < $20** + **Keto** | Keto is expensive (Meat/Avocado). **Expect**: Eggs & Canned Fish only. "Survival Keto". |
| **IMP-03** | **Histamine Intolerance** + **Budget Batch Cooking** | Conflict: Histamine bans leftovers, Batch = Leftovers. **Expect**: Histamine Override (Fresh only), warn user about batch cooking danger. |

## 5. Deployment Readiness Checklist
*   [ ] Verify "BMI < 16" Lock.
*   [ ] Verify Renal 1.5L Water Cap.
*   [ ] Verify Pregnancy "No Weight Loss" Override.
*   [ ] Verify "Impossible Vegan" Fallback generation.
