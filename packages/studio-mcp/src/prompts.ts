export interface PromptDef {
  name: "new-contract" | "write-tests" | "security-review";
  description: string;
  arguments: { name: string; description: string; required: boolean }[];
  render(args: Record<string, string | undefined>): string;
}

const project = { name: "project", description: "Name of the Studio project", required: true };

export const PROMPTS: PromptDef[] = [
  {
    name: "new-contract",
    description: "Design, implement and test a new SmartC contract from requirements.",
    arguments: [{ name: "requirements", description: "What the contract should do", required: false }],
    render: ({ requirements }) =>
      [
        requirements ? `Build a new SmartC contract for these requirements:\n${requirements}` : "Build a new SmartC contract. First ask the user what it should do.",
        "",
        "Steps:",
        "1. Clarify open requirements with the user: roles, methods, funds flow, limits. Ask before assuming.",
        "2. create_project, then structure the contract (state, handlers, error handling) per the signum-smartc skill if installed.",
        "3. Write the contract and call compile; fix every error.",
        "4. Call lint and resolve the findings, or explain why one is acceptable.",
        "5. Call analyze_gas and make sure activationAmount covers the most expensive handler.",
        "6. Write tests (happy path, permissions, limits, insufficient funds) and call run_tests.",
        "7. Iterate until compile, lint, gas and tests are green. Report the results you actually saw.",
        "Never deploy: tell the user to use the Studio's deploy page.",
      ].join("\n"),
  },
  {
    name: "write-tests",
    description: "Write and run tests for an existing project.",
    arguments: [project],
    render: ({ project }) =>
      [
        `Write tests for the project /${project}.`,
        "",
        "Steps:",
        `1. list_files for ${project} and read_file the contract and any existing tests.`,
        "2. Derive the handlers (methods) and the scenarios per handler: happy path, permissions, limits, insufficient funds.",
        "3. Write the tests, then call run_tests.",
        "4. Read each failure (expected vs actual). Fix the test or report a real contract bug; do not weaken assertions to get green.",
        "5. Repeat until all tests pass and summarise the coverage.",
      ].join("\n"),
  },
  {
    name: "security-review",
    description: "Review a project for security and gas problems without changing it.",
    arguments: [project],
    render: ({ project }) =>
      [
        `Review the project /${project} for security problems. Do not change any file.`,
        "",
        "Steps:",
        `1. list_files for ${project} and read_file the contract completely.`,
        "2. Call compile, lint and analyze_gas on it and note every finding.",
        "3. Review manually using the signum-smartc skill's analysis checklist if installed: sender checks, fund handling, unbounded loops, dispatch defaults, error handler, overwritten deploy parameters.",
        "4. Report a prioritised list (critical first) with file and line, impact and a suggested fix for each. Make no changes.",
      ].join("\n"),
  },
];
