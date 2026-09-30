"use client";

import * as React from "react";
import { ConversationSidebar } from "@/components/assistant/conversation-sidebar";
import { AssistantChat } from "@/components/assistant/assistant-chat";

export default function AssistantPage() {
  const [activeConversationId, setActiveConversationId] = React.useState<
    string | undefined
  >(undefined);

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden rounded-xl border bg-card shadow-sm">
      <ConversationSidebar
        activeId={activeConversationId}
        onSelect={(id) => setActiveConversationId(id)}
        onNewChat={() => setActiveConversationId(undefined)}
        className="hidden md:flex shrink-0"
      />

      <div className="flex-1 flex flex-col h-full overflow-hidden p-2">
        <AssistantChat
          conversationId={activeConversationId}
          onConversationCreated={(newId) => setActiveConversationId(newId)}
          className="h-full border-none shadow-none"
        />
      </div>
    </div>
  );
}
