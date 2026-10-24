import { z } from 'zod';

// ── Auth Schemas ─────────────────────────────────────
export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const resetPasswordSchema = z.object({
  token: z.string(),
  password: z.string().min(6),
  confirmPassword: z.string().min(6),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

// ── Restaurant Schemas ───────────────────────────────
export const createRestaurantSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email'),
  phone: z.string().optional(),
  address: z.string().optional(),
  packageId: z.number().int().positive(),
});

export const updateRestaurantSchema = createRestaurantSchema.partial();

// ── Package Schemas ──────────────────────────────────
export const createPackageSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  monthlyPrice: z.number().nonnegative().optional(),
  annualPrice: z.number().nonnegative().optional(),
  lifetimePrice: z.number().nonnegative().optional(),
  isRecommended: z.boolean().default(false),
  isDefault: z.boolean().default(false),
  modules: z.array(z.string()),
  trialDays: z.number().int().nonnegative().default(30),
});

// ── Menu Schemas ─────────────────────────────────────
export const createMenuSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export const createMenuItemSchema = z.object({
  menuId: z.number().int().positive(),
  categoryId: z.number().int().positive().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.number().positive(),
  isVeg: z.boolean().default(true),
  isAvailable: z.boolean().default(true),
  showOnCustomerSite: z.boolean().default(true),
  preparationTime: z.number().int().positive().optional(),
  sortOrder: z.number().int().default(0),
});

export const createCategorySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  sortOrder: z.number().int().default(0),
});

// ── Order Schemas ────────────────────────────────────
export const createOrderSchema = z.object({
  tableId: z.number().int().positive().optional(),
  customerId: z.number().int().positive().optional(),
  type: z.enum(['dine_in', 'delivery', 'pickup']).default('dine_in'),
  pax: z.number().int().positive().default(1),
  note: z.string().optional(),
  items: z.array(z.object({
    menuItemId: z.number().int().positive(),
    quantity: z.number().int().positive(),
    modifiers: z.array(z.object({
      name: z.string(),
      option: z.string(),
      price: z.number(),
    })).optional(),
    note: z.string().optional(),
  })).min(1, 'Order must have at least one item'),
});

// ── Table Schemas ────────────────────────────────────
export const createAreaSchema = z.object({
  name: z.string().min(1),
  branchId: z.number().int().positive(),
  sortOrder: z.number().int().default(0),
});

export const createTableSchema = z.object({
  areaId: z.number().int().positive(),
  name: z.string().min(1),
  capacity: z.number().int().positive().default(4),
});

// ── Staff Schemas ────────────────────────────────────
export const createStaffSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['admin', 'branch_admin', 'billing_staff', 'branch_head', 'waiter', 'chef']).default('waiter'),
  phone: z.string().optional(),
  branchId: z.number().int().positive().optional(),
});

// ── Expense Schemas ──────────────────────────────────
export const createExpenseSchema = z.object({
  categoryId: z.number().int().positive(),
  title: z.string().min(1),
  amount: z.number().positive(),
  expenseDate: z.string(),
  paymentDate: z.string().optional(),
  dueDate: z.string().optional(),
  paymentStatus: z.enum(['pending', 'paid']).default('pending'),
  paymentMethod: z.string().optional(),
  description: z.string().optional(),
});

// ── Settings Schemas ─────────────────────────────────
export const updateSettingsSchema = z.object({
  currency: z.string().optional(),
  currencySymbol: z.string().optional(),
  taxMode: z.enum(['order', 'item']).optional(),
  sgstRate: z.number().nonnegative().optional(),
  cgstRate: z.number().nonnegative().optional(),
  timezone: z.string().optional(),
  orderPrefix: z.string().optional(),
  kotPrefix: z.string().optional(),
  deliveryFee: z.number().nonnegative().optional(),
  minOrderAmount: z.number().nonnegative().optional(),
  allowDineIn: z.boolean().optional(),
  allowDelivery: z.boolean().optional(),
  allowPickup: z.boolean().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateRestaurantInput = z.infer<typeof createRestaurantSchema>;
export type CreatePackageInput = z.infer<typeof createPackageSchema>;
export type CreateMenuInput = z.infer<typeof createMenuSchema>;
export type CreateMenuItemInput = z.infer<typeof createMenuItemSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
