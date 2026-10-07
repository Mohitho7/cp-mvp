import { ClerkProvider, SignIn, SignUp, Show } from "@clerk/react";
import { Switch, Route, Link, Router as WouterRouter, useLocation } from "wouter";
import { useEffect } from "react";
import CareerDiscovery from "./pages/CareerDiscovery";
import StudentStatus from "./pages/StudentStatus";
import InstitutionDashboard from "./pages/InstitutionDashboard";
import { Brand, PageFrame } from "./components/Brand";

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL as string | undefined;

function SignInPage() {
  return <PageFrame><header className="topbar"><Brand /></header><main className="auth-page"><div className="auth-page-copy"><span className="eyebrow">A GOOD PLACE TO START AGAIN</span><h1>Your next step should fit <em>you.</em></h1><p>Sign in to keep your private report close.</p></div><SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" /></main></PageFrame>;
}

function SignUpPage() {
  return <PageFrame><header className="topbar"><Brand /></header><main className="auth-page"><div className="auth-page-copy"><span className="eyebrow">MAKE SPACE FOR A BETTER QUESTION</span><h1>Start with what’s <em>true.</em></h1><p>Create your student account to save your answers and receive a private report.</p></div><SignUp routing="path" path="/sign-up" signInUrl="/sign-in" /></main></PageFrame>;
}

function StudentRoute() {
  return <><Show when="signed-in"><StudentStatus /></Show><Show when="signed-out"><RedirectToSignInFallback to="/sign-in" /></Show></>;
}

function RedirectToSignInFallback({ to }: { to: string }) {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation(to);
  }, [to, setLocation]);
  return null;
}

function AdminRoute() {
  return <><Show when="signed-in"><InstitutionDashboard /></Show><Show when="signed-out"><RedirectToSignInFallback to="/sign-in" /></Show></>;
}

function NotFound() {
  return <PageFrame><header className="topbar"><Brand /></header><main className="access-denied"><span className="eyebrow">404 · NOT ON THIS MAP</span><h1>That page doesn’t exist.</h1><Link href="/" className="button button-primary">Back to discovery</Link></main></PageFrame>;
}

export default function App() {
  if (!clerkPubKey) throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY environment variable");
  return (
    <WouterRouter>
      <ClerkProvider
        publishableKey={clerkPubKey}
        proxyUrl={clerkProxyUrl}
        signInUrl="/sign-in"
        signUpUrl="/sign-up"
      >
        <Switch>
          <Route path="/" component={CareerDiscovery} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route path="/student/status" component={StudentRoute} />
          <Route path="/student/status/:id" component={StudentRoute} />
          <Route path="/institution/dashboard" component={AdminRoute} />
          <Route component={NotFound} />
        </Switch>
      </ClerkProvider>
    </WouterRouter>
  );
}
