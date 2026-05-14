import {
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  Icon,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useColorModeValue,
} from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";
import {
  MdBarChart,
  MdCheckCircle,
  MdGroups,
  MdHourglassTop,
  MdLogin,
  MdNetworkCheck,
} from "react-icons/md";
import Card from "components/card/Card";
import MiniStatistics from "components/card/MiniStatistics";
import IconBox from "components/icons/IconBox";
import LineChart from "components/charts/LineChart";
import BarChart from "components/charts/BarChart";
import { postJson } from "api";

const RANGE_OPTIONS = [
  { value: "today", label: "Сегодня" },
  { value: "7d", label: "7 дней" },
  { value: "30d", label: "30 дней" },
  { value: "all", label: "Все время" },
];

const EMPTY_ANALYTICS = {
  meta: {
    range: "today",
    cachedAt: "",
  },
  series: {
    newPlayers: [],
    totalPlayers: [],
    sessionsStarted: [],
    sessionsFinished: [],
  },
  summary: {
    totalPlayersCount: 0,
    newPlayersCount: 0,
    sessionsStartedCount: 0,
    finishedSessionsCount: 0,
    playersWithFinishedGameCount: 0,
    currentlyOnlinePlayersCount: 0,
    averageCompletionSeconds: 0,
    averageFoundSneakersCount: 0,
    referralsInPeriodCount: 0,
    totalReferredPlayersCount: 0,
  },
  recentSessions: [],
};

function formatNumber(value) {
  return new Intl.NumberFormat("ru-RU").format(Number(value) || 0);
}

function formatDateTime(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString("ru-RU");
}

function formatDuration(seconds) {
  const safeSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const restSeconds = safeSeconds % 60;

  if (!safeSeconds) {
    return "0с";
  }

  if (minutes > 0) {
    return `${minutes}м ${restSeconds}с`;
  }

  return `${restSeconds}с`;
}

function getSessionStatusLabel(status) {
  if (status === "active") {
    return "Активна";
  }

  if (status === "paused") {
    return "Пауза";
  }

  if (status === "finished") {
    return "Завершена";
  }

  if (status === "expired") {
    return "Истекла";
  }

  return status || "—";
}

function buildLineChartOptions(categories, color, gridColor, labelColor) {
  return {
    chart: {
      toolbar: {
        show: false,
      },
      zoom: {
        enabled: false,
      },
      foreColor: labelColor,
    },
    colors: [color],
    stroke: {
      curve: "smooth",
      width: 4,
      colors: [color],
    },
    dataLabels: {
      enabled: false,
    },
    markers: {
      size: 0,
      hover: {
        size: 5,
      },
    },
    xaxis: {
      categories,
      axisBorder: {
        show: false,
      },
      axisTicks: {
        show: false,
      },
      labels: {
        style: {
          colors: categories.map(() => labelColor),
          fontSize: "12px",
          fontWeight: 500,
        },
      },
    },
    yaxis: {
      labels: {
        style: {
          colors: Array.from({ length: 8 }, () => labelColor),
          fontSize: "12px",
          fontWeight: 500,
        },
      },
    },
    grid: {
      borderColor: gridColor,
      strokeDashArray: 5,
      yaxis: {
        lines: {
          show: true,
        },
      },
      xaxis: {
        lines: {
          show: false,
        },
      },
    },
    tooltip: {
      theme: "dark",
    },
    fill: {
      type: "solid",
      opacity: 0,
    },
    legend: {
      show: false,
    },
    responsive: [
      {
        breakpoint: 480,
        options: {
          xaxis: {
            labels: {
              style: {
                fontSize: "9px",
              },
            },
          },
          yaxis: {
            labels: {
              style: {
                fontSize: "10px",
              },
            },
          },
        },
      },
    ],
  };
}

function buildBarChartOptions(categories, colors, gridColor, labelColor) {
  return {
    chart: {
      stacked: false,
      toolbar: {
        show: false,
      },
      foreColor: labelColor,
    },
    colors,
    dataLabels: {
      enabled: false,
    },
    plotOptions: {
      bar: {
        borderRadius: 10,
        columnWidth: "44%",
      },
    },
    xaxis: {
      categories,
      axisBorder: {
        show: false,
      },
      axisTicks: {
        show: false,
      },
      labels: {
        style: {
          colors: categories.map(() => labelColor),
          fontSize: "12px",
          fontWeight: 500,
        },
      },
    },
    yaxis: {
      labels: {
        style: {
          colors: Array.from({ length: 8 }, () => labelColor),
          fontSize: "12px",
          fontWeight: 500,
        },
      },
    },
    grid: {
      borderColor: gridColor,
      strokeDashArray: 5,
      yaxis: {
        lines: {
          show: true,
        },
      },
      xaxis: {
        lines: {
          show: false,
        },
      },
    },
    tooltip: {
      theme: "dark",
    },
    legend: {
      show: false,
    },
    responsive: [
      {
        breakpoint: 480,
        options: {
          xaxis: {
            labels: {
              style: {
                fontSize: "9px",
              },
            },
          },
          yaxis: {
            labels: {
              style: {
                fontSize: "10px",
              },
            },
          },
        },
      },
    ],
  };
}

function AnalyticsMetricList({ title, rows }) {
  const borderColor = useColorModeValue("gray.200", "whiteAlpha.100");
  const labelColor = useColorModeValue("secondaryGray.600", "secondaryGray.500");
  const valueColor = useColorModeValue("navy.700", "white");

  return (
    <Card p={{ base: "18px", md: "24px" }}>
      <Text color={valueColor} fontSize={{ base: "lg", md: "xl" }} fontWeight="700" mb="18px">
        {title}
      </Text>
      <Stack spacing="14px">
        {rows.map((row, index) => (
          <Flex
            key={row.key}
            align="start"
            borderTop={index === 0 ? "none" : "1px solid"}
            borderColor={borderColor}
            pt={index === 0 ? "0px" : "14px"}
            justify="space-between"
            gap="16px"
          >
            <Box>
              <Text color={labelColor} fontSize="sm" fontWeight="500">
                {row.label}
              </Text>
              {row.subtext ? (
                <Text color={labelColor} fontSize="xs" mt="4px">
                  {row.subtext}
                </Text>
              ) : null}
            </Box>
            <Text color={valueColor} fontSize={{ base: "md", md: "lg" }} fontWeight="700" textAlign="right">
              {row.value}
            </Text>
          </Flex>
        ))}
      </Stack>
    </Card>
  );
}

function AnalyticsChartCard({
  title,
  subtitle,
  value,
  chartType,
  points,
  primaryColor,
  secondaryColor,
}) {
  const titleColor = useColorModeValue("navy.700", "white");
  const labelColor = useColorModeValue("secondaryGray.600", "rgba(255, 255, 255, 0.86)");
  const gridColor = useColorModeValue("rgba(224, 229, 242, 0.9)", "rgba(255, 255, 255, 0.16)");
  const lineColor = useColorModeValue("rgba(15, 23, 42, 0.92)", "rgba(255, 255, 255, 0.96)");
  const barColors = useColorModeValue(
    [primaryColor, secondaryColor].filter(Boolean),
    ["rgba(255, 255, 255, 0.96)"]
  );
  const valueBadgeBg = useColorModeValue("secondaryGray.300", "rgba(255, 255, 255, 0.94)");
  const valueBadgeColor = useColorModeValue("navy.700", "navy.700");
  const categories = points.map((point) => point.label);

  const chartData = useMemo(() => {
    if (chartType === "bar") {
      return [
        {
          name: title,
          data: points.map((point) => Number(point.value || 0)),
        },
      ];
    }

    return [
      {
        name: title,
        data: points.map((point) => Number(point.value || 0)),
      },
    ];
  }, [chartType, points, title]);

  const chartOptions = useMemo(() => {
    if (chartType === "bar") {
      return buildBarChartOptions(categories, barColors, gridColor, labelColor);
    }

    return buildLineChartOptions(categories, lineColor, gridColor, labelColor);
  }, [barColors, categories, chartType, gridColor, labelColor, lineColor]);

  return (
    <Card p={{ base: "18px", md: "24px" }}>
      <Flex align="start" justify="space-between" mb="18px" gap="16px" direction={{ base: "column", sm: "row" }}>
        <Box>
          <Text color={titleColor} fontSize={{ base: "lg", md: "xl" }} fontWeight="700">
            {title}
          </Text>
          <Text color={labelColor} fontSize="sm" mt="4px">
            {subtitle}
          </Text>
        </Box>
        <Badge
          bg={valueBadgeBg}
          borderRadius="999px"
          color={valueBadgeColor}
          fontSize="sm"
          px="12px"
          py="8px"
        >
          {value}
        </Badge>
      </Flex>
      <Box h={{ base: "220px", md: "260px" }}>
        {chartType === "bar" ? (
          <BarChart chartData={chartData} chartOptions={chartOptions} />
        ) : (
          <LineChart chartData={chartData} chartOptions={chartOptions} />
        )}
      </Box>
    </Card>
  );
}

export default function AnalyticsPage() {
  const [selectedRange, setSelectedRange] = useState("today");
  const [analytics, setAnalytics] = useState(EMPTY_ANALYTICS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const brandColor = useColorModeValue("brand.500", "white");
  const boxBg = useColorModeValue("secondaryGray.300", "whiteAlpha.100");
  const textColor = useColorModeValue("navy.700", "white");
  const textColorSecondary = useColorModeValue("secondaryGray.600", "secondaryGray.500");
  const borderColor = useColorModeValue("gray.200", "whiteAlpha.100");
  const toolbarControlBg = useColorModeValue("white", "rgba(255, 255, 255, 0.94)");
  const toolbarControlText = useColorModeValue("navy.700", "navy.700");
  const toolbarControlHoverBg = useColorModeValue("secondaryGray.300", "rgba(255, 255, 255, 0.88)");
  const toolbarControlShadow = useColorModeValue(
    "0px 16px 36px rgba(112, 144, 176, 0.12)",
    "0px 16px 36px rgba(17, 28, 68, 0.32)"
  );
  const chartOrange = useColorModeValue("orange.500", "orange.500");
  const chartGreen = useColorModeValue("green.500", "green.500");
  const chartBlue = useColorModeValue("blue.500", "blue.500");

  useEffect(() => {
    let cancelled = false;

    async function loadAnalytics() {
      setLoading(true);
      setError("");

      try {
        const response = await postJson("/api/analytics/overview", {
          range: selectedRange,
        });

        if (cancelled) {
          return;
        }

        setAnalytics({
          meta: response?.meta || EMPTY_ANALYTICS.meta,
          series: {
            ...EMPTY_ANALYTICS.series,
            ...(response?.series || {}),
          },
          summary: {
            ...EMPTY_ANALYTICS.summary,
            ...(response?.summary || {}),
          },
          recentSessions: Array.isArray(response?.recentSessions) ? response.recentSessions : [],
        });
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message || "Не удалось загрузить аналитику");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadAnalytics();

    return () => {
      cancelled = true;
    };
  }, [selectedRange]);

  async function handleRefresh() {
    setRefreshing(true);
    setError("");

    try {
      const response = await postJson("/api/analytics/overview", {
        range: selectedRange,
        refresh: true,
      });

      setAnalytics({
        meta: response?.meta || EMPTY_ANALYTICS.meta,
        series: {
          ...EMPTY_ANALYTICS.series,
          ...(response?.series || {}),
        },
        summary: {
          ...EMPTY_ANALYTICS.summary,
          ...(response?.summary || {}),
        },
        recentSessions: Array.isArray(response?.recentSessions) ? response.recentSessions : [],
      });
    } catch (requestError) {
      setError(requestError.message || "Не удалось обновить аналитику");
    } finally {
      setRefreshing(false);
    }
  }

  const summary = analytics.summary;
  const kpiRows = useMemo(() => ([
    {
      key: "totalPlayersCount",
      label: "Всего игроков",
      value: formatNumber(summary.totalPlayersCount),
    },
    {
      key: "newPlayersCount",
      label: "Новых за период",
      value: formatNumber(summary.newPlayersCount),
    },
    {
      key: "sessionsStartedCount",
      label: "Стартов игры",
      value: formatNumber(summary.sessionsStartedCount),
    },
    {
      key: "finishedSessionsCount",
      label: "Завершенных игр",
      value: formatNumber(summary.finishedSessionsCount),
    },
    {
      key: "playersWithFinishedGameCount",
      label: "Игроков с финишем",
      value: formatNumber(summary.playersWithFinishedGameCount),
    },
    {
      key: "currentlyOnlinePlayersCount",
      label: "Онлайн сейчас",
      value: formatNumber(summary.currentlyOnlinePlayersCount),
    },
  ]), [summary]);

  const gameRows = useMemo(() => ([
    {
      key: "averageCompletionSeconds",
      label: "Среднее время финиша",
      value: formatDuration(summary.averageCompletionSeconds),
    },
    {
      key: "averageFoundSneakersCount",
      label: "Среднее найдено пар",
      value: formatNumber(summary.averageFoundSneakersCount),
      subtext: "По всем игровым сессиям за выбранный период",
    },
    {
      key: "referralsInPeriodCount",
      label: "Реферальных входов за период",
      value: formatNumber(summary.referralsInPeriodCount),
    },
    {
      key: "totalReferredPlayersCount",
      label: "Игроков с рефералом",
      value: formatNumber(summary.totalReferredPlayersCount),
    },
  ]), [summary]);

  const statCards = useMemo(() => ([
    {
      key: "totalPlayersCount",
      label: "Всего игроков",
      value: formatNumber(summary.totalPlayersCount),
      icon: MdGroups,
    },
    {
      key: "newPlayersCount",
      label: "Новых за период",
      value: formatNumber(summary.newPlayersCount),
      icon: MdLogin,
    },
    {
      key: "finishedSessionsCount",
      label: "Финишей",
      value: formatNumber(summary.finishedSessionsCount),
      icon: MdCheckCircle,
    },
    {
      key: "currentlyOnlinePlayersCount",
      label: "Онлайн сейчас",
      value: formatNumber(summary.currentlyOnlinePlayersCount),
      icon: MdNetworkCheck,
    },
    {
      key: "averageCompletionSeconds",
      label: "Среднее время",
      value: formatDuration(summary.averageCompletionSeconds),
      icon: MdHourglassTop,
    },
    {
      key: "sessionsStartedCount",
      label: "Старты игры",
      value: formatNumber(summary.sessionsStartedCount),
      icon: MdBarChart,
    },
  ]), [summary]);

  const updatedAtLabel = analytics.meta?.cachedAt
    ? formatDateTime(analytics.meta.cachedAt)
    : "—";

  return (
    <Box pt={{ base: "0px", md: "80px", xl: "80px" }}>
      <Flex justify="space-between" align={{ base: "start", lg: "center" }} direction={{ base: "column", lg: "row" }} gap="16px" mb="20px">
        <Box display={{ base: "block", md: "none" }} w="100%">
          <Select
            h="56px"
            bg={toolbarControlBg}
            color={toolbarControlText}
            borderColor="transparent"
            borderRadius="20px"
            boxShadow={toolbarControlShadow}
            fontSize="sm"
            fontWeight="700"
            value={selectedRange}
            onChange={(event) => setSelectedRange(event.target.value)}
            _hover={{ borderColor: "transparent" }}
            _focusVisible={{
              borderColor: "brand.200",
              boxShadow: `0 0 0 1px var(--chakra-colors-brand-200), ${toolbarControlShadow}`,
            }}
          >
            {RANGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Box>

        <HStack spacing="12px" flexWrap="wrap" w={{ base: "100%", lg: "auto" }} display={{ base: "none", md: "flex" }}>
          {RANGE_OPTIONS.map((option) => (
            <Button
              key={option.value}
              bg={selectedRange === option.value ? "brand.500" : toolbarControlBg}
              color={selectedRange === option.value ? "white" : toolbarControlText}
              borderRadius="14px"
              boxShadow={selectedRange === option.value ? "0px 12px 24px rgba(66, 42, 251, 0.18)" : "none"}
              fontSize="sm"
              fontWeight="700"
              px="18px"
              flex={{ base: "1 1 calc(50% - 12px)", md: "0 0 auto" }}
              minW={{ base: "calc(50% - 12px)", md: "unset" }}
              _hover={{
                bg: selectedRange === option.value ? "brand.600" : toolbarControlHoverBg,
              }}
              onClick={() => setSelectedRange(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </HStack>

        <Stack spacing="12px" direction={{ base: "column", sm: "row" }} w={{ base: "100%", lg: "auto" }}>
          <Badge
            bg={toolbarControlBg}
            borderRadius="999px"
            color={toolbarControlText}
            px="12px"
            py="8px"
            display="flex"
            alignItems="center"
            justifyContent="center"
            minH="42px"
            lineHeight="1.2"
            textAlign="center"
            whiteSpace="normal"
          >
            Обновлено: {updatedAtLabel}
          </Badge>
          <Button
            bg={toolbarControlBg}
            color={toolbarControlText}
            borderRadius="14px"
            fontSize="sm"
            fontWeight="700"
            leftIcon={<Icon as={MdBarChart} />}
            isLoading={refreshing}
            loadingText="Обновляем"
            w={{ base: "100%", sm: "auto" }}
            onClick={handleRefresh}
            _hover={{ bg: toolbarControlHoverBg }}
          >
            Обновить
          </Button>
        </Stack>
      </Flex>

      {error ? (
        <Card mb="20px" p="18px">
          <Text color="red.500" fontWeight="700">
            {error}
          </Text>
        </Card>
      ) : null}

      {loading ? (
        <Stack spacing="20px">
          <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} gap="20px">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} h="98px" borderRadius="20px" />
            ))}
          </SimpleGrid>
          <SimpleGrid columns={{ base: 1, xl: 2 }} gap="20px">
            <Skeleton h="360px" borderRadius="20px" />
            <Skeleton h="360px" borderRadius="20px" />
            <Skeleton h="360px" borderRadius="20px" />
            <Skeleton h="360px" borderRadius="20px" />
          </SimpleGrid>
          <Skeleton h="420px" borderRadius="20px" />
        </Stack>
      ) : (
        <Stack spacing="20px">
          <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap="20px">
            {statCards.map((card) => (
              <MiniStatistics
                key={card.key}
                startContent={(
                  <IconBox
                    w="56px"
                    h="56px"
                    bg={boxBg}
                    icon={<Icon w="30px" h="30px" as={card.icon} color={brandColor} />}
                  />
                )}
                name={card.label}
                value={card.value}
              />
            ))}
          </SimpleGrid>

          <SimpleGrid columns={{ base: 1, xl: 2 }} gap="20px">
            <AnalyticsChartCard
              title="Новые игроки"
              subtitle="Динамика регистраций за выбранный период"
              value={formatNumber(summary.newPlayersCount)}
              chartType="line"
              points={analytics.series.newPlayers}
              primaryColor={brandColor}
            />
            <AnalyticsChartCard
              title="Все игроки"
              subtitle="Накопительный рост базы игроков"
              value={formatNumber(summary.totalPlayersCount)}
              chartType="line"
              points={analytics.series.totalPlayers}
              primaryColor={chartBlue}
            />
            <AnalyticsChartCard
              title="Старты сессий"
              subtitle="Сколько раз запускали игру"
              value={formatNumber(summary.sessionsStartedCount)}
              chartType="bar"
              points={analytics.series.sessionsStarted}
              primaryColor={chartOrange}
              secondaryColor={brandColor}
            />
            <AnalyticsChartCard
              title="Финиши"
              subtitle="Успешные и завершенные игровые сессии"
              value={formatNumber(summary.finishedSessionsCount)}
              chartType="bar"
              points={analytics.series.sessionsFinished}
              primaryColor={chartGreen}
              secondaryColor={brandColor}
            />
          </SimpleGrid>

          <SimpleGrid columns={{ base: 1, xl: 2 }} gap="20px">
            <AnalyticsMetricList title="Игроки и активность" rows={kpiRows} />
            <AnalyticsMetricList title="Игровые метрики" rows={gameRows} />
          </SimpleGrid>

          <Card p={{ base: "18px", md: "24px" }}>
            <Flex justify="space-between" align={{ base: "start", md: "center" }} direction={{ base: "column", md: "row" }} gap="12px" mb="18px">
              <Box>
                <Text color={textColor} fontSize="xl" fontWeight="700">
                  Последние игровые сессии
                </Text>
                <Text color={textColorSecondary} fontSize="sm" mt="4px">
                  Последние 20 запусков игры в выбранном диапазоне
                </Text>
              </Box>
            </Flex>
            <Box overflowX="auto">
              <Table variant="simple" minW="640px">
                <Thead>
                  <Tr>
                    <Th borderColor={borderColor}>Игрок</Th>
                    <Th borderColor={borderColor}>Статус</Th>
                    <Th borderColor={borderColor}>Найдено пар</Th>
                    <Th borderColor={borderColor}>Осталось времени</Th>
                    <Th borderColor={borderColor}>Старт</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {analytics.recentSessions.length > 0 ? analytics.recentSessions.map((session) => (
                    <Tr key={session.id}>
                      <Td borderColor="transparent">
                        <Text color={textColor} fontSize="sm" fontWeight="700">
                          {session.player?.displayName || session.player?.username || `#${session.playerId}`}
                        </Text>
                      </Td>
                      <Td borderColor="transparent">
                        <Badge
                          colorScheme={session.status === "finished" ? "green" : session.status === "paused" ? "orange" : "blue"}
                          borderRadius="999px"
                          px="10px"
                          py="6px"
                        >
                          {getSessionStatusLabel(session.status)}
                        </Badge>
                      </Td>
                      <Td borderColor="transparent">{formatNumber(session.foundSneakersCount)}</Td>
                      <Td borderColor="transparent">{formatDuration(session.remainingSeconds)}</Td>
                      <Td borderColor="transparent">{formatDateTime(session.startedAt)}</Td>
                    </Tr>
                  )) : (
                    <Tr>
                      <Td borderColor="transparent" colSpan={5} color={textColorSecondary}>
                        За выбранный период игровых сессий нет
                      </Td>
                    </Tr>
                  )}
                </Tbody>
              </Table>
            </Box>
          </Card>
        </Stack>
      )}
    </Box>
  );
}
