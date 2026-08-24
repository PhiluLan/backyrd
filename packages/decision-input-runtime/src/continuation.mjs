const uniqueIds=(values)=>{
  const seen=new Set();
  return (Array.isArray(values)?values:[]).filter((value)=>typeof value==="string"&&value&&!seen.has(value)&&seen.add(value));
};

export function composeFrozenContinuationOrder({deterministicOrder,n6Order=[],n6Validated=false}){
  const deterministic=uniqueIds(deterministicOrder);
  if(!n6Validated)return deterministic;
  const frozen=new Set(deterministic);
  const n6=uniqueIds(n6Order);
  if(n6.some((spotId)=>!frozen.has(spotId)))throw new Error("decision_continuation_n6_candidate_invalid");
  const n6Set=new Set(n6);
  return [...n6,...deterministic.filter((spotId)=>!n6Set.has(spotId))];
}

export function assertUnseenContinuation({previouslyShownSpotIds,returnedSpotIds,pageSize=3}){
  const shown=new Set(uniqueIds(previouslyShownSpotIds));
  const returned=uniqueIds(returnedSpotIds);
  if(returned.length!==(Array.isArray(returnedSpotIds)?returnedSpotIds.length:0))throw new Error("decision_continuation_duplicate_response");
  if(returned.length>pageSize)throw new Error("decision_continuation_page_size_invalid");
  if(returned.some((spotId)=>shown.has(spotId)))throw new Error("decision_continuation_seen_spot_reintroduced");
  return true;
}

