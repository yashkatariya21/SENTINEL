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
  "ada@northwind.example": { email: "ada@northwind.example", name: "Ada Okafor", role: "Admin", initials: "AO", accent: "#0B1437" },
  "maya@northwind.example": { email: "maya@northwind.example", name: "Maya Lindqvist", role: "Brand Manager", initials: "ML", accent: "#3D2468" },
  "raj@northwind.example": { email: "raj@northwind.example", name: "Raj Menon", role: "Approver", initials: "RM", accent: "#1F6F4A" },
  "tom@northwind.example": { email: "tom@northwind.example", name: "Tom Ferreira", role: "Manager", initials: "TF", accent: "#1B2A6B" },
  "ines@northwind.example": { email: "ines@northwind.example", name: "Inês Duarte", role: "Manager", initials: "ID", accent: "#B26A00" },
  "leo@northwind.example": { email: "leo@northwind.example", name: "Leo Park", role: "Creator", initials: "LP", accent: "#8F7418" },
  "nina@northwind.example": { email: "nina@northwind.example", name: "Nina Haddad", role: "Creator", initials: "NH", accent: "#9B1C31" },
  "sam@northwind.example": { email: "sam@northwind.example", name: "Sam Boateng", role: "External Creator", initials: "SB", accent: "#5C5C72" },
};

export function personaFor(name?: string | null, email?: string | null): Persona {
  if (email && PERSONAS[email]) return PERSONAS[email];
  const match = Object.values(PERSONAS).find((p) => p.name === name);
  if (match) return match;
  const initials = (name || "?")
    .split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
  return { email: email ?? "", name: name || "Someone", role: "", initials: initials || "?", accent: "#5C5C72" };
}
