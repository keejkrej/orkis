# Orkis - Coding Agent Manager

A local GUI application for managing Claude Code and OpenAI Codex coding agents.

## Features

- Start/stop Claude Code and Codex agent instances
- Monitor running agents in real-time
- View agent plans and implementation strategies
- Track git branch/worktree information
- Monitor code changes (lines added/removed)
- View all plan.md files created by agents

## Architecture

```
┌─────────────────────────────────────────────────┐
│                    Tauri App                     │
│  ┌──────────────────────────────────────────┐   │
│  │           Next.js Frontend                │   │
│  │  - React 19 + TypeScript                  │   │
│  │  - Tailwind CSS + shadcn/ui              │   │
│  │  - Zustand state management              │   │
│  └──────────────────────────────────────────┘   │
│                      │                           │
│                      │ WebSocket                 │
│                      ▼                           │
│  ┌──────────────────────────────────────────┐   │
│  │        Rust (Tauri) Backend              │   │
│  │  - Window management                     │   │
│  │  - WebSocket bridge                      │   │
│  └──────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘
                       │
                       │ WebSocket (port 9847)
                       ▼
┌──────────────────────────────────────────────────┐
│              Node.js Agent Runtime               │
│  - @anthropic-ai/claude-agent-sdk               │
│  - @openai/codex                                │
│  - Git integration (simple-git)                 │
│  - File watching for plan.md                    │
└──────────────────────────────────────────────────┘
```

## Prerequisites

- Node.js 18+
- Rust (for Tauri)
- Claude Code CLI or Anthropic API key
- OpenAI API key (for Codex)

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the agent runtime server:
```bash
npm run agent:start
```

3. In a separate terminal, start the Tauri development server:
```bash
npm run tauri:dev
```

## Development

### Frontend Only (Next.js)
```bash
npm run dev
```

### Full App (Tauri + Next.js)
```bash
npm run tauri:dev
```

### Build for Production
```bash
npm run tauri:build
```

## Project Structure

```
orkis/
├── src/                    # Next.js frontend
│   ├── app/               # App router pages
│   ├── components/        # React components
│   ├── store/             # Zustand stores
│   └── lib/               # Utilities
├── src-tauri/             # Tauri backend (Rust)
│   └── src/               # Rust source
├── agent-runtime/         # Node.js agent runtime
│   ├── server.ts          # WebSocket server
│   ├── agent-manager.ts   # Agent management logic
│   └── types.ts           # TypeScript types
└── package.json
```

## Similar Projects

This project draws inspiration from:
- [CCManager](https://github.com/kbwo/ccmanager) - CLI-based session manager
- [Opcode](https://github.com/winfunc/opcode) - Tauri-based Claude Code GUI

## License

MIT
