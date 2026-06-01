import { TEEMATE_PLUS_PRODUCTS } from './premium';

export type TeeMatePlan = 'monthly' | 'yearly';

type StoreProduct = { productId: string; localizedPrice?: string };

const disabledMessage = 'TeeMate+ purchases are temporarily disabled in this Expo Launch build. Build with store billing enabled before production release.';

export async function getTeeMateStoreProducts() {
  return {
    monthly: {
      productId: TEEMATE_PLUS_PRODUCTS.monthly.id,
      localizedPrice: TEEMATE_PLUS_PRODUCTS.monthly.price,
    } as StoreProduct,
    yearly: {
      productId: TEEMATE_PLUS_PRODUCTS.yearly.id,
      localizedPrice: TEEMATE_PLUS_PRODUCTS.yearly.price,
    } as StoreProduct,
  };
}

export async function purchaseTeeMatePlus(userId: string, plan: TeeMatePlan) {
  return {
    error: { message: disabledMessage } as any,
    purchase: null,
  };
}

export async function restoreTeeMatePlus(userId: string) {
  return {
    error: { message: disabledMessage } as any,
    purchase: null,
  };
}
