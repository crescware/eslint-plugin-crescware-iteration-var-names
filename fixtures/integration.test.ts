import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, test } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const oxlintBin = resolve(repoRoot, "node_modules/.bin/oxlint");
const fixturesDir = resolve(repoRoot, "fixtures");
const configPath = resolve(fixturesDir, "oxlintrc.fixtures.json");

type Diagnostic = {
  message: string;
  filename: string;
  severity: string;
};

type OxlintReport = { diagnostics: Diagnostic[] };

let allDiagnostics: Diagnostic[] = [];

const runFixturesOnce = (): Diagnostic[] => {
  const result = spawnSync(
    oxlintBin,
    ["-c", configPath, "--no-ignore", "-f", "json", resolve(fixturesDir) + "/"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  if (result.error !== undefined && result.error !== null) {
    throw result.error;
  }
  const parsed = JSON.parse(result.stdout ?? "") as OxlintReport;
  return parsed.diagnostics;
};

const messagesFor = (filename: string): string[] => {
  return allDiagnostics
    .filter((v) => v.filename.endsWith(`/${filename}`))
    .map((v) => v.message);
};

beforeAll(() => {
  const probe = spawnSync(oxlintBin, ["--version"], { encoding: "utf8" });
  if (probe.status !== 0) {
    throw new Error(`oxlint not runnable: ${probe.stderr ?? ""}`);
  }
  allDiagnostics = runFixturesOnce();
});

describe("OK fixtures produce no false positives", () => {
  test.each([
    "ok-iterators.ts",
    "ok-reduce.ts",
    "ok-sort.ts",
    "ok-meaningful-names.ts",
    "ok-function-expression.ts",
    "ok-special-params.ts",
    "ok-extra-args.ts",
    "ok-non-target.ts",
    "ok-computed.ts",
    "ok-chained-siblings.ts",
    "ok-nested-3-levels.ts",
    "ok-for-classic.ts",
    "ok-for-of.ts",
    "ok-for-in.ts",
    "ok-for-destructure.ts",
    "ok-for-meaningful.ts",
  ])("%s", (file) => {
    expect(messagesFor(file)).toEqual([]);
  });
});

describe("NG fixtures match exactly", () => {
  test("ng-iterators-first-arg.ts (all 10 methods)", () => {
    expect(messagesFor("ng-iterators-first-arg.ts")).toEqual([
      "Array.prototype.map expects 'v' for argument 1 (got: 'e').",
      "Array.prototype.filter expects 'v' for argument 1 (got: 'e').",
      "Array.prototype.forEach expects 'v' for argument 1 (got: 'e').",
      "Array.prototype.find expects 'v' for argument 1 (got: 'e').",
      "Array.prototype.findIndex expects 'v' for argument 1 (got: 'e').",
      "Array.prototype.findLast expects 'v' for argument 1 (got: 'e').",
      "Array.prototype.findLastIndex expects 'v' for argument 1 (got: 'e').",
      "Array.prototype.some expects 'v' for argument 1 (got: 'e').",
      "Array.prototype.every expects 'v' for argument 1 (got: 'e').",
      "Array.prototype.flatMap expects 'v' for argument 1 (got: 'e').",
    ]);
  });

  test("ng-map-positions.ts", () => {
    expect(messagesFor("ng-map-positions.ts")).toEqual([
      "Array.prototype.map expects 'i' for argument 2 (got: 'x').",
      "Array.prototype.map expects 'arr' for argument 3 (got: 'x').",
    ]);
  });

  test("ng-reduce-sync.ts", () => {
    expect(messagesFor("ng-reduce-sync.ts")).toEqual([
      "Array.prototype.reduce expects 'acc' for argument 1 (got: 'x').",
      "Array.prototype.reduce expects 'v' for argument 2 (got: 'x').",
      "Array.prototype.reduce expects 'i' for argument 3 (got: 'x').",
      "Array.prototype.reduce expects 'arr' for argument 4 (got: 'x').",
    ]);
  });

  test("ng-reduce-async.ts", () => {
    expect(messagesFor("ng-reduce-async.ts")).toEqual([
      "Array.prototype.reduce expects 'prev' for argument 1 (got: 'a').",
      "Array.prototype.reduce expects 'v' for argument 2 (got: 'x').",
    ]);
  });

  test("ng-reduce-right.ts", () => {
    expect(messagesFor("ng-reduce-right.ts")).toEqual([
      "Array.prototype.reduceRight expects 'acc' for argument 1 (got: 'x').",
      "Array.prototype.reduceRight expects 'prev' for argument 1 (got: 'x').",
    ]);
  });

  test("ng-sort.ts", () => {
    expect(messagesFor("ng-sort.ts")).toEqual([
      "Array.prototype.sort expects 'a' for argument 1 (got: 'x').",
      "Array.prototype.sort expects 'b' for argument 2 (got: 'y').",
      "Array.prototype.sort expects 'b' for argument 2 (got: 'x').",
    ]);
  });

  test("ng-multiple-in-callback.ts (2 errors in 1 callback)", () => {
    expect(messagesFor("ng-multiple-in-callback.ts")).toEqual([
      "Array.prototype.map expects 'v' for argument 1 (got: 'e').",
      "Array.prototype.map expects 'i' for argument 2 (got: 'x').",
    ]);
  });

  test("ng-function-expression.ts", () => {
    expect(messagesFor("ng-function-expression.ts")).toEqual([
      "Array.prototype.map expects 'v' for argument 1 (got: 'e').",
    ]);
  });

  test("ng-nested-3-levels.ts (2 errors on the outer 2 layers)", () => {
    expect(messagesFor("ng-nested-3-levels.ts")).toEqual([
      "Avoid the single-character name 'c' on an outer Array.prototype.map callback; use a meaningful name with 2 or more characters.",
      "Avoid the single-character name 'e' on an outer Array.prototype.map callback; use a meaningful name with 2 or more characters.",
    ]);
  });

  test("ng-outer-named-v.ts", () => {
    expect(messagesFor("ng-outer-named-v.ts")).toEqual([
      "Avoid the single-character name 'v' on an outer Array.prototype.map callback; use a meaningful name with 2 or more characters.",
    ]);
  });

  test("ng-for-classic-inner.ts", () => {
    expect(messagesFor("ng-for-classic-inner.ts")).toEqual([
      "for loop variable 'x' is not allowed; use 'k', 'v', 'i' or a meaningful name with 2 or more characters.",
    ]);
  });

  test("ng-for-classic-multi-decl.ts (i allowed, j flagged)", () => {
    expect(messagesFor("ng-for-classic-multi-decl.ts")).toEqual([
      "for loop variable 'j' is not allowed; use 'k', 'v', 'i' or a meaningful name with 2 or more characters.",
    ]);
  });

  test("ng-for-of-inner.ts", () => {
    expect(messagesFor("ng-for-of-inner.ts")).toEqual([
      "for-of loop variable 'x' is not allowed; use 'k', 'v', 'i' or a meaningful name with 2 or more characters.",
    ]);
  });

  test("ng-for-in-inner.ts", () => {
    expect(messagesFor("ng-for-in-inner.ts")).toEqual([
      "for-in loop variable 'x' is not allowed; use 'k', 'v', 'i' or a meaningful name with 2 or more characters.",
    ]);
  });

  test("ng-for-destructure-inner.ts ([k, x] of map: x flagged)", () => {
    expect(messagesFor("ng-for-destructure-inner.ts")).toEqual([
      "for-of loop variable 'x' is not allowed; use 'k', 'v', 'i' or a meaningful name with 2 or more characters.",
    ]);
  });

  test("ng-for-nested-outer.ts (inner j flagged, outer i flagged)", () => {
    expect(messagesFor("ng-for-nested-outer.ts")).toEqual([
      "for loop variable 'j' is not allowed; use 'k', 'v', 'i' or a meaningful name with 2 or more characters.",
      "Avoid the single-character name 'i' on an outer for loop; use a meaningful name with 2 or more characters.",
    ]);
  });

  test("ng-mixed-map-in-for.ts (outer for becomes outer due to inner forEach)", () => {
    expect(messagesFor("ng-mixed-map-in-for.ts")).toEqual([
      "Avoid the single-character name 'i' on an outer for loop; use a meaningful name with 2 or more characters.",
    ]);
  });

  test("ng-mixed-for-in-map.ts (outer map becomes outer due to inner for-of)", () => {
    expect(messagesFor("ng-mixed-for-in-map.ts")).toEqual([
      "Avoid the single-character name 'r' on an outer Array.prototype.map callback; use a meaningful name with 2 or more characters.",
    ]);
  });
});

describe("Totals", () => {
  test("no diagnostics emitted from OK fixtures", () => {
    const okMessages = allDiagnostics
      .filter((v) => /\/ok-/.test(v.filename))
      .map((v) => v.message);
    expect(okMessages).toEqual([]);
  });
});
