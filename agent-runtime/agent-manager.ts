import { EventEmitter } from "events";
import { v4 as uuidv4 } from "uuid";
import simpleGit, { SimpleGit } from "simple-git";
import { spawn, ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";
import type {
  AgentConfig,
  Agent,
  AgentMessage,
  Plan,
  PlanTask,
  GitInfo,
  CodeChange,
  ToolActivity,
  Session,
  PendingInputRequest,
  MCPServerConfig,
  MCPTool,
  ModelInfo,
  AgentStatus,
  RalphLoopConfig,
  RalphLoopState,
  SteerMode,
  QueuedMessage,
  MessageQueueState,
} from "./types";

// =============================================================================
// Running Agent State
// =============================================================================

interface RunningAgent {
  agent: Agent;
  process?: ChildProcess;
  abortController?: AbortController;
  git: SimpleGit;
  planWatcher?: fs.FSWatcher;

  // Claude Code specific
  claudeClient?: unknown;
  sessionId?: string;

  // Codex specific
  codexClient?: unknown;
  codexThread?: unknown;
  threadId?: string;

  // Pending input resolver
  inputResolver?: (response: string) => void;

  // Active MCP servers
  mcpServers?: Map<string, MCPServerConfig>;

  // Ralph Wiggum mode
  ralphConfig?: RalphLoopConfig;
  ralphLoopActive?: boolean;
  ralphCancelled?: boolean;

  // Prompt steering / Message queue
  messageQueue: QueuedMessage[];
  steerMode: SteerMode;
  processingQueue: boolean;
  interruptRequested: boolean;
}

// =============================================================================
// Session Storage
// =============================================================================

interface StoredSession {
  id: string;
  agent_id: string;
  agent_type: "claude-code" | "codex";
  created_at: string;
  last_activity: string;
  messages_count: number;
  working_dir: string;
  config: AgentConfig;
}

// =============================================================================
// Agent Manager
// =============================================================================

export class AgentManager extends EventEmitter {
  private agents: Map<string, RunningAgent> = new Map();
  private sessions: Map<string, StoredSession> = new Map();
  private sessionsDir: string;

  constructor() {
    super();
    // Store sessions in user's home directory
    this.sessionsDir = path.join(
      process.env.HOME || process.env.USERPROFILE || ".",
      ".orkis",
      "sessions"
    );
    this.ensureSessionsDir();
    this.loadSessions();
  }

  private ensureSessionsDir(): void {
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  private loadSessions(): void {
    try {
      const files = fs.readdirSync(this.sessionsDir);
      for (const file of files) {
        if (file.endsWith(".json")) {
          const content = fs.readFileSync(
            path.join(this.sessionsDir, file),
            "utf-8"
          );
          const session: StoredSession = JSON.parse(content);
          this.sessions.set(session.id, session);
        }
      }
    } catch {
      // Sessions dir doesn't exist or is empty
    }
  }

  private saveSession(session: StoredSession): void {
    const filePath = path.join(this.sessionsDir, `${session.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(session, null, 2));
  }

  private deleteSessionFile(sessionId: string): void {
    const filePath = path.join(this.sessionsDir, `${sessionId}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  // ===========================================================================
  // Agent Lifecycle
  // ===========================================================================

  async startAgent(config: AgentConfig): Promise<Agent> {
    const id = uuidv4();
    const sessionId = uuidv4();
    const git = simpleGit(config.working_dir);

    const agent: Agent = {
      id,
      agent_type: config.agent_type,
      name: config.name,
      status: "idle",
      working_dir: config.working_dir,
      started_at: new Date().toISOString(),
      plans: [],
      messages: [],
      code_changes: [],
      tool_activities: [],
      session_id: sessionId,
      config,
    };

    // Get initial git info
    agent.git_info = await this.fetchGitInfo(git);

    // Initialize queue state on the agent
    const initialQueueState: MessageQueueState = {
      messages: [],
      steerMode: "immediate",
      processingQueue: false,
      selectedIndex: -1,
    };
    agent.queue_state = initialQueueState;

    const runningAgent: RunningAgent = {
      agent,
      git,
      sessionId,
      mcpServers: new Map(),
      messageQueue: [],
      steerMode: "immediate",
      processingQueue: false,
      interruptRequested: false,
    };

    this.agents.set(id, runningAgent);

    // Start watching for plan.md files
    this.watchForPlans(runningAgent);

    // Start the appropriate agent
    if (config.agent_type === "claude-code") {
      await this.startClaudeCode(runningAgent, config);
    } else {
      await this.startCodex(runningAgent, config);
    }

    // Store session
    const storedSession: StoredSession = {
      id: sessionId,
      agent_id: id,
      agent_type: config.agent_type,
      created_at: agent.started_at,
      last_activity: agent.started_at,
      messages_count: 0,
      working_dir: config.working_dir,
      config,
    };
    this.sessions.set(sessionId, storedSession);
    this.saveSession(storedSession);

    // Emit session created event
    this.emit("agent:session_created", {
      agent_id: id,
      session: this.toSession(storedSession),
    });

    return agent;
  }

  // ===========================================================================
  // Claude Code Implementation
  // ===========================================================================

  private async startClaudeCode(
    runningAgent: RunningAgent,
    config: AgentConfig
  ): Promise<void> {
    const { agent } = runningAgent;

    try {
      await this.startClaudeCodeWithSdk(runningAgent, config);
    } catch (error) {
      agent.status = "error";
      this.emit("agent:status", { agent_id: agent.id, status: "error" });
      throw error;
    }
  }

  private async startClaudeCodeWithSdk(
    runningAgent: RunningAgent,
    config: AgentConfig
  ): Promise<void> {
    const { agent } = runningAgent;
    const claudeConfig = config.claude_config || {};

    try {
      const { query } = await import("@anthropic-ai/claude-agent-sdk");

      agent.status = "running";
      this.emit("agent:status", { agent_id: agent.id, status: "running" });

      const abortController = new AbortController();
      runningAgent.abortController = abortController;

      // Build SDK options
      const sdkOptions: Record<string, unknown> = {
        cwd: config.working_dir,
        abortController,
        model: config.model || claudeConfig.model,
      };

      // System prompt
      if (claudeConfig.systemPrompt) {
        sdkOptions.systemPrompt = claudeConfig.systemPrompt;
      }

      // Max turns
      if (claudeConfig.maxTurns) {
        sdkOptions.maxTurns = claudeConfig.maxTurns;
      }

      // Allowed tools
      if (claudeConfig.allowedTools && claudeConfig.allowedTools.length > 0) {
        sdkOptions.allowedTools = claudeConfig.allowedTools;
      }

      // Permission mode
      if (claudeConfig.permissionMode) {
        sdkOptions.permissionMode = claudeConfig.permissionMode;
      }

      // MCP servers
      if (claudeConfig.mcpServers) {
        sdkOptions.mcpServers = claudeConfig.mcpServers;
        // Track MCP servers
        for (const [name, serverConfig] of Object.entries(
          claudeConfig.mcpServers
        )) {
          runningAgent.mcpServers?.set(name, serverConfig);
        }
      }

      // Custom subagents
      if (claudeConfig.agents) {
        sdkOptions.agents = claudeConfig.agents;
      }

      // Session resume
      if (claudeConfig.resume) {
        sdkOptions.resume = claudeConfig.resume;
        runningAgent.sessionId = claudeConfig.resume;
        agent.session_id = claudeConfig.resume;
      }

      // Settings sources
      if (claudeConfig.settingSources) {
        sdkOptions.settingSources = claudeConfig.settingSources;
      }

      // Context options
      if (claudeConfig.contextWindowFraction) {
        sdkOptions.contextWindowFraction = claudeConfig.contextWindowFraction;
      }
      if (claudeConfig.maxContextTokens) {
        sdkOptions.maxContextTokens = claudeConfig.maxContextTokens;
      }

      // Build hooks with our tracking hooks
      const hooks: Record<string, unknown[]> = {};

      // PreToolUse hook for tracking and validation
      hooks.PreToolUse = [
        {
          hooks: [
            async (input: any) => {
              const activity: ToolActivity = {
                id: uuidv4(),
                tool_name: input.tool_name,
                tool_input: input.tool_input,
                status: "running",
                started_at: new Date().toISOString(),
              };
              agent.tool_activities.push(activity);
              this.emit("agent:tool_start", { agent_id: agent.id, activity });
              return {};
            },
          ],
        },
      ];

      // PostToolUse hook for tracking results
      hooks.PostToolUse = [
        {
          hooks: [
            async (input: any) => {
              // Find and update the activity
              const activity = agent.tool_activities.find(
                (a) => a.tool_name === input.tool_name && a.status === "running"
              );
              if (activity) {
                activity.status = "completed";
                activity.completed_at = new Date().toISOString();
                activity.duration_ms =
                  new Date(activity.completed_at).getTime() -
                  new Date(activity.started_at).getTime();
                this.emit("agent:tool_end", { agent_id: agent.id, activity });
              }

              // Track message
              const message: AgentMessage = {
                id: uuidv4(),
                message_type: "tool",
                content: JSON.stringify(input, null, 2),
                timestamp: new Date().toISOString(),
                tool_name: input.tool_name,
                tool_input: input.tool_input,
                tool_use_id: input.tool_use_id,
              };
              agent.messages.push(message);
              this.emit("agent:message", { agent_id: agent.id, message });

              // Track code changes
              if (["Edit", "Write"].includes(input.tool_name)) {
                const filePath = (input.tool_input as { file_path?: string })
                  ?.file_path;
                if (filePath) {
                  await this.trackCodeChange(runningAgent, filePath);
                }
              }

              // Update session
              this.updateSessionActivity(runningAgent.sessionId!);

              return {};
            },
          ],
        },
      ];

      // Stop hook
      hooks.Stop = [
        {
          hooks: [
            async () => {
              agent.status = "idle";
              this.emit("agent:status", { agent_id: agent.id, status: "idle" });
              // Refresh git info
              agent.git_info = await this.fetchGitInfo(runningAgent.git);
              this.emit("agent:git", {
                agent_id: agent.id,
                git_info: agent.git_info,
              });
              return {};
            },
          ],
        },
      ];

      // Merge user hooks with our tracking hooks
      if (claudeConfig.hooks) {
        for (const [event, matchers] of Object.entries(claudeConfig.hooks)) {
          if (hooks[event]) {
            hooks[event] = [...hooks[event], ...(matchers as unknown[])];
          } else {
            hooks[event] = matchers as unknown[];
          }
        }
      }

      sdkOptions.hooks = hooks;

      // Run the agent query
      const result = query({
        prompt: config.prompt || "Hello",
        options: sdkOptions,
      });

      // Process messages from the agent
      for await (const message of result) {
        const msg = message as any;
        if (msg.type === "system" && msg.subtype === "init") {
          // Capture session ID
          runningAgent.sessionId = msg.session_id;
          agent.session_id = msg.session_id;
        } else if (msg.type === "assistant") {
          const assistantMessage: AgentMessage = {
            id: msg.uuid || uuidv4(),
            message_type: "assistant",
            content: this.extractTextContent(msg.message),
            timestamp: new Date().toISOString(),
          };
          agent.messages.push(assistantMessage);
          this.emit("agent:message", {
            agent_id: agent.id,
            message: assistantMessage,
          });
          this.updateSessionActivity(runningAgent.sessionId!);
        } else if (msg.type === "result") {
          agent.status = "idle";
          this.emit("agent:status", { agent_id: agent.id, status: "idle" });
        }
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        throw error;
      }
    }
  }

  private extractTextContent(message: unknown): string {
    if (typeof message === "string") return message;
    if (Array.isArray(message)) {
      return message
        .filter((block: { type: string }) => block.type === "text")
        .map((block: { text: string }) => block.text)
        .join("\n");
    }
    if (message && typeof message === "object" && "content" in message) {
      return this.extractTextContent(
        (message as { content: unknown }).content
      );
    }
    return JSON.stringify(message);
  }

  // ===========================================================================
  // Codex Implementation
  // ===========================================================================

  private async startCodex(
    runningAgent: RunningAgent,
    config: AgentConfig
  ): Promise<void> {
    const { agent } = runningAgent;

    try {
      await this.startCodexWithSdk(runningAgent, config);
    } catch (error) {
      agent.status = "error";
      this.emit("agent:status", { agent_id: agent.id, status: "error" });
      throw error;
    }
  }

  private async startCodexWithSdk(
    runningAgent: RunningAgent,
    config: AgentConfig
  ): Promise<void> {
    const { agent } = runningAgent;
    const codexConfig = config.codex_config || {};

    try {
      const { Codex } = await import("@openai/codex-sdk");

      agent.status = "running";
      this.emit("agent:status", { agent_id: agent.id, status: "running" });

      // Build Codex options
      const codexOptions: Record<string, unknown> = {};

      if (config.model || codexConfig.model) {
        codexOptions.model = config.model || codexConfig.model;
      }

      if (codexConfig.approvalMode) {
        codexOptions.approvalMode = codexConfig.approvalMode;
      }

      if (codexConfig.sandboxMode) {
        codexOptions.sandboxMode = codexConfig.sandboxMode;
      }

      if (codexConfig.webSearch) {
        codexOptions.webSearch = codexConfig.webSearch;
      }

      if (codexConfig.fullAuto) {
        codexOptions.fullAuto = codexConfig.fullAuto;
      }

      if (codexConfig.additionalDirs && codexConfig.additionalDirs.length > 0) {
        codexOptions.additionalDirs = codexConfig.additionalDirs;
      }

      // Create Codex instance
      const codex = new Codex(codexOptions);
      runningAgent.codexClient = codex;

      // Start or resume thread
      let thread: unknown;
      if (codexConfig.resumeThreadId) {
        thread = codex.resumeThread(codexConfig.resumeThreadId);
        runningAgent.threadId = codexConfig.resumeThreadId;
        agent.thread_id = codexConfig.resumeThreadId;
      } else {
        thread = codex.startThread();
        // Thread ID will be available after first run
      }
      runningAgent.codexThread = thread;

      const prompt = config.prompt || "Hello";

      // Run the thread with the prompt
      const result = await (thread as { run: (p: string) => Promise<unknown> }).run(prompt);

      // Extract thread ID if available
      if ((thread as { id?: string }).id) {
        runningAgent.threadId = (thread as { id: string }).id;
        agent.thread_id = runningAgent.threadId;
      }

      // Process the result
      this.processCodexResult(runningAgent, result);

      agent.status = "idle";
      this.emit("agent:status", { agent_id: agent.id, status: "idle" });

      // Refresh git info
      agent.git_info = await this.fetchGitInfo(runningAgent.git);
      this.emit("agent:git", { agent_id: agent.id, git_info: agent.git_info });

      // Update session
      this.updateSessionActivity(runningAgent.sessionId!);
    } catch (error) {
      throw error;
    }
  }

  private processCodexResult(runningAgent: RunningAgent, result: unknown): void {
    const { agent } = runningAgent;

    if (typeof result === "string") {
      const message: AgentMessage = {
        id: uuidv4(),
        message_type: "assistant",
        content: result,
        timestamp: new Date().toISOString(),
      };
      agent.messages.push(message);
      this.emit("agent:message", { agent_id: agent.id, message });
      return;
    }

    if (result && typeof result === "object") {
      const typedResult = result as {
        items?: Array<{ type: string; text?: string; tool?: string; input?: unknown; output?: unknown }>;
        finalResponse?: string;
      };

      // Process items if available
      if (typedResult.items && Array.isArray(typedResult.items)) {
        for (const item of typedResult.items) {
          if (item.type === "reasoning") {
            const reasoningMessage: AgentMessage = {
              id: uuidv4(),
              message_type: "system",
              content: item.text || "",
              timestamp: new Date().toISOString(),
            };
            agent.messages.push(reasoningMessage);
            this.emit("agent:message", {
              agent_id: agent.id,
              message: reasoningMessage,
            });
          } else if (item.type === "agent_message") {
            const agentMessage: AgentMessage = {
              id: uuidv4(),
              message_type: "assistant",
              content: item.text || "",
              timestamp: new Date().toISOString(),
            };
            agent.messages.push(agentMessage);
            this.emit("agent:message", {
              agent_id: agent.id,
              message: agentMessage,
            });
          } else if (item.type === "tool_use") {
            const activity: ToolActivity = {
              id: uuidv4(),
              tool_name: item.tool || "unknown",
              tool_input: item.input,
              tool_result: item.output,
              status: "completed",
              started_at: new Date().toISOString(),
              completed_at: new Date().toISOString(),
            };
            agent.tool_activities.push(activity);
            this.emit("agent:tool_end", { agent_id: agent.id, activity });

            const toolMessage: AgentMessage = {
              id: uuidv4(),
              message_type: "tool",
              content: JSON.stringify({ tool: item.tool, input: item.input, output: item.output }, null, 2),
              timestamp: new Date().toISOString(),
              tool_name: item.tool,
              tool_input: item.input,
              tool_result: item.output,
            };
            agent.messages.push(toolMessage);
            this.emit("agent:message", { agent_id: agent.id, message: toolMessage });
          }
        }
      }

      // Process final response
      if (typedResult.finalResponse) {
        const message: AgentMessage = {
          id: uuidv4(),
          message_type: "assistant",
          content: typedResult.finalResponse,
          timestamp: new Date().toISOString(),
        };
        agent.messages.push(message);
        this.emit("agent:message", { agent_id: agent.id, message });
      } else if (!typedResult.items) {
        // Fallback: stringify the entire result
        const message: AgentMessage = {
          id: uuidv4(),
          message_type: "assistant",
          content: JSON.stringify(result, null, 2),
          timestamp: new Date().toISOString(),
        };
        agent.messages.push(message);
        this.emit("agent:message", { agent_id: agent.id, message });
      }
    }
  }

  // ===========================================================================
  // Interactive Messaging
  // ===========================================================================

  async sendMessage(agentId: string, message: string): Promise<void> {
    const runningAgent = this.agents.get(agentId);
    if (!runningAgent) return;

    const { agent } = runningAgent;

    // Add user message
    const userMessage: AgentMessage = {
      id: uuidv4(),
      message_type: "user",
      content: message,
      timestamp: new Date().toISOString(),
    };
    agent.messages.push(userMessage);
    this.emit("agent:message", { agent_id: agent.id, message: userMessage });

    // Send to the appropriate agent
    if (agent.agent_type === "claude-code") {
      await this.sendClaudeCodeMessage(runningAgent, message);
    } else {
      await this.sendCodexMessage(runningAgent, message);
    }
  }

  private async sendClaudeCodeMessage(
    runningAgent: RunningAgent,
    message: string
  ): Promise<void> {
    const { agent } = runningAgent;

    try {
      const { query } = await import("@anthropic-ai/claude-agent-sdk");

      agent.status = "running";
      this.emit("agent:status", { agent_id: agent.id, status: "running" });

      // Resume the session and send the new message
      const result = query({
        prompt: message,
        options: {
          cwd: agent.working_dir,
          resume: runningAgent.sessionId,
          abortController: runningAgent.abortController,
          hooks: {
            PostToolUse: [
              {
                hooks: [
                  async (input: any) => {
                    const toolMessage: AgentMessage = {
                      id: uuidv4(),
                      message_type: "tool",
                      content: JSON.stringify(input, null, 2),
                      timestamp: new Date().toISOString(),
                      tool_name: input.tool_name,
                      tool_input: input.tool_input,
                      tool_use_id: input.tool_use_id,
                    };
                    agent.messages.push(toolMessage);
                    this.emit("agent:message", {
                      agent_id: agent.id,
                      message: toolMessage,
                    });

                    if (["Edit", "Write"].includes(input.tool_name)) {
                      const filePath = (input.tool_input as { file_path?: string })
                        ?.file_path;
                      if (filePath) {
                        await this.trackCodeChange(runningAgent, filePath);
                      }
                    }

                    return {};
                  },
                ],
              },
            ],
            Stop: [
              {
                hooks: [
                  async () => {
                    agent.status = "idle";
                    this.emit("agent:status", {
                      agent_id: agent.id,
                      status: "idle",
                    });
                    agent.git_info = await this.fetchGitInfo(runningAgent.git);
                    this.emit("agent:git", {
                      agent_id: agent.id,
                      git_info: agent.git_info,
                    });
                    return {};
                  },
                ],
              },
            ],
          },
        },
      });

      for await (const sdkMsg of result) {
        const msg = sdkMsg as any;
        if (msg.type === "assistant") {
          const assistantMessage: AgentMessage = {
            id: msg.uuid || uuidv4(),
            message_type: "assistant",
            content: this.extractTextContent(msg.message),
            timestamp: new Date().toISOString(),
          };
          agent.messages.push(assistantMessage);
          this.emit("agent:message", {
            agent_id: agent.id,
            message: assistantMessage,
          });
        } else if (msg.type === "result") {
          agent.status = "idle";
          this.emit("agent:status", { agent_id: agent.id, status: "idle" });
        }
      }

      this.updateSessionActivity(runningAgent.sessionId!);
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        agent.status = "error";
        this.emit("agent:status", { agent_id: agent.id, status: "error" });
        throw error;
      }
    }
  }

  private async sendCodexMessage(
    runningAgent: RunningAgent,
    message: string
  ): Promise<void> {
    const { agent } = runningAgent;

    try {
      agent.status = "running";
      this.emit("agent:status", { agent_id: agent.id, status: "running" });

      // Continue the thread with the new message
      if (runningAgent.codexThread) {
        const result = await (runningAgent.codexThread as { run: (p: string) => Promise<unknown> }).run(message);
        this.processCodexResult(runningAgent, result);
      }

      agent.status = "idle";
      this.emit("agent:status", { agent_id: agent.id, status: "idle" });

      agent.git_info = await this.fetchGitInfo(runningAgent.git);
      this.emit("agent:git", { agent_id: agent.id, git_info: agent.git_info });

      this.updateSessionActivity(runningAgent.sessionId!);
    } catch (error) {
      agent.status = "error";
      this.emit("agent:status", { agent_id: agent.id, status: "error" });
      throw error;
    }
  }

  // ===========================================================================
  // Input Response Handling
  // ===========================================================================

  async respondToInput(
    agentId: string,
    inputId: string,
    response: string
  ): Promise<void> {
    const runningAgent = this.agents.get(agentId);
    if (!runningAgent) return;

    const { agent } = runningAgent;

    // Clear pending input
    agent.pending_input = undefined;

    // Emit response event
    this.emit("agent:input_response", {
      agent_id: agent.id,
      input_id: inputId,
      response,
    });

    // Resolve the input if there's a resolver
    if (runningAgent.inputResolver) {
      runningAgent.inputResolver(response);
      runningAgent.inputResolver = undefined;
    }
  }

  // ===========================================================================
  // Agent Lifecycle Management
  // ===========================================================================

  async stopAgent(agentId: string): Promise<void> {
    const runningAgent = this.agents.get(agentId);
    if (!runningAgent) return;

    const { agent, process, abortController, planWatcher } = runningAgent;

    // Stop the process
    if (abortController) {
      abortController.abort();
    }

    if (process) {
      process.kill("SIGTERM");
    }

    // Stop watching for plans
    if (planWatcher) {
      planWatcher.close();
    }

    agent.status = "stopped";
    this.emit("agent:status", { agent_id: agent.id, status: "stopped" });
  }

  stopAll(): void {
    for (const agentId of this.agents.keys()) {
      this.stopAgent(agentId);
    }
  }

  listAgents(): Agent[] {
    return Array.from(this.agents.values()).map((ra) => ra.agent);
  }

  getAgent(agentId: string): Agent | null {
    return this.agents.get(agentId)?.agent || null;
  }

  // ===========================================================================
  // Session Management
  // ===========================================================================

  listSessions(workingDir?: string): Session[] {
    const sessions: Session[] = [];
    for (const stored of this.sessions.values()) {
      if (!workingDir || stored.working_dir === workingDir) {
        sessions.push(this.toSession(stored));
      }
    }
    return sessions.sort(
      (a, b) =>
        new Date(b.last_activity).getTime() -
        new Date(a.last_activity).getTime()
    );
  }

  private toSession(stored: StoredSession): Session {
    return {
      id: stored.id,
      agent_id: stored.agent_id,
      created_at: stored.created_at,
      last_activity: stored.last_activity,
      messages_count: stored.messages_count,
      working_dir: stored.working_dir,
      can_resume: true,
    };
  }

  private updateSessionActivity(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.last_activity = new Date().toISOString();
      session.messages_count++;
      this.saveSession(session);
    }
  }

  async resumeSession(sessionId: string): Promise<Agent | null> {
    const stored = this.sessions.get(sessionId);
    if (!stored) return null;

    // Start agent with resume option
    const config: AgentConfig = {
      ...stored.config,
    };

    if (stored.agent_type === "claude-code") {
      config.claude_config = {
        ...config.claude_config,
        resume: sessionId,
      };
    } else {
      config.codex_config = {
        ...config.codex_config,
        resumeThreadId: sessionId,
      };
    }

    const agent = await this.startAgent(config);

    this.emit("agent:session_resumed", {
      agent_id: agent.id,
      session: this.toSession(stored),
    });

    return agent;
  }

  async forkSession(sessionId: string, newName?: string): Promise<Agent | null> {
    const stored = this.sessions.get(sessionId);
    if (!stored) return null;

    // Start a new agent with forked session (Claude Code only)
    const config: AgentConfig = {
      ...stored.config,
      name: newName || `${stored.config.name} (fork)`,
    };

    if (stored.agent_type === "claude-code") {
      config.claude_config = {
        ...config.claude_config,
        fork: sessionId,
      };
    }

    return this.startAgent(config);
  }

  deleteSession(sessionId: string): boolean {
    const stored = this.sessions.get(sessionId);
    if (!stored) return false;

    this.sessions.delete(sessionId);
    this.deleteSessionFile(sessionId);
    return true;
  }

  // ===========================================================================
  // Git Operations
  // ===========================================================================

  private async fetchGitInfo(git: SimpleGit): Promise<GitInfo> {
    try {
      const [branch, status, log, remotes] = await Promise.all([
        git.branchLocal(),
        git.status(),
        git.log({ maxCount: 1 }),
        git.getRemotes(true),
      ]);

      const remote = remotes.length > 0 ? remotes[0] : undefined;

      return {
        branch: branch.current,
        uncommitted_changes: status.files.length,
        staged_changes: status.staged.length,
        untracked_files: status.not_added.length,
        last_commit: log.latest
          ? {
              hash: log.latest.hash,
              message: log.latest.message,
              author: log.latest.author_name,
              date: new Date(log.latest.date).toISOString(),
            }
          : undefined,
        remote: remote
          ? {
              name: remote.name,
              url: remote.refs.fetch || remote.refs.push || "",
            }
          : undefined,
      };
    } catch {
      return {
        branch: "unknown",
        uncommitted_changes: 0,
      };
    }
  }

  async getGitInfo(workingDir: string): Promise<GitInfo> {
    const git = simpleGit(workingDir);
    return this.fetchGitInfo(git);
  }

  async getGitDiff(workingDir: string): Promise<string> {
    const git = simpleGit(workingDir);
    try {
      const diff = await git.diff();
      return diff;
    } catch {
      return "";
    }
  }

  async commitChanges(agentId: string, message: string): Promise<boolean> {
    const runningAgent = this.agents.get(agentId);
    if (!runningAgent) return false;

    try {
      await runningAgent.git.add(".");
      await runningAgent.git.commit(message);

      // Update git info
      runningAgent.agent.git_info = await this.fetchGitInfo(runningAgent.git);
      this.emit("agent:git", {
        agent_id: agentId,
        git_info: runningAgent.agent.git_info,
      });

      return true;
    } catch {
      return false;
    }
  }

  // ===========================================================================
  // Plan Watching
  // ===========================================================================

  private watchForPlans(runningAgent: RunningAgent): void {
    const { agent } = runningAgent;
    const planPatterns = ["plan.md", "PLAN.md", ".claude/plan.md"];

    // Check for existing plans
    for (const pattern of planPatterns) {
      const planPath = path.join(agent.working_dir, pattern);
      if (fs.existsSync(planPath)) {
        this.loadPlan(runningAgent, planPath);
      }
    }

    // Watch for new/updated plans
    try {
      const watcher = fs.watch(
        agent.working_dir,
        { recursive: true },
        (eventType, filename) => {
          if (
            filename &&
            planPatterns.some((p) => filename.endsWith(p.replace(/^\.\//, "")))
          ) {
            const planPath = path.join(agent.working_dir, filename);
            if (fs.existsSync(planPath)) {
              this.loadPlan(runningAgent, planPath);
            }
          }
        }
      );
      runningAgent.planWatcher = watcher;
    } catch {
      // Watching not supported on this platform
    }
  }

  private loadPlan(runningAgent: RunningAgent, planPath: string): void {
    try {
      const content = fs.readFileSync(planPath, "utf-8");
      const existingPlan = runningAgent.agent.plans.find(
        (p) => p.file_path === planPath
      );

      if (existingPlan) {
        existingPlan.content = content;
        existingPlan.updated_at = new Date().toISOString();
        existingPlan.tasks = this.parsePlanTasks(content);
      } else {
        const plan: Plan = {
          id: uuidv4(),
          content,
          file_path: planPath,
          created_at: new Date().toISOString(),
          tasks: this.parsePlanTasks(content),
        };
        runningAgent.agent.plans.push(plan);
        this.emit("agent:plan", { agent_id: runningAgent.agent.id, plan });
      }
    } catch {
      // File couldn't be read
    }
  }

  private parsePlanTasks(content: string): PlanTask[] {
    const tasks: PlanTask[] = [];
    const lines = content.split("\n");

    for (const line of lines) {
      // Match markdown checkboxes: - [ ] task or - [x] task
      const match = line.match(/^[-*]\s*\[([ xX])\]\s*(.+)$/);
      if (match) {
        const isCompleted = match[1].toLowerCase() === "x";
        const taskContent = match[2].trim();
        tasks.push({
          id: uuidv4(),
          content: taskContent,
          status: isCompleted ? "completed" : "pending",
        });
      }
    }

    return tasks;
  }

  // ===========================================================================
  // Code Change Tracking
  // ===========================================================================

  private async trackCodeChange(
    runningAgent: RunningAgent,
    filePath: string
  ): Promise<void> {
    const { agent, git } = runningAgent;

    try {
      const diff = await git.diff(["--stat", "--", filePath]);
      const match = diff.match(
        /(\d+) insertions?\(\+\)(?:, (\d+) deletions?\(-\))?/
      );

      const existed = fs.existsSync(path.join(agent.working_dir, filePath));

      const change: CodeChange = {
        file_path: filePath,
        lines_added: match ? parseInt(match[1], 10) : 0,
        lines_removed: match && match[2] ? parseInt(match[2], 10) : 0,
        timestamp: new Date().toISOString(),
        change_type: existed ? "modified" : "created",
      };

      agent.code_changes.push(change);
      this.emit("agent:code_change", { agent_id: agent.id, change });

      // Update git info
      agent.git_info = await this.fetchGitInfo(git);
      this.emit("agent:git", { agent_id: agent.id, git_info: agent.git_info });
    } catch {
      // Couldn't get diff stats
    }
  }

  // ===========================================================================
  // MCP Server Management
  // ===========================================================================

  async addMCPServer(
    agentId: string,
    name: string,
    config: MCPServerConfig
  ): Promise<boolean> {
    const runningAgent = this.agents.get(agentId);
    if (!runningAgent) return false;

    runningAgent.mcpServers?.set(name, config);
    return true;
  }

  async removeMCPServer(agentId: string, name: string): Promise<boolean> {
    const runningAgent = this.agents.get(agentId);
    if (!runningAgent) return false;

    return runningAgent.mcpServers?.delete(name) || false;
  }

  async listMCPTools(agentId: string): Promise<MCPTool[]> {
    const runningAgent = this.agents.get(agentId);
    if (!runningAgent) return [];

    // Return available MCP tools
    // This would need actual MCP server communication in production
    return [];
  }

  // ===========================================================================
  // Available Tools and Models
  // ===========================================================================

  getAvailableTools(): string[] {
    return [
      "Read",
      "Write",
      "Edit",
      "Bash",
      "Glob",
      "Grep",
      "WebSearch",
      "WebFetch",
      "AskUserQuestion",
      "Task",
      "NotebookEdit",
      "TodoWrite",
      "KillShell",
      "Skill",
    ];
  }

  getAvailableModels(): ModelInfo[] {
    return [
      {
        id: "claude-sonnet-4-20250514",
        name: "Claude Sonnet 4",
        provider: "anthropic",
        context_window: 200000,
        supports_images: true,
        supports_tools: true,
      },
      {
        id: "claude-opus-4-20250514",
        name: "Claude Opus 4",
        provider: "anthropic",
        context_window: 200000,
        supports_images: true,
        supports_tools: true,
      },
      {
        id: "claude-3-5-sonnet-20241022",
        name: "Claude 3.5 Sonnet",
        provider: "anthropic",
        context_window: 200000,
        supports_images: true,
        supports_tools: true,
      },
      {
        id: "gpt-5-codex",
        name: "GPT-5 Codex",
        provider: "openai",
        context_window: 128000,
        supports_images: true,
        supports_tools: true,
      },
      {
        id: "gpt-5",
        name: "GPT-5",
        provider: "openai",
        context_window: 128000,
        supports_images: true,
        supports_tools: true,
      },
    ];
  }

  // ===========================================================================
  // Configuration Validation
  // ===========================================================================

  validateConfig(config: AgentConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.name || config.name.trim() === "") {
      errors.push("Agent name is required");
    }

    if (!config.working_dir || config.working_dir.trim() === "") {
      errors.push("Working directory is required");
    } else if (!fs.existsSync(config.working_dir)) {
      errors.push(`Working directory does not exist: ${config.working_dir}`);
    }

    if (!["claude-code", "codex"].includes(config.agent_type)) {
      errors.push(`Invalid agent type: ${config.agent_type}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // ===========================================================================
  // Ralph Wiggum Mode (Autonomous Loop)
  // ===========================================================================

  async startRalphLoop(agentId: string, config: RalphLoopConfig): Promise<RalphLoopState | null> {
    const runningAgent = this.agents.get(agentId);
    if (!runningAgent) return null;

    const { agent } = runningAgent;

    // Don't start if already in ralph mode
    if (runningAgent.ralphLoopActive) {
      return agent.ralph_state || null;
    }

    // Initialize ralph state
    const ralphState: RalphLoopState = {
      active: true,
      currentIteration: 0,
      maxIterations: config.maxIterations || 50,
      completionPromise: config.completionPromise,
      originalPrompt: config.prompt,
      startedAt: new Date().toISOString(),
      completionDetected: false,
      errorCount: 0,
    };

    agent.ralph_state = ralphState;
    runningAgent.ralphConfig = config;
    runningAgent.ralphLoopActive = true;
    runningAgent.ralphCancelled = false;

    // Emit ralph loop started event
    this.emit("ralph:loop_started", {
      agent_id: agent.id,
      state: ralphState,
    });

    // Add system message about ralph mode
    const systemMessage: AgentMessage = {
      id: uuidv4(),
      message_type: "system",
      content: `Ralph Wiggum mode activated. Task: "${config.prompt}". Looking for completion signal: "<promise>${config.completionPromise}</promise>". Max iterations: ${ralphState.maxIterations}`,
      timestamp: new Date().toISOString(),
    };
    agent.messages.push(systemMessage);
    this.emit("agent:message", { agent_id: agent.id, message: systemMessage });

    // Build the ralph prompt with completion instructions
    const ralphPrompt = this.buildRalphPrompt(config);

    // Start the loop
    this.runRalphLoop(runningAgent, ralphPrompt, config);

    return ralphState;
  }

  private buildRalphPrompt(config: RalphLoopConfig): string {
    const basePrompt = config.prompt;
    const completionInstruction = `

IMPORTANT: When you have completed the task successfully, output exactly:
<promise>${config.completionPromise}</promise>

This signals that the autonomous loop should stop. Only output this when you are confident the task is fully complete.

${config.systemPromptAddition || ""}`;

    return basePrompt + completionInstruction;
  }

  private async runRalphLoop(
    runningAgent: RunningAgent,
    prompt: string,
    config: RalphLoopConfig
  ): Promise<void> {
    const { agent } = runningAgent;

    while (
      runningAgent.ralphLoopActive &&
      !runningAgent.ralphCancelled &&
      agent.ralph_state &&
      !agent.ralph_state.completionDetected &&
      agent.ralph_state.currentIteration < agent.ralph_state.maxIterations
    ) {
      // Increment iteration
      agent.ralph_state.currentIteration++;

      // Emit iteration event
      this.emit("ralph:loop_iteration", {
        agent_id: agent.id,
        state: agent.ralph_state,
      });

      // Add iteration marker message
      const iterationMessage: AgentMessage = {
        id: uuidv4(),
        message_type: "system",
        content: `[Ralph Loop] Iteration ${agent.ralph_state.currentIteration}/${agent.ralph_state.maxIterations}`,
        timestamp: new Date().toISOString(),
      };
      agent.messages.push(iterationMessage);
      this.emit("agent:message", { agent_id: agent.id, message: iterationMessage });

      try {
        // Send the prompt and wait for completion
        if (agent.agent_type === "claude-code") {
          await this.runRalphIterationClaude(runningAgent, prompt);
        } else {
          await this.runRalphIterationCodex(runningAgent, prompt);
        }

        // Check if completion promise was detected in recent messages
        const recentMessages = agent.messages.slice(-10);
        for (const msg of recentMessages) {
          if (msg.content.includes(`<promise>${config.completionPromise}</promise>`)) {
            agent.ralph_state.completionDetected = true;
            break;
          }
        }

        // Update last iteration summary
        const lastAssistantMsg = [...agent.messages].reverse().find(m => m.message_type === "assistant");
        if (lastAssistantMsg) {
          agent.ralph_state.lastIterationSummary = lastAssistantMsg.content.slice(0, 500);
        }

      } catch (error) {
        agent.ralph_state.errorCount++;

        const errorMessage: AgentMessage = {
          id: uuidv4(),
          message_type: "error",
          content: `[Ralph Loop] Error in iteration ${agent.ralph_state.currentIteration}: ${(error as Error).message}`,
          timestamp: new Date().toISOString(),
        };
        agent.messages.push(errorMessage);
        this.emit("agent:message", { agent_id: agent.id, message: errorMessage });

        this.emit("ralph:loop_error", {
          agent_id: agent.id,
          state: agent.ralph_state,
          error: (error as Error).message,
        });

        // Continue on error if configured
        if (!config.continueOnError) {
          break;
        }
      }

      // Wait between iterations
      if (!agent.ralph_state.completionDetected && !runningAgent.ralphCancelled) {
        await this.sleep(config.iterationDelay || 1000);
      }
    }

    // Determine completion reason
    let reason: "completion_detected" | "max_iterations" | "cancelled" | "error" = "completion_detected";
    if (runningAgent.ralphCancelled) {
      reason = "cancelled";
    } else if (agent.ralph_state && agent.ralph_state.currentIteration >= agent.ralph_state.maxIterations) {
      reason = "max_iterations";
    } else if (agent.ralph_state && agent.ralph_state.errorCount > 0 && !config.continueOnError) {
      reason = "error";
    }

    // Mark loop as complete
    runningAgent.ralphLoopActive = false;
    if (agent.ralph_state) {
      agent.ralph_state.active = false;
    }

    // Emit completion event
    this.emit("ralph:loop_completed", {
      agent_id: agent.id,
      state: agent.ralph_state,
      reason,
    });

    // Add completion message
    const completionMessage: AgentMessage = {
      id: uuidv4(),
      message_type: "system",
      content: `[Ralph Loop] Completed after ${agent.ralph_state?.currentIteration || 0} iterations. Reason: ${reason}`,
      timestamp: new Date().toISOString(),
    };
    agent.messages.push(completionMessage);
    this.emit("agent:message", { agent_id: agent.id, message: completionMessage });
  }

  private async runRalphIterationClaude(
    runningAgent: RunningAgent,
    prompt: string
  ): Promise<void> {
    const { agent } = runningAgent;

    const { query } = await import("@anthropic-ai/claude-agent-sdk");

    agent.status = "running";
    this.emit("agent:status", { agent_id: agent.id, status: "running" });

    const result = query({
      prompt,
      options: {
        cwd: agent.working_dir,
        resume: runningAgent.sessionId,
        abortController: runningAgent.abortController,
        hooks: {
          PostToolUse: [
            {
              hooks: [
                async (input: any) => {
                  const toolMessage: AgentMessage = {
                    id: uuidv4(),
                    message_type: "tool",
                    content: JSON.stringify(input, null, 2),
                    timestamp: new Date().toISOString(),
                    tool_name: input.tool_name,
                    tool_input: input.tool_input,
                    tool_use_id: input.tool_use_id,
                  };
                  agent.messages.push(toolMessage);
                  this.emit("agent:message", {
                    agent_id: agent.id,
                    message: toolMessage,
                  });

                  if (["Edit", "Write"].includes(input.tool_name)) {
                    const filePath = (input.tool_input as { file_path?: string })
                      ?.file_path;
                    if (filePath) {
                      await this.trackCodeChange(runningAgent, filePath);
                    }
                  }

                  return {};
                },
              ],
            },
          ],
          Stop: [
            {
              hooks: [
                async () => {
                  agent.status = "idle";
                  this.emit("agent:status", {
                    agent_id: agent.id,
                    status: "idle",
                  });
                  agent.git_info = await this.fetchGitInfo(runningAgent.git);
                  this.emit("agent:git", {
                    agent_id: agent.id,
                    git_info: agent.git_info,
                  });
                  return {};
                },
              ],
            },
          ],
        },
      },
    });

    for await (const sdkMsg of result) {
      const msg = sdkMsg as any;
      if (msg.type === "assistant") {
        const assistantMessage: AgentMessage = {
          id: msg.uuid || uuidv4(),
          message_type: "assistant",
          content: this.extractTextContent(msg.message),
          timestamp: new Date().toISOString(),
        };
        agent.messages.push(assistantMessage);
        this.emit("agent:message", {
          agent_id: agent.id,
          message: assistantMessage,
        });
      } else if (msg.type === "result") {
        agent.status = "idle";
        this.emit("agent:status", { agent_id: agent.id, status: "idle" });
      }
    }

    this.updateSessionActivity(runningAgent.sessionId!);
  }

  private async runRalphIterationCodex(
    runningAgent: RunningAgent,
    prompt: string
  ): Promise<void> {
    const { agent } = runningAgent;

    agent.status = "running";
    this.emit("agent:status", { agent_id: agent.id, status: "running" });

    if (runningAgent.codexThread) {
      const result = await (runningAgent.codexThread as { run: (p: string) => Promise<unknown> }).run(prompt);
      this.processCodexResult(runningAgent, result);
    }

    agent.status = "idle";
    this.emit("agent:status", { agent_id: agent.id, status: "idle" });

    agent.git_info = await this.fetchGitInfo(runningAgent.git);
    this.emit("agent:git", { agent_id: agent.id, git_info: agent.git_info });

    this.updateSessionActivity(runningAgent.sessionId!);
  }

  cancelRalphLoop(agentId: string): boolean {
    const runningAgent = this.agents.get(agentId);
    if (!runningAgent || !runningAgent.ralphLoopActive) return false;

    runningAgent.ralphCancelled = true;

    const { agent } = runningAgent;
    const cancelMessage: AgentMessage = {
      id: uuidv4(),
      message_type: "system",
      content: "[Ralph Loop] Cancellation requested",
      timestamp: new Date().toISOString(),
    };
    agent.messages.push(cancelMessage);
    this.emit("agent:message", { agent_id: agent.id, message: cancelMessage });

    return true;
  }

  getRalphState(agentId: string): RalphLoopState | null {
    const runningAgent = this.agents.get(agentId);
    if (!runningAgent) return null;

    return runningAgent.agent.ralph_state || null;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ===========================================================================
  // Prompt Steering / Message Queue
  // ===========================================================================

  /**
   * Queue a message to be sent to the agent when it becomes idle
   */
  queueMessage(agentId: string, content: string, priority: "normal" | "high" = "normal"): QueuedMessage | null {
    const runningAgent = this.agents.get(agentId);
    if (!runningAgent) return null;

    const { agent } = runningAgent;

    const queuedMessage: QueuedMessage = {
      id: uuidv4(),
      content,
      timestamp: new Date().toISOString(),
      priority,
    };

    runningAgent.messageQueue.push(queuedMessage);

    // Update agent's queue state
    if (agent.queue_state) {
      agent.queue_state.messages = [...runningAgent.messageQueue];
    }

    // Emit event
    this.emit("queue:message_added", {
      agent_id: agent.id,
      message: queuedMessage,
    });

    // Add system message about queued message
    const systemMessage: AgentMessage = {
      id: uuidv4(),
      message_type: "system",
      content: `[Queue] Message queued: "${content.slice(0, 50)}${content.length > 50 ? '...' : ''}"`,
      timestamp: new Date().toISOString(),
    };
    agent.messages.push(systemMessage);
    this.emit("agent:message", { agent_id: agent.id, message: systemMessage });

    return queuedMessage;
  }

  /**
   * Send a steering message to the agent immediately (mid-turn)
   * This attempts to inject the message into the current conversation
   */
  async sendSteerMessage(agentId: string, message: string): Promise<boolean> {
    const runningAgent = this.agents.get(agentId);
    if (!runningAgent) return false;

    const { agent } = runningAgent;

    // If agent is idle, just send the message normally
    if (agent.status === "idle") {
      await this.sendMessage(agentId, message);
      return true;
    }

    // If agent is running, we need to handle this specially
    // For immediate steering, we interrupt and then send
    if (runningAgent.steerMode === "immediate") {
      // Add system message about steering
      const systemMessage: AgentMessage = {
        id: uuidv4(),
        message_type: "system",
        content: `[Steer] Injecting message mid-turn: "${message.slice(0, 50)}${message.length > 50 ? '...' : ''}"`,
        timestamp: new Date().toISOString(),
      };
      agent.messages.push(systemMessage);
      this.emit("agent:message", { agent_id: agent.id, message: systemMessage });

      // Emit steer message injected event
      this.emit("steer:message_injected", {
        agent_id: agent.id,
        message,
      });

      // Request interrupt and queue the message with high priority
      runningAgent.interruptRequested = true;

      // Queue the message with high priority so it's processed first
      const queuedMsg = this.queueMessage(agentId, message, "high");
      if (queuedMsg) {
        // Move high priority messages to the front
        this.reorderQueueByPriority(runningAgent);
      }

      return true;
    } else {
      // Queue mode - just queue the message
      return this.queueMessage(agentId, message) !== null;
    }
  }

  /**
   * Reorder queue so high priority messages come first
   */
  private reorderQueueByPriority(runningAgent: RunningAgent): void {
    const highPriority = runningAgent.messageQueue.filter(m => m.priority === "high");
    const normalPriority = runningAgent.messageQueue.filter(m => m.priority !== "high");
    runningAgent.messageQueue = [...highPriority, ...normalPriority];

    // Update agent's queue state
    if (runningAgent.agent.queue_state) {
      runningAgent.agent.queue_state.messages = [...runningAgent.messageQueue];
    }
  }

  /**
   * Remove a specific message from the queue
   */
  removeQueuedMessage(agentId: string, messageId: string): boolean {
    const runningAgent = this.agents.get(agentId);
    if (!runningAgent) return false;

    const { agent } = runningAgent;
    const initialLength = runningAgent.messageQueue.length;

    runningAgent.messageQueue = runningAgent.messageQueue.filter(m => m.id !== messageId);

    if (runningAgent.messageQueue.length < initialLength) {
      // Update agent's queue state
      if (agent.queue_state) {
        agent.queue_state.messages = [...runningAgent.messageQueue];
      }

      this.emit("queue:message_removed", {
        agent_id: agent.id,
        message_id: messageId,
      });
      return true;
    }

    return false;
  }

  /**
   * Clear all queued messages
   */
  clearQueue(agentId: string): boolean {
    const runningAgent = this.agents.get(agentId);
    if (!runningAgent) return false;

    const { agent } = runningAgent;

    runningAgent.messageQueue = [];

    // Update agent's queue state
    if (agent.queue_state) {
      agent.queue_state.messages = [];
      agent.queue_state.selectedIndex = -1;
    }

    this.emit("queue:cleared", { agent_id: agent.id });

    // Add system message
    const systemMessage: AgentMessage = {
      id: uuidv4(),
      message_type: "system",
      content: "[Queue] All queued messages cleared",
      timestamp: new Date().toISOString(),
    };
    agent.messages.push(systemMessage);
    this.emit("agent:message", { agent_id: agent.id, message: systemMessage });

    return true;
  }

  /**
   * Process all queued messages
   */
  async processQueue(agentId: string): Promise<void> {
    const runningAgent = this.agents.get(agentId);
    if (!runningAgent) return;

    const { agent } = runningAgent;

    // Don't process if already processing or agent is busy
    if (runningAgent.processingQueue || agent.status === "running") {
      return;
    }

    if (runningAgent.messageQueue.length === 0) {
      return;
    }

    runningAgent.processingQueue = true;
    if (agent.queue_state) {
      agent.queue_state.processingQueue = true;
    }

    this.emit("queue:processing_started", { agent_id: agent.id });

    // Process messages one by one
    while (runningAgent.messageQueue.length > 0 && !runningAgent.interruptRequested) {
      const message = runningAgent.messageQueue.shift();
      if (!message) break;

      // Update agent's queue state
      if (agent.queue_state) {
        agent.queue_state.messages = [...runningAgent.messageQueue];
      }

      this.emit("queue:message_removed", {
        agent_id: agent.id,
        message_id: message.id,
      });

      // Send the message
      await this.sendMessage(agentId, message.content);

      // Wait for the agent to finish processing before sending next
      await this.waitForAgentIdle(runningAgent);
    }

    runningAgent.processingQueue = false;
    if (agent.queue_state) {
      agent.queue_state.processingQueue = false;
    }

    this.emit("queue:processing_completed", { agent_id: agent.id });
  }

  /**
   * Wait for the agent to become idle
   */
  private async waitForAgentIdle(runningAgent: RunningAgent): Promise<void> {
    const maxWaitTime = 300000; // 5 minutes max
    const checkInterval = 100;
    let waited = 0;

    while (runningAgent.agent.status === "running" && waited < maxWaitTime) {
      await this.sleep(checkInterval);
      waited += checkInterval;
    }
  }

  /**
   * Get the current queue state
   */
  getQueueState(agentId: string): MessageQueueState | null {
    const runningAgent = this.agents.get(agentId);
    if (!runningAgent) return null;

    return {
      messages: [...runningAgent.messageQueue],
      steerMode: runningAgent.steerMode,
      processingQueue: runningAgent.processingQueue,
      selectedIndex: runningAgent.agent.queue_state?.selectedIndex ?? -1,
    };
  }

  /**
   * Set the steering mode for an agent
   */
  setSteerMode(agentId: string, mode: SteerMode): boolean {
    const runningAgent = this.agents.get(agentId);
    if (!runningAgent) return false;

    const { agent } = runningAgent;

    runningAgent.steerMode = mode;

    if (agent.queue_state) {
      agent.queue_state.steerMode = mode;
    }

    this.emit("steer:mode_changed", {
      agent_id: agent.id,
      mode,
    });

    // Add system message
    const systemMessage: AgentMessage = {
      id: uuidv4(),
      message_type: "system",
      content: `[Steer] Mode changed to: ${mode === "immediate" ? "Send immediately (mid-turn steering)" : "Queue messages"}`,
      timestamp: new Date().toISOString(),
    };
    agent.messages.push(systemMessage);
    this.emit("agent:message", { agent_id: agent.id, message: systemMessage });

    return true;
  }

  /**
   * Interrupt the current agent operation
   */
  interruptAgent(agentId: string): boolean {
    const runningAgent = this.agents.get(agentId);
    if (!runningAgent) return false;

    const { agent, abortController } = runningAgent;

    if (agent.status !== "running") {
      return false;
    }

    runningAgent.interruptRequested = true;

    // Abort the current operation if possible
    if (abortController) {
      abortController.abort();
    }

    // Create a new abort controller for future operations
    runningAgent.abortController = new AbortController();

    this.emit("agent:interrupted", { agent_id: agent.id });

    // Add system message
    const systemMessage: AgentMessage = {
      id: uuidv4(),
      message_type: "system",
      content: "[Interrupt] Agent operation interrupted",
      timestamp: new Date().toISOString(),
    };
    agent.messages.push(systemMessage);
    this.emit("agent:message", { agent_id: agent.id, message: systemMessage });

    // Reset interrupt flag after a short delay
    setTimeout(() => {
      runningAgent.interruptRequested = false;
    }, 100);

    return true;
  }

  /**
   * Handle user input - routes to appropriate method based on agent status and steer mode
   */
  async handleUserInput(agentId: string, message: string): Promise<void> {
    const runningAgent = this.agents.get(agentId);
    if (!runningAgent) return;

    const { agent } = runningAgent;

    if (agent.status === "idle") {
      // Agent is idle, send directly
      await this.sendMessage(agentId, message);

      // After sending, check if there are queued messages to process
      if (runningAgent.messageQueue.length > 0) {
        // Wait for agent to finish and then process queue
        await this.waitForAgentIdle(runningAgent);
        await this.processQueue(agentId);
      }
    } else {
      // Agent is busy
      if (runningAgent.steerMode === "immediate") {
        // Immediate mode - try to steer the agent
        await this.sendSteerMessage(agentId, message);
      } else {
        // Queue mode - add to queue
        this.queueMessage(agentId, message);
      }
    }
  }
}
