import {
  presentSpotExperience,
  spotExperienceDetailGroups,
  type PublicSpotCard,
  type PublicSpotFact,
} from "../../../packages/shared/src/presentation/spot-experience";

function VisitorDetails({ facts, offerKind = "" }: { facts: PublicSpotFact[]; offerKind?: string }) {
  return <>{spotExperienceDetailGroups(facts, offerKind).map(group => (
    <div className="b-experience-group" key={group.title}>
      <h4>{group.title}</h4>
      <p>{group.items.join(" ")}</p>
    </div>
  ))}</>;
}

function ExperienceRow({ card, area = false }: { card: PublicSpotCard; area?: boolean }) {
  const hasDetails = card.prices.length + card.times.length + card.facts.length + card.places.length > 0;
  if (!hasDetails) return <div className="b-experience-row b-experience-static"><span className="b-experience-name">{card.name}</span></div>;
  return (
    <details className="b-experience-row">
      <summary aria-label={`${card.name}: mehr Informationen`}>
        <span className="b-experience-name">{card.name}</span>
        <span className="b-experience-toggle"><span className="b-experience-closed">Mehr erfahren</span><span className="b-experience-open">Weniger anzeigen</span><span className="b-experience-chevron" aria-hidden="true">⌄</span></span>
      </summary>
      <div className="b-experience-content">
        {card.prices.length > 0 && <div className="b-experience-group"><h4>Preise</h4><ul>{card.prices.map((price, index) => <li key={index}>{price}</li>)}</ul></div>}
        {card.times.length > 0 && <div className="b-experience-group"><h4>Wann?</h4><p>{card.times.join(" · ")}</p></div>}
        <VisitorDetails facts={card.facts} offerKind={area ? "" : card.kind} />
        {card.places.length > 0 && <div className="b-experience-group"><h4>{area ? "Hier möglich" : "Wo?"}</h4><p>{card.places.join(" · ")}</p></div>}
      </div>
    </details>
  );
}

export function SpotExperience({ profile }: { profile: unknown }) {
  const experience = presentSpotExperience(profile);
  return <>
    {experience.offers.length > 0 && <section className="b-detail-section" aria-label="Angebote"><h2 className="b-section-title">Das kannst du hier erleben</h2><div className="b-experience-list">{experience.offers.map(offer => <ExperienceRow key={offer.id} card={offer} />)}</div></section>}
    {experience.areas.length > 0 && <section className="b-detail-section" aria-label="Räume und Bereiche"><h2 className="b-section-title">Räume & Bereiche</h2><div className="b-experience-list">{experience.areas.map(area => <ExperienceRow key={area.id} card={area} area />)}</div></section>}
    {experience.shared.length > 0 && <section className="b-detail-section" aria-label="Ausstattung und Anreise"><h2 className="b-section-title">Gut zu wissen</h2><VisitorDetails facts={experience.shared} /></section>}
  </>;
}
