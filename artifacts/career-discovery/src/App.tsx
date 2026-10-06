import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useUser } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Redirect, Route, Switch, useLocation, Router as WouterRouter, Link } from "wouter";
import CareerDiscovery from "@/pages/CareerDiscovery";
import StudentStatus from "@/pages/StudentStatus";
import InstitutionDashboard from "@/pages/InstitutionDashboard";
import { Brand, PageFrame } from "@/components/Brand";

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
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#d8b743",
    colorForeground: "#eee7d9",
    colorMutedForeground: "#a49a86",
    colorDanger: "#e68170",
    colorBackground: "#1a1812",
    colorInput: "#211f18",
    colorInputForeground: "#eee7d9",
    colorNeutral: "#494333",
    fontFamily: '"Plus Jakarta Sans", sans-serif',
    borderRadius: "14px",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[#1a1812] rounded-2xl w-[440px] max-w-full overflow-hidden",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[#eee7d9] font-bold",
    headerSubtitle: "text-[#aaa18f]",
    socialButtonsBlockButtonText: "text-[#e9e1d3]",
    formFieldLabel: "text-[#ddd4c3]",
    footerActionLink: "text-[#e8c75e]",
    footerActionText: "text-[#aaa18f]",
    dividerText: "text-[#aaa18f]",
    identityPreviewEditButton: "text-[#e8c75e]",
    formFieldSuccessText: "text-[#83c8a5]",
    alertText: "text-[#eee7d9]",
    logoBox: "rounded-lg",
    logoImage: "rounded-lg",
    socialButtonsBlockButton: "border-[#494333] bg-[#211f18] hover:bg-[#29261d]",
    formButtonPrimary: "bg-[#d8b743] text-[#17150f] hover:bg-[#e5ca66]",
    formFieldInput: "bg-[#211f18] text-[#eee7d9] border-[#494333]",
    footerAction: "border-0",
    dividerLine: "bg-[#494333]",
    alert: "bg-[#30211d] border-[#754239]",
    otpCodeFieldInput: "bg-[#211f18] text-[#eee7d9] border-[#494333]",
    formFieldRow: "text-[#eee7d9]",
    main: "text-[#eee7d9]",
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
  if (isSignedIn && localStorage.getItem("careerDiscoverySubmissionId")) return <Redirect to="/student/status" />;
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
