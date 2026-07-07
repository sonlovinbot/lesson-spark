import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BADGES,
  type Lesson,
  type MatchPair,
  type QuizItem,
  type TFItem,
  type VocabItem,
} from "@/lib/lesson-types";
import { authHeaders, useApiKey } from "@/lib/settings";
import { useTheme, type Theme } from "@/lib/theme";
import { useProgress } from "@/lib/progress";
import { useAuth } from "@/lib/auth";
import { useLessonHistory, type LessonRecord } from "@/lib/lessons";
import { XP, QUESTS, xpToLevel, levelTitle } from "@/lib/scoring";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: LumiApp,
});

/* ---------------- Root ---------------- */
function LumiApp() {
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"cards" | "match" | "tf" | "wheel" | "fill" | "quiz">("cards");

  const [progress, setProgress] = useProgress();
  const { theme, setTheme, isDark } = useTheme();
  const { user, signOut } = useAuth();
  const history = useLessonHistory();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [authGateOpen, setAuthGateOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [xpBurst, setXpBurst] = useState<{ id: number; amount: number } | null>(null);
  const [levelUp, setLevelUp] = useState<number | null>(null);
  const [confetti, setConfetti] = useState(false);
  const prevLevel = useRef(xpToLevel(progress.xp).level);

  const { level, into, need } = xpToLevel(progress.xp);
  useEffect(() => {
    if (level > prevLevel.current) {
      setLevelUp(level);
      setConfetti(true);
      window.setTimeout(() => setLevelUp(null), 2200);
      window.setTimeout(() => setConfetti(false), 2400);
    }
    prevLevel.current = level;
  }, [level]);

  // Gate any API-calling action behind login. Returns true if allowed.
  const requireAuth = useCallback(() => {
    if (user) return true;
    setAuthGateOpen(true);
    return false;
  }, [user]);

  const addXP = useCallback((amount: number) => {
    if (amount <= 0) return;
    const today = new Date().toISOString().slice(0, 10);
    setProgress((prev) => {
      const newBadges = new Set(prev.badges);
      const newXp = prev.xp + amount;
      // Streak logic
      let streak = prev.streak;
      if (prev.lastActive !== today) {
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        streak = prev.lastActive === yesterday ? prev.streak + 1 : 1;
      }
      // Auto-award XP-threshold badges
      BADGES.forEach((b) => {
        if (b.xp > 0 && newXp >= b.xp) newBadges.add(b.id);
      });
      if (streak >= 3) newBadges.add("streak3");
      if (newXp > 0) newBadges.add("first");
      return { ...prev, xp: newXp, streak, lastActive: today, badges: Array.from(newBadges) };
    });
    setXpBurst({ id: Date.now(), amount });
    window.setTimeout(() => setXpBurst(null), 900);
  }, [setProgress]);

  // Mark a daily quest complete once its milestone is reached.
  const completeQuest = useCallback((id: string) => {
    setProgress((prev) =>
      prev.quests.some((q) => q.id === id && !q.done)
        ? { ...prev, quests: prev.quests.map((q) => (q.id === id ? { ...q, done: true } : q)) }
        : prev,
    );
  }, [setProgress]);

  const awardBadge = useCallback((id: string) => {
    setProgress((prev) =>
      prev.badges.includes(id) ? prev : { ...prev, badges: [...prev.badges, id] },
    );
  }, [setProgress]);

  async function generateLesson() {
    if (!requireAuth()) return;
    if (!source.trim()) {
      setErr("Paste some text or a topic first.");
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ source }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      const newLesson = json.lesson as Lesson;
      setLesson(newLesson);
      setTab("cards");
      void history.save(newLesson, source); // persist to history
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  // Reload a saved lesson from history.
  function openSaved(rec: LessonRecord) {
    setLesson(rec.data);
    setSource(rec.source ?? "");
    setTab("cards");
    setHistoryOpen(false);
    setErr(null);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setSource(text.slice(0, 15000));
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
      <TopBar level={level} into={into} need={need} xp={progress.xp} streak={progress.streak} isDark={isDark} onToggleTheme={() => setTheme(isDark ? "light" : "dark")} onSettings={() => setSettingsOpen(true)} onHistory={() => { if (requireAuth()) setHistoryOpen(true); }} userEmail={user?.email ?? null} onSignOut={signOut} />

      {/* Uploader */}
      <section className="glass-card mt-6 p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl md:text-4xl">Turn any text into a lesson ✨</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Paste a paragraph, article, or topic — Lumi builds vocabulary, quizzes & games instantly.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { if (requireAuth()) setHistoryOpen(true); }}
              className="chip hover:bg-white"
              title="Your saved lessons"
            >
              📚 History
            </button>
            <label className="chip cursor-pointer hover:bg-white">
              📎 Upload .txt
              <input type="file" accept=".txt,.md,text/plain" className="hidden" onChange={onFile} />
            </label>
          </div>
        </div>
        <textarea
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="Paste a topic or paragraph here (e.g., 'Airport check-in vocabulary')..."
          className="mt-4 h-28 w-full resize-none rounded-2xl border border-border bg-white/70 p-4 text-sm outline-none focus:border-primary"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={generateLesson}
            disabled={loading}
            className="rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-[var(--shadow-pop)] transition hover:-translate-y-0.5 disabled:opacity-60"
          >
            {loading ? "Generating…" : "✨ Generate lesson"}
          </button>
          {err && <span className="text-sm text-destructive">⚠ {err}</span>}
          <span className="ml-auto text-xs text-muted-foreground">
            Powered by Coachio · Gemini 3.1 Flash Lite
          </span>
        </div>
      </section>

      {/* Daily quests — always visible */}
      <section className="mt-6 flex justify-end">
        <DailyQuests quests={progress.quests} />
      </section>

      {lesson ? (
        <>
          {/* Lesson header */}
          <section className="mt-6">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="chip !bg-lavender/70">Level: {lesson.level}</span>
              <span className="chip !bg-mint/70">{lesson.vocabulary.length} words</span>
            </div>
            <h2 className="mt-2 text-3xl md:text-4xl">{lesson.title}</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{lesson.intro}</p>
          </section>

          {/* Tabs */}
          <nav className="mt-6 flex flex-wrap gap-2">
            {[
              ["cards", "🎴 Flashcards"],
              ["match", "🧩 Matching"],
              ["tf", "✅ True / False"],
              ["fill", "💬 Fill the blanks"],
              ["quiz", "❓ Quiz"],
              ["wheel", "🎡 Lucky Wheel"],
            ].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id as typeof tab)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  tab === id
                    ? "bg-primary text-primary-foreground shadow-[var(--shadow-pop)]"
                    : "bg-white/70 text-foreground hover:bg-white"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          <section className="mt-6">
            {tab === "cards" && <Flashcards items={lesson.vocabulary} onXP={addXP} onQuest={completeQuest} requireAuth={requireAuth} />}
            {tab === "match" && (
              <Matching pairs={lesson.matching} onXP={addXP} onComplete={() => { awardBadge("matchmaster"); addXP(XP.matchComplete); completeQuest("match"); }} />
            )}
            {tab === "tf" && <TrueFalse items={lesson.trueFalse} onXP={addXP} />}
            {tab === "fill" && <FillBlanks data={lesson.fillBlank} onXP={addXP} />}
            {tab === "quiz" && (
              <Quiz items={lesson.quiz} onXP={addXP} onQuest={completeQuest} onPerfect={() => { awardBadge("perfectquiz"); addXP(XP.quizPerfect); }} />
            )}
            {tab === "wheel" && <LuckyWheel prompts={lesson.wheelPrompts} onXP={addXP} />}
          </section>
        </>
      ) : (
        <EmptyState isAuthed={!!user} onGenerate={generateLesson} onLoginGate={() => setAuthGateOpen(true)} />
      )}

      <BadgeShelf badges={progress.badges} />

      <footer className="mt-12 pb-8 text-center text-xs text-muted-foreground">
        Made with 💗 for ESL learners.
      </footer>

      {/* Overlays */}
      {xpBurst && (
        <div
          key={xpBurst.id}
          className="pointer-events-none fixed left-1/2 top-24 z-50 -translate-x-1/2 animate-float-up rounded-full bg-success px-4 py-2 text-sm font-black text-success-foreground shadow-lg"
        >
          +{xpBurst.amount} XP
        </div>
      )}
      {levelUp && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
          <div className="animate-pop-in rounded-3xl bg-white/90 px-8 py-6 text-center shadow-2xl backdrop-blur">
            <div className="text-6xl">🎉</div>
            <div className="mt-2 text-xs uppercase tracking-widest text-muted-foreground">Level up</div>
            <div className="text-4xl font-black">Level {levelUp}</div>
          </div>
        </div>
      )}
      {confetti && <Confetti />}
      {settingsOpen && <SettingsPanel theme={theme} setTheme={setTheme} onClose={() => setSettingsOpen(false)} />}
      {authGateOpen && <AuthGateModal onClose={() => setAuthGateOpen(false)} />}
      {historyOpen && (
        <HistoryModal history={history} onOpen={openSaved} onClose={() => setHistoryOpen(false)} />
      )}
    </div>
  );
}

/* ---------------- Empty state (no lesson yet) ---------------- */
function EmptyState({ isAuthed, onGenerate, onLoginGate }: { isAuthed: boolean; onGenerate: () => void; onLoginGate: () => void }) {
  return (
    <section className="glass-card mt-6 flex flex-col items-center gap-4 p-10 text-center md:p-16">
      <div className="text-6xl">🪄</div>
      <h2 className="text-2xl md:text-3xl">No lesson yet</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        Paste a topic or paragraph above and tap <b>Generate lesson</b>. Lumi turns it into
        flashcards, quizzes, matching games and more.
      </p>
      {isAuthed ? (
        <button
          onClick={onGenerate}
          className="rounded-2xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-[var(--shadow-pop)] transition hover:-translate-y-0.5"
        >
          ✨ Generate your first lesson
        </button>
      ) : (
        <button
          onClick={onLoginGate}
          className="rounded-2xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-[var(--shadow-pop)] transition hover:-translate-y-0.5"
        >
          🔓 Log in to start
        </button>
      )}
    </section>
  );
}

/* ---------------- Login-required gate ---------------- */
function AuthGateModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="glass-card w-full max-w-sm animate-pop-in p-6 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="text-5xl">🔒</div>
        <h3 className="mt-3 text-2xl">Login required</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign in to generate lessons, create AI images, and save your progress across devices.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Link
            to="/login"
            className="rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-[var(--shadow-pop)] transition hover:-translate-y-0.5"
          >
            🔓 Log in
          </Link>
          <Link
            to="/register"
            className="rounded-2xl bg-secondary px-5 py-3 text-sm font-bold transition hover:-translate-y-0.5"
          >
            ✨ Sign up
          </Link>
        </div>
        <button onClick={onClose} className="mt-3 text-xs text-muted-foreground hover:underline">
          Maybe later
        </button>
      </div>
    </div>
  );
}

/* ---------------- Lesson history ---------------- */
function HistoryModal({
  history,
  onOpen,
  onClose,
}: {
  history: ReturnType<typeof useLessonHistory>;
  onOpen: (rec: LessonRecord) => void;
  onClose: () => void;
}) {
  const { items, loading, remove } = history;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass-card flex max-h-[80vh] w-full max-w-lg animate-pop-in flex-col p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-2xl">📚 Lesson history</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-xl bg-white/70 hover:bg-white"
          >
            ✕
          </button>
        </div>
        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : items.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No saved lessons yet. Generate one and it'll appear here.
          </div>
        ) : (
          <ul className="space-y-2 overflow-y-auto">
            {items.map((rec) => (
              <li
                key={rec.id}
                className="flex items-center gap-2 rounded-2xl bg-white/70 p-3"
              >
                <button onClick={() => onOpen(rec)} className="flex-1 text-left">
                  <div className="font-bold">{rec.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {rec.level ? `${rec.level} · ` : ""}
                    {rec.data.vocabulary?.length ?? 0} words ·{" "}
                    {new Date(rec.created_at).toLocaleDateString()}
                  </div>
                </button>
                <button
                  onClick={() => onOpen(rec)}
                  className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"
                >
                  Open
                </button>
                <button
                  onClick={() => remove(rec.id)}
                  title="Delete"
                  className="grid h-8 w-8 place-items-center rounded-xl bg-white/70 hover:bg-destructive/10"
                >
                  🗑
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ---------------- Top bar ---------------- */
function TopBar({ level, into, need, xp, streak, isDark, onToggleTheme, onSettings, onHistory, userEmail, onSignOut }: { level: number; into: number; need: number; xp: number; streak: number; isDark: boolean; onToggleTheme: () => void; onSettings: () => void; onHistory: () => void; userEmail: string | null; onSignOut: () => void }) {
  const pct = Math.min(100, Math.round((into / need) * 100));
  return (
    <header className="glass-card flex flex-col gap-3 p-4 md:flex-row md:items-center md:gap-6 md:p-5">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-primary to-accent text-lg font-black text-white shadow-md">
          L
        </div>
        <div>
          <div className="text-lg font-black leading-none">Lumi</div>
          <div className="text-[11px] text-muted-foreground">Play. Learn. Level up.</div>
        </div>
      </div>
      <div className="flex-1">
        <div className="mb-1 flex items-center justify-between text-xs font-semibold">
          <span>Level {level} · {levelTitle(level)}</span>
          <span className="text-muted-foreground">{into} / {need} XP</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary via-lavender to-accent transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="chip !bg-peach">🔥 {streak}d</span>
        <span className="chip !bg-lemon">⚡ {xp} XP</span>
        <button
          onClick={onHistory}
          title="Lesson history"
          aria-label="Lesson history"
          className="grid h-9 w-9 place-items-center rounded-xl bg-white/70 text-lg transition hover:-translate-y-0.5 hover:bg-white"
        >
          📚
        </button>
        <button
          onClick={onToggleTheme}
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          aria-label="Toggle theme"
          className="grid h-9 w-9 place-items-center rounded-xl bg-white/70 text-lg transition hover:-translate-y-0.5 hover:bg-white"
        >
          {isDark ? "☀️" : "🌙"}
        </button>
        <button
          onClick={onSettings}
          title="Settings — API key"
          aria-label="Settings"
          className="grid h-9 w-9 place-items-center rounded-xl bg-white/70 text-lg transition hover:-translate-y-0.5 hover:bg-white"
        >
          ⚙️
        </button>
        {userEmail ? (
          <div className="flex items-center gap-2">
            <span className="chip !bg-mint/70 max-w-[140px] truncate" title={userEmail}>
              👤 {userEmail}
            </span>
            <button
              onClick={onSignOut}
              title="Sign out"
              className="rounded-xl bg-white/70 px-3 py-2 text-sm font-bold transition hover:-translate-y-0.5 hover:bg-white"
            >
              Log out
            </button>
          </div>
        ) : (
          <Link
            to="/login"
            className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-[var(--shadow-pop)] transition hover:-translate-y-0.5"
          >
            Log in
          </Link>
        )}
      </div>
    </header>
  );
}

/* ---------------- Settings (API key) ---------------- */
function SettingsPanel({ theme, setTheme, onClose }: { theme: Theme; setTheme: (t: Theme) => void; onClose: () => void }) {
  const { key, save } = useApiKey();
  const [draft, setDraft] = useState("");
  const [show, setShow] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => { setDraft(key); }, [key]);

  async function testKey() {
    const candidate = draft.trim();
    if (!candidate) {
      setResult({ ok: false, msg: "Enter a key first." });
      return;
    }
    setTesting(true);
    setResult(null);
    try {
      const res = await fetch("/api/test-key", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-coachio-key": candidate },
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setResult({ ok: true, msg: `Key works! Model: ${json.model ?? "ready"}` });
      } else {
        setResult({ ok: false, msg: json.error || `HTTP ${res.status}` });
      }
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setTesting(false);
    }
  }

  function onSave() {
    save(draft);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  }

  function onClear() {
    save("");
    setDraft("");
    setResult(null);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass-card max-h-[88vh] w-full max-w-md animate-pop-in overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-2xl">⚙️ Settings</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-xl bg-white/70 hover:bg-white"
          >
            ✕
          </button>
        </div>
        <ProfileSection />

        <label className="mt-4 block text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Appearance
        </label>
        <div className="mt-1 grid grid-cols-3 gap-2">
          {([
            ["light", "☀️ Light"],
            ["dark", "🌙 Dark"],
            ["system", "🖥 System"],
          ] as [Theme, string][]).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              className={`rounded-2xl px-3 py-2.5 text-sm font-bold transition ${
                theme === value
                  ? "bg-primary text-primary-foreground shadow-[var(--shadow-pop)]"
                  : "bg-white/70 text-foreground hover:bg-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="mt-4 block text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Coachio API key
        </label>
        <p className="mt-1 text-xs text-muted-foreground">
          Stored only in this browser (localStorage) and sent straight to the API.
        </p>
        <div className="mt-1 flex gap-2">
          <input
            type={show ? "text" : "password"}
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setResult(null); }}
            placeholder="sk-…"
            autoComplete="off"
            spellCheck={false}
            className="flex-1 rounded-2xl border border-border bg-white/70 px-4 py-3 text-sm outline-none focus:border-primary"
          />
          <button
            onClick={() => setShow((s) => !s)}
            className="chip !bg-lavender/70"
            title={show ? "Hide" : "Show"}
          >
            {show ? "🙈" : "👁"}
          </button>
        </div>

        {result && (
          <div
            className={`mt-3 rounded-2xl p-3 text-sm ${
              result.ok ? "bg-success/20 text-foreground" : "bg-destructive/10 text-destructive"
            }`}
          >
            {result.ok ? "✅ " : "⚠ "}{result.msg}
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            onClick={testKey}
            disabled={testing}
            className="rounded-2xl bg-sky px-4 py-3 text-sm font-bold text-sky-foreground transition hover:-translate-y-0.5 disabled:opacity-60"
          >
            {testing ? "Testing…" : "🧪 Test key"}
          </button>
          <button
            onClick={onSave}
            className="rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-[var(--shadow-pop)] transition hover:-translate-y-0.5"
          >
            {saved ? "✅ Saved" : "💾 Save"}
          </button>
          {key && (
            <button
              onClick={onClear}
              className="ml-auto rounded-2xl bg-secondary px-4 py-3 text-sm font-bold transition hover:-translate-y-0.5"
            >
              🗑 Clear
            </button>
          )}
        </div>

        <div className="mt-4 text-xs text-muted-foreground">
          {key ? "🔑 A key is currently saved in this browser." : "No key saved yet."}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Profile (inside Settings) ---------------- */
function ProfileSection() {
  const { user, updateProfile, updatePassword } = useAuth();
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [nameMsg, setNameMsg] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; msg: string } | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    const meta = (user?.user_metadata ?? {}) as { name?: string };
    setName(meta.name ?? "");
  }, [user]);

  if (!user) {
    return (
      <div className="mt-4 rounded-2xl bg-white/60 p-4 text-sm">
        <div className="font-bold">👤 Account</div>
        <p className="mt-1 text-muted-foreground">
          You're not logged in.{" "}
          <Link to="/login" className="font-bold text-primary hover:underline">Log in</Link>{" "}
          to edit your profile and sync progress.
        </p>
      </div>
    );
  }

  async function saveName() {
    setSavingName(true);
    setNameMsg(null);
    const { error } = await updateProfile(name);
    setNameMsg(error ? { ok: false, msg: error } : { ok: true, msg: "Name updated" });
    setSavingName(false);
  }

  async function savePw() {
    if (pw.length < 6) {
      setPwMsg({ ok: false, msg: "Password must be at least 6 characters." });
      return;
    }
    setSavingPw(true);
    setPwMsg(null);
    const { error } = await updatePassword(pw);
    setPwMsg(error ? { ok: false, msg: error } : { ok: true, msg: "Password changed." });
    if (!error) setPw("");
    setSavingPw(false);
  }

  return (
    <div className="mt-4 space-y-3 rounded-2xl bg-white/60 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold">👤 Profile</div>
        <span className="max-w-[180px] truncate text-xs text-muted-foreground" title={user.email ?? ""}>
          {user.email}
        </span>
      </div>

      <div>
        <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Display name
        </label>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => { setName(e.target.value); setNameMsg(null); }}
            placeholder="Your name"
            className="flex-1 rounded-2xl border border-border bg-white/70 px-4 py-2.5 text-sm outline-none focus:border-primary"
          />
          <button
            onClick={saveName}
            disabled={savingName}
            className="rounded-2xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
          >
            {savingName ? "…" : "Save"}
          </button>
        </div>
        {nameMsg && (
          <div className={`mt-1 text-xs ${nameMsg.ok ? "text-success" : "text-destructive"}`}>
            {nameMsg.ok ? "✅ " : "⚠ "}{nameMsg.msg}
          </div>
        )}
      </div>

      <div>
        <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-muted-foreground">
          New password
        </label>
        <div className="flex gap-2">
          <input
            type="password"
            value={pw}
            onChange={(e) => { setPw(e.target.value); setPwMsg(null); }}
            placeholder="At least 6 characters"
            autoComplete="new-password"
            className="flex-1 rounded-2xl border border-border bg-white/70 px-4 py-2.5 text-sm outline-none focus:border-primary"
          />
          <button
            onClick={savePw}
            disabled={savingPw || !pw}
            className="rounded-2xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
          >
            {savingPw ? "…" : "Change"}
          </button>
        </div>
        {pwMsg && (
          <div className={`mt-1 text-xs ${pwMsg.ok ? "text-success" : "text-destructive"}`}>
            {pwMsg.ok ? "✅ " : "⚠ "}{pwMsg.msg}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Daily quests ---------------- */
function DailyQuests({ quests }: { quests: { id: string; done: boolean }[] }) {
  const labels: Record<string, string> = {
    [QUESTS.learn5.id]: QUESTS.learn5.label,
    [QUESTS.quiz3.id]: QUESTS.quiz3.label,
    [QUESTS.match.id]: QUESTS.match.label,
  };
  return (
    <div className="glass-card w-full max-w-sm p-4">
      <div className="mb-2 flex items-center justify-between text-sm font-bold">
        <span>🎯 Daily quests</span>
        <span className="text-xs text-muted-foreground">
          {quests.filter((q) => q.done).length}/{quests.length}
        </span>
      </div>
      <ul className="space-y-1.5">
        {quests.map((q) => (
          <li key={q.id} className="flex items-center gap-2 text-sm">
            <span className={`grid h-5 w-5 place-items-center rounded-full text-[11px] ${q.done ? "bg-success text-success-foreground" : "bg-secondary text-muted-foreground"}`}>
              {q.done ? "✓" : "•"}
            </span>
            <span className={q.done ? "line-through text-muted-foreground" : ""}>{labels[q.id] ?? q.id}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------- Flashcards ---------------- */
function Flashcards({ items, onXP, onQuest, requireAuth }: { items: VocabItem[]; onXP: (n: number) => void; onQuest: (id: string) => void; requireAuth: () => boolean }) {
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Set<number>>(new Set());
  const [images, setImages] = useState<Record<string, string>>({});
  const [loadingImg, setLoadingImg] = useState<Record<string, boolean>>({});
  const [imgErr, setImgErr] = useState<Record<string, string>>({});
  const item = items[i];
  useEffect(() => { setFlipped(false); }, [i]);

  function next(mark: "know" | "again") {
    if (mark === "know" && !known.has(i)) {
      const nextKnown = new Set(known).add(i);
      setKnown(nextKnown);
      onXP(XP.flashcardKnown);
      if (nextKnown.size >= QUESTS.learn5.target) onQuest(QUESTS.learn5.id);
    }
    setI((p) => (p + 1) % items.length);
  }

  function speak() {
    const utt = new SpeechSynthesisUtterance(item.word);
    utt.lang = "en-US";
    utt.rate = 0.9;
    window.speechSynthesis.speak(utt);
  }

  async function generateImage(v: VocabItem) {
    if (loadingImg[v.word] || images[v.word]) return;
    if (!requireAuth()) return; // login-gated API call
    setLoadingImg((p) => ({ ...p, [v.word]: true }));
    setImgErr((p) => ({ ...p, [v.word]: "" }));
    try {
      const res = await fetch("/api/vocab-image", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          word: v.word,
          definition: v.definition,
          example: v.example,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error || `HTTP ${res.status}`);
      setImages((p) => ({ ...p, [v.word]: json.url as string }));
      onXP(XP.imageGenerated);
    } catch (e) {
      setImgErr((p) => ({
        ...p,
        [v.word]: e instanceof Error ? e.message : "Failed",
      }));
    } finally {
      setLoadingImg((p) => ({ ...p, [v.word]: false }));
    }
  }

  const currentImg = images[item.word];
  const isLoadingCurrent = loadingImg[item.word];
  const currentErr = imgErr[item.word];

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_260px]">
      <div>
        <div className="mb-3 flex items-center justify-between text-xs font-semibold text-muted-foreground">
          <span>Card {i + 1} of {items.length}</span>
          <span>{known.size} learned</span>
        </div>
        <div
          onClick={() => setFlipped((f) => !f)}
          className="relative min-h-72 cursor-pointer rounded-3xl bg-white p-8 shadow-[var(--shadow-pop)] transition hover:-translate-y-0.5"
        >
          {!flipped ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              {currentImg ? (
                <img
                  src={currentImg}
                  alt={item.word}
                  className="aspect-square h-40 w-40 animate-pop-in rounded-3xl object-cover shadow-md"
                />
              ) : isLoadingCurrent ? (
                <div className="grid aspect-square h-40 w-40 place-items-center rounded-3xl bg-gradient-to-br from-lavender via-primary/40 to-accent">
                  <div className="text-sm font-bold text-white">Generating…</div>
                </div>
              ) : (
                <div className="text-6xl">{item.emoji}</div>
              )}
              <div className="text-3xl font-black">{item.word}</div>
              <div className="text-sm text-muted-foreground">{item.pos} · {item.pronunciation}</div>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); speak(); }}
                  className="chip !bg-sky"
                >🔊 Listen</button>
                <button
                  onClick={(e) => { e.stopPropagation(); generateImage(item); }}
                  disabled={isLoadingCurrent || !!currentImg}
                  className="chip !bg-lavender disabled:opacity-60"
                >
                  {currentImg ? "🖼 Image ready" : isLoadingCurrent ? "⏳ Generating…" : "✨ Generate image"}
                </button>
              </div>
              {currentErr && (
                <div className="text-xs text-destructive">⚠ {currentErr}</div>
              )}
              <div className="mt-4 text-xs text-muted-foreground">Tap the card to flip</div>
            </div>
          ) : (
            <div className="flex h-full flex-col justify-center gap-4">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Meaning</div>
              <div className="text-xl font-bold">{item.definition}</div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Example</div>
              <div className="rounded-2xl bg-secondary p-4 italic">"{item.example}"</div>
            </div>
          )}
        </div>
        <div className="mt-4 flex gap-3">
          <button
            onClick={() => next("again")}
            className="flex-1 rounded-2xl bg-peach px-4 py-3 font-bold text-peach-foreground transition hover:-translate-y-0.5"
          >
            🔁 Practice again
          </button>
          <button
            onClick={() => next("know")}
            className="flex-1 rounded-2xl bg-mint px-4 py-3 font-bold text-mint-foreground transition hover:-translate-y-0.5"
          >
            ✅ I know this (+{XP.flashcardKnown} XP)
          </button>
        </div>
      </div>

      {/* Word list */}
      <aside className="glass-card max-h-96 overflow-y-auto p-3">
        <div className="mb-2 px-2 text-xs font-bold text-muted-foreground">All words</div>
        <ul className="space-y-1">
          {items.map((v, idx) => {
            const img = images[v.word];
            const busy = loadingImg[v.word];
            return (
              <li key={v.word} className="flex items-center gap-1">
                <button
                  onClick={() => setI(idx)}
                  className={`flex flex-1 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition ${
                    idx === i ? "bg-primary/20 font-bold" : "hover:bg-white"
                  }`}
                >
                  {img ? (
                    <img src={img} alt="" className="h-6 w-6 rounded-md object-cover" />
                  ) : (
                    <span>{v.emoji}</span>
                  )}
                  <span className="flex-1 truncate">{v.word}</span>
                  {known.has(idx) && <span className="text-xs text-success">✓</span>}
                </button>
                <button
                  title="Generate AI image"
                  onClick={() => generateImage(v)}
                  disabled={busy || !!img}
                  className="grid h-8 w-8 place-items-center rounded-lg bg-lavender text-sm disabled:opacity-40"
                >
                  {busy ? "⏳" : img ? "✓" : "✨"}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
    </div>
  );
}


/* ---------------- Matching ---------------- */
function Matching({ pairs, onXP, onComplete }: { pairs: MatchPair[]; onXP: (n: number) => void; onComplete: () => void }) {
  const [leftPick, setLeftPick] = useState<string | null>(null);
  const [rightPick, setRightPick] = useState<string | null>(null);
  const [solved, setSolved] = useState<Set<string>>(new Set());
  const [wrong, setWrong] = useState(false);

  const rights = useMemo(() => shuffle(pairs.map((p) => p.right)), [pairs]);
  const lefts = useMemo(() => shuffle(pairs.map((p) => p.left)), [pairs]);

  useEffect(() => {
    if (leftPick && rightPick) {
      const correct = pairs.some((p) => p.left === leftPick && p.right === rightPick);
      if (correct) {
        setSolved((s) => {
          const ns = new Set(s).add(leftPick);
          if (ns.size === pairs.length) { onComplete(); }
          return ns;
        });
        onXP(XP.matchPair);
        setLeftPick(null); setRightPick(null);
      } else {
        setWrong(true);
        window.setTimeout(() => { setWrong(false); setLeftPick(null); setRightPick(null); }, 500);
      }
    }
  }, [leftPick, rightPick, pairs, onXP, onComplete]);

  const done = solved.size === pairs.length;

  return (
    <div>
      <div className="mb-3 text-sm text-muted-foreground">
        Tap a word on the left and its match on the right.
      </div>
      <div className={`grid grid-cols-2 gap-4 ${wrong ? "animate-shake" : ""}`}>
        <div className="space-y-2">
          {lefts.map((w) => {
            const isSolved = solved.has(w);
            const isPicked = leftPick === w;
            return (
              <button
                key={w}
                disabled={isSolved}
                onClick={() => setLeftPick(w)}
                className={`w-full rounded-2xl p-3 text-left font-semibold transition ${
                  isSolved ? "bg-success/20 text-muted-foreground line-through"
                  : isPicked ? "bg-primary text-primary-foreground"
                  : "bg-white hover:-translate-y-0.5"
                }`}
              >{w}</button>
            );
          })}
        </div>
        <div className="space-y-2">
          {rights.map((w) => {
            const matched = pairs.find((p) => p.right === w);
            const isSolved = matched && solved.has(matched.left);
            const isPicked = rightPick === w;
            return (
              <button
                key={w}
                disabled={!!isSolved}
                onClick={() => setRightPick(w)}
                className={`w-full rounded-2xl p-3 text-left transition ${
                  isSolved ? "bg-success/20 text-muted-foreground line-through"
                  : isPicked ? "bg-accent text-accent-foreground"
                  : "bg-white hover:-translate-y-0.5"
                }`}
              >{w}</button>
            );
          })}
        </div>
      </div>
      {done && (
        <div className="mt-6 animate-pop-in rounded-3xl bg-mint p-6 text-center text-mint-foreground">
          <div className="text-4xl">🧩</div>
          <div className="mt-1 text-xl font-black">All matched!</div>
          <div className="text-sm">+{XP.matchComplete} XP · Badge unlocked: Match Master</div>
        </div>
      )}
    </div>
  );
}

/* ---------------- True/False ---------------- */
function TrueFalse({ items, onXP }: { items: TFItem[]; onXP: (n: number) => void }) {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<boolean | null>(null);
  const [score, setScore] = useState(0);
  const item = items[i];
  const done = i >= items.length;

  function pick(v: boolean) {
    setPicked(v);
    if (v === item.answer) { setScore((s) => s + 1); onXP(XP.trueFalseCorrect); }
    window.setTimeout(() => { setPicked(null); setI((p) => p + 1); }, 1200);
  }

  if (done) {
    return (
      <div className="glass-card p-8 text-center">
        <div className="text-5xl">🌟</div>
        <div className="mt-2 text-2xl font-black">Round complete!</div>
        <div className="text-muted-foreground">You scored {score} / {items.length}</div>
        <button onClick={() => { setI(0); setScore(0); }} className="mt-4 rounded-2xl bg-primary px-5 py-3 font-bold text-primary-foreground">Play again</button>
      </div>
    );
  }

  const correct = picked !== null && picked === item.answer;
  const wrong = picked !== null && picked !== item.answer;

  return (
    <div className="glass-card p-8">
      <div className="mb-2 text-xs font-semibold text-muted-foreground">Question {i + 1} / {items.length}</div>
      <div className="text-2xl font-bold">{item.statement}</div>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <button
          disabled={picked !== null}
          onClick={() => pick(true)}
          className={`rounded-2xl p-5 text-lg font-bold transition ${
            picked === true
              ? correct ? "bg-success text-success-foreground" : "bg-destructive text-destructive-foreground"
              : "bg-mint text-mint-foreground hover:-translate-y-0.5"
          }`}
        >✅ True</button>
        <button
          disabled={picked !== null}
          onClick={() => pick(false)}
          className={`rounded-2xl p-5 text-lg font-bold transition ${
            picked === false
              ? correct ? "bg-success text-success-foreground" : "bg-destructive text-destructive-foreground"
              : "bg-peach text-peach-foreground hover:-translate-y-0.5"
          }`}
        >❌ False</button>
      </div>
      {picked !== null && (
        <div className={`mt-4 rounded-2xl p-4 text-sm ${correct ? "bg-success/20" : "bg-destructive/10"}`}>
          {correct ? "Nice!" : "Not quite."} {item.explain}
        </div>
      )}
      {wrong && null}
    </div>
  );
}

/* ---------------- Fill blanks ---------------- */
function FillBlanks({ data, onXP }: { data: { dialogue: { speaker: string; line: string; blank: string | null }[]; options: string[] }; onXP: (n: number) => void }) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [checked, setChecked] = useState(false);
  const options = useMemo(() => shuffle(data.options), [data]);

  function check() {
    let ok = 0;
    data.dialogue.forEach((d, idx) => {
      if (d.blank && answers[idx]?.toLowerCase() === d.blank.toLowerCase()) ok += 1;
    });
    onXP(ok * XP.fillBlankCorrect);
    setChecked(true);
  }

  const blanks = data.dialogue.filter((d) => d.blank);

  return (
    <div className="glass-card p-6">
      <div className="mb-3 text-sm text-muted-foreground">Choose the right word for each blank.</div>
      <div className="space-y-3">
        {data.dialogue.map((d, idx) => (
          <div key={idx} className="rounded-2xl bg-white p-4">
            <div className="text-xs font-bold uppercase text-muted-foreground">{d.speaker}</div>
            <div className="mt-1 text-base">
              {d.blank ? renderWithBlank(d.line, (
                <select
                  value={answers[idx] ?? ""}
                  onChange={(e) => setAnswers({ ...answers, [idx]: e.target.value })}
                  disabled={checked}
                  className={`mx-1 rounded-lg border px-2 py-1 text-sm font-bold ${
                    checked
                      ? answers[idx]?.toLowerCase() === d.blank?.toLowerCase() ? "border-success bg-success/20" : "border-destructive bg-destructive/10"
                      : "border-primary bg-primary/10"
                  }`}
                >
                  <option value="">___</option>
                  {options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              )) : d.line}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-3">
        <button onClick={check} disabled={checked} className="rounded-2xl bg-primary px-5 py-3 font-bold text-primary-foreground disabled:opacity-60">
          Check answers
        </button>
        {checked && (
          <button onClick={() => { setAnswers({}); setChecked(false); }} className="rounded-2xl bg-secondary px-5 py-3 font-bold">
            Try again
          </button>
        )}
      </div>
      {checked && (
        <div className="mt-3 text-sm text-muted-foreground">
          {Object.entries(answers).filter(([idx, v]) => data.dialogue[+idx].blank?.toLowerCase() === v.toLowerCase()).length}
          {" / "}{blanks.length} correct
        </div>
      )}
    </div>
  );
}
function renderWithBlank(line: string, node: React.ReactNode) {
  const parts = line.split("____");
  return <>{parts[0]}{node}{parts[1] ?? ""}</>;
}

/* ---------------- Quiz ---------------- */
function Quiz({ items, onXP, onQuest, onPerfect }: { items: QuizItem[]; onXP: (n: number) => void; onQuest: (id: string) => void; onPerfect: () => void }) {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const item = items[i];
  const done = i >= items.length;

  function pick(idx: number) {
    setPicked(idx);
    if (idx === item.answerIndex) { setScore((s) => s + 1); onXP(XP.quizCorrect); }
    window.setTimeout(() => { setPicked(null); setI((p) => p + 1); }, 1200);
  }

  useEffect(() => {
    if (!done) return;
    if (score >= QUESTS.quiz3.target) onQuest(QUESTS.quiz3.id);
    if (score === items.length) onPerfect();
  }, [done, score, items.length, onQuest, onPerfect]);

  if (done) {
    return (
      <div className="glass-card p-8 text-center">
        <div className="text-5xl">{score === items.length ? "🏆" : "🎯"}</div>
        <div className="mt-2 text-2xl font-black">{score} / {items.length}</div>
        <div className="text-sm text-muted-foreground">
          {score === items.length ? "Perfect! Badge unlocked." : "Great job — try again for a perfect score!"}
        </div>
        <button onClick={() => { setI(0); setScore(0); }} className="mt-4 rounded-2xl bg-primary px-5 py-3 font-bold text-primary-foreground">
          Restart
        </button>
      </div>
    );
  }

  return (
    <div className="glass-card p-6 md:p-8">
      <div className="mb-2 flex items-center justify-between text-xs font-bold text-muted-foreground">
        <span>Question {i + 1} / {items.length}</span>
        <span>Score {score}</span>
      </div>
      <div className="text-xl font-bold">{item.question}</div>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {item.choices.map((c, idx) => {
          const isPicked = picked === idx;
          const isRight = picked !== null && idx === item.answerIndex;
          return (
            <button
              key={idx}
              disabled={picked !== null}
              onClick={() => pick(idx)}
              className={`rounded-2xl p-4 text-left font-semibold transition ${
                isRight ? "bg-success text-success-foreground"
                : isPicked ? "bg-destructive/80 text-destructive-foreground"
                : "bg-white hover:-translate-y-0.5"
              }`}
            >{c}</button>
          );
        })}
      </div>
      {picked !== null && (
        <div className="mt-3 rounded-xl bg-secondary p-3 text-sm">{item.explain}</div>
      )}
    </div>
  );
}

/* ---------------- Lucky Wheel ---------------- */
function LuckyWheel({ prompts, onXP }: { prompts: string[]; onXP: (n: number) => void }) {
  const [angle, setAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const colors = ["var(--mint)", "var(--peach)", "var(--lavender)", "var(--sky)", "var(--lemon)", "var(--primary)"];

  function spin() {
    if (spinning) return;
    setSpinning(true);
    setChosen(null);
    const turns = 5 + Math.random() * 3;
    const finalAngle = angle + turns * 360 + Math.random() * 360;
    setAngle(finalAngle);
    window.setTimeout(() => {
      const norm = ((finalAngle % 360) + 360) % 360;
      const seg = 360 / prompts.length;
      const idx = Math.floor(((360 - norm) % 360) / seg);
      setChosen(prompts[idx]);
      setSpinning(false);
      onXP(XP.wheelSpin);
    }, 3600);
  }

  const seg = 360 / prompts.length;

  return (
    <div className="grid gap-6 md:grid-cols-[320px_1fr] md:items-center">
      <div className="relative mx-auto h-72 w-72">
        <div
          className="h-full w-full rounded-full border-8 border-white shadow-[var(--shadow-pop)] transition-transform duration-[3500ms] ease-out"
          style={{
            transform: `rotate(${angle}deg)`,
            background: `conic-gradient(${prompts
              .map((_, i) => `${colors[i % colors.length]} ${i * seg}deg ${(i + 1) * seg}deg`)
              .join(",")})`,
          }}
        >
          {prompts.map((_, i) => (
            <div
              key={i}
              className="absolute left-1/2 top-1/2 h-1/2 w-px origin-top bg-white/40"
              style={{ transform: `rotate(${i * seg}deg)` }}
            />
          ))}
        </div>
        <div className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-2xl font-black shadow-lg">🎡</div>
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 text-3xl">▼</div>
      </div>
      <div>
        <button
          onClick={spin}
          disabled={spinning}
          className="rounded-2xl bg-primary px-6 py-4 text-lg font-black text-primary-foreground shadow-[var(--shadow-pop)] transition hover:-translate-y-0.5 disabled:opacity-60"
        >
          {spinning ? "Spinning…" : `🎡 Spin the wheel (+${XP.wheelSpin} XP)`}
        </button>
        {chosen && (
          <div className="animate-pop-in mt-4 rounded-3xl bg-lavender p-5 text-lavender-foreground">
            <div className="text-xs font-bold uppercase tracking-widest">Your challenge</div>
            <div className="mt-1 text-xl font-black">"{chosen}"</div>
            <div className="mt-2 text-xs">Say it out loud or type your answer!</div>
          </div>
        )}
        <div className="mt-4 text-xs text-muted-foreground">
          Practice speaking with a random prompt from today's lesson.
        </div>
      </div>
    </div>
  );
}

/* ---------------- Badges ---------------- */
function BadgeShelf({ badges }: { badges: string[] }) {
  return (
    <section className="glass-card mt-8 p-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xl">🏅 Your badges</h3>
        <span className="text-xs text-muted-foreground">{badges.length} / {BADGES.length} unlocked</span>
      </div>
      <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
        {BADGES.map((b) => {
          const owned = badges.includes(b.id);
          return (
            <div
              key={b.id}
              className={`flex flex-col items-center gap-1 rounded-2xl p-3 text-center transition ${
                owned ? "bg-lemon shadow-md" : "bg-white/50 opacity-50 grayscale"
              }`}
            >
              <div className="text-3xl">{b.emoji}</div>
              <div className="text-[11px] font-bold">{b.label}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ---------------- Confetti ---------------- */
function Confetti() {
  const pieces = Array.from({ length: 60 });
  const colors = ["#F9A8D4", "#FCA5A5", "#FCD34D", "#86EFAC", "#93C5FD", "#C4B5FD"];
  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {pieces.map((_, i) => (
        <span
          key={i}
          className="confetti-piece absolute top-0 h-2 w-2 rounded-sm"
          style={{
            left: `${Math.random() * 100}%`,
            background: colors[i % colors.length],
            animationDelay: `${Math.random() * 0.6}s`,
          }}
        />
      ))}
    </div>
  );
}

/* ---------------- utils ---------------- */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
