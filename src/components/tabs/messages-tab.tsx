"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import {
  Send,
  User,
  Bot,
  Terminal,
  Wrench,
  Zap,
  ListOrdered,
  X,
  Trash2,
  StopCircle,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { Agent, useAgentStore, SteerMode, QueuedMessage } from "@/store/agent-store";
import { cn } from "@/lib/utils";

interface MessagesTabProps {
  agent: Agent;
}

export function MessagesTab({ agent }: MessagesTabProps) {
  const {
    handleUserInput,
    setSteerMode,
    clearQueue,
    removeQueuedMessage,
    interruptAgent,
  } = useAgentStore();
  const [input, setInput] = useState("");
  const [selectedQueueIndex, setSelectedQueueIndex] = useState(-1);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const queueState = agent.queue_state;
  const queuedMessages = queueState?.messages || [];
  const steerMode = queueState?.steerMode || "immediate";
  const isProcessingQueue = queueState?.processingQueue || false;
  const isAgentBusy = agent.status === "running";

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [agent.messages]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Escape to interrupt when agent is running
      if (e.key === "Escape" && isAgentBusy) {
        e.preventDefault();
        interruptAgent(agent.id);
        return;
      }

      // Tab to toggle steer mode
      if (e.key === "Tab" && isAgentBusy) {
        e.preventDefault();
        const newMode: SteerMode = steerMode === "immediate" ? "queue" : "immediate";
        setSteerMode(agent.id, newMode);
        return;
      }

      // Navigate through queued messages
      if (e.altKey && queuedMessages.length > 0) {
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedQueueIndex((prev) =>
            prev <= 0 ? queuedMessages.length - 1 : prev - 1
          );
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedQueueIndex((prev) =>
            prev >= queuedMessages.length - 1 ? 0 : prev + 1
          );
        } else if (e.key === "Backspace" && selectedQueueIndex >= 0) {
          e.preventDefault();
          removeQueuedMessage(agent.id, queuedMessages[selectedQueueIndex].id);
          setSelectedQueueIndex(-1);
        }
      }
    },
    [
      isAgentBusy,
      agent.id,
      steerMode,
      queuedMessages,
      selectedQueueIndex,
      interruptAgent,
      setSteerMode,
      removeQueuedMessage,
    ]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    await handleUserInput(agent.id, input.trim());
    setInput("");
  };

  const handleModeToggle = () => {
    const newMode: SteerMode = steerMode === "immediate" ? "queue" : "immediate";
    setSteerMode(agent.id, newMode);
  };

  const getMessageIcon = (type: string) => {
    switch (type) {
      case "user":
        return <User className="w-4 h-4" />;
      case "assistant":
        return <Bot className="w-4 h-4" />;
      case "system":
        return <Terminal className="w-4 h-4" />;
      case "tool":
        return <Wrench className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const getMessageStyles = (type: string) => {
    switch (type) {
      case "user":
        return "bg-primary/10 border-primary/20";
      case "assistant":
        return "bg-accent";
      case "system":
        return "bg-yellow-500/10 border-yellow-500/20";
      case "tool":
        return "bg-blue-500/10 border-blue-500/20";
      default:
        return "bg-muted";
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {agent.messages.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            No messages yet
          </div>
        ) : (
          agent.messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "p-3 rounded-lg border",
                getMessageStyles(message.message_type)
              )}
            >
              <div className="flex items-center gap-2 mb-2 text-sm text-muted-foreground">
                {getMessageIcon(message.message_type)}
                <span className="capitalize">{message.message_type}</span>
                {message.tool_name && (
                  <span className="text-blue-500 font-mono">
                    {message.tool_name}
                  </span>
                )}
                <span className="ml-auto text-xs">
                  {new Date(message.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <div className="whitespace-pre-wrap font-mono text-sm">
                {message.content}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Queue Display */}
      {queuedMessages.length > 0 && (
        <div className="border-t px-4 py-2 bg-muted/50">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ListOrdered className="w-4 h-4" />
              <span>
                {queuedMessages.length} message{queuedMessages.length > 1 ? "s" : ""} queued
              </span>
              {isProcessingQueue && (
                <span className="text-yellow-500 animate-pulse">
                  (Processing...)
                </span>
              )}
            </div>
            <button
              onClick={() => clearQueue(agent.id)}
              className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              Clear all
            </button>
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {queuedMessages.map((msg, index) => (
              <div
                key={msg.id}
                className={cn(
                  "flex items-center gap-2 p-2 rounded text-sm",
                  selectedQueueIndex === index
                    ? "bg-primary/20 border border-primary/40"
                    : "bg-background/50",
                  msg.priority === "high" && "border-l-2 border-l-yellow-500"
                )}
              >
                <span className="text-muted-foreground w-5">{index + 1}.</span>
                <span className="flex-1 truncate">{msg.content}</span>
                {msg.priority === "high" && (
                  <Zap className="w-3 h-3 text-yellow-500" />
                )}
                <button
                  onClick={() => removeQueuedMessage(agent.id, msg.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Alt+↑/↓ to navigate, Alt+Backspace to remove
          </div>
        </div>
      )}

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="p-4 border-t">
        {/* Steer Mode Toggle and Status */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {isAgentBusy && (
              <>
                <button
                  type="button"
                  onClick={handleModeToggle}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors",
                    steerMode === "immediate"
                      ? "bg-green-500/20 text-green-500 border border-green-500/40"
                      : "bg-blue-500/20 text-blue-500 border border-blue-500/40"
                  )}
                  title="Press Tab to toggle"
                >
                  {steerMode === "immediate" ? (
                    <>
                      <Zap className="w-3 h-3" />
                      Steer
                    </>
                  ) : (
                    <>
                      <ListOrdered className="w-3 h-3" />
                      Queue
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => interruptAgent(agent.id)}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-red-500/20 text-red-500 border border-red-500/40 hover:bg-red-500/30"
                  title="Press Escape to interrupt"
                >
                  <StopCircle className="w-3 h-3" />
                  Stop
                </button>
              </>
            )}
          </div>
          {isAgentBusy && (
            <span className="text-xs text-muted-foreground">
              {steerMode === "immediate"
                ? "Messages will be sent immediately"
                : "Messages will be queued (Tab to toggle)"}
            </span>
          )}
        </div>

        {/* Input Field */}
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isAgentBusy
                ? steerMode === "immediate"
                  ? "Type to steer the agent..."
                  : "Type to queue a message..."
                : "Send a message..."
            }
            disabled={agent.status === "stopped" || agent.status === "error"}
            className="flex-1 px-4 py-2 bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={
              !input.trim() ||
              agent.status === "stopped" ||
              agent.status === "error"
            }
            className={cn(
              "px-4 py-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed",
              isAgentBusy && steerMode === "queue"
                ? "bg-blue-500 text-white hover:bg-blue-600"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            {isAgentBusy && steerMode === "queue" ? (
              <ListOrdered className="w-4 h-4" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Status Messages */}
        {agent.status === "stopped" && (
          <p className="text-xs text-muted-foreground mt-2">
            Agent has been stopped
          </p>
        )}
        {agent.status === "error" && (
          <p className="text-xs text-destructive mt-2">
            Agent encountered an error
          </p>
        )}
        {isAgentBusy && (
          <p className="text-xs text-muted-foreground mt-2">
            Agent is working... Esc to interrupt, Tab to toggle queue mode
          </p>
        )}
      </form>
    </div>
  );
}
