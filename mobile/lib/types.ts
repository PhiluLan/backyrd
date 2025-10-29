export type Spot = {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  category: string | null;
  status: 'pending' | 'approved' | 'rejected';
};
