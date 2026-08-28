import {redirect} from "next/navigation";

export default async function DeprecatedAdminReviewCreation({params}:{params:Promise<{spotId:string}>}){
  const {spotId}=await params;
  redirect(`/reviews/${spotId}`);
}
