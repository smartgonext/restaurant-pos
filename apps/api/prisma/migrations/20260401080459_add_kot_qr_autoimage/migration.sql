/*
  Warnings:

  - A unique constraint covering the columns `[branchCode]` on the table `Branch` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[productQR]` on the table `MenuItem` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `branch` ADD COLUMN `branchCode` VARCHAR(191) NULL,
    ADD COLUMN `managerId` INTEGER NULL;

-- AlterTable
ALTER TABLE `itemcategory` ADD COLUMN `isKOTEnabled` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE `loyaltyprogram` ADD COLUMN `maxClaimPercent` DECIMAL(5, 2) NOT NULL DEFAULT 10,
    ADD COLUMN `minClaimPoints` INTEGER NOT NULL DEFAULT 100,
    ADD COLUMN `pointValue` DECIMAL(10, 4) NOT NULL DEFAULT 0.5,
    ADD COLUMN `pointsPerRupee` DECIMAL(10, 4) NOT NULL DEFAULT 0.1;

-- AlterTable
ALTER TABLE `menuitem` ADD COLUMN `isAutoImage` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `productQR` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `restaurant` ADD COLUMN `businessType` VARCHAR(191) NOT NULL DEFAULT 'bakery';

-- AlterTable
ALTER TABLE `restaurantsettings` ADD COLUMN `igstRate` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `isInterState` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `posDeletePassword` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `supplier` ADD COLUMN `creditLimit` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `outstandingBalance` DECIMAL(12, 2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `RefreshToken` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `token` VARCHAR(512) NOT NULL,
    `userId` INTEGER NOT NULL,
    `userType` VARCHAR(191) NOT NULL DEFAULT 'staff',
    `restaurantId` INTEGER NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `RefreshToken_token_key`(`token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BakeryToken` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `restaurantId` INTEGER NOT NULL,
    `branchId` INTEGER NOT NULL,
    `subPosId` INTEGER NULL,
    `tokenNumber` INTEGER NOT NULL,
    `qrCode` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'open',
    `customerId` INTEGER NULL,
    `customerName` VARCHAR(191) NULL,
    `customerPhone` VARCHAR(191) NULL,
    `orderId` INTEGER NULL,
    `loyaltyPointsEarned` INTEGER NOT NULL DEFAULT 0,
    `loyaltyPointsClaimed` INTEGER NOT NULL DEFAULT 0,
    `discountApplied` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `subtotal` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `sgst` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `cgst` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `igst` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `paidAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `BakeryToken_qrCode_key`(`qrCode`),
    UNIQUE INDEX `BakeryToken_orderId_key`(`orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BakeryTokenItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tokenId` INTEGER NOT NULL,
    `menuItemId` INTEGER NOT NULL,
    `menuItemName` VARCHAR(191) NOT NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `taxRate` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `quantity` INTEGER NOT NULL,
    `total` DECIMAL(10, 2) NOT NULL,
    `addedBy` VARCHAR(191) NOT NULL,
    `addedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `removedAt` DATETIME(3) NULL,
    `removedBy` VARCHAR(191) NULL,
    `removeReason` VARCHAR(191) NULL,
    `isRemoved` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BakeryTokenPayment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tokenId` INTEGER NOT NULL,
    `method` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `transactionId` VARCHAR(191) NULL,
    `paidAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BakeryTokenEdit` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tokenId` INTEGER NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `menuItemName` VARCHAR(191) NOT NULL,
    `oldValue` VARCHAR(191) NULL,
    `newValue` VARCHAR(191) NULL,
    `reason` VARCHAR(191) NOT NULL,
    `staffUsername` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SubPOSTerminal` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `restaurantId` INTEGER NOT NULL,
    `branchId` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `terminalCode` VARCHAR(191) NOT NULL,
    `pin` VARCHAR(191) NOT NULL,
    `groupIds` JSON NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `SubPOSTerminal_terminalCode_key`(`terminalCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MainPOSTerminal` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `restaurantId` INTEGER NOT NULL,
    `branchId` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `terminalCode` VARCHAR(191) NOT NULL,
    `pin` VARCHAR(191) NOT NULL,
    `cashRegisterId` INTEGER NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `MainPOSTerminal_terminalCode_key`(`terminalCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `restaurantId` INTEGER NOT NULL,
    `branchId` INTEGER NOT NULL,
    `terminalId` INTEGER NULL,
    `staffId` INTEGER NULL,
    `action` VARCHAR(191) NOT NULL,
    `reason` VARCHAR(191) NOT NULL,
    `referenceId` VARCHAR(191) NOT NULL,
    `details` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TokenCounterConfig` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `restaurantId` INTEGER NOT NULL,
    `resetTime` VARCHAR(191) NOT NULL DEFAULT '00:00',
    `startNumber` INTEGER NOT NULL DEFAULT 1,
    `endNumber` INTEGER NOT NULL DEFAULT 9999,
    `lastResetAt` DATETIME(3) NULL,

    UNIQUE INDEX `TokenCounterConfig_restaurantId_key`(`restaurantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SupplierPayment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `restaurantId` INTEGER NOT NULL,
    `supplierId` INTEGER NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `paymentDate` DATETIME(3) NOT NULL,
    `method` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(191) NULL,
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `Branch_branchCode_key` ON `Branch`(`branchCode`);

-- CreateIndex
CREATE UNIQUE INDEX `MenuItem_productQR_key` ON `MenuItem`(`productQR`);

-- AddForeignKey
ALTER TABLE `RefreshToken` ADD CONSTRAINT `RefreshToken_restaurantId_fkey` FOREIGN KEY (`restaurantId`) REFERENCES `Restaurant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BakeryToken` ADD CONSTRAINT `BakeryToken_restaurantId_fkey` FOREIGN KEY (`restaurantId`) REFERENCES `Restaurant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BakeryToken` ADD CONSTRAINT `BakeryToken_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BakeryToken` ADD CONSTRAINT `BakeryToken_subPosId_fkey` FOREIGN KEY (`subPosId`) REFERENCES `SubPOSTerminal`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BakeryToken` ADD CONSTRAINT `BakeryToken_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BakeryTokenItem` ADD CONSTRAINT `BakeryTokenItem_tokenId_fkey` FOREIGN KEY (`tokenId`) REFERENCES `BakeryToken`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BakeryTokenItem` ADD CONSTRAINT `BakeryTokenItem_menuItemId_fkey` FOREIGN KEY (`menuItemId`) REFERENCES `MenuItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BakeryTokenPayment` ADD CONSTRAINT `BakeryTokenPayment_tokenId_fkey` FOREIGN KEY (`tokenId`) REFERENCES `BakeryToken`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BakeryTokenEdit` ADD CONSTRAINT `BakeryTokenEdit_tokenId_fkey` FOREIGN KEY (`tokenId`) REFERENCES `BakeryToken`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SubPOSTerminal` ADD CONSTRAINT `SubPOSTerminal_restaurantId_fkey` FOREIGN KEY (`restaurantId`) REFERENCES `Restaurant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MainPOSTerminal` ADD CONSTRAINT `MainPOSTerminal_restaurantId_fkey` FOREIGN KEY (`restaurantId`) REFERENCES `Restaurant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TokenCounterConfig` ADD CONSTRAINT `TokenCounterConfig_restaurantId_fkey` FOREIGN KEY (`restaurantId`) REFERENCES `Restaurant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupplierPayment` ADD CONSTRAINT `SupplierPayment_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupplierPayment` ADD CONSTRAINT `SupplierPayment_restaurantId_fkey` FOREIGN KEY (`restaurantId`) REFERENCES `Restaurant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
