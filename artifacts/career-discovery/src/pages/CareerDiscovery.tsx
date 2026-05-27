import { useState, useRef } from "react";

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
    id: 7, type: "multi", section: "Life & Environment",
    label: "Preferred work environment",
    question: "Which work environment actually sounds comfortable to you?",
    subtext: "Be real — your environment affects everything. Pick all that fit.",
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
    id: 9, type: "multi", section: "Life & Environment",
    label: "What success in their 20s looks like",
    question: "Which of these would make you feel genuinely successful in your 20s?",
    subtext: "Not what sounds good — what would actually feel good.",
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
    id: 10, type: "single", section: "Your Direction",
    label: "Most interesting area",
    question: "If you had to pick ONE area, which sounds most interesting?",
    subtext: "This is where hidden career paths start to appear.",
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
    id: 11, type: "multi", section: "Your Direction",
    label: "Life vision after 30s",
    question: "After your 30s, which kind of life sounds better?",
    subtext: "Your future pulls your career — not the other way around.",
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

const FIELDS = [
  "Software Engineer / Software Developer",
  "Cloud / DevOps / Security Engineer",
  "Data Analyst / Scientist / AI & ML Engineer",
  "Full Stack Developer",
  "VLSI / Semiconductor Engineer",
  "Embedded Systems / IoT Design Engineer",
  "EV / Power Systems / Automation Engineer",
  "Design / CAE / Manufacturing Engineer",
];

function buildMasterPrompt(answers: (string | string[] | null)[], userType: string | null) {
  const role = userType === "student" ? "student" : userType === "employee" ? "working professional" : userType === "switcher" ? "career switcher" : "person";

  const fmt = (ans: string | string[] | null) => {
    if (!ans || (Array.isArray(ans) && ans.length === 0) || ans === "(skipped)") return "(not answered)";
    return Array.isArray(ans) ? ans.join(" | ") : ans;
  };

  return `You are a senior career strategist and futurist. A ${role} has completed a 13-question career discovery assessment. Analyze their complete profile carefully and generate a structured, honest career report.

━━━ THEIR COMPLETE PROFILE ━━━

[ WHO THEY ARE ]
What drives their satisfaction → ${fmt(answers[0])}
Natural role in teams → ${fmt(answers[1])}
What they naturally spend time on → ${fmt(answers[2])}

[ WORK STYLE ]
Tasks that drain them less → ${fmt(answers[3])}
Coding comfort level → ${fmt(answers[4])}
How they learn best → ${fmt(answers[5])}

[ LIFE & ENVIRONMENT ]
Preferred work environment → ${fmt(answers[6])}
Things that drain them quickly → ${fmt(answers[7])}
What success in their 20s looks like → ${fmt(answers[8])}

[ DIRECTION ]
Most interesting area → ${fmt(answers[9])}
Life vision after 30s → ${fmt(answers[10])}
Continuous learning comfort → ${fmt(answers[11])}

[ THE REAL THEM ]
Dream work with no judgment → ${fmt(answers[12])}

━━━ GENERATE THIS EXACT REPORT ━━━

## SECTION 1 — PROFILE SNAPSHOT
**Archetype:** Give them a 2-3 word title (e.g. "The Curious Builder", "The Strategic Communicator")
**Summary:** 2 sentences on who they are professionally, based strictly on their answers.
**Clarity Level:** Clear / Mixed / Exploratory — one sentence explaining WHY.

## SECTION 2 — TRAIT RATINGS
Rate each trait 1-5 based strictly on their answers. Use filled blocks █ and empty blocks ░ out of 5. Add a Low/Medium/High label and one sentence pulled from their actual answers explaining the rating.

**Technical Inclination** [█░ blocks] Low/Medium/High — reason from their answers
**Creative Drive** [█░ blocks] Low/Medium/High — reason from their answers
**People Orientation** [█░ blocks] Low/Medium/High — reason from their answers
**Risk Appetite** [█░ blocks] Low/Medium/High — reason from their answers
**Learning Agility** [█░ blocks] Low/Medium/High — reason from their answers

## SECTION 3 — SIGNAL READING
✅ **Strong signals** → What shows up consistently across multiple answers (be specific, name the answers)
⚠️ **Mixed signals** → Where answers conflict or create tension — be honest, not diplomatic.
🔍 **Worth exploring** → Areas their answers hint at but they haven't consciously considered yet

## SECTION 4 — CAREER RECOMMENDATIONS
Give 4-6 career recommendations. For each:

**[Career Title]**
→ **What they do:** 1-2 sentences, zero jargon, day-to-day reality only
→ **Why it fits you:** Directly reference 2-3 of their specific answers — make the connection explicit
→ **Automation risk:** Low / Medium / High — one line reason
→ **Start here:** Specific 3-month action plan with actual tools, platforms, or first steps

CRITICAL RULES:
- Prioritize emerging and lesser-known roles first: AI Workflow Engineer, RevOps Specialist, Solutions Engineer, CRM Consultant, Technical Consultant, Product Analyst, Business Systems Analyst, Growth Analyst, Customer Success Engineer, SOC Analyst, ERP Consultant, Prompt Engineer, AI Evaluator, Data Engineer, DevOps Engineer, Cloud Engineer, Technical Writer, AI Automation Consultant
- Only recommend commonly suggested careers if MULTIPLE answers clearly and consistently point to it.
- Every recommendation must feel personally written for this person — not copy-pasted from a generic career guide.

## SECTION 5 — ONE CAREER TO AVOID
**[Career Title]**
**Why:** Connect directly to their specific drain triggers and answers — not generic reasons.

## SECTION 6 — YOUR BEST-FIT ENGINEERING / TECH DOMAIN

Based strictly on everything in their profile above, pick exactly ONE domain from this list that fits them best:
${FIELDS.map((f, i) => `${i + 1}. ${f}`).join("\n")}

**Recommended Domain:** [Pick exactly one from the list above]

**Why this domain fits you:**
Write 3-4 sentences that directly connect their answers to this domain. Name the specific answers that point here. Be honest — if it's a moderate fit rather than a perfect fit, say so clearly.

**As a fresher, here are the entry-level jobs you can get:**
List 5-7 specific job titles a fresher can realistically get hired for in this domain immediately after completing relevant courses or a degree. For each role:
→ **[Job Title]** — What you actually do on day 1, typical starting salary range (India / global), and one platform or company type where freshers commonly get hired.

**What to learn to get there:**
List 4-6 specific skills, tools, or certifications a fresher should focus on to break into this domain (be specific — name the exact tool, language, or cert, not just "programming skills").

## SECTION 7 — HONEST MENTOR MESSAGE
2-3 sentences. Real talk — like a mentor who genuinely cares, not a motivational poster. Address their specific clarity level, the tension in their answers if any, and what they should actually do in the next 30 days.

━━━ STYLE RULES ━━━
- Write like a sharp mentor, not an HR document or career website
- Be specific — reference their actual answers throughout, not vague generalizations
- Be honest about mixed signals — confusion is useful data, not a problem to hide
- Zero corporate buzzwords or motivational fluff
- Every section must feel written for THIS specific person`;
}

export default function CareerDiscovery() {
  const [screen, setScreen] = useState<"intro" | "quiz" | "result">("intro");
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<(string | string[] | null)[]>(Array(QUESTIONS.length).fill(null));
  const [textInput, setTextInput] = useState("");
  const [masterPrompt, setMasterPrompt] = useState("");
  const [copied, setCopied] = useState(false);
  const [userType, setUserType] = useState<string | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

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
        next[currentQ] = cur.includes(label) ? cur.filter((x) => x !== label) : [...cur, label];
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
    if (q.type === "multi") return Array.isArray(currentAnswer) && currentAnswer.length > 0;
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
      const prompt = buildMasterPrompt(finalAnswers, userType);
      setMasterPrompt(prompt);
      setScreen("result");
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }

  function handleBack() {
    if (currentQ === 0) { setScreen("intro"); return; }
    const prevQ = QUESTIONS[currentQ - 1];
    setCurrentQ((p) => p - 1);
    if (prevQ.type === "text") {
      const prev = answers[currentQ - 1];
      setTextInput(typeof prev === "string" && prev !== "(skipped)" ? prev : "");
    }
  }

  function handleCopy() {
    navigator.clipboard?.writeText(masterPrompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  function handleRetake() {
    setScreen("intro");
    setCurrentQ(0);
    setAnswers(Array(QUESTIONS.length).fill(null));
    setMasterPrompt("");
    setTextInput("");
    setUserType(null);
    setCopied(false);
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
        .option-btn{width:100%;text-align:left;padding:0.82rem 1.1rem;border-radius:12px;border:1.5px solid rgba(255,255,255,0.07);background:rgba(255,255,255,0.025);color:#b8b0a0;font-family:'Plus Jakarta Sans',sans-serif;font-size:0.86rem;cursor:pointer;transition:all 0.16s ease;display:flex;align-items:center;gap:0.7rem;}
        .option-btn:hover{background:rgba(255,255,255,0.06);border-color:rgba(255,255,255,0.18);color:#e8e0d0;transform:translateX(3px);}
        .action-btn{padding:0.88rem 2rem;border-radius:50px;border:none;font-family:'Syne',sans-serif;font-size:0.86rem;font-weight:700;cursor:pointer;letter-spacing:0.04em;transition:all 0.2s ease;display:flex;align-items:center;gap:0.5rem;}
        .action-btn:disabled{opacity:0.25;cursor:not-allowed;}
        textarea{background:rgba(255,255,255,0.04);border:1.5px solid rgba(255,255,255,0.08);border-radius:12px;color:#e8e0d0;font-family:'Plus Jakarta Sans',sans-serif;font-size:0.88rem;padding:1rem;width:100%;resize:none;outline:none;transition:border-color 0.2s;line-height:1.6;}
        textarea:focus{border-color:rgba(245,200,66,0.3);}
        textarea::placeholder{color:#3a3020;}
        .prompt-box{background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.07);border-radius:14px;color:#8a8070;font-family:'DM Mono',monospace;font-size:0.73rem;line-height:1.8;padding:1.2rem;width:100%;overflow-y:auto;max-height:320px;white-space:pre-wrap;word-break:break-word;user-select:text;}
        .chip{padding:0.5rem 1.2rem;border-radius:50px;border:1.5px solid rgba(255,255,255,0.08);background:transparent;color:#6a6050;font-family:'Plus Jakarta Sans',sans-serif;font-size:0.8rem;cursor:pointer;transition:all 0.18s;}
        .chip:hover{border-color:rgba(255,255,255,0.18);color:#c8c0b0;}
        .chip.active{background:rgba(245,200,66,0.1);border-color:rgba(245,200,66,0.35);color:#f0e080;}
        .step-num{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:'DM Mono',monospace;font-size:0.68rem;flex-shrink:0;}
        .tag{font-family:'DM Mono',monospace;font-size:0.62rem;color:#3a3020;letter-spacing:0.1em;}
      `}</style>

      <div className="root">
        <div className="grain" />
        <div className="glow" style={{ background: "#f5c842", top: "-80px", right: "-80px" }} />
        <div className="glow" style={{ background: "#5bc4a0", bottom: "-80px", left: "-80px" }} />

        {/* ── INTRO ── */}
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

              <p style={{ color: "#4a4030", fontSize: "0.88rem", lineHeight: 1.85, marginBottom: "2rem" }}>
                13 questions about who you actually are. We build a detailed profile and generate a prompt — paste it into Claude.ai for your full personalized report including your best-fit engineering domain, why it suits you, and which jobs you can get as a fresher.
              </p>

              <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "2.2rem" }}>
                {[{ id: "student", label: "🎓 Student" }, { id: "employee", label: "💼 Working" }, { id: "switcher", label: "🔄 Switching careers" }].map((u) => (
                  <button key={u.id} className={`chip ${userType === u.id ? "active" : ""}`} onClick={() => setUserType(u.id)}>{u.label}</button>
                ))}
              </div>

              <button className="action-btn" onClick={() => setScreen("quiz")} style={{ background: "#f5c842", color: "#0e0c09", margin: "0 auto", padding: "1rem 2.8rem", fontSize: "0.92rem" }}>
                Start Discovery →
              </button>

              <p className="tag" style={{ marginTop: "1.1rem" }}>~5 MIN · 13 QUESTIONS · FREE · NO ACCOUNT NEEDED</p>

              <div style={{ marginTop: "2.5rem" }}>
                <p className="tag" style={{ marginBottom: "0.75rem", color: "#2a2010" }}>AI WILL MATCH YOU TO ONE OF THESE DOMAINS</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", justifyContent: "center" }}>
                  {["Software Engineering", "Cloud / DevOps", "Data / AI & ML", "Full Stack", "VLSI / Semiconductor", "Embedded / IoT", "EV / Power Systems", "Design / CAE / Mfg"].map((f) => (
                    <span key={f} style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.62rem", color: "#2a2010", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: "50px", padding: "0.22rem 0.65rem" }}>{f}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── QUIZ ── */}
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
              <div key={currentQ} style={{ maxWidth: 530, width: "100%", animation: "slideIn 0.28s ease forwards" }}>
                <style>{`@keyframes slideIn{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:translateY(0);}}`}</style>

                <div style={{ marginBottom: "1.7rem" }}>
                  <div style={{ display: "flex", gap: "0.35rem", marginBottom: "1rem" }}>
                    {SECTIONS.map((s, i) => (
                      <div key={s} style={{ flex: 1, height: "2px", borderRadius: 1, background: i <= sectionIndex ? accentColor : "rgba(255,255,255,0.05)", transition: "background 0.6s" }} />
                    ))}
                  </div>
                  <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: "clamp(1.1rem, 3.8vw, 1.45rem)", fontWeight: 700, lineHeight: 1.3, marginBottom: "0.4rem", letterSpacing: "-0.01em" }}>{q.question}</h2>
                  {q.subtext && <p style={{ color: "#3a3020", fontSize: "0.78rem", fontStyle: "italic" }}>{q.subtext}</p>}
                  {q.type === "multi" && <p className="tag" style={{ marginTop: "0.5rem" }}>SELECT ALL THAT APPLY</p>}
                </div>

                {q.type !== "text" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.42rem" }}>
                    {q.options!.map((opt) => (
                      <button
                        key={opt.label}
                        className="option-btn"
                        onClick={() => selectOption(opt.label)}
                        style={isSelected(opt.label) ? { borderColor: `${accentColor}65`, background: `${accentColor}12`, color: "#f0e8c0" } : {}}
                      >
                        <span style={{ fontSize: "0.98rem", flexShrink: 0 }}>{opt.emoji}</span>
                        <span>{opt.label}</span>
                        {isSelected(opt.label) && <span style={{ marginLeft: "auto", color: accentColor, fontSize: "0.72rem", fontWeight: 700 }}>✓</span>}
                      </button>
                    ))}
                  </div>
                )}

                {q.type === "text" && (
                  <div>
                    <textarea rows={4} placeholder={q.placeholder} value={textInput} onChange={(e) => setTextInput(e.target.value)} style={{ borderColor: textInput ? "rgba(245,200,66,0.28)" : undefined }} />
                    <p className="tag" style={{ marginTop: "0.5rem" }}>OPTIONAL — skip if you're unsure</p>
                  </div>
                )}
              </div>
            </div>

            <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "rgba(14,12,9,0.95)", backdropFilter: "blur(12px)", borderTop: "1px solid rgba(255,255,255,0.04)", padding: "0.9rem 1.4rem", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 100 }}>
              <button onClick={handleBack} style={{ background: "transparent", border: "1.5px solid rgba(255,255,255,0.06)", color: "#3a3020", fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: "0.8rem", padding: "0.58rem 1.1rem", borderRadius: "50px", cursor: "pointer" }}>
                ← Back
              </button>
              <button className="action-btn" onClick={handleNext} disabled={!canProceed()} style={{ background: canProceed() ? accentColor : "#181510", color: canProceed() ? "#0e0c09" : "#2a2010", transition: "all 0.3s ease" }}>
                {currentQ === QUESTIONS.length - 1 ? "Build My Profile →" : "Next →"}
              </button>
            </div>
          </div>
        )}

        {/* ── RESULT ── */}
        {screen === "result" && (
          <div style={{ minHeight: "100vh", position: "relative", zIndex: 1, padding: "2rem 1rem 5rem" }} ref={resultRef}>
            <div style={{ maxWidth: 640, margin: "0 auto" }}>

              <div style={{ textAlign: "center", marginBottom: "2.2rem", paddingTop: "0.5rem" }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", background: "rgba(91,196,160,0.07)", border: "1px solid rgba(91,196,160,0.18)", borderRadius: "50px", padding: "0.38rem 1rem", marginBottom: "1.1rem" }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#5bc4a0", display: "inline-block" }} />
                  <span className="tag" style={{ color: "#5bc4a0" }}>PROFILE PROMPT READY</span>
                </div>
                <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: "clamp(1.4rem, 4.5vw, 1.9rem)", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: "0.55rem" }}>Your career profile is built.</h1>
                <p style={{ color: "#4a4030", fontSize: "0.85rem", lineHeight: 1.75, maxWidth: 500, margin: "0 auto" }}>
                  Copy the prompt and paste it into Claude.ai. The AI will read your full profile and recommend your best-fit engineering domain, explain why, and list the exact fresher jobs you can land.
                </p>
              </div>

              {/* Steps */}
              <div className="card" style={{ padding: "1.3rem 1.5rem", marginBottom: "1rem" }}>
                <p className="tag" style={{ marginBottom: "1rem" }}>HOW TO USE THIS</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
                  {[
                    { n: "01", text: "Copy the prompt below", color: "#f5c842" },
                    { n: "02", text: "Open Claude.ai in a new tab", color: "#5bc4a0" },
                    { n: "03", text: "Start a new chat and paste it", color: "#7eb8f7" },
                    { n: "04", text: "Read your full personalized career report", color: "#e07af5" },
                  ].map(({ n, text, color }) => (
                    <div key={n} style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
                      <div className="step-num" style={{ background: `${color}15`, border: `1px solid ${color}35`, color }}>{n}</div>
                      <span style={{ color: "#7a7060", fontSize: "0.84rem" }}>{text}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Prompt */}
              <div style={{ marginBottom: "1rem" }}>
                <p className="tag" style={{ marginBottom: "0.55rem" }}>YOUR MASTER PROMPT</p>
                <div className="prompt-box">{masterPrompt}</div>
              </div>

              {/* Buttons */}
              <div style={{ display: "flex", gap: "0.7rem", flexWrap: "wrap", marginBottom: "1.2rem" }}>
                <button className="action-btn" onClick={handleCopy} style={{ background: copied ? "#5bc4a0" : "#f5c842", color: "#0e0c09", flex: 1, justifyContent: "center", minWidth: 140 }}>
                  {copied ? "✓ Copied!" : "📋 Copy Prompt"}
                </button>
                <button className="action-btn" onClick={() => window.open("https://claude.ai", "_blank")} style={{ background: "rgba(255,255,255,0.04)", border: "1.5px solid rgba(255,255,255,0.09)", color: "#b0a890", flex: 1, justifyContent: "center", minWidth: 140 }}>
                  Open Claude.ai ↗
                </button>
              </div>

              {/* What you'll get */}
              <div className="card" style={{ padding: "1.3rem 1.5rem" }}>
                <p className="tag" style={{ marginBottom: "0.9rem" }}>WHAT YOUR REPORT WILL INCLUDE</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
                  {[
                    ["🏷️", "Career Archetype + Clarity Level", "Your professional identity and how clear your signals are"],
                    ["📊", "Trait Ratings", "5 dimensions rated from your actual answers with █░ bars"],
                    ["🔍", "Signal Reading", "Strong signals, mixed signals, and unexplored areas — honestly"],
                    ["🗺️", "Career Recommendations", "4-6 roles, each justified by your specific answers"],
                    ["⚡", "Your Best-Fit Engineering Domain", "AI picks one domain from 8, explains why it fits, and lists fresher jobs you can get"],
                    ["⚠️", "One Career to Avoid", "Based directly on your drain triggers"],
                    ["💬", "Honest Mentor Message", "Real talk — not a motivational poster"],
                  ].map(([emoji, title, desc]) => (
                    <div key={title} style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                      <span style={{ fontSize: "0.9rem", flexShrink: 0, marginTop: "0.1rem" }}>{emoji}</span>
                      <div>
                        <span style={{ color: "#d0c8b8", fontSize: "0.82rem", fontWeight: 600 }}>{title}</span>
                        <span style={{ color: "#3a3020", fontSize: "0.8rem" }}> — {desc}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ textAlign: "center", marginTop: "1.8rem" }}>
                <button onClick={handleRetake} style={{ background: "transparent", border: "none", color: "#2a2010", fontFamily: "'DM Mono', monospace", fontSize: "0.68rem", cursor: "pointer", letterSpacing: "0.06em" }}>
                  ← Retake quiz
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
