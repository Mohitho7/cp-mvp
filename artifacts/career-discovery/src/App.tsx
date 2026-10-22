import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useUser } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { dark } from "@clerk/themes";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Redirect, Route, Switch, useLocation, Router as WouterRouter, Link } from "wouter";
import CareerDiscovery from "@/pages/CareerDiscovery";
import StudentStatus from "@/pages/StudentStatus";
import InstitutionDashboard from "@/pages/InstitutionDashboard";
import { Brand, PageFrame } from "@/components/Brand";
import { ReportDetail } from "@/pages/ReportDetail";
import { REPRESENTATIVE_CANONICAL_REPORT, REPRESENTATIVE_STRATEGY } from "@/lib/representativeReport";
import { isPreviewAccessAllowed } from "@/lib/previewIsolation";
import {
  isAssessmentStartRequested,
  resolveHomeNavigation,
  SUBMISSION_STORAGE_KEY,
} from "@/lib/assessmentNavigation";

const queryClient = new QueryClient();
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
function stripBase(path: string): string {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || "/" : path;
}

const clerkAppearance = {
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#E7B93F",
    colorForeground: "#171A15",
    colorMutedForeground: "#60665B",
    colorDanger: "#C55B5B",
    colorBackground: "#FFFFFF",
    colorInput: "#FCFAF6",
    colorInputForeground: "#171A15",
    colorNeutral: "#D9DED5",
    fontFamily: '"Plus Jakarta Sans", sans-serif',
    borderRadius: "14px",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-white border border-[#E6EAE3] shadow-sm rounded-2xl w-[440px] max-w-full overflow-hidden",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[#171A15] font-bold font-serif",
    headerSubtitle: "text-[#60665B]",
    socialButtonsBlockButtonText: "text-[#171A15]",
    formFieldLabel: "text-[#3D4439]",
    footerActionLink: "text-[#8F7220] font-semibold",
    footerActionText: "text-[#60665B]",
    dividerText: "text-[#889082]",
    identityPreviewEditButton: "text-[#8F7220]",
    formFieldSuccessText: "text-[#1E5437]",
    alertText: "text-[#171A15]",
    logoBox: "rounded-lg",
    logoImage: "rounded-lg",
    socialButtonsBlockButton: "border-[#D9DED5] bg-[#FFFDF8] hover:bg-[#F6F4EB]",
    formButtonPrimary: "bg-[#E7B93F] text-[#171A15] hover:bg-[#D6A92F] font-semibold",
    formFieldInput: "bg-[#FFFDF8] text-[#171A15] border-[#D9DED5] focus:border-[#E7B93F]",
    footerAction: "border-0",
    dividerLine: "bg-[#E6EAE3]",
    alert: "bg-[#FCF4E4] border-[#D59B32] text-[#7A510A]",
    otpCodeFieldInput: "bg-[#FFFDF8] text-[#171A15] border-[#D9DED5]",
    formFieldRow: "text-[#171A15]",
    main: "text-[#171A15]",
  },
};

function SignInPage() {
  return <PageFrame><header className="topbar"><Brand /></header><main className="auth-page"><div className="auth-page-copy"><span className="eyebrow">A GOOD PLACE TO START AGAIN</span><h1>Your next step should fit <em>you.</em></h1><p>Sign in to keep your private report close.</p></div><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></main></PageFrame>;
}

function SignUpPage() {
  return <PageFrame><header className="topbar"><Brand /></header><main className="auth-page"><div className="auth-page-copy"><span className="eyebrow">MAKE SPACE FOR A BETTER QUESTION</span><h1>Start with what’s <em>true.</em></h1><p>Create your student account to save your answers and receive a private report.</p></div><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></main></PageFrame>;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) client.clear();
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, client]);
  return null;
}

function HomeRedirect() {
  const { isSignedIn } = useUser();
  const search = typeof window !== "undefined" ? window.location.search : "";
  const pathname = typeof window !== "undefined" ? window.location.pathname : "";
  const submissionId =
    typeof window !== "undefined"
      ? localStorage.getItem(SUBMISSION_STORAGE_KEY)
      : null;

  const decision = resolveHomeNavigation({
    isSignedIn: Boolean(isSignedIn),
    submissionId,
    search,
    pathname,
  });

  if (decision.action === "redirect_status" && decision.redirectPath) {
    return <Redirect to={decision.redirectPath} />;
  }
  return <CareerDiscovery />;
}

function StudentRoute() {
  return <><Show when="signed-in"><StudentStatus /></Show><Show when="signed-out"><Redirect to="/sign-in" /></Show></>;
}

function AdminRoute() {
  return <><Show when="signed-in"><InstitutionDashboard /></Show><Show when="signed-out"><Redirect to="/sign-in" /></Show></>;
}

function NotFound() {
  return <PageFrame><header className="topbar"><Brand /></header><main className="access-denied"><span className="eyebrow">404 · NOT ON THIS MAP</span><h1>That page doesn’t exist.</h1><Link href="/" className="button button-primary">Back to discovery</Link></main></PageFrame>;
}

function ReportPreviewPage() {
  const { user, isSignedIn } = useUser();
  const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const isLegacy = searchParams?.get("legacy") === "true";
  const withInsufficient = searchParams?.get("insufficient") === "true";

  // Enforce environment or access restrictions:
  // In development, preview is available for design reviews and development.
  // In production builds, preview is restricted to authenticated institution staff.
  const isDev = import.meta.env.DEV;
  const userEmail = user?.primaryEmailAddress?.emailAddress?.toLowerCase();
  const isAdmin = Boolean(
    userEmail &&
    (userEmail.includes("admin") || userEmail.includes("dean") || userEmail.endsWith("@hitam.org") || userEmail === "mohith0756@gmail.com")
  );

  if (!isPreviewAccessAllowed({ isDev, isSignedIn: Boolean(isSignedIn), isAdmin })) {
    return <NotFound />;
  }

  const baseStrategy = REPRESENTATIVE_STRATEGY as any;
  const strategy = withInsufficient
    ? {
        ...baseStrategy,
        insufficientContext: true,
        rationale: {
          ...baseStrategy?.rationale,
          target: "No target selected: degree context is missing.",
        },
      }
    : baseStrategy;

  const legacyReportData = {
    profile: {
      archetype: "The Pragmatic Builder",
      workerType: "Operator",
      clarityLevel: "Exploratory",
      summary: "Legacy profile summary describing general operations.",
      strengths: ["Disciplined execution", "Clear documentation"],
      risks: ["Over-focusing on small details"],
      survivalEnvironment: "Supportive team with established processes.",
    },
    traits: {
      technical: { score: 3, reason: "Comfortable with tooling", label: "Medium" },
      creative: { score: 3, reason: "Occasional novel solutions", label: "Medium" },
      people: { score: 3, reason: "Works well in small groups", label: "Medium" },
      risk: { score: 2, reason: "Prefers predictable steps", label: "Low" },
      learning: { score: 4, reason: "Rapid ramp-up on documentation", label: "High" },
    },
    answerPatterns: {
      clear: ["Consistent preference for structured deliverables"],
      conflicts: [{ tag: "Autonomy vs Support", text: "Desires freedom but relies on templates" }],
      worthExploring: ["Exploratory automation workflows"],
    },
    caliberVsEntry: {
      longTermCaliber: "High operational reliability with systematic problem-solving.",
      marketBarrier: "High market competition for entry-level generalist roles.",
      marketBarrierLevel: "Moderate",
      firstEntryRoles: ["Technical Support Specialist", "QA Junior"],
      bridgePath: "Transition via QA automation tools to build technical depth.",
    },
    careerFits: [
      {
        title: "Software Engineer",
        roleType: "Technical Specialist",
        naturalFitScore: 8,
        dailyWork: "Writing and maintaining services.",
        whyFits: "Strong alignment with systematic logic.",
        salaryInrLpa: { min: 6, max: 12 },
        entryDifficulty: "High",
        careerHealth: "Growing",
        aiThreat: "Moderate",
        fiveYearGrowth: "Senior Engineer",
      },
    ],
    careersToAvoid: [
      {
        title: "Cold Call Sales Representative",
        why: "Misaligned with introverted execution preference.",
      },
    ],
    recommendedTrack: "Core Software Engineering",
    trackDetail: {
      why: "Builds on foundational programming knowledge.",
      fresherDemand: "Moderate",
      skillsToLearn: ["Git", "TypeScript", "SQL"],
    },
    roadmap: [
      {
        months: "Months 1-3",
        focus: "Foundational Git and Scripting",
        actions: ["Complete version control tutorial", "Write automated scripts"],
      },
    ],
    brutalTruth: "Theoretical knowledge without deployed projects will not yield callbacks.",
  };

  return (
    <PageFrame>
      <header className="topbar">
        <Brand />
        <div className="topbar-right">
          <Link href="/preview/report" className="quiet-link" style={{ fontWeight: !isLegacy && !withInsufficient ? "bold" : "normal" }}>Canonical</Link>
          <Link href="/preview/report?legacy=true" className="quiet-link" style={{ fontWeight: isLegacy ? "bold" : "normal" }}>Legacy</Link>
          <Link href="/preview/report?insufficient=true" className="quiet-link" style={{ fontWeight: withInsufficient ? "bold" : "normal" }}>Insufficient Context</Link>
        </div>
      </header>
      <main className="student-main enter">
        <ReportDetail
          report={isLegacy ? (legacyReportData as any) : REPRESENTATIVE_CANONICAL_REPORT}
          strategy={strategy}
        />
      </main>
    </PageFrame>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}
    localization={{
      signIn: { start: { title: "Welcome back", subtitle: "Sign in to access your account" } },
      signUp: { start: { title: "Create your account", subtitle: "Your next step starts here" } },
    }}
    routerPush={(to) => setLocation(stripBase(to))}
    routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
  >
    <QueryClientProvider client={queryClient}>
      <ClerkQueryClientCacheInvalidator />
      <Switch>
        <Route path="/" component={HomeRedirect} />
        <Route path="/assessment" component={CareerDiscovery} />
        <Route path="/preview/report" component={ReportPreviewPage} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route path="/student/status" component={StudentRoute} />
        <Route path="/student/status/:id" component={StudentRoute} />
        <Route path="/student/report/:id" component={StudentRoute} />
        <Route path="/institution/dashboard" component={AdminRoute} />
        <Route component={NotFound} />
      </Switch>
    </QueryClientProvider>
  </ClerkProvider>;
}

export default function App() {
  if (!clerkPubKey) throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in .env file");
  return <WouterRouter base={basePath}><ClerkProviderWithRoutes /></WouterRouter>;
}
