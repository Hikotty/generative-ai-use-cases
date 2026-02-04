/**
 * Deploy Parameters Page Component
 *
 * Displays and allows editing of cdk.json deployment parameters.
 *
 * Requirements:
 * - 17.1: Display current cdk.json parameter values
 * - 17.2: Display editable parameters (toggles for boolean, text inputs for strings)
 * - 17.3: Validate parameter changes
 * - 17.4: Generate CloudFormation template button
 * - 17.5: API call for template generation
 * - 17.6: Display Quick Create Link
 * - 17.7: "Open in CloudFormation Console" button
 * - 17.8: Template download link
 * - 17.9: Mask sensitive information (API keys, secrets)
 * - 17.10: Display change history with past settings and Quick Create Links
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  Title,
  Text,
  TextInput,
  Switch,
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
  PiRocket,
  PiGear,
  PiEye,
  PiEyeSlash,
  PiWarning,
  PiCheckCircle,
  PiInfo,
  PiCloudArrowUp,
  PiDownloadSimple,
  PiArrowSquareOut,
  PiSpinner,
  PiCopy,
  PiCheck,
  PiClockCounterClockwise,
} from 'react-icons/pi';
import useAdminApi, { DeployParameters as DeployParametersType, GenerateTemplateResponse, TemplateHistoryEntry } from '../../hooks/useAdminApi';

/**
 * Parameter definition for form rendering
 */
interface ParameterDefinition {
  key: string;
  labelKey: string;
  descriptionKey: string;
  type: 'boolean' | 'string' | 'secret';
  required?: boolean;
  validation?: (value: string) => string | null;
}

/**
 * Validation error state
 */
interface ValidationErrors {
  [key: string]: string | null;
}

/**
 * Parameter definitions for the form
 */
const PARAMETER_DEFINITIONS: ParameterDefinition[] = [
  {
    key: 'ragEnabled',
    labelKey: 'admin.deploy.params.rag_enabled',
    descriptionKey: 'admin.deploy.params.rag_enabled_desc',
    type: 'boolean',
  },
  {
    key: 'agentEnabled',
    labelKey: 'admin.deploy.params.agent_enabled',
    descriptionKey: 'admin.deploy.params.agent_enabled_desc',
    type: 'boolean',
  },
  {
    key: 'useCaseBuilderEnabled',
    labelKey: 'admin.deploy.params.usecase_builder_enabled',
    descriptionKey: 'admin.deploy.params.usecase_builder_enabled_desc',
    type: 'boolean',
  },
  {
    key: 'modelId',
    labelKey: 'admin.deploy.params.model_id',
    descriptionKey: 'admin.deploy.params.model_id_desc',
    type: 'string',
  },
  {
    key: 'searchApiKey',
    labelKey: 'admin.deploy.params.search_api_key',
    descriptionKey: 'admin.deploy.params.search_api_key_desc',
    type: 'secret',
  },
  {
    key: 'stackName',
    labelKey: 'admin.deploy.params.stack_name',
    descriptionKey: 'admin.deploy.params.stack_name_desc',
    type: 'string',
    validation: (value: string) => {
      if (!value) return null;
      const stackNameRegex = /^[a-zA-Z][a-zA-Z0-9-]*$/;
      if (!stackNameRegex.test(value)) {
        return 'admin.deploy.validation.stack_name_format';
      }
      if (value.length > 128) {
        return 'admin.deploy.validation.stack_name_length';
      }
      return null;
    },
  },
];

/**
 * Mask a sensitive value for display
 */
const maskValue = (value: string): string => {
  if (!value || value.length <= 4) {
    return '••••••••';
  }
  return '••••••••' + value.slice(-4);
};

/**
 * Boolean Parameter Toggle Component
 */
interface BooleanParameterProps {
  paramKey: string;
  label: string;
  description: string;
  value: boolean;
  onChange: (key: string, value: boolean) => void;
  disabled?: boolean;
}

const BooleanParameter: React.FC<BooleanParameterProps> = ({
  paramKey,
  label,
  description,
  value,
  onChange,
  disabled = false,
}) => {
  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
      <div className="flex-1">
        <Text className="font-medium text-gray-900">{label}</Text>
        <Text className="mt-1 text-sm text-gray-500">{description}</Text>
      </div>
      <Switch
        checked={value}
        onChange={() => onChange(paramKey, !value)}
        disabled={disabled}
        color="blue"
      />
    </div>
  );
};

/**
 * String Parameter Input Component
 */
interface StringParameterProps {
  paramKey: string;
  label: string;
  description: string;
  value: string;
  onChange: (key: string, value: string) => void;
  error?: string | null;
  disabled?: boolean;
  placeholder?: string;
}

const StringParameter: React.FC<StringParameterProps> = ({
  paramKey,
  label,
  description,
  value,
  onChange,
  error,
  disabled = false,
  placeholder,
}) => {
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="mb-2">
        <Text className="font-medium text-gray-900">{label}</Text>
        <Text className="mt-1 text-sm text-gray-500">{description}</Text>
      </div>
      <TextInput
        value={value}
        onChange={(e) => onChange(paramKey, e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        error={!!error}
        errorMessage={error || undefined}
      />
    </div>
  );
};

/**
 * Secret Parameter Input Component with mask/unmask toggle
 * Requirement 17.9: Mask sensitive information
 */
interface SecretParameterProps {
  paramKey: string;
  label: string;
  description: string;
  value: string;
  onChange: (key: string, value: string) => void;
  error?: string | null;
  disabled?: boolean;
  placeholder?: string;
}

const SecretParameter: React.FC<SecretParameterProps> = ({
  paramKey,
  label,
  description,
  value,
  onChange,
  error,
  disabled = false,
  placeholder,
}) => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const handleToggleVisibility = useCallback(() => {
    setIsVisible(!isVisible);
  }, [isVisible]);

  const handleStartEdit = useCallback(() => {
    setIsEditing(true);
    setEditValue('');
  }, []);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditValue('');
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (editValue) {
      onChange(paramKey, editValue);
    }
    setIsEditing(false);
    setEditValue('');
  }, [editValue, onChange, paramKey]);

  const displayValue = useMemo(() => {
    if (isEditing) {
      return editValue;
    }
    if (!value) {
      return '';
    }
    return isVisible ? value : maskValue(value);
  }, [isEditing, editValue, value, isVisible]);

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="mb-2">
        <Flex justifyContent="between" alignItems="start">
          <div>
            <Text className="font-medium text-gray-900">{label}</Text>
            <Text className="mt-1 text-sm text-gray-500">{description}</Text>
          </div>
          <Badge color="orange" icon={PiWarning}>
            {t('admin.deploy.sensitive')}
          </Badge>
        </Flex>
      </div>
      <div className="flex items-center gap-2">
        {isEditing ? (
          <>
            <TextInput
              type="password"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              placeholder={placeholder || t('admin.deploy.enter_new_value')}
              disabled={disabled}
              className="flex-1"
            />
            <Button
              size="xs"
              variant="secondary"
              onClick={handleCancelEdit}
              disabled={disabled}>
              {t('common.cancel')}
            </Button>
            <Button
              size="xs"
              variant="primary"
              onClick={handleSaveEdit}
              disabled={disabled || !editValue}>
              {t('common.save')}
            </Button>
          </>
        ) : (
          <>
            <TextInput
              value={displayValue}
              readOnly
              disabled={disabled}
              className="flex-1"
              error={!!error}
              errorMessage={error || undefined}
            />
            <Button
              size="xs"
              variant="secondary"
              icon={isVisible ? PiEyeSlash : PiEye}
              onClick={handleToggleVisibility}
              disabled={disabled || !value}>
              {isVisible ? t('admin.deploy.hide') : t('admin.deploy.show')}
            </Button>
            <Button
              size="xs"
              variant="secondary"
              onClick={handleStartEdit}
              disabled={disabled}>
              {t('common.edit')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

/**
 * Main DeployParameters page component
 */
const DeployParameters: React.FC = () => {
  const { t } = useTranslation();
  const adminApi = useAdminApi();

  // Form state
  const [parameters, setParameters] = useState<DeployParametersType>({
    ragEnabled: false,
    agentEnabled: false,
    useCaseBuilderEnabled: false,
    modelId: 'anthropic.claude-sonnet-4-20250514',
    searchApiKey: '',
    stackName: 'GenU-Stack',
  });

  // Validation errors state
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});

  // Loading state for form
  const [isLoading] = useState(false);

  // Template generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedTemplate, setGeneratedTemplate] = useState<GenerateTemplateResponse | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  // Fetch template history to get current parameters (if available)
  const { data: historyData, error: historyError, mutate: mutateHistory } = adminApi.getTemplateHistory(
    { limit: 10 },
    { revalidateOnFocus: false }
  );

  // State for copying history item links
  const [copiedHistoryId, setCopiedHistoryId] = useState<string | null>(null);

  // Initialize parameters from history if available
  useEffect(() => {
    if (historyData?.history && historyData.history.length > 0) {
      const latestParams = historyData.history[0].parameters;
      setParameters((prev) => ({
        ...prev,
        ...latestParams,
      }));
    }
  }, [historyData]);

  /**
   * Handle boolean parameter change
   */
  const handleBooleanChange = useCallback((key: string, value: boolean) => {
    setParameters((prev) => ({
      ...prev,
      [key]: value,
    }));
  }, []);

  /**
   * Handle string parameter change with validation
   * Requirement 17.3: Validate parameter changes
   */
  const handleStringChange = useCallback(
    (key: string, value: string) => {
      setParameters((prev) => ({
        ...prev,
        [key]: value,
      }));

      // Find parameter definition and validate
      const paramDef = PARAMETER_DEFINITIONS.find((p) => p.key === key);
      if (paramDef?.validation) {
        const error = paramDef.validation(value);
        setValidationErrors((prev) => ({
          ...prev,
          [key]: error ? t(error) : null,
        }));
      }
    },
    [t]
  );

  /**
   * Check if form has validation errors
   */
  const hasErrors = useMemo(() => {
    return Object.values(validationErrors).some((error) => error !== null);
  }, [validationErrors]);

  /**
   * Check if form has been modified
   */
  const isModified = useMemo(() => {
    if (!historyData?.history || historyData.history.length === 0) {
      return true;
    }
    const originalParams = historyData.history[0].parameters;
    return JSON.stringify(parameters) !== JSON.stringify(originalParams);
  }, [parameters, historyData]);

  /**
   * Handle template generation
   * Requirements: 17.4, 17.5
   */
  const handleGenerateTemplate = useCallback(async () => {
    if (hasErrors) {
      return;
    }

    setIsGenerating(true);
    setGenerateError(null);
    setGeneratedTemplate(null);

    try {
      const response = await adminApi.generateTemplate({ parameters });
      setGeneratedTemplate(response);
      // Refresh history after successful generation
      void mutateHistory();
    } catch (error) {
      setGenerateError(adminApi.getErrorMessage(error));
    } finally {
      setIsGenerating(false);
    }
  }, [adminApi, parameters, hasErrors, mutateHistory]);

  /**
   * Handle opening CloudFormation console
   * Requirement: 17.7
   */
  const handleOpenCloudFormation = useCallback(() => {
    if (generatedTemplate?.quickCreateLink) {
      window.open(generatedTemplate.quickCreateLink, '_blank', 'noopener,noreferrer');
    }
  }, [generatedTemplate]);

  /**
   * Handle template download
   * Requirement: 17.8
   */
  const handleDownloadTemplate = useCallback(() => {
    if (generatedTemplate?.downloadLink) {
      window.open(generatedTemplate.downloadLink, '_blank', 'noopener,noreferrer');
    }
  }, [generatedTemplate]);

  /**
   * Handle copying Quick Create Link to clipboard
   */
  const handleCopyLink = useCallback(async () => {
    if (generatedTemplate?.quickCreateLink) {
      try {
        await navigator.clipboard.writeText(generatedTemplate.quickCreateLink);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      } catch {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = generatedTemplate.quickCreateLink;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      }
    }
  }, [generatedTemplate]);

  /**
   * Handle copying history item Quick Create Link to clipboard
   * Requirement 17.10: Re-display Quick Create Link for history items
   */
  const handleCopyHistoryLink = useCallback(async (historyItem: TemplateHistoryEntry) => {
    try {
      await navigator.clipboard.writeText(historyItem.quickCreateLink);
      setCopiedHistoryId(historyItem.id);
      setTimeout(() => setCopiedHistoryId(null), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = historyItem.quickCreateLink;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopiedHistoryId(historyItem.id);
      setTimeout(() => setCopiedHistoryId(null), 2000);
    }
  }, []);

  /**
   * Handle opening CloudFormation console for history item
   * Requirement 17.10: Re-display Quick Create Link for history items
   */
  const handleOpenHistoryCloudFormation = useCallback((historyItem: TemplateHistoryEntry) => {
    window.open(historyItem.quickCreateLink, '_blank', 'noopener,noreferrer');
  }, []);

  /**
   * Handle downloading template for history item
   */
  const handleDownloadHistoryTemplate = useCallback((historyItem: TemplateHistoryEntry) => {
    window.open(historyItem.downloadLink, '_blank', 'noopener,noreferrer');
  }, []);

  /**
   * Format parameters for display in history table
   */
  const formatParametersForDisplay = useCallback((params: DeployParametersType): string => {
    const displayParts: string[] = [];
    if (params.ragEnabled) displayParts.push('RAG');
    if (params.agentEnabled) displayParts.push('Agent');
    if (params.useCaseBuilderEnabled) displayParts.push('UseCaseBuilder');
    if (params.modelId) displayParts.push(`Model: ${params.modelId}`);
    return displayParts.length > 0 ? displayParts.join(', ') : '-';
  }, []);

  /**
   * Render parameter based on type
   */
  const renderParameter = useCallback(
    (paramDef: ParameterDefinition) => {
      const value = parameters[paramDef.key];

      switch (paramDef.type) {
        case 'boolean':
          return (
            <BooleanParameter
              key={paramDef.key}
              paramKey={paramDef.key}
              label={t(paramDef.labelKey)}
              description={t(paramDef.descriptionKey)}
              value={Boolean(value)}
              onChange={handleBooleanChange}
              disabled={isLoading}
            />
          );
        case 'secret':
          return (
            <SecretParameter
              key={paramDef.key}
              paramKey={paramDef.key}
              label={t(paramDef.labelKey)}
              description={t(paramDef.descriptionKey)}
              value={String(value || '')}
              onChange={handleStringChange}
              error={validationErrors[paramDef.key]}
              disabled={isLoading}
            />
          );
        case 'string':
        default:
          return (
            <StringParameter
              key={paramDef.key}
              paramKey={paramDef.key}
              label={t(paramDef.labelKey)}
              description={t(paramDef.descriptionKey)}
              value={String(value || '')}
              onChange={handleStringChange}
              error={validationErrors[paramDef.key]}
              disabled={isLoading}
            />
          );
      }
    },
    [parameters, t, handleBooleanChange, handleStringChange, validationErrors, isLoading]
  );

  // Group parameters by type for better organization
  const booleanParams = PARAMETER_DEFINITIONS.filter((p) => p.type === 'boolean');
  const stringParams = PARAMETER_DEFINITIONS.filter((p) => p.type === 'string');
  const secretParams = PARAMETER_DEFINITIONS.filter((p) => p.type === 'secret');

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t('admin.deploy.title')}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {t('admin.deploy.description')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isModified && (
            <Badge color="yellow" icon={PiWarning}>
              {t('admin.deploy.unsaved_changes')}
            </Badge>
          )}
          {!hasErrors && !isModified && (
            <Badge color="green" icon={PiCheckCircle}>
              {t('admin.deploy.up_to_date')}
            </Badge>
          )}
        </div>
      </div>

      {/* Error Display */}
      {historyError && (
        <Card className="border-red-200 bg-red-50">
          <p className="text-red-700">{adminApi.getErrorMessage(historyError)}</p>
        </Card>
      )}

      {/* Info Card */}
      <Card className="border-blue-200 bg-blue-50">
        <Flex justifyContent="start" className="gap-3">
          <PiInfo className="h-5 w-5 shrink-0 text-blue-600" />
          <Text className="text-blue-800">{t('admin.deploy.info_message')}</Text>
        </Flex>
      </Card>

      {/* Feature Toggles Section */}
      <Card>
        <Flex alignItems="start" className="mb-4">
          <div>
            <Title>{t('admin.deploy.sections.features')}</Title>
            <Text>{t('admin.deploy.sections.features_desc')}</Text>
          </div>
          <PiGear className="h-6 w-6 text-gray-400" />
        </Flex>
        <div className="space-y-4">
          {booleanParams.map(renderParameter)}
        </div>
      </Card>

      {/* Configuration Section */}
      <Card>
        <Flex alignItems="start" className="mb-4">
          <div>
            <Title>{t('admin.deploy.sections.configuration')}</Title>
            <Text>{t('admin.deploy.sections.configuration_desc')}</Text>
          </div>
          <PiRocket className="h-6 w-6 text-gray-400" />
        </Flex>
        <div className="space-y-4">
          {stringParams.map(renderParameter)}
        </div>
      </Card>

      {/* Sensitive Parameters Section */}
      {secretParams.length > 0 && (
        <Card>
          <Flex alignItems="start" className="mb-4">
            <div>
              <Title>{t('admin.deploy.sections.sensitive')}</Title>
              <Text>{t('admin.deploy.sections.sensitive_desc')}</Text>
            </div>
            <PiWarning className="h-6 w-6 text-orange-400" />
          </Flex>
          <div className="space-y-4">
            {secretParams.map(renderParameter)}
          </div>
        </Card>
      )}

      {/* Validation Summary */}
      {hasErrors && (
        <Card className="border-red-200 bg-red-50">
          <Title className="text-red-700">{t('admin.deploy.validation_errors')}</Title>
          <ul className="mt-2 list-inside list-disc text-red-600">
            {Object.entries(validationErrors)
              .filter(([, error]) => error !== null)
              .map(([key, error]) => (
                <li key={key}>{error}</li>
              ))}
          </ul>
        </Card>
      )}

      {/* Template Generation Section */}
      <Card>
        <Flex alignItems="start" className="mb-4">
          <div>
            <Title>{t('admin.deploy.generate.title')}</Title>
            <Text>{t('admin.deploy.generate.description')}</Text>
          </div>
          <PiCloudArrowUp className="h-6 w-6 text-gray-400" />
        </Flex>

        {/* Generate Button */}
        <div className="mb-4">
          <Button
            icon={isGenerating ? PiSpinner : PiCloudArrowUp}
            onClick={handleGenerateTemplate}
            disabled={hasErrors || isGenerating}
            loading={isGenerating}
            className="w-full sm:w-auto"
          >
            {isGenerating
              ? t('admin.deploy.generate.generating')
              : t('admin.deploy.generate.button')}
          </Button>
        </div>

        {/* Generation Error */}
        {generateError && (
          <Callout
            title={t('admin.deploy.generate.error_title')}
            color="red"
            icon={PiWarning}
            className="mb-4"
          >
            {generateError}
          </Callout>
        )}

        {/* Generated Template Result */}
        {generatedTemplate && (
          <div className="space-y-4">
            {/* Success Message */}
            <Callout
              title={t('admin.deploy.generate.success_title')}
              color="green"
              icon={PiCheckCircle}
            >
              {t('admin.deploy.generate.success_message', {
                stackName: generatedTemplate.stackName,
                generatedAt: new Date(generatedTemplate.generatedAt).toLocaleString(),
              })}
            </Callout>

            {/* Quick Create Link Section */}
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <Text className="mb-2 font-medium text-gray-900">
                {t('admin.deploy.generate.quick_create_link')}
              </Text>
              <div className="mb-3 flex items-center gap-2">
                <TextInput
                  value={generatedTemplate.quickCreateLink}
                  readOnly
                  className="flex-1 text-xs"
                />
                <Button
                  size="xs"
                  variant="secondary"
                  icon={copySuccess ? PiCheck : PiCopy}
                  onClick={handleCopyLink}
                  color={copySuccess ? 'green' : 'gray'}
                >
                  {copySuccess
                    ? t('admin.deploy.generate.copied')
                    : t('admin.deploy.generate.copy')}
                </Button>
              </div>

              {/* Action Buttons */}
              <Flex justifyContent="start" className="gap-3">
                {/* Open in CloudFormation Console Button - Requirement 17.7 */}
                <Button
                  icon={PiArrowSquareOut}
                  onClick={handleOpenCloudFormation}
                  variant="primary"
                >
                  {t('admin.deploy.generate.open_console')}
                </Button>

                {/* Download Template Link - Requirement 17.8 */}
                <Button
                  icon={PiDownloadSimple}
                  onClick={handleDownloadTemplate}
                  variant="secondary"
                >
                  {t('admin.deploy.generate.download')}
                </Button>
              </Flex>
            </div>

            {/* Instructions */}
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <Flex justifyContent="start" className="mb-2 gap-2">
                <PiInfo className="h-5 w-5 shrink-0 text-blue-600" />
                <Text className="font-medium text-blue-800">
                  {t('admin.deploy.generate.instructions_title')}
                </Text>
              </Flex>
              <ol className="ml-7 list-decimal space-y-1 text-sm text-blue-700">
                <li>{t('admin.deploy.generate.instruction_1')}</li>
                <li>{t('admin.deploy.generate.instruction_2')}</li>
                <li>{t('admin.deploy.generate.instruction_3')}</li>
              </ol>
            </div>
          </div>
        )}
      </Card>

      {/* History Section - Requirement 17.10 */}
      <Card>
        <Flex alignItems="start" className="mb-4">
          <div>
            <Title>{t('admin.deploy.history.title')}</Title>
            <Text>{t('admin.deploy.history.description')}</Text>
          </div>
          <PiClockCounterClockwise className="h-6 w-6 text-gray-400" />
        </Flex>

        {historyData?.history && historyData.history.length > 0 ? (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{t('admin.deploy.history.table.date')}</TableHeaderCell>
                <TableHeaderCell>{t('admin.deploy.history.table.stack_name')}</TableHeaderCell>
                <TableHeaderCell>{t('admin.deploy.history.table.parameters')}</TableHeaderCell>
                <TableHeaderCell>{t('admin.deploy.history.table.actions')}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {historyData.history.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Text className="text-sm">
                      {new Date(item.createdDate).toLocaleString()}
                    </Text>
                    {item.adminEmail && (
                      <Text className="text-xs text-gray-500">
                        {item.adminEmail}
                      </Text>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge color="blue">{item.stackName}</Badge>
                  </TableCell>
                  <TableCell>
                    <Text className="max-w-xs truncate text-sm" title={formatParametersForDisplay(item.parameters)}>
                      {formatParametersForDisplay(item.parameters)}
                    </Text>
                  </TableCell>
                  <TableCell>
                    <Flex justifyContent="start" className="gap-2">
                      <Button
                        size="xs"
                        variant="secondary"
                        icon={copiedHistoryId === item.id ? PiCheck : PiCopy}
                        onClick={() => handleCopyHistoryLink(item)}
                        color={copiedHistoryId === item.id ? 'green' : 'gray'}
                        tooltip={t('admin.deploy.history.copy_link')}
                      >
                        {copiedHistoryId === item.id
                          ? t('admin.deploy.generate.copied')
                          : t('admin.deploy.generate.copy')}
                      </Button>
                      <Button
                        size="xs"
                        variant="secondary"
                        icon={PiArrowSquareOut}
                        onClick={() => handleOpenHistoryCloudFormation(item)}
                        tooltip={t('admin.deploy.history.open_console')}
                      >
                        {t('admin.deploy.history.open')}
                      </Button>
                      <Button
                        size="xs"
                        variant="secondary"
                        icon={PiDownloadSimple}
                        onClick={() => handleDownloadHistoryTemplate(item)}
                        tooltip={t('admin.deploy.history.download')}
                      >
                        {t('admin.deploy.generate.download')}
                      </Button>
                    </Flex>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
            <PiClockCounterClockwise className="mx-auto h-12 w-12 text-gray-400" />
            <Text className="mt-2 text-gray-500">
              {t('admin.deploy.history.no_history')}
            </Text>
          </div>
        )}
      </Card>
    </div>
  );
};

export default DeployParameters;
