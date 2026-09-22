import { describe, it, expect } from "vitest";
import {
  calculateTweetLength,
  validateTweet,
  validateTwitterThread,
  splitIntoTweets,
  validateLinkedInPost,
  extractHashtags,
  generateSlug,
  calculateReadingTime,
  TWITTER_MAX_CHARS,
  LINKEDIN_MAX_CHARS,
} from "@/server/content/platform-validator";

describe("Platform Validator Engine (Plan 05-01)", () => {
  describe("Twitter / X Constraints", () => {
    it("correctly calculates tweet character length and weights URLs at 23 characters", () => {
      const normalText = "Hello world! Building LifeOS today.";
      expect(calculateTweetLength(normalText)).toBe(normalText.length);

      // URL weighting: a 50-character URL must count as exactly 23 chars
      const longUrl = "https://subdomain.example.com/very/long/path/with/parameters?ref=lifeos&utm_source=twitter";
      expect(longUrl.length).toBeGreaterThan(50);
      expect(calculateTweetLength(longUrl)).toBe(23);

      const textWithUrl = `Check this out: ${longUrl} - let me know!`;
      // "Check this out: " (16) + 23 + " - let me know!" (15) = 54
      expect(calculateTweetLength(textWithUrl)).toBe(54);
    });

    it("validates single tweet within 280 characters", () => {
      const validTweet = "a".repeat(280);
      const res1 = validateTweet(validTweet);
      expect(res1.valid).toBe(true);
      expect(res1.length).toBe(280);
      expect(res1.error).toBeUndefined();

      const invalidTweet = "a".repeat(281);
      const res2 = validateTweet(invalidTweet);
      expect(res2.valid).toBe(false);
      expect(res2.length).toBe(281);
      expect(res2.error).toContain("exceeds maximum length of 280");
    });

    it("validates an entire twitter thread", () => {
      const thread = [
        "1/3 First tweet in thread is short and concise.",
        "2/3 Second tweet contains useful architecture insights.",
        "3/3 Final takeaway and link to repo: https://github.com/h-waqar/LifeOS",
      ];

      const res = validateTwitterThread(thread);
      expect(res.valid).toBe(true);
      expect(res.tweetCount).toBe(3);
      expect(res.errors).toHaveLength(0);

      // Add oversized tweet to thread
      const badThread = [...thread, "4/4 " + "x".repeat(280)];
      const badRes = validateTwitterThread(badThread);
      expect(badRes.valid).toBe(false);
      expect(badRes.errors).toHaveLength(1);
      expect(badRes.errors[0].index).toBe(3);
    });

    it("deterministically splits long text into sequential tweets with numbering", () => {
      const longText =
        "LifeOS is a personal operating system designed to manage knowledge, tasks, goals, habits, and finance. " +
        "It eliminates fragmented context across dozens of siloed tools. " +
        "Everything links together into a coherent personal knowledge graph. " +
        "In Phase 5, we are authoring content directly inside the OS with multi-platform draft variants. " +
        "This ensures that writing threads, articles, and LinkedIn updates happens from a unified creative studio. " +
        "What do you think of this approach to personal tooling? Let us know your thoughts.";

      const tweets = splitIntoTweets(longText, { numbering: true });
      expect(tweets.length).toBeGreaterThan(1);

      // Verify each chunk is numbered e.g. "1/N ...", "2/N ..." and within 280 chars
      tweets.forEach((tweet, idx) => {
        expect(tweet.startsWith(`${idx + 1}/${tweets.length}`)).toBe(true);
        expect(calculateTweetLength(tweet)).toBeLessThanOrEqual(TWITTER_MAX_CHARS);
      });
    });

    it("handles single-word chunks longer than budget without crashing", () => {
      const giantWord = "x".repeat(300);
      const chunks = splitIntoTweets(giantWord, { numbering: false });
      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach((chunk) => {
        expect(calculateTweetLength(chunk)).toBeLessThanOrEqual(TWITTER_MAX_CHARS);
      });
    });
  });

  describe("LinkedIn Constraints", () => {
    it("validates LinkedIn post within 3,000 characters and rejects oversized content", () => {
      const validPost = "p".repeat(3000);
      const res1 = validateLinkedInPost(validPost);
      expect(res1.valid).toBe(true);
      expect(res1.length).toBe(3000);

      const invalidPost = "p".repeat(3001);
      const res2 = validateLinkedInPost(invalidPost);
      expect(res2.valid).toBe(false);
      expect(res2.length).toBe(3001);
      expect(res2.error).toContain("exceeds maximum length of 3000");
    });

    it("extracts unique hashtags from text", () => {
      const post = "Excited to launch #LifeOS with #Productivity and #TypeScript! Also #lifeos rocks.";
      const tags = extractHashtags(post);
      expect(tags).toContain("#lifeos");
      expect(tags).toContain("#productivity");
      expect(tags).toContain("#typescript");
      // Case insensitive deduplication
      expect(tags).toHaveLength(3);
    });
  });

  describe("Blog Article Slug and Reading Time", () => {
    it("generates clean, deterministic kebab-case URL slugs from titles", () => {
      expect(generateSlug("Why Modular Monoliths Win in 2026!")).toBe(
        "why-modular-monoliths-win-in-2026"
      );
      expect(generateSlug("  Building a Personal OS: 10 Lessons Learned...  ")).toBe(
        "building-a-personal-os-10-lessons-learned"
      );
      expect(generateSlug("C++ vs Rust vs TypeScript --- The Ultimate Comparison")).toBe(
        "c-vs-rust-vs-typescript-the-ultimate-comparison"
      );
      expect(generateSlug("")).toBe("");
    });

    it("calculates accurate word count and reading time in minutes", () => {
      const empty = calculateReadingTime("");
      expect(empty.wordCount).toBe(0);
      expect(empty.minutes).toBe(0);

      // 100 words at 200 wpm -> 1 min (ceil)
      const hundredWords = Array(100).fill("word").join(" ");
      const res100 = calculateReadingTime(hundredWords);
      expect(res100.wordCount).toBe(100);
      expect(res100.minutes).toBe(1);

      // 450 words at 200 wpm -> 3 min (ceil)
      const fourFiftyWords = Array(450).fill("word").join(" ");
      const res450 = calculateReadingTime(fourFiftyWords);
      expect(res450.wordCount).toBe(450);
      expect(res450.minutes).toBe(3);
    });
  });
});
