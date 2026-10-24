-- AlterTable
ALTER TABLE `hotelguest` ADD COLUMN `city` VARCHAR(191) NULL,
    ADD COLUMN `country` VARCHAR(191) NULL,
    ADD COLUMN `firstName` VARCHAR(191) NULL,
    ADD COLUMN `lastName` VARCHAR(191) NULL,
    ADD COLUMN `postalCode` VARCHAR(191) NULL,
    ADD COLUMN `state` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `hotelrateplan` ADD COLUMN `isActive` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE `hotelroom` ADD COLUMN `isActive` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE `hotelroomtype` ADD COLUMN `baseOccupancy` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `hotelvenue` ADD COLUMN `isActive` BOOLEAN NOT NULL DEFAULT true;
