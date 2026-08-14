// Demo inputs are fake app UI, not web forms: password managers and autofill
// extensions overlaying them breaks the illusion (and can hijack the page), and
// browser spell/caps correction has no place in a terminal. Spread onto every
// free-text input in the demo.
export const NO_AUTOFILL = {
  autoComplete: "off",
  spellCheck: false,
  autoCapitalize: "off",
  autoCorrect: "off",
  "data-1p-ignore": "true",
  "data-lpignore": "true",
  "data-bwignore": "true",
  "data-form-type": "other",
} as const;
