import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SUBBY SMS — Telegram bot for public temporary numbers",
};

const ASMS_HOME = "https://asms.ai";
const ASMS_NUMBERS = "https://asms.ai/free-phone-numbers";

export default function HomePage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-5 py-12 sm:py-16">
      <header className="mb-10">
        <p className="mb-2 text-sm font-medium tracking-wide text-blue-400">
          Telegram bot
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          SUBBY SMS
        </h1>
        <p className="mt-3 text-base leading-relaxed text-[var(--muted)] sm:text-lg">
          Browse live free <strong className="text-white">shared public</strong>{" "}
          temporary SMS numbers provided by{" "}
          <a href={ASMS_HOME} target="_blank" rel="noopener noreferrer">
            ASMS.ai
          </a>
          . Simple menus in Telegram — no fake numbers, no pretend inbox API.
        </p>
      </header>

      <main className="flex flex-1 flex-col gap-8">
        <section
          className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6"
          aria-labelledby="what-heading"
        >
          <h2 id="what-heading" className="text-lg font-semibold text-white">
            What it does
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-[var(--muted)]">
            <li>
              <code className="text-blue-300">/start</code> — welcome and main
              menu
            </li>
            <li>
              <code className="text-blue-300">/numbers</code> — live free
              numbers from the ASMS public directory
            </li>
            <li>
              <code className="text-blue-300">/countries</code> — browse by
              country on ASMS.ai
            </li>
            <li>
              <code className="text-blue-300">/help</code> — how to use public
              numbers safely
            </li>
            <li>
              <code className="text-blue-300">/privacy</code> — risks of shared
              inboxes
            </li>
          </ul>
        </section>

        <section
          className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6"
          aria-labelledby="limits-heading"
        >
          <h2
            id="limits-heading"
            className="text-lg font-semibold text-amber-200"
          >
            Important limits
          </h2>
          <div className="mt-3 space-y-3 text-sm leading-relaxed text-amber-100/90">
            <p>
              ASMS.ai free numbers are <strong>public shared inboxes</strong>.
              Anyone can open the same number and read messages. Automated API
              access is a <strong>paid</strong> ASMS feature — this bot does{" "}
              <strong>not</strong> claim free API access and does not invent
              phone numbers or SMS content.
            </p>
            <p>
              <strong>Do not</strong> use public numbers for banking, primary
              email, password recovery, government IDs, or anything sensitive.
            </p>
          </div>
        </section>

        <section
          className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6"
          aria-labelledby="start-heading"
        >
          <h2 id="start-heading" className="text-lg font-semibold text-white">
            Get started
          </h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-[var(--muted)]">
            <li>
              Open the bot in Telegram (after you deploy and set the webhook).
            </li>
            <li>
              Send <code className="text-blue-300">/start</code>.
            </li>
            <li>
              Use menu buttons to open{" "}
              <a href={ASMS_NUMBERS} target="_blank" rel="noopener noreferrer">
                ASMS public numbers
              </a>
              .
            </li>
            <li>
              On ASMS.ai, pick a free public number and check its public inbox
              for codes.
            </li>
          </ol>
          <div className="mt-5 flex flex-wrap gap-3">
            <a
              href={ASMS_NUMBERS}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white no-underline hover:bg-blue-500 hover:no-underline"
            >
              ASMS public numbers
            </a>
            <a
              href={ASMS_HOME}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-lg border border-[var(--border)] bg-white/5 px-4 py-2.5 text-sm font-medium text-white no-underline hover:bg-white/10 hover:no-underline"
            >
              ASMS.ai home
            </a>
          </div>
        </section>
      </main>

      <footer className="mt-12 border-t border-[var(--border)] pt-6 text-center text-xs text-[var(--muted)]">
        SUBBY SMS is an independent helper bot. Not affiliated with ASMS.ai.
        Use public inboxes at your own risk.
      </footer>
    </div>
  );
}
