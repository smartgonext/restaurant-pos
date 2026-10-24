-- Add sales unit + pack metadata to menu items
ALTER TABLE `MenuItem`
  ADD COLUMN `salesUnit` VARCHAR(191) NULL,
  ADD COLUMN `enablePackOptions` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `packOptions` JSON NULL;

-- Allow decimal quantity (e.g., 0.25kg, 0.50l) for POS token items
ALTER TABLE `BakeryTokenItem`
  MODIFY COLUMN `quantity` DECIMAL(10,3) NOT NULL;
