/**
 * Batch 2 — Conservative degree-family normalization.
 *
 * PURE + DETERMINISTIC. Free-text degrees map to a broad family via ordered
 * keyword checks (most specific families first). Unknown or empty degrees map
 * to OTHER, which every catalog career treats as NEUTRAL — uncertainty is
 * never presented as a strong match.
 */
import type { CareerDefinition, DegreeAlignment, DegreeFamily } from "./types";

const FAMILY_KEYWORDS: Array<{ family: DegreeFamily; fragments: string[] }> = [
  {
    family: "CS_IT_DATA",
    fragments: [
      "computer",
      "software",
      "information technology",
      "data science",
      "machine learning",
      "artificial intelligence",
      "cyber",
      "cloud",
      "bca",
      "mca",
      "cse",
    ],
  },
  {
    family: "ENGINEERING",
    fragments: [
      "engineering",
      "b.tech",
      "btech",
      "mechanical",
      "civil",
      "electrical",
      "electronics",
      "biotech",
    ],
  },
  {
    family: "BUSINESS_COMMERCE",
    fragments: [
      "business",
      "commerce",
      "bba",
      "mba",
      "b.com",
      "bcom",
      "m.com",
      "mcom",
      "economics",
      "finance",
      "account",
      "management",
      "marketing",
      "entrepreneur",
      "chartered",
    ],
  },
  {
    family: "DESIGN",
    fragments: ["design", "fashion", "media", "animation", "fine arts", "visual communication", "b.des", "m.des", "bdes", "mdes"],
  },
  {
    family: "SCIENCE",
    fragments: [
      "physics",
      "chemistry",
      "mathematics",
      "maths",
      "biology",
      "b.sc",
      "bsc",
      "msc",
      "statistics",
      "zoology",
      "botany",
    ],
  },
  {
    family: "ARTS_HUMANITIES",
    fragments: [
      "arts",
      "humanities",
      "literature",
      "history",
      "psychology",
      "sociology",
      "philosophy",
      "journalism",
      "english",
    ],
  },
];

export function normalizeDegreeFamily(degree: string): DegreeFamily {
  const text = (degree ?? "").toLowerCase();
  for (const { family, fragments } of FAMILY_KEYWORDS) {
    if (fragments.some((fragment) => text.includes(fragment))) {
      return family;
    }
  }
  return "OTHER";
}

export function alignmentFor(career: CareerDefinition, family: DegreeFamily): DegreeAlignment {
  if (career.degreeStrong.includes(family)) return "STRONG";
  if (career.degreeModerate.includes(family)) return "MODERATE";
  if (career.degreeWeak.includes(family)) return "WEAK";
  return "NEUTRAL";
}

export const DEGREE_ALIGNMENT_VALUE: Record<DegreeAlignment, number> = {
  STRONG: 1,
  MODERATE: 0.75,
  NEUTRAL: 0.5,
  WEAK: 0.25,
};

export const ACCESSIBILITY_VALUE = {
  VERY_LOW: 1,
  LOW: 2,
  MEDIUM: 3,
  HIGH: 4,
  VERY_HIGH: 5,
} as const;
