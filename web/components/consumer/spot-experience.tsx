import { presentSpotExperience, type PublicSpotFact } from "../../../packages/shared/src/presentation/spot-experience";
function Facts({facts}:{facts:PublicSpotFact[]}){
 return <dl className="b-detail-facts">{facts.map((fact,index)=><div key={index}><dt>{fact.label}</dt><dd>{fact.value}{fact.condition&&<small style={{display:"block",opacity:.7}}>{fact.condition}</small>}</dd></div>)}</dl>;
}
export function SpotExperience({profile}:{profile:unknown}){
 const experience=presentSpotExperience(profile);
 return <>
  {experience.offers.length>0&&<section className="b-detail-section" aria-label="Angebote und Preise"><h2 className="b-section-title">Angebote & Preise</h2>{experience.offers.map(offer=><article key={offer.id} style={{marginTop:24,padding:20,border:"1px solid var(--border, #303237)",borderRadius:16}}><h3>{offer.name}</h3>{offer.prices.length>0&&<ul style={{paddingLeft:20,marginTop:12}}>{offer.prices.map((price,index)=><li key={index} style={{marginBottom:8}}>{price}</li>)}</ul>}{offer.places.length>0&&<p style={{marginTop:12}}>Verfügbar: {offer.places.join(" · ")}</p>}{offer.times.map((time,index)=><p key={index}>{time}</p>)}<Facts facts={offer.facts}/></article>)}</section>}
  {experience.areas.length>0&&<section className="b-detail-section" aria-label="Räume und Bereiche"><h2 className="b-section-title">Räume & Bereiche</h2>{experience.areas.map(area=><article key={area.id} style={{marginTop:24}}><h3>{area.name}</h3><Facts facts={area.facts}/>{area.places.length>0&&<p>Angebote: {area.places.join(" · ")}</p>}</article>)}</section>}
  {experience.shared.length>0&&<section className="b-detail-section" aria-label="Gemeinsame Ausstattung und Anreise"><h2 className="b-section-title">Ausstattung & Anreise</h2><Facts facts={experience.shared}/></section>}
 </>;
}
