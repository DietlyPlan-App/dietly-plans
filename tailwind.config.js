/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: '#10B981', // Emerald 500
                primaryDark: '#047857', // Emerald 700
                secondary: '#F97316', // Orange 500
                secondaryHover: '#EA580C', // Orange 600
                dark: '#1e293b', // Slate 800
                light: '#F8FAFC', // Slate 50
                surface: '#FFFFFF',
            },
            fontFamily: {
                sans: ['Poppins', 'sans-serif'],
            }
        }
    },
    plugins: [],
}
