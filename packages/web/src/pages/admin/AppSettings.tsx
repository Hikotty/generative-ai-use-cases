/**
 * Application Settings Page Component
 *
 * Displays and allows editing of application settings including:
 * - App name (displayed in header)
 * - Welcome message
 * - Use case titles
 * - Use case icons (with upload functionality)
 *
 * Requirements:
 * - 18.1: Read current settings from S3 bucket and display
 * - 18.2: Allow editing of app name, use case titles, welcome message
 * - 18.3: Accept image files (PNG, SVG, JPG) for icon upload
 * - 18.4: Validate image size (max 1MB)
 * - 18.8: Preview display of selected/current icon
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  Title,
  Text,
  TextInput,
  Textarea,
  Button,
  Flex,
  Badge,
  Callout,
  Table,
  TableHead,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
} from '@tremor/react';
import {
  PiCheckCircle,
  PiWarning,
  PiSpinner,
  PiPencil,
  PiFloppyDisk,
  PiArrowCounterClockwise,
  PiTextT,
  PiChatText,
  PiListBullets,
  PiImage,
  PiUploadSimple,
  PiX,
} from 'react-icons/pi';
import { toast } from 'sonner';
import useAdminApi, { UseCaseConfig } from '../../hooks/useAdminApi';

/**
 * Supported icon file extensions.
 * Requirement 18.3: Accept image files (PNG, SVG, JPG)
 */
const SUPPORTED_ICON_EXTENSIONS = ['.png', '.svg', '.jpg', '.jpeg'];

/**
 * Maximum icon file size in bytes (1MB).
 * Requirement 18.4: Validate image size (max 1MB)
 */
const MAX_ICON_SIZE = 1 * 1024 * 1024;

/**
 * Accepted MIME types for icon upload.
 */
const ACCEPTED_ICON_TYPES = 'image/png,image/svg+xml,image/jpeg';

/**
 * Validation error state
 */
interface ValidationErrors {
  appName?: string;
  welcomeMessage?: string;
  useCases?: Record<string, string>;
}

/**
 * Icon upload state for a use case
 */
interface IconUploadState {
  file: File | null;
  previewUrl: string | null;
  isUploading: boolean;
  error?: string;
}

/**
 * Editable use case entry
 */
interface EditableUseCase {
  key: string;
  title: string;
  icon: string;
  enabled?: boolean;
  isEditing: boolean;
  originalTitle: string;
  originalIcon: string;
  iconUpload: IconUploadState;
}

/**
 * Main AppSettings page component
 */
const AppSettings: React.FC = () => {
  const { t } = useTranslation();
  const adminApi = useAdminApi();

  // Form state
  const [appName, setAppName] = useState('');
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [useCases, setUseCases] = useState<EditableUseCase[]>([]);

  // Original values for comparison
  const [originalAppName, setOriginalAppName] = useState('');
  const [originalWelcomeMessage, setOriginalWelcomeMessage] = useState('');

  // Validation errors
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});

  // Saving state
  const [isSaving, setIsSaving] = useState(false);

  // Fetch current settings
  const { data: settingsData, error: settingsError, isLoading, mutate } = adminApi.getSettings({
    revalidateOnFocus: false,
  });

  // Initialize form with fetched settings
  useEffect(() => {
    if (settingsData) {
      setAppName(settingsData.appName || '');
      setOriginalAppName(settingsData.appName || '');
      setWelcomeMessage(settingsData.welcomeMessage || '');
      setOriginalWelcomeMessage(settingsData.welcomeMessage || '');

      // Convert useCases object to array for editing
      const useCaseArray: EditableUseCase[] = Object.entries(settingsData.useCases || {}).map(
        ([key, config]) => ({
          key,
          title: config.title,
          icon: config.icon,
          enabled: config.enabled,
          isEditing: false,
          originalTitle: config.title,
          originalIcon: config.icon,
          iconUpload: {
            file: null,
            previewUrl: null,
            isUploading: false,
          },
        })
      );
      setUseCases(useCaseArray);
    }
  }, [settingsData]);

  /**
   * Validate app name
   */
  const validateAppName = useCallback((value: string): string | undefined => {
    if (!value.trim()) {
      return t('admin.settings.validation.app_name_required');
    }
    if (value.length > 100) {
      return t('admin.settings.validation.app_name_too_long');
    }
    return undefined;
  }, [t]);

  /**
   * Validate welcome message
   */
  const validateWelcomeMessage = useCallback((value: string): string | undefined => {
    if (value.length > 500) {
      return t('admin.settings.validation.welcome_message_too_long');
    }
    return undefined;
  }, [t]);

  /**
   * Validate use case title
   */
  const validateUseCaseTitle = useCallback((value: string): string | undefined => {
    if (!value.trim()) {
      return t('admin.settings.validation.usecase_title_required');
    }
    if (value.length > 50) {
      return t('admin.settings.validation.usecase_title_too_long');
    }
    return undefined;
  }, [t]);

  /**
   * Validate icon file extension
   * Requirement 18.3: Accept image files (PNG, SVG, JPG)
   */
  const validateIconExtension = useCallback((fileName: string): boolean => {
    const extension = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
    return SUPPORTED_ICON_EXTENSIONS.includes(extension);
  }, []);

  /**
   * Validate icon file size
   * Requirement 18.4: Validate image size (max 1MB)
   */
  const validateIconSize = useCallback((fileSize: number): boolean => {
    return fileSize > 0 && fileSize <= MAX_ICON_SIZE;
  }, []);

  /**
   * Handle icon file selection
   * Requirements: 18.3, 18.4, 18.8
   */
  const handleIconSelect = useCallback((key: string, file: File | null) => {
    if (!file) {
      // Clear the icon selection
      setUseCases((prev) =>
        prev.map((uc) =>
          uc.key === key
            ? {
                ...uc,
                iconUpload: {
                  file: null,
                  previewUrl: null,
                  isUploading: false,
                  error: undefined,
                },
              }
            : uc
        )
      );
      return;
    }

    // Validate file extension
    if (!validateIconExtension(file.name)) {
      setUseCases((prev) =>
        prev.map((uc) =>
          uc.key === key
            ? {
                ...uc,
                iconUpload: {
                  file: null,
                  previewUrl: null,
                  isUploading: false,
                  error: t('admin.settings.icon.invalid_format'),
                },
              }
            : uc
        )
      );
      return;
    }

    // Validate file size
    if (!validateIconSize(file.size)) {
      setUseCases((prev) =>
        prev.map((uc) =>
          uc.key === key
            ? {
                ...uc,
                iconUpload: {
                  file: null,
                  previewUrl: null,
                  isUploading: false,
                  error: t('admin.settings.icon.size_exceeded'),
                },
              }
            : uc
        )
      );
      return;
    }

    // Create preview URL
    const previewUrl = URL.createObjectURL(file);

    setUseCases((prev) =>
      prev.map((uc) =>
        uc.key === key
          ? {
              ...uc,
              iconUpload: {
                file,
                previewUrl,
                isUploading: false,
                error: undefined,
              },
            }
          : uc
      )
    );
  }, [t, validateIconExtension, validateIconSize]);

  /**
   * Upload icon to S3 using presigned URL
   * Requirements: 18.3, 18.4, 18.6
   */
  const uploadIcon = useCallback(async (key: string): Promise<string | null> => {
    const useCase = useCases.find((uc) => uc.key === key);
    if (!useCase?.iconUpload.file) {
      return null;
    }

    const file = useCase.iconUpload.file;

    // Set uploading state
    setUseCases((prev) =>
      prev.map((uc) =>
        uc.key === key
          ? {
              ...uc,
              iconUpload: {
                ...uc.iconUpload,
                isUploading: true,
                error: undefined,
              },
            }
          : uc
      )
    );

    try {
      // Get presigned URL from backend
      const uploadResponse = await adminApi.uploadIcon({
        fileName: file.name,
        fileSize: file.size,
        contentType: file.type,
      });

      // Upload file to S3 using presigned URL
      const uploadResult = await fetch(uploadResponse.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });

      if (!uploadResult.ok) {
        throw new Error(`Upload failed with status ${uploadResult.status}`);
      }

      // Update use case with new icon URL
      setUseCases((prev) =>
        prev.map((uc) =>
          uc.key === key
            ? {
                ...uc,
                icon: uploadResponse.iconUrl,
                iconUpload: {
                  ...uc.iconUpload,
                  isUploading: false,
                },
              }
            : uc
        )
      );

      return uploadResponse.iconUrl;
    } catch (error) {
      setUseCases((prev) =>
        prev.map((uc) =>
          uc.key === key
            ? {
                ...uc,
                iconUpload: {
                  ...uc.iconUpload,
                  isUploading: false,
                  error: adminApi.getErrorMessage(error),
                },
              }
            : uc
        )
      );
      return null;
    }
  }, [useCases, adminApi]);

  /**
   * Clear icon selection for a use case
   */
  const handleClearIconSelection = useCallback((key: string) => {
    setUseCases((prev) =>
      prev.map((uc) => {
        if (uc.key === key) {
          // Revoke the preview URL to free memory
          if (uc.iconUpload.previewUrl) {
            URL.revokeObjectURL(uc.iconUpload.previewUrl);
          }
          return {
            ...uc,
            iconUpload: {
              file: null,
              previewUrl: null,
              isUploading: false,
              error: undefined,
            },
          };
        }
        return uc;
      })
    );
  }, []);

  /**
   * Handle app name change
   */
  const handleAppNameChange = useCallback((value: string) => {
    setAppName(value);
    const error = validateAppName(value);
    setValidationErrors((prev) => ({
      ...prev,
      appName: error,
    }));
  }, [validateAppName]);

  /**
   * Handle welcome message change
   */
  const handleWelcomeMessageChange = useCallback((value: string) => {
    setWelcomeMessage(value);
    const error = validateWelcomeMessage(value);
    setValidationErrors((prev) => ({
      ...prev,
      welcomeMessage: error,
    }));
  }, [validateWelcomeMessage]);

  /**
   * Start editing a use case title
   */
  const handleStartEditUseCase = useCallback((key: string) => {
    setUseCases((prev) =>
      prev.map((uc) =>
        uc.key === key ? { ...uc, isEditing: true } : uc
      )
    );
  }, []);

  /**
   * Cancel editing a use case title
   */
  const handleCancelEditUseCase = useCallback((key: string) => {
    setUseCases((prev) =>
      prev.map((uc) =>
        uc.key === key ? { ...uc, isEditing: false, title: uc.originalTitle } : uc
      )
    );
    // Clear validation error for this use case
    setValidationErrors((prev) => {
      const newUseCaseErrors = { ...prev.useCases };
      delete newUseCaseErrors[key];
      return { ...prev, useCases: newUseCaseErrors };
    });
  }, []);

  /**
   * Update use case title
   */
  const handleUseCaseTitleChange = useCallback((key: string, value: string) => {
    setUseCases((prev) =>
      prev.map((uc) =>
        uc.key === key ? { ...uc, title: value } : uc
      )
    );
    const error = validateUseCaseTitle(value);
    setValidationErrors((prev) => ({
      ...prev,
      useCases: {
        ...prev.useCases,
        [key]: error || '',
      },
    }));
  }, [validateUseCaseTitle]);

  /**
   * Confirm use case title edit
   */
  const handleConfirmEditUseCase = useCallback((key: string) => {
    const useCase = useCases.find((uc) => uc.key === key);
    if (!useCase) return;

    const error = validateUseCaseTitle(useCase.title);
    if (error) {
      setValidationErrors((prev) => ({
        ...prev,
        useCases: {
          ...prev.useCases,
          [key]: error,
        },
      }));
      return;
    }

    setUseCases((prev) =>
      prev.map((uc) =>
        uc.key === key ? { ...uc, isEditing: false, originalTitle: uc.title, originalIcon: uc.icon } : uc
      )
    );
    // Clear validation error for this use case
    setValidationErrors((prev) => {
      const newUseCaseErrors = { ...prev.useCases };
      delete newUseCaseErrors[key];
      return { ...prev, useCases: newUseCaseErrors };
    });
  }, [useCases, validateUseCaseTitle]);

  /**
   * Check if form has validation errors
   */
  const hasErrors = useMemo(() => {
    if (validationErrors.appName || validationErrors.welcomeMessage) {
      return true;
    }
    if (validationErrors.useCases) {
      return Object.values(validationErrors.useCases).some((error) => error);
    }
    return false;
  }, [validationErrors]);

  /**
   * Check if form has been modified
   */
  const isModified = useMemo(() => {
    if (appName !== originalAppName) return true;
    if (welcomeMessage !== originalWelcomeMessage) return true;
    // Check for title or icon changes, or pending icon uploads
    return useCases.some((uc) => 
      uc.title !== uc.originalTitle || 
      uc.icon !== uc.originalIcon ||
      uc.iconUpload.file !== null
    );
  }, [appName, originalAppName, welcomeMessage, originalWelcomeMessage, useCases]);

  /**
   * Check if any icon is currently uploading
   */
  const isAnyIconUploading = useMemo(() => {
    return useCases.some((uc) => uc.iconUpload.isUploading);
  }, [useCases]);

  /**
   * Check if there are pending icon uploads
   */
  const hasPendingIconUploads = useMemo(() => {
    return useCases.some((uc) => uc.iconUpload.file !== null);
  }, [useCases]);

  /**
   * Check if any use case is being edited
   */
  const isAnyUseCaseEditing = useMemo(() => {
    return useCases.some((uc) => uc.isEditing);
  }, [useCases]);

  /**
   * Reset form to original values
   */
  const handleReset = useCallback(() => {
    setAppName(originalAppName);
    setWelcomeMessage(originalWelcomeMessage);
    setUseCases((prev) =>
      prev.map((uc) => {
        // Revoke preview URL if exists
        if (uc.iconUpload.previewUrl) {
          URL.revokeObjectURL(uc.iconUpload.previewUrl);
        }
        return {
          ...uc,
          title: uc.originalTitle,
          icon: uc.originalIcon,
          isEditing: false,
          iconUpload: {
            file: null,
            previewUrl: null,
            isUploading: false,
            error: undefined,
          },
        };
      })
    );
    setValidationErrors({});
  }, [originalAppName, originalWelcomeMessage]);

  /**
   * Save settings
   * Requirement 18.5: Save settings file (JSON) to S3 bucket
   */
  const handleSave = useCallback(async () => {
    // Validate all fields
    const appNameError = validateAppName(appName);
    const welcomeMessageError = validateWelcomeMessage(welcomeMessage);
    const useCaseErrors: Record<string, string> = {};

    useCases.forEach((uc) => {
      const error = validateUseCaseTitle(uc.title);
      if (error) {
        useCaseErrors[uc.key] = error;
      }
    });

    if (appNameError || welcomeMessageError || Object.keys(useCaseErrors).length > 0) {
      setValidationErrors({
        appName: appNameError,
        welcomeMessage: welcomeMessageError,
        useCases: useCaseErrors,
      });
      return;
    }

    setIsSaving(true);

    try {
      // Upload any pending icons first
      const useCasesWithPendingUploads = useCases.filter((uc) => uc.iconUpload.file !== null);
      const uploadedIcons: Record<string, string> = {};

      for (const uc of useCasesWithPendingUploads) {
        const iconUrl = await uploadIcon(uc.key);
        if (iconUrl) {
          uploadedIcons[uc.key] = iconUrl;
        } else {
          // If any upload fails, stop and show error
          toast.error(t('admin.settings.icon.upload_failed', { key: uc.key }));
          setIsSaving(false);
          return;
        }
      }

      // Build useCases object from array with updated icon URLs
      const useCasesObject: Record<string, UseCaseConfig> = {};
      useCases.forEach((uc) => {
        useCasesObject[uc.key] = {
          title: uc.title,
          icon: uploadedIcons[uc.key] || uc.icon,
          enabled: uc.enabled,
        };
      });

      await adminApi.updateSettings({
        appName,
        welcomeMessage,
        useCases: useCasesObject,
      });

      // Update original values after successful save
      setOriginalAppName(appName);
      setOriginalWelcomeMessage(welcomeMessage);
      setUseCases((prev) =>
        prev.map((uc) => {
          // Revoke preview URL if exists
          if (uc.iconUpload.previewUrl) {
            URL.revokeObjectURL(uc.iconUpload.previewUrl);
          }
          return {
            ...uc,
            originalTitle: uc.title,
            originalIcon: uploadedIcons[uc.key] || uc.icon,
            icon: uploadedIcons[uc.key] || uc.icon,
            isEditing: false,
            iconUpload: {
              file: null,
              previewUrl: null,
              isUploading: false,
              error: undefined,
            },
          };
        })
      );

      // Refresh data
      void mutate();

      toast.success(t('admin.settings.toast.save_success'));
    } catch (error) {
      toast.error(adminApi.getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }, [
    appName,
    welcomeMessage,
    useCases,
    validateAppName,
    validateWelcomeMessage,
    validateUseCaseTitle,
    uploadIcon,
    adminApi,
    mutate,
    t,
  ]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <PiSpinner className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t('admin.settings.title')}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {t('admin.settings.description')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isModified && (
            <Badge color="yellow" icon={PiWarning}>
              {t('admin.settings.unsaved_changes')}
            </Badge>
          )}
          {!hasErrors && !isModified && (
            <Badge color="green" icon={PiCheckCircle}>
              {t('admin.settings.up_to_date')}
            </Badge>
          )}
        </div>
      </div>

      {/* Error Display */}
      {settingsError && (
        <Callout title={t('common.error')} color="red" icon={PiWarning}>
          {adminApi.getErrorMessage(settingsError)}
        </Callout>
      )}

      {/* App Name Section */}
      <Card>
        <Flex alignItems="start" className="mb-4">
          <div>
            <Title>{t('admin.settings.sections.app_name')}</Title>
            <Text>{t('admin.settings.sections.app_name_desc')}</Text>
          </div>
          <PiTextT className="h-6 w-6 text-gray-400" />
        </Flex>
        <div className="space-y-2">
          <TextInput
            value={appName}
            onChange={(e) => handleAppNameChange(e.target.value)}
            placeholder={t('admin.settings.placeholders.app_name')}
            error={!!validationErrors.appName}
            errorMessage={validationErrors.appName}
          />
        </div>
      </Card>

      {/* Welcome Message Section */}
      <Card>
        <Flex alignItems="start" className="mb-4">
          <div>
            <Title>{t('admin.settings.sections.welcome_message')}</Title>
            <Text>{t('admin.settings.sections.welcome_message_desc')}</Text>
          </div>
          <PiChatText className="h-6 w-6 text-gray-400" />
        </Flex>
        <div className="space-y-2">
          <Textarea
            value={welcomeMessage}
            onChange={(e) => handleWelcomeMessageChange(e.target.value)}
            placeholder={t('admin.settings.placeholders.welcome_message')}
            rows={3}
            error={!!validationErrors.welcomeMessage}
            errorMessage={validationErrors.welcomeMessage}
          />
          <Text className="text-xs text-gray-500">
            {t('admin.settings.welcome_message_hint', { count: welcomeMessage.length, max: 500 })}
          </Text>
        </div>
      </Card>

      {/* Use Case Titles Section */}
      <Card>
        <Flex alignItems="start" className="mb-4">
          <div>
            <Title>{t('admin.settings.sections.usecase_titles')}</Title>
            <Text>{t('admin.settings.sections.usecase_titles_desc')}</Text>
          </div>
          <PiListBullets className="h-6 w-6 text-gray-400" />
        </Flex>

        {useCases.length > 0 ? (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{t('admin.settings.table.usecase_key')}</TableHeaderCell>
                <TableHeaderCell>{t('admin.settings.table.icon')}</TableHeaderCell>
                <TableHeaderCell>{t('admin.settings.table.title')}</TableHeaderCell>
                <TableHeaderCell>{t('admin.settings.table.actions')}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {useCases.map((useCase) => (
                <TableRow key={useCase.key}>
                  <TableCell>
                    <Badge color="gray">{useCase.key}</Badge>
                  </TableCell>
                  <TableCell>
                    {/* Icon Preview and Upload - Requirement 18.8 */}
                    <div className="flex items-center gap-3">
                      {/* Current/Preview Icon */}
                      <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                        {useCase.iconUpload.previewUrl ? (
                          <img
                            src={useCase.iconUpload.previewUrl}
                            alt={t('admin.settings.icon.alt_preview', { key: useCase.key })}
                            className="h-full w-full object-contain"
                          />
                        ) : useCase.icon ? (
                          <img
                            src={useCase.icon}
                            alt={t('admin.settings.icon.alt_current', { key: useCase.key })}
                            className="h-full w-full object-contain"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <PiImage className="h-full w-full p-2 text-gray-400" />
                        )}
                        {useCase.iconUpload.isUploading && (
                          <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                            <PiSpinner className="h-5 w-5 animate-spin text-blue-500" />
                          </div>
                        )}
                      </div>

                      {/* Upload Controls */}
                      <div className="flex flex-col gap-1">
                        {useCase.iconUpload.file ? (
                          <div className="flex items-center gap-2">
                            <Text className="text-xs text-green-600">
                              {useCase.iconUpload.file.name}
                            </Text>
                            <button
                              type="button"
                              onClick={() => handleClearIconSelection(useCase.key)}
                              className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                              title={t('admin.settings.icon.clear')}
                            >
                              <PiX className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <label className="cursor-pointer">
                            <input
                              type="file"
                              accept={ACCEPTED_ICON_TYPES}
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0] || null;
                                handleIconSelect(useCase.key, file);
                                // Reset input value to allow selecting the same file again
                                e.target.value = '';
                              }}
                              disabled={useCase.iconUpload.isUploading}
                            />
                            <span className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-50">
                              <PiUploadSimple className="h-3 w-3" />
                              {t('admin.settings.icon.upload')}
                            </span>
                          </label>
                        )}
                        {useCase.iconUpload.error && (
                          <Text className="text-xs text-red-500">
                            {useCase.iconUpload.error}
                          </Text>
                        )}
                        <Text className="text-xs text-gray-400">
                          {t('admin.settings.icon.hint')}
                        </Text>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {useCase.isEditing ? (
                      <div className="flex items-center gap-2">
                        <TextInput
                          value={useCase.title}
                          onChange={(e) => handleUseCaseTitleChange(useCase.key, e.target.value)}
                          error={!!validationErrors.useCases?.[useCase.key]}
                          errorMessage={validationErrors.useCases?.[useCase.key]}
                          className="w-full"
                        />
                      </div>
                    ) : (
                      <Text>{useCase.title}</Text>
                    )}
                  </TableCell>
                  <TableCell>
                    {useCase.isEditing ? (
                      <Flex justifyContent="start" className="gap-2">
                        <Button
                          size="xs"
                          variant="primary"
                          icon={PiCheckCircle}
                          onClick={() => handleConfirmEditUseCase(useCase.key)}
                        >
                          {t('common.save')}
                        </Button>
                        <Button
                          size="xs"
                          variant="secondary"
                          onClick={() => handleCancelEditUseCase(useCase.key)}
                        >
                          {t('common.cancel')}
                        </Button>
                      </Flex>
                    ) : (
                      <Button
                        size="xs"
                        variant="secondary"
                        icon={PiPencil}
                        onClick={() => handleStartEditUseCase(useCase.key)}
                      >
                        {t('common.edit')}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
            <PiListBullets className="mx-auto h-12 w-12 text-gray-400" />
            <Text className="mt-2 text-gray-500">
              {t('admin.settings.no_usecases')}
            </Text>
          </div>
        )}
      </Card>

      {/* Action Buttons */}
      <Card>
        <Flex justifyContent="end" className="gap-3">
          <Button
            variant="secondary"
            icon={PiArrowCounterClockwise}
            onClick={handleReset}
            disabled={!isModified || isSaving || isAnyIconUploading}
          >
            {t('admin.settings.reset')}
          </Button>
          <Button
            variant="primary"
            icon={isSaving ? PiSpinner : PiFloppyDisk}
            onClick={handleSave}
            disabled={hasErrors || !isModified || isSaving || isAnyUseCaseEditing || isAnyIconUploading}
            loading={isSaving}
          >
            {isSaving ? t('admin.settings.saving') : t('admin.settings.save')}
          </Button>
        </Flex>
        {hasPendingIconUploads && (
          <Text className="mt-2 text-right text-xs text-amber-600">
            {t('admin.settings.icon.pending_uploads')}
          </Text>
        )}
      </Card>

      {/* Last Updated Info */}
      {settingsData?.updatedAt && (
        <div className="text-right text-sm text-gray-500">
          {t('admin.settings.last_updated', {
            date: new Date(settingsData.updatedAt).toLocaleString(),
            by: settingsData.updatedBy || t('admin.settings.unknown_user'),
          })}
        </div>
      )}
    </div>
  );
};

export default AppSettings;
