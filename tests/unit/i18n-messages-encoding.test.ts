import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const messagesDir = join(process.cwd(), "lib", "i18n", "messages");
const suspectMojibake =
  /(?:\u00c3[\u0080-\uFFFF]|\u00c2[\u0080-\uFFFF]|\u00c5[\u0080-\uFFFF]|\u00e2[\u0080-\u009f\u201a-\u2026\u20ac\u2020-\u2022\u201c-\u201d]|\u00f0[\u0080-\uFFFF]|\uFFFD)/u;

describe("i18n message encoding", () => {
  for (const file of readdirSync(messagesDir).filter((name) => name.endsWith(".json"))) {
    it(`${file} is valid UTF-8 text without mojibake`, () => {
      const content = readFileSync(join(messagesDir, file), "utf8");

      expect(() => JSON.parse(content)).not.toThrow();
      expect(content).not.toMatch(suspectMojibake);
    });
  }
});
