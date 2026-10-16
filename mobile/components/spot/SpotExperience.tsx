import { StyleSheet, Text, View } from "react-native";
import { presentSpotExperience, type PublicSpotFact } from "../../../packages/shared/src/presentation/spot-experience";
import { backyrdTheme as theme } from "../../theme/backyrd";
function Facts({facts}:{facts:PublicSpotFact[]}){
 return <View>{facts.map((fact,index)=><View key={index} style={styles.fact}><Text style={styles.label}>{fact.label}</Text><Text style={styles.value}>{fact.value}</Text>{fact.condition&&<Text style={styles.label}>{fact.condition}</Text>}</View>)}</View>;
}
export function SpotExperience({profile}:{profile:unknown}){
 const experience=presentSpotExperience(profile);
 return <View>
  {experience.offers.length>0&&<View style={styles.section}><Text style={styles.heading}>Angebote & Preise</Text>{experience.offers.map(offer=><View key={offer.id} style={styles.card}><Text style={styles.title}>{offer.name}</Text>{offer.prices.map((price,index)=><Text key={index} style={styles.price}>{price}</Text>)}{offer.places.length>0&&<Text style={styles.label}>Verfügbar: {offer.places.join(" · ")}</Text>}{offer.times.map((time,index)=><Text key={index} style={styles.value}>{time}</Text>)}<Facts facts={offer.facts}/></View>)}</View>}
  {experience.areas.length>0&&<View style={styles.section}><Text style={styles.heading}>Räume & Bereiche</Text>{experience.areas.map(area=><View key={area.id} style={styles.card}><Text style={styles.title}>{area.name}</Text><Facts facts={area.facts}/>{area.places.length>0&&<Text style={styles.label}>Angebote: {area.places.join(" · ")}</Text>}</View>)}</View>}
  {experience.shared.length>0&&<View style={styles.section}><Text style={styles.heading}>Ausstattung & Anreise</Text><Facts facts={experience.shared}/></View>}
 </View>;
}
const styles=StyleSheet.create({section:{marginBottom:32},heading:{color:theme.color.textPrimary,fontSize:22,marginBottom:16},card:{padding:18,borderWidth:1,borderColor:theme.color.border,borderRadius:16,marginBottom:16},title:{color:theme.color.textPrimary,fontSize:18,fontWeight:"700",marginBottom:12},price:{color:theme.color.textPrimary,fontSize:15,lineHeight:23,marginBottom:10},fact:{marginTop:12},label:{color:theme.color.textSecondary,fontSize:13,lineHeight:20},value:{color:theme.color.textPrimary,fontSize:15,lineHeight:23}});
