export interface AgentConfig {
  agent_type: 'claude-code' | 'codex'
  name: string
  working_dir: string
  prompt?: string
  model?: string
}

export interface Agent {
  id: string
  agent_type: 'claude-code' | 'codex'
  name: string
  status: 'idle' | 'running' | 'stopped' | 'error'
  working_dir: string
  started_at: string
  plans: Plan[]
  messages: AgentMessage[]
  git_info?: GitInfo
  code_changes: CodeChange[]
}

export interface Plan {
  id: string
  content: string
  file_path: string
  created_at: string
}

export interface AgentMessage {
  id: string
  message_type: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  timestamp: string
  tool_name?: string
  tool_input?: unknown
}

export interface GitInfo {
  branch: string
  worktree?: string
  uncommitted_changes: number
  last_commit?: {
    hash: string
    message: string
    author: string
    date: string
  }
}

export interface CodeChange {
  file_path: string
  lines_added: number
  lines_removed: number
  timestamp: string
}

// WebSocket message types
export type RuntimeMessage =
  | { type: 'start_agent'; config: AgentConfig }
  | { type: 'stop_agent'; agent_id: string }
  | { type: 'list_agents' }
  | { type: 'get_agent'; agent_id: string }
  | { type: 'send_message'; agent_id: string; message: string }
  | { type: 'subscribe'; agent_id: string }
  | { type: 'unsubscribe'; agent_id: string }

export type RuntimeResponse =
  | { type: 'agent'; agent: Agent }
  | { type: 'agents'; agents: Agent[] }
  | { type: 'agent_optional'; agent: Agent | null }
  | { type: 'success' }
  | { type: 'error'; message: string }

export type RuntimeEvent =
  | { type: 'agent_status'; agent_id: string; status: Agent['status'] }
  | { type: 'agent_message'; agent_id: string; message: AgentMessage }
  | { type: 'agent_plan'; agent_id: string; plan: Plan }
  | { type: 'agent_git'; agent_id: string; git_info: GitInfo }
  | { type: 'agent_code_change'; agent_id: string; change: CodeChange }
