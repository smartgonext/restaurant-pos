-- Add item-level tax configuration for POS and reports
ALTER TABLE `MenuItem`
  ADD COLUMN `taxType` VARCHAR(191) NOT NULL DEFAULT 'external',
  ADD COLUMN `taxPercent` DECIMAL(5, 2) NOT NULL DEFAULT 5.00;
