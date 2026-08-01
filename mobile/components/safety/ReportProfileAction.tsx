import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, View } from "react-native";

import ReportContentButton from "./ReportContentButton";

type Props = {
  profileUserId: string;
  textContent: string | null;
  avatarUrl?: string | null;
  headerPhotoUrl?: string | null;
};

export default function ReportProfileAction({
  profileUserId,
  textContent,
  avatarUrl,
  headerPhotoUrl,
}: Props) {
  const imageUrls = [
    avatarUrl,
    headerPhotoUrl,
  ].filter((value): value is string => Boolean(value));

  return (
    <View style={styles.wrap}>
      <ReportContentButton
        entityType="profile"
        entityId={profileUserId}
        contentType="profile"
        actorUserId={profileUserId}
        textContent={textContent}
        imageUrls={imageUrls}
        locale="de-CH"
        sourceSurface="public_profile"
        sourceContext={{
          screen: "user_profile",
          profile_user_id: profileUserId,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(18,18,24,0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
});
