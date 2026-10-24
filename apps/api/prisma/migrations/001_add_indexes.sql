-- CreateIndex for performance optimization
-- This migration adds essential indexes to frequently queried tables
-- Run with: pnpm exec prisma migrate deploy

-- Restaurant queries
CREATE INDEX idx_restaurant_status ON restaurant(status);
CREATE INDEX idx_restaurant_slug ON restaurant(slug);

-- Staff queries
CREATE INDEX idx_staff_restaurant_email ON staff(restaurantId, email);
CREATE INDEX idx_staff_restaurant_active ON staff(restaurantId, isActive);

-- Orders queries
CREATE INDEX idx_order_restaurant_status ON orders(restaurantId, status);
CREATE INDEX idx_order_restaurant_created ON orders(restaurantId, createdAt DESC);
CREATE INDEX idx_order_table_id ON orders(tableId);
CREATE INDEX idx_order_status_created ON orders(status, createdAt DESC);

-- Menu items queries
CREATE INDEX idx_menuitem_restaurant_available ON menuItems(restaurantId, isAvailable);
CREATE INDEX idx_menuitem_restaurant_menu ON menuItems(restaurantId, menuId);
CREATE INDEX idx_menuitem_category ON menuItems(categoryId);

-- KOT queries
CREATE INDEX idx_kot_order_status ON kOT(orderId, status);
CREATE INDEX idx_kot_kitchen_status ON kOT(kitchenId, status);

-- Inventory queries
CREATE INDEX idx_inventory_restaurant_active ON inventoryItems(restaurantId, isActive);
CREATE INDEX idx_inventory_category ON inventoryItems(categoryId);

-- Customer queries
CREATE INDEX idx_customer_restaurant_active ON customers(restaurantId, isActive);
CREATE INDEX idx_customer_phone ON customers(phone);

-- Payment queries
CREATE INDEX idx_payment_order ON payments(orderId);
CREATE INDEX idx_payment_restaurant_date ON payments(restaurantId, createdAt DESC);

-- Audit log queries
CREATE INDEX idx_auditlog_restaurant_date ON auditLog(restaurantId, createdAt DESC);
CREATE INDEX idx_auditlog_staff_date ON auditLog(staffId, createdAt DESC);

-- Refresh token queries
CREATE INDEX idx_refreshtoken_user ON refreshToken(userId);
CREATE INDEX idx_refreshtoken_expires ON refreshToken(expiresAt);

-- Branch queries
CREATE INDEX idx_branch_restaurant ON branch(restaurantId);

-- Table queries  
CREATE INDEX idx_table_area ON table(areaId);
CREATE INDEX idx_table_restaurant_status ON table(restaurantId, status);
