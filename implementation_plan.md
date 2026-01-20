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

## Verification Plan
1.  **Manual Test**: Generate a new plan.
2.  **Verify**: Check if file downloaded to computer.
3.  **Verify**: Log into Supabase (if possible) or check `HistoryVault` UI to see if the new entry appears.
4.  **Restore**: Click "Download" on the History item and ensure the PDF opens.
