import globals from "globals";
import pluginJs from "@eslint/js";

export default [
  { files: ["**/*.{js,mjs,cjs}"] },
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  pluginJs.configs.recommended,
  {
    ignores: ["node_modules/"],
  },
];
