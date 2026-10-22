import { useState, useRef, useEffect } from "react";
import { useCreateCareerSubmission, useHealthCheck } from "@workspace/api-client-react";
import type { CareerSubmissionInput } from "@workspace/api-client-react";
import { useAuth, SignIn, SignUp } from "@clerk/react";
import { Link, useLocation } from "wouter";
import { AlertCircle, ArrowRight, Check, Clock3, LockKeyhole, Send } from "lucide-react";
import { Brand, PageFrame } from "@/components/Brand";
import {
  DRAFT_STORAGE_KEY,
  graduationYearOptions,
  readAssessmentDraft,
  writeAssessmentDraft,
} from "@/lib/assessmentDraft";
import {
  isAssessmentStartRequested,
  resolveAssessmentInitialState,
} from "@/lib/assessmentNavigation";


const QUESTIONS = [
  {
    id: 1, type: "single", section: "Who You Are",
    label: "What drives their satisfaction",
    question: "Which one sounds most satisfying to you?",
    subtext: "Go with your gut — not what sounds impressive.",
    options: [
      { emoji: "🔨", label: "Building something cool" },
      { emoji: "🧩", label: "Solving difficult problems" },
      { emoji: "💰", label: "Making money early" },
      { emoji: "🤝", label: "Working with people" },
      { emoji: "🎨", label: "Creating or designing things" },
      { emoji: "🌀", label: "I honestly don't know yet" },
    ],
  },
  {
    id: 2, type: "multi", section: "Who You Are",
    label: "Natural role in teams",
    question: "In group projects, what do you usually end up becoming?",
    subtext: "Behavior reveals more than self-description ever will.",
    options: [
      { emoji: "⚙️", label: "The person who builds/codes things" },
      { emoji: "📋", label: "The one managing everyone" },
      { emoji: "✏️", label: "The creative or design person" },
      { emoji: "🚨", label: "The one fixing problems last minute" },
      { emoji: "🎯", label: "The silent one doing their own focused work" },
      { emoji: "👻", label: "The one avoiding the project completely" },
    ],
  },
  {
    id: 3, type: "multi", section: "Who You Are",
    label: "What they naturally spend time on",
    question: "What kind of things do you naturally spend time on?",
    subtext: "Not what you think you should — what you actually do.",
    options: [
      { emoji: "📺", label: "Watching tech / coding videos" },
      { emoji: "🎬", label: "Editing, design, or content creation" },
      { emoji: "🎮", label: "Gaming" },
      { emoji: "📚", label: "Learning random stuff online" },
      { emoji: "📈", label: "Business or money content" },
      { emoji: "🤖", label: "Exploring AI tools" },
      { emoji: "💬", label: "Helping friends solve problems" },
      { emoji: "🗂️", label: "Organizing and planning things" },
      { emoji: "📱", label: "Mostly just scrolling honestly" },
    ],
  },
  {
    id: 4, type: "multi", section: "Your Work Style",
    label: "Tasks that drain them less",
    question: "Which type of task sounds LESS painful to do for hours?",
    subtext: "You don't have to love it — just drains you less. Pick all that apply.",
    options: [
      { emoji: "💻", label: "Writing code or working with tools" },
      { emoji: "🗣️", label: "Talking to people or clients" },
      { emoji: "🗃️", label: "Organizing data or systems" },
      { emoji: "🖼️", label: "Creating visuals or content" },
      { emoji: "🔬", label: "Researching and learning new things" },
      { emoji: "⚡", label: "Finding shortcuts or automating tasks" },
    ],
  },
  {
    id: 5, type: "single", section: "Your Work Style",
    label: "Coding comfort level",
    question: "How do you currently feel about coding?",
    subtext: "No judgment — most careers don't even require heavy coding.",
    options: [
      { emoji: "🔥", label: "I actually enjoy it" },
      { emoji: "🙂", label: "I can learn if it helps my career" },
      { emoji: "🛠️", label: "I prefer low-code or no-code tools" },
      { emoji: "😐", label: "I don't enjoy it much" },
      { emoji: "🤷", label: "I haven't properly explored it yet" },
    ],
  },
  {
    id: 6, type: "multi", section: "Your Work Style",
    label: "How they learn best",
    question: "How do you usually learn something new best?",
    subtext: "This shapes which career growth paths will actually work for you. Pick all that apply.",
    options: [
      { emoji: "🎥", label: "Watching videos and tutorials" },
      { emoji: "🧪", label: "Trying things directly and breaking stuff" },
      { emoji: "📖", label: "Following structured steps or courses" },
      { emoji: "👥", label: "Learning with a community or friends" },
      { emoji: "🏗️", label: "Building real projects while learning" },
      { emoji: "😩", label: "I struggle to stay consistent honestly" },
    ],
  },
  {
    id: 7, type: "multi3", section: "Life & Environment",
    label: "Preferred work environment",
    question: "Which work environment actually sounds comfortable to you?",
    subtext: "Be real — your environment affects everything. Pick up to 3.",
    options: [
      { emoji: "🚀", label: "Startup chaos and fast growth" },
      { emoji: "🏢", label: "Stable corporate structure" },
      { emoji: "🏠", label: "Remote independent work" },
      { emoji: "🤝", label: "Team collaboration and meetings" },
      { emoji: "💼", label: "Freelancing or running my own thing" },
    ],
  },
  {
    id: 8, type: "multi", section: "Life & Environment",
    label: "Things that drain them quickly",
    question: "What would probably drain you quickly?",
    subtext: "Elimination is more useful than recommendation.",
    options: [
      { emoji: "😴", label: "Doing the same repetitive thing daily" },
      { emoji: "🧱", label: "Too much deep coding all day" },
      { emoji: "📞", label: "Too many meetings or people interactions" },
      { emoji: "🏙️", label: "Strict office life with no flexibility" },
      { emoji: "⚔️", label: "High-pressure competitive environments" },
      { emoji: "📜", label: "Too much theory with no practical work" },
      { emoji: "📉", label: "Unstable or unpredictable income" },
    ],
  },
  {
    id: 9, type: "multi3", section: "Life & Environment",
    label: "What success in their 20s looks like",
    question: "Which of these would make you feel genuinely successful in your 20s?",
    subtext: "Not what sounds good — what would actually feel good. Pick up to 3.",
    options: [
      { emoji: "💸", label: "Earning a lot of money" },
      { emoji: "🌍", label: "Working from anywhere in the world" },
      { emoji: "🏗️", label: "Building something of my own" },
      { emoji: "🏡", label: "A stable and predictable life" },
      { emoji: "🏆", label: "Being respected and highly skilled" },
      { emoji: "❤️", label: "Doing work I actually enjoy" },
      { emoji: "🧘", label: "Having free time and low stress" },
    ],
  },
  {
    id: 10, type: "multi3", section: "Your Direction",
    label: "Most interesting area",
    question: "Which areas sound most interesting to you?",
    subtext: "Pick up to 3 — this is where hidden career paths start to appear.",
    options: [
      { emoji: "📱", label: "Creating apps or websites" },
      { emoji: "🤖", label: "Working with AI or automation tools" },
      { emoji: "📊", label: "Understanding business, money, or strategy" },
      { emoji: "🎨", label: "Design or content creation" },
      { emoji: "🗺️", label: "Managing people or projects" },
      { emoji: "🔍", label: "Working with data or solving analytical problems" },
      { emoji: "🌐", label: "I'm still exploring honestly" },
    ],
  },
  {
    id: 11, type: "multi3", section: "Your Direction",
    label: "Life vision after 30s",
    question: "After your 30s, which kind of life sounds better?",
    subtext: "Your future pulls your career — not the other way around. Pick up to 3.",
    options: [
      { emoji: "👨‍👩‍👧", label: "Stable family life with predictable income" },
      { emoji: "💎", label: "Financial freedom — options and wealth" },
      { emoji: "🏢", label: "Running my own business or venture" },
      { emoji: "🌴", label: "Flexible work — travel, remote, freedom" },
      { emoji: "🎖️", label: "A respected high-level career" },
      { emoji: "🌿", label: "Peaceful low-stress, meaningful work" },
      { emoji: "🤷", label: "I haven't thought that far honestly" },
    ],
  },
  {
    id: 12, type: "single", section: "Your Direction",
    label: "Continuous learning comfort",
    question: "How comfortable are you with continuous learning?",
    subtext: "In an AI era, this shapes everything about which careers suit you.",
    options: [
      { emoji: "🚀", label: "I genuinely enjoy constantly learning new things" },
      { emoji: "✅", label: "I'm okay with it if it helps my career growth" },
      { emoji: "😌", label: "I prefer mastering stable skills, not chasing trends" },
      { emoji: "😬", label: "I struggle staying consistent with learning" },
    ],
  },
  {
    id: 13, type: "text", section: "The Real You",
    label: "Dream work with no judgment",
    question: "If nobody judged you — what kind of work would you genuinely want to try?",
    subtext: "No parental pressure. No salary pressure. No trend pressure. Just you.",
    placeholder: "e.g. build AI tools, run a YouTube channel, design games, manage a startup team...",
  },
];

const SECTIONS = ["Who You Are", "Your Work Style", "Life & Environment", "Your Direction", "The Real You"];

export default function CareerDiscovery() {
  const [location] = useLocation();
  const search = typeof window !== "undefined" ? window.location.search : "";
  const startRequested = isAssessmentStartRequested(search, location);

  const [initialDraft] = useState(() => readAssessmentDraft(localStorage, QUESTIONS.length));
  const initialState = resolveAssessmentInitialState({
    isStarting: startRequested,
    draft: initialDraft,
  });

  const hasSavedDraftAnswers = initialState.hasSavedAnswers;
  const [screen, setScreen] = useState<"intro" | "quiz" | "result">(initialState.screen);
  const [currentQ, setCurrentQ] = useState(initialState.currentQ);
  const [answers, setAnswers] = useState<(string | string[] | null)[]>(initialDraft?.answers ?? Array(QUESTIONS.length).fill(null));
  const [textInput, setTextInput] = useState(initialDraft?.textInput ?? "");
  const [userType, setUserType] = useState<string | null>(initialDraft?.userType ?? "student");
  const [department, setDepartment] = useState(initialDraft?.department ?? "");
  const [year, setYear] = useState(initialDraft?.year ?? "");
  const [batch, setBatch] = useState(initialDraft?.batch ?? "");
  const [degree, setDegree] = useState(initialDraft?.degree ?? "");
  const [graduationYear, setGraduationYear] = useState<number | null>(initialDraft?.graduationYear ?? null);
  const [availableHoursPerWeek, setAvailableHoursPerWeek] = useState<number | null>(initialDraft?.availableHoursPerWeek ?? null);
  const [consent, setConsent] = useState(initialDraft?.consent ?? false);
  const [draftSaveError, setDraftSaveError] = useState(false);
  const [submissionId, setSubmissionId] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up">("sign-in");
  const { isSignedIn } = useAuth();
  const submission = useCreateCareerSubmission();
  const health = useHealthCheck();
  const [, setLocation] = useLocation();
  const resultRef = useRef<HTMLDivElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const draftClearedRef = useRef(false);

  useEffect(() => {
    if (startRequested && screen === "intro") {
      setScreen(initialDraft?.screen === "result" ? "result" : "quiz");
    }
  }, [startRequested]);

  useEffect(() => {
    if (screen === "intro" || draftClearedRef.current) return;

    const saved = writeAssessmentDraft(localStorage, {
      version: 1,
      screen,
      currentQ,
      answers,
      textInput,
      userType,
      department,
      year,
      batch,
      degree,
      graduationYear,
      availableHoursPerWeek,
      consent,
    });
    setDraftSaveError(!saved);
  }, [screen, currentQ, answers, textInput, userType, department, year, batch, degree, graduationYear, availableHoursPerWeek, consent]);

  const q = QUESTIONS[currentQ];
  const progress = ((currentQ + 1) / QUESTIONS.length) * 100;
  const currentAnswer = answers[currentQ];
  const sectionIndex = SECTIONS.indexOf(q?.section);
  const sectionColors = ["#f5c842", "#5bc4a0", "#7eb8f7", "#e07af5", "#f0806a"];
  const accentColor = sectionColors[Math.max(0, sectionIndex)] || "#f5c842";

  function selectOption(label: string) {
    setAnswers((prev) => {
      const next = [...prev];
      if (q.type === "single") {
        next[currentQ] = label;
      } else {
        const cur = Array.isArray(next[currentQ]) ? [...next[currentQ]] : [];
        if (cur.includes(label)) {
          next[currentQ] = cur.filter((x) => x !== label);
        } else {
          const limit = q.type === "multi3" ? 3 : Infinity;
          if (cur.length < limit) next[currentQ] = [...cur, label];
        }
      }
      return next;
    });
  }

  function isSelected(label: string) {
    if (!currentAnswer) return false;
    return Array.isArray(currentAnswer) ? currentAnswer.includes(label) : currentAnswer === label;
  }

  function canProceed() {
    if (q.type === "text") return true;
    if (q.type === "single") return !!currentAnswer;
    if (q.type === "multi" || q.type === "multi3") return Array.isArray(currentAnswer) && currentAnswer.length > 0;
    return false;
  }

  function handleNext() {
    const finalAnswers = [...answers];
    if (q.type === "text") {
      finalAnswers[currentQ] = textInput || "(skipped)";
      setAnswers(finalAnswers);
    }
    if (currentQ < QUESTIONS.length - 1) {
      setCurrentQ((p) => p + 1);
      setTextInput("");
    } else {
      setScreen("result");
    }
  }

  useEffect(() => {
    if (screen !== "result") return;
    const frame = window.requestAnimationFrame(() => {
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      resultHeadingRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [screen]);

  useEffect(() => {
    if (screen !== "quiz") return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Enter") return;
      const target = e.target as HTMLElement | null;
      if (target && target.tagName === "TEXTAREA") return;
      if (!canProceed()) return;
      e.preventDefault();
      handleNext();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function handleBack() {
    if (currentQ === 0) { setScreen("intro"); return; }
    const prevQ = QUESTIONS[currentQ - 1];
    setCurrentQ((p) => p - 1);
    if (prevQ.type === "text") {
      const prev = answers[currentQ - 1];
      setTextInput(typeof prev === "string" && prev !== "(skipped)" ? prev : "");
    }
  }

  function resetAssessmentState(targetScreen: "intro" | "quiz" = "intro") {
    draftClearedRef.current = false;
    try {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch {
      setDraftSaveError(true);
    }
    setScreen(targetScreen);
    setCurrentQ(0);
    setAnswers(Array(QUESTIONS.length).fill(null));
    setTextInput("");
    setUserType("student");
    setDepartment("");
    setYear("");
    setBatch("");
    setDegree("");
    setGraduationYear(null);
    setAvailableHoursPerWeek(null);
    setConsent(false);
    setSubmissionId("");
    setSubmitError("");
  }

  function handleRetake() {
    resetAssessmentState("intro");
  }

  function handleRestartFromQuestion1() {
    resetAssessmentState("quiz");
  }

  const graduationYearChoices = graduationYearOptions();
  const degreeTrimmed = degree.trim();
  const isStudentContextValid =
    degreeTrimmed.length > 0 &&
    degreeTrimmed.length <= 100 &&
    graduationYear !== null &&
    graduationYearChoices.includes(graduationYear) &&
    availableHoursPerWeek !== null &&
    Number.isInteger(availableHoursPerWeek) &&
    availableHoursPerWeek >= 1 &&
    availableHoursPerWeek <= 60;

  function handleSubmitAssessment() {
    setSubmitError("");
    if (graduationYear === null || availableHoursPerWeek === null || !isStudentContextValid) {
      setSubmitError("Please complete the student context section: your degree, graduation year, and realistic weekly hours.");
      return;
    }
    const payload: CareerSubmissionInput = {
      answers: {
        q1: answers[0], q2: answers[1], q3: answers[2], q4: answers[3],
        q5: answers[4], q6: answers[5], q7: answers[6], q8: answers[7],
        q9: answers[8], q10: answers[9], q11: answers[10], q12: answers[11],
        q13: typeof answers[12] === "string" && answers[12] !== "(skipped)" ? answers[12] : "",
      },
      department, year, batch,
      degree: degreeTrimmed,
      graduationYear,
      availableHoursPerWeek,
      consent: true,
    };
    submission.mutate({ data: payload }, {
      onSuccess: (accepted) => {
        draftClearedRef.current = true;
        try {
          localStorage.setItem("careerDiscoverySubmissionId", accepted.id);
          localStorage.removeItem(DRAFT_STORAGE_KEY);
        } catch {
          setDraftSaveError(true);
        }
        setSubmissionId(accepted.id);
        setLocation(`/student/status/${accepted.id}`);
      },
      onError: (err: unknown) => {
        const status = (err as { status?: number })?.status;
        if (status === 409) {
          setSubmitError("You already have an existing submission. Redirecting to your report...");
          setLocation("/student/status");
          return;
        }
        setSubmitError("We couldn't save your answers just now. Your responses are still on this screen—please try again.");
      },
    });
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;0,800;1,600;1,700&family=DM+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        html,body{background:var(--cp-bg, #F7F4EC);color:var(--cp-text, #171A15);}
        ::-webkit-scrollbar{width:6px;}
        ::-webkit-scrollbar-track{background:#EFECE3;}
        ::-webkit-scrollbar-thumb{background:#D9DED5;border-radius:3px;}
        .root{min-height:100vh;background:var(--cp-bg, #F7F4EC);font-family:var(--font-body, 'Plus Jakarta Sans', sans-serif);color:var(--cp-text, #171A15);position:relative;overflow-x:hidden;}
        .grain-overlay{position:fixed;inset:0;pointer-events:none;z-index:0;opacity:0.02;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23filter)'/%3E%3C/svg%3E");}
        .card{background:#FFFFFF;border:1px solid var(--cp-border-subtle, #E6EAE3);border-radius:18px;box-shadow:0 2px 8px rgba(23, 26, 21, 0.05);}
        .question-subtext{color:var(--cp-muted, #60665B);font-size:0.9rem;font-weight:400;line-height:1.6;margin-top:0.45rem;}
        .option-btn{width:100%;text-align:left;padding:0.9rem 1.15rem;border-radius:12px;border:1.5px solid var(--cp-border-subtle, #E6EAE3);background:#FFFFFF;color:var(--cp-text, #171A15);font-family:var(--font-body, 'Plus Jakarta Sans', sans-serif);font-size:0.9rem;cursor:pointer;transition:all 0.16s ease;display:flex;align-items:center;gap:0.75rem;box-shadow:0 1px 3px rgba(23, 26, 21, 0.04);}
        .option-btn:hover{background:#FBF9F2;border-color:var(--cp-border, #D9DED5);transform:translateY(-1px);}
        .option-btn.selected{border-color:var(--cp-primary, #E7B93F) !important;background:var(--cp-primary-soft, #FBF4DE) !important;color:#171A15 !important;font-weight:600;box-shadow:0 2px 8px rgba(231, 185, 63, 0.2);}
        .action-btn{padding:0.88rem 2.2rem;border-radius:50px;border:none;font-family:var(--font-body, 'Plus Jakarta Sans', sans-serif);font-size:0.9rem;font-weight:700;cursor:pointer;letter-spacing:0.02em;transition:all 0.2s ease;display:inline-flex;align-items:center;justify-content:center;gap:0.5rem;}
        .action-btn:disabled{opacity:0.35;cursor:not-allowed;}
        textarea{background:#FFFFFF;border:1.5px solid var(--cp-border, #D9DED5);border-radius:12px;color:var(--cp-text, #171A15);font-family:var(--font-body, 'Plus Jakarta Sans', sans-serif);font-size:0.9rem;padding:1rem;width:100%;resize:none;outline:none;transition:border-color 0.2s, box-shadow 0.2s;line-height:1.6;}
        textarea:focus{border-color:var(--cp-primary, #E7B93F);box-shadow:0 0 0 3px var(--cp-primary-soft, #FBF4DE);}
        textarea::placeholder{color:var(--cp-text-faint, #889082);}
        .chip{padding:0.5rem 1.2rem;border-radius:50px;border:1.5px solid var(--cp-border, #D9DED5);background:#FFFFFF;color:var(--cp-text-secondary, #3D4439);font-family:var(--font-body, 'Plus Jakarta Sans', sans-serif);font-size:0.82rem;cursor:pointer;transition:all 0.18s;box-shadow:0 1px 2px rgba(23, 26, 21, 0.04);}
        .chip:hover{border-color:var(--cp-primary, #E7B93F);background:#FBF9F2;}
        .chip.active{background:var(--cp-primary-soft, #FBF4DE);border-color:var(--cp-primary, #E7B93F);color:#7A510A;font-weight:600;}
        .tag{font-family:var(--font-mono, 'DM Mono', monospace);font-size:0.7rem;color:var(--cp-muted, #60665B);letter-spacing:0.1em;font-weight:600;}
      `}</style>

      <div className="root">
        <div className="grain-overlay" />
        {screen === "intro" && (
          <header className="home-topbar">
            <Brand />
            <div className="header-links">
              {isSignedIn ? (
                <Link href="/student/status" data-testid="link-student-status" className="button button-primary" style={{ padding: "8px 18px", fontSize: "12px" }}>
                  My Report
                </Link>
              ) : (
                <>
                  <Link href="/sign-in" data-testid="link-home-signin" style={{ color: "var(--cp-text, #171A15)", fontWeight: 600 }}>
                    Sign In
                  </Link>
                  <button
                    onClick={() => setScreen("quiz")}
                    data-testid="button-start-assessment-nav"
                    className="button button-primary"
                    style={{ padding: "8px 18px", fontSize: "12px" }}
                  >
                    Start Your Career Path
                  </button>
                </>
              )}
            </div>
          </header>
        )}

        {/* ── INTRO HERO (Source of Truth Brand Theme) ── */}
        {screen === "intro" && (
          <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "6.5rem 1.5rem 3rem", position: "relative", zIndex: 1, textAlign: "center" }}>
            <div style={{ maxWidth: 860, width: "100%", margin: "0 auto" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", marginBottom: "1.8rem" }}>
                <span style={{ color: "#E7B93F", fontSize: "12px" }}>•</span>
                <span className="tag" style={{ color: "#8F7220", letterSpacing: "0.14em" }}>THE LONGITUDINAL CAREER OPERATING SYSTEM</span>
              </div>

              <h1 style={{ fontFamily: "var(--font-display, 'Playfair Display', Georgia, serif)", fontSize: "clamp(2.4rem, 6.5vw, 4.2rem)", fontWeight: 800, lineHeight: 1.12, marginBottom: "1.5rem", letterSpacing: "-0.03em", color: "#171A15" }}>
                Career Pathfinder does not recommend careers.{" "}
                <em style={{ fontStyle: "italic", color: "#DFB235", fontWeight: 700 }}>It builds them.</em>
              </h1>

              <p style={{ color: "#60665B", fontSize: "clamp(1rem, 2vw, 1.15rem)", lineHeight: 1.7, marginBottom: "2.4rem", maxWidth: 660, marginLeft: "auto", marginRight: "auto" }}>
                Most career advice gives you a generic label and leaves you with guesswork. Career Pathfinder turns direction into an actionable, verifiable path from your first semester to placement readiness.
              </p>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "1rem", flexWrap: "wrap", marginBottom: "2rem" }}>
                <button
                  className="button button-primary"
                  onClick={() => setScreen("quiz")}
                  data-testid="button-start-assessment"
                  style={{ padding: "0.95rem 2.4rem", fontSize: "0.95rem", borderRadius: "9999px" }}
                >
                  Start Your Career Path →
                </button>
                <button
                  className="button button-subtle"
                  onClick={() => setScreen("quiz")}
                  style={{ padding: "0.95rem 2rem", fontSize: "0.95rem", borderRadius: "9999px" }}
                >
                  Explore How It Works
                </button>
              </div>

              <p style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "#889082", fontSize: "0.82rem", fontFamily: "var(--font-mono, 'DM Mono', monospace)" }}>
                <span style={{ color: "#DFB235" }}>✦</span> From uncertainty to a career you can prove.
              </p>

              <div style={{ marginTop: "3.5rem", paddingTop: "2.5rem", borderTop: "1px solid var(--cp-border-subtle, #E6EAE3)" }}>
                <p className="tag" style={{ marginBottom: "1rem", color: "#889082" }}>BUILT FOR HITAM UNDERGRADUATES · 13 PRACTICAL QUESTIONS · SAVED ON THIS DEVICE</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", justifyContent: "center" }}>
                  {["Software Engineering", "Cloud & DevOps", "Data Science & Analytics", "Product & Strategy", "AI & Automation", "UX/UI Design", "Cybersecurity", "Operations & Projects"].map((f) => (
                    <span key={f} style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "0.72rem", color: "#3D4439", background: "#FFFFFF", border: "1px solid var(--cp-border, #D9DED5)", borderRadius: "50px", padding: "0.35rem 0.9rem", boxShadow: "0 1px 2px rgba(23, 26, 21, 0.04)" }}>{f}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── QUIZ ── */}
        {screen === "quiz" && q && (
          <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", position: "relative", zIndex: 1, background: "var(--cp-bg, #F7F4EC)" }}>
            <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100 }}>
              <div style={{ height: "4px", background: "#EFECE3" }}>
                <div style={{ height: "100%", width: `${progress}%`, background: "var(--cp-primary, #E7B93F)", transition: "width 0.4s ease", borderRadius: "0 2px 2px 0" }} />
              </div>
              <div style={{ background: "rgba(247, 244, 236, 0.94)", backdropFilter: "blur(12px)", padding: "0.8rem 1.8rem", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--cp-border-subtle, #E6EAE3)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#E7B93F", display: "inline-block" }} />
                  <span className="tag" style={{ color: "#8F7220" }}>{q.section.toUpperCase()}</span>
                </div>
                <span className="tag" style={{ color: "#60665B" }}>{currentQ + 1} / {QUESTIONS.length}</span>
              </div>
            </div>

            <div style={{ flex: 1, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "5.8rem 1rem 7rem", overflowY: "auto" }}>
              <div key={currentQ} style={{ maxWidth: 580, width: "100%", animation: "slideIn 0.28s ease forwards" }}>
                <style>{`@keyframes slideIn{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:translateY(0);}}`}</style>

                {hasSavedDraftAnswers && (
                  <div
                    className="draft-resume-banner"
                    data-testid="draft-resume-banner"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: "0.75rem",
                      background: "#FFFDF8",
                      border: "1px solid var(--cp-border, #D9DED5)",
                      borderLeft: "4px solid var(--cp-primary, #E7B93F)",
                      borderRadius: "12px",
                      padding: "0.75rem 1rem",
                      marginBottom: "1rem",
                      fontSize: "0.85rem",
                      color: "var(--cp-text, #171A15)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <Clock3 size={15} style={{ color: "#8F7220", flexShrink: 0 }} />
                      <span>
                        Resuming saved answers (Question {currentQ + 1} of {QUESTIONS.length})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleRestartFromQuestion1}
                      className="quiet-link"
                      style={{
                        fontSize: "0.8rem",
                        color: "#8F7220",
                        fontWeight: 600,
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        textDecoration: "underline",
                        padding: "2px 6px",
                      }}
                      data-testid="button-restart-assessment"
                    >
                      Restart from Question 1
                    </button>
                  </div>
                )}

                <div className="card" style={{ padding: "clamp(22px, 4vw, 32px)", marginBottom: "1.2rem" }}>
                  <div style={{ display: "flex", gap: "0.35rem", marginBottom: "1.2rem" }}>
                    {SECTIONS.map((s, i) => (
                      <div key={s} style={{ flex: 1, height: "3px", borderRadius: 2, background: i <= sectionIndex ? "#E7B93F" : "#EFECE3", transition: "background 0.4s ease" }} />
                    ))}
                  </div>
                  <h2 style={{ fontFamily: "var(--font-display, 'Playfair Display', Georgia, serif)", fontSize: "clamp(1.25rem, 3.8vw, 1.65rem)", fontWeight: 700, lineHeight: 1.3, marginBottom: "0.4rem", letterSpacing: "-0.015em", color: "#171A15" }}>{q.question}</h2>
                  {q.subtext && <p className="question-subtext">{q.subtext}</p>}
                  {q.type === "multi" && <p className="tag" style={{ marginTop: "0.6rem", color: "#8F7220" }}>SELECT ALL THAT APPLY</p>}
                  {q.type === "multi3" && (
                    <p className="tag" style={{ marginTop: "0.6rem", color: Array.isArray(currentAnswer) && currentAnswer.length === 3 ? "#8F7220" : "#60665B" }}>
                      PICK UP TO 3 — {Array.isArray(currentAnswer) ? currentAnswer.length : 0}/3 SELECTED
                    </p>
                  )}
                </div>

                {q.type !== "text" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    {q.options!.map((opt) => {
                      const atLimit = q.type === "multi3" && Array.isArray(currentAnswer) && currentAnswer.length >= 3 && !isSelected(opt.label);
                      return (
                      <button
                        key={opt.label}
                        className={`option-btn ${isSelected(opt.label) ? "selected" : ""}`}
                        onClick={() => selectOption(opt.label)}
                        data-testid={`option-answer-${currentQ + 1}-${opt.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                        role={q.type === "single" ? "radio" : "checkbox"}
                        aria-checked={isSelected(opt.label)}
                        style={atLimit ? { opacity: 0.4, cursor: "not-allowed" } : {}}
                      >
                         <span className={`option-mark ${q.type === "single" ? "option-mark-radio" : "option-mark-check"} ${isSelected(opt.label) ? "is-selected" : ""}`} aria-hidden="true"><span /></span>
                        <span style={{ fontSize: "0.92rem", lineHeight: 1.45 }}>{opt.label}</span>
                        {isSelected(opt.label) && <span style={{ marginLeft: "auto", color: "#8F7220", fontSize: "0.85rem", fontWeight: 700 }}>✓</span>}
                      </button>
                      );
                    })}
                  </div>
                )}

                {q.type === "text" && (
                  <div className="card" style={{ padding: "20px" }}>
                    <label htmlFor="input-dream-work" className="sr-only">
                      {q.question}
                    </label>
                    <textarea
                      id="input-dream-work"
                      aria-label={q.question}
                      aria-describedby="q13-hint"
                      rows={5}
                      maxLength={2000}
                      placeholder={q.placeholder}
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      data-testid="input-dream-work"
                    />
                    <div id="q13-hint" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.6rem" }}>
                      <p className="tag">OPTIONAL — skip if you're unsure</p>
                      {textInput.length > 0 && (
                        <span className="tag" style={{ color: textInput.length >= 1900 ? "#C55B5B" : "#889082" }}>
                          {textInput.length} / 2000
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="quiz-footer" style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "rgba(247, 244, 236, 0.96)", backdropFilter: "blur(12px)", borderTop: "1px solid var(--cp-border-subtle, #E6EAE3)", padding: "0.9rem 1.6rem", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 100 }}>
              <button type="button" onClick={handleBack} className="quiz-back-btn" data-testid="button-quiz-back" aria-label="Back to previous question">
                ← Back
              </button>
              <span className="quiz-progress-note" role={draftSaveError ? "alert" : "status"}>
                {draftSaveError ? "Progress could not be saved. Keep this page open." : "Progress saved on this device"}
              </span>
              <button
                className={`button button-primary ${currentQ === QUESTIONS.length - 1 ? "final-step-button" : ""}`}
                onClick={handleNext}
                disabled={!canProceed()}
                data-testid="button-next-question"
                aria-label={currentQ === QUESTIONS.length - 1 ? "Build my profile and continue" : "Next question"}
                style={{
                  minWidth: currentQ === QUESTIONS.length - 1 ? "220px" : "120px",
                  padding: "0.85rem 1.8rem",
                  fontSize: "0.92rem",
                }}
              >
                {currentQ === QUESTIONS.length - 1 ? <>Build My Profile <ArrowRight size={18} /></> : "Next →"}
              </button>
            </div>
          </div>
        )}

        {screen === "result" && (
          <PageFrame>
            <header className="topbar"><Brand /><div className="topbar-right"><Link href="/sign-in" className="quiet-link" data-testid="link-sign-in">Student sign in</Link></div></header>
            <main className="submit-main enter" ref={resultRef}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
                <Link href="/" className="back-link" onClick={(event) => { event.preventDefault(); setScreen("quiz"); setCurrentQ(0); }} data-testid="link-review-answers">← Review your answers</Link>
                {hasSavedDraftAnswers && (
                  <button
                    type="button"
                    onClick={handleRestartFromQuestion1}
                    className="quiet-link"
                    style={{ fontSize: "0.82rem", color: "#8F7220", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
                    data-testid="button-restart-assessment-result"
                  >
                    Restart assessment
                  </button>
                )}
              </div>
              <div className="submit-heading">
                <span className="eyebrow">YOUR ANSWERS ARE READY · FINAL STEP</span>
                <h1 ref={resultHeadingRef} tabIndex={-1}>Your answers are ready. One last step.</h1>
                <p>{isSignedIn
                  ? "Add your HITAM details and consent to create your structured, practical career report. Your personal report stays private."
                  : "Sign in or create your student account to continue. Your answers are saved on this device while you do."}</p>
              </div>
              {!isSignedIn ? <div className="auth-required">
                <div className="auth-copy"><div className="auth-icon"><LockKeyhole size={19} /></div><div><h2>Sign in to save your report</h2><p>A student account keeps this report private and lets you return to it later.</p></div></div>
                <div className="embedded-auth">{authMode === "sign-in" ? <SignIn routing="hash" signUpUrl={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/sign-up`} /> : <SignUp routing="hash" signInUrl={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/sign-in`} />}</div>
                <p className="auth-switch">{authMode === "sign-in" ? <>New to Career Discovery? <button onClick={() => setAuthMode("sign-up")} data-testid="button-switch-to-signup">Create an account</button></> : <>Already have an account? <button onClick={() => setAuthMode("sign-in")} data-testid="button-switch-to-signin">Sign in</button></>}</p>
              </div> : <div className="submit-form-card">
                <div className="form-section-head"><span className="form-step">01</span><div><h2>Your HITAM details</h2><p>Used only to understand cohort-wide patterns with your consent.</p></div></div>
                <div className="student-fields">
                  <label>Department<select value={department} onChange={(e) => setDepartment(e.target.value)} data-testid="select-department"><option value="">Choose your department</option>{["Computer Science & Engineering", "CSE (AI & ML)", "CSE (Data Science)", "Electronics & Communication Engineering", "Electrical & Electronics Engineering", "Mechanical Engineering", "Civil Engineering", "Other"].map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                  <label>Academic year<select value={year} onChange={(e) => setYear(e.target.value)} data-testid="select-academic-year"><option value="">Choose your year</option>{["1st Year", "2nd Year", "3rd Year", "4th Year"].map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                  <label>Batch<select value={batch} onChange={(e) => setBatch(e.target.value)} data-testid="select-batch"><option value="">Choose your batch</option>{["2022–2026", "2023–2027", "2024–2028", "2025–2029", "Other"].map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                </div>
                <div className="form-section-head"><span className="form-step">02</span><div><h2>Your student context</h2><p>Three quick facts that help tailor guidance to your situation. Nothing here is shared beyond your private report.</p></div></div>
                <div className="student-fields student-context-fields">
                  <label>Your degree<input type="text" value={degree} onChange={(e) => setDegree(e.target.value)} placeholder="B.Tech Computer Science" maxLength={100} data-testid="input-degree" /><span className="field-hint">e.g. B.Tech CSE, BCA, B.Sc Mathematics</span></label>
                  <label>Expected graduation year<select value={graduationYear ?? ""} onChange={(e) => setGraduationYear(e.target.value === "" ? null : Number(e.target.value))} data-testid="select-graduation-year"><option value="">Choose graduation year</option>{graduationYearChoices.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                  <label>Weekly hours for career preparation<input type="number" value={availableHoursPerWeek ?? ""} min={1} max={60} step={1} inputMode="numeric" onChange={(e) => setAvailableHoursPerWeek(e.target.value === "" ? null : Number(e.target.value))} placeholder="10" data-testid="input-available-hours" /><span className="field-hint">Realistic focused hours per week, e.g. 10-15. Maximum 60.</span></label>
                </div>
                <label className="consent-row"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} data-testid="checkbox-consent" /><span><strong>I consent to my answers being used to create my report and included in institution-level cohort aggregates.</strong><small>Administrators see report-derived patterns for groups of at least five students—not your identity, raw answers, or individual report. Your personal report remains private.</small></span></label>
                {submitError && <div className="form-error" role="alert"><AlertCircle size={16} />{submitError}</div>}
                {health.isError && <div className="service-warning" role="status"><AlertCircle size={15} /><span>The report service isn’t responding. Your answers are still here—check again before submitting.</span><button type="button" onClick={() => health.refetch()} data-testid="button-check-report-service">Check again</button></div>}
                <button className="button button-primary submit-button" onClick={handleSubmitAssessment} disabled={!department || !year || !batch || !isStudentContextValid || !consent || submission.isPending || health.isError} data-testid="button-submit-assessment">
                  {submission.isPending ? "Saving your answers…" : <>Create my private report <Send size={16} /></>}
                </button>
                <p className="privacy-note"><LockKeyhole size={13} /> Your identity is never included in institution dashboard results.</p>
              </div>}
              <div className="answer-recap"><span><Check size={14} /> 13 answers saved on this device</span><span>About 5 minutes to complete</span></div>
            </main>
          </PageFrame>
        )}
      </div>
    </>
  );
}
