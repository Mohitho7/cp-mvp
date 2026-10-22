export const careerMarketContext = {
  region: "India",
  verifiedOn: null,
  sourceStatus:
    "No institution-verified salary or hiring dataset has been configured.",
  salaryRangesInrLpa: [],
  hiringTrends: [],
  guidance: [
    "Do not invent placement rates, job-posting counts, or current hiring statistics.",
    "If a verified range or trend is absent, report it as unavailable instead of estimating.",
    "Do not imply that this context contains verified salary or hiring figures.",
  ],
} as const;
