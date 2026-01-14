"use client";

import { useRef, useEffect, useState } from "react";
import { Send, User, Bot, Terminal, Wrench } from "lucide-react";
import { Agent, useAgentStore } from "@/store/agent-store";
import { cn } from "@/lib/utils";

interface MessagesTabProps {
  agent: Agent;
}

export function MessagesTab({ agent }: MessagesTabProps) {
  const { sendMessage } = useAgentStore();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [agent.messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    sendMessage(agent.id, input.trim());
    setInput("");
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
                getMessageStyles(message.message_type),
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

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="p-4 border-t">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Send a message..."
            disabled={agent.status !== "running"}
            className="flex-1 px-4 py-2 bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || agent.status !== "running"}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        {agent.status !== "running" && (
          <p className="text-xs text-muted-foreground mt-2">
            Agent must be running to send messages
          </p>
        )}
      </form>
    </div>
  );
}
