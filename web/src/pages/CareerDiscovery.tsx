import { useState, useRef, useEffect } from "react";
import { submitAssessment, healthCheck, type SubmissionInput } from "../api";
import { useAuth, SignIn, SignUp } from "@clerk/react";
import { Link, useLocation } from "wouter";
import { AlertCircle, ArrowRight, Check, LockKeyhole, Send } from "lucide-react";
import { Brand, PageFrame } from "../components/Brand";

type QuestionType = "single" | "multi" | "multi3" | "text";

interface Question {
  id: number;
  type: QuestionType;
  section: string;
  label: string;
  question: string;
  subtext: string;
  options?: Array<{ emoji: string; label: string }>;
  placeholder?: string;
}

const QUESTIONS: Question[] = [
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
const DRAFT_STORAGE_KEY = "careerDiscoveryDraftV1";

type AssessmentDraft = {
  version: 1;
  screen: "quiz" | "result";
  currentQ: number;
  answers: (string | string[] | null)[];
  textInput: string;
  department: string;
  year: string;
  batch: string;
  consent: boolean;
};

function readAssessmentDraft(): AssessmentDraft | null {
  try {
    const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!saved) return null;
    const draft: unknown = JSON.parse(saved);
    if (!draft || typeof draft !== "object") return null;
    const value = draft as Partial<AssessmentDraft>;
    if (
      value.version !== 1 ||
      (value.screen !== "quiz" && value.screen !== "result") ||
      !Number.isInteger(value.currentQ) ||
      (value.currentQ ?? -1) < 0 ||
      (value.currentQ ?? QUESTIONS.length) >= QUESTIONS.length ||
      !Array.isArray(value.answers) ||
      value.answers.length !== QUESTIONS.length ||
      !value.answers.every(
        (answer) =>
          answer === null ||
          typeof answer === "string" ||
          (Array.isArray(answer) &&
            answer.every((choice) => typeof choice === "string")),
      ) ||
      typeof value.textInput !== "string" ||
      typeof value.department !== "string" ||
      typeof value.year !== "string" ||
      typeof value.batch !== "string" ||
      typeof value.consent !== "boolean"
    ) {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      return null;
    }
    return value as AssessmentDraft;
  } catch {
    return null;
  }
}

const DEPARTMENTS = [
  "Computer Science & Engineering",
  "CSE (AI & ML)",
  "CSE (Data Science)",
  "Electronics & Communication Engineering",
  "Electrical & Electronics Engineering",
  "Mechanical Engineering",
  "Civil Engineering",
  "Other",
];
const YEARS = ["1st Year", "2nd Year", "3rd Year", "4th Year"];
const BATCHES = ["2022–2026", "2023–2027", "2024–2028", "2025–2029", "Other"];

function asSingle(value: string | string[] | null): string | null {
  if (typeof value !== "string") return null;
  return value === "(skipped)" ? null : value;
}

function asMulti(value: string | string[] | null): string[] {
  return Array.isArray(value) ? value : [];
}

export default function CareerDiscovery() {
  const [initialDraft] = useState(readAssessmentDraft);
  const [screen, setScreen] = useState<"intro" | "quiz" | "result">(initialDraft?.screen ?? "intro");
  const [currentQ, setCurrentQ] = useState(initialDraft?.currentQ ?? 0);
  const [answers, setAnswers] = useState<(string | string[] | null)[]>(initialDraft?.answers ?? Array(QUESTIONS.length).fill(null));
  const [textInput, setTextInput] = useState(initialDraft?.textInput ?? "");
  const [department, setDepartment] = useState(initialDraft?.department ?? "");
  const [year, setYear] = useState(initialDraft?.year ?? "");
  const [batch, setBatch] = useState(initialDraft?.batch ?? "");
  const [consent, setConsent] = useState(initialDraft?.consent ?? false);
  const [draftSaveError, setDraftSaveError] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [serviceDown, setServiceDown] = useState(false);
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up">("sign-in");
  const { isSignedIn } = useAuth();
  const [, setLocation] = useLocation();
  const resultRef = useRef<HTMLDivElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const draftClearedRef = useRef(false);

  useEffect(() => {
    if (screen === "intro" || draftClearedRef.current) return;
    try {
      const draft: AssessmentDraft = {
        version: 1, screen, currentQ, answers, textInput,
        department, year, batch, consent,
      };
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
      setDraftSaveError(false);
    } catch {
      setDraftSaveError(true);
    }
  }, [screen, currentQ, answers, textInput, department, year, batch, consent]);

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
        const cur = Array.isArray(next[currentQ]) ? [...(next[currentQ] as string[])] : [];
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

  // Ping the API when the submit screen opens so a dead backend is obvious.
  useEffect(() => {
    if (screen !== "result") return;
    let cancelled = false;
    healthCheck()
      .then(() => { if (!cancelled) setServiceDown(false); })
      .catch(() => { if (!cancelled) setServiceDown(true); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  function handleBack() {
    if (currentQ === 0) { setScreen("intro"); return; }
    const prevQ = QUESTIONS[currentQ - 1];
    setCurrentQ((p) => p - 1);
    if (prevQ.type === "text") {
      const prev = answers[currentQ - 1];
      setTextInput(typeof prev === "string" && prev !== "(skipped)" ? prev : "");
    }
  }

  async function handleSubmitAssessment() {
    setSubmitError("");
    const q13 = asSingle(answers[12]) ?? "";
    const payload: SubmissionInput = {
      answers: {
        q1: asSingle(answers[0]), q2: asMulti(answers[1]), q3: asMulti(answers[2]),
        q4: asMulti(answers[3]), q5: asSingle(answers[4]), q6: asMulti(answers[5]),
        q7: asMulti(answers[6]), q8: asMulti(answers[7]), q9: asMulti(answers[8]),
        q10: asMulti(answers[9]), q11: asMulti(answers[10]), q12: asSingle(answers[11]),
        q13,
      },
      department, year, batch, consent: true,
    };
    // Guard against incomplete drafts (e.g. restored partial state).
    if (
      !payload.answers.q1 || !payload.answers.q5 || !payload.answers.q12 ||
      [payload.answers.q2, payload.answers.q3, payload.answers.q4,
       payload.answers.q6, payload.answers.q7, payload.answers.q8,
       payload.answers.q9, payload.answers.q10, payload.answers.q11].some((a) => a.length === 0)
    ) {
      setSubmitError("Some answers are missing. Please go back and complete all 13 questions.");
      return;
    }
    setSubmitting(true);
    try {
      const accepted = await submitAssessment(payload);
      draftClearedRef.current = true;
      try {
        localStorage.setItem("careerDiscoverySubmissionId", accepted.id);
        localStorage.removeItem(DRAFT_STORAGE_KEY);
      } catch {
        setDraftSaveError(true);
      }
      setLocation(`/student/status/${accepted.id}`);
    } catch {
      setSubmitError("We couldn't save your answers just now. Your responses are still on this screen—please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@300;400;500&family=Plus+Jakarta+Sans:wght@300;400;500;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        html,body{background:#0e0c09;}
        ::-webkit-scrollbar{width:4px;}
        ::-webkit-scrollbar-track{background:#1a1710;}
        ::-webkit-scrollbar-thumb{background:#3a3520;border-radius:2px;}
        .root{min-height:100vh;background:#0e0c09;font-family:'Plus Jakarta Sans',sans-serif;color:#e8e0d0;position:relative;overflow-x:hidden;}
        .grain{position:fixed;inset:0;pointer-events:none;z-index:0;opacity:0.03;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23filter)'/%3E%3C/svg%3E");}
        .glow{position:fixed;width:500px;height:500px;border-radius:50%;filter:blur(130px);pointer-events:none;z-index:0;opacity:0.09;}
        .card{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:18px;}
        .question-subtext{color:#8a8070;font-size:0.8rem;font-weight:400;line-height:1.55;margin-top:0.45rem;}
        .option-btn{width:100%;text-align:left;padding:0.82rem 1.1rem;border-radius:12px;border:1.5px solid rgba(255,255,255,0.07);background:rgba(255,255,255,0.025);color:#b8b0a0;font-family:'Plus Jakarta Sans',sans-serif;font-size:0.86rem;cursor:pointer;transition:all 0.16s ease;display:flex;align-items:center;gap:0.7rem;}
        .option-btn:hover{background:rgba(255,255,255,0.06);border-color:rgba(255,255,255,0.18);color:#e8e0d0;transform:translateX(3px);}
        .option-btn.selected{border-color:#f5c842;background:rgba(245,200,66,0.1);color:#f0e8c0;}
        .option-btn.at-limit{opacity:0.3;cursor:not-allowed;}
        .action-btn{padding:0.88rem 2rem;border-radius:50px;border:none;font-family:'Syne',sans-serif;font-size:0.86rem;font-weight:700;cursor:pointer;letter-spacing:0.04em;transition:all 0.2s ease;display:flex;align-items:center;gap:0.5rem;}
        .action-btn:disabled{opacity:0.25;cursor:not-allowed;}
        textarea{background:rgba(255,255,255,0.04);border:1.5px solid rgba(255,255,255,0.08);border-radius:12px;color:#e8e0d0;font-family:'Plus Jakarta Sans',sans-serif;font-size:0.88rem;padding:1rem;width:100%;resize:none;outline:none;transition:border-color 0.2s;line-height:1.6;}
        textarea:focus{border-color:rgba(245,200,66,0.28);}
        textarea::placeholder{color:#3a3020;}
        .chip{padding:0.5rem 1.2rem;border-radius:50px;border:1.5px solid rgba(255,255,255,0.08);background:transparent;color:#6a6050;font-family:'Plus Jakarta Sans',sans-serif;font-size:0.8rem;cursor:pointer;transition:all 0.18s;}
        .chip:hover{border-color:rgba(255,255,255,0.18);color:#c8c0b0;}
        .chip.active{background:rgba(245,200,66,0.1);border-color:rgba(245,200,66,0.35);color:#f0e080;}
        .tag{font-family:'DM Mono',monospace;font-size:0.62rem;color:#3a3020;letter-spacing:0.1em;}
      `}</style>

      <div className="root">
        <div className="grain" />
        <div className="glow" style={{ background: "#f5c842", top: "-80px", right: "-80px" }} />
        <div className="glow" style={{ background: "#5bc4a0", bottom: "-80px", left: "-80px" }} />
        {screen === "intro" && <header className="home-topbar"><Brand /><div className="header-links">{isSignedIn ? <Link href="/student/status" data-testid="link-student-status">My report</Link> : <Link href="/sign-in" data-testid="link-home-signin">Student sign in</Link>}<Link href="/institution/dashboard" data-testid="link-institution-dashboard">Institution view</Link></div></header>}

        {screen === "intro" && (
          <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem", position: "relative", zIndex: 1 }}>
            <div style={{ maxWidth: 540, width: "100%", textAlign: "center" }}>
              <div style={{ display: "inline-block", background: "rgba(245,200,66,0.07)", border: "1px solid rgba(245,200,66,0.18)", borderRadius: "50px", padding: "0.38rem 1rem", marginBottom: "1.8rem" }}>
                <span className="tag" style={{ color: "#f5c842" }}>CAREER DISCOVERY · BETA</span>
              </div>
              <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: "clamp(1.9rem, 5.5vw, 3rem)", fontWeight: 800, lineHeight: 1.1, marginBottom: "1.1rem", letterSpacing: "-0.02em" }}>
                Find careers you've{" "}
                <span style={{ color: "#f5c842" }}>never heard of</span>
                {" "}that actually fit you.
              </h1>
              <p style={{ color: "#8f8777", fontSize: "0.88rem", lineHeight: 1.85, marginBottom: "2rem" }}>
                13 candid questions about how you think, work, and want to live. Get practical career direction—without forcing every answer toward software engineering.
              </p>
              <p className="tag" style={{ margin: "0 auto 2rem", color: "#9a907b" }}>ABOUT 5 MIN · 13 QUESTIONS · PROGRESS SAVES ON THIS DEVICE</p>
              <button className="action-btn" onClick={() => setScreen("quiz")} data-testid="button-start-assessment" style={{ background: "#f5c842", color: "#0e0c09", margin: "0 auto", padding: "1rem 2.8rem", fontSize: "0.92rem" }}>
                Begin your discovery →
              </button>
            </div>
          </div>
        )}

        {screen === "quiz" && q && (
          <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", position: "relative", zIndex: 1 }}>
            <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100 }}>
              <div style={{ height: "3px", background: "#1a1710" }}>
                <div style={{ height: "100%", width: `${progress}%`, background: accentColor, transition: "width 0.4s ease, background 0.6s ease", borderRadius: "0 2px 2px 0" }} />
              </div>
              <div style={{ background: "rgba(14,12,9,0.93)", backdropFilter: "blur(12px)", padding: "0.72rem 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: accentColor, display: "inline-block", transition: "background 0.6s" }} />
                  <span className="tag" style={{ color: accentColor, transition: "color 0.6s" }}>{q.section.toUpperCase()}</span>
                </div>
                <span className="tag">{currentQ + 1} / {QUESTIONS.length}</span>
              </div>
            </div>

            <div style={{ flex: 1, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "5.2rem 1rem 6.5rem", overflowY: "auto" }}>
              <div key={currentQ} style={{ maxWidth: 530, width: "100%" }}>
                <div style={{ marginBottom: "1.7rem" }}>
                  <div style={{ display: "flex", gap: "0.35rem", marginBottom: "1rem" }}>
                    {SECTIONS.map((s, i) => (
                      <div key={s} style={{ flex: 1, height: "2px", borderRadius: 1, background: i <= sectionIndex ? accentColor : "rgba(255,255,255,0.05)", transition: "background 0.6s" }} />
                    ))}
                  </div>
                  <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: "clamp(1.1rem, 3.8vw, 1.45rem)", fontWeight: 700, lineHeight: 1.3, marginBottom: "0.4rem", letterSpacing: "-0.01em" }}>{q.question}</h2>
                  {q.subtext && <p className="question-subtext">{q.subtext}</p>}
                  {q.type === "multi" && <p className="tag" style={{ marginTop: "0.5rem" }}>SELECT ALL THAT APPLY</p>}
                  {q.type === "multi3" && (
                    <p className="tag" style={{ marginTop: "0.5rem", color: Array.isArray(currentAnswer) && currentAnswer.length === 3 ? accentColor : "#3a3020" }}>
                      PICK UP TO 3 — {Array.isArray(currentAnswer) ? currentAnswer.length : 0}/3 SELECTED
                    </p>
                  )}
                </div>

                {q.type !== "text" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.42rem" }}>
                    {q.options!.map((opt) => {
                      const atLimit = q.type === "multi3" && Array.isArray(currentAnswer) && currentAnswer.length >= 3 && !isSelected(opt.label);
                      return (
                        <button
                          key={opt.label}
                          className={`option-btn${isSelected(opt.label) ? " selected" : ""}${atLimit ? " at-limit" : ""}`}
                          onClick={() => { if (!atLimit) selectOption(opt.label); }}
                          data-testid={`option-answer-${currentQ + 1}-${opt.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                        >
                          <span>{opt.emoji}</span>
                          <span>{opt.label}</span>
                          {isSelected(opt.label) && <span style={{ marginLeft: "auto", color: accentColor, fontSize: "0.72rem", fontWeight: 700 }}>✓</span>}
                        </button>
                      );
                    })}
                  </div>
                )}

                {q.type === "text" && (
                  <div>
                    <textarea aria-label={q.question} rows={4} placeholder={q.placeholder} value={textInput} onChange={(e) => setTextInput(e.target.value)} data-testid="input-dream-work" />
                    <p className="tag" style={{ marginTop: "0.5rem" }}>OPTIONAL — skip if you're unsure</p>
                  </div>
                )}
              </div>
            </div>

            <div className="quiz-footer" style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "rgba(14,12,9,0.97)", backdropFilter: "blur(12px)", borderTop: "1px solid rgba(255,255,255,0.08)", padding: "0.9rem 1.4rem", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 100 }}>
              <button onClick={handleBack} style={{ background: "transparent", border: "1.5px solid rgba(255,255,255,0.06)", color: "#8a8070", fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: "0.8rem", padding: "0.58rem 1.1rem", borderRadius: "50px", cursor: "pointer" }}>
                ← Back
              </button>
              <span className="quiz-progress-note" role={draftSaveError ? "alert" : "status"} style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.62rem", color: "#3a3020" }}>
                {draftSaveError ? "Progress could not be saved. Keep this page open." : "Progress saved on this device"}
              </span>
              <button
                className="action-btn"
                onClick={handleNext}
                disabled={!canProceed()}
                data-testid="button-next-question"
                style={{ background: canProceed() ? accentColor : "#181510", color: canProceed() ? "#0e0c09" : "#aaa18f" }}
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
              <button className="back-link" onClick={() => { setScreen("quiz"); setCurrentQ(12); }} data-testid="link-review-answers" style={{ background: "none", border: "none", cursor: "pointer" }}>← Review your answers</button>
              <div className="submit-heading">
                <span className="eyebrow">YOUR ANSWERS ARE READY · FINAL STEP</span>
                <h1 ref={resultHeadingRef} tabIndex={-1}>Your answers are ready. One last step.</h1>
                <p>{isSignedIn
                  ? "Add your details and consent to create your structured, practical career report. Your personal report stays private."
                  : "Sign in or create your student account to continue. Your answers are saved on this device while you do."}</p>
              </div>
              {!isSignedIn ? <div className="auth-required">
                <div className="auth-copy"><div className="auth-icon"><LockKeyhole size={19} /></div><div><h2>Sign in to save your report</h2><p>A student account keeps this report private and lets you return to it later.</p></div></div>
                <div className="embedded-auth">{authMode === "sign-in" ? <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" /> : <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" />}</div>
                <p className="auth-switch">{authMode === "sign-in" ? <>New here? <button onClick={() => setAuthMode("sign-up")} data-testid="button-switch-to-signup">Create an account</button></> : <>Already have an account? <button onClick={() => setAuthMode("sign-in")} data-testid="button-switch-to-signin">Sign in</button></>}</p>
              </div> : <div className="submit-form-card">
                <div className="form-section-head"><span className="form-step">01</span><div><h2>Your details</h2><p>Used only to understand cohort-wide patterns with your consent.</p></div></div>
                <div className="student-fields">
                  <label>Department<select value={department} onChange={(e) => setDepartment(e.target.value)} data-testid="select-department"><option value="">Choose your department</option>{DEPARTMENTS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                  <label>Academic year<select value={year} onChange={(e) => setYear(e.target.value)} data-testid="select-academic-year"><option value="">Choose your year</option>{YEARS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                  <label>Batch<select value={batch} onChange={(e) => setBatch(e.target.value)} data-testid="select-batch"><option value="">Choose your batch</option>{BATCHES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                </div>
                <label className="consent-row"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} data-testid="checkbox-consent" /><span><strong>I consent to my answers being used to create my report and included in institution-level cohort aggregates.</strong><small>Administrators see report-derived patterns for groups of at least five students—not your identity, raw answers, or individual report. Your personal report remains private.</small></span></label>
                {submitError && <div className="form-error" role="alert"><AlertCircle size={16} />{submitError}</div>}
                {serviceDown && <div className="service-warning" role="status"><AlertCircle size={15} /><span>The report service isn’t responding. Your answers are still here—check again before submitting.</span></div>}
                <button className="button button-primary submit-button" onClick={handleSubmitAssessment} disabled={!department || !year || !batch || !consent || submitting || serviceDown} data-testid="button-submit-assessment">
                  {submitting ? "Saving your answers…" : <>Create my private report <Send size={16} /></>}
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
