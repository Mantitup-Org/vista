import { defineConfig, globalIgnores } from "eslint/config";
// Note: In a real Vista app these dependencies would need to be installed or provided by vista-scripts
// For now, we stub them or assume user installs them if they want this config.
// Using standard imports as requested.

const eslintConfig = [
  // ...nextVitals, // Placeholder
  // ...nextTs, // Placeholder
  // Override default ignores.
  {
    ignores: [
        ".vista/**",
        "dist/**",
        "node_modules/**"
    ]
  }
];

export default eslintConfig; 
