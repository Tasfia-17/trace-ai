import { execFile, spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { PatchVerifyResult } from "@/lib/patch-contract";
import type { ReproResult } from "@/lib/repro-contract";

const execFileAsync = promisify(execFile);

const owner = "divagr18";
const name = "mobile-demo";
const repoSlug = `${owner}/${name}`;
const remoteUrl = `https://github.com/${repoSlug}.git`;
const repoUrl = `https://github.com/${repoSlug}`;
const worktreePath = path.join(process.cwd(), ".trace", "github-mobile-demo-agent");
const fixBranch = "trace/fix-mobile-checkout-save20";
const targetFile = "src/components/CheckoutDemo.tsx";
const beforeImagePath = "trace-evidence/before-mobile.png";
const afterImagePath = "trace-evidence/after-mobile.png";

type GitHubIssue = {
  number: number;
  title: string;
  html_url: string;
};

type GitHubPullRequest = {
  number: number;
  title: string;
  html_url: string;
};

export type GitHubPrResult = {
  owner: string;
  name: string;
  htmlUrl: string;
  defaultBranch: string;
  fixBranch: string;
  issueNumber: number;
  prNumber: number;
  issueTitle: string;
  prTitle: string;
  issueUrl: string;
  prUrl: string;
  branchUrl: string;
  viewerUrl: string;
  commits: string[];
  filesChanged: string[];
  diff: string;
  beforeImageUrl?: string;
  afterImageUrl?: string;
};

async function git(args: string[], cwd = worktreePath) {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    windowsHide: true,
  });
  return stdout.trim();
}

async function getGitHubToken() {
  const envToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (envToken) {
    return envToken;
  }

  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      const child = spawn("git", ["credential", "fill"], {
        windowsHide: true,
      });
      let output = "";
      let errorOutput = "";

      child.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        errorOutput += chunk.toString("utf8");
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(errorOutput || `git credential fill exited with ${code}`));
        }
      });
      child.stdin.end("protocol=https\nhost=github.com\n\n");
    });
    const passwordLine = stdout
      .split(/\r?\n/)
      .find((line) => line.startsWith("password="));
    return passwordLine?.slice("password=".length) || null;
  } catch {
    return null;
  }
}

async function githubRequest<T>(
  pathName: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getGitHubToken();
  if (!token) {
    throw new Error("GitHub auth is not configured. Set GITHUB_TOKEN or sign in with Git Credential Manager.");
  }

  const response = await fetch(`https://api.github.com${pathName}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub request failed: ${response.status} ${body.slice(0, 240)}`);
  }

  return (await response.json()) as T;
}

type EvidenceLinks = {
  beforeImageUrl?: string;
  afterImageUrl?: string;
};

function createEvidenceMarkdown(links: EvidenceLinks) {
  if (!links.beforeImageUrl && !links.afterImageUrl) {
    return [];
  }

  return [
    "## Visual evidence",
    links.beforeImageUrl ? `### Before\n![Before mobile repro](${links.beforeImageUrl})` : "",
    links.afterImageUrl ? `### After\n![After patch verification](${links.afterImageUrl})` : "",
    "",
  ].filter(Boolean);
}

function createIssueBody(verification: PatchVerifyResult, links: EvidenceLinks) {
  return [
    "## Customer impact",
    "Mobile customers cannot continue to payment after applying `SAVE20`.",
    "",
    "## Environment",
    "- iPhone 15 Safari",
    "- 390x844 viewport",
    "- Coupon: `SAVE20`",
    "",
    "## Reproduction",
    "1. Open the checkout app at mobile width.",
    "2. Enter `SAVE20`.",
    "3. Click Apply.",
    "4. Observe that the discount applies but the checkout CTA disappears.",
    "",
    "## Expected",
    "The checkout CTA remains visible after the coupon applies.",
    "",
    "## Verification from Trace",
    `- Desktop CTA after fix: ${verification.after.desktop.checkoutVisible ? "visible" : "hidden"}`,
    `- Mobile CTA after fix: ${verification.after.mobile.checkoutVisible ? "visible" : "hidden"}`,
    `- Mobile total after fix: ${verification.after.mobile.totalText}`,
    "",
    ...createEvidenceMarkdown(links),
  ].join("\n");
}

function createPullRequestBody(
  issue: GitHubIssue,
  verification: PatchVerifyResult,
  links: EvidenceLinks,
) {
  return [
    `Closes #${issue.number}`,
    "",
    "## Summary",
    "- Keeps the checkout CTA visible after `SAVE20` is applied on mobile.",
    "- Preserves the discount total and coupon feedback.",
    "- Verified with Trace's desktop/mobile Playwright repro.",
    "",
    "## Verification",
    `- Desktop CTA: ${verification.after.desktop.checkoutVisible ? "visible" : "hidden"}`,
    `- Mobile CTA: ${verification.after.mobile.checkoutVisible ? "visible" : "hidden"}`,
    `- Mobile total: ${verification.after.mobile.totalText}`,
    "",
    ...createEvidenceMarkdown(links),
  ].join("\n");
}

async function findOpenIssue(title: string) {
  const issues = await githubRequest<GitHubIssue[]>(
    `/repos/${repoSlug}/issues?state=open&per_page=50`,
  );
  return issues.find((issue) => issue.title === title);
}

async function updateIssueBody(issue: GitHubIssue, verification: PatchVerifyResult, links: EvidenceLinks) {
  return githubRequest<GitHubIssue>(`/repos/${repoSlug}/issues/${issue.number}`, {
    method: "PATCH",
    body: JSON.stringify({
      body: createIssueBody(verification, links),
    }),
  });
}

async function createOrReuseIssue(verification: PatchVerifyResult, links: EvidenceLinks) {
  const title = "Checkout CTA disappears on mobile after SAVE20";
  const existing = await findOpenIssue(title);
  if (existing) {
    return updateIssueBody(existing, verification, links);
  }

  return githubRequest<GitHubIssue>(`/repos/${repoSlug}/issues`, {
    method: "POST",
    body: JSON.stringify({
      title,
      body: createIssueBody(verification, links),
    }),
  });
}

async function findOpenPullRequest(title: string) {
  const prs = await githubRequest<GitHubPullRequest[]>(
    `/repos/${repoSlug}/pulls?state=open&head=${owner}:${encodeURIComponent(fixBranch)}&per_page=30`,
  );
  return prs.find((pr) => pr.title === title);
}

async function updatePullRequestBody(
  pr: GitHubPullRequest,
  issue: GitHubIssue,
  verification: PatchVerifyResult,
  links: EvidenceLinks,
) {
  return githubRequest<GitHubPullRequest>(`/repos/${repoSlug}/pulls/${pr.number}`, {
    method: "PATCH",
    body: JSON.stringify({
      body: createPullRequestBody(issue, verification, links),
    }),
  });
}

async function createOrReusePullRequest(
  issue: GitHubIssue,
  verification: PatchVerifyResult,
  links: EvidenceLinks,
) {
  const title = "Keep checkout CTA visible after SAVE20 on mobile";
  const existing = await findOpenPullRequest(title);
  if (existing) {
    return updatePullRequestBody(existing, issue, verification, links);
  }

  return githubRequest<GitHubPullRequest>(`/repos/${repoSlug}/pulls`, {
    method: "POST",
    body: JSON.stringify({
      title,
      head: fixBranch,
      base: "main",
      body: createPullRequestBody(issue, verification, links),
    }),
  });
}

async function prepareWorktree() {
  await rm(worktreePath, { recursive: true, force: true });
  await mkdir(path.dirname(worktreePath), { recursive: true });
  await execFileAsync("git", ["clone", remoteUrl, worktreePath], { windowsHide: true });
  await git(["config", "user.name", "Trace Agent"]);
  await git(["config", "user.email", "trace@example.local"]);
  await git(["checkout", "main"]);
  await git(["pull", "--ff-only", "origin", "main"]);
  await git(["checkout", "-B", fixBranch]);
}

async function applyCheckoutPatch() {
  const filePath = path.join(worktreePath, targetFile);
  const current = await readFile(filePath, "utf8");
  const patched = current
    .replace('bugTriggered ? "max-sm:hidden" : ""', '""')
    .replace(
      "Review your order details before continuing.",
      "Your discount is applied. Continue to payment when ready.",
    );

  if (patched === current) {
    return false;
  }

  await writeFile(filePath, patched, "utf8");
  return true;
}

function decodeDataUrl(dataUrl?: string) {
  if (!dataUrl) {
    return null;
  }

  const match = dataUrl.match(/^data:image\/png;base64,(.+)$/);
  if (!match) {
    return null;
  }

  return Buffer.from(match[1], "base64");
}

async function writeEvidenceImages(before?: ReproResult, verification?: PatchVerifyResult) {
  const evidenceDir = path.join(worktreePath, "trace-evidence");
  await mkdir(evidenceDir, { recursive: true });

  const beforeImage = decodeDataUrl(before?.mobile.screenshotDataUrl);
  const afterImage = decodeDataUrl(verification?.after.mobile.screenshotDataUrl);
  const written: string[] = [];

  if (beforeImage) {
    await writeFile(path.join(worktreePath, beforeImagePath), beforeImage);
    written.push(beforeImagePath);
  }

  if (afterImage) {
    await writeFile(path.join(worktreePath, afterImagePath), afterImage);
    written.push(afterImagePath);
  }

  return written;
}

function rawUrlFor(commitSha: string, filePath: string) {
  return `https://raw.githubusercontent.com/${repoSlug}/${commitSha}/${filePath}`;
}

export async function createGitHubIssueBranchAndPr(
  verification: PatchVerifyResult,
  before?: ReproResult,
): Promise<GitHubPrResult> {
  await prepareWorktree();
  const changed = await applyCheckoutPatch();
  const evidenceFiles = await writeEvidenceImages(before, verification);
  const status = await git(["status", "--short"]);

  if ((changed || evidenceFiles.length > 0) && status) {
    await git(["add", targetFile, ...evidenceFiles]);
    await git(["commit", "-m", "Keep checkout CTA visible after SAVE20"]);
  }

  await git(["push", "--force-with-lease", "origin", fixBranch]);
  const headSha = await git(["rev-parse", "HEAD"]);
  const links: EvidenceLinks = {
    beforeImageUrl: evidenceFiles.includes(beforeImagePath)
      ? rawUrlFor(headSha, beforeImagePath)
      : undefined,
    afterImageUrl: evidenceFiles.includes(afterImagePath)
      ? rawUrlFor(headSha, afterImagePath)
      : undefined,
  };
  const issue = await createOrReuseIssue(verification, links);
  const pr = await createOrReusePullRequest(issue, verification, links);
  const diff = await git(["diff", "origin/main...HEAD", "--", targetFile]);
  const filesChanged = (await git(["diff", "--name-only", "origin/main...HEAD"]))
    .split(/\r?\n/)
    .filter(Boolean);
  const commits = (await git(["log", "--format=%h", "origin/main..HEAD"]))
    .split(/\r?\n/)
    .filter(Boolean);

  return {
    owner,
    name,
    htmlUrl: repoUrl,
    defaultBranch: "main",
    fixBranch,
    issueNumber: issue.number,
    prNumber: pr.number,
    issueTitle: issue.title,
    prTitle: pr.title,
    issueUrl: issue.html_url,
    prUrl: pr.html_url,
    branchUrl: `${repoUrl}/tree/${encodeURIComponent(fixBranch)}`,
    viewerUrl: pr.html_url,
    commits,
    filesChanged,
    diff,
    beforeImageUrl: links.beforeImageUrl,
    afterImageUrl: links.afterImageUrl,
  };
}
