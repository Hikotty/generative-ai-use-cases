/**
 * App Settings Hook
 *
 * This hook provides access to application settings loaded from S3.
 * Settings are loaded at app startup and cached for use throughout the application.
 *
 * Requirements:
 * - 18.10: Load latest settings from S3 on frontend startup and reflect in UI
 *
 * The hook uses SWR for data fetching with the following behavior:
 * - Settings are fetched once on app startup
 * - Settings are cached and revalidated on focus
 * - Falls back to default settings if fetch fails or admin is not enabled
 */

import useSWR from 'swr';
import { useMemo } from 'react';
import useHttp from './useHttp';

/**
 * Use case configuration structure.
 */
export interface UseCaseConfig {
  /** Display title for the use case */
  title: string;
  /** Icon path or URL */
  icon: string;
  /** Whether the use case is enabled */
  enabled?: boolean;
}

/**
 * Application settings structure.
 */
export interface AppSettings {
  /** Application name displayed in header */
  appName: string;
  /** Welcome message displayed on home page */
  welcomeMessage: string;
  /** Use case configurations */
  useCases: Record<string, UseCaseConfig>;
  /** Last update timestamp in ISO 8601 format */
  updatedAt?: string;
  /** Email of the admin who last updated the settings */
  updatedBy?: string;
}

/**
 * Default application settings.
 * Used when settings cannot be loaded from S3 or admin is not enabled.
 */
export const DEFAULT_SETTINGS: AppSettings = {
  appName: '',
  welcomeMessage: '',
  useCases: {},
};

/**
 * Check if admin feature is enabled.
 */
const adminEnabled: boolean =
  import.meta.env.VITE_APP_ADMIN_ENABLED === 'true';

/**
 * Hook for accessing application settings.
 *
 * This hook loads settings from S3 via the admin API and provides
 * them to the application. Settings are cached and revalidated
 * periodically.
 *
 * @returns Object containing settings data, loading state, and error
 */
const useAppSettings = () => {
  const http = useHttp();

  // Fetcher function for SWR
  const fetcher = async (url: string): Promise<AppSettings> => {
    const response = await http.api.get<AppSettings>(url);
    return response.data;
  };

  // Use SWR to fetch settings
  // Only fetch if admin is enabled
  const { data, error, isLoading, mutate } = useSWR<AppSettings>(
    adminEnabled ? 'admin/settings' : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 60000, // 1 minute
      errorRetryCount: 2,
      fallbackData: DEFAULT_SETTINGS,
    }
  );

  // Memoize the settings to prevent unnecessary re-renders
  const settings = useMemo<AppSettings>(() => {
    if (!adminEnabled) {
      return DEFAULT_SETTINGS;
    }
    return data || DEFAULT_SETTINGS;
  }, [data]);

  // Get app name with fallback to environment variable
  const appName = useMemo(() => {
    // If settings have a custom app name, use it
    if (settings.appName) {
      return settings.appName;
    }
    // Fall back to environment variable
    return import.meta.env.VITE_APP_BRANDING_TITLE || '';
  }, [settings.appName]);

  // Get welcome message
  const welcomeMessage = useMemo(() => {
    return settings.welcomeMessage || '';
  }, [settings.welcomeMessage]);

  // Get use case config by key
  const getUseCaseConfig = (key: string): UseCaseConfig | undefined => {
    return settings.useCases[key];
  };

  // Get use case title with fallback
  const getUseCaseTitle = (key: string, fallback: string): string => {
    const config = settings.useCases[key];
    return config?.title || fallback;
  };

  // Get use case icon with fallback
  const getUseCaseIcon = (key: string, fallback: string): string => {
    const config = settings.useCases[key];
    return config?.icon || fallback;
  };

  // Check if use case is enabled (defaults to true if not specified)
  const isUseCaseEnabled = (key: string): boolean => {
    const config = settings.useCases[key];
    return config?.enabled !== false;
  };

  return {
    /** The full settings object */
    settings,
    /** Application name (from settings or environment variable) */
    appName,
    /** Welcome message */
    welcomeMessage,
    /** Whether settings are currently loading */
    isLoading,
    /** Error if settings failed to load */
    error,
    /** Whether admin feature is enabled */
    adminEnabled,
    /** Get use case configuration by key */
    getUseCaseConfig,
    /** Get use case title with fallback */
    getUseCaseTitle,
    /** Get use case icon with fallback */
    getUseCaseIcon,
    /** Check if use case is enabled */
    isUseCaseEnabled,
    /** Refresh settings from server */
    refresh: mutate,
  };
};

export default useAppSettings;
