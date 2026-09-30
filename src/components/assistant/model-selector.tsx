"use client";

import * as React from "react";
import { Cpu } from "lucide-react";
import { type AIProviderName } from "@/types";

export interface ModelOption {
  provider: AIProviderName;
  modelId: string;
  name: string;
  badge: string;
}

export const AVAILABLE_MODELS: ModelOption[] = [
  {
    provider: "google",
    modelId: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    badge: "Fast & Capable",
  },
  {
    provider: "google",
    modelId: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    badge: "Deep Reasoning",
  },
  {
    provider: "anthropic",
    modelId: "claude-3-7-sonnet",
    name: "Claude 3.7 Sonnet",
    badge: "State of the Art",
  },
  {
    provider: "anthropic",
    modelId: "claude-3-5-haiku",
    name: "Claude 3.5 Haiku",
    badge: "Ultra Fast",
  },
  {
    provider: "openai",
    modelId: "gpt-4o",
    name: "GPT-4o",
    badge: "Omni",
  },
  {
    provider: "openai",
    modelId: "gpt-4o-mini",
    name: "GPT-4o Mini",
    badge: "Lightweight",
  },
  {
    provider: "ollama",
    modelId: "llama3.3",
    name: "Llama 3.3 (Local)",
    badge: "Private",
  },
];

interface ModelSelectorProps {
  selectedProvider: AIProviderName;
  selectedModel: string;
  onSelect: (provider: AIProviderName, model: string) => void;
  className?: string;
}

export function ModelSelector({
  selectedProvider,
  selectedModel,
  onSelect,
  className,
}: ModelSelectorProps) {
  const currentKey = `${selectedProvider}:${selectedModel}`;

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const [p, m] = e.target.value.split(":");
    if (p && m) {
      onSelect(p as AIProviderName, m);
    }
  };

  return (
    <div className={`relative inline-flex items-center gap-1.5 ${className || ""}`}>
      <Cpu className="h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
      <select
        value={currentKey}
        onChange={handleChange}
        className="bg-transparent text-xs font-medium text-muted-foreground hover:text-foreground focus:outline-none cursor-pointer pr-4"
        aria-label="Select AI Model"
      >
        {AVAILABLE_MODELS.map((opt) => (
          <option
            key={`${opt.provider}:${opt.modelId}`}
            value={`${opt.provider}:${opt.modelId}`}
            className="bg-popover text-popover-foreground text-xs"
          >
            {opt.name} ({opt.badge})
          </option>
        ))}
      </select>
    </div>
  );
}
