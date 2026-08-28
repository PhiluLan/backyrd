import ReviewSpotClient from "./ReviewSpotClient";

export default async function ReviewSpotPage({params}:{params:Promise<{spotId:string}>}){
  const {spotId}=await params;
  return <ReviewSpotClient spotId={spotId}/>;
}
