# DietlyPlans User Flow Documentation
**Application:** DietlyPlans
**Date:** 2026-01-21

---

## 📊 State Machine Overview

```
┌───────────┐     ┌───────────┐     ┌───────────┐
│  WIZARD   │ ──▶ │  LOADING  │ ──▶ │ DASHBOARD │
│ (step=1-5)│     │(AI Gen)   │     │(plan view)│
└───────────┘     └───────────┘     └───────────┘
      │                                    │
      │ (No Session)                       │ (is_paid?)
      ▼                                    ▼
┌───────────┐                       ┌───────────┐
│ AUTH MODAL│                       │  PREVIEW  │ (is_paid=false)
│ (OTP Flow)│                       │ + PAYWALL │
└───────────┘                       └───────────┘
                                           │
                                           │ (Payment Success)
                                           ▼
                                    ┌───────────┐
                                    │   FULL    │ (is_paid=true)
                                    │  ACCESS   │
                                    └───────────┘
```

---

## 🆕 Scenario 1: New User (First Visit)

### Step 1: Landing
1. User navigates to `https://dietly-plans.vercel.app`
2. `App.tsx` checks `supabase.auth.getSession()` → Returns `null` (no session)
3. App displays **Wizard** component (not Dashboard)
4. Header shows "Log In" button (not "Sign Out")

### Step 2: Wizard Completion (5 Steps)

| Step | Screen | User Action |
|:-----|:-------|:------------|
| **1** | Basics | Enter Gender, Age, Height, Weight. Toggle Pregnant/Breastfeeding if female. |
| **2** | Lifestyle | Select Activity Level, Goal (Lose/Maintain/Gain), Enter Region. |
| **3** | Preferences | Select Diet Type, Cuisine, Budget, Cooking Strategy, Enable/Disable Snacks. |
| **4** | Safety | Enter Allergies, Medications (free text). |
| **5** | Contact | Enter Name, Email. Click **Generate**. |

### Step 3: Auth Intercept
1. User clicks **"Generate"** on Step 5.
2. `handleWizardComplete()` in `App.tsx` fires.
3. **Session Check:** `activeSession` is `null`.
4. **Pending Data Saved:** Wizard data saved to `localStorage` as `dietly_pending_wizard_data`.
5. **Auth Modal Opens:** User sees the OTP login modal.

### Step 4: OTP Login
1. User enters email → Clicks "Send Secure Code".
2. Supabase sends a 6-digit OTP to their email.
3. User enters the code → Session is created.

### Step 5: Plan Generation (Automatic Resume)
1. `onAuthStateChange` detects `SIGNED_IN` event.
2. `handleSessionStart()` is called.
3. **Pending Data Detected:** `dietly_pending_wizard_data` found in `localStorage`.
4. **Resume Generation:** `handleWizardComplete(pendingStats, session)` called automatically.
5. **Loading Screen:** User sees progress messages:
   - "Designing Month 1 (Ignition)..."
   - "Evolving to Month 2 (Momentum)..."
   - "Finalizing Month 3 (Peak)..."
   - "Saving to cloud..."

### Step 6: Dashboard (Preview Mode)
1. Plan saved to Supabase (`plans` table) with `is_paid: false`.
2. Plan saved to History (`plan_history` table).
3. User redirected to **Dashboard**.
4. **Preview Mode:**
   - Days 1-3 of Month 1 visible.
   - Days 4+ blurred with lock icons.
   - Paywall at bottom: "$19.99 / 3-Month Roadmap".

---

## 🔑 Scenario 2: Returning User (Unpaid)

### Step 1: Session Restoration
1. User opens `https://dietly-plans.vercel.app`.
2. `supabase.auth.getSession()` returns **active session** (cookie-based).
3. `handleSessionStart(session)` called.

### Step 2: Data Fetch
1. `fetchUserData(session.user.id)` queries Supabase:
   ```sql
   SELECT * FROM plans WHERE user_id = '...' LIMIT 1
   ```
2. **If Plan Exists:**
   - `plan` state populated.
   - `isPaid` checked → `false`.
   - `currentStep` set to `'dashboard'`.
3. **If No Plan Exists:**
   - User stays on Wizard.

### Step 3: Dashboard (Preview Mode)
1. User sees their **previously generated plan**.
2. **Local Storage Backup:** Plan cached in `dietly_plan`.
3. **Paywall Visible.** Countdown timer continues.

### Step 4: Available Interactions

| Action | Behavior |
|:-------|:---------|
| **View Day 1-3** | Full access. Expand meals, see ingredients. |
| **View Day 4+** | Blurred, locked. |
| **Click Paywall** | Expands with pricing options. |
| **Click "Unlock"** | Redirects to Dodo Payments. |
| **Click "Download PDF"** | Generates PDF of visible content. |
| **Click ⚡ "New Plan"** | Resets Wizard. |
| **Click 📂 "History"** | Opens past plans vault. |

---

## 💳 Scenario 3: Paid User (Full Access)

### Step 1: Payment Flow (How They Became Paid)
1. User clicked "Unlock" on paywall.
2. `getCheckoutUrl()` calls Edge Function `create-dodo-checkout`.
3. Edge Function creates checkout with `user_id` in metadata.
4. User redirected to Dodo's hosted checkout.
5. User pays → Dodo sends webhook to `dodo-webhook`.
6. Webhook updates `plans` table: `is_paid = true`.
7. User redirected back with `?success=true`.

### Step 2: Session Restoration (Post-Payment)
1. `App.tsx` detects `?success=true` in URL.
2. **Success Modal:** "You're In!" celebration appears.
3. URL cleaned: `window.history.replaceState({}, '', '/')`.
4. `fetchUserData()` runs → `is_paid = true` fetched.
5. `isPaid` state set to `true`.

### Step 3: Dashboard (Full Access)
1. **No Paywall:** Not rendered.
2. **All Days Unlocked:** Days 1-28 for all 3 months visible.
3. **Shopping Lists:** Full access to weekly lists.
4. **Month Navigation:** Free switching between Phase 1/2/3.

### Step 4: Available Interactions

| Action | Behavior |
|:-------|:---------|
| **View Any Day** | Full access. All 84 days unlocked. |
| **Switch Months** | Click Phase tabs → Loads month data. |
| **View Shopping List** | Full list for selected week. |
| **Download PDF** | Full 84-day plan downloaded. |
| **Create New Plan** | Click ⚡ → Wizard resets. |
| **View History** | Click 📂 → Past plans vault. |

---

## 💾 Storage Locations

| Storage | Key | Purpose |
|:--------|:----|:--------|
| **localStorage** | `dietly_wizard_data` | Wizard inputs (persists across refresh) |
| **localStorage** | `dietly_wizard_step` | Current wizard step (1-5) |
| **localStorage** | `dietly_pending_wizard_data` | Wizard data waiting for auth |
| **localStorage** | `dietly_plan` | Cached plan for instant load |
| **localStorage** | `dietly_step` | App step ('wizard', 'loading', 'dashboard') |
| **Supabase** | `plans` table | User's active plan + payment status |
| **Supabase** | `plan_history` table | Archive of all generated plans |
| **Supabase** | `activity_logs` table | Tracking events |

---

## 🔐 Key Design Principles

1. **Never Lose Progress:** All wizard inputs saved to localStorage immediately.
2. **Seamless Auth Resume:** Pending data auto-resumes after OTP login.
3. **Offline Fallback:** Plan cached locally for instant load.
4. **Preview Mode:** First 3 days free to demonstrate value.
5. **Secure Payments:** Webhook verification via HMAC-SHA256.
