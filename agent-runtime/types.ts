// =============================================================================
// Agent Configuration Types
// =============================================================================

export type AgentType = "claude-code" | "codex";
export type AgentStatus = "idle" | "running" | "stopped" | "error" | "waiting_for_input";

// Permission modes for Claude Code
export type PermissionMode = "default" | "bypassPermissions" | "acceptEdits";

// Approval modes for Codex
export type ApprovalMode = "auto" | "untrusted" | "on-failure" | "on-request" | "never";

// Sandbox modes for Codex
export type SandboxMode = "read-only" | "workspace-write" | "danger-full-access";

// Available tools in Claude Code
export type ClaudeCodeTool =
  | "Read"
  | "Write"
  | "Edit"
  | "Bash"
  | "Glob"
  | "Grep"
  | "WebSearch"
  | "WebFetch"
  | "AskUserQuestion"
  | "Task"
  | "NotebookEdit"
  | "TodoWrite"
  | "KillShell"
  | "Skill";

// =============================================================================
// MCP (Model Context Protocol) Types
// =============================================================================

export interface MCPServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  type?: "stdio" | "sse";
  url?: string;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

// =============================================================================
// Hook Types (Claude Code)
// =============================================================================

export type HookEventName =
  | "PreToolUse"
  | "PostToolUse"
  | "Stop"
  | "SessionStart"
  | "SessionEnd"
  | "UserPromptSubmit";

export interface HookInput {
  tool_name: string;
  tool_input: unknown;
  tool_use_id?: string;
}

export interface HookResult {
  continue?: boolean;
  hookSpecificOutput?: {
    hookEventName: HookEventName;
    permissionDecision?: "allow" | "deny";
    permissionDecisionReason?: string;
    modifiedInput?: unknown;
  };
}

export type HookCallback = (
  input: HookInput,
  toolUseId: string,
  context: unknown
) => Promise<HookResult>;

export interface HookMatcher {
  matcher?: string | RegExp;
  hooks: HookCallback[];
}

export type HooksConfig = Partial<Record<HookEventName, HookMatcher[]>>;

// =============================================================================
// Subagent Types (Claude Code)
// =============================================================================

export interface SubagentDefinition {
  description: string;
  prompt?: string;
  tools?: ClaudeCodeTool[];
  systemPrompt?: string;
  model?: string;
}

export type SubagentsConfig = Record<string, SubagentDefinition>;

// =============================================================================
// Session Types
// =============================================================================

export interface Session {
  id: string;
  agent_id: string;
  created_at: string;
  last_activity: string;
  messages_count: number;
  working_dir: string;
  can_resume: boolean;
}

// =============================================================================
// Agent Configuration
// =============================================================================

export interface ClaudeCodeConfig {
  // Basic options
  prompt?: string;
  systemPrompt?: string;
  model?: string;
  maxTurns?: number;

  // Tools and permissions
  allowedTools?: ClaudeCodeTool[];
  permissionMode?: PermissionMode;

  // MCP servers
  mcpServers?: Record<string, MCPServerConfig>;

  // Hooks
  hooks?: HooksConfig;

  // Subagents
  agents?: SubagentsConfig;

  // Session management
  resume?: string; // Session ID to resume
  fork?: string; // Session ID to fork from

  // Settings sources
  settingSources?: ("project" | "user" | "default")[];

  // Context options
  contextWindowFraction?: number;
  maxContextTokens?: number;
}

export interface CodexConfig {
  // Basic options
  prompt?: string;
  model?: string;

  // Approval and sandbox
  approvalMode?: ApprovalMode;
  sandboxMode?: SandboxMode;

  // Image inputs
  images?: string[];

  // Session management
  resumeThreadId?: string;

  // Additional directories
  additionalDirs?: string[];

  // Feature flags
  webSearch?: boolean;
  fullAuto?: boolean;

  // Config overrides
  configOverrides?: Record<string, unknown>;
}

export interface AgentConfig {
  agent_type: AgentType;
  name: string;
  working_dir: string;
  prompt?: string;
  model?: string;

  // Type-specific configs
  claude_config?: ClaudeCodeConfig;
  codex_config?: CodexConfig;
}

// =============================================================================
// Agent State
// =============================================================================

export interface Agent {
  id: string;
  agent_type: AgentType;
  name: string;
  status: AgentStatus;
  working_dir: string;
  started_at: string;
  plans: Plan[];
  messages: AgentMessage[];
  git_info?: GitInfo;
  code_changes: CodeChange[];

  // Session info
  session_id?: string;
  thread_id?: string; // For Codex

  // Activity tracking
  tool_activities: ToolActivity[];

  // Configuration used
  config?: AgentConfig;

  // Pending input request
  pending_input?: PendingInputRequest;
}

// =============================================================================
// Plan Types
// =============================================================================

export interface Plan {
  id: string;
  content: string;
  file_path: string;
  created_at: string;
  updated_at?: string;
  tasks?: PlanTask[];
}

export interface PlanTask {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed" | "skipped";
  activeForm?: string;
}

// =============================================================================
// Message Types
// =============================================================================

export type MessageType = "user" | "assistant" | "system" | "tool" | "error" | "input_request";

export interface AgentMessage {
  id: string;
  message_type: MessageType;
  content: string;
  timestamp: string;

  // Tool-related fields
  tool_name?: string;
  tool_input?: unknown;
  tool_result?: unknown;
  tool_use_id?: string;

  // For subagent messages
  parent_tool_use_id?: string;
  subagent_id?: string;

  // For input requests
  input_options?: InputOption[];
}

export interface InputOption {
  value: string;
  label: string;
  description?: string;
}

export interface PendingInputRequest {
  id: string;
  prompt: string;
  options?: InputOption[];
  timestamp: string;
}

// =============================================================================
// Tool Activity Types
// =============================================================================

export interface ToolActivity {
  id: string;
  tool_name: string;
  tool_input: unknown;
  tool_result?: unknown;
  status: "pending" | "running" | "completed" | "failed";
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  error?: string;
}

// =============================================================================
// Git Types
// =============================================================================

export interface GitInfo {
  branch: string;
  worktree?: string;
  uncommitted_changes: number;
  staged_changes?: number;
  untracked_files?: number;
  last_commit?: {
    hash: string;
    message: string;
    author: string;
    date: string;
  };
  remote?: {
    name: string;
    url: string;
  };
}

export interface CodeChange {
  file_path: string;
  lines_added: number;
  lines_removed: number;
  timestamp: string;
  change_type?: "created" | "modified" | "deleted";
}

// =============================================================================
// WebSocket Message Types
// =============================================================================

export type RuntimeMessage =
  // Agent lifecycle
  | { type: "start_agent"; config: AgentConfig }
  | { type: "stop_agent"; agent_id: string }
  | { type: "list_agents" }
  | { type: "get_agent"; agent_id: string }

  // Messaging
  | { type: "send_message"; agent_id: string; message: string }
  | { type: "respond_to_input"; agent_id: string; input_id: string; response: string }

  // Session management
  | { type: "list_sessions"; working_dir?: string }
  | { type: "resume_session"; session_id: string }
  | { type: "fork_session"; session_id: string; new_name?: string }
  | { type: "delete_session"; session_id: string }

  // Subscriptions
  | { type: "subscribe"; agent_id: string }
  | { type: "unsubscribe"; agent_id: string }

  // Configuration
  | { type: "get_available_tools" }
  | { type: "get_available_models" }
  | { type: "validate_config"; config: AgentConfig }

  // Git operations
  | { type: "get_git_info"; working_dir: string }
  | { type: "get_git_diff"; working_dir: string }
  | { type: "commit_changes"; agent_id: string; message: string }

  // MCP
  | { type: "list_mcp_tools"; agent_id: string }
  | { type: "add_mcp_server"; agent_id: string; name: string; config: MCPServerConfig }
  | { type: "remove_mcp_server"; agent_id: string; name: string };

export type RuntimeResponse =
  | { type: "agent"; agent: Agent }
  | { type: "agents"; agents: Agent[] }
  | { type: "agent_optional"; agent: Agent | null }
  | { type: "sessions"; sessions: Session[] }
  | { type: "session"; session: Session }
  | { type: "tools"; tools: string[] }
  | { type: "models"; models: ModelInfo[] }
  | { type: "mcp_tools"; tools: MCPTool[] }
  | { type: "git_info"; git_info: GitInfo }
  | { type: "git_diff"; diff: string }
  | { type: "validation"; valid: boolean; errors?: string[] }
  | { type: "success" }
  | { type: "error"; message: string };

export type RuntimeEvent =
  // Status events
  | { type: "agent_status"; agent_id: string; status: AgentStatus }

  // Message events
  | { type: "agent_message"; agent_id: string; message: AgentMessage }
  | { type: "agent_message_stream"; agent_id: string; message_id: string; delta: string }

  // Tool events
  | { type: "agent_tool_start"; agent_id: string; activity: ToolActivity }
  | { type: "agent_tool_end"; agent_id: string; activity: ToolActivity }

  // Plan events
  | { type: "agent_plan"; agent_id: string; plan: Plan }
  | { type: "agent_plan_task_update"; agent_id: string; plan_id: string; task: PlanTask }

  // Git events
  | { type: "agent_git"; agent_id: string; git_info: GitInfo }
  | { type: "agent_code_change"; agent_id: string; change: CodeChange }

  // Input events
  | { type: "agent_input_request"; agent_id: string; request: PendingInputRequest }
  | { type: "agent_input_response"; agent_id: string; input_id: string; response: string }

  // Session events
  | { type: "agent_session_created"; agent_id: string; session: Session }
  | { type: "agent_session_resumed"; agent_id: string; session: Session };

// =============================================================================
// Model Info
// =============================================================================

export interface ModelInfo {
  id: string;
  name: string;
  provider: "anthropic" | "openai";
  context_window?: number;
  supports_images?: boolean;
  supports_tools?: boolean;
}

// =============================================================================
// Skill and Slash Command Types (Claude Code)
// =============================================================================

export interface Skill {
  name: string;
  description: string;
  file_path: string;
  content: string;
}

export interface SlashCommand {
  name: string;
  description: string;
  file_path: string;
  content: string;
}

// =============================================================================
// Plugin Types (Claude Code)
// =============================================================================

export interface Plugin {
  name: string;
  version?: string;
  commands?: SlashCommand[];
  agents?: SubagentsConfig;
  mcpServers?: Record<string, MCPServerConfig>;
}

