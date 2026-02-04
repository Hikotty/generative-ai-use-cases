import { useMemo } from 'react';
import useAppSettings from './useAppSettings';

interface BrandingConfig {
  logoPath: string;
  title: string;
}

/**
 * Hook for accessing branding configuration.
 *
 * This hook provides branding settings with the following priority:
 * 1. App settings from S3 (if admin is enabled and settings exist)
 * 2. Environment variables (VITE_APP_BRANDING_*)
 * 3. Empty string (fallback)
 *
 * Requirement 18.10: Load latest settings from S3 on frontend startup
 */
const useBranding = (): BrandingConfig => {
  const { appName: settingsAppName } = useAppSettings();

  const brandingConfig = useMemo(() => {
    const logoPath = import.meta.env.VITE_APP_BRANDING_LOGO_PATH;
    const envTitle = import.meta.env.VITE_APP_BRANDING_TITLE;

    // Use settings app name if available, otherwise fall back to env variable
    const title = settingsAppName || envTitle || '';

    return {
      logoPath: logoPath || '',
      title,
    };
  }, [settingsAppName]);

  return brandingConfig;
};

export default useBranding;
