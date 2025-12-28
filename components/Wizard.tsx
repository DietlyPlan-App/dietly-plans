
import React, { useState, useEffect } from 'react';
import { UserStats, Gender, Goal, ActivityLevel } from '../types';
import { ArrowRight, Check, Ruler, Weight, User, Globe, Mail, ShieldAlert, Stethoscope, MapPin, ChefHat, Clock, Repeat, Info, Briefcase, Sun, ChevronDown, Coffee, Baby, Milk } from 'lucide-react';

interface WizardProps {
  onComplete: (stats: UserStats) => void;
  loading: boolean;
}

// --- Currency List (Targeted Regions Only) ---
const currencies = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },       // USA
  { code: 'EUR', name: 'Euro', symbol: '€' },            // Europe
  { code: 'GBP', name: 'Pound', symbol: '£' },           // UK
  { code: 'CAD', name: 'Canadian Dollar', symbol: '$' }, // Canada
  { code: 'AUD', name: 'Australian Dollar', symbol: '$' },// Australia
  { code: 'AED', name: 'Dirham', symbol: 'د.إ' },       // UAE
  { code: 'SAR', name: 'Riyal', symbol: '﷼' },          // KSA (Saudi Arabia)
];

const DEFAULT_STATS: UserStats = {
  name: '',
  email: '',
  age: 30,
  gender: 'female',
  height: 170, // cm
  weight: 70, // kg
  unit: 'metric',
  activity: 'moderate',
  goal: 'lose',
  dietType: 'Standard Balanced',
  cuisine: 'Mixed / Any',
  budgetAmount: 100,
  currency: 'USD',
  allergies: '',
  medications: '',
  region: '',
  mealStrategy: 'fresh',
  includeSnacks: true,
  isPregnant: false,
  isBreastfeeding: false,
  bodyFat: undefined,
  lastPeriodStart: undefined,
  cookingSkill: 'beginner',
  isThyroid: false,
};

const Tooltip = ({ text }: { text: string }) => (
  <div className="group relative inline-flex items-center justify-center ml-2 align-middle">
    <Info className="w-3.5 h-3.5 md:w-4 md:h-4 text-slate-300 hover:text-primary cursor-help transition-colors" />
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 md:w-56 p-2 md:p-3 bg-slate-800 text-white text-[10px] md:text-xs font-medium rounded-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 shadow-xl pointer-events-none text-center leading-relaxed">
      {text}
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
    </div>
  </div>
);

const Wizard: React.FC<WizardProps> = ({ onComplete, loading }) => {
  // 1. LAZY INITIALIZATION from LocalStorage
  const [step, setStep] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('dietly_wizard_step');
      return saved ? parseInt(saved) : 1;
    }
    return 1;
  });

  // INTERNAL LOCK to prevent double-firing before Parent updates 'loading' prop
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState<UserStats>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('dietly_wizard_data');
      return saved ? JSON.parse(saved) : DEFAULT_STATS;
    }
    return DEFAULT_STATS;
  });

  // 2. PERSISTENCE EFFECT
  useEffect(() => {
    localStorage.setItem('dietly_wizard_data', JSON.stringify(formData));
    localStorage.setItem('dietly_wizard_step', step.toString());
  }, [formData, step]);

  const handleNext = () => {
    // Basic Haptic Feedback
    if (navigator.vibrate) navigator.vibrate(50);
    setStep(prev => prev + 1);
  };

  const handleComplete = () => {
    if (isSubmitting || loading) return; // LOCK

    if (!formData.name.trim()) {
      alert("Please enter your name.");
      return;
    }

    setIsSubmitting(true); // ENGAGE LOCK
    if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
    onComplete(formData);

    // Safety release in case of error (though parent should unmount this component)
    setTimeout(() => setIsSubmitting(false), 5000);
  };

  const handleBack = () => setStep(prev => prev - 1);

  const updateField = (field: keyof UserStats, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Step 1: Biometrics
  const renderStep1 = () => {
    // Derived values for Inputs
    const currentWeightDisplay = formData.unit === 'metric'
      ? formData.weight
      : Math.round(formData.weight * 2.20462);

    // Height logic: Split cm into ft/in for imperial
    const currentFeet = Math.floor(formData.height / 30.48);
    const currentInches = Math.round((formData.height % 30.48) / 2.54);

    return (
      <div className="space-y-4 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="space-y-1 md:space-y-2">
          <h2 className="text-2xl md:text-4xl font-extrabold text-white md:text-dark">Let's set your baseline.</h2>
          <p className="text-slate-400 md:text-slate-500 text-base md:text-lg">We need these numbers to calculate your 12-week progression.</p>
        </div>

        {/* Unit Toggle */}
        <div className="flex bg-slate-100 rounded-xl p-1 w-full md:w-fit border border-slate-200">
          <button
            onClick={() => updateField('unit', 'metric')}
            className={`flex-1 md:flex-none px-4 md:px-6 py-2 md:py-3 rounded-lg text-sm md:text-base font-bold transition-all ${formData.unit === 'metric' ? 'bg-white text-primary shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Metric (kg/cm)
          </button>
          <button
            onClick={() => updateField('unit', 'imperial')}
            className={`flex-1 md:flex-none px-4 md:px-6 py-2 md:py-3 rounded-lg text-sm md:text-base font-bold transition-all ${formData.unit === 'imperial' ? 'bg-white text-primary shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Imperial (lbs/ft)
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          <div>
            <label className="block text-sm md:text-base font-bold text-slate-500 mb-1.5 md:mb-2">
              Gender
              <Tooltip text="We need this to calculate your calorie burn rate." />
            </label>
            <div className="flex gap-3 md:gap-4">
              {(['female', 'male'] as Gender[]).map(g => (
                <button
                  key={g}
                  onClick={() => updateField('gender', g)}
                  className={`flex-1 py-3 md:py-4 px-4 md:px-6 rounded-2xl border-2 capitalize font-bold text-base md:text-lg transition-all ${formData.gender === g ? 'border-primary bg-primary/5 text-primary shadow-lg shadow-primary/10' : 'border-slate-100 text-slate-400 hover:border-slate-200 bg-white md:bg-slate-50'}`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm md:text-base font-bold text-slate-500 mb-1.5 md:mb-2">Age</label>
            <input
              type="number"
              value={formData.age}
              onChange={(e) => updateField('age', parseInt(e.target.value))}
              className="w-full p-3 md:p-4 rounded-2xl border-2 border-slate-100 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 bg-white md:bg-slate-50 font-bold text-base md:text-lg text-dark transition-all"
            />
          </div>
        </div>

        {/* Pregnancy & Lactation - ONLY FOR FEMALE */}
        {formData.gender === 'female' && (
          <div className="animate-in fade-in slide-in-from-top-2 grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
            <button
              onClick={() => updateField('isPregnant', !formData.isPregnant)}
              className={`w-full p-3 md:p-4 rounded-2xl border-2 flex items-center justify-between transition-all ${formData.isPregnant ? 'border-pink-400 bg-pink-50 text-pink-700 shadow-sm' : 'border-slate-100 text-slate-400 hover:border-slate-200 bg-white'}`}
            >
              <div className="flex items-center gap-2 md:gap-3">
                <div className={`p-1.5 md:p-2 rounded-lg ${formData.isPregnant ? 'bg-pink-100' : 'bg-slate-100'}`}>
                  <Baby className="w-5 h-5 md:w-6 md:h-6" />
                </div>
                <div className="text-left">
                  <div className="font-bold text-base md:text-lg">Pregnant?</div>
                </div>
              </div>
              <div className={`w-10 h-6 md:w-12 md:h-7 rounded-full transition-colors relative ${formData.isPregnant ? 'bg-pink-400' : 'bg-slate-200'}`}>
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${formData.isPregnant ? 'translate-x-4 md:translate-x-5' : 'translate-x-0'}`} />
              </div>
            </button>

            <button
              onClick={() => updateField('isBreastfeeding', !formData.isBreastfeeding)}
              className={`w-full p-3 md:p-4 rounded-2xl border-2 flex items-center justify-between transition-all ${formData.isBreastfeeding ? 'border-purple-400 bg-purple-50 text-purple-700 shadow-sm' : 'border-slate-100 text-slate-400 hover:border-slate-200 bg-white'}`}
            >
              <div className="flex items-center gap-2 md:gap-3">
                <div className={`p-1.5 md:p-2 rounded-lg ${formData.isBreastfeeding ? 'bg-purple-100' : 'bg-slate-100'}`}>
                  <Milk className="w-5 h-5 md:w-6 md:h-6" />
                </div>
                <div className="text-left">
                  <div className="font-bold text-base md:text-lg">Breastfeeding?</div>
                </div>
              </div>
              <div className={`w-10 h-6 md:w-12 md:h-7 rounded-full transition-colors relative ${formData.isBreastfeeding ? 'bg-purple-400' : 'bg-slate-200'}`}>
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${formData.isBreastfeeding ? 'translate-x-4 md:translate-x-5' : 'translate-x-0'}`} />
              </div>
            </button>
          </div>
        )}

        {/* Menstrual Cycle Tracking - ONLY FOR FEMALE */}
        {formData.gender === 'female' && !formData.isPregnant && (
          <div className="animate-in fade-in slide-in-from-top-2">
            <label className="block text-sm md:text-base font-bold text-slate-500 mb-1.5 md:mb-2 text-dark">
              Last Period Start Date (Optional)
              <Tooltip text="We adjust calories for your Luteal Phase (high hunger week)." />
            </label>
            <input
              type="date"
              value={formData.lastPeriodStart || ''}
              onChange={(e) => updateField('lastPeriodStart', e.target.value)}
              className="w-full p-3 md:p-4 rounded-2xl border-2 border-slate-100 focus:outline-none focus:border-pink-300 focus:ring-4 focus:ring-pink-100 bg-white md:bg-slate-50 font-bold text-base md:text-lg text-slate-600 transition-all"
            />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          <div>
            <label className="block text-sm md:text-base font-bold text-slate-500 mb-1.5 md:mb-2 text-dark">
              Height ({formData.unit === 'metric' ? 'cm' : 'ft / in'})
            </label>
            <div className="relative">
              <Ruler className="absolute left-4 top-3 md:top-4 h-5 w-5 md:h-6 md:w-6 text-slate-400" />

              {formData.unit === 'metric' ? (
                <input
                  type="number"
                  value={formData.height}
                  onChange={(e) => updateField('height', parseFloat(e.target.value))}
                  className="w-full pl-10 md:pl-12 p-3 md:p-4 rounded-2xl border-2 border-slate-100 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 bg-white md:bg-slate-50 font-bold text-base md:text-lg text-dark transition-all"
                />
              ) : (
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      placeholder="ft"
                      value={currentFeet}
                      onChange={(e) => {
                        const newFt = parseInt(e.target.value) || 0;
                        const totalCm = (newFt * 30.48) + (currentInches * 2.54);
                        updateField('height', totalCm);
                      }}
                      className="w-full pl-10 md:pl-12 p-3 md:p-4 rounded-2xl border-2 border-slate-100 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 bg-white md:bg-slate-50 font-bold text-base md:text-lg text-dark transition-all"
                    />
                    <span className="absolute right-3 md:right-4 top-3 md:top-4 text-slate-400 font-medium text-xs md:text-sm">ft</span>
                  </div>
                  <div className="relative flex-1">
                    <input
                      type="number"
                      placeholder="in"
                      value={currentInches}
                      onChange={(e) => {
                        const newIn = parseInt(e.target.value) || 0;
                        const totalCm = (currentFeet * 30.48) + (newIn * 2.54);
                        updateField('height', totalCm);
                      }}
                      className="w-full p-3 md:p-4 rounded-2xl border-2 border-slate-100 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 bg-white md:bg-slate-50 font-bold text-base md:text-lg text-dark transition-all"
                    />
                    <span className="absolute right-3 md:right-4 top-3 md:top-4 text-slate-400 font-medium text-xs md:text-sm">in</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Weight Input */}
          <div>
            <label className="block text-sm md:text-base font-bold text-slate-500 mb-1.5 md:mb-2 text-dark">
              Weight ({formData.unit === 'metric' ? 'kg' : 'lbs'})
            </label>
            <div className="relative">
              <Weight className="absolute left-4 top-3 md:top-4 h-5 w-5 md:h-6 md:w-6 text-slate-400" />
              <input
                type="number"
                value={currentWeightDisplay}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  const kg = formData.unit === 'metric' ? val : val * 0.453592;
                  updateField('weight', kg);
                }}
                className="w-full pl-10 md:pl-12 p-3 md:p-4 rounded-2xl border-2 border-slate-100 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 bg-white md:bg-slate-50 font-bold text-base md:text-lg text-dark transition-all"
              />
            </div>
          </div>
        </div>
      </div>
    )
  };

  // Step 2: Lifestyle & Region
  const renderStep2 = () => {
    const activityOptions: { id: ActivityLevel; label: string; sub: string }[] = [
      { id: 'sedentary', label: 'Desk Job', sub: 'I sit most of the day' },
      { id: 'light', label: 'Lightly Active', sub: 'I stand or walk a bit' },
      { id: 'moderate', label: 'Moderate', sub: 'Active job or Gym 3x' },
      { id: 'active', label: 'Heavy', sub: 'Heavy physical work' },
      { id: 'athlete', label: 'Very Heavy', sub: 'Professional Training' },
    ];

    return (
      <div className="space-y-4 md:space-y-8 animate-in fade-in slide-in-from-right-8 duration-500">
        <div className="space-y-1 md:space-y-2">
          <h2 className="text-2xl md:text-4xl font-extrabold text-white md:text-dark">Your context.</h2>
          <p className="text-slate-400 md:text-slate-500 text-base md:text-lg">Calories burned depends heavily on what you do all day.</p>
        </div>

        <div>
          <label className="block text-sm md:text-base font-bold text-slate-500 mb-1.5 md:mb-3">
            How active are you?
            <Tooltip text="Be honest. If you select too high, you might not lose weight." />
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            {activityOptions.map(option => (
              <button
                key={option.id}
                onClick={() => updateField('activity', option.id)}
                className={`p-3 md:p-5 text-left rounded-2xl border-2 transition-all hover:scale-[1.01] active:scale-95 flex items-center justify-between h-full ${formData.activity === option.id ? 'border-primary bg-primary/5 text-primary shadow-md' : 'border-slate-100 text-slate-400 hover:border-slate-200 bg-white'}`}
              >
                <div>
                  <div className="font-bold text-base md:text-lg">{option.label}</div>
                  <div className="text-[11px] md:text-sm opacity-80 font-medium mt-0.5">{option.sub}</div>
                </div>
                {formData.activity === option.id && <div className="bg-primary rounded-full p-1 shrink-0 ml-2"><Check className="w-4 h-4 md:w-5 md:h-5 text-white" /></div>}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm md:text-base font-bold text-slate-500 mb-1.5 md:mb-3 text-dark">
            Primary Goal
            <Tooltip text="Lose Weight, Maintain Weight, or Build Muscle." />
          </label>
          <div className="flex flex-col md:flex-row gap-3 md:gap-4">
            {(['lose', 'maintain', 'gain'] as Goal[]).map(g => (
              <button
                key={g}
                onClick={() => updateField('goal', g)}
                className={`flex-1 py-3 md:py-5 rounded-2xl border-2 capitalize transition-all active:scale-95 ${formData.goal === g ? 'border-secondary bg-secondary text-white shadow-xl shadow-secondary/30' : 'border-slate-100 text-slate-500 bg-white hover:border-slate-200'}`}
              >
                <span className="font-bold text-base md:text-lg">{g}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Region Input */}
        <div>
          <label className="block text-sm md:text-base font-bold text-slate-500 mb-1.5 md:mb-2 text-dark">
            Region / Location
            <Tooltip text="We add more water to your plan if you live in a hot climate." />
          </label>
          <div className="relative">
            <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 md:h-6 md:w-6 text-slate-400" />
            <input
              type="text"
              placeholder="e.g. New York, USA"
              value={formData.region}
              onChange={(e) => updateField('region', e.target.value)}
              className="w-full pl-10 md:pl-12 p-3 md:p-4 rounded-2xl border-2 border-slate-100 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 bg-white md:bg-slate-50 font-bold text-base md:text-lg text-dark transition-all"
            />
          </div>
        </div>
      </div>
    )
  };

  // Step 3: Preferences
  const renderStep3 = () => (
    <div className="space-y-4 md:space-y-8 animate-in fade-in slide-in-from-right-8 duration-500">
      <div className="space-y-1 md:space-y-2">
        <h2 className="text-2xl md:text-4xl font-extrabold text-white md:text-dark">Preferences.</h2>
        <p className="text-slate-400 md:text-slate-500 text-base md:text-lg">The best diet is the one you actually enjoy eating.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <div>
          <label className="block text-sm md:text-base font-bold text-slate-500 mb-1.5 md:mb-2 text-dark">
            Diet Type
            <Tooltip text="Choose your food rules. e.g. Keto = High Fat, No Carbs." />
          </label>
          <div className="relative">
            <select
              value={formData.dietType}
              onChange={(e) => updateField('dietType', e.target.value)}
              className="w-full p-3 md:p-4 rounded-2xl border-2 border-slate-100 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 bg-white md:bg-slate-50 font-bold text-base md:text-lg text-dark appearance-none"
            >
              <option value="Standard Balanced">Standard Balanced</option>
              <option value="High Protein">High Protein</option>
              <option value="Low Carb">Low Carb</option>
              <option value="Keto">Keto</option>
              <option value="Vegetarian">Vegetarian</option>
              <option value="Vegan">Vegan</option>
              <option value="Paleo">Paleo</option>
            </select>
            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 md:w-6 md:h-6 text-slate-500 pointer-events-none" />
          </div>
        </div>
        <div>
          <label className="block text-sm md:text-base font-bold text-slate-500 mb-1.5 md:mb-2 text-dark">
            Cuisine
            <Tooltip text="The flavors you like. e.g. Mexican = Spicy & Beans." />
          </label>
          <div className="relative">
            <Globe className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 md:h-6 md:w-6 text-slate-400" />
            <select
              value={formData.cuisine}
              onChange={(e) => updateField('cuisine', e.target.value)}
              className="w-full pl-10 md:pl-12 p-3 md:p-4 rounded-2xl border-2 border-slate-100 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 bg-white md:bg-slate-50 font-bold text-base md:text-lg text-dark appearance-none"
            >
              <option value="Mixed / Any">Mixed / Any</option>
              <option value="American">American</option>
              <option value="Italian">Italian</option>
              <option value="Asian">Asian (General)</option>
              <option value="Indian">Indian</option>
              <option value="Mediterranean">Mediterranean</option>
              <option value="Mexican">Mexican</option>
            </select>
            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 md:w-6 md:h-6 text-slate-500 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Budget */}
      <div>
        <label className="block text-sm md:text-base font-bold text-slate-500 mb-2 md:mb-3 text-dark">
          Weekly Budget
          <Tooltip text="We'll use this currency to customize your checkout options (e.g. AED for UAE)." />
        </label>
        <div className="flex flex-col md:flex-row gap-3 md:gap-4 items-center">
          <div className="relative w-full md:w-1/3">
            <select
              value={formData.currency}
              onChange={(e) => updateField('currency', e.target.value)}
              className="w-full p-3 md:p-4 rounded-2xl border-2 border-slate-100 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 bg-white md:bg-slate-50 font-bold text-base md:text-lg text-dark appearance-none"
            >
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>
              ))}
            </select>
            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 md:w-6 md:h-6 text-slate-500 pointer-events-none" />
          </div>
          <div className="relative w-full md:w-2/3">
            <input
              type="number"
              value={formData.budgetAmount}
              onChange={(e) => updateField('budgetAmount', parseFloat(e.target.value))}
              className="w-full p-3 md:p-4 rounded-2xl border-2 border-slate-100 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 bg-white md:bg-slate-50 font-bold text-base md:text-lg text-dark transition-all"
              placeholder="Amount"
            />
          </div>
        </div>
      </div>

      {/* Strategy & Snacks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <div className="md:col-span-2">
          <label className="block text-sm md:text-base font-bold text-slate-500 mb-2 md:mb-3 text-dark">
            Cooking Strategy
            <Tooltip text="Fresh = Cook 3 times/day. Evening = Cook Dinner & Lunch together. Batch = Cook once/day." />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
            {[
              { id: 'fresh', label: 'Fresh Meals', icon: ChefHat, sub: 'Cook 3x/day.' },
              { id: 'leftovers', label: 'Evening Prep', icon: Briefcase, sub: 'Dinner + Tiffin.' },
              { id: 'batch', label: 'Daily Batch', icon: Sun, sub: 'Cook 1x/day.' },
            ].map((strategy) => (
              <button
                key={strategy.id}
                onClick={() => updateField('mealStrategy', strategy.id)}
                className={`p-3 md:p-4 rounded-2xl border-2 flex flex-row sm:flex-col items-center gap-3 sm:gap-2 text-left sm:text-center transition-all ${formData.mealStrategy === strategy.id ? 'border-secondary bg-secondary/5 text-secondary shadow-lg' : 'border-slate-100 text-slate-400 hover:border-slate-200 bg-white'}`}
              >
                <strategy.icon className="w-6 h-6 md:w-8 md:h-8 shrink-0" />
                <div>
                  <div className="font-bold text-sm md:text-base">{strategy.label}</div>
                  <div className="text-[10px] md:text-xs opacity-80">{strategy.sub}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* NEW INPUT: Snacks Toggle */}
        <div className="md:col-span-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            <button
              onClick={() => updateField('includeSnacks', !formData.includeSnacks)}
              className={`w-full p-3 md:p-4 rounded-2xl border-2 flex items-center justify-between transition-all ${formData.includeSnacks ? 'border-emerald-500 bg-emerald-50/50 text-emerald-700 shadow-sm' : 'border-slate-100 text-slate-400 hover:border-slate-200 bg-white'}`}
            >
              <div className="flex items-center gap-2 md:gap-3">
                <div className={`p-1.5 md:p-2 rounded-lg ${formData.includeSnacks ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                  <Coffee className="w-5 h-5 md:w-6 md:h-6" />
                </div>
                <div className="text-left">
                  <div className="font-bold text-base md:text-lg text-dark">Include Daily Snacks?</div>
                  <div className="text-[11px] md:text-sm opacity-80 font-medium">We'll add a 4th meal to your plan.</div>
                </div>
              </div>
              <div className={`w-10 h-6 md:w-12 md:h-7 rounded-full transition-colors relative ${formData.includeSnacks ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${formData.includeSnacks ? 'translate-x-4 md:translate-x-5' : 'translate-x-0'}`} />
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // Step 4: Health & Safety
  const renderStep4 = () => (
    <div className="space-y-4 md:space-y-8 animate-in fade-in slide-in-from-right-8 duration-500">
      <div className="space-y-1 md:space-y-2">
        <h2 className="text-2xl md:text-4xl font-extrabold text-white md:text-dark">Safety First.</h2>
        <p className="text-slate-400 md:text-slate-500 text-base md:text-lg">Please mention any medical conditions or allergies.</p>
      </div>

      <div className="space-y-4 md:space-y-6">
        <div className="relative">
          <label className="block text-sm md:text-base font-bold text-slate-500 mb-1.5 md:mb-2 flex items-center gap-2 text-dark">
            <ShieldAlert className="w-4 h-4 md:w-5 md:h-5 text-secondary" />
            Allergies
          </label>
          <textarea
            placeholder="e.g. Peanuts, Gluten..."
            value={formData.allergies}
            onChange={(e) => updateField('allergies', e.target.value)}
            className="w-full p-3 md:p-5 rounded-2xl border-2 border-slate-100 focus:outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10 bg-white md:bg-slate-50 font-bold text-base md:text-lg text-dark min-h-[80px] md:min-h-[120px] resize-none transition-all"
          />
        </div>

        <div className="relative">
          <label className="block text-sm md:text-base font-bold text-slate-500 mb-1.5 md:mb-2 flex items-center gap-2 text-dark">
            <Stethoscope className="w-4 h-4 md:w-5 md:h-5 text-blue-500" />
            Medications
          </label>
          <textarea
            placeholder="e.g. Insulin..."
            value={formData.medications}
            onChange={(e) => updateField('medications', e.target.value)}
            className="w-full p-3 md:p-5 rounded-2xl border-2 border-slate-100 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 bg-white md:bg-slate-50 font-bold text-base md:text-lg text-dark min-h-[80px] md:min-h-[120px] resize-none transition-all"
          />
        </div>
      </div>
    </div>
  );

  // Step 5: Contact
  const renderStep5 = () => (
    <div className="space-y-4 md:space-y-8 animate-in fade-in slide-in-from-right-8 duration-500">
      <div className="space-y-1 md:space-y-2">
        <h2 className="text-2xl md:text-4xl font-extrabold text-white md:text-dark">Almost there.</h2>
        <p className="text-slate-400 md:text-slate-500 text-base md:text-lg">We will save your plan automatically.</p>
      </div>

      <div className="space-y-4 md:space-y-6">
        <div>
          <label className="block text-sm md:text-base font-bold text-slate-500 mb-1.5 md:mb-2 text-dark">Full Name</label>
          <div className="relative">
            <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 md:h-6 md:w-6 text-slate-400" />
            <input
              type="text"
              placeholder="Your Name"
              value={formData.name}
              onChange={(e) => updateField('name', e.target.value)}
              className="w-full pl-10 md:pl-12 p-3 md:p-4 rounded-2xl border-2 border-slate-100 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 bg-white md:bg-slate-50 font-bold text-base md:text-lg text-dark transition-all"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm md:text-base font-bold text-slate-500 mb-1.5 md:mb-2 text-dark">Email</label>
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 md:h-6 md:w-6 text-slate-400" />
            <input
              type="email"
              placeholder="you@example.com"
              value={formData.email}
              onChange={(e) => updateField('email', e.target.value)}
              className="w-full pl-10 md:pl-12 p-3 md:p-4 rounded-2xl border-2 border-slate-100 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 bg-white md:bg-slate-50 font-bold text-base md:text-lg text-dark transition-all"
            />
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-2xl w-full mx-auto bg-white rounded-3xl md:rounded-[2.5rem] shadow-2xl shadow-slate-200/50 border border-slate-100 flex flex-col relative overflow-hidden transition-all h-[92vh] md:h-auto md:min-h-[800px] max-h-[1000px]">
      <div className="absolute top-0 left-0 right-0 h-1.5 md:h-2 bg-gradient-to-r from-primary to-emerald-400 z-20" />

      {/* Header */}
      <div className="shrink-0 px-6 pt-6 pb-3 md:px-10 md:pt-10 md:pb-2 z-10 bg-white">
        <div className="flex gap-1.5 md:gap-2">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className={`h-1.5 md:h-2 flex-1 rounded-full transition-all duration-500 ${step >= i ? 'bg-primary' : 'bg-slate-100'}`} />
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 md:px-10 py-2 scrollbar-hide">
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
        {step === 5 && renderStep5()}
      </div>

      {/* Footer */}
      <div className="shrink-0 flex justify-between items-center px-4 py-4 md:px-10 md:py-8 border-t border-slate-5 bg-white z-10">
        {step > 1 ? (
          <button onClick={handleBack} className="text-slate-400 font-bold text-base md:text-lg hover:text-dark transition-colors px-4 py-2">
            Back
          </button>
        ) : <div />}

        <button
          onClick={step === 5 ? handleComplete : handleNext}
          disabled={loading || isSubmitting}
          className="bg-primary hover:bg-primaryDark text-white px-6 md:px-10 py-3 md:py-5 rounded-2xl font-bold text-base md:text-lg flex items-center gap-2 md:gap-3 transition-all shadow-lg md:shadow-xl shadow-primary/30 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ml-auto"
        >
          {loading || isSubmitting ? 'Thinking...' : (step === 5 ? 'Generate' : 'Next')}
          {(!loading && !isSubmitting) && <ArrowRight className="w-5 h-5 md:w-6 md:h-6" />}
        </button>
      </div>
    </div>
  );
};

export default Wizard;
