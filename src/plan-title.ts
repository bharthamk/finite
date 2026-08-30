const genericRoughPlan = /^(?:travel|renovation|event|adaptive|general)\s+rough plan$/i;

const humanDate = (value: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
};

const coreTitle = (text: string): string => {
  const source = text.trim();
  if (/\b(?:dinner party|dinner plan|dinner at home|host(?:ing)? (?:a )?dinner)\b/i.test(source)) return "Dinner party";
  const interviewEmployer = source.match(/\b(?:role|position)\s+at\s+([^,.;]+?)(?=\s+(?:for|on|at|about|with)\b|[,.;]|$)/i)?.[1]?.trim();
  if (interviewEmployer) return `${interviewEmployer} interview preparation`;
  const interviewCompany = source.match(/\binterview\b[^.!?\n]{0,80}?\bwith\s+([^,.;]+?)(?=\s+(?:for|on|at|about)\b|[,.;]|$)/i)?.[1]?.trim();
  if (interviewCompany) return `${interviewCompany} interview preparation`;
  const interviewRole = source.match(/(?:job )?interview (?:for|as) (?:an? |the )?([^.,;]+?)(?:\s+(?:role|position))?(?:[.,;]|$)/i)?.[1]?.trim();
  if (interviewRole) return `${interviewRole.replace(/\s+(?:role|position)$/i, "")} interview`;
  const weekendDestination = source.match(/weekend (?:trip|away|break)(?:\s+to)?\s+([^.,;]+?)(?:\s+for\s+\w+|[.,;]|$)/i)?.[1]?.trim();
  if (weekendDestination) return `${weekendDestination} weekend`;
  if (/\bhome office\b/i.test(source)) return "Home office makeover";
  const describedTrip = source.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+trip\b/)?.[1]?.trim();
  if (describedTrip) return `${describedTrip} trip`;
  const destination = source.match(/\btrip\s+to\s+([^.,;]+?)(?:\s+for\s+\w+|[.,;]|$)/i)?.[1]?.trim();
  if (destination) return `${destination} trip`;
  const learningTopic = source.match(/\b(?:learn|study|practise|practice)\s+(?:basic\s+)?(.+?)(?=\s+(?:over|for|in|by|starting|from|with)\b|[.,;]|$)/i)?.[1]?.trim();
  if (learningTopic) return `${learningTopic.charAt(0).toUpperCase()}${learningTopic.slice(1)} practice`;
  const cleaned = source
    .split(/[.!?\n]/)[0]!
    .replace(/^(?:i\s+(?:want|need|would like)\s+to\s+)/i, "")
    .replace(/^(?:please\s+)?(?:help me\s+)?(?:plan|prepare|organise|organize|build|create)\s+(?:for\s+)?/i, "")
    .replace(/^(?:an?|the)\s+/i, "")
    .replace(/\s+(?:over|for)\s+(?:the\s+)?(?:next\s+)?(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:days?|weeks?|months?).*$/i, "")
    .replace(/\s+(?:with|within|without|while|before|after)\s+.+$/i, "")
    .trim();
  if (!cleaned) return "My plan";
  const bounded = Array.from(cleaned).slice(0, 72).join("").trim();
  return `${bounded.charAt(0).toUpperCase()}${bounded.slice(1)}`;
};

export const resolvePlanTitle = (input: {
  proposed: string;
  brief?: string;
  start?: string;
}): string => {
  const proposed = input.proposed.trim();
  if (proposed && !genericRoughPlan.test(proposed)) return proposed;
  const title = coreTitle(input.brief || proposed || "My plan");
  const date = humanDate(input.start ?? "");
  return `${title}${date ? ` · ${date}` : ""}`.slice(0, 120);
};
