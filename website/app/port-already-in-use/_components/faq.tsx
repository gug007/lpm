import { ChevronDown } from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { faqJsonLd, jsonLdString } from "@/lib/structured-data";

const FAQS: { question: string; answer: string }[] = [
  {
    question: "How do I find what's using port 3000?",
    answer:
      "On macOS or Linux, run lsof -nP -iTCP:3000 -sTCP:LISTEN: it prints the command and its PID. On Linux without lsof, ss -ltnp 'sport = :3000' does the same. On Windows, run Get-NetTCPConnection -LocalPort 3000 -State Listen in PowerShell, or netstat -ano | findstr :3000 in Command Prompt, and look up the PID in Task Manager.",
  },
  {
    question: "How do I kill the process on port 3000 on a Mac?",
    answer:
      "Run kill $(lsof -t -iTCP:3000 -sTCP:LISTEN). If it's still listening a few seconds later, use kill -9 with the same PID. Check what it is first, so you don't stop a database you need.",
  },
  {
    question: "How do I free a port on Windows?",
    answer:
      "In PowerShell: Stop-Process -Id (Get-NetTCPConnection -LocalPort 3000 -State Listen).OwningProcess. In Command Prompt: find the PID with netstat -ano | findstr :3000, then run taskkill /PID <pid> /F.",
  },
  {
    question: "What does EADDRINUSE mean?",
    answer:
      "It's the operating system's error for an address already in use: your server asked to listen on a port that another process is listening on. Only one process can listen on a port and address at a time.",
  },
  {
    question: "Why is port 5000 in use on my Mac?",
    answer:
      "On recent macOS, AirPlay Receiver listens on ports 5000 and 7000. Turn it off under System Settings → General → AirDrop & Handoff, or run your server on another port.",
  },
  {
    question: "Can I just use another port?",
    answer:
      "Yes, and some tools do it for you: Next.js and Vite move to the next free port. But the old server is still running, and the URL you have open may be talking to it instead of your new code.",
  },
  {
    question: "Can lpm free the port for me?",
    answer:
      "Yes. lpm checks each service's port before it starts it, names what holds it, and frees it with one click. Set portConflict: free to free it without asking, or fail to refuse to start. lpm is free and open source for macOS, Windows and Linux.",
  },
];

export default function Faq() {
  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto max-w-3xl px-6">
        <SectionHeader eyebrow="FAQ" title="Ports in use: what people ask" />
        <ul className="space-y-3">
          {FAQS.map(({ question, answer }) => (
            <li key={question}>
              <details className="group rounded-2xl border border-gray-200 transition-colors duration-200 hover:border-gray-300 open:border-gray-300 open:bg-gray-50/50 dark:border-gray-800 dark:hover:border-gray-700 dark:open:border-gray-700 dark:open:bg-white/[0.02]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-semibold text-gray-900 dark:text-gray-100 [&::-webkit-details-marker]:hidden">
                  <span>{question}</span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-gray-500 transition-transform duration-200 group-open:rotate-180 dark:text-gray-400" />
                </summary>
                <div className="px-5 pb-4 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                  {answer}
                </div>
              </details>
            </li>
          ))}
        </ul>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdString(faqJsonLd(FAQS)) }}
        />
      </div>
    </section>
  );
}
