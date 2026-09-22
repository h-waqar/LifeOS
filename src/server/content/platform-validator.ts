/**
 * Pure Platform Validator Engine
 * Enforces platform-specific constraints, character limits, thread splitting,
 * slug generation, and reading time estimation.
 */

export const TWITTER_MAX_CHARS = 280;
export const TWITTER_URL_LENGTH = 23;
export const LINKEDIN_MAX_CHARS = 3000;
export const DEFAULT_WORDS_PER_MINUTE = 200;

// URL detection regex
const URL_REGEX = /https?:\/\/[^\s]+/g;

/**
 * Calculates character length of a tweet, accounting for standard 23-char URL weighting.
 */
export function calculateTweetLength(text: string): number {
  if (!text) return 0;
  // Replace each URL with a 23-character dummy string to reflect Twitter's t.co shortener weighting
  const normalized = text.replace(URL_REGEX, "x".repeat(TWITTER_URL_LENGTH));
  // Use Array.from to correctly count unicode code points
  return Array.from(normalized).length;
}

/**
 * Validates a single tweet against Twitter's 280-character limit.
 */
export function validateTweet(text: string, maxChars = TWITTER_MAX_CHARS): {
  valid: boolean;
  length: number;
  maxLength: number;
  error?: string;
} {
  const length = calculateTweetLength(text);
  if (length > maxChars) {
    return {
      valid: false,
      length,
      maxLength: maxChars,
      error: `Tweet exceeds maximum length of ${maxChars} characters (current: ${length}).`,
    };
  }
  return {
    valid: true,
    length,
    maxLength: maxChars,
  };
}

/**
 * Validates an entire Twitter thread, verifying that every tweet meets limits.
 */
export function validateTwitterThread(
  tweets: string[],
  maxChars = TWITTER_MAX_CHARS
): {
  valid: boolean;
  totalLength: number;
  tweetCount: number;
  errors: Array<{ index: number; error: string; length: number }>;
} {
  if (!tweets || tweets.length === 0) {
    return {
      valid: true,
      totalLength: 0,
      tweetCount: 0,
      errors: [],
    };
  }

  const errors: Array<{ index: number; error: string; length: number }> = [];
  let totalLength = 0;

  tweets.forEach((tweet, index) => {
    const res = validateTweet(tweet, maxChars);
    totalLength += res.length;
    if (!res.valid) {
      errors.push({
        index,
        error: res.error || `Tweet #${index + 1} exceeds ${maxChars} characters`,
        length: res.length,
      });
    }
  });

  return {
    valid: errors.length === 0,
    totalLength,
    tweetCount: tweets.length,
    errors,
  };
}

/**
 * Deterministically splits long text into sequential tweets respecting 280-char limits.
 * Intelligently breaks on paragraphs, sentences, or word boundaries.
 */
export function splitIntoTweets(
  text: string,
  options: { numbering?: boolean; maxLength?: number } = {}
): string[] {
  const maxLength = options.maxLength ?? TWITTER_MAX_CHARS;
  const numbering = options.numbering ?? true;

  const trimmed = text.trim();
  if (!trimmed) return [];

  // Quick check: if the entire text already fits in 1 tweet and numbering is not forced for single tweets
  if (calculateTweetLength(trimmed) <= maxLength && !numbering) {
    return [trimmed];
  }

  // Split into raw words / tokens while preserving words
  // First, break text into logical units: paragraphs, sentences, or words
  const words = trimmed.split(/\s+/);
  if (words.length === 0) return [];

  // Helper to test if a list of tweets fits with numbering
  function buildNumberedTweets(chunks: string[]): string[] {
    const total = chunks.length;
    return chunks.map((chunk, idx) => `${idx + 1}/${total} ${chunk.trim()}`);
  }

  // Iteratively partition words into chunks that fit within available budget
  // When numbering is enabled, the prefix takes e.g. "1/10 " (5 chars) or "10/10 " (6 chars)
  // We reserve approx 8 characters for the prefix to guarantee fit.
  const prefixReserve = numbering ? 10 : 0;
  const effectiveMax = maxLength - prefixReserve;

  const rawChunks: string[] = [];
  let currentChunk = "";

  for (const word of words) {
    const candidate = currentChunk ? `${currentChunk} ${word}` : word;
    if (calculateTweetLength(candidate) <= effectiveMax) {
      currentChunk = candidate;
    } else {
      if (currentChunk) {
        rawChunks.push(currentChunk);
      }
      // If a single word itself is longer than effectiveMax, we must slice it
      if (calculateTweetLength(word) > effectiveMax) {
        let remainingWord = word;
        while (calculateTweetLength(remainingWord) > effectiveMax) {
          const slice = remainingWord.slice(0, effectiveMax);
          rawChunks.push(slice);
          remainingWord = remainingWord.slice(effectiveMax);
        }
        currentChunk = remainingWord;
      } else {
        currentChunk = word;
      }
    }
  }

  if (currentChunk) {
    rawChunks.push(currentChunk);
  }

  if (!numbering || rawChunks.length <= 1) {
    return rawChunks;
  }

  // Build numbered tweets and verify each fits; adjust if any exceeds maxLength
  let finalTweets = buildNumberedTweets(rawChunks);
  let allFit = finalTweets.every((t) => calculateTweetLength(t) <= maxLength);

  if (!allFit) {
    // If any overflowed due to prefix, reduce effectiveMax slightly and re-chunk
    const tighterEffectiveMax = effectiveMax - 8;
    const reChunks: string[] = [];
    let cur = "";
    for (const word of words) {
      const candidate = cur ? `${cur} ${word}` : word;
      if (calculateTweetLength(candidate) <= tighterEffectiveMax) {
        cur = candidate;
      } else {
        if (cur) reChunks.push(cur);
        if (calculateTweetLength(word) > tighterEffectiveMax) {
          let rem = word;
          while (calculateTweetLength(rem) > tighterEffectiveMax) {
            reChunks.push(rem.slice(0, tighterEffectiveMax));
            rem = rem.slice(tighterEffectiveMax);
          }
          cur = rem;
        } else {
          cur = word;
        }
      }
    }
    if (cur) reChunks.push(cur);
    finalTweets = buildNumberedTweets(reChunks);
  }

  return finalTweets;
}

/**
 * Validates a LinkedIn post against the 3,000-character limit.
 */
export function validateLinkedInPost(
  text: string,
  maxChars = LINKEDIN_MAX_CHARS
): {
  valid: boolean;
  length: number;
  maxLength: number;
  error?: string;
} {
  const length = Array.from(text || "").length;
  if (length > maxChars) {
    return {
      valid: false,
      length,
      maxLength: maxChars,
      error: `LinkedIn post exceeds maximum length of ${maxChars} characters (current: ${length}).`,
    };
  }
  return {
    valid: true,
    length,
    maxLength: maxChars,
  };
}

/**
 * Extracts unique hashtags from text (e.g. #LifeOS, #productivity).
 */
export function extractHashtags(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/#[a-zA-Z0-9_]+/g);
  if (!matches) return [];
  const unique = new Set(matches.map((tag) => tag.toLowerCase()));
  return Array.from(unique);
}

/**
 * Generates a clean, deterministic URL slug from a title string.
 * Example: "Why Modular Monoliths Win in 2026!" -> "why-modular-monoliths-win-in-2026"
 */
export function generateSlug(title: string): string {
  if (!title) return "";
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove all non-word chars (except spaces and dashes)
    .replace(/[\s_-]+/g, "-") // Replace spaces, underscores, and dashes with a single dash
    .replace(/^-+|-+$/g, ""); // Strip leading and trailing dashes
}

/**
 * Calculates word count and estimated reading time in minutes for blog posts / articles.
 */
export function calculateReadingTime(
  content: string,
  wpm = DEFAULT_WORDS_PER_MINUTE
): {
  wordCount: number;
  minutes: number;
} {
  if (!content || !content.trim()) {
    return { wordCount: 0, minutes: 0 };
  }
  const clean = content.trim();
  const words = clean.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const minutes = Math.max(1, Math.ceil(wordCount / wpm));
  return { wordCount, minutes };
}
