-- CreateTable
CREATE TABLE `BillSettings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `restaurantId` INTEGER NOT NULL,
    `showGST` BOOLEAN NOT NULL DEFAULT false,
    `showUnitForKOT` BOOLEAN NOT NULL DEFAULT false,
    `showUnitForNonKOT` BOOLEAN NOT NULL DEFAULT true,
    `loyaltyDiscountFormat` VARCHAR(191) NOT NULL DEFAULT 'small_line',
    `billHeaderText` TEXT NULL,
    `thankYouMessage` VARCHAR(191) NULL DEFAULT 'Thank you for your business!',
    `showTokenNumber` BOOLEAN NOT NULL DEFAULT true,
    `showRestaurantInfo` BOOLEAN NOT NULL DEFAULT true,
    `showPhoneNumber` BOOLEAN NOT NULL DEFAULT true,
    `itemTaxDisplay` VARCHAR(191) NOT NULL DEFAULT 'item_level',
    `kotItemsDisplay` JSON NULL,
    `nonKotItemsDisplay` JSON NULL,
    `billSectionOrder` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `BillSettings_restaurantId_key`(`restaurantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `BillSettings` ADD CONSTRAINT `BillSettings_restaurantId_fkey` FOREIGN KEY (`restaurantId`) REFERENCES `Restaurant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
