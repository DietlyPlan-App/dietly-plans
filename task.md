# Task List: The Vault Implementation

- [x] **1. Supabase Config (Manual)** <!-- id: 0 -->
    - [x] Create `plans` bucket in Supabase Dashboard <!-- id: 1 -->
- [x] **2. Services Layer** <!-- id: 2 -->
    - [x] Create `generatePDFBlob` in `pdfService.ts` <!-- id: 3 -->
    - [x] Implement `uploadPDF` in `supabaseClient.ts` <!-- id: 4 -->
    - [x] Update `saveHistory` to accept PDF URL <!-- id: 5 -->
    - [x] Implement `fetchUserHistory` in `supabaseClient.ts` <!-- id: 6 -->
- [x] **3. Frontend UI** <!-- id: 7 -->
    - [x] Create `components/HistoryVault.tsx` <!-- id: 8 -->
    - [x] Add History Button in `App.tsx` Navbar <!-- id: 9 -->
    - [x] Render `HistoryVault` modal in `App.tsx` <!-- id: 10 -->
- [x] **4. Integration** <!-- id: 11 -->
    - [x] Modify `handleWizardComplete` to Upload + Save <!-- id: 12 -->
- [x] **5. Verification** <!-- id: 13 -->
    - [x] Build Succeeds (`npm run build`) <!-- id: 14 -->
    - [ ] Live Test: Generate Plan -> Verify Upload + Save <!-- id: 15 -->
    - [ ] Open History -> Verify List and Restore <!-- id: 16 -->
