import { describe, expect, it } from "vitest";
import { matchReplayEmbedUrl } from "@/lib/youtube-embed";

const EMBED = "https://www.youtube.com/embed/fJf_A4LdKDw?rel=0";

describe("match replay YouTube link", () => {
  it("turns the YouTube links an owner would paste into one embed link", () => {
    for (const pasted of [
      "https://www.youtube.com/watch?v=fJf_A4LdKDw",
      "https://youtube.com/watch?v=fJf_A4LdKDw&t=42s",
      "https://m.youtube.com/watch?v=fJf_A4LdKDw",
      "https://youtu.be/fJf_A4LdKDw?si=abc",
      "https://www.youtube.com/embed/fJf_A4LdKDw?rel=0&modestbranding=1",
      "https://www.youtube-nocookie.com/embed/fJf_A4LdKDw",
      "https://www.youtube.com/live/fJf_A4LdKDw",
      "  https://youtu.be/fJf_A4LdKDw  ",
    ]) expect(matchReplayEmbedUrl(pasted), pasted).toBe(EMBED);
  });
  it("treats a blank field as no replay yet", () => {
    expect(matchReplayEmbedUrl("")).toBe("");
    expect(matchReplayEmbedUrl("   ")).toBe("");
  });
  it("rejects other sites, unsafe schemes and malformed video ids", () => {
    for (const bad of [
      "https://vimeo.com/123456",
      "https://youtube.com.evil.example/watch?v=fJf_A4LdKDw",
      "http://www.youtube.com/watch?v=fJf_A4LdKDw",
      "javascript:alert(1)",
      "https://www.youtube.com/watch?v=short",
      "https://www.youtube.com/@RoseCityFC",
      "https://www.youtube.com/playlist?list=PL123",
      "fJf_A4LdKDw",
    ]) expect(matchReplayEmbedUrl(bad), bad).toBeNull();
  });
});
