import { fieldCandidates, parseHoursRow } from "./nuknuk-research.mjs";
import { sourceText } from "./nuknuk-sources.mjs";

export const pricePageLabel = /eintritt|preise?|admission|tickets?|tarifs?|tariffe|speise|getränk|menu|brunch|frühstück/iu;
const hoursHeading = /^(?:(?:unsere\s+)?(?:öffnungszeiten|opening hours)|wann)\s*:?$/iu;
const closure = /(?:vorübergehend|bis auf weiteres|wegen .{0,80})\s+(?:.{0,60}\s+)?geschlossen|(?:bleibt|bleiben) .{0,100}geschlossen|temporarily closed/iu;
const lastEntry = /(?:letzte[rn]?\s+(?:einlass|eintritt)|last admission|last entry)\s*:?\s*(?:um\s+)?(?:[01]?\d|2[0-3])(?:[:.][0-5]\d|\s*uhr)/iu;
const lateOpening = /^(?:montags?|dienstags?|mittwochs?|donnerstags?|freitags?|samstags?|sonntags?)\s+(?:jeweils\s+)?bis\s+.+\s+geöffnet[.!]?$/iu;
const weekdays = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
const field = { attributeKey: "hours.regular" };
const swissAmount = "(?:0|[1-9]\\d{0,4})(?:[.,]\\d{1,2}|[.–]-(?!\\d)|\\.-)?";
const priceAtEnd = new RegExp(`(?:\\bCHF\\s*(${swissAmount})|(?<![\\d.,])(${swissAmount})\\s*CHF|[ \\t](${swissAmount}(?:[.–]-|[.,]\\d{2})))\\s*(?:pro Person|per person)?$`, "iu");
const unsafePrice = /\b(?:ab\s+\d|gutschein|voucher|liefer|delivery|pfand|servicegebühr|aufschlag|zuschlag|deposit|subscription|beispiel|example|alter in jahren|age in years|pro gruppe|per group)\b/iu;
const categories = {
  DRINK: /^(?:getränke|cocktails?|drinks?|weine?|bier(?:e)?|kaffee|softdrinks?|boissons)(?:karte)?$/iu,
  MEAL: /^(?:speisen|speisekarte|hauptgerichte|main courses|pizza(?:s)?|pasta|burger|brunch|frühstück|menükarte|gerichte)$/iu,
  ADMISSION: /^(?:eintritt(?:spreise?)?|admission|tickets?|tarife)$/iu,
};

function proposal(attributeKey, value, evidence, page) {
  return { attributeKey, value, evidence: evidence.slice(0, 800), url: page.url, observedAt: page.observedAt, method: "DIRECT", review: true };
}

export function venueSections(page, matches, { sharedSite = false, name } = {}) {
  const headingBlocks = page.body.split(/(?=<h2\b)/iu);
  const scoped = headingBlocks.filter(body => {
    const heading = body.match(/^<h2\b[^>]*>([\s\S]*?)<\/h2>/iu)?.[1];
    if (!heading || !name) return false;
    const normalize = value => value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    return normalize(heading.replace(/<[^>]*>/gu, " ")).includes(normalize(name)) && matches({ ...page, body });
  });
  // On a multi-venue page keep the branch section, without the general footer.
  if (headingBlocks.length > 1 && scoped.length === 1) {
    const body = scoped[0].split(/<footer\b/iu)[0];
    if (matches({ ...page, body })) return [{ ...page, body }];
  }
  return !sharedSite && matches(page) ? [page] : [];
}

function closureDates(line, observedAt) {
  const dates = [...line.matchAll(/(?<!\d)(\d{1,2})\.(\d{1,2})\.(20\d{2})(?!\d)/gu)].map(([, day, month, year]) => {
    const iso = [year, month.padStart(2, "0"), day.padStart(2, "0")].join("-");
    const timestamp = Date.parse(iso);
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString().startsWith(iso) ? timestamp : NaN;
  });
  if (dates.length !== 2 || !dates.every(Number.isFinite) || dates[0] > dates[1] || dates[1] - dates[0] > 30 * 86400000) return null;
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Zurich" }).format(new Date(observedAt));
  const result = [];
  for (let stamp = dates[0]; stamp <= dates[1]; stamp += 86400000) {
    const date = new Date(stamp).toISOString().slice(0, 10);
    if (date >= today) result.push({ date, status: "CLOSED", intervals: [] });
  }
  return result;
}

function scheduleOn(page, lines) {
  const rows = new Map();
  const quotes = [];
  let conflict = false;
  for (const [index, line] of lines.entries()) {
    if (!hoursHeading.test(line)) continue;
    const block = [];
    for (const next of lines.slice(index + 1, index + 16)) {
      if (hoursHeading.test(next) || /^(?:preise?|kontakt|wo|speisekarte|küchenzeiten|kitchen hours)$/iu.test(next)) break;
      if (next.length > 150) break;
      block.push(next);
    }
    for (const entry of fieldCandidates(field, [{ id: "schedule", text: block.join("\n") }])) {
      const next = block.find(line => lateOpening.test(line));
      const ordinary = parseHoursRow(entry.quote);
      const extended = next && ordinary.length > 1 ? parseHoursRow(entry.quote + " " + next.replace(/\bjeweils\s+/iu, "")) : [];
      for (const row of extended.length ? extended : ordinary) {
        if (rows.has(row.day) && JSON.stringify(rows.get(row.day)) !== JSON.stringify(row)) conflict = true;
        rows.set(row.day, row);
      }
      quotes.push(extended.length ? entry.quote + " · " + next : entry.quote);
    }
  }
  if (conflict || !rows.size) return null;
  return proposal("hours.regular", weekdays.flatMap(day => rows.has(day) ? [rows.get(day)] : []), [...new Set(quotes)].join(" · "), page);
}

function pricesOn(page, lines, menuPurpose) {
  const amounts = new Map();
  let section = menuPurpose;
  const brunchPage = /brunch|frühstück/iu.test(new URL(page.url).pathname);
  const brunchDays = brunchPage && lines.some(line => /^sonntags$/iu.test(line)) ? ["SUNDAY"] : [];
  for (const [index, line] of lines.entries()) {
    const heading = Object.keys(categories).find(key => categories[key].test(line));
    if (heading) { section = heading; continue; }
    let quote = line;
    const match = quote.match(priceAtEnd);
    if (!match || unsafePrice.test(quote)) continue;
    const raw = match.slice(1).find(Boolean);
    let label = quote.slice(0, match.index).trim().replace(/[:\s]+$/u, "");
    if (!label && index > 0) {
      label = lines[index - 1];
      quote = label + " " + line;
    }
    if (!/\p{L}/u.test(label) || label.length > 100 || unsafePrice.test(label)) continue;
    const age = label.match(/(?:ab|from)\s+(\d{1,2})\s+(?:jahren|years)/iu);
    const purpose = /eintritt|admission|ticket/iu.test(label) ? "ADMISSION" : /brunch|frühstück/iu.test(label) ? "MEAL" : section;
    if (!purpose || /kind(?:er)?|children|child|familie|family|ermässigt|student|gruppe|group/iu.test(label)) continue;
    if (purpose === "ADMISSION" && !/^(?:erwachsene(?:r)?|adults?|(?:regulärer?\s+)?eintritt(?:spreis)?(?:\s+erwachsene)?|admission|standard ticket)$/iu.test(label)) continue;
    if (/\b(?:preis|price)\b/iu.test(label) && !age && purpose !== "ADMISSION") continue;
    const amount = Number(raw.replace(/[.–]-$/u, "").replace(",", "."));
    if (!Number.isFinite(amount) || amount < 0 || amount === 0 && purpose !== "ADMISSION") continue;
    const key = purpose + ":" + (age?.[1] ?? "");
    const entries = amounts.get(key) ?? new Map();
    entries.set(label, { amount, quote });
    amounts.set(key, entries);
  }
  return [...amounts].flatMap(([key, entries]) => {
    const [purpose, age] = key.split(":");
    const listed = [...entries.values()].sort((a, b) => a.amount - b.amount);
    if (purpose !== "ADMISSION" && listed.length < 2 && !age) return [];
    const low = listed[0], high = listed.at(-1);
    return [proposal("operation.price_options", {
      purpose, min: low.amount, max: high.amount, minimumAge: age ? Number(age) : null,
      ...(purpose === "MEAL" && brunchPage ? { occasion: "Brunch", days: brunchDays } : {}),
    }, [...new Set([low.quote, high.quote])].join(" · "), page)];
  });
}

export function readVisitFacts(pages) {
  const schedules = new Map();
  const prices = new Map();
  const restrictions = new Map();
  for (const { page, menuPurpose } of pages) {
    const lines = sourceText(page, "crawler-visit").text.split("\n").map(line => line.trim()).filter(Boolean);
    const schedule = scheduleOn(page, lines);
    if (schedule) schedules.set(JSON.stringify(schedule.value), schedule);
    for (const item of pricesOn(page, lines, menuPurpose)) {
      const { purpose, minimumAge } = item.value;
      const key = purpose + ":" + minimumAge;
      const previous = prices.get(key);
      if (!previous || (item.value.max - item.value.min) > (previous.value.max - previous.value.min)) prices.set(key, item);
    }
    for (const line of lines) {
      if (closure.test(line)) {
        const dates = closureDates(line, page.observedAt);
        if (dates === null) restrictions.set("hours.closure_notice", proposal("hours.closure_notice", null, line, page));
        else if (dates.length) restrictions.set("hours.special", proposal("hours.special", dates, line, page));
      }
      if (lastEntry.test(line)) restrictions.set("hours.last_entry", proposal("hours.last_entry", null, line, page));
    }
  }
  return { schedule: schedules.size === 1 ? schedules.values().next().value : null, prices: [...prices.values()], restrictions: [...restrictions.values()] };
}

const visitClassification = {
  RESTAURANT: ["EAT", "EAT_DRINK", /restaurant|bistro|brasserie|ristorante|pizzeria|brunch/iu, /speisekarte|brunch.buffet|hauptgerichte|mittagessen|abendessen|dining|main courses/iu],
  CAFE: ["COFFEE_DAYTIME", "EAT_DRINK", /caf[eé]|kaffeehaus|coffee shop|specialty coffee/iu, /kaffee|coffee|espresso|brunch|frühstück|breakfast|kuchen/iu],
  BAR: ["DRINKS", "EAT_DRINK", /\bbar\b|weinbar|cocktailbar|\bpub\b/iu, /cocktails?|getränkekarte|drinks? menu|bier vom fass|weinkarte|ausschank/iu],
  NIGHTCLUB: ["NIGHTLIFE", "ENTERTAINMENT", /nachtclub|nightclub|tanzclub|\bclub\b/iu, /tanzen|dance floor|tanzfläche|clubbing|dj.sets?/iu],
  MUSEUM: ["CULTURE_ARTS", "CULTURE_ARTS", /museum|musée/iu, /ausstellung|exhibition|sammlung|collection|kunstwerke?/iu],
  AMUSEMENT_PARK: ["ACTIVITIES_PLAY", "ACTIVITY_PLAY", /freizeitpark|spielpark|amusement park|theme park/iu, /fahrgeschäfte|achterbahn|spielattraktionen|trampolin|indoor.spiel|rides|play area/iu],
  PLAYGROUND: ["ACTIVITIES_PLAY", "ACTIVITY_PLAY", /spielplatz|playground/iu, /klettergerüst|schaukel|rutschbahn|sandkasten|slide|swings?/iu],
};

export function readVisitClassification(pages, spot) {
  const rule = Object.hasOwn(visitClassification, spot.crawlerCategory) ? visitClassification[spot.crawlerCategory] : null;
  if (!rule) return [];
  const [primaryCategory, purpose, categoryTerms, purposeTerms] = rule;
  const normalize = text => text.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const name = normalize(spot.name);
  const categoryEvidence = pages.flatMap(({ page, venueIdentity }) => {
    if (!venueIdentity) return [];
    const headings = [...page.body.matchAll(/<(title|h1|h2)\b[^>]*>([\s\S]*?)<\/\1>/giu)];
    return headings.flatMap(([, tag, html]) => {
      let heading;
      try { heading = sourceText({ ...page, body: "<h1>" + html + "</h1>" }, "category").text.trim(); }
      catch (error) {
        if (error instanceof Error && error.message === "source_empty") return [];
        throw error;
      }
      if (heading.length > 200 || !(" " + normalize(heading) + " ").includes(" " + name + " ") ||
          /häufige fragen|faq|häufig gestellte/iu.test(heading) || !categoryTerms.test(heading)) return [];
      return [{ page, heading, priority: tag.toLowerCase() === "title" ? 1 : 0 }];
    });
  }).sort((a, b) => a.priority - b.priority);
  const category = categoryEvidence[0];
  if (!category) return [];
  const results = [proposal("classification.primary_category", primaryCategory, category.heading, category.page)];
  const purposeEvidence = [category.page, ...pages.map(({ page }) => page).filter(page => page !== category.page)]
    .flatMap(page => sourceText(page, "visit-purpose", { preferMain: true }).text
      .split(/\n|(?<=[.!?])\s+(?=[\p{Lu}])/u).map(line => ({ page, line: line.trim() })))
    .filter(({ line }) => line.length >= 4 && line.length <= 300 && purposeTerms.test(line)
      && !/https?:|@|gutschein|voucher|events? buchen|mieten/iu.test(line));
  const strongest = purpose === "CULTURE_ARTS"
    ? purposeEvidence.find(({ line }) => /dauerausstellung|ausstellungen|sammlung|collection/iu.test(line)) ?? purposeEvidence[0]
    : purposeEvidence[0];
  if (strongest) results.push(proposal("purpose.primary_visit", purpose, strongest.line, strongest.page));
  return results;
}
