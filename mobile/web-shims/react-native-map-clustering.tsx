import React, { forwardRef } from "react";
import MapView from "./react-native-maps";

type AnyProps = Record<string, any>;

const ClusteredMapView = forwardRef<any, AnyProps>(function ClusteredMapView(props, ref) {
  return <MapView ref={ref} {...props} />;
});

export default ClusteredMapView;
