import type { CategoryDef, CategoryId, ProductDef } from "../types";

export const CATEGORIES: CategoryDef[] = [
  { id: "drinks", name: "Drinks", short: "DRK" },
  { id: "snacks", name: "Snacks", short: "SNK" },
  { id: "food", name: "Food", short: "FOD" },
  { id: "household", name: "Household", short: "HHD" },
  { id: "care", name: "Personal care", short: "CAR" },
];

export const CATEGORY_NAME: Record<CategoryId, string> = {
  drinks: "Drinks",
  snacks: "Snacks",
  food: "Food",
  household: "Household",
  care: "Personal care",
};

/**
 * A deliberately small, readable catalogue for version 1: enough variety that
 * stocking decisions matter, small enough that the balance is understandable.
 */
export const PRODUCTS: ProductDef[] = [
  {
    id: "water",
    name: "Spring Water 1L",
    category: "drinks",
    cost: 0.42,
    price: 0.9,
    demand: 0.92,
    caseSize: 12,
    color: 0xdfe6ea,
    accent: 0x2f6f8f,
  },
  {
    id: "cola",
    name: "Cola Can 330ml",
    category: "drinks",
    cost: 0.55,
    price: 1.15,
    demand: 0.85,
    caseSize: 12,
    color: 0x8c2f2a,
    accent: 0xe8e2d8,
  },
  {
    id: "juice",
    name: "Orange Juice 1L",
    category: "drinks",
    cost: 1.05,
    price: 2.2,
    demand: 0.55,
    caseSize: 8,
    color: 0xd8863a,
    accent: 0xf4efe6,
  },
  {
    id: "coffee",
    name: "Ground Coffee 250g",
    category: "drinks",
    cost: 2.9,
    price: 6.1,
    demand: 0.48,
    caseSize: 6,
    color: 0x4a342a,
    accent: 0xbfa27e,
  },
  {
    id: "chips",
    name: "Salted Chips 150g",
    category: "snacks",
    cost: 0.78,
    price: 1.65,
    demand: 0.8,
    caseSize: 10,
    color: 0xc9a227,
    accent: 0x2b2b2b,
  },
  {
    id: "chocolate",
    name: "Dark Chocolate Bar",
    category: "snacks",
    cost: 0.95,
    price: 2.0,
    demand: 0.72,
    caseSize: 10,
    color: 0x532d2b,
    accent: 0xd9c6a5,
  },
  {
    id: "cookies",
    name: "Butter Cookies 200g",
    category: "snacks",
    cost: 1.1,
    price: 2.3,
    demand: 0.5,
    caseSize: 8,
    color: 0xb98a4a,
    accent: 0xf1e7d6,
  },
  {
    id: "bread",
    name: "Sourdough Loaf",
    category: "food",
    cost: 1.3,
    price: 2.75,
    demand: 0.68,
    caseSize: 6,
    color: 0xc08c4c,
    accent: 0x8a5a2b,
  },
  {
    id: "eggs",
    name: "Free Range Eggs x6",
    category: "food",
    cost: 1.45,
    price: 3.05,
    demand: 0.74,
    caseSize: 6,
    color: 0xe6ddc8,
    accent: 0x9c8f6f,
  },
  {
    id: "pasta",
    name: "Durum Pasta 500g",
    category: "food",
    cost: 0.7,
    price: 1.45,
    demand: 0.52,
    caseSize: 10,
    color: 0xd9c07a,
    accent: 0x7a5c2e,
  },
  {
    id: "soap",
    name: "Bar Soap Trio",
    category: "care",
    cost: 1.2,
    price: 2.5,
    demand: 0.44,
    caseSize: 8,
    color: 0xdcd6ea,
    accent: 0x6d6690,
  },
  {
    id: "shampoo",
    name: "Shampoo 400ml",
    category: "care",
    cost: 2.4,
    price: 5.05,
    demand: 0.4,
    caseSize: 6,
    color: 0x69a0a8,
    accent: 0xeef1f2,
  },
  {
    id: "paper",
    name: "Kitchen Roll x2",
    category: "household",
    cost: 1.6,
    price: 3.35,
    demand: 0.58,
    caseSize: 8,
    color: 0xeae6dd,
    accent: 0x8f8877,
  },
  {
    id: "cleaner",
    name: "Surface Cleaner 750ml",
    category: "household",
    cost: 1.85,
    price: 3.9,
    demand: 0.46,
    caseSize: 8,
    color: 0x5f8f7a,
    accent: 0xe8f0ea,
  },
  {
    id: "bags",
    name: "Bin Bags x20",
    category: "household",
    cost: 1.4,
    price: 2.95,
    demand: 0.42,
    caseSize: 8,
    color: 0x30363a,
    accent: 0x8fa0a8,
  },
];

const PRODUCT_INDEX = new Map(PRODUCTS.map((p) => [p.id, p]));

export function getProduct(id: string): ProductDef | undefined {
  return PRODUCT_INDEX.get(id);
}

/**
 * The price a shopper considers fair for this product. Retail defaults sit just
 * above it, so the starting prices are competitive but not a giveaway.
 */
export function referencePrice(p: ProductDef): number {
  return p.cost * 2.1;
}
