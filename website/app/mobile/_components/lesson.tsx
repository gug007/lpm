import { LessonSection } from "@/components/lesson-section";

const STEPS = [
  {
    title: "Turn on Remote control on your Mac",
    body: "In lpm, open More → Mobile app. On the same Wi-Fi your phone can reach the Mac right away.",
  },
  {
    title: "Set up Built-in Tailscale on both",
    body: "Sign in on the Mac, then in lpm Link with the same account. Your Mac and phone share a private, encrypted network, so it works on cellular too, with no Tailscale app and no open ports.",
  },
  {
    title: "Pair, then run Claude Code",
    body: "Tap your Mac in lpm Link and allow it when the codes match. Your projects appear on the phone; open a Claude session and send it a prompt.",
  },
];

export default function Lesson() {
  return (
    <LessonSection
      lesson="connect-iphone"
      title="Pair your iPhone once, use it from anywhere"
      description="A short lesson from the lpm series: connect lpm Link to your Mac, set up Built-in Tailscale, and run Claude Code from your phone."
      steps={STEPS}
    />
  );
}
