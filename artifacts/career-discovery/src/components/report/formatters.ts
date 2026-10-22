/**
 * Human-readable formatters for report presentation.
 * Ensures students never see raw backend enum keys or internal IDs.
 */

export function formatAccessibility(level?: string | null): { label: string; tone: "positive" | "neutral" | "caution" } {
  switch (level) {
    case "VERY_HIGH":
      return { label: "Very High Fresher Accessibility", tone: "positive" };
    case "HIGH":
      return { label: "High Fresher Accessibility", tone: "positive" };
    case "MEDIUM":
    case "MODERATE":
      return { label: "Moderate Accessibility", tone: "neutral" };
    case "LOW":
      return { label: "Competitive Entry", tone: "caution" };
    case "VERY_LOW":
      return { label: "Prior Experience Usually Required", tone: "caution" };
    default:
      return { label: "Standard Accessibility", tone: "neutral" };
  }
}

export function formatDegreeAlignment(alignment?: string | null): { label: string; tone: "positive" | "neutral" | "caution" } {
  switch (alignment) {
    case "STRONG":
      return { label: "Strong Degree Alignment", tone: "positive" };
    case "MODERATE":
      return { label: "Moderate Degree Alignment", tone: "neutral" };
    case "NEUTRAL":
      return { label: "Flexible Degree Background", tone: "neutral" };
    case "WEAK":
      return { label: "Non-Traditional Background", tone: "caution" };
    default:
      return { label: "Relevant Background", tone: "neutral" };
  }
}

export function formatRouteType(routeType?: string | null): { label: string; description: string } {
  switch (routeType) {
    case "DIRECT":
      return {
        label: "Direct Route",
        description: "You can target this role directly with focused preparation.",
      };
    case "ADJACENT":
      return {
        label: "Adjacent Route",
        description: "An accessible adjacent role that builds direct skills toward your target.",
      };
    case "BRIDGE":
      return {
        label: "Staged Bridge Route",
        description: "A two-stage progression to bridge specialized experience gaps.",
      };
    default:
      return {
        label: "Tailored Route",
        description: "Structured preparation pathway aligned with your profile.",
      };
  }
}

export function formatRunway(weeks?: number | null): string {
  if (weeks == null || isNaN(weeks) || weeks <= 0) {
    return "Self-paced preparation";
  }
  if (weeks === 1) {
    return "~1 week preparation";
  }
  return `~${Math.round(weeks)} weeks preparation`;
}

export function formatScore(score?: number | null): string | null {
  if (score == null || isNaN(score)) return null;
  return `${Math.round(score)}%`;
}
