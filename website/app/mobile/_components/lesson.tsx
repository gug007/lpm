import { LessonSection } from "@/components/lesson-section";

const STEPS = [
  {
    title: "Install both apps",
    body: "lpm on your Mac, Windows or Linux computer, where every terminal and agent runs, and lpm Link from the App Store or Google Play. The steps at the top of this page have both.",
  },
  {
    title: "Turn on Remote control and pair",
    body: "In lpm, open More → Mobile app. On the same Wi-Fi, tap your Mac in lpm Link and allow it when the codes match, or add a device and scan its one-time QR code. No account, no sign-in.",
  },
  {
    title: "Your projects appear on the phone",
    body: "Every project and terminal shows up. Open a terminal, tap Take control if your Mac is showing it, and type into it. Start and stop projects right from the list.",
  },
  {
    title: "Away from home, add Built-in Tailscale",
    body: "Sign in on the Mac, then in lpm Link with the same account. Your Mac and phone share a private, encrypted network, so it works on cellular too, with no Tailscale app and no open ports.",
  },
];

export default function Lesson() {
  return (
    <LessonSection
      lesson="connect-iphone"
      title="Set it up once, use it from anywhere"
      description="Four steps from install to your first prompt from the phone. The lesson walks through pairing, Built-in Tailscale and running Claude Code."
      steps={STEPS}
    />
  );
}
