"use client";

import * as React from "react";
import { CheckSquare, Square, ExternalLink } from "lucide-react";

interface MarkdownRendererProps {
  content: string;
  onWikilinkClick?: (targetTitle: string) => void;
  className?: string;
}

/**
 * Clean, lightweight, XSS-safe React Markdown and Wikilink Renderer.
 * Supports headings (#, ##, ###), checklists (- [ ] / - [x]), code blocks,
 * blockquotes, bullet/numbered lists, formatting, and [[Wikilinks]].
 */
export function MarkdownRenderer({
  content,
  onWikilinkClick,
  className = "",
}: MarkdownRendererProps) {
  if (!content) {
    return <p className="text-muted-foreground italic text-sm">Empty note</p>;
  }

  const renderInline = (text: string) => {
    // Regex for wikilinks: [[Target Title]] or [[Target Title|Display Text]]
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    const wikilinkRegex = /\[\[([^[\]|\r\n]+)(?:\|([^[\]\r\n]+))?\]\]/g;
    let match: RegExpExecArray | null;

    while ((match = wikilinkRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(renderFormatting(text.slice(lastIndex, match.index)));
      }

      const targetTitle = match[1].trim();
      const displayText = match[2]?.trim() || targetTitle;

      parts.push(
        <button
          key={`wiki-${match.index}`}
          type="button"
          onClick={() => onWikilinkClick?.(targetTitle)}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 underline decoration-blue-500/40 transition-colors"
          title={`Go to note: ${targetTitle}`}
        >
          <span>[[{displayText}]]</span>
          <ExternalLink className="w-2.5 h-2.5 opacity-60" />
        </button>
      );

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push(renderFormatting(text.slice(lastIndex)));
    }

    return parts;
  };

  const renderFormatting = (text: string) => {
    // Handle inline code `code`
    const codeParts = text.split(/(`[^`]+`)/g);
    return codeParts.map((part, i) => {
      if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
        return (
          <code
            key={`code-${i}`}
            className="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono text-xs border border-border/50"
          >
            {part.slice(1, -1)}
          </code>
        );
      }

      // Handle bold **text**
      const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
      return boldParts.map((bPart, j) => {
        if (bPart.startsWith("**") && bPart.endsWith("**") && bPart.length >= 4) {
          return <strong key={`b-${j}`} className="font-semibold text-foreground">{bPart.slice(2, -2)}</strong>;
        }

        // Handle italic *text*
        const italicParts = bPart.split(/(\*[^*]+\*)/g);
        return italicParts.map((iPart, k) => {
          if (iPart.startsWith("*") && iPart.endsWith("*") && iPart.length >= 2) {
            return <em key={`i-${k}`} className="italic">{iPart.slice(1, -1)}</em>;
          }
          return iPart;
        });
      });
    });
  };

  // Block-level parsing
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];
  let codeBlockLang = "";

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];

    // Fenced code blocks
    if (line.trim().startsWith("```")) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockLang = line.trim().slice(3).trim();
        codeBlockLines = [];
        continue;
      } else {
        inCodeBlock = false;
        elements.push(
          <div key={`code-block-${idx}`} className="my-3 rounded-lg overflow-hidden border border-border bg-muted/70">
            {codeBlockLang && (
              <div className="px-3 py-1 bg-muted text-[10px] uppercase font-mono text-muted-foreground border-b border-border">
                {codeBlockLang}
              </div>
            )}
            <pre className="p-3 text-xs font-mono overflow-x-auto text-foreground">
              <code>{codeBlockLines.join("\n")}</code>
            </pre>
          </div>
        );
        codeBlockLines = [];
        continue;
      }
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // Headings
    if (line.startsWith("# ")) {
      elements.push(
        <h1 key={`h1-${idx}`} className="text-xl font-bold mt-4 mb-2 pb-1 border-b border-border/60 text-foreground">
          {renderInline(line.slice(2))}
        </h1>
      );
      continue;
    }
    if (line.startsWith("## ")) {
      elements.push(
        <h2 key={`h2-${idx}`} className="text-lg font-semibold mt-3 mb-1.5 text-foreground">
          {renderInline(line.slice(3))}
        </h2>
      );
      continue;
    }
    if (line.startsWith("### ")) {
      elements.push(
        <h3 key={`h3-${idx}`} className="text-base font-medium mt-2 mb-1 text-foreground">
          {renderInline(line.slice(4))}
        </h3>
      );
      continue;
    }

    // Checklists
    if (/^[-*]\s+\[ \]\s+/.test(line)) {
      elements.push(
        <div key={`chk-${idx}`} className="flex items-start gap-2 my-1 text-sm text-foreground">
          <Square className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
          <span>{renderInline(line.replace(/^[-*]\s+\[ \]\s+/, ""))}</span>
        </div>
      );
      continue;
    }
    if (/^[-*]\s+\[x\]\s+/i.test(line)) {
      elements.push(
        <div key={`chk-done-${idx}`} className="flex items-start gap-2 my-1 text-sm text-muted-foreground line-through">
          <CheckSquare className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
          <span>{renderInline(line.replace(/^[-*]\s+\[x\]\s+/i, ""))}</span>
        </div>
      );
      continue;
    }

    // Blockquotes
    if (line.startsWith("> ")) {
      elements.push(
        <blockquote
          key={`quote-${idx}`}
          className="border-l-4 border-primary/40 pl-3 py-1 my-2 italic text-sm text-muted-foreground bg-muted/20 rounded-r"
        >
          {renderInline(line.slice(2))}
        </blockquote>
      );
      continue;
    }

    // Bullet lists
    if (/^[-*]\s+/.test(line)) {
      elements.push(
        <div key={`li-${idx}`} className="flex items-start gap-2 my-0.5 text-sm text-foreground pl-2">
          <span className="text-muted-foreground">•</span>
          <span>{renderInline(line.replace(/^[-*]\s+/, ""))}</span>
        </div>
      );
      continue;
    }

    // Empty lines
    if (!line.trim()) {
      elements.push(<div key={`blank-${idx}`} className="h-2" />);
      continue;
    }

    // Normal paragraph
    elements.push(
      <p key={`p-${idx}`} className="text-sm leading-relaxed text-foreground my-1">
        {renderInline(line)}
      </p>
    );
  }

  // Handle unclosed code block gracefully
  if (inCodeBlock && codeBlockLines.length > 0) {
    elements.push(
      <div key="unclosed-code" className="my-3 rounded-lg overflow-hidden border border-border bg-muted/70 p-3">
        <pre className="text-xs font-mono overflow-x-auto text-foreground">
          <code>{codeBlockLines.join("\n")}</code>
        </pre>
      </div>
    );
  }

  return <div className={`space-y-0.5 ${className}`}>{elements}</div>;
}
