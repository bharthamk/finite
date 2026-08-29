import test from "node:test";
import assert from "node:assert/strict";
import { starterPlanForArrival } from "../dist-test/src/arrival-presentation.js";

const timestamp = "2026-08-29T00:00:00.000Z";
const input = (orderId, version, payload, sourceSurface = "site") => ({
  inputId: `${sourceSurface === "codex" ? "arrival_operator" : "arrival_input"}_${orderId}_${version}`,
  kind: "detail",
  payload,
  sourceSurface,
  createdAt: timestamp,
});

const scenario = ({ orderId, rawOutcome, family, summary, known, inputs }) => ({
  orderVersion: "finite-arrival-order.v1",
  orderId,
  version: 1 + inputs.length,
  status: "proposed_plan_ready",
  rawOutcome,
  structured: {},
  attachments: [],
  inputs,
  pendingClarification: null,
  interpretation: {
    basedOnVersion: 1,
    inferredFamily: family,
    summary,
    known,
    inferred: {},
    missing: [],
    contradictions: [],
    dependencies: [],
    savedOperatorWork: {},
    complete: true,
    stagedAt: timestamp,
  },
  lastOperatorCheckpoint: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
  checksum: "a".repeat(64),
});

test("four demo scenarios cover the standard workspace and bounded specialist extensions", () => {
  const weekendId = "arrival_demo_weekend";
  const weekend = starterPlanForArrival(scenario({
    orderId: weekendId,
    rawOutcome: "Plan a weekend trip to Hobart for two people.",
    family: "travel",
    summary: "A two-night Hobart weekend with a clear spend limit.",
    known: { destinations: ["Hobart"], departureDate: "2026-10-09", returnDate: "2026-10-11", budget: "A$1,500", travellers: "Two people" },
    inputs: [
      input(weekendId, 2, { workspaceOperation: "add", moduleId: "transport", recordId: "flight_hobart", label: "Return flights", fields: { title: "Return flights", from: "Sydney", to: "Hobart", start: "2026-10-09", end: "2026-10-11", cost: "620", currency: "AUD", bookingStatus: "shortlisted" } }),
      input(weekendId, 3, { workspaceOperation: "add", moduleId: "stays", recordId: "stay_hobart", label: "Central Hobart stay", fields: { title: "Central Hobart stay", location: "Hobart", start: "2026-10-09", end: "2026-10-11", totalBudget: "460", currency: "AUD", bookingStatus: "shortlisted", website: "https://example.com/hobart" } }),
      input(weekendId, 4, { workspaceOperation: "add", moduleId: "tasks", recordId: "task_book", label: "Book after checking leave", fields: { title: "Book after checking leave", due: "2026-09-05", done: false } }),
    ],
  }));
  assert.equal(weekend.family, "travel");
  assert.equal(weekend.overview.start, "2026-10-09");
  assert.equal(weekend.overview.end, "2026-10-11");
  assert.equal(weekend.sections.filter((section) => section.custom).length, 0);
  assert.ok(weekend.sections.find((section) => section.sectionId === "transport").items.some((item) => item.itemId === "flight_hobart"));
  assert.ok(weekend.sections.find((section) => section.sectionId === "stays").items.some((item) => item.fields.website));

  const dinnerId = "arrival_demo_dinner";
  const dinner = starterPlanForArrival(scenario({
    orderId: dinnerId,
    rawOutcome: "Plan a dinner party at home for eight people.",
    family: "event",
    summary: "An eight-person dinner party with menu, timing and dietary needs visible.",
    known: { eventDate: "2026-09-19", budget: "A$450", guestCount: 8, venue: "Home" },
    inputs: [
      input(dinnerId, 2, { workspaceOperation: "add", moduleId: "scope", recordId: "guest_group", label: "Dinner guests", fields: { title: "Dinner guests", headcount: "8", bookingStatus: "shortlisted", location: "Home", start: "2026-09-19", notes: "Two vegetarian; one nut allergy to confirm." } }),
      input(dinnerId, 3, { workspaceOperation: "module_add", moduleId: "custom_menu_dietary", moduleSource: "codex", label: "Menu & dietary fit", description: "Track each dish, course, dietary fit and make-ahead work.", variant: "cards", fields: [{ fieldId: "title", label: "Dish", inputType: "text" }, { fieldId: "course", label: "Course", inputType: "text" }, { fieldId: "dietaryFit", label: "Dietary fit", inputType: "text" }, { fieldId: "prepAhead", label: "Prepare ahead", inputType: "text" }, { fieldId: "notes", label: "Serving notes", inputType: "textarea" }] }, "codex"),
      input(dinnerId, 4, { workspaceOperation: "add", moduleId: "custom_menu_dietary", recordId: "dish_main", label: "Mushroom pithivier", fields: { title: "Mushroom pithivier", course: "Main", dietaryFit: "Vegetarian", prepAhead: "Assemble in the morning", notes: "Confirm pastry is nut-free." } }),
    ],
  }));
  assert.equal(dinner.family, "event");
  assert.equal(dinner.sections.find((section) => section.sectionId === "scope").items.find((item) => item.itemId === "guest_group").fields.headcount, "8");
  assert.equal(dinner.sections.find((section) => section.sectionId === "custom_menu_dietary").items.find((item) => item.itemId === "dish_main").fields.course, "Main");

  const interviewId = "arrival_demo_interview";
  const interview = starterPlanForArrival(scenario({
    orderId: interviewId,
    rawOutcome: "Prepare for a job interview for an operations lead role.",
    family: "general",
    summary: "A focused interview plan covering logistics, people, evidence and questions.",
    known: { interviewDate: "2026-09-04", role: "Operations Lead", company: "Example Co", format: "Video interview" },
    inputs: [
      input(interviewId, 2, { workspaceOperation: "add", moduleId: "resources", recordId: "hiring_manager", label: "Hiring manager", fields: { title: "Hiring manager", provider: "Example Co", status: "ready", reference: "https://example.com/team", notes: "Review public background and role remit." } }),
      input(interviewId, 3, { workspaceOperation: "module_add", moduleId: "custom_interview_evidence", moduleSource: "codex", label: "Interview evidence", description: "Connect each likely competency to a concise example, result and proof.", variant: "cards", fields: [{ fieldId: "title", label: "Competency", inputType: "text" }, { fieldId: "example", label: "Example", inputType: "textarea" }, { fieldId: "result", label: "Result", inputType: "textarea" }, { fieldId: "proof", label: "Proof", inputType: "text" }, { fieldId: "confidence", label: "Confidence", inputType: "text" }] }, "codex"),
      input(interviewId, 4, { workspaceOperation: "add", moduleId: "custom_interview_evidence", recordId: "story_change", label: "Leading through change", fields: { title: "Leading through change", example: "Replanned a live programme after a supplier failure.", result: "Protected the customer deadline.", proof: "Delivery timeline and stakeholder note", confidence: "Needs one tighter metric" } }),
    ],
  }));
  assert.equal(interview.family, "general");
  assert.ok(interview.sections.find((section) => section.sectionId === "resources").fields.some((field) => field.fieldId === "reference"));
  assert.equal(interview.sections.find((section) => section.sectionId === "custom_interview_evidence").items[0].fields.confidence, "Needs one tighter metric");

  const officeId = "arrival_demo_office";
  const office = starterPlanForArrival(scenario({
    orderId: officeId,
    rawOutcome: "Plan a home office makeover without replacing the desk.",
    family: "renovation",
    summary: "A home office makeover with fit, sourcing, budget and installation sequence visible.",
    known: { deadline: "2026-10-18", budget: "A$2,500", hardConstraint: "Keep the existing desk" },
    inputs: [
      input(officeId, 2, { workspaceOperation: "add", moduleId: "resources", recordId: "monitor_arm", label: "Dual monitor arm", fields: { title: "Dual monitor arm", provider: "Shortlist", quantity: "1", bookingStatus: "idea", website: "https://example.com/monitor-arm", start: "2026-10-04", cost: "240" } }),
      input(officeId, 3, { workspaceOperation: "module_add", moduleId: "custom_measurements_fit", moduleSource: "codex", label: "Measurements & fit", description: "Keep physical dimensions and clearance decisions beside each item or zone.", variant: "cards", fields: [{ fieldId: "title", label: "Item or zone", inputType: "text" }, { fieldId: "width", label: "Width", inputType: "number" }, { fieldId: "depth", label: "Depth", inputType: "number" }, { fieldId: "height", label: "Height", inputType: "number" }, { fieldId: "clearance", label: "Required clearance", inputType: "text" }, { fieldId: "notes", label: "Fit decision", inputType: "textarea" }] }, "codex"),
      input(officeId, 4, { workspaceOperation: "add", moduleId: "custom_measurements_fit", recordId: "desk_zone", label: "Existing desk zone", fields: { title: "Existing desk zone", width: "1800", depth: "750", height: "730", clearance: "Keep 900 mm chair movement", notes: "Desk stays; mount and lighting must fit around it." } }),
    ],
  }));
  assert.equal(office.family, "renovation");
  assert.equal(office.sections.find((section) => section.sectionId === "resources").items.find((item) => item.itemId === "monitor_arm").fields.quantity, "1");
  assert.equal(office.sections.find((section) => section.sectionId === "custom_measurements_fit").items[0].fields.width, "1800");

  for (const plan of [weekend, dinner, interview, office]) {
    assert.ok(plan.sections.some((section) => section.variant === "calendar"));
    assert.ok(plan.sections.some((section) => section.sectionId === "money"));
    assert.ok(plan.sections.some((section) => section.sectionId === "requirements"));
    assert.ok(plan.sections.some((section) => section.sectionId === "tasks"));
    assert.ok(plan.sections.every((section) => section.fields[0]?.fieldId === "title"));
  }
});
