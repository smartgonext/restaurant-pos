-- AlterTable
ALTER TABLE `bakerytokenitem` ADD COLUMN `inventoryItemMRPId` INTEGER NULL,
    ADD COLUMN `purchaseRate` DECIMAL(10, 2) NULL;

-- AlterTable
ALTER TABLE `menuitem` ADD COLUMN `inventoryItemId` INTEGER NULL;

-- AlterTable
ALTER TABLE `purchaseorderitem` ADD COLUMN `inventoryItemMRPId` INTEGER NULL;

-- CreateTable
CREATE TABLE `InventoryItemMRP` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `inventoryItemId` INTEGER NOT NULL,
    `supplierId` INTEGER NULL,
    `mrp` DECIMAL(10, 2) NOT NULL,
    `purchaseRate` DECIMAL(10, 2) NOT NULL,
    `profitPercent` DECIMAL(5, 2) NULL,
    `effectiveFrom` DATETIME(3) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MenuItem` ADD CONSTRAINT `MenuItem_inventoryItemId_fkey` FOREIGN KEY (`inventoryItemId`) REFERENCES `InventoryItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseOrderItem` ADD CONSTRAINT `PurchaseOrderItem_inventoryItemMRPId_fkey` FOREIGN KEY (`inventoryItemMRPId`) REFERENCES `InventoryItemMRP`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InventoryItemMRP` ADD CONSTRAINT `InventoryItemMRP_inventoryItemId_fkey` FOREIGN KEY (`inventoryItemId`) REFERENCES `InventoryItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InventoryItemMRP` ADD CONSTRAINT `InventoryItemMRP_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BakeryTokenItem` ADD CONSTRAINT `BakeryTokenItem_inventoryItemMRPId_fkey` FOREIGN KEY (`inventoryItemMRPId`) REFERENCES `InventoryItemMRP`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
