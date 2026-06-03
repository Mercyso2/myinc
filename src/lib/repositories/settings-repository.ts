import { BaseRepository } from "./base-repository";

export const settingsRepository = new BaseRepository<{ id: string; key: string; value: unknown }>(
  "settings",
);
export const adminSettingsRepository = new BaseRepository<{
  id: string;
  key: string;
  value: unknown;
}>("admin_settings");
