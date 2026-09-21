// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { MarkdownRenderer } from "@/components/markdown-renderer";

describe("Phase 3 Plan 03-01: MarkdownRenderer Component Unit Suite", () => {
  it("1. Renders empty note state when content is empty", () => {
    render(<MarkdownRenderer content="" />);
    expect(screen.getByText("Empty note")).toBeDefined();
  });

  it("2. Renders headings correctly", () => {
    const markdown = "# Heading 1\n## Heading 2\n### Heading 3";
    render(<MarkdownRenderer content={markdown} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Heading 1");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain("Heading 2");
    expect(screen.getByRole("heading", { level: 3 }).textContent).toContain("Heading 3");
  });

  it("3. Renders checklists with completion states", () => {
    const markdown = "- [ ] Incomplete task item\n- [x] Completed task item";
    render(<MarkdownRenderer content={markdown} />);
    expect(screen.getByText("Incomplete task item")).toBeDefined();
    expect(screen.getByText("Completed task item")).toBeDefined();
  });

  it("4. Renders interactive wikilink button and triggers onWikilinkClick", () => {
    const onWikilinkClick = vi.fn();
    const markdown = "Here is a link to [[System Architecture]] and [[Roadmap|Master Plan]].";
    render(<MarkdownRenderer content={markdown} onWikilinkClick={onWikilinkClick} />);

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2);
    expect(buttons[0].textContent).toContain("[[System Architecture]]");
    expect(buttons[1].textContent).toContain("[[Master Plan]]");

    fireEvent.click(buttons[0]);
    expect(onWikilinkClick).toHaveBeenCalledWith("System Architecture");

    fireEvent.click(buttons[1]);
    expect(onWikilinkClick).toHaveBeenCalledWith("Roadmap");
  });

  it("5. Never parses wikilinks inside inline code spans as buttons", () => {
    const onWikilinkClick = vi.fn();
    const markdown = "Use command `[[Not A Link]]` in terminal, but visit [[Real Target]].";
    render(<MarkdownRenderer content={markdown} onWikilinkClick={onWikilinkClick} />);

    // Only one button should exist (Real Target)
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toContain("[[Real Target]]");

    // The inline code should exist as a code element
    const codeEl = screen.getByText("[[Not A Link]]");
    expect(codeEl.tagName.toLowerCase()).toBe("code");
  });

  it("6. Never parses wikilinks inside fenced code blocks as buttons", () => {
    const onWikilinkClick = vi.fn();
    const markdown = `
\`\`\`markdown
[[Ignored In Backticks]]
\`\`\`
~~~text
[[Ignored In Tildes]]
~~~
Outside link: [[Valid Target]]
    `;
    render(<MarkdownRenderer content={markdown} onWikilinkClick={onWikilinkClick} />);

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toContain("[[Valid Target]]");
  });

  it("7. Renders bold and italic formatting", () => {
    const markdown = "This is **bold text** and this is *italic text*.";
    render(<MarkdownRenderer content={markdown} />);
    const strongEl = screen.getByText("bold text");
    expect(strongEl.tagName.toLowerCase()).toBe("strong");
    const emEl = screen.getByText("italic text");
    expect(emEl.tagName.toLowerCase()).toBe("em");
  });
});
