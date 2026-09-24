import {
  FolderX,
  HardDrive,
  Network,
  ServerOff,
  Trash2,
  type LucideIcon,
} from "lucide-react";

export const WORKTREE_WINS: { title: string; body: string }[] = [
  {
    title: "You only need another branch.",
    body: "Reviewing a pull request's code or cherry-picking a fix doesn't need your .env or installed packages.",
  },
  {
    title: "Minimal disk and one shared history matter most.",
    body: "Git stores each object once, and a commit made in any worktree is visible from all of them.",
  },
  {
    title: "Your setup is already scripted.",
    body: "A post-checkout hook or a setup script already copies .env and installs dependencies in every new checkout.",
  },
  {
    title: "You're not on a Mac.",
    body: "lpm's desktop app is macOS only. Git worktrees work anywhere Git does.",
  },
];

export const DUPLICATE_LIMITS: {
  icon: LucideIcon;
  title: string;
  body: string;
}[] = [
  {
    icon: Network,
    title: "Ports and database servers stay shared",
    body: "A copy runs on the same machine, so it wants the same ports and the same local database. Docker Compose names containers after the folder by default, but published ports still collide. lpm checks declared ports on start and, by default, offers Stop & start or Cancel.",
  },
  {
    icon: HardDrive,
    title: "Disk use grows as copies change",
    body: "On APFS a copy starts as a copy-on-write clone that shares unchanged blocks. Edits, builds and fresh installs take real space, and a disk that can't clone gets a full copy.",
  },
  {
    icon: FolderX,
    title: "Folders named like build output are skipped",
    body: "Folders such as .next, dist, build, out and target are left out at any depth, even when Git tracks them.",
  },
  {
    icon: Trash2,
    title: "Deleting a copy is permanent",
    body: "Its folder is deleted from disk, not moved to the Trash. Push or merge anything you want to keep first.",
  },
  {
    icon: ServerOff,
    title: "Some projects can't be duplicated",
    body: "SSH projects can't. A project that is itself a linked Git worktree uses New Worktree instead.",
  },
];
