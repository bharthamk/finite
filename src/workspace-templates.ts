import type { StarterPlanField } from "./arrival-presentation.js";

export interface WorkspaceSectionTemplate {
  templateId: string;
  moduleId: `custom_${string}`;
  sourceLabel: string;
  label: string;
  description: string;
  variant: "cards" | "checklist" | "calendar";
  fields: StarterPlanField[];
  coveredByFamily?: "travel" | "renovation" | "event";
}

const field = (
  fieldId: string,
  label: string,
  inputType: StarterPlanField["inputType"] = "text",
  placeholder = "",
  options?: StarterPlanField["options"],
): StarterPlanField => ({ fieldId, label, inputType, ...(placeholder ? { placeholder } : {}), ...(options ? { options } : {}) });

const decisionStates = [
  { value: "idea", label: "Idea" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "booked", label: "Booked" },
];

export const workspaceSectionTemplates: WorkspaceSectionTemplate[] = [
  {
    templateId: "accommodation_shortlist",
    moduleId: "custom_accommodation_shortlist",
    sourceLabel: "Travel",
    label: "Accommodation shortlist",
    description: "Compare places, dates, booking state, links and likely cost.",
    variant: "cards",
    coveredByFamily: "travel",
    fields: [field("title", "Stay"), field("location", "Location"), field("bookingStatus", "Booking state", "select", "", decisionStates), field("start", "Check-in", "date"), field("end", "Check-out", "date"), field("website", "Website", "url", "https://"), field("cost", "Likely cost", "number", "0"), field("notes", "Notes", "textarea")],
  },
  {
    templateId: "transport_bookings",
    moduleId: "custom_transport_bookings",
    sourceLabel: "Travel",
    label: "Transport & bookings",
    description: "Keep connected legs, providers, timing, links and costs together.",
    variant: "cards",
    coveredByFamily: "travel",
    fields: [field("title", "Flight or transport"), field("bookingStatus", "Booking state", "select", "", decisionStates), field("from", "From"), field("to", "To"), field("start", "Departure", "date"), field("provider", "Provider or service"), field("cost", "Likely cost", "number", "0"), field("reference", "Booking or option link", "url", "https://"), field("notes", "Notes", "textarea")],
  },
  {
    templateId: "contractors_materials",
    moduleId: "custom_contractors_materials",
    sourceLabel: "Renovation",
    label: "Contractors & materials",
    description: "Track suppliers, quotes, quantities, decisions and when each item is needed.",
    variant: "cards",
    coveredByFamily: "renovation",
    fields: [field("title", "Contractor or material"), field("provider", "Supplier"), field("quantity", "Quantity", "number"), field("bookingStatus", "Decision state", "select", "", decisionStates), field("website", "Website or product", "url", "https://"), field("start", "Needed by", "date"), field("cost", "Likely cost", "number", "0"), field("notes", "Notes", "textarea")],
  },
  {
    templateId: "guests_venue",
    moduleId: "custom_guests_venue",
    sourceLabel: "Event",
    label: "Guests & venue",
    description: "Track groups, capacity, contacts, venue choices and commitments.",
    variant: "cards",
    coveredByFamily: "event",
    fields: [field("title", "Guest group or venue"), field("headcount", "People or capacity", "number"), field("contact", "Contact"), field("bookingStatus", "Decision state", "select", "", decisionStates), field("location", "Location"), field("start", "Date", "date"), field("website", "Website or reference", "url", "https://"), field("cost", "Likely cost", "number", "0"), field("notes", "Notes", "textarea")],
  },
  {
    templateId: "suppliers_logistics",
    moduleId: "custom_suppliers_logistics",
    sourceLabel: "Event",
    label: "Suppliers & logistics",
    description: "Track providers, equipment, delivery details, decisions and costs.",
    variant: "cards",
    coveredByFamily: "event",
    fields: [field("title", "Supplier or logistics item"), field("provider", "Provider"), field("bookingStatus", "Decision state", "select", "", decisionStates), field("website", "Website or reference", "url", "https://"), field("start", "Due", "date"), field("cost", "Likely cost", "number", "0"), field("notes", "Notes", "textarea")],
  },
  {
    templateId: "menu_dietary",
    moduleId: "custom_menu_dietary",
    sourceLabel: "Dinner",
    label: "Menu & dietary fit",
    description: "Shape courses, prep-ahead work and dietary safety in one place.",
    variant: "cards",
    fields: [field("title", "Dish or menu item"), field("course", "Course"), field("vegetarian", "Vegetarian", "select", "", [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]), field("nutSafe", "Nut-allergy plan", "text", "Ingredients and cross-contact controls"), field("prepAhead", "Prep ahead", "text", "What can be completed before guests arrive?"), field("notes", "Notes", "textarea")],
  },
  {
    templateId: "interview_evidence",
    moduleId: "custom_interview_evidence",
    sourceLabel: "Interview",
    label: "Interview evidence bank",
    description: "Build concise examples around competencies, actions, results and proof.",
    variant: "cards",
    fields: [field("title", "Competency"), field("situation", "Situation", "textarea"), field("action", "Action", "textarea"), field("result", "Result", "textarea"), field("proof", "Proof", "textarea"), field("confidence", "Readiness", "select", "", [{ value: "needs_evidence", label: "Needs evidence" }, { value: "draft", label: "Draft" }, { value: "rehearsed", label: "Rehearsed" }])],
  },
  {
    templateId: "practice_log",
    moduleId: "custom_practice_log",
    sourceLabel: "Learning",
    label: "Practice log",
    description: "Record sessions, focus, time, confidence and a small piece of progress evidence.",
    variant: "cards",
    fields: [field("title", "Session or checkpoint"), field("date", "Date", "date"), field("focus", "Focus"), field("durationMinutes", "Minutes", "number", "30"), field("confidence", "Confidence", "select", "", [{ value: "new", label: "New" }, { value: "developing", label: "Developing" }, { value: "comfortable", label: "Comfortable" }]), field("evidence", "What changed", "textarea"), field("notes", "Notes", "textarea")],
  },
];

export const workspaceSectionTemplate = (templateId: string): WorkspaceSectionTemplate | undefined => workspaceSectionTemplates.find((template) => template.templateId === templateId);
