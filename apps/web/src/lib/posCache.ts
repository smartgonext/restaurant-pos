/**
 * High-Performance Local Cache for POS Terminals (MainPOS & SubPOS)
 * 
 * Provides instant 0ms initialization from local storage for:
 * - Menu items (700+ products with MRPs, prices, units)
 * - Categories
 * - Bill & Printer Settings
 * 
 * Ensures offline resilience and instant rendering with zero network delay.
 */

const ITEMS_CACHE_PREFIX = 'pos_cache_items_';
const CATEGORIES_CACHE_PREFIX = 'pos_cache_categories_';
const SETTINGS_CACHE_PREFIX = 'pos_cache_settings_';

export function getCachedMenuItems<T = any>(scope = 'default'): T[] {
  try {
    const raw = localStorage.getItem(`${ITEMS_CACHE_PREFIX}${scope}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

export function setCachedMenuItems<T = any>(scope = 'default', items: T[]): void {
  try {
    if (!Array.isArray(items) || items.length === 0) return;
    localStorage.setItem(`${ITEMS_CACHE_PREFIX}${scope}`, JSON.stringify(items));
  } catch (e) {
    // LocalStorage quota safety
  }
}

export function getCachedCategories<T = any>(scope = 'default'): T[] {
  try {
    const raw = localStorage.getItem(`${CATEGORIES_CACHE_PREFIX}${scope}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

export function setCachedCategories<T = any>(scope = 'default', categories: T[]): void {
  try {
    if (!Array.isArray(categories) || categories.length === 0) return;
    localStorage.setItem(`${CATEGORIES_CACHE_PREFIX}${scope}`, JSON.stringify(categories));
  } catch (e) {
    // Quota safety
  }
}

export function getCachedSettings<T = any>(scope = 'default'): T | null {
  try {
    const raw = localStorage.getItem(`${SETTINGS_CACHE_PREFIX}${scope}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

export function setCachedSettings<T = any>(scope = 'default', settings: T): void {
  try {
    if (!settings) return;
    localStorage.setItem(`${SETTINGS_CACHE_PREFIX}${scope}`, JSON.stringify(settings));
  } catch (e) {
    // Quota safety
  }
}

