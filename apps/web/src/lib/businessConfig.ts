import { useAuthStore } from '@/stores/authStore';

export type BusinessType = 'bakery' | 'restaurant' | 'cafe' | 'retail' | 'other';

export interface BusinessConfig {
  /** Label for the admin/back-office portal */
  adminLabel: string;
  /** What a transaction receipt is called */
  tokenLabel: string;
  /** Label for the item-scanning counter terminal */
  subPosLabel: string;
  /** Label for the payment/billing terminal */
  mainPosLabel: string;
  /** true = Sub POS creates tokens that flow to Main POS */
  useTokenFlow: boolean;
  /** Show KOT / kitchen display */
  showKOT: boolean;
  /** Show table management section */
  showTableManagement: boolean;
  /** Receipt header text */
  receiptHeader: string;
  /** Plural for token (e.g. "Tokens", "Orders") */
  tokensLabelPlural: string;
}

const CONFIGS: Record<BusinessType, BusinessConfig> = {
  bakery: {
    adminLabel: 'Office',
    tokenLabel: 'Token',
    tokensLabelPlural: 'Tokens',
    subPosLabel: 'Sub POS',
    mainPosLabel: 'Main POS',
    useTokenFlow: true,
    showKOT: true,
    showTableManagement: true,
    receiptHeader: 'BAKERY RECEIPT',
  },
  restaurant: {
    adminLabel: 'Admin',
    tokenLabel: 'Order',
    tokensLabelPlural: 'Orders',
    subPosLabel: 'Counter',
    mainPosLabel: 'Billing',
    useTokenFlow: false,
    showKOT: true,
    showTableManagement: true,
    receiptHeader: 'ORDER RECEIPT',
  },
  cafe: {
    adminLabel: 'Admin',
    tokenLabel: 'Order',
    tokensLabelPlural: 'Orders',
    subPosLabel: 'Counter',
    mainPosLabel: 'Main POS',
    useTokenFlow: true,
    showKOT: false,
    showTableManagement: false,
    receiptHeader: 'CAFE RECEIPT',
  },
  retail: {
    adminLabel: 'Admin',
    tokenLabel: 'Bill',
    tokensLabelPlural: 'Bills',
    subPosLabel: 'Sub POS',
    mainPosLabel: 'Checkout',
    useTokenFlow: false,
    showKOT: false,
    showTableManagement: false,
    receiptHeader: 'PURCHASE RECEIPT',
  },
  other: {
    adminLabel: 'Admin',
    tokenLabel: 'Token',
    tokensLabelPlural: 'Tokens',
    subPosLabel: 'Counter',
    mainPosLabel: 'Main POS',
    useTokenFlow: true,
    showKOT: false,
    showTableManagement: false,
    receiptHeader: 'RECEIPT',
  },
};

/** Returns the business config for the currently logged-in user's restaurant. */
export function useBusinessConfig(): BusinessConfig {
  const user = useAuthStore((s) => s.user);
  const type = ((user?.restaurant as any)?.businessType as BusinessType) ?? 'bakery';
  return CONFIGS[type] ?? CONFIGS.bakery;
}

export { CONFIGS as BUSINESS_CONFIGS };
