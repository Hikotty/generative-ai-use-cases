/**
 * Cost Monitoring Page Component
 *
 * Displays cost statistics with various visualizations.
 *
 * Requirements:
 * - 6.3: Display total cost estimate for the current month
 * - 6.4: Display model-wise cost breakdown in a donut chart
 * - 6.5: Display user-wise cost ranking (top 10)
 * - 6.6: Display daily cost graph for the past 30 days
 * - 6.7: Display weekly cost graph for the past 12 weeks
 * - 6.8: Display monthly cost graph for the past 12 months
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  Title,
  Text,
  DonutChart,
  BarList,
  LineChart,
  BarChart,
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
  PiCurrencyDollar,
  PiChartPie,
  PiChartBar,
  PiChartLine,
  PiUsers,
  PiCalendar,
} from 'react-icons/pi';
import useAdminApi, {
  CostStatisticsResponse,
  ModelCostBreakdown,
  UserCostBreakdown,
  DailyCostData,
} from '../../hooks/useAdminApi';

/**
 * Period type for cost data aggregation
 */
type CostPeriod = 'day' | 'week' | 'month';

/**
 * Format currency value to display string
 */
const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
};

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
 * Total Cost KPI Card Component
 * Requirement 6.3: Display total cost estimate for the current month
 */
interface TotalCostCardProps {
  totalCost: number;
  isLoading: boolean;
  startDate?: string;
  endDate?: string;
}

const TotalCostCard: React.FC<TotalCostCardProps> = ({
  totalCost,
  isLoading,
  startDate,
  endDate,
}) => {
  const { t } = useTranslation();

  return (
    <Card className="mx-auto max-w-lg" decoration="top" decorationColor="blue">
      <Flex justifyContent="start" className="space-x-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
          <PiCurrencyDollar className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <Text>{t('admin.costs.total_cost')}</Text>
          {isLoading ? (
            <div className="mt-1 h-8 w-32 animate-pulse rounded bg-gray-200" />
          ) : (
            <Metric>{formatCurrency(totalCost)}</Metric>
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
 * Model Cost Donut Chart Component
 * Requirement 6.4: Display model-wise cost breakdown in a donut chart
 */
interface ModelCostChartProps {
  data: ModelCostBreakdown[];
  isLoading: boolean;
}

const ModelCostChart: React.FC<ModelCostChartProps> = ({ data, isLoading }) => {
  const { t } = useTranslation();

  const chartData = useMemo(() => {
    return data.map((item, index) => ({
      name: getShortModelName(item.modelId),
      value: item.cost,
      color: getModelColor(index),
    }));
  }, [data]);

  if (isLoading) {
    return (
      <Card>
        <Title>{t('admin.costs.model_breakdown')}</Title>
        <div className="mt-4 flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-aws-smile border-t-transparent" />
        </div>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <Title>{t('admin.costs.model_breakdown')}</Title>
        <div className="mt-4 flex h-64 items-center justify-center text-gray-500">
          {t('admin.costs.no_data')}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <Flex alignItems="start">
        <div>
          <Title>{t('admin.costs.model_breakdown')}</Title>
          <Text>{t('admin.costs.model_breakdown_description')}</Text>
        </div>
        <PiChartPie className="h-6 w-6 text-gray-400" />
      </Flex>
      <DonutChart
        className="mt-6 h-64"
        data={chartData}
        category="value"
        index="name"
        valueFormatter={formatCurrency}
        colors={chartData.map((item) => item.color)}
        showAnimation={true}
      />
      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-2">
        {chartData.map((item, index) => (
          // eslint-disable-next-line @shopify/jsx-no-hardcoded-content
          <Badge key={index} color={item.color as 'blue' | 'cyan' | 'indigo' | 'violet' | 'fuchsia' | 'rose' | 'orange' | 'amber' | 'emerald' | 'teal'}>
            {item.name}: {formatCurrency(item.value)}
          </Badge>
        ))}
      </div>
    </Card>
  );
};

/**
 * User Cost Ranking Component
 * Requirement 6.5: Display user-wise cost ranking (top 10)
 */
interface UserCostRankingProps {
  data: UserCostBreakdown[];
  isLoading: boolean;
}

const UserCostRanking: React.FC<UserCostRankingProps> = ({
  data,
  isLoading,
}) => {
  const { t } = useTranslation();

  const barListData = useMemo(() => {
    // Sort by cost descending and take top 10
    const sorted = [...data].sort((a, b) => b.cost - a.cost).slice(0, 10);
    return sorted.map((item) => ({
      name: item.userId.length > 20 ? `${item.userId.substring(0, 20)}...` : item.userId,
      value: item.cost,
      href: undefined,
    }));
  }, [data]);

  if (isLoading) {
    return (
      <Card>
        <Title>{t('admin.costs.user_ranking')}</Title>
        <div className="mt-4 flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-aws-smile border-t-transparent" />
        </div>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <Title>{t('admin.costs.user_ranking')}</Title>
        <div className="mt-4 flex h-64 items-center justify-center text-gray-500">
          {t('admin.costs.no_data')}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <Flex alignItems="start">
        <div>
          <Title>{t('admin.costs.user_ranking')}</Title>
          <Text>{t('admin.costs.user_ranking_description')}</Text>
        </div>
        <PiUsers className="h-6 w-6 text-gray-400" />
      </Flex>
      <BarList
        data={barListData}
        className="mt-6"
        valueFormatter={formatCurrency}
        color="blue"
      />
    </Card>
  );
};

/**
 * Daily Cost Line Chart Component
 * Requirement 6.6: Display daily cost graph for the past 30 days
 */
interface DailyCostChartProps {
  data: DailyCostData[];
  isLoading: boolean;
}

const DailyCostChart: React.FC<DailyCostChartProps> = ({ data, isLoading }) => {
  const { t } = useTranslation();

  const chartData = useMemo(() => {
    return data.map((item) => ({
      date: item.date,
      [t('admin.costs.cost')]: item.cost,
    }));
  }, [data, t]);

  if (isLoading) {
    return (
      <Card>
        <Title>{t('admin.costs.daily_cost')}</Title>
        <div className="mt-4 flex h-72 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-aws-smile border-t-transparent" />
        </div>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <Title>{t('admin.costs.daily_cost')}</Title>
        <div className="mt-4 flex h-72 items-center justify-center text-gray-500">
          {t('admin.costs.no_data')}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <Flex alignItems="start">
        <div>
          <Title>{t('admin.costs.daily_cost')}</Title>
          <Text>{t('admin.costs.daily_cost_description')}</Text>
        </div>
        <PiChartLine className="h-6 w-6 text-gray-400" />
      </Flex>
      <LineChart
        className="mt-6 h-72"
        data={chartData}
        index="date"
        categories={[t('admin.costs.cost')]}
        colors={['blue']}
        valueFormatter={formatCurrency}
        showAnimation={true}
        curveType="monotone"
      />
    </Card>
  );
};

/**
 * Weekly/Monthly Cost Bar Chart Component
 * Requirements 6.7, 6.8: Display weekly/monthly cost graphs
 */
interface PeriodCostChartProps {
  data: DailyCostData[];
  period: 'week' | 'month';
  isLoading: boolean;
}

const PeriodCostChart: React.FC<PeriodCostChartProps> = ({
  data,
  period,
  isLoading,
}) => {
  const { t } = useTranslation();

  const title =
    period === 'week'
      ? t('admin.costs.weekly_cost')
      : t('admin.costs.monthly_cost');
  const description =
    period === 'week'
      ? t('admin.costs.weekly_cost_description')
      : t('admin.costs.monthly_cost_description');

  const chartData = useMemo(() => {
    return data.map((item) => ({
      date: item.date,
      [t('admin.costs.cost')]: item.cost,
    }));
  }, [data, t]);

  if (isLoading) {
    return (
      <Card>
        <Title>{title}</Title>
        <div className="mt-4 flex h-72 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-aws-smile border-t-transparent" />
        </div>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <Title>{title}</Title>
        <div className="mt-4 flex h-72 items-center justify-center text-gray-500">
          {t('admin.costs.no_data')}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <Flex alignItems="start">
        <div>
          <Title>{title}</Title>
          <Text>{description}</Text>
        </div>
        <PiChartBar className="h-6 w-6 text-gray-400" />
      </Flex>
      <BarChart
        className="mt-6 h-72"
        data={chartData}
        index="date"
        categories={[t('admin.costs.cost')]}
        colors={['blue']}
        valueFormatter={formatCurrency}
        showAnimation={true}
      />
    </Card>
  );
};

/**
 * Model Statistics Table Component
 * Shows detailed model usage statistics
 */
interface ModelStatsTableProps {
  data: ModelCostBreakdown[];
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
        <Title>{t('admin.costs.model_stats')}</Title>
        <div className="mt-4 flex h-48 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-aws-smile border-t-transparent" />
        </div>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <Title>{t('admin.costs.model_stats')}</Title>
        <div className="mt-4 flex h-48 items-center justify-center text-gray-500">
          {t('admin.costs.no_data')}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <Title>{t('admin.costs.model_stats')}</Title>
      <Text>{t('admin.costs.model_stats_description')}</Text>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                {t('admin.costs.table.model')}
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                {t('admin.costs.table.cost')}
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                {t('admin.costs.table.input_tokens')}
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                {t('admin.costs.table.output_tokens')}
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                {t('admin.costs.table.requests')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {data.map((item, index) => (
              <tr key={index} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                  {getShortModelName(item.modelId)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-500">
                  {formatCurrency(item.cost)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-500">
                  {formatNumber(item.inputTokens)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-500">
                  {formatNumber(item.outputTokens)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-500">
                  {formatNumber(item.requestCount)}
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
 * Main CostMonitoring page component
 */
const CostMonitoring: React.FC = () => {
  const { t } = useTranslation();
  const adminApi = useAdminApi();

  // Period selection state
  const [selectedPeriod, setSelectedPeriod] = useState<CostPeriod>('month');

  // Fetch cost data with SWR
  const { data, error, isLoading } = adminApi.getCosts(
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
    setSelectedPeriod(value as CostPeriod);
  }, []);

  // Extract data from response
  const costData: CostStatisticsResponse | undefined = data;
  const totalCost = costData?.totalCost ?? 0;
  const modelBreakdown = costData?.byModel ?? [];
  const userBreakdown = costData?.byUser ?? [];
  const dailyCosts = costData?.dailyCosts ?? [];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t('admin.costs.title')}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {t('admin.costs.description')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PiCalendar className="h-5 w-5 text-gray-400" />
          <Select
            value={selectedPeriod}
            onValueChange={handlePeriodChange}
            className="w-40">
            <SelectItem value="day">{t('admin.costs.period.day')}</SelectItem>
            <SelectItem value="week">{t('admin.costs.period.week')}</SelectItem>
            <SelectItem value="month">
              {t('admin.costs.period.month')}
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

      {/* Total Cost KPI Card */}
      <TotalCostCard
        totalCost={totalCost}
        isLoading={isLoading}
        startDate={costData?.startDate}
        endDate={costData?.endDate}
      />

      {/* Charts Grid */}
      <Grid numItemsMd={2} className="gap-6">
        {/* Model Cost Donut Chart */}
        <ModelCostChart data={modelBreakdown} isLoading={isLoading} />

        {/* User Cost Ranking */}
        <UserCostRanking data={userBreakdown} isLoading={isLoading} />
      </Grid>

      {/* Time-based Cost Charts */}
      <TabGroup>
        <TabList variant="solid">
          <Tab icon={PiChartLine}>{t('admin.costs.tabs.daily')}</Tab>
          <Tab icon={PiChartBar}>{t('admin.costs.tabs.weekly')}</Tab>
          <Tab icon={PiChartBar}>{t('admin.costs.tabs.monthly')}</Tab>
        </TabList>
        <TabPanels>
          {/* Daily Cost Chart */}
          <TabPanel>
            <div className="mt-4">
              <DailyCostChart data={dailyCosts} isLoading={isLoading} />
            </div>
          </TabPanel>

          {/* Weekly Cost Chart */}
          <TabPanel>
            <div className="mt-4">
              <PeriodCostChart
                data={dailyCosts}
                period="week"
                isLoading={isLoading}
              />
            </div>
          </TabPanel>

          {/* Monthly Cost Chart */}
          <TabPanel>
            <div className="mt-4">
              <PeriodCostChart
                data={dailyCosts}
                period="month"
                isLoading={isLoading}
              />
            </div>
          </TabPanel>
        </TabPanels>
      </TabGroup>

      {/* Model Statistics Table */}
      <ModelStatsTable data={modelBreakdown} isLoading={isLoading} />
    </div>
  );
};

export default CostMonitoring;
