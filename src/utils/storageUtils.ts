
/**
 * Safe LocalStorage Wrapper
 * prevents crashes in Incognito Mode / "Block All Cookies" settings
 * where accessing localStorage throws a SecurityError.
 */

export const safeLocalStorage = {
    getItem: (key: string): string | null => {
        try {
            if (typeof window === 'undefined') return null;
            return localStorage.getItem(key);
        } catch (e) {
            console.warn(`LocalStorage Access Denied (Reading ${key}):`, e);
            return null; // Graceful fallback
        }
    },

    setItem: (key: string, value: string): void => {
        try {
            if (typeof window === 'undefined') return;
            localStorage.setItem(key, value);
        } catch (e) {
            console.warn(`LocalStorage Access Denied (Writing ${key}):`, e);
            // No-op: User just won't have persistence, but app won't crash.
        }
    },

    removeItem: (key: string): void => {
        try {
            if (typeof window === 'undefined') return;
            localStorage.removeItem(key);
        } catch (e) {
            console.warn(`LocalStorage Access Denied (Removing ${key}):`, e);
        }
    },

    clear: (): void => {
        try {
            if (typeof window === 'undefined') return;
            localStorage.clear();
        } catch (e) {
            console.warn("LocalStorage Access Denied (Clearing):", e);
        }
    }
};
