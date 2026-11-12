// App layer: versioned localStorage save store (progress, settings, bindings, seen tooltips).
export {
  createSafeStorage,
  type SafeStorageOptions,
  type StorageLike,
  type Warn,
} from './safeStorage';
export {
  SECTION_NAMES,
  SECTION_VALIDATORS,
  defaultSaveDocument,
  type BindingsSection,
  type ModeProgress,
  type PassTargeting,
  type ProgressMode,
  type ProgressSection,
  type SaveDocument,
  type SectionName,
  type SeenTooltipsSection,
  type SettingsSection,
} from './schema';
export { CURRENT_VERSION, MIGRATIONS, migrateV1ToV2, type Migration } from './migrations';
export { SAVE_STORAGE_KEY, createSaveStore, type SaveStore, type SaveStoreOptions } from './store';
