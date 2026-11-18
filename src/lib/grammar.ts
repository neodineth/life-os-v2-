import type { WorkerLinter } from "harper.js";

let pending: Promise<WorkerLinter> | undefined;

async function getLinter() {
  if (!pending) {
    pending = (async () => {
      const [{ WorkerLinter }, { binaryInlined }] = await Promise.all([
        import("harper.js"), import("harper.js/binaryInlined"),
      ]);
      const linter = new WorkerLinter({ binary: binaryInlined });
      try { await linter.setup(); return linter; }
      catch (error) { await linter.dispose(); throw error; }
    })().catch(error => { pending = undefined; throw error; });
  }
  return pending;
}

export async function checkEnglish(text: string) {
  const linter = await getLinter();
  const lints = await linter.lint(text, { language: "plaintext" });
  return Promise.all(lints.map(async lint => ({
    message: lint.message(),
    corrections: await Promise.all(lint.suggestions().slice(0, 3).map(suggestion =>
      linter.applySuggestion(text, lint, suggestion))),
  })));
}
