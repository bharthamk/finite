import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const releaseSource = "a33897152d38bb08e74015974612d2b30fa19dd4";
const liveUrl = "https://finite.bharthamk.chatgpt.site/";

const requiredFiles = [
  "README.md",
  "FINITE_V240_PRODUCT_A_PLUS_ACCEPTANCE_2026-09-01.md",
  "REPRODUCIBLE_RELEASE.md",
  "THIRD_PARTY_LICENSES.md",
  "submission/HACKATHON_REQUIREMENTS_2026-09-01.md",
  "submission/DEVPOST_SUBMISSION_DRAFT.md",
  "submission/JUDGE_TESTING_INSTRUCTIONS.md",
  "submission/DEMO_VIDEO_STORYBOARD.md",
  "submission/DEMO_VIDEO_SCRIPT.md",
  "submission/SCREENSHOT_AND_CAPTURE_PLAN.md",
  "submission/JUDGING_NARRATIVE_AND_EVIDENCE.md",
  "submission/HACKATHON_PROVENANCE.md",
  "submission/SUBMISSION_CONTROL.md",
  "submission/SUBMISSION_MASTER_DRAFT.md",
];

const files = new Map(
  requiredFiles.map((file) => [file, readFileSync(resolve(root, file), "utf8")]),
);

const failures = [];
const requireText = (file, text) => {
  if (!files.get(file)?.includes(text)) failures.push(`${file}: missing ${text}`);
};

for (const file of [
  "README.md",
  "submission/DEVPOST_SUBMISSION_DRAFT.md",
  "submission/JUDGE_TESTING_INSTRUCTIONS.md",
  "submission/HACKATHON_PROVENANCE.md",
  "submission/SUBMISSION_CONTROL.md",
  "submission/SUBMISSION_MASTER_DRAFT.md",
]) {
  requireText(file, "v240");
}

for (const file of [
  "README.md",
  "submission/DEVPOST_SUBMISSION_DRAFT.md",
  "submission/HACKATHON_PROVENANCE.md",
  "submission/SUBMISSION_CONTROL.md",
  "submission/SUBMISSION_MASTER_DRAFT.md",
]) {
  requireText(file, "353");
}

requireText("FINITE_V240_PRODUCT_A_PLUS_ACCEPTANCE_2026-09-01.md", releaseSource);
requireText("submission/HACKATHON_PROVENANCE.md", releaseSource);
requireText("submission/SUBMISSION_MASTER_DRAFT.md", releaseSource);
requireText("submission/DEVPOST_SUBMISSION_DRAFT.md", liveUrl);
requireText("submission/JUDGE_TESTING_INSTRUCTIONS.md", `${liveUrl}?start=spotlight-active`);
requireText("submission/HACKATHON_REQUIREMENTS_2026-09-01.md", "shorter than three minutes");
requireText("submission/HACKATHON_REQUIREMENTS_2026-09-01.md", "public GitHub, GitLab, or Bitbucket repository");
requireText("submission/HACKATHON_REQUIREMENTS_2026-09-01.md", "open-source license");

const ownerFields = [...files.values()]
  .flatMap((text) => text.match(/\[OWNER:[^\]]+\]/g) ?? []);

const allowedOwnerFields = new Set([
  "[OWNER: individual, team, or organization]",
  "[OWNER: license]",
  "[OWNER: paste public repository URL]",
  "[OWNER: paste public YouTube URL]",
  "[OWNER: URL]",
  "[OWNER: ...]",
]);

for (const field of ownerFields) {
  if (!allowedOwnerFields.has(field)) failures.push(`unexpected owner field: ${field}`);
}

const legacyClaimPatterns = [
  /v237 is the accepted live release/i,
  /346\/346/,
  /Product source is frozen at `9ad3dc/,
  /Record the accepted v237/,
];

for (const file of [
  "README.md",
  "submission/DEVPOST_SUBMISSION_DRAFT.md",
  "submission/JUDGE_TESTING_INSTRUCTIONS.md",
  "submission/DEMO_VIDEO_STORYBOARD.md",
  "submission/HACKATHON_PROVENANCE.md",
  "submission/SUBMISSION_CONTROL.md",
  "submission/SUBMISSION_MASTER_DRAFT.md",
]) {
  const contents = files.get(file);
  for (const pattern of legacyClaimPatterns) {
    if (pattern.test(contents)) failures.push(`${file}: stale claim ${pattern}`);
  }
}

if (failures.length) {
  console.error("Submission gate failed:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log(
  `Submission gate passed: ${requiredFiles.length} artifacts, release v240, 353-test baseline, ${ownerFields.length} explicit owner placeholders.`,
);
