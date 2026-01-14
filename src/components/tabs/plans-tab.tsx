"use client";

import { useState } from "react";
import { FileText, ChevronRight, ChevronDown, Clock } from "lucide-react";
import { Agent, Plan } from "@/store/agent-store";
import { cn } from "@/lib/utils";

interface PlansTabProps {
  agent: Agent;
}

export function PlansTab({ agent }: PlansTabProps) {
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(
    agent.plans[0]?.id || null,
  );

  if (agent.plans.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center">
          <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No plans detected yet</p>
          <p className="text-sm mt-1">
            Plans will appear when the agent creates plan.md files
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {agent.plans.map((plan) => (
        <PlanCard
          key={plan.id}
          plan={plan}
          isExpanded={plan.id === expandedPlanId}
          onToggle={() =>
            setExpandedPlanId(plan.id === expandedPlanId ? null : plan.id)
          }
        />
      ))}
    </div>
  );
}

interface PlanCardProps {
  plan: Plan;
  isExpanded: boolean;
  onToggle: () => void;
}

function PlanCard({ plan, isExpanded, onToggle }: PlanCardProps) {
  // Extract title from plan content (first heading or first line)
  const title = extractTitle(plan.content);

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-accent/50 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
        <FileText className="w-5 h-5 text-primary" />
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{title}</div>
          <div className="text-sm text-muted-foreground truncate">
            {plan.file_path}
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          {new Date(plan.created_at).toLocaleString()}
        </div>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="border-t p-4 bg-muted/30">
          <div className="prose prose-sm prose-invert max-w-none">
            <pre className="whitespace-pre-wrap font-mono text-sm bg-background p-4 rounded-md overflow-x-auto">
              {plan.content}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function extractTitle(content: string): string {
  // Try to find a markdown heading
  const headingMatch = content.match(/^#\s+(.+)$/m);
  if (headingMatch) {
    return headingMatch[1];
  }

  // Fall back to first non-empty line
  const firstLine = content.split("\n").find((line) => line.trim());
  if (firstLine) {
    return firstLine.slice(0, 50) + (firstLine.length > 50 ? "..." : "");
  }

  return "Untitled Plan";
}
