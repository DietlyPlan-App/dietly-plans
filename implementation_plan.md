# Implementation Plan - The Vault (History System)

# Goal
Implement "The Vault" to automatically backup generated PDFs and allow users to view/download their past plans.
1.  **Storage**: Set up Supabase Storage Bucket `plans` to store PDFs.
2.  **Backup**: Modify `handleWizardComplete` to silently upload the generated PDF to storage.
3.  **UI**: Create `HistoryVault` component to list past plans with "Download" links.
4.  **Smart Naming**: Auto-generate titles for plans (e.g., "Keto Shred - Jan 20") for easier identification.

## Proposed Changes

### Component: Backend (Supabase)
#### [No Code Change Required - Manual Step]
-   **Action**: Create a new Storage Bucket named `plans` in Supabase Dashboard.
-   **Policy**: Set RLS Policy to `authenticated` (Users can only read/write their own folder).

#### [MODIFY] [supabaseClient.ts](file:///f:/CODE/Apps/Diet%20App/services/supabaseClient.ts)
-   **Add**: `uploadPDF(userId, pdfBlob, filename)`: Handles the upload logic.
-   **Update**: `saveHistory`: Store the public/signed URL of the PDF in the `plan_history` table.

### Component: Frontend (UI)
#### [NEW] [components/HistoryVault.tsx](file:///f:/CODE/Apps/Diet%20App/components/HistoryVault.tsx)
-   **Layout**: Simple list view (Date | Plan Name | Action).
-   **Logic**: Fetches `plan_history` from Supabase on mount.
-   **Action**: "Download" button triggers a file download from the stored URL.

#### [MODIFY] [Dashboard.tsx](file:///f:/CODE/Apps/Diet%20App/components/Dashboard.tsx)
-   **Navbar**: Add a small "History" icon/button.
-   **Modal**: When clicked, open the `HistoryVault` modal.

#### [MODIFY] [App.tsx](file:///f:/CODE/Apps/Diet%20App/App.tsx)
-   **Generation Flow**: In `handleWizardComplete`:
    1.  Generate PDF Blob (existing).
    2.  Trigger Browser Download (existing).
    3.  **NEW**: Call `uploadPDF()` -> Get URL.
    4.  **NEW**: Call `saveHistory()` with the URL.

## Improved Navigation
- [ ] **Navbar Navigation Buttons** <!-- id: 1 -->
    - [x] Replace "History" folder icon and "New Plan" Zap icon with explicit text buttons. <!-- id: 2 -->
    - [x] Style as rectangular buttons with rounded corners (`rounded-lg`). <!-- id: 3 -->
    - [x] "New Plan": Primary Emerald style. <!-- id: 4 -->
    - [x] "Vault": Secondary style (Outline or subtle background). <!-- id: 5 -->
    - [x] Ensure they fit well on mobile (adjust padding/text size if needed). <!-- id: 6 -->
    - [ ] **Visual Verification** <!-- id: 7 -->
        - [ ] Small Mobile (320px) <!-- id: 8 -->
        - [ ] Medium Mobile (375px) <!-- id: 9 -->
        - [ ] Large Mobile (430px) <!-- id: 10 -->
        - [ ] Tablet (768px - 1024px) <!-- id: 11 -->
    - [ ] **Functional Verification** <!-- id: 12 -->
        - [ ] "Vault" button opens modal. <!-- id: 13 -->
        - [ ] "New Plan" button resets app/wizard. <!-- id: 14 -->

    - [x] Verify Functionality (Vault Modal + Reset Flow) <!-- id: 20 -->

- [ ] **7. Tooltip Implementation** <!-- id: 23 -->
    - [ ] **Gender**: "Influences metabolic rate (BMR) and hormonal cycle adjustments." <!-- id: 24 -->
    - [ ] **Last Period Start**: "Used to adjust calories for menstrual cycle phases (e.g., Luteal Phase)." <!-- id: 25 -->
    - [ ] **Activity Level**: "Be honest. Overestimating this is the #1 reason for failed weight loss." <!-- id: 26 -->
    - [ ] **Weekly Budget**: "Low budgets (<$20) will prioritize basics (rice/beans). Higher budgets allow more variety." <!-- id: 27 -->
    - [ ] **Cooking Strategy**: "Fresh = Cook 3x/day. Batch = Cook once. Leftovers = Dinner is doubled for next day's lunch." <!-- id: 28 -->
    - [ ] **Allergies**: "AI acts as a watchdog to strictly exclude these ingredients and hidden sources." <!-- id: 29 -->
    - [ ] **Medications**: "AI checks for dangerous drug-food interactions (e.g., Warfarin vs. Vitamin K)." <!-- id: 30 -->

## Verification Plan
1.  **Manual Test**: Generate a new plan.
2.  **Verify**: Check if file downloaded to computer.
3.  **Verify**: Log into Supabase (if possible) or check `HistoryVault` UI to see if the new entry appears.
4.  **Restore**: Click "Download" on the History item and ensure the PDF opens.
