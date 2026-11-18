import "server-only";
import { PRIMARY_CATEGORIES, PRIMARY_VISIT_PURPOSES, validateAuthoringSubmission, type SpecialHoursDay, type WeeklyScheduleDay } from "@backyrd/world-knowledge-core";
import { fetchPublicSource } from "../../../packages/spot-research-runtime/src/nuknuk-sources.mjs";
import { previewSpotSources } from "../../../packages/spot-research-runtime/src/source-first-preview.mjs";
import type { CrawlerBasics, CrawlerFacts, CrawlerObservedPrice, CrawlerRunUsage } from "../spotCrawler";
import { crawlerOperatorUrl, crawlerSourceLoader, searchBrave } from "./spotCrawlerDiscovery";
import { selectSourcePrice } from "./sourceFirstSpotPreview";

export async function enrichCrawlerCandidates(candidates: CrawlerFacts[], options: {
  deadline: number; brave?: string; openai?: string; searches: number | null;
}) {
  let searchesLeft = 10;
  let aiLeft = 1;
  const fetchPage = crawlerSourceLoader(fetchPublicSource, options.deadline);
  const results: CrawlerFacts[] = [];
  for (let index = 0; index < candidates.length; index += 6) {
    results.push(...await Promise.all(candidates.slice(index, index + 6).map(async found => {
      const candidate = { ...found, website: crawlerOperatorUrl(found.website ?? "") ?? undefined };
      if (Date.now() >= options.deadline - 3500) {
        return { ...candidate, basics: { state: "TIME_LIMIT", proposals: [], braveCalls: 0, aiCalls: 0, estimatedUsd: 0 } satisfies CrawlerBasics };
      }
      const research = await previewSpotSources({
        spotId: candidate.external_id, name: candidate.name, address: candidate.address,
        locality: "Basel", website: candidate.website, existingValues: {}, crawlerCategory: candidate.category,
      }, {
        fetchPage,
        verifyVenue: true,
        search: options.brave && searchesLeft > 0 ? async query => {
          if (searchesLeft <= 0 || Date.now() >= options.deadline - 8500) throw new Error("CRAWLER_BASICS_SEARCH_LIMIT");
          searchesLeft--;
          return (await searchBrave(query, options.brave!)).flatMap(url => crawlerOperatorUrl(url) ?? []);
        } : undefined,
        selectPrice: options.openai && aiLeft > 0 ? async quotes => {
          if (aiLeft <= 0 || Date.now() >= options.deadline - 9500) throw new Error("CRAWLER_BASICS_AI_LIMIT");
          aiLeft--;
          return selectSourcePrice(options.openai!, quotes);
        } : undefined,
      });
      const basics: CrawlerBasics = {
        state: research.status === "COMPLETE_PROFILE" ? "CHECKED" : research.status,
        proposals: research.proposals.map(({ attributeKey, url, evidence, review }) => ({ attributeKey, url, evidence, review })),
        braveCalls: research.usage.brave.calls,
        aiCalls: research.usage.ai.calls,
        estimatedUsd: research.usage.estimatedUsd,
      };
      const hasVisitRestriction = research.proposals.some(({ attributeKey }) =>
        attributeKey === "hours.closure_notice" || attributeKey === "hours.last_entry");
      const observedPrices: CrawlerObservedPrice[] = [];
      for (const proposal of research.proposals) {
        if (proposal.attributeKey === "classification.primary_category") {
          basics.primaryCategory = PRIMARY_CATEGORIES.find(value => value === proposal.value);
        }
        if (proposal.attributeKey === "purpose.primary_visit") {
          basics.primaryVisitPurpose = PRIMARY_VISIT_PURPOSES.find(value => value === proposal.value);
        }
        if (proposal.attributeKey === "contact.website" && typeof proposal.value === "string") basics.website = proposal.value;
        if (proposal.attributeKey === "contact.public_email" && typeof proposal.value === "string") basics.email = proposal.value;
        if (proposal.attributeKey === "contact.phone" && typeof proposal.value === "string") basics.phone = proposal.value;
        if (proposal.attributeKey === "hours.regular" && !hasVisitRestriction) {
          const validated = validateAuthoringSubmission("hours.regular", "KNOWN_VALUE", proposal.value);
          if (validated.ok && Array.isArray(validated.value) && validated.value.length === 7) {
            basics.fullHours = validated.value as readonly WeeklyScheduleDay[];
          }
        }
        if (proposal.attributeKey === "hours.special" && !hasVisitRestriction) {
          const validated = validateAuthoringSubmission("hours.special", "KNOWN_VALUE", proposal.value);
          if (validated.ok && Array.isArray(validated.value)) {
            basics.specialHours = validated.value as readonly SpecialHoursDay[];
          }
        }
        if (proposal.attributeKey === "operation.price_options" && proposal.method === "DIRECT") {
          const price = proposal.value;
          if (!price || typeof price !== "object" || !("purpose" in price) || !("min" in price)
            || !("max" in price) || !("minimumAge" in price)) continue;
          const { purpose, min, max, minimumAge } = price;
          if ((purpose !== "MEAL" && purpose !== "DRINK" && purpose !== "ADMISSION") ||
            typeof min !== "number" || typeof max !== "number" || !Number.isFinite(min) || !Number.isFinite(max)
            || min < 0 || max < min || max > 100000 ||
            (minimumAge !== null && (typeof minimumAge !== "number" || !Number.isInteger(minimumAge) || minimumAge < 0 || minimumAge > 120))) continue;
          const brunch = "occasion" in price && price.occasion === "Brunch";
          const sundayOnly = "days" in price && Array.isArray(price.days) && price.days.length === 1 && price.days[0] === "SUNDAY";
          observedPrices.push({ purpose, min, max, minimumAge, url: proposal.url,
            ...(brunch ? { occasion: "Brunch", days: sundayOnly ? ["SUNDAY"] : [] } : {}),
          });
        }
      }
      if (observedPrices.length) basics.observedPrices = observedPrices;
      return { ...candidate, basics };
    })));
  }
  const amounts = results.map(candidate => candidate.basics?.estimatedUsd);
  const usage: CrawlerRunUsage = {
    searchedWithWeb: !!options.brave, webSearches: options.searches,
    enrichmentSearches: 10 - searchesLeft, aiCalls: 1 - aiLeft,
    estimatedUsd: options.searches === null || amounts.some(amount => amount == null) ? null
      : options.searches * 0.005 + amounts.reduce<number>((total, amount) => total + (amount ?? 0), 0),
  };
  return { results, usage };
}
