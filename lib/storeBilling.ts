import { Platform } from 'react-native';
import { supabase } from './supabase';
import { TEEMATE_PLUS_PRODUCTS } from './premium';

export type TeeMatePlan = 'monthly' | 'yearly';

type BillingModule = typeof import('react-native-iap');
type StoreProduct = { productId: string; localizedPrice?: string; subscriptionOfferDetails?: { offerToken?: string }[] };

let billing: BillingModule | null = null;
let connected = false;

const PRODUCT_IDS = [TEEMATE_PLUS_PRODUCTS.monthly.id, TEEMATE_PLUS_PRODUCTS.yearly.id];

async function module() {
  if (billing) return billing;
  billing = await import('react-native-iap');
  return billing;
}

async function connect() {
  const iap = await module();
  if (!connected) {
    await iap.initConnection();
    connected = true;
    if (Platform.OS === 'android' && iap.flushFailedPurchasesCachedAsPendingAndroid) {
      try { await iap.flushFailedPurchasesCachedAsPendingAndroid(); } catch {}
    }
  }
  return iap;
}

function skuFor(plan: TeeMatePlan) {
  return plan === 'monthly' ? TEEMATE_PLUS_PRODUCTS.monthly.id : TEEMATE_PLUS_PRODUCTS.yearly.id;
}

function storePlatform() {
  return Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'unknown';
}

function tokenFromPurchase(purchase: any) {
  return purchase?.purchaseToken ?? purchase?.transactionReceipt ?? purchase?.transactionId ?? null;
}

async function verifyWithBackend(purchase: any) {
  const productId = purchase?.productId ?? purchase?.productIds?.[0] ?? null;
  const { data, error } = await supabase.functions.invoke('verify-store-subscription', {
    body: {
      platform: storePlatform(),
      productId,
      purchaseToken: tokenFromPurchase(purchase),
      transactionId: purchase?.transactionId ?? purchase?.originalTransactionIdentifierIOS ?? null,
    },
  });
  if (error) return { error, purchase: null };
  if ((data as any)?.error) return { error: { message: (data as any).error } as any, purchase: null };
  return { error: null, purchase };
}

export async function getTeeMateStoreProducts() {
  const iap = await connect();
  const subs = await iap.getSubscriptions({ skus: PRODUCT_IDS });
  const products = subs as StoreProduct[];
  return {
    monthly: products.find((item) => item.productId === TEEMATE_PLUS_PRODUCTS.monthly.id) ?? null,
    yearly: products.find((item) => item.productId === TEEMATE_PLUS_PRODUCTS.yearly.id) ?? null,
  };
}

export async function purchaseTeeMatePlus(userId: string, plan: TeeMatePlan) {
  const iap = await connect();
  const sku = skuFor(plan);
  const products = await getTeeMateStoreProducts();
  const product = plan === 'monthly' ? products.monthly : products.yearly;
  if (!product) throw new Error(`TeeMate+ ${plan} product was not found: ${sku}`);
  const offerToken = Platform.OS === 'android' ? product.subscriptionOfferDetails?.[0]?.offerToken : undefined;
  const result = Platform.OS === 'android'
    ? await iap.requestSubscription({ sku, subscriptionOffers: offerToken ? [{ sku, offerToken }] : undefined } as any)
    : await iap.requestSubscription({ sku } as any);
  const purchase = Array.isArray(result) ? result[0] : result;
  const verified = await verifyWithBackend(purchase);
  if (!verified.error) {
    try { await iap.finishTransaction({ purchase, isConsumable: false }); } catch {}
  }
  return verified;
}

export async function restoreTeeMatePlus(userId: string) {
  const iap = await connect();
  const purchases = await iap.getAvailablePurchases();
  const purchase = purchases.find((item: any) => PRODUCT_IDS.includes(item.productId));
  if (!purchase) return { error: null, purchase: null };
  return verifyWithBackend(purchase);
}
