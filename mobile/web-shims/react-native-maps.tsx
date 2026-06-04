import React, { forwardRef } from "react";
import { View } from "react-native";

type AnyProps = Record<string, any>;

const MapView = forwardRef<View, AnyProps>(function MapView({ style, children, ...rest }, ref) {
  return (
    <View
      ref={ref}
      style={style}
      {...rest}
      accessibilityRole="none"
    >
      {children}
    </View>
  );
});

export const Marker = ({ children }: AnyProps) => <>{children ?? null}</>;
export const PROVIDER_GOOGLE = "google";

export default MapView;
