import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { AgentChatMessage } from "@paperclipai/shared";
import { agentsApi } from "../api/agents";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { cn } from "../lib/utils";
import { Send, Bot, User } from "lucide-react";

interface AgentChatPanelProps {
  agentId: string;
  companyId: string;
}

function formatTime(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

export function AgentChatPanel({ agentId, companyId }: AgentChatPanelProps) {
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [pendingRunId, setPendingRunId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: messages = [], isLoading } = useQuery({
    queryKey: queryKeys.agents.chatMessages(agentId),
    queryFn: () => agentsApi.listChatMessages(agentId),
    refetchInterval: pendingRunId ? 3000 : false,
  });

  const sendMutation = useMutation({
    mutationFn: (content: string) => agentsApi.sendChatMessage(agentId, content),
    onMutate: async (content) => {
      // Optimistic user message
      const optimistic: AgentChatMessage = {
        id: `optimistic-${Date.now()}`,
        companyId,
        agentId,
        role: "user",
        content,
        runId: null,
        createdAt: new Date().toISOString(),
      };
      queryClient.setQueryData<AgentChatMessage[]>(
        queryKeys.agents.chatMessages(agentId),
        (prev = []) => [...prev, optimistic],
      );
    },
    onSuccess: (result) => {
      setPendingRunId(result.runId);
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.chatMessages(agentId) });
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.chatMessages(agentId) });
    },
  });

  // Clear pending run when an agent reply arrives
  useEffect(() => {
    if (!pendingRunId) return;
    const hasAgentReply = messages.some((m) => m.role === "agent" && m.runId === pendingRunId);
    if (hasAgentReply) setPendingRunId(null);
  }, [messages, pendingRunId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  function handleSend() {
    const content = input.trim();
    if (!content || sendMutation.isPending) return;
    setInput("");
    sendMutation.mutate(content);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const isWaiting = sendMutation.isPending || Boolean(pendingRunId);

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-2 pb-3 border-b border-border mb-3">
        <Bot className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Chat with Agent</span>
        {pendingRunId && (
          <span className="text-xs text-muted-foreground animate-pulse ml-auto">Agent is thinking…</span>
        )}
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-3 py-2 pr-1"
      >
        {isLoading && (
          <p className="text-xs text-muted-foreground text-center py-4">Loading messages…</p>
        )}
        {!isLoading && messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">
            No messages yet. Send a message to start a conversation.
          </p>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {isWaiting && !pendingRunId && (
          <div className="flex items-end gap-2">
            <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0">
              <Bot className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="bg-muted rounded-2xl rounded-bl-none px-4 py-2.5">
              <span className="text-sm text-muted-foreground animate-pulse">…</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="pt-3 border-t border-border mt-3">
        {sendMutation.isError && (
          <p className="text-xs text-destructive mb-2">
            Failed to send message. Please try again.
          </p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isWaiting}
            placeholder="Message agent… (Enter to send, Shift+Enter for newline)"
            rows={3}
            className={cn(
              "flex-1 resize-none rounded-lg border border-border bg-transparent px-3 py-2 text-sm",
              "placeholder:text-muted-foreground/50 outline-none focus:border-ring",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isWaiting}
            size="sm"
            className="shrink-0"
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground/60 mt-1">
          Messages invoke the agent on-demand. Responses appear when the run completes.
        </p>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: AgentChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex items-end gap-2", isUser && "flex-row-reverse")}>
      {/* Avatar */}
      <div className={cn(
        "h-7 w-7 rounded-full flex items-center justify-center shrink-0",
        isUser ? "bg-primary/10" : "bg-muted",
      )}>
        {isUser
          ? <User className="h-3.5 w-3.5 text-primary" />
          : <Bot className="h-3.5 w-3.5 text-muted-foreground" />
        }
      </div>

      {/* Bubble */}
      <div className={cn(
        "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm break-words whitespace-pre-wrap",
        isUser
          ? "bg-primary text-primary-foreground rounded-br-none"
          : "bg-muted text-foreground rounded-bl-none",
      )}>
        {message.content}
        <div className={cn(
          "text-[10px] mt-1 opacity-60",
          isUser ? "text-right" : "text-left",
        )}>
          {formatTime(message.createdAt)}
        </div>
      </div>
    </div>
  );
}
