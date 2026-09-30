"use client";

import * as React from "react";
import { useChat } from "ai/react";
import {
  Send,
  Sparkles,
  Bot,
  User,
  RotateCcw,
  Loader2,
  Calendar,
  CheckCircle,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { ModelSelector } from "./model-selector";
import { ToolCallPill } from "./tool-call-pill";
import { ActionConfirmationCard } from "./action-confirmation-card";
import { type AIProviderName } from "@/types";
import { cn } from "@/lib/utils";

interface AssistantChatProps {
  conversationId?: string;
  onConversationCreated?: (id: string) => void;
  className?: string;
}

export function AssistantChat({
  conversationId,
  onConversationCreated,
  className,
}: AssistantChatProps) {
  const [selectedProvider, setSelectedProvider] =
    React.useState<AIProviderName>("google");
  const [selectedModel, setSelectedModel] =
    React.useState<string>("gemini-2.5-flash");

  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    setMessages,
    setInput,
  } = useChat({
    api: "/api/ai/chat",
    body: {
      conversationId,
      modelProvider: selectedProvider,
      modelId: selectedModel,
    },
    onResponse: (response) => {
      const convId = response.headers.get("X-Conversation-Id");
      if (convId && convId !== conversationId) {
        onConversationCreated?.(convId);
      }
    },
  });

  // Load existing messages when conversationId changes
  React.useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      return;
    }

    let isMounted = true;
    fetch(`/api/ai/conversations/${conversationId}/messages`)
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        if (data.data && Array.isArray(data.data)) {
          setMessages(
            data.data.map((m: any) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              createdAt: new Date(m.createdAt),
            }))
          );
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [conversationId, setMessages]);

  // Auto-scroll on new messages
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !isLoading) {
        handleSubmit(e as any);
      }
    }
  };

  const handleSuggestionClick = (promptText: string) => {
    setInput(promptText);
  };

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-background border rounded-xl overflow-hidden shadow-sm",
        className
      )}
    >
      {/* Top Header Bar */}
      <div className="flex items-center justify-between border-b px-4 py-2.5 bg-muted/30">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground leading-none">
              LifeOS Assistant
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Personal graph & execution copilot
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ModelSelector
            selectedProvider={selectedProvider}
            selectedModel={selectedModel}
            onSelect={(p, m) => {
              setSelectedProvider(p);
              setSelectedModel(m);
            }}
          />

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMessages([])}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title="Reset Chat"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Message Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto py-10">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-3">
              <Sparkles className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold text-foreground">
              How can I assist you today, Hamza?
            </h3>
            <p className="text-xs text-muted-foreground mt-1 mb-6">
              Ask about your goals, plan today&apos;s schedule, review tasks, or execute actions with verification.
            </p>

            <div className="grid grid-cols-1 gap-2 w-full text-left">
              <button
                type="button"
                onClick={() =>
                  handleSuggestionClick("What should I focus on today?")
                }
                className="flex items-start gap-2.5 p-3 rounded-lg border bg-card hover:bg-accent/50 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Calendar className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-foreground">Focus Plan</div>
                  <div>What should I focus on today given my deadlines and calendar?</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  handleSuggestionClick("Summarize my habit streaks and misses this week")
                }
                className="flex items-start gap-2.5 p-3 rounded-lg border bg-card hover:bg-accent/50 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <CheckCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-foreground">Habit Check-in</div>
                  <div>Summarize my habit consistency and check-ins this week</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  handleSuggestionClick("Create task: Review quarterly financial budget for tomorrow !p1")
                }
                className="flex items-start gap-2.5 p-3 rounded-lg border bg-card hover:bg-accent/50 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <HelpCircle className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-foreground">Quick Action</div>
                  <div>Create task: Review quarterly financial budget for tomorrow !p1</div>
                </div>
              </button>
            </div>
          </div>
        ) : (
          messages.map((message) => {
            const isUser = message.role === "user";

            return (
              <div
                key={message.id}
                className={cn(
                  "flex items-start gap-3 text-sm",
                  isUser ? "flex-row-reverse" : "flex-row"
                )}
              >
                <div
                  className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-xs",
                    isUser
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "bg-muted text-foreground border border-border"
                  )}
                >
                  {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>

                <div
                  className={cn(
                    "flex flex-col max-w-[85%] rounded-2xl px-4 py-3 shadow-sm",
                    isUser
                      ? "bg-primary text-primary-foreground rounded-tr-sm"
                      : "bg-card border border-border/80 text-foreground rounded-tl-sm"
                  )}
                >
                  {/* Tool Invocations */}
                  {message.toolInvocations && message.toolInvocations.length > 0 && (
                    <div className="mb-2 space-y-2">
                      {message.toolInvocations.map((invocation) => {
                        const callState = invocation.state;
                        const isPendingConfirm =
                          callState === "result" &&
                          (invocation.result as any)?.status === "pending_confirmation";

                        if (isPendingConfirm) {
                          const resData = invocation.result as any;
                          return (
                            <ActionConfirmationCard
                              key={invocation.toolCallId}
                              actionId={resData.actionId}
                              toolName={invocation.toolName}
                              preview={resData.preview}
                            />
                          );
                        }

                        return (
                          <ToolCallPill
                            key={invocation.toolCallId}
                            toolName={invocation.toolName}
                            status={
                              callState === "result" ? "completed" : "calling"
                            }
                            args={invocation.args}
                          />
                        );
                      })}
                    </div>
                  )}

                  {/* Message Markdown Body */}
                  {isUser ? (
                    <div className="whitespace-pre-wrap">{message.content}</div>
                  ) : (
                    <MarkdownRenderer
                      content={message.content}
                      className="text-sm prose-p:leading-relaxed"
                    />
                  )}
                </div>
              </div>
            );
          })
        )}

        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground ml-11">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            <span>Assistant is thinking...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <form onSubmit={handleSubmit} className="border-t p-3 bg-card">
        <div className="relative flex items-center">
          <textarea
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything or command an action (e.g. 'Schedule a 1h deep work session tomorrow')..."
            rows={1}
            className="w-full resize-none rounded-xl border border-input bg-background px-4 py-2.5 pr-12 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary max-h-32 min-h-[44px]"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || isLoading}
            className="absolute right-2 h-8 w-8 rounded-lg"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
