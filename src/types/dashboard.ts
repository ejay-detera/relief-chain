export type Program = {
  id: string;
  title: string;
  status: 'In progress' | 'Completed' | 'Pending';
  completion: number;         // 0–100
  budgetUsed: string;         // e.g. "₱4.2M"
  budgetTotal: string;        // e.g. "₱6.5M"
  served: string;             // e.g. "1,200 Individuals"
  estCompletion: string;      // e.g. "Oct. 12, 2027"
};

export type ActivityItem = {
  id: string;
  userName: string;
  action: string;             // e.g. "Verified" or "₱5,000 Aid Distributed"
  timestamp: string;          // e.g. "2 minutes ago"
  avatarVariant: 'person' | 'money';
};

export type QuickAction = {
  id: string;
  label: string;
  iconName: any;              // using any or specific type from FontAwesome
  onPress?: () => void;
};
