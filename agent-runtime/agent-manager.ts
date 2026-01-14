import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'
import simpleGit, { SimpleGit } from 'simple-git'
import { spawn, ChildProcess } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import type {
  AgentConfig,
  Agent,
  AgentMessage,
  Plan,
  GitInfo,
  CodeChange,
} from './types'

interface RunningAgent {
  agent: Agent
  process?: ChildProcess
  abortController?: AbortController
  git: SimpleGit
  planWatcher?: fs.FSWatcher
}

export class AgentManager extends EventEmitter {
  private agents: Map<string, RunningAgent> = new Map()

  async startAgent(config: AgentConfig): Promise<Agent> {
    const id = uuidv4()
    const git = simpleGit(config.working_dir)

    const agent: Agent = {
      id,
      agent_type: config.agent_type,
      name: config.name,
      status: 'idle',
      working_dir: config.working_dir,
      started_at: new Date().toISOString(),
      plans: [],
      messages: [],
      code_changes: [],
    }

    // Get initial git info
    agent.git_info = await this.fetchGitInfo(git)

    const runningAgent: RunningAgent = {
      agent,
      git,
    }

    this.agents.set(id, runningAgent)

    // Start watching for plan.md files
    this.watchForPlans(runningAgent)

    // Start the appropriate agent
    if (config.agent_type === 'claude-code') {
      await this.startClaudeCode(runningAgent, config)
    } else {
      await this.startCodex(runningAgent, config)
    }

    return agent
  }

  private async startClaudeCode(
    runningAgent: RunningAgent,
    config: AgentConfig
  ): Promise<void> {
    const { agent } = runningAgent

    try {
      // Try using the SDK first
      const sdkAvailable = await this.checkClaudeSdkAvailable()

      if (sdkAvailable) {
        await this.startClaudeCodeWithSdk(runningAgent, config)
      } else {
        // Fallback to CLI
        await this.startClaudeCodeWithCli(runningAgent, config)
      }
    } catch (error) {
      agent.status = 'error'
      this.emit('agent:status', { agent_id: agent.id, status: 'error' })
      throw error
    }
  }

  private async checkClaudeSdkAvailable(): Promise<boolean> {
    try {
      await import('@anthropic-ai/claude-agent-sdk')
      return true
    } catch {
      return false
    }
  }

  private async startClaudeCodeWithSdk(
    runningAgent: RunningAgent,
    config: AgentConfig
  ): Promise<void> {
    const { agent } = runningAgent

    try {
      const { query } = await import('@anthropic-ai/claude-agent-sdk')

      agent.status = 'running'
      this.emit('agent:status', { agent_id: agent.id, status: 'running' })

      const abortController = new AbortController()
      runningAgent.abortController = abortController

      // Run the agent query
      const result = query({
        prompt:
          config.prompt || 'Hello, I am ready to help with your coding tasks.',
        options: {
          cwd: config.working_dir,
          abortController,
          model: config.model,
          hooks: {
            PostToolUse: [
              {
                hooks: [
                  async (input) => {
                    // Track tool usage
                    const message: AgentMessage = {
                      id: uuidv4(),
                      message_type: 'tool',
                      content: JSON.stringify(input, null, 2),
                      timestamp: new Date().toISOString(),
                      tool_name: input.tool_name,
                      tool_input: input.tool_input,
                    }
                    agent.messages.push(message)
                    this.emit('agent:message', {
                      agent_id: agent.id,
                      message,
                    })

                    // Check for code changes on Edit/Write tools
                    if (['Edit', 'Write'].includes(input.tool_name)) {
                      const filePath = (
                        input.tool_input as { file_path?: string }
                      ).file_path
                      if (filePath) {
                        await this.trackCodeChange(runningAgent, filePath)
                      }
                    }

                    return { continue: true }
                  },
                ],
              },
            ],
            Stop: [
              {
                hooks: [
                  async () => {
                    agent.status = 'idle'
                    this.emit('agent:status', {
                      agent_id: agent.id,
                      status: 'idle',
                    })
                    // Refresh git info when agent stops
                    agent.git_info = await this.fetchGitInfo(runningAgent.git)
                    this.emit('agent:git', {
                      agent_id: agent.id,
                      git_info: agent.git_info,
                    })
                    return { continue: true }
                  },
                ],
              },
            ],
          },
        },
      })

      // Process messages from the agent
      for await (const message of result) {
        if (message.type === 'assistant') {
          const assistantMessage: AgentMessage = {
            id: message.uuid,
            message_type: 'assistant',
            content: this.extractTextContent(message.message),
            timestamp: new Date().toISOString(),
          }
          agent.messages.push(assistantMessage)
          this.emit('agent:message', {
            agent_id: agent.id,
            message: assistantMessage,
          })
        } else if (message.type === 'result') {
          agent.status = 'idle'
          this.emit('agent:status', { agent_id: agent.id, status: 'idle' })
        }
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        throw error
      }
    }
  }

  private extractTextContent(message: unknown): string {
    if (typeof message === 'string') return message
    if (Array.isArray(message)) {
      return message
        .filter((block: { type: string }) => block.type === 'text')
        .map((block: { text: string }) => block.text)
        .join('\n')
    }
    if (message && typeof message === 'object' && 'content' in message) {
      return this.extractTextContent(
        (message as { content: unknown }).content
      )
    }
    return JSON.stringify(message)
  }

  private async startClaudeCodeWithCli(
    runningAgent: RunningAgent,
    config: AgentConfig
  ): Promise<void> {
    const { agent } = runningAgent

    // Use claude CLI directly
    const args = ['--print']
    if (config.prompt) {
      args.push(config.prompt)
    }

    const proc = spawn('claude', args, {
      cwd: config.working_dir,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    runningAgent.process = proc
    agent.status = 'running'
    this.emit('agent:status', { agent_id: agent.id, status: 'running' })

    proc.stdout?.on('data', (data: Buffer) => {
      const message: AgentMessage = {
        id: uuidv4(),
        message_type: 'assistant',
        content: data.toString(),
        timestamp: new Date().toISOString(),
      }
      agent.messages.push(message)
      this.emit('agent:message', { agent_id: agent.id, message })
    })

    proc.stderr?.on('data', (data: Buffer) => {
      const message: AgentMessage = {
        id: uuidv4(),
        message_type: 'system',
        content: data.toString(),
        timestamp: new Date().toISOString(),
      }
      agent.messages.push(message)
      this.emit('agent:message', { agent_id: agent.id, message })
    })

    proc.on('close', async () => {
      agent.status = 'idle'
      this.emit('agent:status', { agent_id: agent.id, status: 'idle' })
      agent.git_info = await this.fetchGitInfo(runningAgent.git)
      this.emit('agent:git', { agent_id: agent.id, git_info: agent.git_info })
    })

    proc.on('error', (error) => {
      agent.status = 'error'
      this.emit('agent:status', { agent_id: agent.id, status: 'error' })
      const message: AgentMessage = {
        id: uuidv4(),
        message_type: 'system',
        content: `Error: ${error.message}`,
        timestamp: new Date().toISOString(),
      }
      agent.messages.push(message)
      this.emit('agent:message', { agent_id: agent.id, message })
    })
  }

  private async startCodex(
    runningAgent: RunningAgent,
    config: AgentConfig
  ): Promise<void> {
    const { agent } = runningAgent

    try {
      // Try using the SDK first
      const sdkAvailable = await this.checkCodexSdkAvailable()

      if (sdkAvailable) {
        await this.startCodexWithSdk(runningAgent, config)
      } else {
        // Fallback to CLI
        await this.startCodexWithCli(runningAgent, config)
      }
    } catch (error) {
      agent.status = 'error'
      this.emit('agent:status', { agent_id: agent.id, status: 'error' })
      throw error
    }
  }

  private async checkCodexSdkAvailable(): Promise<boolean> {
    try {
      await import('@openai/codex')
      return true
    } catch {
      return false
    }
  }

  private async startCodexWithSdk(
    runningAgent: RunningAgent,
    config: AgentConfig
  ): Promise<void> {
    const { agent } = runningAgent

    try {
      const { Codex } = await import('@openai/codex')

      agent.status = 'running'
      this.emit('agent:status', { agent_id: agent.id, status: 'running' })

      const codex = new Codex()
      const thread = codex.startThread()

      if (config.prompt) {
        const result = await thread.run(config.prompt)

        const message: AgentMessage = {
          id: uuidv4(),
          message_type: 'assistant',
          content: typeof result === 'string' ? result : JSON.stringify(result),
          timestamp: new Date().toISOString(),
        }
        agent.messages.push(message)
        this.emit('agent:message', { agent_id: agent.id, message })
      }

      agent.status = 'idle'
      this.emit('agent:status', { agent_id: agent.id, status: 'idle' })

      // Refresh git info
      agent.git_info = await this.fetchGitInfo(runningAgent.git)
      this.emit('agent:git', { agent_id: agent.id, git_info: agent.git_info })
    } catch (error) {
      throw error
    }
  }

  private async startCodexWithCli(
    runningAgent: RunningAgent,
    config: AgentConfig
  ): Promise<void> {
    const { agent } = runningAgent

    // Use codex CLI directly
    const args: string[] = []
    if (config.prompt) {
      args.push(config.prompt)
    }

    const proc = spawn('codex', args, {
      cwd: config.working_dir,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    runningAgent.process = proc
    agent.status = 'running'
    this.emit('agent:status', { agent_id: agent.id, status: 'running' })

    proc.stdout?.on('data', (data: Buffer) => {
      const message: AgentMessage = {
        id: uuidv4(),
        message_type: 'assistant',
        content: data.toString(),
        timestamp: new Date().toISOString(),
      }
      agent.messages.push(message)
      this.emit('agent:message', { agent_id: agent.id, message })
    })

    proc.stderr?.on('data', (data: Buffer) => {
      const message: AgentMessage = {
        id: uuidv4(),
        message_type: 'system',
        content: data.toString(),
        timestamp: new Date().toISOString(),
      }
      agent.messages.push(message)
      this.emit('agent:message', { agent_id: agent.id, message })
    })

    proc.on('close', async () => {
      agent.status = 'idle'
      this.emit('agent:status', { agent_id: agent.id, status: 'idle' })
      agent.git_info = await this.fetchGitInfo(runningAgent.git)
      this.emit('agent:git', { agent_id: agent.id, git_info: agent.git_info })
    })

    proc.on('error', (error) => {
      agent.status = 'error'
      this.emit('agent:status', { agent_id: agent.id, status: 'error' })
      const message: AgentMessage = {
        id: uuidv4(),
        message_type: 'system',
        content: `Error: ${error.message}`,
        timestamp: new Date().toISOString(),
      }
      agent.messages.push(message)
      this.emit('agent:message', { agent_id: agent.id, message })
    })
  }

  async stopAgent(agentId: string): Promise<void> {
    const runningAgent = this.agents.get(agentId)
    if (!runningAgent) return

    const { agent, process, abortController, planWatcher } = runningAgent

    // Stop the process
    if (abortController) {
      abortController.abort()
    }

    if (process) {
      process.kill('SIGTERM')
    }

    // Stop watching for plans
    if (planWatcher) {
      planWatcher.close()
    }

    agent.status = 'stopped'
    this.emit('agent:status', { agent_id: agent.id, status: 'stopped' })
  }

  stopAll(): void {
    for (const agentId of this.agents.keys()) {
      this.stopAgent(agentId)
    }
  }

  listAgents(): Agent[] {
    return Array.from(this.agents.values()).map((ra) => ra.agent)
  }

  getAgent(agentId: string): Agent | null {
    return this.agents.get(agentId)?.agent || null
  }

  async sendMessage(agentId: string, message: string): Promise<void> {
    const runningAgent = this.agents.get(agentId)
    if (!runningAgent) return

    const { agent, process } = runningAgent

    // Add user message
    const userMessage: AgentMessage = {
      id: uuidv4(),
      message_type: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    }
    agent.messages.push(userMessage)
    this.emit('agent:message', { agent_id: agent.id, message: userMessage })

    // Send to process stdin if available
    if (process && process.stdin) {
      process.stdin.write(message + '\n')
    }
  }

  private async fetchGitInfo(git: SimpleGit): Promise<GitInfo> {
    try {
      const [branch, status, log] = await Promise.all([
        git.branchLocal(),
        git.status(),
        git.log({ maxCount: 1 }),
      ])

      return {
        branch: branch.current,
        uncommitted_changes: status.files.length,
        last_commit: log.latest
          ? {
              hash: log.latest.hash,
              message: log.latest.message,
              author: log.latest.author_name,
              date: new Date(log.latest.date).toISOString(),
            }
          : undefined,
      }
    } catch {
      return {
        branch: 'unknown',
        uncommitted_changes: 0,
      }
    }
  }

  async getGitInfo(workingDir: string): Promise<GitInfo> {
    const git = simpleGit(workingDir)
    return this.fetchGitInfo(git)
  }

  async getGitDiff(workingDir: string): Promise<string> {
    const git = simpleGit(workingDir)
    try {
      const diff = await git.diff()
      return diff
    } catch {
      return ''
    }
  }

  private watchForPlans(runningAgent: RunningAgent): void {
    const { agent } = runningAgent
    const planPatterns = ['plan.md', 'PLAN.md', '.claude/plan.md']

    // Check for existing plans
    for (const pattern of planPatterns) {
      const planPath = path.join(agent.working_dir, pattern)
      if (fs.existsSync(planPath)) {
        this.loadPlan(runningAgent, planPath)
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
            planPatterns.some((p) => filename.endsWith(p.replace(/^\.\//, '')))
          ) {
            const planPath = path.join(agent.working_dir, filename)
            if (fs.existsSync(planPath)) {
              this.loadPlan(runningAgent, planPath)
            }
          }
        }
      )
      runningAgent.planWatcher = watcher
    } catch {
      // Watching not supported on this platform
    }
  }

  private loadPlan(runningAgent: RunningAgent, planPath: string): void {
    try {
      const content = fs.readFileSync(planPath, 'utf-8')
      const existingPlan = runningAgent.agent.plans.find(
        (p) => p.file_path === planPath
      )

      if (existingPlan) {
        existingPlan.content = content
      } else {
        const plan: Plan = {
          id: uuidv4(),
          content,
          file_path: planPath,
          created_at: new Date().toISOString(),
        }
        runningAgent.agent.plans.push(plan)
        this.emit('agent:plan', { agent_id: runningAgent.agent.id, plan })
      }
    } catch {
      // File couldn't be read
    }
  }

  private async trackCodeChange(
    runningAgent: RunningAgent,
    filePath: string
  ): Promise<void> {
    const { agent, git } = runningAgent

    try {
      // Get diff stats for this file
      const diff = await git.diff(['--stat', '--', filePath])
      const match = diff.match(/(\d+) insertions?\(\+\), (\d+) deletions?\(-\)/)

      const change: CodeChange = {
        file_path: filePath,
        lines_added: match ? parseInt(match[1], 10) : 0,
        lines_removed: match ? parseInt(match[2], 10) : 0,
        timestamp: new Date().toISOString(),
      }

      agent.code_changes.push(change)
      this.emit('agent:code_change', { agent_id: agent.id, change })

      // Update git info
      agent.git_info = await this.fetchGitInfo(git)
      this.emit('agent:git', { agent_id: agent.id, git_info: agent.git_info })
    } catch {
      // Couldn't get diff stats
    }
  }
}
