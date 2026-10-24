-- AlterTable
ALTER TABLE `kot` ADD COLUMN `createdByTerminalId` INTEGER NULL,
    ADD COLUMN `createdByTerminalName` VARCHAR(191) NULL,
    ADD COLUMN `createdByTerminalType` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `purchaseorder` ADD COLUMN `currency` VARCHAR(191) NULL,
    ADD COLUMN `exchangeRate` DECIMAL(18, 6) NULL,
    ADD COLUMN `orderDate` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `purchaseorderitem` ADD COLUMN `discountPercent` DECIMAL(5, 2) NULL,
    ADD COLUMN `taxPercent` DECIMAL(5, 2) NULL;

-- CreateTable
CREATE TABLE `PurchaseOrderPayment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `restaurantId` INTEGER NOT NULL,
    `purchaseOrderId` INTEGER NOT NULL,
    `supplierId` INTEGER NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `method` VARCHAR(191) NULL,
    `reference` VARCHAR(191) NULL,
    `notes` VARCHAR(191) NULL,
    `paymentDate` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PurchaseOrderAttachment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `restaurantId` INTEGER NOT NULL,
    `purchaseOrderId` INTEGER NOT NULL,
    `filename` VARCHAR(191) NOT NULL,
    `path` VARCHAR(191) NULL,
    `mimeType` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PurchaseOrderTemplate` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `restaurantId` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `note` VARCHAR(191) NULL,
    `items` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RecurringPurchaseOrder` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `restaurantId` INTEGER NOT NULL,
    `supplierId` INTEGER NULL,
    `templateId` INTEGER NULL,
    `frequency` VARCHAR(191) NULL,
    `cronExpression` VARCHAR(191) NULL,
    `nextRunAt` DATETIME(3) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PurchaseOrder` ADD CONSTRAINT `PurchaseOrder_restaurantId_fkey` FOREIGN KEY (`restaurantId`) REFERENCES `Restaurant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseOrderPayment` ADD CONSTRAINT `PurchaseOrderPayment_purchaseOrderId_fkey` FOREIGN KEY (`purchaseOrderId`) REFERENCES `PurchaseOrder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseOrderPayment` ADD CONSTRAINT `PurchaseOrderPayment_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseOrderPayment` ADD CONSTRAINT `PurchaseOrderPayment_restaurantId_fkey` FOREIGN KEY (`restaurantId`) REFERENCES `Restaurant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseOrderAttachment` ADD CONSTRAINT `PurchaseOrderAttachment_purchaseOrderId_fkey` FOREIGN KEY (`purchaseOrderId`) REFERENCES `PurchaseOrder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseOrderAttachment` ADD CONSTRAINT `PurchaseOrderAttachment_restaurantId_fkey` FOREIGN KEY (`restaurantId`) REFERENCES `Restaurant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseOrderTemplate` ADD CONSTRAINT `PurchaseOrderTemplate_restaurantId_fkey` FOREIGN KEY (`restaurantId`) REFERENCES `Restaurant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RecurringPurchaseOrder` ADD CONSTRAINT `RecurringPurchaseOrder_restaurantId_fkey` FOREIGN KEY (`restaurantId`) REFERENCES `Restaurant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RecurringPurchaseOrder` ADD CONSTRAINT `RecurringPurchaseOrder_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RecurringPurchaseOrder` ADD CONSTRAINT `RecurringPurchaseOrder_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `PurchaseOrderTemplate`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
