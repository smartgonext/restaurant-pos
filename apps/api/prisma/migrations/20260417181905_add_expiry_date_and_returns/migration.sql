-- AlterTable
ALTER TABLE `menuitem` ADD COLUMN `expiryDate` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `BakeryTokenReturn` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `originalTokenId` INTEGER NOT NULL,
    `returnTokenId` INTEGER NULL,
    `restaurantId` INTEGER NOT NULL,
    `branchId` INTEGER NOT NULL,
    `returnedBy` VARCHAR(191) NOT NULL,
    `returnReason` VARCHAR(191) NULL,
    `totalReturnAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'completed',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BakeryTokenReturnItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `returnId` INTEGER NOT NULL,
    `tokenItemId` INTEGER NOT NULL,
    `menuItemId` INTEGER NOT NULL,
    `menuItemName` VARCHAR(191) NOT NULL,
    `quantity` DECIMAL(10, 3) NOT NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `totalReturn` DECIMAL(10, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `BakeryTokenReturn` ADD CONSTRAINT `BakeryTokenReturn_originalTokenId_fkey` FOREIGN KEY (`originalTokenId`) REFERENCES `BakeryToken`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BakeryTokenReturnItem` ADD CONSTRAINT `BakeryTokenReturnItem_returnId_fkey` FOREIGN KEY (`returnId`) REFERENCES `BakeryTokenReturn`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BakeryTokenReturnItem` ADD CONSTRAINT `BakeryTokenReturnItem_menuItemId_fkey` FOREIGN KEY (`menuItemId`) REFERENCES `MenuItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
