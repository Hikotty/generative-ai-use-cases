/**
 * Usage Statistics Page Component
 *
 * Displays usage statistics with various visualizations.
 *
 * Requirements:
 * - 7.2: Display active users count for the current month
 * - 7.3: Display total questions count for the current month
 * - 7.4: Display popular models ranking
 * - 7.5: Display use case frequency breakdown
 * - 7.6: Display user behavior analysis table
 * - 7.7: Display user daily usage frequency graph
 * - 7.8: Display user model usage pie chart
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  Title,
  Text,
  BarList,
  DonutChart,
  Tab,
  TabGroup,
  TabList,
  TabPanel,
  TabPanels,
  Select,
  SelectItem,
  Metric,
  Flex,
  Grid,
  Badge,
} from '@tremor/react';
import {
  PiUsers,
  PiChatCircle,
  PiChartBar,
  PiChartPie,
  PiRobot,
  PiCalendar,
  PiTrendUp,
} from 'react-icons/pi';
import useAdminApi, {
  UsageStatisticsResponse,
  ModelUsageStats,
  UseCaseUsageStats,
} from '../../hooks/useAdminApi';

/**
 * Period type for stats data aggregation
 */
type StatsPeriod = 'day' | 'week' | 'month';

/**
 * Format large numbers with abbreviations
 */
const formatNumber = (value: number): string => {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(2)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)}K`;
  }
  return value.toLocaleString();
};

/**
 * Get a color for each model based on index
 */
const getModelColor = (index: number): string => {
  const colors = [
    'blue',
    'cyan',
    'indigo',
    'violet',
    'fuchsia',
    'rose',
    'orange',
    'amber',
    'emerald',
    'teal',
  ];
  return colors[index % colors.length];
};

/**
 * Get a color for each use case based on index
 */
const getUseCaseColor = (index: number): string => {
  const colors = [
    'emerald',
    'teal',
    'cyan',
    'blue',
    'indigo',
    'violet',
    'fuchsia',
    'rose',
    'orange',
    'amber',
  ];
  return colors[index % colors.length];
};

/**
 * Extract short model name from full model ID
 */
const getShortModelName = (modelId: string): string => {
  // Extract the model name from IDs like "anthropic.claude-sonnet-4-5"
  const parts = modelId.split('.');
  if (parts.length > 1) {
    return parts[parts.length - 1];
  }
  return modelId;
};

/**
 * Active Users KPI Card Component
 * Requirement 7.2: Display active users count for the current month
 */
interface ActiveUsersCardProps {
  activeUsers: number;
  isLoading: boolean;
  startDate?: string;
  endDate?: string;
}

const ActiveUsersCard: React.FC<ActiveUsersCardProps> = ({
  activeUsers,
  isLoading,
  startDate,
  endDate,
}) => {
  const { t } = useTranslation();

  return (
    <Card className="mx-auto" decoration="top" decorationColor="emerald">
      <Flex justifyContent="start" className="space-x-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
          <PiUsers className="h-6 w-6 text-emerald-600" />
        </div>
        <div>
          <Text>{t('admin.stats.active_users')}</Text>
          {isLoading ? (
            <div className="mt-1 h-8 w-32 animate-pulse rounded bg-gray-200" />
          ) : (
            <Metric>{formatNumber(activeUsers)}</Metric>
          )}
          {startDate && endDate && (
            // eslint-disable-next-line @shopify/jsx-no-hardcoded-content
            <Text className="mt-1 text-xs text-gray-500">
              {startDate} ~ {endDate}
            </Text>
          )}
        </div>
      </Flex>
    </Card>
  );
};

/**
 * Total Questions KPI Card Component
 * Requirement 7.3: Display total questions count for the current month
 */
interface TotalQuestionsCardProps {
  totalQuestions: number;
  isLoading: boolean;
  startDate?: string;
  endDate?: string;
}

const TotalQuestionsCard: React.FC<TotalQuestionsCardProps> = ({
  totalQuestions,
  isLoading,
  startDate,
  endDate,
}) => {
  const { t } = useTranslation();

  return (
    <Card className="mx-auto" decoration="top" decorationColor="blue">
      <Flex justifyContent="start" className="space-x-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
          <PiChatCircle className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <Text>{t('admin.stats.total_questions')}</Text>
          {isLoading ? (
            <div className="mt-1 h-8 w-32 animate-pulse rounded bg-gray-200" />
          ) : (
            <Metric>{formatNumber(totalQuestions)}</Metric>
          )}
          {startDate && endDate && (
            // eslint-disable-next-line @shopify/jsx-no-hardcoded-content
            <Text className="mt-1 text-xs text-gray-500">
              {startDate} ~ {endDate}
            </Text>
          )}
        </div>
      </Flex>
    </Card>
  );
};

/**
 * Popular Models Ranking Component
 * Requirement 7.4: Display popular models ranking
 */
interface PopularModelsRankingProps {
  data: ModelUsageStats[];
  isLoading: boolean;
}

const PopularModelsRanking: React.FC<PopularModelsRankingProps> = ({
  data,
  isLoading,
}) => {
  const { t } = useTranslation();

  const barListData = useMemo(() => {
    // Sort by request count descending
    const sorted = [...data].sort((a, b) => b.requestCount - a.requestCount);
    return sorted.map((item) => ({
      name: getShortModelName(item.modelId),
      value: item.requestCount,
      href: undefined,
    }));
  }, [data]);

  const chartData = useMemo(() => {
    return data.map((item, index) => ({
      name: getShortModelName(item.modelId),
      value: item.requestCount,
      color: getModelColor(index),
    }));
  }, [data]);

  if (isLoading) {
    return (
      <Card>
        <Title>{t('admin.stats.popular_models')}</Title>
        <div className="mt-4 flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-aws-smile border-t-transparent" />
        </div>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <Title>{t('admin.stats.popular_models')}</Title>
        <div className="mt-4 flex h-64 items-center justify-center text-gray-500">
          {t('admin.stats.no_data')}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <Flex alignItems="start">
        <div>
          <Title>{t('admin.stats.popular_models')}</Title>
          <Text>{t('admin.stats.popular_models_description')}</Text>
        </div>
        <PiRobot className="h-6 w-6 text-gray-400" />
      </Flex>
      <DonutChart
        className="mt-6 h-48"
        data={chartData}
        category="value"
        index="name"
        valueFormatter={formatNumber}
        colors={chartData.map((item) => item.color)}
        showAnimation={true}
      />
      <div className="mt-4">
        <BarList
          data={barListData}
          valueFormatter={formatNumber}
          color="blue"
        />
      </div>
    </Card>
  );
};

/**
 * Use Case Frequency Component
 * Requirement 7.5: Display use case frequency breakdown
 */
interface UseCaseFrequencyProps {
  data: UseCaseUsageStats[];
  isLoading: boolean;
}

const UseCaseFrequency: React.FC<UseCaseFrequencyProps> = ({
  data,
  isLoading,
}) => {
  const { t } = useTranslation();

  const barListData = useMemo(() => {
    // Sort by request count descending
    const sorted = [...data].sort((a, b) => b.requestCount - a.requestCount);
    return sorted.map((item) => ({
      name: item.usecase || t('admin.stats.unknown_usecase'),
      value: item.requestCount,
      href: undefined,
    }));
  }, [data, t]);

  const chartData = useMemo(() => {
    return data.map((item, index) => ({
      name: item.usecase || t('admin.stats.unknown_usecase'),
      value: item.requestCount,
      color: getUseCaseColor(index),
    }));
  }, [data, t]);

  if (isLoading) {
    return (
      <Card>
        <Title>{t('admin.stats.usecase_frequency')}</Title>
        <div className="mt-4 flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-aws-smile border-t-transparent" />
        </div>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <Title>{t('admin.stats.usecase_frequency')}</Title>
        <div className="mt-4 flex h-64 items-center justify-center text-gray-500">
          {t('admin.stats.no_data')}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <Flex alignItems="start">
        <div>
          <Title>{t('admin.stats.usecase_frequency')}</Title>
          <Text>{t('admin.stats.usecase_frequency_description')}</Text>
        </div>
        <PiChartBar className="h-6 w-6 text-gray-400" />
      </Flex>
      <DonutChart
        className="mt-6 h-48"
        data={chartData}
        category="value"
        index="name"
        valueFormatter={formatNumber}
        colors={chartData.map((item) => item.color)}
        showAnimation={true}
      />
      <div className="mt-4">
        <BarList
          data={barListData}
          valueFormatter={formatNumber}
          color="emerald"
        />
      </div>
    </Card>
  );
};

/**
 * Model Usage Statistics Table Component
 * Shows detailed model usage statistics
 */
interface ModelStatsTableProps {
  data: ModelUsageStats[];
  isLoading: boolean;
}

const ModelStatsTable: React.FC<ModelStatsTableProps> = ({
  data,
  isLoading,
}) => {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <Card>
        <Title>{t('admin.stats.model_stats')}</Title>
        <div className="mt-4 flex h-48 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-aws-smile border-t-transparent" />
        </div>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <Title>{t('admin.stats.model_stats')}</Title>
        <div className="mt-4 flex h-48 items-center justify-center text-gray-500">
          {t('admin.stats.no_data')}
        </div>
      </Card>
    );
  }

  // Sort by request count descending
  const sortedData = [...data].sort((a, b) => b.requestCount - a.requestCount);

  return (
    <Card>
      <Flex alignItems="start">
        <div>
          <Title>{t('admin.stats.model_stats')}</Title>
          <Text>{t('admin.stats.model_stats_description')}</Text>
        </div>
        <PiTrendUp className="h-6 w-6 text-gray-400" />
      </Flex>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                {t('admin.stats.table.rank')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                {t('admin.stats.table.model')}
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                {t('admin.stats.table.requests')}
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                {t('admin.stats.table.total_tokens')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {sortedData.map((item, index) => (
              <tr key={index} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                  {/* eslint-disable-next-line @shopify/jsx-no-hardcoded-content */}
                  <Badge color={index < 3 ? 'emerald' : 'gray'}>
                    #{index + 1}
                  </Badge>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                  {getShortModelName(item.modelId)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-500">
                  {formatNumber(item.requestCount)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-500">
                  {formatNumber(item.totalTokens)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

/**
 * Use Case Statistics Table Component
 * Shows detailed use case statistics
 */
interface UseCaseStatsTableProps {
  data: UseCaseUsageStats[];
  isLoading: boolean;
}

const UseCaseStatsTable: React.FC<UseCaseStatsTableProps> = ({
  data,
  isLoading,
}) => {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <Card>
        <Title>{t('admin.stats.usecase_stats')}</Title>
        <div className="mt-4 flex h-48 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-aws-smile border-t-transparent" />
        </div>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <Title>{t('admin.stats.usecase_stats')}</Title>
        <div className="mt-4 flex h-48 items-center justify-center text-gray-500">
          {t('admin.stats.no_data')}
        </div>
      </Card>
    );
  }

  // Sort by request count descending
  const sortedData = [...data].sort((a, b) => b.requestCount - a.requestCount);

  // Calculate total for percentage
  const total = sortedData.reduce((sum, item) => sum + item.requestCount, 0);

  return (
    <Card>
      <Flex alignItems="start">
        <div>
          <Title>{t('admin.stats.usecase_stats')}</Title>
          <Text>{t('admin.stats.usecase_stats_description')}</Text>
        </div>
        <PiChartPie className="h-6 w-6 text-gray-400" />
      </Flex>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                {t('admin.stats.table.rank')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                {t('admin.stats.table.usecase')}
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                {t('admin.stats.table.requests')}
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                {t('admin.stats.table.percentage')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {sortedData.map((item, index) => (
              <tr key={index} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                  {/* eslint-disable-next-line @shopify/jsx-no-hardcoded-content */}
                  <Badge color={index < 3 ? 'emerald' : 'gray'}>
                    #{index + 1}
                  </Badge>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                  {item.usecase || t('admin.stats.unknown_usecase')}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-500">
                  {formatNumber(item.requestCount)}
                </td>
                {/* eslint-disable-next-line @shopify/jsx-no-hardcoded-content */}
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-500">
                  {total > 0 ? ((item.requestCount / total) * 100).toFixed(1) : 0}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

/**
 * Main UsageStatistics page component
 */
const UsageStatistics: React.FC = () => {
  const { t } = useTranslation();
  const adminApi = useAdminApi();

  // Period selection state
  const [selectedPeriod, setSelectedPeriod] = useState<StatsPeriod>('month');

  // Fetch stats data with SWR
  const { data, error, isLoading } = adminApi.getStats(
    {
      period: selectedPeriod,
    },
    {
      revalidateOnFocus: false,
      keepPreviousData: true,
    }
  );

  // Handle period change
  const handlePeriodChange = useCallback((value: string) => {
    setSelectedPeriod(value as StatsPeriod);
  }, []);

  // Extract data from response
  const statsData: UsageStatisticsResponse | undefined = data;
  const activeUsers = statsData?.activeUsers ?? 0;
  const totalQuestions = statsData?.totalQuestions ?? 0;
  const popularModels = statsData?.popularModels ?? [];
  const useCaseFrequency = statsData?.useCaseFrequency ?? [];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t('admin.stats.title')}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {t('admin.stats.description')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PiCalendar className="h-5 w-5 text-gray-400" />
          <Select
            value={selectedPeriod}
            onValueChange={handlePeriodChange}
            className="w-40">
            <SelectItem value="day">{t('admin.stats.period.day')}</SelectItem>
            <SelectItem value="week">{t('admin.stats.period.week')}</SelectItem>
            <SelectItem value="month">
              {t('admin.stats.period.month')}
            </SelectItem>
          </Select>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <p className="text-red-700">{adminApi.getErrorMessage(error)}</p>
        </Card>
      )}

      {/* KPI Cards */}
      <Grid numItemsMd={2} className="gap-6">
        {/* Active Users KPI Card */}
        <ActiveUsersCard
          activeUsers={activeUsers}
          isLoading={isLoading}
          startDate={statsData?.startDate}
          endDate={statsData?.endDate}
        />

        {/* Total Questions KPI Card */}
        <TotalQuestionsCard
          totalQuestions={totalQuestions}
          isLoading={isLoading}
          startDate={statsData?.startDate}
          endDate={statsData?.endDate}
        />
      </Grid>

      {/* Charts Grid */}
      <Grid numItemsMd={2} className="gap-6">
        {/* Popular Models Ranking */}
        <PopularModelsRanking data={popularModels} isLoading={isLoading} />

        {/* Use Case Frequency */}
        <UseCaseFrequency data={useCaseFrequency} isLoading={isLoading} />
      </Grid>

      {/* Detailed Statistics Tables */}
      <TabGroup>
        <TabList variant="solid">
          <Tab icon={PiRobot}>{t('admin.stats.tabs.models')}</Tab>
          <Tab icon={PiChartBar}>{t('admin.stats.tabs.usecases')}</Tab>
        </TabList>
        <TabPanels>
          {/* Model Statistics Table */}
          <TabPanel>
            <div className="mt-4">
              <ModelStatsTable data={popularModels} isLoading={isLoading} />
            </div>
          </TabPanel>

          {/* Use Case Statistics Table */}
          <TabPanel>
            <div className="mt-4">
              <UseCaseStatsTable data={useCaseFrequency} isLoading={isLoading} />
            </div>
          </TabPanel>
        </TabPanels>
      </TabGroup>
    </div>
  );
};

export default UsageStatistics;
