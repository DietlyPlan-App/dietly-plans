
export type UnitSystem = 'metric' | 'imperial';
export type Gender = 'male' | 'female';
export type Goal = 'lose' | 'maintain' | 'gain';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'athlete';
export type MealStrategy = 'fresh' | 'leftovers' | 'batch';

export interface UserStats {
  name: string;
  email: string;
  age: number;
  gender: Gender;
  height: number; // stored in cm
  weight: number; // stored in kg
  unit: UnitSystem;
  activity: ActivityLevel;
  goal: Goal;
  dietType: string;
  cuisine: string;
  budgetAmount: number;
  currency: string;
  allergies: string;
  medications: string; // Critical for interaction checks
  region: string;
  mealStrategy: MealStrategy;
  includeSnacks: boolean;
  isPregnant: boolean; // Critical Safety Field
  isBreastfeeding: boolean; // NEW: Metabolic Boost Field
  bodyFat?: number; // Biological Precision
  lastPeriodStart?: string; // Hormonal Cycle Tracking
  cookingSkill?: 'microwave' | 'beginner' | 'advanced' | 'chef'; // Rationality
  isThyroid?: boolean; // Medical Safety (Derived or Explicit)
  conditions?: string; // ROUND 8: Added for robust condition parsing
  isRenal?: boolean; // ROUND 8: Added for explicit renal tracking
}

export interface MacroSplit {
  protein: number;
  carbs: number;
  fats: number;
  fiber: number; // Critical for satiety
  sugar?: number; // Insulin control
  sodium?: number; // Blood pressure safety
  calories: number;
}

export interface Meal {
  name: string;
  description?: string;
  ingredients: string[];
  instructions: string[];
  calories: number;
  macros: { p: number; c: number; f: number; fiber?: number; sugar?: number; sodium?: number };
  sideDish?: string; // For Volume Injection logic
  warning?: string; // For Allergy or Safety warnings
}

export interface DailyPlan {
  day: number;
  meals: {
    breakfast: Meal;
    lunch: Meal;
    dinner: Meal;
    snack?: Meal;
  };
  dailyMacros: MacroSplit;
  waterTarget: number;
}

export interface GroceryList {
  week1: { category: string; items: string[] }[];
  week2: { category: string; items: string[] }[];
  week3: { category: string; items: string[] }[];
  week4: { category: string; items: string[] }[];
}

export interface MonthPlan {
  monthIndex: number; // 1, 2, or 3
  phaseName: string; // e.g. "Aggressive Fat Loss", "Metabolic Reset"
  targetCalories: number;
  dailyPlan: DailyPlan[]; // 28 Days expanded
  groceries: GroceryList;
}

// EXTENDED: Now includes full UserStats + Computed Metrics
export interface AIResponse {
  userStats: UserStats & {
    bmr: number;
    tdee: number;
    bmi: number;
    waterTargetLitres: number;
    needsElectrolytes: boolean;
  };
  safetyVerification: string;
  medicationAnalysis?: string;
  climateAnalysis?: { isHot: boolean; advice: string };
  budgetStrategy?: string;
  pantryTips?: string;
  roadmap: {
    month1: MonthPlan;
    month2: MonthPlan;
    month3: MonthPlan;
  };
  metabolicLog?: string[];
}

export interface PlanRecord {
  id: string;
  createdAt: string;
  data: AIResponse;
  isPaid: boolean;
}
