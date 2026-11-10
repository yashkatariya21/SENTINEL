/** Single source of truth for the committee cast and human personas. */

export type ReviewerKey =
  | "brand_voice" | "terminology" | "fact_checker" | "visual" | "accessibility" | "legal";

export interface Character {
  key: ReviewerKey;
  reviewer: string;          // reviewer label used by the API
  name: string;              // character name
  role: string;
  catchphrase: string;
  /** accent used for the ring and accessories (always paired with a text label in UI) */
  accent: string;
  accentTint: string;
  hair: string;
  skin: string;
  /** formal, never jokey — used on legal + accessibility findings */
  serious?: boolean;
}

export const CHARACTERS: Record<ReviewerKey, Character> = {
  brand_voice: {
    key: "brand_voice", reviewer: "brand_voice", name: "Dame Vera", role: "Brand Voice",
    catchphrase: "Does it sound like us?",
    accent: "#1B2A6B", accentTint: "#E7EAF7", hair: "#B9BDC7", skin: "#E8C4A2",
  },
  terminology: {
    key: "terminology", reviewer: "terminology", name: "Professor Idris", role: "Terminology",
    catchphrase: "Let’s use the approved word.",
    accent: "#3D2468", accentTint: "#EDE7F6", hair: "#2E2A28", skin: "#8A5A3B",
  },
  fact_checker: {
    key: "fact_checker", reviewer: "fact_checker", name: "Inspector Mei", role: "Fact Checker",
    catchphrase: "Show me the source.",
    accent: "#0F6B5C", accentTint: "#E2F1ED", hair: "#1F1B1A", skin: "#F0CDA8",
  },
  visual: {
    key: "visual", reviewer: "visual", name: "Lord Mateo", role: "Visual",
    catchphrase: "That blue is not our blue.",
    accent: "#8F7418", accentTint: "#F6EDD2", hair: "#6B4A2F", skin: "#C98D63",
  },
  accessibility: {
    key: "accessibility", reviewer: "accessibility", name: "Dr. Amara", role: "Accessibility",
    catchphrase: "Can everyone read this?", serious: true,
    accent: "#1F6F4A", accentTint: "#E4F1EA", hair: "#241C1A", skin: "#6E4327",
  },
  legal: {
    key: "legal", reviewer: "legal", name: "Judge Okonkwo", role: "Legal",
    catchphrase: "Where is the proof?", serious: true,
    accent: "#9B1C31", accentTint: "#FBEAEC", hair: "#2A2320", skin: "#5B3A25",
  },
};

export const CHARACTER_LIST = Object.values(CHARACTERS);

export function characterFor(reviewer: string): Character {
  const key = (reviewer || "").toLowerCase().replace(/[\s-]+/g, "_") as ReviewerKey;
  return CHARACTERS[key] ?? CHARACTERS.brand_voice;
}

/** Human personas for the demo users (small avatars, role ribbons). */
export interface Persona {
  email: string;
  name: string;
  role: string;
  initials: string;
  accent: string;
}

export const PERSONAS: Record<string, Persona> = {
  "ananya@northwind.example": { email: "ananya@northwind.example", name: "Ananya Iyer", role: "Admin", initials: "AI", accent: "#0B1437" },
  "meera@northwind.example": { email: "meera@northwind.example", name: "Meera Krishnan", role: "Brand Manager", initials: "MK", accent: "#3D2468" },
  "arjun@northwind.example": { email: "arjun@northwind.example", name: "Arjun Nair", role: "Approver", initials: "AN", accent: "#1F6F4A" },
  "karan@northwind.example": { email: "karan@northwind.example", name: "Karan Mehta", role: "Manager", initials: "KM", accent: "#1B2A6B" },
  "priya@northwind.example": { email: "priya@northwind.example", name: "Priya Raghavan", role: "Manager", initials: "PR", accent: "#B26A00" },
  "rhea@northwind.example": { email: "rhea@northwind.example", name: "Rhea D'Souza", role: "Creator", initials: "RD", accent: "#8F7418" },
  "vikram@northwind.example": { email: "vikram@northwind.example", name: "Vikram Sethi", role: "Creator", initials: "VS", accent: "#9B1C31" },
  "nikhil@northwind.example": { email: "nikhil@northwind.example", name: "Nikhil Verma", role: "External Creator", initials: "NV", accent: "#5C5C72" },
};

export function personaFor(name?: string | null, email?: string | null): Persona {
  if (email && PERSONAS[email]) return PERSONAS[email];
  const match = Object.values(PERSONAS).find((p) => p.name === name);
  if (match) return match;
  const initials = (name || "?")
    .split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
  return { email: email ?? "", name: name || "Someone", role: "", initials: initials || "?", accent: "#5C5C72" };
}
