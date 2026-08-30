export const finiteEntryExamples = [
  { id: "trip", label: "Weekend away", detail: "Places, timing and a sensible budget", outcome: "Plan a weekend trip to Hobart for two people, including a sensible budget and a few things we could do." },
  { id: "dinner", label: "Dinner for eight", detail: "Menu, shopping, timing and dietary needs", outcome: "Plan a dinner party at home for eight people, with menu, timing, shopping and dietary needs covered." },
  { id: "interview", label: "Job interview", detail: "Preparation, evidence and the week before", outcome: "Help me prepare for a job interview for an operations lead role next month." },
] as const;

export type FiniteEntryExampleId = typeof finiteEntryExamples[number]["id"];

export const finiteEntryExample = (id: unknown) => finiteEntryExamples.find((example) => example.id === id);
