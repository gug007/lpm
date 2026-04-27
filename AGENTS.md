# Agent Guide — lpm

## Overview

lpm (Local Project Manager) starts, stops, duplicates, and switches between local dev projects, with a built-in terminal for running AI coding agents alongside services. The repo ships a Go CLI, a macOS desktop app (Wails + React/TypeScript), and a Next.js marketing site under `website/`. CLI and app share the same config (`~/.lpm/projects/*.yml`) and runtime state.